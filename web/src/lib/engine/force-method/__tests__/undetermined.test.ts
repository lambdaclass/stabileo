import { describe, it, expect } from 'vitest';
import { undetermined, axialKept } from '../terms';
import type { TermRow } from '../result-types';

describe('which redundants a flexibility system leaves free', () => {
  it('a full-rank system with coefficients far apart in size determines every unknown', () => {
    expect(undetermined([[1, 0], [0, 1e-10]])).toEqual([]);
    expect(undetermined([[1e6, 2e-1], [2e-1, 1e-6]])).toEqual([]);
  });
  it('a dependent pair leaves one free, a zero row leaves its unknown free', () => {
    expect(undetermined([[1, 1], [1, 1]])).toHaveLength(1);
    expect(undetermined([[2, 0], [0, 0]])).toEqual([1]);
  });
});

describe('which redundants keep their axial term', () => {
  const rows = (b: number[][], a: number[][]): TermRow[][][] =>
    b.map((r, i) => r.map((v, j) => [{ elementId: 1, source: 'bending', value: v }, { elementId: 1, source: 'axial', value: a[i][j] }]));
  const full = (b: number[][], a: number[][]) => b.map((r, i) => r.map((v, j) => v + a[i][j]));
  const droppable = (q: TermRow) => q.source === 'axial';

  it('an axial-only redundant keeps its row and column when the mix stays positive definite', () => {
    const b = [[0, 0], [0, 1]], a = [[1, 0], [0, 100]];
    expect([...axialKept(rows(b, a), full(b, a), droppable)]).toEqual([0]);
  });

  it('a mix that would be indefinite keeps the axial term everywhere', () => {
    const b = [[1, 0], [0, 0]], a = [[100, 10], [10, 1]];
    const kept = axialKept(rows(b, a), full(b, a), droppable);
    expect([...kept].sort()).toEqual([0, 1]);
  });
});
