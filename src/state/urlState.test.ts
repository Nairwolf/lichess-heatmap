import { describe, expect, it } from 'vitest';
import { decodeView, DEFAULT_VIEW, encodeView, type ViewState } from './urlState';

describe('url state', () => {
  it('round-trips a customized view', () => {
    const view: ViewState = {
      ...DEFAULT_VIEW,
      username: 'Nairwolf',
      range: 'custom',
      from: '2025-01-01',
      to: '2025-06-30',
      filters: {
        ...DEFAULT_VIEW.filters,
        speeds: ['blitz', 'rapid'],
        clocks: ['3+2'],
        rated: 'rated',
        color: 'black',
        opponent: 'human',
        opponentName: 'abeille',
        opening: 'B1',
      },
      metric: 'time',
      scale: 'linear',
      palette: 'blue',
      weekStart: 0,
      tz: 'utc',
    };
    expect(decodeView(encodeView(view))).toEqual(view);
  });

  it('keeps default views short and ignores junk', () => {
    expect(encodeView({ ...DEFAULT_VIEW, username: 'Nairwolf' })).toBe('?u=Nairwolf');
    expect(decodeView('?metric=nope&range=y20x&rated=maybe')).toEqual(DEFAULT_VIEW);
  });
});
