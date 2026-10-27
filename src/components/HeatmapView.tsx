import { useLayoutEffect, useRef } from 'react';
import type { Metric } from '../analysis/aggregate';
import { levelClass, type ColorScale } from '../analysis/colorScale';
import { partsOf, splitByYear } from '../analysis/dates';
import { CalendarHeatmap, type CalendarProps } from './CalendarHeatmap';
import { formatMetric, plural } from './format';

/** One calendar for ranges up to a year; one per calendar year (newest first) for longer ranges. */
export function HeatmapView(props: Omit<CalendarProps, 'label'>) {
  const { range, byDay } = props;
  const singleGrid = range.end - range.start <= 371;
  const pieces = singleGrid ? [range] : splitByYear(range);

  // On narrow screens the grids scroll horizontally: start on the most recent weeks.
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    rootRef.current?.querySelectorAll('.scroll-x').forEach((el) => (el.scrollLeft = el.scrollWidth));
  }, [range.start, range.end]);

  return (
    <div ref={rootRef} className={props.scale.diverging ? 'heatmaps diverging' : 'heatmaps'}>
      {pieces.map((piece) => {
        let games = 0;
        for (let d = piece.start; d <= piece.end; d++) games += byDay.get(d)?.games ?? 0;
        const year = partsOf(piece.start).year;
        return (
          <section key={piece.start} className="heatmap-year">
            {!singleGrid && (
              <h3>
                {year} <span className="muted">· {plural(games, 'game')}</span>
              </h3>
            )}
            <div className="scroll-x">
              <CalendarHeatmap
                {...props}
                range={piece}
                minWeeks={singleGrid ? undefined : 54}
                label={singleGrid ? 'Activity calendar' : `Activity in ${year}`}
              />
            </div>
          </section>
        );
      })}
      <Legend scale={props.scale} metric={props.metric} />
    </div>
  );
}

function Swatch({ level, title }: { level: number; title: string }) {
  return (
    <svg width={11} height={11} aria-hidden="true">
      <title>{title}</title>
      <rect className={`cell ${levelClass(level)}`} width={11} height={11} rx={2} />
    </svg>
  );
}

export function Legend({ scale, metric }: { scale: ColorScale; metric: Metric }) {
  const b = scale.bounds;
  const describe = (level: number) => {
    if (level === 0) return metric === 'rating' ? 'No change' : 'None';
    return `Up to ${formatMetric(b[Math.abs(level) - 1] * Math.sign(level), metric)}`;
  };
  const levels = scale.diverging ? [-4, -3, -2, -1, 0, 1, 2, 3, 4] : [0, 1, 2, 3, 4];
  const [low, high] = scale.diverging ? ['Lost', 'Gained'] : ['Less', 'More'];
  return (
    <div className="legend">
      <span className="muted">{low}</span>
      {levels.map((l) => (
        <Swatch key={l} level={l} title={describe(l)} />
      ))}
      <span className="muted">{high}</span>
    </div>
  );
}
