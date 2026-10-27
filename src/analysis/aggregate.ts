import { playDuration, type GameRecord } from '../lichess/normalize';
import { dayNumber, hourOf, weekdayOf, type DayRange, type TimeZoneMode, type WeekStart } from './dates';

export type Metric = 'games' | 'time' | 'wins' | 'rating';

export const METRICS: { key: Metric; label: string; unit: string }[] = [
  { key: 'games', label: 'Games played', unit: 'games' },
  { key: 'time', label: 'Time played', unit: 'played' },
  { key: 'wins', label: 'Wins', unit: 'wins' },
  { key: 'rating', label: 'Rating change', unit: 'rating' },
];

export interface DayStats {
  day: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  durationMs: number;
  ratingDiff: number;
  /** Games of the day, oldest first. */
  list: GameRecord[];
}

/** Bucket games by calendar day, keeping only days inside `range`. */
export function aggregateByDay(games: GameRecord[], tz: TimeZoneMode, range: DayRange): Map<number, DayStats> {
  const byDay = new Map<number, DayStats>();
  for (const g of games) {
    const day = dayNumber(g.createdAt, tz);
    if (day < range.start || day > range.end) continue;
    let s = byDay.get(day);
    if (!s) {
      s = { day, games: 0, wins: 0, draws: 0, losses: 0, durationMs: 0, ratingDiff: 0, list: [] };
      byDay.set(day, s);
    }
    s.games++;
    if (g.result === 'win') s.wins++;
    else if (g.result === 'loss') s.losses++;
    else s.draws++;
    s.durationMs += playDuration(g);
    s.ratingDiff += g.ratingDiff ?? 0;
    s.list.push(g);
  }
  for (const s of byDay.values()) s.list.sort((a, b) => a.createdAt - b.createdAt);
  return byDay;
}

export function metricValue(s: DayStats | undefined, metric: Metric): number {
  if (!s) return 0;
  switch (metric) {
    case 'games':
      return s.games;
    case 'time':
      return s.durationMs;
    case 'wins':
      return s.wins;
    case 'rating':
      return s.ratingDiff;
  }
}

/** Games per [row][hour]; row 0 is the first day of the week. */
export function weekHourMatrix(
  games: GameRecord[],
  tz: TimeZoneMode,
  weekStart: WeekStart,
  range: DayRange,
): number[][] {
  const m = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const g of games) {
    const day = dayNumber(g.createdAt, tz);
    if (day < range.start || day > range.end) continue;
    const row = (weekdayOf(day) - weekStart + 7) % 7;
    m[row][hourOf(g.createdAt, tz)]++;
  }
  return m;
}

export interface Streak {
  length: number;
  start?: number;
  end?: number;
}

export interface Summary {
  games: number;
  activeDays: number;
  rangeDays: number;
  wins: number;
  draws: number;
  losses: number;
  durationMs: number;
  ratingDiff: number;
  longestStreak: Streak;
  currentStreak: Streak;
  busiestDay?: DayStats;
}

/**
 * Streaks count consecutive days with at least one game. The current streak ends today
 * (or yesterday, if nothing has been played yet today); for past ranges it ends at the range end.
 */
export function summarize(byDay: Map<number, DayStats>, range: DayRange, today: number): Summary {
  const s: Summary = {
    games: 0,
    activeDays: byDay.size,
    rangeDays: Math.max(0, Math.min(range.end, today) - range.start + 1),
    wins: 0,
    draws: 0,
    losses: 0,
    durationMs: 0,
    ratingDiff: 0,
    longestStreak: { length: 0 },
    currentStreak: { length: 0 },
  };
  for (const d of byDay.values()) {
    s.games += d.games;
    s.wins += d.wins;
    s.draws += d.draws;
    s.losses += d.losses;
    s.durationMs += d.durationMs;
    s.ratingDiff += d.ratingDiff;
    const b = s.busiestDay;
    if (!b || d.games > b.games || (d.games === b.games && d.day > b.day)) s.busiestDay = d;
  }

  const days = [...byDay.keys()].sort((a, b) => a - b);
  let runStart = 0;
  for (let i = 0; i < days.length; i++) {
    if (i === 0 || days[i] !== days[i - 1] + 1) runStart = days[i];
    const length = days[i] - runStart + 1;
    if (length > s.longestStreak.length) s.longestStreak = { length, start: runStart, end: days[i] };
  }

  const last = Math.min(range.end, today);
  const end = byDay.has(last) ? last : last - 1;
  if (byDay.has(end)) {
    let start = end;
    while (byDay.has(start - 1)) start--;
    s.currentStreak = { length: end - start + 1, start, end };
  }
  return s;
}
