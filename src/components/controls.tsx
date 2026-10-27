import type { ReactNode } from 'react';
import { formatInt } from './format';

/** Single choice among a few options. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { key: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.key)}
          role="radio"
          aria-checked={o.key === value}
          className={o.key === value ? 'on' : ''}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Multiple choice; nothing selected means "all". */
export function Chips<T extends string>({
  selected,
  options,
  onChange,
  label,
}: {
  selected: T[];
  options: { key: T; label: ReactNode; count?: number }[];
  onChange: (v: T[]) => void;
  label: string;
}) {
  const toggle = (key: T) =>
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.key}
          aria-pressed={selected.includes(o.key)}
          className={selected.includes(o.key) ? 'chip on' : 'chip'}
          onClick={() => toggle(o.key)}
        >
          {o.label}
          {o.count !== undefined && <span className="count">{formatInt(o.count)}</span>}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}
