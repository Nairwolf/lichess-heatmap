import { exportGamesByIds, RateLimitedError, streamGames } from '../lichess/api';
import { normalizeGame, type GameRecord } from '../lichess/normalize';
import type { LichessGame, LichessUser } from '../lichess/types';
import { loadMeta, saveGames, saveMeta, type SyncMeta } from './db';
import { gaps, mergeIntervals, overlaps, prioritize, type Interval } from './intervals';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Lichess allows 2 concurrent game exports per IP (and per user when authenticated). */
const WORKERS = 2;
/** Spans shorter than this are not worth an extra request. */
const MIN_STEAL_MS = 3 * DAY;
/**
 * The newest 12h are never marked as covered: a live game still running during the sync
 * is not exported yet, so that span is fetched again next time.
 */
const LIVE_MARGIN_MS = 12 * HOUR;
/** Lichess asks clients to wait a full minute after being rate limited. */
const RATE_LIMIT_PAUSE_MS = 60_000;
const MAX_CONSECUTIVE_FAILURES = 5;
/** Page reloads within this delay reuse the cache without asking Lichess again. */
const RECENT_SYNC_MS = 5 * 60_000;
const BATCH_SIZE = 100;

export type SyncPhase = 'starting' | 'syncing' | 'paused' | 'done' | 'error' | 'aborted';

export interface SyncProgress {
  phase: SyncPhase;
  /** Games received during this sync. */
  fetched: number;
  /** Rough estimate of games still to download. */
  remaining: number;
  /** Games per second during this sync. */
  rate: number;
  pausedUntil?: number;
  /** True once every game of the priority range has been downloaded. */
  priorityDone: boolean;
  error?: string;
}

export interface SyncOptions {
  user: LichessUser;
  token?: string;
  /** Games already in the local cache, used for the remaining-games estimate. */
  cachedCount: number;
  priority?: Interval;
  /** Sync even if the last one finished moments ago. */
  force?: boolean;
  /** Wait after a refused request (tests shorten it). */
  retryDelayMs?: number;
  onGames: (games: GameRecord[]) => void;
  onProgress: (progress: SyncProgress) => void;
}

