import { describe, expect, it } from 'vitest';
import { compareReference as compare, deepLinkStep } from '../comparison';
import type { Frame } from '../simulation.svelte';

const compareReference = (f: Frame[], r: Parameters<typeof compare>[1]) => compare(f, r, {
  nodes: new Float64Array([0, 0]), elements: new Uint32Array(0),
  snapshots: { damage: { 0: [0.1] }, displacement: { 0: [0, 0.001] } },
  material: { e: 30, nu: 0.2, plane: 'stress' }, replay: true,
});
const reference = [1, 2, 0.5].map((reaction, step) => ({ reaction, step, iterations: 3, damageMax: 0.1 }));
function frames(): Frame[] {
  return reference.map(r => ({
    step: { ...r, pseudotime: 0.01, displacement: 0.001, converged: true, residual: 1e-6,
      damage_max: 0.1, damage_min: 0, elastic_energy: 1, fracture_energy: 0.1 },
    damage: new Float32Array([0.1]), displacement: new Float32Array([0, 0.001]),
  }));
}

describe('reference match evidence', () => {
  it('requires every check to pass', () => expect(compareReference(frames(), reference).matches).toBe(true));
  for (const key of Object.keys(frames()[0].step)) {
    if (key === 'damageMax') continue; // Reference-only fixture metadata.
    it(`rejects missing or invalid step field ${key}`, () => {
      for (const value of [undefined, NaN, Infinity, -Infinity]) {
        for (const index of [0, 2]) {
          const f = frames();
          const step = f[index].step as unknown as Record<string, unknown>;
          if (value === undefined) delete step[key]; else step[key] = value;
          expect(compareReference(f, reference).matches).toBe(false);
        }
      }
    });
  }
  it('rejects perturbed pre-fracture and post-fracture forces', () => {
    for (const i of [0, 2]) {
      const f = frames();
      f[i].step.reaction += i === 0 ? 1e-8 : 2e-5;
      expect(compareReference(f, reference).matches).toBe(false);
      expect(compareReference(f, reference).failures.join()).toContain('force difference');
    }
  });
  it('rejects different iterations, peak, missing frames, non-convergence and non-finite fields', () => {
    const mutations = [
      (f: Frame[]) => { f[0].step.iterations++; },
      (f: Frame[]) => { f[2].step.reaction = 3; },
      (f: Frame[]) => { f.pop(); },
      (f: Frame[]) => { f[0].step.converged = false; },
      (f: Frame[]) => { f[0].step.reaction = NaN; },
      (f: Frame[]) => { f[0].damage[0] = Infinity; },
      (f: Frame[]) => { f[0].step.step = 2; },
      (f: Frame[]) => { f[0].step.damage_max = 0.2; },
      (f: Frame[]) => { f[0].damage.fill(0); },
      (f: Frame[]) => { f[0].displacement.fill(0); },
      (f: Frame[]) => { f[0].damage = new Float32Array(0); },
    ];
    for (const mutate of mutations) {
      const f = frames(); mutate(f);
      expect(compareReference(f, reference).matches).toBe(false);
    }
  });
});

it('accepts only finite integer step links and clamps them', () => {
  for (const value of [null, '', ' ', 'no', 'NaN', 'Infinity', '1.5', '1e309']) expect(deepLinkStep(value, 79)).toBeNull();
  expect(deepLinkStep('-2', 79)).toBe(0);
  expect(deepLinkStep('999', 79)).toBe(78);
  expect(deepLinkStep('57', 79)).toBe(57);
});
