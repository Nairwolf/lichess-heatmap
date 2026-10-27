import type { ReactNode } from 'react';

export interface TooltipState {
  /** Viewport coordinates of the hovered element's top center. */
  x: number;
  y: number;
  content: ReactNode;
}

export function Tooltip({ state }: { state: TooltipState | null }) {
  if (!state) return null;
  const left = Math.min(Math.max(state.x, 120), window.innerWidth - 120);
  return (
    <div className="tooltip" role="tooltip" style={{ left, top: state.y }}>
      {state.content}
    </div>
  );
}

/** Tooltip position for an element: above it, horizontally centered. */
export function anchorOf(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top - 8 };
}
