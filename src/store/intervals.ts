/** Closed time interval [start, end] in ms. */
export type Interval = [number, number];

export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter(([s, e]) => e >= s).sort((a, b) => a[0] - b[0]);
  const out: Interval[] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1] + 1) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/** Parts of `span` not covered by `covered`. */
export function gaps(span: Interval, covered: Interval[]): Interval[] {
  const out: Interval[] = [];
  let cursor = span[0];
  for (const [s, e] of mergeIntervals(covered)) {
    if (e < cursor) continue;
    if (s > span[1]) break;
    if (s > cursor) out.push([cursor, Math.min(s - 1, span[1])]);
    cursor = Math.max(cursor, e + 1);
  }
  if (cursor <= span[1]) out.push([cursor, span[1]]);
  return out;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

/**
 * Cut an interval at the boundaries of `range`, so each piece is either inside or outside it.
 * Outside pieces shorter than `minPiece` stay attached to the inside one (not worth a request).
 */
export function splitAround([s, e]: Interval, range: Interval, minPiece = 0): Interval[] {
  if (!overlaps([s, e], range)) return [[s, e]];
  let inside: Interval = [Math.max(s, range[0]), Math.min(e, range[1])];
  const out: Interval[] = [];
  if (e > range[1]) {
    if (e - range[1] < minPiece) inside = [inside[0], e];
    else out.push([range[1] + 1, e]);
  }
  let older: Interval | undefined;
  if (s < range[0]) {
    if (range[0] - s < minPiece) inside = [s, inside[1]];
    else older = [s, range[0] - 1];
  }
  out.push(inside);
  if (older) out.push(older);
  return out;
}

/** Pieces inside the priority range first, then the rest; newest first within each group. */
export function prioritize(intervals: Interval[], priority?: Interval, minPiece = 0): Interval[] {
  const newestFirst = (a: Interval, b: Interval) => b[1] - a[1];
  if (!priority) return [...intervals].sort(newestFirst);
  const pieces = intervals.flatMap((i) => splitAround(i, priority, minPiece));
  const hot = pieces.filter((c) => overlaps(c, priority)).sort(newestFirst);
  const cold = pieces.filter((c) => !overlaps(c, priority)).sort(newestFirst);
  return [...hot, ...cold];
}
