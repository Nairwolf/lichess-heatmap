import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { winAsWhite } from '../lichess/fixtures';
import type { GameRecord } from '../lichess/normalize';
import type { LichessGame, LichessUser } from '../lichess/types';
import { loadGames, loadMeta } from './db';
import { GameSync, type SyncProgress } from './sync';

const DAY = 86_400_000;

interface FakeOptions {
  /** Number of export requests to refuse (like Lichess does without CORS headers). */
  refuse?: number;
}

/** A fake Lichess export API, recording requests and concurrency. */
function fakeLichess(games: LichessGame[], ongoing: LichessGame[], opts: FakeOptions = {}) {
  const state = { active: 0, maxActive: 0, requests: [] as URL[], refused: 0 };
  const ndjson = (list: LichessGame[]) => {
    state.active++;
    state.maxActive = Math.max(state.maxActive, state.active);
    let i = 0;
    let open = true;
    const close = () => {
      if (open) state.active--;
      open = false;
    };
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await new Promise((r) => setTimeout(r, 1)); // throttled, like Lichess
        if (i < list.length) controller.enqueue(new TextEncoder().encode(JSON.stringify(list[i++]) + '\n'));
        else {
          close();
          controller.close();
        }
      },
      cancel: close,
    });
    return new Response(body, { status: 200 });
  };
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/games/export/_ids') {
      const ids = String(init?.body).split(',');
      return ndjson([...games, ...ongoing].filter((g) => ids.includes(g.id)));
    }
    if (url.searchParams.get('ongoing') === 'true') return ndjson(ongoing);
    state.requests.push(url);
    if (state.refused < (opts.refuse ?? 0)) {
      state.refused++;
      throw new TypeError('Failed to fetch');
    }
    const since = Number(url.searchParams.get('since') ?? 0);
    const until = Number(url.searchParams.get('until') ?? Infinity);
    return ndjson(
      games.filter((g) => g.createdAt >= since && g.createdAt <= until).sort((a, b) => b.createdAt - a.createdAt),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return state;
}

function makeGame(id: string, createdAt: number, userId: string, status = 'resign'): LichessGame {
  return {
    ...winAsWhite,
    id,
    createdAt,
    lastMoveAt: createdAt + 600_000,
    status,
    players: { ...winAsWhite.players, white: { ...winAsWhite.players.white, user: { id: userId, name: userId } } },
  };
}

function makeUser(id: string, now: number): LichessUser {
  return { id, username: id, createdAt: now - 800 * DAY, count: { all: 400 } };
}

function startSync(
  user: LichessUser,
  extra: { cachedCount?: number; priority?: [number, number]; force?: boolean } = {},
) {
  const received: GameRecord[] = [];
  const progress: SyncProgress[] = [];
  const sync = new GameSync({
    user,
    cachedCount: extra.cachedCount ?? 0,
    priority: extra.priority ?? [Date.now() - 30 * DAY, Date.now()],
    retryDelayMs: 20,
    force: extra.force,
    onGames: (g) => received.push(...g),
    onProgress: (p) => progress.push(p),
  });
  return { sync, received, progress, done: sync.run() };
}

afterEach(() => vi.unstubAllGlobals());

describe('GameSync', () => {
  const now = Date.now();
  const user = makeUser('alice', now);
  const games = Array.from({ length: 400 }, (_, i) => makeGame(`g${i}`, now - 2 * DAY * i - 3_600_000, 'alice'));
  const ongoing = makeGame('live1', now - 40 * DAY, 'alice', 'started');

  it('downloads every game with at most 2 streams and few requests', async () => {
    const lichess = fakeLichess(games, [ongoing]);
    const { received, progress, done } = startSync(user);
    await done;

    const last = progress[progress.length - 1];
    expect(last.phase).toBe('done');
    expect(lichess.maxActive).toBe(2);
    expect(lichess.requests.length).toBeLessThanOrEqual(12);
    expect(new Set(received.map((g) => g.id)).size).toBe(400);
    expect(await loadGames('alice')).toHaveLength(400);

    // The priority range (last 30 days) was ready well before the end.
    const readyAt = progress.findIndex((p) => p.priorityDone);
    expect(readyAt).toBeGreaterThan(-1);
    expect(progress[readyAt].fetched).toBeLessThan(100);

    const meta = await loadMeta('alice');
    expect(meta.pendingIds).toEqual(['live1']);
    expect(meta.covered).toHaveLength(1);
    expect(meta.covered[0][0]).toBe(user.createdAt);
    expect(meta.covered[0][1]).toBeLessThan(now);
  });

  it('only fetches recent games and finished pending games on the next sync', async () => {
    const finished = { ...ongoing, status: 'mate' };
    const lichess = fakeLichess([...games, finished], []);
    // Right after a sync, a reload does not ask Lichess again...
    await startSync(user, { cachedCount: 400 }).done;
    expect(lichess.requests).toHaveLength(0);

    // ...unless forced (Refresh button).
    const { received, done } = startSync(user, { cachedCount: 400, force: true });
    await done;

    expect(lichess.requests).toHaveLength(1);
    expect(Number(lichess.requests[0].searchParams.get('since'))).toBeGreaterThan(now - DAY);
    expect(received.map((g) => g.id)).toContain('live1');
    expect(await loadGames('alice')).toHaveLength(401);
    expect((await loadMeta('alice')).pendingIds).toEqual([]);
  });

  it('waits and resumes when Lichess refuses requests', async () => {
    const bobGames = games.map((g, i) => makeGame(`b${i}`, g.createdAt, 'bob'));
    const lichess = fakeLichess(bobGames, [], { refuse: 2 });
    const { progress, done } = startSync(makeUser('bob', now));
    await done;

    expect(lichess.refused).toBe(2);
    expect(progress.some((p) => p.phase === 'paused')).toBe(true);
    expect(progress[progress.length - 1].phase).toBe('done');
    expect(await loadGames('bob')).toHaveLength(400);
  });

  it('fetches a newly selected range next', async () => {
    const carolGames = games.map((g, i) => makeGame(`c${i}`, g.createdAt, 'carol'));
    const lichess = fakeLichess(carolGames, []);
    const { sync, progress, done } = startSync(makeUser('carol', now));
    await vi.waitFor(() => expect(progress.some((p) => p.fetched >= 20)).toBe(true));

    const old: [number, number] = [now - 700 * DAY, now - 600 * DAY];
    sync.setPriority(old);
    const fetchedAtSwitch = progress[progress.length - 1].fetched;
    await vi.waitFor(() => expect(progress[progress.length - 1].priorityDone).toBe(true));
    // The 50 games of that old range came long before the ~400 of the whole history.
    expect(progress[progress.length - 1].fetched - fetchedAtSwitch).toBeLessThan(200);
    await done;
    expect(lichess.maxActive).toBeLessThanOrEqual(2);
    expect(await loadGames('carol')).toHaveLength(400);
  });
});
