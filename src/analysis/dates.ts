/**
 * Calendar days are handled as "day numbers": days since 1970-01-01 for the calendar date
 * in the chosen time zone. Day arithmetic on integers is immune to DST shifts.
 */

export type TimeZoneMode = 'local' | 'utc';
/** 0 = Sunday, 1 = Monday. */
export type WeekStart = 0 | 1;

export const DAY_MS = 86_400_000;

export function dayNumber(ts: number, tz: TimeZoneMode): number {
  if (tz === 'utc') return Math.floor(ts / DAY_MS);
  const d = new Date(ts);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

export function hourOf(ts: number, tz: TimeZoneMode): number {
  const d = new Date(ts);
  return tz === 'utc' ? d.getUTCHours() : d.getHours();
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(day: number): number {
  return (((day + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
}

export function startOfWeek(day: number, weekStart: WeekStart): number {
  return day - ((weekdayOf(day) - weekStart + 7) % 7);
}

export function dayFromParts(year: number, month: number, date: number): number {
  return Math.round(Date.UTC(year, month, date) / DAY_MS);
}

export function partsOf(day: number): { year: number; month: number; date: number } {
  const d = new Date(day * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), date: d.getUTCDate() };
}

/** "2026-10-13" */
export function isoOf(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function parseIso(iso: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? dayFromParts(+m[1], +m[2] - 1, +m[3]) : undefined;
}

/** First millisecond of a calendar day in the chosen time zone. */
export function dayStartMs(day: number, tz: TimeZoneMode): number {
  if (tz === 'utc') return day * DAY_MS;
  const { year, month, date } = partsOf(day);
  return new Date(year, month, date).getTime();
}

const longFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const shortFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
const shortYearFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' });
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' });

/** "Tue, 13 Oct 2026" in the browser's locale. */
export function formatDay(day: number): string {
  return longFormat.format(new Date(day * DAY_MS));
}

/** "16 Mar → 3 Apr 2026", with the year shown once when both days share it. */
export function formatDaySpan(start: number, end: number): string {
  if (start === end) return shortYearFormat.format(new Date(start * DAY_MS));
  const sameYear = partsOf(start).year === partsOf(end).year;
  const from = (sameYear ? shortFormat : shortYearFormat).format(new Date(start * DAY_MS));
  return `${from} → ${shortYearFormat.format(new Date(end * DAY_MS))}`;
}

export function monthName(month: number): string {
  return monthFormat.format(new Date(Date.UTC(2000, month, 1)));
}

/** Short weekday name for 0 = Sunday … 6 = Saturday. */
export function weekdayName(weekday: number): string {
  return weekdayFormat.format(new Date(Date.UTC(2023, 0, 1 + weekday))); // 2023-01-01 was a Sunday
}

export function formatTime(ts: number, tz: TimeZoneMode): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz === 'utc' ? 'UTC' : undefined,
  });
}

export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours}h${String(rest).padStart(2, '0')}` : `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export type RangePreset = 'last12' | 'thisYear' | 'all' | 'custom' | `y${number}`;

export interface DayRange {
  start: number;
  end: number;
}

export function resolveRange(
  preset: RangePreset,
  opts: { today: number; accountStart: number; from?: string; to?: string },
): DayRange {
  const { today } = opts;
  const { year } = partsOf(today);
  switch (preset) {
    case 'last12':
      return { start: today - 364, end: today };
    case 'thisYear':
      return { start: dayFromParts(year, 0, 1), end: dayFromParts(year, 11, 31) };
    case 'all':
      return { start: Math.min(opts.accountStart, today), end: today };
    case 'custom': {
      const start = (opts.from ? parseIso(opts.from) : undefined) ?? today - 364;
      const end = (opts.to ? parseIso(opts.to) : undefined) ?? today;
      return start <= end ? { start, end } : { start: end, end: start };
    }
    default: {
      const y = Number(preset.slice(1));
      return { start: dayFromParts(y, 0, 1), end: dayFromParts(y, 11, 31) };
    }
  }
}

/** Split a range into calendar-year pieces, newest first. */
export function splitByYear(range: DayRange): DayRange[] {
  const out: DayRange[] = [];
  let end = range.end;
  while (end >= range.start) {
    const yearStart = dayFromParts(partsOf(end).year, 0, 1);
    out.push({ start: Math.max(yearStart, range.start), end });
    end = yearStart - 1;
  }
  return out;
}
