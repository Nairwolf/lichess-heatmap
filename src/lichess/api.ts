import { readNdjson } from './ndjson';
import type { LichessGame, LichessUser } from './types';

const BASE = 'https://lichess.org';

export class UserNotFoundError extends Error {
  constructor(username: string) {
    super(`User "${username}" not found on Lichess`);
    this.name = 'UserNotFoundError';
  }
}

export class RateLimitedError extends Error {
  constructor() {
    super('Lichess rate limit reached (HTTP 429)');
    this.name = 'RateLimitedError';
  }
}

export class InvalidTokenError extends Error {
  constructor() {
    super('The Lichess API token was rejected (HTTP 401)');
    this.name = 'InvalidTokenError';
  }
}

function headers(token: string | undefined, accept: string): HeadersInit {
  const h: Record<string, string> = { Accept: accept };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function checkResponse(res: Response, username?: string): Promise<void> {
  if (res.ok) return;
  if (res.status === 404 && username !== undefined) throw new UserNotFoundError(username);
  if (res.status === 404) throw new Error('Lichess refused to export the games (HTTP 404)');
  if (res.status === 429) throw new RateLimitedError();
  if (res.status === 401) throw new InvalidTokenError();
  throw new Error(`Lichess request failed: HTTP ${res.status}`);
}

export async function fetchUser(username: string, token?: string, signal?: AbortSignal): Promise<LichessUser> {
  const res = await fetch(`${BASE}/api/user/${encodeURIComponent(username)}`, {
    headers: headers(token, 'application/json'),
    signal,
  });
  await checkResponse(res, username);
  const user = (await res.json()) as LichessUser;
  if (user.disabled || user.closed) throw new UserNotFoundError(username);
  return user;
}

/** Returns the id of the account owning the token, or null if the token is invalid. */
export async function fetchTokenOwner(token: string, signal?: AbortSignal): Promise<string | null> {
  const res = await fetch(`${BASE}/api/account`, { headers: headers(token, 'application/json'), signal });
  if (!res.ok) return null;
  const account = (await res.json()) as { id: string };
  return account.id;
}

export interface StreamGamesOptions {
  /** Inclusive lower bound on game creation time (ms). */
  since?: number;
  /** Inclusive upper bound on game creation time (ms). */
  until?: number;
  /** Only games still being played (instead of finished ones). */
  ongoingOnly?: boolean;
  token?: string;
  signal?: AbortSignal;
}

/** Stream games of a user, newest first, without moves (metadata only). */
export async function* streamGames(username: string, opts: StreamGamesOptions = {}): AsyncGenerator<LichessGame> {
  const params = new URLSearchParams({ moves: 'false', tags: 'false', opening: 'true', sort: 'dateDesc' });
  if (opts.since !== undefined) params.set('since', String(opts.since));
  if (opts.until !== undefined) params.set('until', String(opts.until));
  if (opts.ongoingOnly) {
    params.set('ongoing', 'true');
    params.set('finished', 'false');
  }
  const res = await fetch(`${BASE}/api/games/user/${encodeURIComponent(username)}?${params}`, {
    headers: headers(opts.token, 'application/x-ndjson'),
    signal: opts.signal,
  });
  // The user was looked up beforehand: a 404 here means Lichess refused the export itself.
  await checkResponse(res);
  if (!res.body) return;
  yield* readNdjson<LichessGame>(res.body);
}

/** Fetch specific games by id (at most 300 per request). */
export async function* exportGamesByIds(ids: string[], token?: string, signal?: AbortSignal): AsyncGenerator<LichessGame> {
  for (let i = 0; i < ids.length; i += 300) {
    const res = await fetch(`${BASE}/api/games/export/_ids?moves=false&tags=false&opening=true`, {
      method: 'POST',
      headers: headers(token, 'application/x-ndjson'),
      body: ids.slice(i, i + 300).join(','),
      signal,
    });
    await checkResponse(res);
    if (res.body) yield* readNdjson<LichessGame>(res.body);
  }
}
