import { expect, it } from 'vitest';
import native from '../../../../../../research/stability/southwell-1932/results/stabileo_results.json';
import { compute, euler, type Row } from '../benchmark';

it('matches the shared-case native run through the production WASM wrappers', async () => {
  const rows: Row[] = [];
  const result = await compute(row => rows.push(row), () => false);
  expect(rows).toHaveLength(native.rows.length);
  expect(result).not.toBeNull();
  expect(result!.estimated).toBeCloseTo(native.estimated, 6);
  expect(result!.linear).toBeCloseTo(native.linear, 6);
  expect(Math.abs(result!.estimated / euler - 1)).toBeLessThan(.01);
  for (const [i, row] of rows.entries()) {
    expect(row.delta).toBeCloseTo(native.rows[i].delta, 10);
    expect(row.load).toBeCloseTo(native.rows[i].load, 10);
  }
});
