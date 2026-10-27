// Raw shapes returned by the Lichess API (only the fields this app reads).

export type Color = 'white' | 'black';

export type Speed = 'ultraBullet' | 'bullet' | 'blitz' | 'rapid' | 'classical' | 'correspondence';

export interface LichessPlayer {
  user?: { id: string; name: string };
  rating?: number;
  ratingDiff?: number;
  provisional?: boolean;
  aiLevel?: number;
}

export interface LichessGame {
  id: string;
  rated: boolean;
  variant: string;
  speed: Speed;
  perf: string;
  createdAt: number;
  lastMoveAt: number;
  status: string;
  source?: string;
  players: { white: LichessPlayer; black: LichessPlayer };
  winner?: Color;
  opening?: { eco: string; name: string; ply: number };
  clock?: { initial: number; increment: number; totalTime: number };
  daysPerTurn?: number;
}

export interface LichessUser {
  id: string;
  username: string;
  createdAt: number;
  disabled?: boolean;
  closed?: boolean;
  tosViolation?: boolean;
  count?: { all: number; import?: number };
}
