export type ScaleMode = 'quantile' | 'linear';

/**
 * Maps a value to a color level: 0 = nothing, 1..4 = more and more,
 * and -1..-4 for negative values on the diverging (rating) scale.
 */
export interface ColorScale {
  level(value: number): number;
  /** Upper bound of each positive level 1..4 (for the legend). */
  bounds: number[];
  diverging: boolean;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Thresholds over the magnitudes of non-zero values. */
function boundsFor(magnitudes: number[], mode: ScaleMode): number[] {
  if (magnitudes.length === 0) return [1, 2, 3, 4];
  const sorted = [...magnitudes].sort((a, b) => a - b);
  const max = sorted[sorted.length - 1];
  if (mode === 'linear') return [max / 4, max / 2, (3 * max) / 4, max];
  return [quantile(sorted, 0.25), quantile(sorted, 0.5), quantile(sorted, 0.75), max];
}

export function makeScale(values: number[], mode: ScaleMode, diverging = false): ColorScale {
  const magnitudes = values.filter((v) => v !== 0).map(Math.abs);
  const bounds = boundsFor(magnitudes, mode);
  const positiveLevel = (v: number) => {
    for (let i = 0; i < 3; i++) if (v <= bounds[i]) return i + 1;
    return 4;
  };
  return {
    bounds,
    diverging,
    level(value) {
      if (value === 0) return 0;
      if (!diverging) return value > 0 ? positiveLevel(value) : 0;
      return Math.sign(value) * positiveLevel(Math.abs(value));
    },
  };
}

export type Palette = 'green' | 'blue' | 'orange';

export const PALETTES: { key: Palette; label: string }[] = [
  { key: 'green', label: 'Green' },
  { key: 'blue', label: 'Blue' },
  { key: 'orange', label: 'Orange' },
];

/** CSS class of a heatmap cell for a given level (colors are defined in styles.css). */
export function levelClass(level: number): string {
  if (level === 0) return 'lv0';
  return level > 0 ? `lv${level}` : `ln${-level}`;
}
