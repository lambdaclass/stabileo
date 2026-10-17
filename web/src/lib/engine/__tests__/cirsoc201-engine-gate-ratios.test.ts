/**
 * The engine gate's numbers, exactly: each ratio it reports is the engine's, for the bars the
 * TypeScript chose at the depths they really sit, and each disagreement lowers exactly the
 * check it concerns. Written to kill the mutants Stryker found surviving in
 * cirsoc201-engine-gate.ts (docs/verification/TS_ENGINE_LOGIC.md, step 5).
 */
import { describe, it, expect } from 'vitest';
import { verifyElement, REBAR_DB, type VerificationInput } from '../codes/argentina/cirsoc201';
import { engineRecheckElement } from '../codes/argentina/cirsoc201-engine-gate';
import { evaluateBeamSection } from '../codes/argentina/cirsoc201-beam-kernel';
import { registerColumnCapacityKernel } from '../column-capacity-kernel';
import { solve_column_capacity_batch } from '../../wasm/dedaliano_engine.js';

const base: VerificationInput = {
  elementId: 7, elementType: 'beam', Mu: 120, Vu: 90, Nu: 0,
  b: 0.3, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8,
};
const area = (d: number) => REBAR_DB.find((r) => r.diameter === d)!.area;

/** What the engine says about a verification's arrangement, computed here independently. */
function engineOf(v: ReturnType<typeof verifyElement>, NuShear: number) {
  const f = v.flexure;
  const d = v.h - v.cover - 0.008 - f.barDia / 2000;
  const dp = f.barDiaComp ? v.cover + 0.008 + f.barDiaComp / 2000 : 0;
  return evaluateBeamSection({
    edition: '2025', fc: v.fc * 1e6, fy: v.fy * 1e6, b: v.b, h: v.h, d, As: f.AsProv * 1e-4,
    AsComp: f.AsComp ? f.AsComp * 1e-4 : 0, dPrime: dp,
    Av: v.shear.stirrupLegs * area(v.shear.stirrupDia) * 1e-4, s: v.shear.spacing,
    Ag: v.b * v.h, NuCompression: NuShear * 1e3,
  })!;
}

describe('engine gate ratios', () => {
  it('reports the engine ratios of the bars actually chosen, compression steel at its real depth', () => {
    for (const Mu of [60, 120, 250, 330]) {
      const v = verifyElement({ ...base, Mu, b: 0.25, h: 0.5 });
      const g = engineRecheckElement(v, { stirrupDia: 8, NuShear: 0 });
      const e = engineOf(v, 0);
      expect(g.engineRecheck.flexureRatio).toBeCloseTo(v.flexure.Mu / (e.phiMn / 1e3), 12);
      expect(g.engineRecheck.shearRatio).toBeCloseTo(v.shear.Vu / (e.phiVn / 1e3), 12);
      expect(g.engineRecheck.ductilityRatio).toBeCloseTo(e.epsilonTMin / e.epsilonT, 12);
    }
  });

  it('uses the axial force the shear check used, not the magnitude', () => {
    const v = verifyElement(base);
    const tension = engineRecheckElement(v, { stirrupDia: 8, NuShear: -600 });
    const none = engineRecheckElement(v, { stirrupDia: 8, NuShear: 0 });
    expect(tension.engineRecheck.shearRatio).toBeCloseTo(v.shear.Vu / (engineOf(v, -600).phiVn / 1e3), 12);
    expect(tension.engineRecheck.shearRatio!).toBeGreaterThan(none.engineRecheck.shearRatio!);
  });

  it('a shear pass the engine contradicts fails the shear check only', () => {
    const v = verifyElement(base);
    expect(v.shear.status).not.toBe('fail');
    const sparse = { ...v, shear: { ...v.shear, spacing: v.shear.spacing * 6 } };
    const g = engineRecheckElement(sparse, { stirrupDia: 8, NuShear: 0 });
    expect(g.engineRecheck.disagreements).toEqual(['shear']);
    expect(g.shear.status).toBe('fail');
    expect(g.flexure.status).toBe(v.flexure.status);
    const d = g.diagnostics!.find((x) => x.code === 'VERIF_ENGINE_DISAGREES')!;
    expect(d.details).toMatchObject({ checks: 'shear', shearRatio: g.engineRecheck.shearRatio, flexureRatio: g.engineRecheck.flexureRatio });
    expect(d.elementIds).toEqual([7]);
    // The input is not modified.
    expect(sparse.shear.status).toBe(v.shear.status);
  });

  it('a TypeScript failure stays a failure and is not counted as a disagreement', () => {
    const v = verifyElement({ ...base, Mu: 2000 });
    expect(v.flexure.status).toBe('fail');
    const g = engineRecheckElement(v, { stirrupDia: 8, NuShear: 0 });
    expect(g.engineRecheck.disagreements).not.toContain('flexure');
    expect(g.flexure.status).toBe('fail');
  });

  it('names what it did not re-check', () => {
    const col = verifyElement({ ...base, elementType: 'column', b: 0.4, h: 0.4, Mu: 40, Nu: 800, Muy: 30, Tu: 15, Lu: 6, M1: 20, M2: 40 });
    const g = engineRecheckElement(col, { stirrupDia: 8, NuShear: 0 });
    expect(new Set(g.engineRecheck.notRechecked)).toEqual(new Set([
      ...(col.biaxial ? ['biaxial'] : []),
      ...(col.torsion && !col.torsion.neglect ? ['torsion'] : []),
      ...(col.slender?.isSlender ? ['slenderness'] : []),
    ]));
    expect(g.engineRecheck.notRechecked).toContain('biaxial');
    const beam = engineRecheckElement(verifyElement(base), { stirrupDia: 8, NuShear: 0 });
    expect(beam.engineRecheck.notRechecked).toEqual([]);
    expect(beam.diagnostics?.some((d) => d.code.startsWith('VERIF_ENGINE'))).toBeFalsy();
  });

  it('columns are not verified without the Rust column kernel', () => {
    const col = verifyElement({ ...base, elementType: 'column', b: 0.4, h: 0.4, Mu: 40, Nu: 800 });
    registerColumnCapacityKernel(null);
    try {
      const g = engineRecheckElement(col, { stirrupDia: 8, NuShear: 0 });
      expect(g.engineRecheck.unavailable).toBe(true);
      expect(g.column!.status).toBe('fail');
      expect(g.flexure.status).toBe('fail');
      expect(g.shear.status).toBe('fail');
      expect(g.overallStatus).toBe('fail');
    } finally {
      registerColumnCapacityKernel(solve_column_capacity_batch);
    }
    const ok = engineRecheckElement(col, { stirrupDia: 8, NuShear: 0 });
    expect(ok.engineRecheck.unavailable).toBe(false);
    expect(ok.engineRecheck.columnRatio!).toBeLessThan(1);
    // Compression only: no tension load is added, so a large positive NuShear changes nothing.
    expect(engineRecheckElement(col, { stirrupDia: 8, NuShear: 500 }).engineRecheck.columnRatio).toBe(ok.engineRecheck.columnRatio);
  });
});

