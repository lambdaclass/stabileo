import { describe, it, expect } from 'vitest';
import { enrichComboShellStresses, envelopeShellStresses } from '../shell-combos';
import { principalStresses, requiredSteel, shellComponentValue } from '../shell-stress';
import { shellCentreRows } from '../shell-results';
import type { AnalysisResults3D, QuadStress } from '../types-3d';

const result = (quadStresses: QuadStress[]): AnalysisResults3D => ({
  displacements: [], reactions: [], elementForces: [], quadStresses, plateStresses: [],
} as unknown as AnalysisResults3D);

const deadLoadE10: QuadStress = {
  elementId: 10, sigmaXx: 0, sigmaYy: 0, tauXy: 0,
  mx: 64.95094306, my: 79.8912926, mxy: -20.07573627, qx: -55.90601443, qy: -51.14421948, vonMises: 0,
};

describe('shell envelope of pro-mat-foundation e10', () => {
  it('holds the largest Mx of every combination, not the first combination of equal Von Mises', () => {
    const perCase = new Map([[1, result([deadLoadE10])]]);
    const perCombo = new Map([[1, result([])], [2, result([])], [3, result([])], [4, result([])]]);
    const envelope = result([]);
    const combinations = [
      { id: 1, factors: [{ caseId: 1, factor: 1.2 }] },
      { id: 2, factors: [{ caseId: 1, factor: 1.4 }] },
      { id: 3, factors: [{ caseId: 1, factor: 1.2 }] },
      { id: 4, factors: [{ caseId: 1, factor: 1.2 }] },
    ];
    enrichComboShellStresses(perCase, perCombo, envelope, combinations, new Map());
    expect(perCombo.get(1)!.quadStresses![0]!.mx).toBeCloseTo(77.94113167, 6);
    expect(perCombo.get(2)!.quadStresses![0]!.mx).toBeCloseTo(90.93132028, 6);
    const e10 = envelope.quadStresses!.find((s) => s.elementId === 10)!;
    expect(e10.mx).toBeCloseTo(90.93132028, 6);
    expect(e10.my).toBeCloseTo(111.8478096, 6);
    expect(e10.mxy).toBeCloseTo(-28.10603077, 6);
    expect(e10.qx).toBeCloseTo(-78.2684202, 6);
    expect(e10.qy).toBeCloseTo(-71.60190728, 6);
  });
});

describe('what the envelope view reads from an envelope record', () => {
  const set = (id: number, s: Partial<QuadStress>) => ({
    source: { kind: 'combination' as const, id },
    results: result([{ elementId: 1, sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 0, my: 0, mxy: 0, vonMises: 0, ...s }]),
  });
  const sets = [
    set(1, { sigmaXx: 100, sigmaYy: -100, tauXy: 50, vonMises: Math.sqrt(30000), mx: 20, mxy: 0 }),
    set(2, { sigmaXx: -110, sigmaYy: 0, vonMises: 110, mx: -5, my: 30, mxy: 25 }),
  ];
  const e = envelopeShellStresses(sets).quadStresses[0]!;

  it('keeps the larger magnitude of each component and the largest Von Mises', () => {
    expect([e.sigmaXx, e.sigmaYy, e.mx, e.my, e.mxy]).toEqual([-110, -100, 20, 30, 25]);
    expect(e.vonMises).toBeCloseTo(Math.sqrt(30000), 9);
  });

  it('takes the principal stresses from the sets, not from the mixed components', () => {
    const p = sets.map((s) => principalStresses(s.results.quadStresses![0]!.sigmaXx, s.results.quadStresses![0]!.sigmaYy, s.results.quadStresses![0]!.tauXy));
    expect(shellComponentValue(e, 'sigma1')).toBe(Math.max(...p.map((x) => x.sigma1)));
    expect(shellComponentValue(e, 'sigma2')).toBe(Math.min(...p.map((x) => x.sigma2)));
    expect(shellComponentValue(e, 'sigma2')).not.toBe(principalStresses(e.sigmaXx, e.sigmaYy, e.tauXy).sigma2);
  });

  it('takes the required steel of each face and direction as the largest of the sets', () => {
    const basis = { steelBasis: { d: 0.17, fy: 420 } };
    for (const key of ['asBotX', 'asBotY', 'asTopX', 'asTopY'] as const) {
      const perSet = sets.map((s) => requiredSteel({ ...s.results.quadStresses![0]!, ...basis }, key));
      expect(shellComponentValue({ ...e, ...basis }, key), key).toBeCloseTo(Math.max(...perSet), 12);
    }
  });

  it('lists the components and no faces, principals or global axes derived from them', () => {
    const model = {
      nodes: new Map([[1, { x: 0, y: 0, z: 0 }], [2, { x: 1, y: 0, z: 0 }], [3, { x: 1, y: 1, z: 0 }], [4, { x: 0, y: 1, z: 0 }]]),
      quads: new Map([[1, { id: 1, nodes: [1, 2, 3, 4], thickness: 0.2 }]]),
    };
    const row = shellCentreRows(result([e]), model)[0]!;
    expect(row.mx).toBe(20);
    expect(row.membrane).toBeUndefined();
    expect(row.top).toBeUndefined();
    expect(row.global).toBeUndefined();
  });

  it('names the combination each extreme comes from', () => {
    expect(e.envelope!.mx).toEqual({ max: 20, maxSource: { kind: 'combination', id: 1 }, min: -5, minSource: { kind: 'combination', id: 2 } });
  });
});
