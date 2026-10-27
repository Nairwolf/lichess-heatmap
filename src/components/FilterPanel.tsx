import { useState } from 'react';
import {
  countActiveFilters,
  DEFAULT_FILTERS,
  SOURCE_LABELS,
  SPEEDS,
  VARIANT_LABELS,
  type FacetCounts,
  type Filters,
  type SourceGroup,
} from '../analysis/filters';
import type { Result } from '../lichess/normalize';
import type { Speed } from '../lichess/types';
import { Chips, Field, Segmented } from './controls';

const CLOCKS_SHOWN = 10;

interface Props {
  filters: Filters;
  counts: FacetCounts;
  onChange: (f: Filters) => void;
}

/** Options present in the data (or currently selected), most played first. */
function presentOptions<T extends string>(counts: Map<string, number>, selected: T[], label: (k: T) => string) {
  const keys = new Set<string>([...counts.keys(), ...selected]);
  return [...keys]
    .map((k) => ({ key: k as T, label: label(k as T), count: counts.get(k) ?? 0 }))
    .sort((a, b) => b.count - a.count);
}

export function FilterPanel({ filters, counts, onChange }: Props) {
  const [allClocks, setAllClocks] = useState(false);
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => onChange({ ...filters, [key]: value });
  const active = countActiveFilters(filters);

  const speeds = SPEEDS.filter((s) => counts.speeds.has(s.key) || filters.speeds.includes(s.key)).map((s) => ({
    key: s.key,
    label: s.label,
    count: counts.speeds.get(s.key) ?? 0,
  }));
  const variants = presentOptions<string>(counts.variants, filters.variants, (k) => VARIANT_LABELS[k] ?? k);
  const clocks = presentOptions<string>(counts.clocks, filters.clocks, (k) => k);
  const shownClocks = allClocks ? clocks : clocks.slice(0, CLOCKS_SHOWN);
  const sources = presentOptions<SourceGroup>(counts.sources, filters.sources, (k) => SOURCE_LABELS[k]);

  return (
    <aside className="filters" aria-label="Filters">
      <div className="filters-header">
        <h2>Filters</h2>
        {active > 0 && (
          <button className="link" onClick={() => onChange(DEFAULT_FILTERS)}>
            Reset ({active})
          </button>
        )}
      </div>
      <p className="field-hint">Counts are games in the selected date range.</p>

      <Field label="Time control">
        <Chips<Speed> label="Time control" selected={filters.speeds} options={speeds} onChange={(v) => set('speeds', v)} />
      </Field>

      {clocks.length > 0 && (
        <Field label="Clock">
          <Chips<string> label="Clock" selected={filters.clocks} options={shownClocks} onChange={(v) => set('clocks', v)} />
          {clocks.length > CLOCKS_SHOWN && (
            <button className="link small" onClick={() => setAllClocks(!allClocks)}>
              {allClocks ? 'Show fewer' : `Show all ${clocks.length}`}
            </button>
          )}
        </Field>
      )}

      {variants.length > 1 || filters.variants.length > 0 ? (
        <Field label="Variant">
          <Chips<string> label="Variant" selected={filters.variants} options={variants} onChange={(v) => set('variants', v)} />
        </Field>
      ) : null}

      <Field label="Mode">
        <Segmented
          label="Rated or casual"
          value={filters.rated}
          options={[
            { key: 'all', label: 'All' },
            { key: 'rated', label: 'Rated' },
            { key: 'casual', label: 'Casual' },
          ]}
          onChange={(v) => set('rated', v)}
        />
      </Field>

      <Field label="Color">
        <Segmented
          label="Color played"
          value={filters.color}
          options={[
            { key: 'all', label: 'Both' },
            { key: 'white', label: 'White' },
            { key: 'black', label: 'Black' },
          ]}
          onChange={(v) => set('color', v)}
        />
      </Field>

      <Field label="Result">
        <Chips<Result>
          label="Result"
          selected={filters.results}
          options={[
            { key: 'win', label: 'Win' },
            { key: 'draw', label: 'Draw' },
            { key: 'loss', label: 'Loss' },
          ]}
          onChange={(v) => set('results', v)}
        />
      </Field>

      <Field label="Opponent">
        <Segmented
          label="Opponent type"
          value={filters.opponent}
          options={[
            { key: 'all', label: 'All' },
            { key: 'human', label: 'Humans' },
            { key: 'ai', label: 'Computer' },
          ]}
          onChange={(v) => set('opponent', v)}
        />
        <input
          type="search"
          placeholder="Opponent name contains…"
          value={filters.opponentName}
          onChange={(e) => set('opponentName', e.target.value)}
          aria-label="Opponent name"
        />
      </Field>

      {sources.length > 0 && (
        <Field label="Game type">
          <Chips<SourceGroup> label="Game type" selected={filters.sources} options={sources} onChange={(v) => set('sources', v)} />
        </Field>
      )}

      <Field label="Opening" hint="ECO prefix (B1, C4…) or part of the name.">
        <input
          type="search"
          placeholder="e.g. Sicilian, B90"
          value={filters.opening}
          onChange={(e) => set('opening', e.target.value)}
          aria-label="Opening"
        />
      </Field>
    </aside>
  );
}
