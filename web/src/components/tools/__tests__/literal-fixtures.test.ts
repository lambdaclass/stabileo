import { expect, it } from 'vitest';
import { EXAMPLE } from '../calculators';
import { calculate } from '../solve';
import { DEFAULT_BATCH as P } from '../batch';
import { calculateBatch } from '../batch-solve';

const close = (actual: number, expected: number, relative: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(relative * Math.abs(expected));
const reactions = (r: { linear: { reactions: { rz: number }[] } }) => r.linear.reactions.map(x => x.rz);

it('simply supported beam: Roark 7th ed. Table 8.1 cases 2e and 1e at L = 6 m, EI = 16000 kN·m²', async () => {
  const udl = await calculate('simply-supported-beam', EXAMPLE);
  close(udl.value, 0.010546875, 1e-9);
  expect(udl.x).toBe(3);
  close(udl.maxima.moment[1], 45, 1e-9);
  close(Math.abs(udl.maxima.shear[1]), 30, 1e-9);
  for (const r of reactions(udl)) close(r, 30, 1e-9);
  const point = await calculate('simply-supported-beam', { ...EXAMPLE, uniform: false, position: 3 });
  close(point.value, 0.0028125, 1e-9);
  close(point.maxima.moment[1], 15, 1e-9);
  for (const r of reactions(point)) close(r, 5, 1e-9);
  const other = await calculate('simply-supported-beam', { ...EXAMPLE, length: 4, e: 210000, i: 0.0002, load: 5 });
  close(other.value, 1 / 2520, 1e-9);
  close(other.maxima.moment[1], 10, 1e-9);
});

it('cantilever: Roark 7th ed. Table 8.1 cases 2a and 1a; the support moment is hogging (negative)', async () => {
  const udl = await calculate('cantilever-beam', EXAMPLE);
  close(udl.value, 0.10125, 1e-9);
  close(udl.maxima.moment[1], -180, 1e-9);
  expect(udl.maxima.moment[0]).toBe(0);
  close(udl.maxima.shear[1], 60, 1e-9);
  close(reactions(udl)[0], 60, 1e-9);
  const tip = await calculate('cantilever-beam', { ...EXAMPLE, uniform: false, position: 6 });
  close(tip.value, 0.045, 1e-9);
  close(tip.maxima.moment[1], -60, 1e-9);
  close(reactions(tip)[0], 10, 1e-9);
  const other = await calculate('cantilever-beam', { ...EXAMPLE, length: 4, e: 210000, i: 0.0002, load: 8, uniform: false, position: 4 });
  close(other.value, 0.004063492063492063, 1e-9);
});

it('column buckling: Timoshenko & Gere Chapter 2 Euler loads; fixed–pinned exact root 4.4934²EI/L²', async () => {
  for (const [k, pcr, tolerance] of [[1, 4386.490844928604, 3e-6], [0.5, 17545.963379714416, 3e-6], [2, 1096.622711232151, 3e-6], [0.7, 8973.657136189613, 3e-6]] as const) {
    const r = await calculate('column-buckling', { ...EXAMPLE, k });
    close(r.value, pcr, tolerance);
  }
  close((await calculate('column-buckling', { ...EXAMPLE, length: 4, e: 210000, i: 0.0002 })).value, 25907.711552859564, 3e-6);
});

it('continuous beam: two equal spans, three-moment equation (3wL/8, 10wL/8, 3wL/8; −wL²/8; 9wL²/128; δ = wL⁴/184.634EI)', async () => {
  const r = await calculateBatch('continuous-beam', P);
  [22.5, 75, 22.5].forEach((value, j) => close(reactions(r)[j], value, 1e-9));
  close(r.hogging, -45, 1e-9);
  close(r.sagging, 25.3125, 1e-9);
  close(r.maxDeflection, 0.0043870585, 1e-5);
  const fixed = await calculateBatch('continuous-beam', { ...P, ends: 'fixed' });
  [195 / 7, 480 / 7, 165 / 7].forEach((value, j) => close(reactions(fixed)[j], value, 1e-9));
});

it('portal frame: statics and slope-deflection (thrust wL²/[4h(2k + 3)] = 7.5 kN, k = 0.5); 0.2 % for column shortening', async () => {
  const r = await calculateBatch('portal-frame', P);
  close(reactions(r)[0], 25, 1e-9);
  close(reactions(r)[1], 35, 1e-9);
  expect(r.linear.reactions.reduce((sum, x) => sum + x.rx, 0)).toBeCloseTo(-10, 9);
  close(r.linear.reactions[0].rx, 2.5, 2e-3);
  close(r.linear.reactions[1].rx, -12.5, 2e-3);
  close(r.maxMoment, 37.5, 2e-3);
  close(r.comparisons[0].reference, 0.005625, 1e-12);
  close(r.comparisons[0].engine, 0.0056325, 1e-6);
});

it('2D truss: method of joints, tension positive', async () => {
  const r = await calculateBatch('truss-2d', P);
  const s = 15 * Math.SQRT2, d = 5 * Math.SQRT2;
  const expected = [15, 15, 15, 15, -s, -20, -20, -s, 0, -10, 0, d, d];
  r.linear.elementForces.forEach((ef, j) => expect(Math.abs(ef.nStart - expected[j])).toBeLessThan(1e-9));
  for (const rz of reactions(r)) close(rz, 15, 1e-12);
  expect(r.comparisons).toHaveLength(13);
});

it('influence line: statics (one span) and force method (two spans), 10 kN axle', async () => {
  const effect = async (count: number, quantity: 'moment' | 'shear' | 'reaction') => { const r = await calculateBatch('influence-line', { ...P, count, quantity }); return r.maximum[1] * P.load; };
  close(await effect(1, 'moment'), 15, 1e-9);
  close(Math.abs(await effect(1, 'shear')), 5, 1e-9);
  close(await effect(1, 'reaction'), 10, 1e-9);
  close(await effect(2, 'moment'), 12.1875, 1e-9);
  close(await effect(2, 'reaction'), 10, 1e-9);
});

it('beam natural frequencies: Blevins Chapter 8 (β = π, 1.875104, 4.730041), μ = 100 kg/m', async () => {
  const simple = await calculateBatch('beam-natural-frequency', P);
  [17.453292519943297, 69.81317007977319, 157.07963267948966].forEach((f, j) => close(simple.modes[j].frequency, f, 2e-5));
  close((await calculateBatch('beam-natural-frequency', { ...P, boundary: 'cantilever' })).modes[0].frequency, 6.21768011075974, 2e-5);
  close((await calculateBatch('beam-natural-frequency', { ...P, boundary: 'fixed' })).modes[0].frequency, 39.56465524738812, 2e-5);
});
