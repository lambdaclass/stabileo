import { expect, it } from 'vitest';
import { columnShearSpacing } from '../transverse-spacing';

const input = { Vu: 30, phiVc: 60, Vs: 0, bw: 0.3, d: 0.26, fc: 25 };
for (const factor of [0.999, 1, 1.001]) {
  it(`column shear reinforcement is required strictly above half phiVc ${factor}`, () => {
    const result = columnShearSpacing('2025', { ...input, Vu: input.Vu * factor });
    expect(result.kind).toBe(factor > 1 ? 'required' : 'not-required');
    expect(columnShearSpacing('2025', { ...input, Vu: -input.Vu * factor })).toEqual(result);
  });
}
for (const d of [0.26, 1.2]) for (const factor of [0.999, 1, 1.001]) {
  it(`column shear spacing uses Table 10.7.6.5.2 in both rows ${d} ${factor}`, () => {
    const threshold = 0.33 * Math.sqrt(input.fc) * input.bw * d * 1000;
    const result = columnShearSpacing('2025', { ...input, d, Vu: 31, Vs: threshold * factor });
    expect(result).toEqual({ kind: 'required', row: factor > 1 ? 'row2' : 'row1', alongMax: Math.min(d / (factor > 1 ? 4 : 2), factor > 1 ? 0.2 : 0.4) });
  });
}
it('column spacing does not substitute the 2025 table for an unavailable edition', () => {
  for (const Vu of [0, 1, 100]) expect(columnShearSpacing('2005', { ...input, Vu })).toEqual({ kind: 'unsupported' });
});
