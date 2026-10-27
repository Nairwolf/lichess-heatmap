import type { MouseEvent } from 'react';
import { levelClass, makeScale, type ScaleMode } from '../analysis/colorScale';
import type { WeekStart } from '../analysis/dates';
import { weekdayRows } from './CalendarHeatmap';
import { plural } from './format';
import { anchorOf, type TooltipState } from './Tooltip';

const CELL = 16;
const STEP = 19;
const LEFT = 34;
const TOP = 16;

interface Props {
  matrix: number[][];
  weekStart: WeekStart;
  scaleMode: ScaleMode;
  onHover: (t: TooltipState | null) => void;
}

/** Games started per weekday and hour of the day. */
export function WeekHourGrid({ matrix, weekStart, scaleMode, onHover }: Props) {
  const scale = makeScale(matrix.flat(), scaleMode);
  const rows = weekdayRows(weekStart);
  const width = LEFT + 24 * STEP;
  const height = TOP + 7 * STEP;

  const onMouseOver = (e: MouseEvent) => {
    const el = (e.target as Element).closest('rect[data-row]');
    if (!el) return;
    const row = Number(el.getAttribute('data-row'));
    const hour = Number(el.getAttribute('data-hour'));
    const pad = (h: number) => String(h).padStart(2, '0');
    onHover({
      ...anchorOf(el),
      content: (
        <>
          <strong>{plural(matrix[row][hour], 'game')}</strong>
          <div className="muted">
            {rows[row]} {pad(hour)}:00–{pad((hour + 1) % 24)}:00
          </div>
        </>
      ),
    });
  };

  return (
    <div className="scroll-x">
      <svg
        className="calendar"
        viewBox={`0 0 ${width} ${height}`}
        style={{ minWidth: width * 0.8, maxWidth: width * 1.25 }}
        role="img"
        aria-label="Games by weekday and hour of the day"
        onMouseOver={onMouseOver}
        onMouseLeave={() => onHover(null)}
      >
        {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
          <text key={h} className="axis-label" x={LEFT + h * STEP} y={TOP - 5}>
            {String(h).padStart(2, '0')}h
          </text>
        ))}
        {rows.map((name, row) => (
          <text key={name} className="axis-label" x={0} y={TOP + row * STEP + CELL - 4}>
            {name}
          </text>
        ))}
        {matrix.map((hours, row) =>
          hours.map((count, hour) => (
            <rect
              key={`${row}-${hour}`}
              data-row={row}
              data-hour={hour}
              className={`cell ${levelClass(scale.level(count))}`}
              x={LEFT + hour * STEP}
              y={TOP + row * STEP}
              width={CELL}
              height={CELL}
              rx={3}
            />
          )),
        )}
      </svg>
    </div>
  );
}
