import { METRICS, type Metric } from '../analysis/aggregate';
import { PALETTES, type Palette, type ScaleMode } from '../analysis/colorScale';
import type { RangePreset, TimeZoneMode, WeekStart } from '../analysis/dates';
import type { ViewState } from '../state/urlState';
import { Field, Segmented } from './controls';

interface Props {
  view: ViewState;
  years: number[];
  onChange: (patch: Partial<ViewState>) => void;
}

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: 'last12', label: 'Last 12 months' },
  { key: 'thisYear', label: 'This year' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom' },
];

export function RangePicker({ view, years, onChange }: Props) {
  const isYear = view.range.startsWith('y');
  return (
    <div className="range-picker">
      <Segmented<RangePreset>
        label="Date range"
        value={view.range}
        options={PRESETS}
        onChange={(range) => onChange({ range })}
      />
      <select
        aria-label="Year"
        className={isYear ? 'on' : ''}
        value={isYear ? view.range : ''}
        onChange={(e) => e.target.value && onChange({ range: e.target.value as RangePreset })}
      >
        <option value="">Year…</option>
        {years.map((y) => (
          <option key={y} value={`y${y}`}>
            {y}
          </option>
        ))}
      </select>
      {view.range === 'custom' && (
        <span className="custom-range">
          <input type="date" aria-label="From" value={view.from} max={view.to || undefined} onChange={(e) => onChange({ from: e.target.value })} />
          <span className="muted">→</span>
          <input type="date" aria-label="To" value={view.to} min={view.from || undefined} onChange={(e) => onChange({ to: e.target.value })} />
        </span>
      )}
    </div>
  );
}

export function DisplaySettings({ view, onChange }: Omit<Props, 'years'>) {
  return (
    <details className="display-settings">
      <summary>Display</summary>
      <div className="display-grid">
        <Field label="Color intensity shows">
          <Segmented<Metric>
            label="Metric"
            value={view.metric}
            options={METRICS.map((m) => ({ key: m.key, label: m.label }))}
            onChange={(metric) => onChange({ metric })}
          />
        </Field>
        <Field label="Scale" hint="Quantile spreads colors evenly across your active days.">
          <Segmented<ScaleMode>
            label="Scale"
            value={view.scale}
            options={[
              { key: 'quantile', label: 'Quantile' },
              { key: 'linear', label: 'Linear' },
            ]}
            onChange={(scale) => onChange({ scale })}
          />
        </Field>
        <Field label="Palette">
          <Segmented<Palette>
            label="Palette"
            value={view.palette}
            options={PALETTES.map((p) => ({
              key: p.key,
              label: (
                <span className={`palette-sample palette-${p.key}`}>
                  <i className="lv2" />
                  <i className="lv4" />
                  {p.label}
                </span>
              ),
            }))}
            onChange={(palette) => onChange({ palette })}
          />
        </Field>
        <Field label="Week starts on">
          <Segmented<WeekStart>
            label="Week starts on"
            value={view.weekStart}
            options={[
              { key: 1, label: 'Monday' },
              { key: 0, label: 'Sunday' },
            ]}
            onChange={(weekStart) => onChange({ weekStart })}
          />
        </Field>
        <Field label="Days in">
          <Segmented<TimeZoneMode>
            label="Time zone"
            value={view.tz}
            options={[
              { key: 'local', label: 'Local time' },
              { key: 'utc', label: 'UTC' },
            ]}
            onChange={(tz) => onChange({ tz })}
          />
        </Field>
      </div>
    </details>
  );
}
