import { describe, expect, it } from 'vitest';
import { normalizeGame, type GameRecord } from '../lichess/normalize';
import { lossAsBlack, vsStockfish, winAsWhite } from '../lichess/fixtures';
import { aggregateByDay, summarize, weekHourMatrix } from './aggregate';
import { makeScale } from './colorScale';
import { dayFromParts, dayNumber, isoOf, resolveRange, splitByYear, startOfWeek, weekdayOf } from './dates';
import { applyFilters, DEFAULT_FILTERS, facetCounts } from './filters';

const games = [winAsWhite, lossAsBlack, vsStockfish].map((g) => normalizeGame(g, 'nairwolf')!);

function gameOn(iso: string, hourUtc = 12, extra: Partial<GameRecord> = {}): GameRecord {
  const ts = Date.parse(`${iso}T${String(hourUtc).padStart(2, '0')}:00:00Z`);
  return { ...games[0], id: `${iso}-${hourUtc}`, createdAt: ts, lastMoveAt: ts + 600_000, ...extra };
}

describe('dates', () => {
  it('computes day numbers and weekdays', () => {
    const d = dayFromParts(2026, 9, 13);
    expect(isoOf(d)).toBe('2026-10-13');
    expect(weekdayOf(d)).toBe(2); // Tuesday
    expect(isoOf(startOfWeek(d, 1))).toBe('2026-10-12');
    expect(isoOf(startOfWeek(d, 0))).toBe('2026-10-11');
  });

  it('buckets by UTC or local day', () => {
    const ts = Date.parse('2026-10-13T23:30:00Z');
    expect(isoOf(dayNumber(ts, 'utc'))).toBe('2026-10-13');
    const local = new Date(ts);
    expect(isoOf(dayNumber(ts, 'local'))).toBe(
      `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`,
    );
  });

  it('resolves range presets', () => {
    const today = dayFromParts(2026, 9, 13);
    const accountStart = dayFromParts(2015, 11, 14);
    expect(resolveRange('last12', { today, accountStart })).toEqual({ start: today - 364, end: today });
    const y = resolveRange('y2024', { today, accountStart });
    expect([isoOf(y.start), isoOf(y.end)]).toEqual(['2024-01-01', '2024-12-31']);
    const c = resolveRange('custom', { today, accountStart, from: '2026-03-01', to: '2026-01-01' });
    expect([isoOf(c.start), isoOf(c.end)]).toEqual(['2026-01-01', '2026-03-01']);
    expect(resolveRange('custom', { today, accountStart, from: '', to: '' })).toEqual({ start: today - 364, end: today });
  });

  it('splits ranges by year, newest first', () => {
    const parts = splitByYear({ start: dayFromParts(2024, 5, 1), end: dayFromParts(2026, 1, 1) });
    expect(parts.map((p) => [isoOf(p.start), isoOf(p.end)])).toEqual([
      ['2026-01-01', '2026-02-01'],
      ['2025-01-01', '2025-12-31'],
      ['2024-06-01', '2024-12-31'],
    ]);
  });
});

describe('filters', () => {
  it('filters by speed, color, opponent and opening', () => {
    expect(applyFilters(games, { ...DEFAULT_FILTERS, speeds: ['rapid'] })).toHaveLength(2);
    expect(applyFilters(games, { ...DEFAULT_FILTERS, color: 'black' })).toHaveLength(2);
    expect(applyFilters(games, { ...DEFAULT_FILTERS, opponent: 'ai' }).map((g) => g.id)).toEqual(['ai000001']);
    expect(applyFilters(games, { ...DEFAULT_FILTERS, opening: 'B1' }).map((g) => g.id)).toEqual(['ny0Q7VmQ']);
    expect(applyFilters(games, { ...DEFAULT_FILTERS, opening: 'scotch' }).map((g) => g.id)).toEqual(['UEepaA26']);
    expect(applyFilters(games, { ...DEFAULT_FILTERS, clocks: ['3+2'] }).map((g) => g.id)).toEqual(['ai000001']);
    expect(applyFilters(games, { ...DEFAULT_FILTERS, rated: 'casual', results: ['win'] })).toHaveLength(1);
    expect(applyFilters(games, { ...DEFAULT_FILTERS, sources: ['lobby'] })).toHaveLength(2);
  });

  it('counts facets', () => {
    const c = facetCounts(games);
    expect(c.speeds.get('rapid')).toBe(2);
    expect(c.clocks.get('10+5')).toBe(2);
    expect(c.sources.get('ai')).toBe(1);
  });
});

describe('aggregate', () => {
  const sample = [
    gameOn('2026-10-01'),
    gameOn('2026-10-01', 14, { result: 'loss', ratingDiff: -5 }),
    gameOn('2026-10-02'),
    gameOn('2026-10-03'),
    gameOn('2026-10-10'),
    gameOn('2026-10-11'),
    gameOn('2026-10-12'),
    gameOn('2025-01-01'),
  ];
  const range = { start: dayFromParts(2026, 0, 1), end: dayFromParts(2026, 11, 31) };

  it('buckets per day within the range', () => {
    const byDay = aggregateByDay(sample, 'utc', range);
    expect(byDay.size).toBe(6);
    const oct1 = byDay.get(dayFromParts(2026, 9, 1))!;
    expect(oct1).toMatchObject({ games: 2, wins: 1, losses: 1, ratingDiff: 13 - 5, durationMs: 1_200_000 });
  });

  it('computes streaks and totals', () => {
    const byDay = aggregateByDay(sample, 'utc', range);
    const s = summarize(byDay, range, dayFromParts(2026, 9, 13));
    expect(s.games).toBe(7);
    expect(s.activeDays).toBe(6);
    expect(s.longestStreak).toMatchObject({ length: 3, start: dayFromParts(2026, 9, 1) });
    // Nothing played on the 13th yet: the streak ending yesterday still counts.
    expect(s.currentStreak).toMatchObject({ length: 3, end: dayFromParts(2026, 9, 12) });
    expect(s.busiestDay?.day).toBe(dayFromParts(2026, 9, 1));
    expect(summarize(byDay, range, dayFromParts(2026, 9, 15)).currentStreak.length).toBe(0);
  });

  it('builds the weekday × hour matrix', () => {
    const m = weekHourMatrix(sample, 'utc', 1, range);
    // 2026-10-01 is a Thursday: row 3 when weeks start on Monday.
    expect(m[3][12]).toBe(1);
    expect(m[3][14]).toBe(1);
    expect(m.flat().reduce((a, b) => a + b)).toBe(7);
  });
});

describe('colorScale', () => {
  it('uses quartiles of non-zero values', () => {
    const scale = makeScale([0, 1, 2, 3, 4, 5, 6, 7, 8, 100], 'quantile');
    expect(scale.level(0)).toBe(0);
    expect(scale.level(1)).toBe(1);
    expect(scale.level(100)).toBe(4);
    expect(scale.level(5)).toBe(2); // median of the 9 non-zero values
    expect(scale.level(6)).toBe(3);
  });

  it('linear scale splits the max in four', () => {
    const scale = makeScale([0, 10, 100], 'linear');
    expect([scale.level(10), scale.level(26), scale.level(60), scale.level(100)]).toEqual([1, 2, 3, 4]);
  });

  it('diverging scale keeps the sign', () => {
    const scale = makeScale([-40, -10, 10, 40], 'linear', true);
    expect(scale.level(-40)).toBe(-4);
    expect(scale.level(40)).toBe(4);
    expect(scale.level(0)).toBe(0);
  });
});
