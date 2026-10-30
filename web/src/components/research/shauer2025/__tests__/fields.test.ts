import { expect, it } from 'vitest';
import { checkFields, expectedStress } from '../field-check.mjs';
import { displayedFields } from '../worker-frames';
import { replayMatchesBuild } from '../../shell/assets';
const nodes = new Float64Array([0, 0, 1, 0, 1, 1, 0, 1]);
const elements = new Uint32Array([0, 1, 2, 3]);
const material = { e: 30, nu: 0.2, plane: 'stress' };
const damage = [0.1, 0.1, 0.1, 0.1];
const displacement = [0, 0, 0.001, 0, 0.001, 0.002, 0, 0.002];
const snapshots = { damage: { 56: damage }, displacement: { 56: displacement } };
const frame = () => ({ step: { step: 56, damage_max: 0.1 }, damage: Float32Array.from(damage), displacement: Float32Array.from(displacement), syy: new Float32Array([0.0556875]) });
it('worker sends the independently calculated yy stress, not xx or xy', () => {
  const stress = expectedStress(nodes, elements, damage, displacement, material);
  expect(stress[0]).toBeCloseTo(0.0354375, 12);
  expect(stress[1]).toBeCloseTo(0.0556875, 12);
  expect(stress[2]).toBe(0);
  const fields = displayedFields({ damage: () => Float64Array.from(damage), displacement: () => Float64Array.from(displacement), elementStress: () => Float64Array.from(stress) });
  expect(fields.syy[0]).toBeCloseTo(0.0556875, 8);
  expect(checkFields({ ...fields, step: { step: 56, damage_max: 0.1 } }, nodes, elements, snapshots, material)).toEqual([]);
});
it('rejects zeroed, perturbed and wrong-length finite fields', () => {
  expect(checkFields(frame(), nodes, elements, snapshots, material)).toEqual([]);
  for (const key of ['damage', 'displacement', 'syy'] as const) {
    for (const mutation of ['zero', 'perturb', 'length']) {
      const f = frame();
      if (mutation === 'zero') f[key].fill(0);
      if (mutation === 'perturb') f[key][0] += 0.01;
      if (mutation === 'length') f[key] = new Float32Array(0);
      expect(checkFields(f, nodes, elements, snapshots, material).length).toBeGreaterThan(0);
    }
  }
});
it('disables claims when a replay comes from another deployment or configuration', () => {
  expect(replayMatchesBuild({ build_id: 'old', config: material }, material, 'old')).toBe(true);
  expect(replayMatchesBuild({ build_id: 'new', config: material }, material, 'old')).toBe(false);
  expect(replayMatchesBuild({ build_id: 'old', config: { ...material, e: 31 } }, material, 'old')).toBe(false);
  expect(replayMatchesBuild({ config: material }, material, 'old')).toBe(false);
});
