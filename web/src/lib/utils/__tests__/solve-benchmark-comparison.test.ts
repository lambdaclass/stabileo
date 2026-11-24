import { expect, it } from 'vitest';
import { compareSolveResults } from '../../../../scripts/solve-benchmark-comparison';

const bundle = (uz: number) => ({
  perCase: new Map([[3, { displacements: [{ nodeId: 1, uz }], timings: { totalMs: 1 } }]]),
  envelope: { axial: { elements: [{ elementId: 2, posValues: [10], negValues: [-2] }] } },
});

it('accepts roundoff and different timing metadata', () => {
  const other = bundle(-0.01 + 1e-12);
  other.perCase.get(3)!.timings.totalMs = 200;
  expect(() => compareSolveResults(bundle(-0.01), other)).not.toThrow();
});

it('reports the location of a displacement mismatch', () => {
  expect(() => compareSolveResults(bundle(-0.01), bundle(-0.02)))
    .toThrow('results.perCase[3].displacements[0].uz');
});

it('rejects missing cases and changes to envelope values', () => {
  const missing = bundle(-0.01);
  missing.perCase.clear();
  expect(() => compareSolveResults(bundle(-0.01), missing)).toThrow('results.perCase');
  const changed = bundle(-0.01);
  changed.envelope.axial.elements[0].negValues[0] = -3;
  expect(() => compareSolveResults(bundle(-0.01), changed)).toThrow('negValues[0]');
});

it('rejects non-finite numbers even when both paths produce them', () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    expect(() => compareSolveResults(bundle(value), bundle(value))).toThrow('.uz');
  }
});
