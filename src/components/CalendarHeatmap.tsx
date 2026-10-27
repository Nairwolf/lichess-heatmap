import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { metricValue, type DayStats, type Metric } from '../analysis/aggregate';
import { levelClass, type ColorScale } from '../analysis/colorScale';
import { monthName, partsOf, startOfWeek, weekdayName, type DayRange, type WeekStart } from '../analysis/dates';
import { anchorOf, type TooltipState } from './Tooltip';

const CELL = 11;
const STEP = 14;
const LEFT = 30;
const TOP = 16;

export interface CalendarProps {
  range: DayRange;
  byDay: Map<number, DayStats>;
  metric: Metric;
  scale: ColorScale;
  weekStart: WeekStart;
  today: number;
  selectedDay?: number;
  onSelect: (day: number) => void;
  onHover: (t: TooltipState | null) => void;
  renderTooltip: (day: number) => ReactNode;
  label: string;
  /** Reserve room for this many weeks, so partial years keep the same cell size as full ones. */
  minWeeks?: number;
}

export function CalendarHeatmap(props: CalendarProps) {
  const { range, byDay, metric, scale, weekStart, today, selectedDay } = props;
  const firstDay = startOfWeek(range.start, weekStart);
  const weeks = Math.floor((range.end - firstDay) / 7) + 1;
  const width = LEFT + Math.max(weeks, props.minWeeks ?? 0) * STEP;
  const height = TOP + 7 * STEP;

  const cells: ReactNode[] = [];
  const months: ReactNode[] = [];
  let lastLabelCol = -10;
  for (let day = range.start; day <= range.end; day++) {
    const col = Math.floor((day - firstDay) / 7);
    const row = (day - firstDay) % 7;
    const value = metricValue(byDay.get(day), metric);
    const classes = ['cell', levelClass(scale.level(value))];
    if (day > today) classes.push('future');
    if (day === selectedDay) classes.push('selected');
    cells.push(
      <rect
        key={day}
        data-day={day}
        className={classes.join(' ')}
        x={LEFT + col * STEP}
        y={TOP + row * STEP}
        width={CELL}
        height={CELL}
        rx={2}
      />,
    );

    const { month, date } = partsOf(day);
    const isMonthStart = date === 1 || (day === range.start && date <= 20);
    if (isMonthStart && col - lastLabelCol >= 3) {
      months.push(
        <text key={`m${day}`} className="axis-label" x={LEFT + col * STEP} y={TOP - 5}>
          {monthName(month)}
        </text>,
      );
      lastLabelCol = col;
    }
  }

  const weekdays = [0, 1, 2, 3, 4, 5, 6]
    .filter((row) => [1, 3, 5].includes((row + weekStart) % 7))
    .map((row) => (
      <text key={row} className="axis-label" x={0} y={TOP + row * STEP + CELL - 2}>
        {weekdayName((row + weekStart) % 7)}
      </text>
    ));

  const dayOf = (e: MouseEvent): number | undefined => {
    const el = (e.target as Element).closest('rect[data-day]');
    return el ? Number(el.getAttribute('data-day')) : undefined;
  };

  const onMouseOver = (e: MouseEvent) => {
    const day = dayOf(e);
    if (day === undefined) return;
    props.onHover({ ...anchorOf(e.target as Element), content: props.renderTooltip(day) });
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const moves: Record<string, number> = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 };
    if (!(e.key in moves)) return;
    e.preventDefault();
    const from = selectedDay !== undefined && selectedDay >= range.start && selectedDay <= range.end
      ? selectedDay
      : Math.min(range.end, today);
    const next = Math.min(range.end, Math.max(range.start, from + moves[e.key]));
    props.onSelect(next);
    const rect = e.currentTarget.querySelector(`rect[data-day="${next}"]`);
    if (rect) props.onHover({ ...anchorOf(rect), content: props.renderTooltip(next) });
  };

  return (
    <svg
      className="calendar"
      viewBox={`0 0 ${width} ${height}`}
      style={{ minWidth: width * 0.8, maxWidth: width * 1.5 }}
      role="img"
      aria-label={`${props.label}. Use arrow keys to move between days.`}
      tabIndex={0}
      onMouseOver={onMouseOver}
      onMouseLeave={() => props.onHover(null)}
      onBlur={() => props.onHover(null)}
      onClick={(e) => {
        const day = dayOf(e);
        if (day !== undefined) props.onSelect(day);
      }}
      onKeyDown={onKeyDown}
    >
      {months}
      {weekdays}
      {cells}
    </svg>
  );
}

/** Ordered weekday labels for the first column of other grids. */
export function weekdayRows(weekStart: WeekStart): string[] {
  return [0, 1, 2, 3, 4, 5, 6].map((row) => weekdayName((row + weekStart) % 7));
}
