import { expect, it } from 'vitest';
import { chartReadout } from '../chart-readout';
it('never presents an early live value at a later reference iteration', () => {
  const series = [{ name: 'reference', color: '', points: [[1, 10], [100, 2]] as [number, number][] }, { name: 'live', color: '', points: [[1, 11], [10, 5]] as [number, number][] }];
  expect(chartReadout(series, 99)?.rows.map(r => r.p)).toEqual([[100, 2], null]);
  expect(chartReadout(series, 1)?.rows.map(r => r.p)).toEqual([[1, 10], [1, 11]]);
  expect(chartReadout(series, null)).toBeNull();
});
