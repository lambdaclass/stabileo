/**
 * Each material's α reaches the solve: a restrained bar's thermal force is E·A·α·ΔT with ITS α.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store/index';
import { initSolver } from '../wasm-solver';
import { thermalAlphaOf, thermalFamilyOf, ENGINE_ALPHA } from '../thermal-alpha';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; });
afterEach(() => { uiStore.analysisMode = '3d'; });

/** The axial force in a bar fixed at both ends under ΔT = 20 °C, with material `mat`. */
function restrainedForce(mat: { e: number; alpha?: number; gradeId?: string }): { n: number; ea: number } {
  modelStore.clear();
  const mid = modelStore.addMaterial({ name: 'M', nu: 0.2, rho: 25, ...mat } as never);
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0);
  const el = modelStore.addElement(a, b, 'frame');
  modelStore.updateElementMaterial(el, mid);
  modelStore.addSupport(a, 'fixed3d');
  modelStore.addSupport(b, 'fixed3d');
  modelStore.addThermalLoad(el, 20, 0);
  const r = modelStore.solve3D(false, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  const f = r.elementForces.find((x) => x.elementId === el)!;
  const sec = modelStore.sections.get(modelStore.elements.get(el)!.sectionId)!;
  return { n: Math.abs(f.nStart), ea: mat.e * 1000 * sec.a };
}

describe('the thermal expansion coefficient', () => {
  it('is read from the grade or from E, never from fy', () => {
    expect(thermalFamilyOf({ e: 30_000 })).toBe('concrete');
    expect(thermalFamilyOf({ e: 200_000 })).toBe('steel');
    expect(thermalFamilyOf({ e: 70_000 })).toBe('aluminium');
    expect(thermalFamilyOf({ e: 11_000 })).toBe('unknown');   // timber or masonry: not told apart
    expect(thermalAlphaOf({ e: 11_000 })).toBe(ENGINE_ALPHA);
    expect(thermalAlphaOf({ e: 11_000, alpha: 5e-6 })).toBe(5e-6);
  });

  for (const [name, mat, alpha] of [
    ['concrete, by its modulus', { e: 30_000 }, 10e-6],
    ['steel, by its modulus', { e: 200_000 }, 12e-6],
    ['timber, as stated', { e: 11_000, alpha: 5e-6 }, 5e-6],
  ] as const) {
    it(`reaches a restrained bar: ${name}`, () => {
      const { n, ea } = restrainedForce(mat);
      // To 1e-4: the solver takes A from the section's canonical geometry, which differs from
      // the catalogue's A by 2.5e-5 for this section, the same for every material.
      expect(n / (ea * alpha * 20)).toBeCloseTo(1, 4);
    });
  }
});
