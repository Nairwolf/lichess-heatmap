import type { Metric } from '../analysis/aggregate';
import type { Palette, ScaleMode } from '../analysis/colorScale';
import type { RangePreset, TimeZoneMode, WeekStart } from '../analysis/dates';
import { DEFAULT_FILTERS, type Filters } from '../analysis/filters';

export interface ViewState {
  username: string;
  range: RangePreset;
  /** ISO dates, used by the custom range. */
  from: string;
  to: string;
  filters: Filters;
  metric: Metric;
  scale: ScaleMode;
  palette: Palette;
  weekStart: WeekStart;
  tz: TimeZoneMode;
}

export const DEFAULT_VIEW: ViewState = {
  username: '',
  range: 'last12',
  from: '',
  to: '',
  filters: DEFAULT_FILTERS,
  metric: 'games',
  scale: 'quantile',
  palette: 'green',
  weekStart: 1,
  tz: 'local',
};

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function list<T extends string>(value: string | null): T[] {
  return value ? (value.split(',').filter(Boolean) as T[]) : [];
}

export function decodeView(search: string): ViewState {
  const p = new URLSearchParams(search);
  const range = p.get('range') ?? '';
  return {
    username: p.get('u') ?? '',
    range: /^(last12|thisYear|all|custom|y\d{4})$/.test(range) ? (range as RangePreset) : DEFAULT_VIEW.range,
    from: p.get('from') ?? '',
    to: p.get('to') ?? '',
    filters: {
      speeds: list(p.get('speed')),
      variants: list(p.get('variant')),
      clocks: list(p.get('clock')),
      sources: list(p.get('source')),
      results: list(p.get('result')),
      rated: oneOf(p.get('rated'), ['all', 'rated', 'casual'], 'all'),
      color: oneOf(p.get('color'), ['all', 'white', 'black'], 'all'),
      opponent: oneOf(p.get('opp'), ['all', 'human', 'ai'], 'all'),
      opponentName: p.get('vs') ?? '',
      opening: p.get('opening') ?? '',
    },
    metric: oneOf(p.get('metric'), ['games', 'time', 'wins', 'rating'], DEFAULT_VIEW.metric),
    scale: oneOf(p.get('scale'), ['quantile', 'linear'], DEFAULT_VIEW.scale),
    palette: oneOf(p.get('palette'), ['green', 'blue', 'orange'], DEFAULT_VIEW.palette),
    weekStart: p.get('week') === 'sun' ? 0 : 1,
    tz: oneOf(p.get('tz'), ['local', 'utc'], DEFAULT_VIEW.tz),
  };
}

/** Only non-default values are written, to keep URLs short. */
export function encodeView(v: ViewState): string {
  const p = new URLSearchParams();
  const set = (key: string, value: string, fallback = '') => {
    if (value && value !== fallback) p.set(key, value);
  };
  set('u', v.username.trim());
  set('range', v.range, DEFAULT_VIEW.range);
  if (v.range === 'custom') {
    set('from', v.from);
    set('to', v.to);
  }
  const f = v.filters;
  set('speed', f.speeds.join(','));
  set('variant', f.variants.join(','));
  set('clock', f.clocks.join(','));
  set('source', f.sources.join(','));
  set('result', f.results.join(','));
  set('rated', f.rated, 'all');
  set('color', f.color, 'all');
  set('opp', f.opponent, 'all');
  set('vs', f.opponentName.trim());
  set('opening', f.opening.trim());
  set('metric', v.metric, DEFAULT_VIEW.metric);
  set('scale', v.scale, DEFAULT_VIEW.scale);
  set('palette', v.palette, DEFAULT_VIEW.palette);
  if (v.weekStart === 0) p.set('week', 'sun');
  set('tz', v.tz, DEFAULT_VIEW.tz);
  const s = p.toString();
  return s ? `?${s}` : '';
}
