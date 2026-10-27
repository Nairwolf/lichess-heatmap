import type { Metric } from '../analysis/aggregate';
import { formatDuration } from '../analysis/dates';

const integer = new Intl.NumberFormat();

export function formatInt(n: number): string {
  return integer.format(Math.round(n));
}

export function plural(n: number, word: string): string {
  return `${formatInt(n)} ${word}${Math.abs(n) === 1 ? '' : 's'}`;
}

export function formatSigned(n: number): string {
  if (n === 0) return '±0';
  return n > 0 ? `+${formatInt(n)}` : `−${formatInt(-n)}`;
}

export function formatMetric(value: number, metric: Metric): string {
  switch (metric) {
    case 'games':
      return plural(value, 'game');
    case 'time':
      return `${formatDuration(value)} played`;
    case 'wins':
      return plural(value, 'win');
    case 'rating':
      return `${formatSigned(value)} rating`;
  }
}
