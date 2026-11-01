import { expect, it } from 'vitest';
import { chartReadout } from '../chart-readout';
it('never presents an early live value at a later reference iteration', () => {
  const series = [{ name: 'reference', color: '', points: [[1, 10], [100, 2]] as [number, number][] }, { name: 'live', color: '', points: [[1, 11], [10, 5]] as [number, number][] }];
  expect(chartReadout(series, 99)?.rows.map(r => r.p)).toEqual([[100, 2], null]);
  expect(chartReadout(series, 1)?.rows.map(r => r.p)).toEqual([[1, 10], [1, 11]]);
  expect(chartReadout(series, null)).toBeNull();
});
it('reads each series at its own point nearest the pointer when a distance is given, so a path turning back in x reads one branch', () => {
  const path = { name: 'path', color: '', points: [[0, 0], [2, 1], [1, 2], [0, 3]] as [number, number][] };
  const distance = (p: [number, number]) => Math.hypot(p[0] - 0.1, p[1] - 2.9);
  expect(chartReadout([path], 0.1, distance)?.rows.map(r => r.p)).toEqual([[0, 3]]);
  expect(chartReadout([path], 0.1)?.rows.map(r => r.p)).toEqual([[0, 0]]);
});
it('marks distance readouts as carrying each series its own x, since their nearest points can differ in x', () => {
  const a = { name: 'a', color: '', points: [[0, 0], [1, 1]] as [number, number][] };
  const b = { name: 'b', color: '', points: [[0.4, 0.9], [3, 3]] as [number, number][] };
  const readout = chartReadout([a, b], 0.5, (p) => Math.hypot(p[0] - 0.5, p[1] - 0.9));
  expect(readout?.ownX).toBe(true);
  expect(readout?.rows.map(r => r.p)).toEqual([[1, 1], [0.4, 0.9]]);
  expect(chartReadout([a, b], 1)?.ownX).toBe(false);
});
