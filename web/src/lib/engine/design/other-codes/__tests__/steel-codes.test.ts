/**
 * AISC 360 and EN 1993-1-1 through the engine's checkers, on a pinned IPE 300 column, against
 * the codes' own closed forms: E3 and 6.3.1.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../../../../store/model.svelte';
import { uiStore } from '../../../../store/ui.svelte';
import '../../../../store/index';
import { initSolver } from '../../../wasm-solver';
import { memberContexts, runOtherCode } from '../run';
import { AISC360, EC3, aiscGaps } from '../steel-codes';
import { ec3Class, ec3Curves } from '../ec3-classify';
import { steelProps } from '../steel-props';
import { steelSectionConstants } from '../../../steel/section-constants';

const IPE300 = { name: 'IPE 300', a: 53.8e-4, iy: 8356e-8, iz: 603.8e-8, h: 0.3, b: 0.15, tw: 0.0071, tf: 0.0107, j: 20.1e-8, shape: 'I' as const };
const E = 200_000, FY = 235, L = 4, P = 300;

function column() {
  modelStore.clear();
  const mat = modelStore.addMaterial({ name: 'S235', e: E, nu: 0.3, rho: 78.5, fy: FY, fu: 360 } as never);
  const sec = modelStore.addSection(IPE300 as never);
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, L);
  const el = modelStore.addElement(a, b, 'frame');
  modelStore.updateElementMaterial(el, mat);
  modelStore.updateElementSection(el, sec);
  // Pinned at both ends, torsion held at the base.
  modelStore.addSupport(a, 'custom3d', undefined, { dofRestraints: { tx: true, ty: true, tz: true, rx: false, ry: false, rz: true } });
  modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { tx: true, ty: true, tz: false, rx: false, ry: false, rz: false } });
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  for (const c of [...modelStore.model.loadCases]) modelStore.removeLoadCase(c.id);
  const dead = modelStore.addLoadCase('D', 'D');
  modelStore.addNodalLoad3D(b, 0, 0, -P, 0, 0, 0, dead);
  modelStore.addCombination('1.0D', [{ caseId: dead, factor: 1 }]);
  const r = modelStore.solveCombinations3D(false, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  return memberContexts(modelStore.model as never, r.perCombo, modelStore.combinations);
}

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; });
afterEach(() => { uiStore.analysisMode = '3d'; });

function beam(Lb: number, q: number) {
  modelStore.clear();
  const mat = modelStore.addMaterial({ name: 'S235', e: E, nu: 0.3, rho: 78.5, fy: FY, fu: 360 } as never);
  const sec = modelStore.addSection(IPE300 as never);
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(Lb, 0, 0);
  const el = modelStore.addElement(a, b, 'frame');
  modelStore.updateElementMaterial(el, mat);
  modelStore.updateElementSection(el, sec);
  modelStore.addSupport(a, 'custom3d', undefined, { dofRestraints: { tx: true, ty: true, tz: true, rx: true, ry: false, rz: false } });
  modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { tx: false, ty: true, tz: true, rx: false, ry: false, rz: false } });
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  for (const c of [...modelStore.model.loadCases]) modelStore.removeLoadCase(c.id);
  const dead = modelStore.addLoadCase('D', 'D');
  modelStore.addDistributedLoad3D(el, 0, 0, -q, -q, undefined, undefined, dead);
  modelStore.addCombination('1.0D', [{ caseId: dead, factor: 1 }]);
  const r = modelStore.solveCombinations3D(false, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  return memberContexts(modelStore.model as never, r.perCombo, modelStore.combinations);
}

describe('steel members under other codes', () => {
  it('AISC 360: a pinned column reads P/φPn with Fcr from E3, about the weak axis', () => {
    const run = runOtherCode(AISC360, column());
    expect(run.errorKey).toBeUndefined();
    const row = run.rows[0]!;
    expect(row.status).toBe('checked');
    const rz = Math.sqrt(IPE300.iz / IPE300.a);
    const Fe = (Math.PI ** 2 * E) / (L / rz) ** 2;
    const Fcr = FY / Fe <= 2.25 ? 0.658 ** (FY / Fe) * FY : 0.877 * Fe;
    const phiPn = 0.9 * Fcr * 1e3 * IPE300.a; // kN
    if (row.status === 'checked') expect(row.reading.ratio / (P / phiPn)).toBeCloseTo(1, 3);
  });

  it('EN 1993-1-1: the same column reads NEd/Nb,Rd with χ from curve b', () => {
    const p = steelProps(IPE300 as never);
    if ('skip' in p) throw new Error('props');
    expect(ec3Curves(p)).toEqual({ y: 'a', z: 'b' });
    const run = runOtherCode(EC3, column());
    const row = run.rows[0]!;
    expect(row.status).toBe('checked');
    const iz = Math.sqrt(IPE300.iz / IPE300.a);
    // λ₁ = π√(E/fy): the 93,9ε of the code is this at E = 210 GPa, and the material here is 200 GPa.
    const lam = L / iz / (Math.PI * Math.sqrt(E / FY));
    const phi = 0.5 * (1 + 0.34 * (lam - 0.2) + lam * lam);
    const chi = 1 / (phi + Math.sqrt(phi * phi - lam * lam));
    const NbRd = chi * IPE300.a * FY * 1e3; // kN, γM1 = 1,0
    if (row.status === 'checked') expect(row.reading.ratio / (P / NbRd)).toBeCloseTo(1, 3);
  });

  it('AISC 360: an unbraced beam reads Mu/φMn with F2-4 lateral-torsional buckling, Cb = 1', () => {
    const L = 8, q = 10;
    const row = runOtherCode(AISC360, beam(L, q)).rows[0]!;
    expect(row.status).toBe('checked');
    const p = steelProps(IPE300 as never);
    if ('skip' in p) throw new Error('props');
    const Es = E * 1e6, Fy = FY * 1e6;
    const ho = IPE300.h - IPE300.tf, Cw = (IPE300.iz * ho * ho) / 4;
    const rts = Math.sqrt(Math.sqrt(IPE300.iz * Cw) / p.Sy);
    const J = steelSectionConstants(IPE300 as never).J;
    const jc = J / (p.Sy * ho);
    const Lp = 1.76 * p.rz * Math.sqrt(Es / Fy);
    const Lr = 1.95 * rts * (Es / (0.7 * Fy)) * Math.sqrt(jc + Math.sqrt(jc * jc + 6.76 * (0.7 * Fy / Es) ** 2));
    expect(L).toBeGreaterThan(Lr);
    const Fcr = (Math.PI ** 2 * Es) / (L / rts) ** 2 * Math.sqrt(1 + 0.078 * jc * (L / rts) ** 2);
    const phiMn = 0.9 * Math.min(Fcr * p.Sy, Fy * p.Zy) / 1e3; // kN·m
    expect(Lp).toBeLessThan(L);
    if (row.status === 'checked') {
      expect(row.reading.ratio / (((q * L * L) / 8) / phiMn)).toBeCloseTo(1, 3);
      expect(row.reading.unevaluated).toEqual([]);
    }
  });

  it('EN 1993-1-1: the same beam reads MEd/Mb,Rd with Mcr for C1 = 1 and χLT from curve a', () => {
    const L = 8, q = 10;
    const row = runOtherCode(EC3, beam(L, q)).rows[0]!;
    const p = steelProps(IPE300 as never);
    if ('skip' in p) throw new Error('props');
    const Es = E * 1e6, G = Es / 2.6, Fy = FY * 1e6;
    const Iw = (IPE300.iz * (IPE300.h - IPE300.tf) ** 2) / 4, It = steelSectionConstants(IPE300 as never).J;
    const Mcr = ((Math.PI ** 2 * Es * IPE300.iz) / L ** 2) * Math.sqrt(Iw / IPE300.iz + (L * L * G * It) / (Math.PI ** 2 * Es * IPE300.iz));
    const lam = Math.sqrt((p.Zy * Fy) / Mcr);
    const phi = 0.5 * (1 + 0.21 * (lam - 0.2) + lam * lam);
    const chi = Math.min(1, 1 / (phi + Math.sqrt(phi * phi - lam * lam)));
    const MbRd = (chi * p.Zy * Fy) / 1e3;
    if (row.status === 'checked') expect(row.reading.ratio / (((q * L * L) / 8) / MbRd)).toBeCloseTo(1, 3);
  });

  it('names what AISC 360 requires and the checker leaves out', () => {
    const p = steelProps({ ...IPE300, tf: 0.0055 } as never);
    if ('skip' in p) throw new Error('props');
    // b/2tf = 13,6 > 0,38·√(E/Fy) = 11,1: a noncompact flange, F3.
    expect(aiscGaps(p, FY, E).flexure).toBe(true);
    const ok = steelProps(IPE300 as never);
    if ('skip' in ok) throw new Error('props');
    expect(aiscGaps(ok, FY, E)).toEqual({ flexure: false, compression: false, shear: false });
  });

  it('classifies conservatively without the root radius, and refuses what it cannot read', () => {
    const p = steelProps(IPE300 as never);
    if ('skip' in p) throw new Error('props');
    expect(ec3Class(p, 235, false)).toBe(1);   // bending: flange 6,7 ≤ 9ε, web 39 ≤ 72ε
    expect(ec3Class(p, 235, true)).toBe(3);    // compression: web 39 > 38ε without the radius
    expect(steelProps({ ...IPE300, shape: 'L' } as never)).toEqual({ skip: 'otherCodes.skip.shapeNotCovered' });
    expect(steelProps({ ...IPE300, tw: undefined } as never)).toEqual({ skip: 'otherCodes.skip.noThickness' });
  });

  it('leaves a concrete member out, with the reason', () => {
    const ctxs = column();
    const mat = modelStore.addMaterial({ name: 'H-30', e: 30_000, nu: 0.2, rho: 25, fy: 30 } as never);
    const ctx = { ...ctxs[0]!, material: modelStore.materials.get(mat)! };
    const run = runOtherCode(AISC360, [ctx]);
    expect(run.rows[0]).toEqual({ elementId: ctx.elementId, status: 'skipped', reasonKey: 'otherCodes.skip.notSteel' });
  });
});
