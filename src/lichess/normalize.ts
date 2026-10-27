import type { Color, LichessGame, Speed } from './types';

export type Result = 'win' | 'draw' | 'loss';

/** A game from the point of view of one user, in the compact form stored in IndexedDB. */
export interface GameRecord {
  id: string;
  /** Lowercase id of the user whose games these are. */
  userId: string;
  createdAt: number;
  lastMoveAt: number;
  speed: Speed;
  variant: string;
  perf: string;
  rated: boolean;
  color: Color;
  result: Result;
  status: string;
  source: string;
  opponentName: string;
  opponentRating?: number;
  opponentIsAI: boolean;
  myRating?: number;
  ratingDiff?: number;
  /** Seconds. */
  clockInitial?: number;
  /** Seconds. */
  clockIncrement?: number;
  daysPerTurn?: number;
  eco?: string;
  openingName?: string;
}

/** Games that never really started: not counted as played. */
const IGNORED_STATUSES = new Set(['created', 'started', 'aborted', 'noStart']);

export function normalizeGame(game: LichessGame, userId: string): GameRecord | null {
  if (IGNORED_STATUSES.has(game.status)) return null;
  const uid = userId.toLowerCase();
  let color: Color;
  if (game.players.white.user?.id === uid) color = 'white';
  else if (game.players.black.user?.id === uid) color = 'black';
  else return null;

  const me = game.players[color];
  const opp = game.players[color === 'white' ? 'black' : 'white'];
  const result: Result = !game.winner ? 'draw' : game.winner === color ? 'win' : 'loss';
  const opponentIsAI = opp.aiLevel !== undefined;

  return {
    id: game.id,
    userId: uid,
    createdAt: game.createdAt,
    lastMoveAt: game.lastMoveAt,
    speed: game.speed,
    variant: game.variant,
    perf: game.perf,
    rated: game.rated,
    color,
    result,
    status: game.status,
    source: game.source ?? 'unknown',
    opponentName: opp.user?.name ?? (opponentIsAI ? `Stockfish level ${opp.aiLevel}` : 'Anonymous'),
    opponentRating: opp.rating,
    opponentIsAI,
    myRating: me.rating,
    ratingDiff: me.ratingDiff,
    clockInitial: game.clock?.initial,
    clockIncrement: game.clock?.increment,
    daysPerTurn: game.daysPerTurn,
    eco: game.opening?.eco,
    openingName: game.opening?.name,
  };
}

/** Human readable time control, e.g. "3+2", "½+0", "3 days", "∞". */
export function clockLabel(g: Pick<GameRecord, 'clockInitial' | 'clockIncrement' | 'daysPerTurn' | 'speed'>): string {
  if (g.clockInitial !== undefined) {
    const minutes = g.clockInitial / 60;
    const fractions: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾', 1.5: '1½' };
    const m = fractions[minutes] ?? (Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1));
    return `${m}+${g.clockIncrement ?? 0}`;
  }
  if (g.daysPerTurn !== undefined) return g.daysPerTurn === 1 ? '1 day' : `${g.daysPerTurn} days`;
  return g.speed === 'correspondence' ? '∞' : '?';
}

/** Duration of a game in ms; correspondence games count as 0 (their span is days, not play time). */
export function playDuration(g: Pick<GameRecord, 'createdAt' | 'lastMoveAt' | 'speed'>): number {
  if (g.speed === 'correspondence') return 0;
  return Math.max(0, g.lastMoveAt - g.createdAt);
}
