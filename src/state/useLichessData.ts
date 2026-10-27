import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchUser, UserNotFoundError } from '../lichess/api';
import type { GameRecord } from '../lichess/normalize';
import type { LichessUser } from '../lichess/types';
import { clearUser, loadGames } from '../store/db';
import type { Interval } from '../store/intervals';
import { GameSync, type SyncProgress } from '../store/sync';

const FLUSH_MS = 500;

export type LoadStatus = 'idle' | 'loading-user' | 'ready' | 'not-found' | 'error';

export interface LichessData {
  status: LoadStatus;
  user?: LichessUser;
  games: GameRecord[];
  progress?: SyncProgress;
  error?: string;
  /** Fetch games played since the last sync. */
  refresh: () => void;
  /** Forget the cached games of this user and download everything again. */
  clearCache: () => Promise<void>;
}

/** Loads the cached games of `username` and keeps them in sync with Lichess. */
export function useLichessData(username: string, token: string, priority: Interval | undefined): LichessData {
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [user, setUser] = useState<LichessUser>();
  const [games, setGames] = useState<GameRecord[]>([]);
  const [progress, setProgress] = useState<SyncProgress>();
  const [error, setError] = useState<string>();
  const [runId, setRunId] = useState(0);

  const syncRef = useRef<GameSync | undefined>(undefined);
  const forceRef = useRef(false);
  const priorityRef = useRef(priority);
  priorityRef.current = priority;

  useEffect(() => {
    syncRef.current?.setPriority(priority);
  }, [priority?.[0], priority?.[1]]);

  useEffect(() => {
    const name = username.trim();
    setUser(undefined);
    setGames([]);
    setProgress(undefined);
    setError(undefined);
    if (!name) {
      setStatus('idle');
      return;
    }

    const force = forceRef.current;
    forceRef.current = false;
    const controller = new AbortController();
    const byId = new Map<string, GameRecord>();
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      flushTimer = undefined;
      if (!controller.signal.aborted) setGames(Array.from(byId.values()));
    };
    const addGames = (list: GameRecord[]) => {
      for (const g of list) byId.set(g.id, g);
      flushTimer ??= setTimeout(flush, FLUSH_MS);
    };

    (async () => {
      setStatus('loading-user');
      try {
        const u = await fetchUser(name, token || undefined, controller.signal);
        if (controller.signal.aborted) return;
        setUser(u);
        const cached = await loadGames(u.id);
        if (controller.signal.aborted) return;
        for (const g of cached) byId.set(g.id, g);
        flush();
        setStatus('ready');

        const sync = new GameSync({
          user: u,
          token: token || undefined,
          cachedCount: cached.length,
          force,
          priority: priorityRef.current,
          onGames: addGames,
          onProgress: (p) => {
            if (controller.signal.aborted) return;
            setProgress(p);
            if (p.phase === 'done' || p.phase === 'error') {
              clearTimeout(flushTimer);
              flush();
            }
            if (p.error) setError(p.error);
          },
        });
        syncRef.current = sync;
        controller.signal.addEventListener('abort', () => sync.abort());
        await sync.run();
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof UserNotFoundError) setStatus('not-found');
        else {
          setStatus('error');
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => {
      controller.abort();
      clearTimeout(flushTimer);
      syncRef.current = undefined;
    };
  }, [username, token, runId]);

  const refresh = useCallback(() => {
    forceRef.current = true;
    setRunId((n) => n + 1);
  }, []);

  const clearCache = useCallback(async () => {
    if (!user) return;
    syncRef.current?.abort();
    await clearUser(user.id);
    setRunId((n) => n + 1);
  }, [user]);

  return { status, user, games, progress, error, refresh, clearCache };
}
