import { expect, it } from 'vitest';
import { generalizedEigen, type Mat } from '../dense';
import { firstOrderAxial, linearBuckling, teachingBuckling } from '../buckling';
import { buildSystem } from '../system';
import { column } from './fixtures';

const scales = [2 ** -60, 1, 2 ** 60];
const pencils = scales.flatMap(k => scales.flatMap(g => [false, true].map(projected => ({
  k, g, projected, label: `K scale ${k}, G scale ${g}, projected ${projected}`,
}))));
const transform = (projected: boolean): Mat | undefined => projected ? [[2, 0], [0, 0.5]] : undefined;

it.skip.each(pencils)('known wrong result: #818: resolved positive work survives $label', ({ k, g, projected }) => {
  for (const weak of [1e-14, 50 * Number.EPSILON, 100 * Number.EPSILON, 200 * Number.EPSILON]) {
    const K = [[k, 0], [0, k]], G = [[g, 0], [0, g * weak]];
    const modes = generalizedEigen(K, G, transform(projected));
    expect(modes).not.toBeNull();
    expect(modes).toHaveLength(2);
    if (!modes) throw new Error('missing positive modes');
    for (const [i, work] of [1, weak].entries()) {
      expect(Math.abs(modes[i].lambda / (k / (g * work)) - 1)).toBeLessThan(1e-12);
      const q = modes[i].vector;
      const phi = projected ? [2 * q[0], 0.5 * q[1]] : q;
      expect(phi[1 - i]).toBe(0);
      expect(Math.abs(phi[i])).toBeGreaterThan(0);
    }
  }
});

it.each(pencils)('non-positive work stays excluded and ordinary modes survive $label', ({ k, g, projected }) => {
  for (const work of [0, -1e-14, -1]) {
    const modes = generalizedEigen([[k, 0], [0, k]], [[g, 0], [0, g * work]], transform(projected));
    expect(modes).toHaveLength(1);
    expect(Math.abs(modes![0].lambda / (k / g) - 1)).toBeLessThan(1e-12);
    expect(modes![0].vector[1]).toBe(0);
  }
  const modes = generalizedEigen([[k, 0], [0, k]], [[g, 0], [0, g / 2]], transform(projected));
  expect(modes).toHaveLength(2);
  for (const [i, factor] of [1, 2].entries()) {
    expect(Math.abs(modes![i].lambda / (factor * k / g) - 1)).toBeLessThan(1e-12);
  }
});

it.skip.each(['consistent', 'string'] as const)('known wrong result: #818: %s buckling returns both separated column spectra', method => {
  for (const axialRigid of [false, true]) {
    const isolated = column('fixed', null, 5, 100);
    const opts = { method, axialRigid };
    const reference = teachingBuckling(isolated, opts, 2);
    if (!reference.ok) throw new Error(reference.reason.key);
    expect(reference.run.modes).toHaveLength(method === 'consistent' ? 2 : 1);
    const input = column('fixed', null, 5, 100);
    input.nodes.set(3, { id: 3, x: 10, z: 0 });
    input.nodes.set(4, { id: 4, x: 10, z: 5 });
    input.elements.set(2, { ...input.elements.get(1)!, id: 2, nodeI: 3, nodeJ: 4 });
    input.supports.set(2, { id: 2, nodeId: 3, type: 'fixed' });
    input.loads.push({ type: 'nodal', data: { nodeId: 4, fx: 0, fz: -100 * 1e-14, my: 0 } });
    const built = buildSystem(input, opts);
    if (!built.ok) throw new Error(built.reason.key);
    const first = firstOrderAxial(built.sys);
    if (!first.ok) throw new Error(first.reason.key);
    const direct = linearBuckling(built.sys, method, 4, first.N0);
    const teaching = teachingBuckling(input, opts, 4);
    if (!teaching.ok) throw new Error(teaching.reason.key);
    const expected = [...reference.run.modes.map(m => m.lambda), ...reference.run.modes.map(m => m.lambda / 1e-14)];
    for (const modes of [direct, teaching.run.modes]) {
      expect(modes).toHaveLength(expected.length);
      expected.forEach((factor, i) => expect(Math.abs(modes[i].lambda / factor - 1)).toBeLessThan(1e-12));
    }
  }
});
