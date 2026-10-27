import { describe, expect, it } from 'vitest';
import { gaps, mergeIntervals, prioritize, splitAround } from './intervals';

describe('intervals', () => {
  it('merges overlapping and adjacent intervals', () => {
    expect(mergeIntervals([[10, 20], [0, 5], [6, 8], [15, 30]])).toEqual([[0, 8], [10, 30]]);
  });

  it('finds gaps in coverage', () => {
    expect(gaps([0, 100], [])).toEqual([[0, 100]]);
    expect(gaps([0, 100], [[10, 20], [50, 200]])).toEqual([[0, 9], [21, 49]]);
    expect(gaps([0, 100], [[-5, 100]])).toEqual([]);
  });

  it('cuts intervals at range boundaries', () => {
    expect(splitAround([0, 100], [40, 60])).toEqual([[61, 100], [40, 60], [0, 39]]);
    expect(splitAround([0, 50], [40, 60])).toEqual([[40, 50], [0, 39]]);
    expect(splitAround([0, 10], [40, 60])).toEqual([[0, 10]]);
  });

  it('keeps short outside pieces attached to the inside one', () => {
    expect(splitAround([0, 100], [40, 98], 5)).toEqual([[40, 100], [0, 39]]);
    expect(splitAround([0, 100], [2, 60], 5)).toEqual([[61, 100], [0, 60]]);
  });

  it('puts pieces inside the priority range first', () => {
    expect(prioritize([[0, 100]], [40, 60])).toEqual([[40, 60], [61, 100], [0, 39]]);
    expect(prioritize([[0, 9], [20, 29]])).toEqual([[20, 29], [0, 9]]);
  });
});