describe('engine gate: the remaining mutants', () => {
  it('a check that already failed in TypeScript is not reported as a disagreement, even when the engine fails it too', () => {
    const v = verifyElement(base);
    const failing = {
      ...v,
      flexure: { ...v.flexure, status: 'fail' as const, AsProv: v.flexure.AsProv / 3 },
      shear: { ...v.shear, status: 'fail' as const, spacing: v.shear.spacing * 6 },
    };
    const g = engineRecheckElement(failing, { stirrupDia: 8, NuShear: 0 });
    expect(g.engineRecheck.flexureRatio!).toBeGreaterThan(1);
    expect(g.engineRecheck.shearRatio!).toBeGreaterThan(1);
    expect(g.engineRecheck.disagreements).toEqual([]);
    expect(g.diagnostics?.some((d) => d.code === 'VERIF_ENGINE_DISAGREES') ?? false).toBe(false);
  });

  it('a section with no tension steel cannot be asked about: not verified', () => {
    const v = verifyElement(base);
    const g = engineRecheckElement({ ...v, flexure: { ...v.flexure, AsProv: 0 } }, { stirrupDia: 8, NuShear: 0 });
    expect(g.engineRecheck.unavailable).toBe(true);
    expect(g.engineRecheck.flexureRatio).toBeUndefined();
    const d = g.diagnostics!.find((x) => x.code === 'VERIF_ENGINE_UNAVAILABLE')!;
    expect(d).toMatchObject({ severity: 'error', message: 'diag.verifEngineUnavailable', source: 'verification', elementIds: [7] });
  });

  it('ductility binds beams only', () => {
    const col = verifyElement({ ...base, elementType: 'column', b: 0.4, h: 0.4, Mu: 40, Nu: 800 });
    const g = engineRecheckElement(col, { stirrupDia: 8, NuShear: 0 });
    expect(g.engineRecheck.ductilityRatio).toBeUndefined();
    expect(g.engineRecheck.columnRatio!).toBeGreaterThan(0);
  });

  it('a column disagreement is named, carried in the diagnostic and leaves the input alone', () => {
    const col = verifyElement({ ...base, elementType: 'column', b: 0.3, h: 0.3, Mu: 30, Vu: 10, Nu: 300 });
    expect(col.column!.status).not.toBe('fail');
    const g = engineRecheckElement(col, { stirrupDia: 8, NuShear: -1500 });
    expect(g.engineRecheck.disagreements).toContain('column');
    const d = g.diagnostics!.find((x) => x.code === 'VERIF_ENGINE_DISAGREES')!;
    expect(d).toMatchObject({ severity: 'error', message: 'diag.verifEngineDisagrees', source: 'verification', elementIds: [7] });
    expect(d.details).toMatchObject({ columnRatio: g.engineRecheck.columnRatio });
    expect(col.column!.status).not.toBe('fail');
  });

  it('the ductility ratio travels in the diagnostic, and earlier diagnostics are kept', () => {
    const v = verifyElement({ ...base, Mu: 330, b: 0.25, h: 0.5, Vu: 10 });
    const before = v.diagnostics?.length ?? 0;
    const g = engineRecheckElement(v, { stirrupDia: 8, NuShear: 0 });
    const d = g.diagnostics!.find((x) => x.code === 'VERIF_ENGINE_DISAGREES')!;
    expect(d.details).toMatchObject({ checks: 'ductility', ductilityRatio: g.engineRecheck.ductilityRatio });
    expect(g.diagnostics!.length).toBe(before + 1);
    for (const old of v.diagnostics ?? []) expect(g.diagnostics).toContainEqual(old);
  });

  it('no engine remark, no diagnostics list', () => {
    const v = verifyElement({ ...base, Mu: 40, Vu: 30 });
    expect(v.diagnostics).toBeUndefined();
    expect(engineRecheckElement(v, { stirrupDia: 8, NuShear: 0 }).diagnostics).toBeUndefined();
  });
});