/** One running export request: games arrive newest first, from `remainingEnd` down to `stopAt`. */
interface ActiveStream {
  until: number;
  /** Lower bound; raised when another worker takes over the older part. */
  stopAt: number;
  /** Everything newer than this has been received. */
  remainingEnd: number;
  /** Set to stop this stream early and put its remaining span back in the queue. */
  interrupted: boolean;
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/**
 * Rate limiting shows up as a 429, or as a network error when the refusal comes
 * without CORS headers (the browser then hides the status and fetch throws a TypeError).
 */
function isTransient(err: unknown): boolean {
  return err instanceof RateLimitedError || err instanceof TypeError;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

/**
 * Downloads the games of one user that are missing from the local cache.
 *
 * Lichess throttles each export stream (games per second) and refuses clients that send
 * too many requests, so the sync uses few, long requests: each of the 2 workers streams a
 * long span, and a worker that runs out of work takes over the older half of the other
 * worker's remaining span. Spans inside the priority range (the period on screen) go first.
 */
export class GameSync {
  private readonly controller = new AbortController();
  private readonly userId: string;
  private meta!: SyncMeta;
  private queue: Interval[] = [];
  private readonly active = new Set<ActiveStream>();
  private priority?: Interval;
  private pausedUntil = 0;
  private failures = 0;
  private fetched = 0;
  private startedAt = 0;
  private phase: SyncPhase = 'starting';
  private error?: string;
  private readonly expectedTotal: number;

  constructor(private readonly opts: SyncOptions) {
    this.userId = opts.user.id;
    this.priority = opts.priority;
    const count = opts.user.count;
    this.expectedTotal = count ? Math.max(0, count.all - (count.import ?? 0)) : 0;
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  abort(): void {
    this.controller.abort();
  }

  /** Fetch the uncovered part of `range` next, interrupting a stream if needed. */
  setPriority(range: Interval | undefined): void {
    this.priority = range;
    this.queue = prioritize(this.queue, range, MIN_STEAL_MS);
    if (range && this.phase === 'syncing') {
      const streams = [...this.active];
      const busyInRange = streams.some((s) => s.remainingEnd >= range[0] && s.remainingEnd <= range[1]);
      const pending =
        this.queue.some((q) => overlaps(q, range)) || streams.some((s) => overlaps([s.stopAt, s.remainingEnd], range));
      if (pending && !busyInRange) {
        const victim =
          streams.find((s) => !s.interrupted && overlaps([s.stopAt, s.remainingEnd], range)) ??
          streams.find((s) => !s.interrupted);
        if (victim) victim.interrupted = true;
      }
    }
    this.emit();
  }

  async run(): Promise<void> {
    this.startedAt = Date.now();
    try {
      this.meta = await loadMeta(this.userId);
      const syncStart = Date.now();
      if (!this.opts.force && this.meta.lastSyncAt && syncStart - this.meta.lastSyncAt < RECENT_SYNC_MS) {
        this.phase = 'done';
        this.emit();
        return;
      }
      await this.tolerateFailure(() => this.refreshPending());
      await this.tolerateFailure(() => this.listOngoing());

      this.queue = prioritize(gaps([this.opts.user.createdAt, syncStart], this.meta.covered), this.priority, MIN_STEAL_MS);
      this.phase = 'syncing';
      this.emit();

      await Promise.all(Array.from({ length: WORKERS }, () => this.worker()));

      this.meta.lastSyncAt = syncStart;
      await saveMeta(this.meta);
      this.phase = 'done';
    } catch (err) {
      if (isAbort(err)) {
        this.phase = 'aborted';
      } else {
        this.phase = 'error';
        this.error = err instanceof Error ? err.message : String(err);
        this.controller.abort();
      }
    }
    this.emit();
  }

  private async worker(): Promise<void> {
    while (true) {
      const wait = this.pausedUntil - Date.now();
      if (wait > 0) {
        this.phase = 'paused';
        this.emit();
        await sleep(wait, this.signal);
        this.phase = 'syncing';
        continue;
      }
      const task = this.nextTask();
      if (!task) {
        // Another stream may still be interrupted or refused and put work back in the queue.
        if (this.active.size === 0) return;
        await sleep(500, this.signal);
        continue;
      }
      await this.runStream(task);
      this.emit();
    }
  }

  /**
   * Preference order: queued span in the priority range, older half of a stream in the
   * priority range, any queued span, older half of any stream.
   */
  private nextTask(): Interval | undefined {
    const priority = this.priority;
    const inPriority = (i: Interval) => !!priority && overlaps(i, priority);
    const hotIndex = this.queue.findIndex(inPriority);
    if (hotIndex >= 0) return this.queue.splice(hotIndex, 1)[0];
    const stolen = this.steal(inPriority);
    if (stolen) return stolen;
    if (this.queue.length) return this.queue.shift();
    return this.steal(() => true);
  }

  private steal(eligible: (remaining: Interval) => boolean): Interval | undefined {
    let victim: ActiveStream | undefined;
    for (const s of this.active) {
      const remaining: Interval = [s.stopAt, s.remainingEnd];
      if (s.interrupted || !eligible(remaining) || s.remainingEnd - s.stopAt < MIN_STEAL_MS) continue;
      if (!victim || s.remainingEnd - s.stopAt > victim.remainingEnd - victim.stopAt) victim = s;
    }
    if (!victim) return undefined;
    const mid = victim.stopAt + Math.floor((victim.remainingEnd - victim.stopAt) / 2);
    const task: Interval = [victim.stopAt, mid - 1];
    victim.stopAt = mid;
    return task;
  }

  private async runStream([since, until]: Interval): Promise<void> {
    const stream: ActiveStream = { until, stopAt: since, remainingEnd: until, interrupted: false };
    this.active.add(stream);
    const coverEnd = Math.min(until, Date.now() - LIVE_MARGIN_MS);
    let batch: GameRecord[] = [];
    const flush = async (coveredFrom: number) => {
      await this.store(batch);
      batch = [];
      if (coveredFrom <= coverEnd) this.meta.covered = mergeIntervals([...this.meta.covered, [coveredFrom, coverEnd]]);
      await saveMeta(this.meta);
      this.emit();
    };

    let finished = false;
    try {
      const games = streamGames(this.userId, { since, until, token: this.opts.token, signal: this.signal });
      for await (const game of games) {
        // Past stopAt, the games belong to the worker that took over the older part.
        if (game.createdAt < stream.stopAt || stream.interrupted) break;
        this.fetched++;
        const record = normalizeGame(game, this.userId);
        if (record) batch.push(record);
        stream.remainingEnd = game.createdAt - 1;
        if (batch.length >= BATCH_SIZE) await flush(stream.remainingEnd + 1);
      }
      finished = !stream.interrupted;
      this.failures = 0;
    } catch (err) {
      if (!isTransient(err) || ++this.failures > MAX_CONSECUTIVE_FAILURES) throw err;
      this.pausedUntil = Date.now() + (this.opts.retryDelayMs ?? RATE_LIMIT_PAUSE_MS);
    } finally {
      this.active.delete(stream);
    }

    if (finished) {
      await flush(stream.stopAt);
    } else {
      // Interrupted or refused: keep what arrived, queue the rest.
      await flush(stream.remainingEnd + 1);
      if (stream.remainingEnd >= stream.stopAt) {
        this.queue = prioritize([...this.queue, [stream.stopAt, stream.remainingEnd]], this.priority, MIN_STEAL_MS);
      }
    }
  }

  /** Pending/ongoing checks are a bonus: a refused request must not stop the whole sync. */
  private async tolerateFailure(task: () => Promise<void>): Promise<void> {
    try {
      await task();
    } catch (err) {
      if (!isTransient(err)) throw err;
    }
  }

  /** Games that were ongoing at the last sync: store the ones that have finished since. */
  private async refreshPending(): Promise<void> {
    if (this.meta.pendingIds.length === 0) return;
    const games = await this.collect(exportGamesByIds(this.meta.pendingIds, this.opts.token, this.signal));
    await this.store(games.flatMap((g) => normalizeGame(g, this.userId) ?? []));
  }

  /**
   * Remember the games being played right now. They can last months (correspondence),
   * so they are fetched by id on later syncs instead of re-downloading their time span.
   */
  private async listOngoing(): Promise<void> {
    const games = await this.collect(
      streamGames(this.userId, { ongoingOnly: true, token: this.opts.token, signal: this.signal }),
    );
    this.meta.pendingIds = games.filter((g) => !normalizeGame(g, this.userId)).map((g) => g.id);
    await saveMeta(this.meta);
  }

  private async collect(source: AsyncGenerator<LichessGame>): Promise<LichessGame[]> {
    const out: LichessGame[] = [];
    for await (const g of source) out.push(g);
    return out;
  }

  private async store(games: GameRecord[]): Promise<void> {
    if (games.length === 0) return;
    await saveGames(games);
    this.opts.onGames(games);
  }

  private emit(): void {
    const elapsed = (Date.now() - this.startedAt) / 1000;
    const priority = this.priority;
    const priorityPending =
      !!priority &&
      (this.queue.some((q) => overlaps(q, priority)) ||
        [...this.active].some((s) => overlaps([s.stopAt, s.remainingEnd], priority)));
    this.opts.onProgress({
      phase: this.phase,
      fetched: this.fetched,
      remaining:
        this.phase === 'done' ? 0 : Math.max(0, this.expectedTotal - this.opts.cachedCount - this.fetched),
      rate: elapsed > 0 ? this.fetched / elapsed : 0,
      pausedUntil: this.phase === 'paused' ? this.pausedUntil : undefined,
      priorityDone: this.phase === 'done' || (this.phase !== 'starting' && !!priority && !priorityPending),
      error: this.error,
    });
  }
}
