/**
 * Loads read as written, against closed forms: self-weight as a member load in its own case
 * (wL²/8, wL²/12), a distributed load along the global axes or per metre of projection, an axial
 * member load, and a transverse load on a truss taken by its end nodes.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import '../../store/index';
import { initSolver } from '../wasm-solver';
import type { AnalysisResults3D } from '../types-3d';
import { t } from '../../i18n';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); });

const solve = (selfWeight = false): AnalysisResults3D => {
  const r = modelStore.solve3D(selfWeight, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  return r;
};
const perCase = (): Map<number, AnalysisResults3D> => {
  const r = modelStore.solveCombinations3D(false, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  return r.perCase;
};
const forces = (r: AnalysisResults3D, id: number) => r.elementForces.find((f) => f.elementId === id)!;
const sumFz = (r: AnalysisResults3D) => r.reactions.reduce((s, x) => s + x.fz, 0);
const pin = { tx: true, ty: true, tz: true, rx: true, ry: false, rz: false };
const roller = { tx: false, ty: true, tz: true, rx: false, ry: false, rz: false };

/** A simply supported or fixed-fixed beam along X, one member, section 0.02 m², ρ 78.5 kN/m³. */
function beam(L: number, ends: 'simple' | 'fixed') {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
  const sec = modelStore.addSection({ name: 'R', a: 0.02, iy: 2e-4, iz: 1e-4, j: 1e-4 } as never);
  const e = modelStore.addElement(a, b, 'frame');
  modelStore.updateElementSection(e, sec);
  if (ends === 'fixed') { modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(b, 'fixed3d'); }
  else {
    modelStore.addSupport(a, 'custom3d', undefined, { dofRestraints: pin });
    modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: roller });
  }
  const rho = [...modelStore.materials.values()][0]!.rho;
  return { a, b, e, w: rho * 0.02 };
}

describe('self-weight as a member load', () => {
  it('a simply supported beam: wL²/8 at midspan and wL/2 at each support', () => {
    const L = 6;
    const { e, w } = beam(L, 'simple');
    modelStore.setAnalysis({ selfWeight: [{ caseId: 1, direction: 'Z', factor: -1 }] });
    const r = solve();
    const f = forces(r, e);
    // The member is one element, so its midspan moment is the end moment plus wL²/8: zero at
    // simple ends, and the diagram's own reading of the member load.
    expect(Math.abs(f.myStart)).toBeLessThan(1e-9);
    expect(sumFz(r)).toBeCloseTo(w * L, 9);
    expect(Math.abs(f.vzStart)).toBeCloseTo(w * L / 2, 9);
    // Statics of the half span: the end shear's moment less the half load's.
    const mid = Math.abs(f.vzStart) * (L / 2) - w * (L / 2) * (L / 4);
    expect(mid).toBeCloseTo((w * L * L) / 8, 9);
    // And the member diagram carries it, which lumped end weights never gave it.
    const d = (f as unknown as { distributedLoadsZ?: Array<{ qI: number; qJ: number }> }).distributedLoadsZ;
    expect(d?.some((q) => Math.abs(q.qI + w) < 1e-9 || Math.abs(q.qI - w) < 1e-9)).toBe(true);
  });

  it('a fixed-fixed beam: wL²/12 at the ends', () => {
    const L = 5;
    const { e, w } = beam(L, 'fixed');
    modelStore.setAnalysis({ selfWeight: [{ caseId: 1, direction: 'Z', factor: -1 }] });
    const f = forces(solve(), e);
    expect(Math.abs(f.myStart)).toBeCloseTo((w * L * L) / 12, 9);
    expect(Math.abs(f.myEnd)).toBeCloseTo((w * L * L) / 12, 9);
  });

  it('only in its own case, with its factor, direction and group', () => {
    const L = 4;
    const { e, w } = beam(L, 'fixed');
    const live = modelStore.addLoadCase('L', 'L');
    const other = modelStore.addLoadCase('D2', 'D');
    const g = modelStore.addGroup('Vigas', 'selection', { elements: [e] });
    modelStore.setAnalysis({ selfWeight: [{ caseId: live, direction: 'Y', factor: 0.5, groupId: g }] });
    modelStore.addNodalLoad3D(1, 0, 0, -1, 0, 0, 0, 1);
    modelStore.addNodalLoad3D(1, 0, 0, -1, 0, 0, 0, other);
    const cases = perCase();
    const fy = (id: number) => cases.get(id)!.reactions.reduce((s, x) => s + x.fy, 0);
    // Two dead-load cases, and neither takes the self-weight: it lives in the case named.
    expect(fy(1)).toBeCloseTo(0, 9);
    expect(fy(other)).toBeCloseTo(0, 9);
    expect(fy(live)).toBeCloseTo(-0.5 * w * L, 9);
  });

  it('a project that states none keeps the older rule: the whole model in every dead-load case', () => {
    const L = 4;
    const { w } = beam(L, 'fixed');
    const other = modelStore.addLoadCase('D2', 'D');
    modelStore.addNodalLoad3D(1, 0, 0, -1, 0, 0, 0, other);
    modelStore.addNodalLoad3D(1, 0, 0, -1, 0, 0, 0, 1);
    const r = modelStore.solveCombinations3D(true, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    expect(sumFz(r.perCase.get(other)!)).toBeCloseTo(w * L + 1, 9);
    expect(sumFz(r.perCase.get(1)!)).toBeCloseTo(w * L + 1, 9);
  });
});

describe('distributed loads on the global axes, projected and axial', () => {
  /** A rafter rising 3 in 4 (a 3-4-5 triangle), pinned at the foot and on a roller at the head. */
  function rafter() {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 3);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'custom3d', undefined, { dofRestraints: pin });
    modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { ...roller, tx: false, ty: true, tz: true } });
    return { a, b, e };
  }

  it('global Z per metre of member takes q·L; projected takes q·L·cos θ, the plan length', () => {
    const { e } = rafter();
    const id = modelStore.addDistributedLoad3D(e, 0, 0, -2, -2, undefined, undefined, 1, { frame: 'global' });
    expect(sumFz(solve())).toBeCloseTo(2 * 5, 9);
    modelStore.updateLoad(id, { frame: 'projected' });
    expect(sumFz(solve())).toBeCloseTo(2 * 4, 9);
  });

  it('an axial load along a column reaches its base as q·L', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
    modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    // Local x runs from I (the base) up to J: a negative qx pushes down along the column.
    modelStore.addDistributedLoad3D(1, 0, 0, 0, 0, undefined, undefined, 1, { qXI: -4, qXJ: -4 });
    expect(sumFz(solve())).toBeCloseTo(12, 9);
  });
});

describe('a transverse load on a truss', () => {
  it('reaches the nodes as simply supported reactions, and a pin-ended frame gives the same', () => {
    const build = (type: 'truss' | 'frame') => {
      modelStore.clear();
      const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0);
      const e = modelStore.addElement(a, b, type);
      if (type === 'frame') modelStore.updateElement(e, { releaseI: { my: true, mz: true, t: false }, releaseJ: { my: true, mz: true, t: false } } as never);
      modelStore.addSupport(a, 'custom3d', undefined, { dofRestraints: { tx: true, ty: true, tz: true, rx: true, ry: true, rz: true } });
      modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { tx: false, ty: true, tz: true, rx: false, ry: false, rz: false } });
      modelStore.addDistributedLoad3D(e, 0, 0, -3, -3, undefined, undefined, 1);
      modelStore.addPointLoadOnElement3D(e, 1, 0, -2, 1);
      return solve();
    };
    const truss = build('truss');
    const frame = build('frame');
    const rz = (r: AnalysisResults3D, n: number) => r.reactions.find((x) => x.nodeId === n)!.fz;
    expect(sumFz(truss)).toBeCloseTo(3 * 4 + 2, 9);
    for (const n of [1, 2]) expect(rz(truss, n)).toBeCloseTo(rz(frame, n), 9);
    // Left: half the uniform load and three quarters of the point load.
    expect(rz(truss, 1)).toBeCloseTo(6 + 1.5, 9);
    const t = forces(truss, 1);
    expect(Math.abs(t.myStart) + Math.abs(t.myEnd)).toBe(0);
  });
});

describe('P-Delta per combination', () => {
  it('a combination takes the second-order moment; its case stays linear', () => {
    // A 4 m cantilever column, 60 kN down and 0.12 kN across the weak axis at the head.
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 4);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addNodalLoad3D(b, 0, 0.12, -60, 0, 0, 0, 1);
    const combo = modelStore.addCombination('1.0 D', [{ caseId: 1, factor: 1 }]);
    modelStore.setAnalysis({ perCombination: 'pdelta' });
    const r = modelStore.solveCombinations3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    const sec = [...modelStore.sections.values()][0]!, E = [...modelStore.materials.values()][0]!.e * 1000;
    const k = Math.sqrt(60 / (E * sec.iz));
    const exact = (0.12 * Math.tan(k * 4)) / k;
    const m = (x: AnalysisResults3D) => Math.max(Math.abs(forces(x, e).myStart), Math.abs(forces(x, e).mzStart));
    expect(Math.abs(m(r.perCombo.get(combo)!) - exact) / exact).toBeLessThan(0.01);
    expect(m(r.perCase.get(1)!)).toBeCloseTo(0.12 * 4, 9);
    expect(r.perCombo.get(combo)!.secondOrder).toMatchObject({ stable: true });
  });

  it('a combination past the critical load publishes no forces and is listed', () => {
    // The same column: 60 kN is under its weak-axis critical load, three times that is past it.
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 4);
    modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addNodalLoad3D(b, 0, 0.12, -60, 0, 0, 0, 1);
    const under = modelStore.addCombination('1.0 D', [{ caseId: 1, factor: 1 }]);
    const past = modelStore.addCombination('3.0 D', [{ caseId: 1, factor: 3 }]);
    modelStore.setAnalysis({ perCombination: 'pdelta' });
    const r = modelStore.solveCombinations3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    expect(r.perCombo.has(under)).toBe(true);
    expect(r.perCombo.has(past)).toBe(false);
    expect(r.unstable).toEqual([past]);
  });

  it('the envelope carries the shells of its second-order combinations', () => {
    // A wall panel of 2 × 2 quads, held along its foot, pressed down along its head.
    const n: number[][] = [];
    for (let i = 0; i <= 2; i++) { n.push([]); for (let k = 0; k <= 2; k++) n[i]!.push(modelStore.addNode(i, 0, k)); }
    const mat = [...modelStore.materials.keys()][0]!;
    for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) modelStore.addQuad([n[i]![k]!, n[i + 1]![k]!, n[i + 1]![k + 1]!, n[i]![k + 1]!], mat, 0.2);
    for (let i = 0; i <= 2; i++) modelStore.addSupport(n[i]![0]!, 'fixed3d');
    for (let i = 0; i <= 2; i++) modelStore.addNodalLoad3D(n[i]![2]!, 0.5, 0, -20, 0, 0, 0, 1);
    modelStore.addCombination('1.2 D', [{ caseId: 1, factor: 1.2 }]);
    modelStore.addCombination('1.4 D', [{ caseId: 1, factor: 1.4 }]);
    modelStore.setAnalysis({ perCombination: 'pdelta' });
    const r = modelStore.solveCombinations3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    const env = r.envelope.maxAbsResults3D!.quadStresses!;
    expect(env).toHaveLength(4);
    // Each element's envelope is its governing combination's: the larger factor here.
    const c14 = [...r.perCombo.values()].reduce((a, b) => (b.quadStresses![0]!.vonMises > a.quadStresses![0]!.vonMises ? b : a));
    for (const q of env) expect(q.vonMises).toBe(c14.quadStresses!.find((x) => x.elementId === q.elementId)!.vonMises);
  });

  it('with every combination past it, the solve says so', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 4);
    modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addNodalLoad3D(b, 0, 0.12, -180, 0, 0, 0, 1);
    modelStore.addCombination('1.0 D', [{ caseId: 1, factor: 1 }]);
    modelStore.setAnalysis({ perCombination: 'pdelta' });
    expect(modelStore.solveCombinations3D(false, false, true)).toBe(t('svc.pdeltaNoneStable'));
  });
});

describe('P-Delta per combination, through the entry PRO\'s Solve takes', () => {
  /*
   * PRO's Solve, live calc and the phone shell go through the parallel entry. It used to skip
   * `perCombination`, so the same project gave second-order results from one button and linear
   * ones from another.
   */
  it('the parallel solve takes the second-order moment and lists what has no equilibrium', async () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 4);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addNodalLoad3D(b, 0, 0.12, -60, 0, 0, 0, 1);
    const under = modelStore.addCombination('1.0 D', [{ caseId: 1, factor: 1 }]);
    const past = modelStore.addCombination('3.0 D', [{ caseId: 1, factor: 3 }]);
    modelStore.setAnalysis({ perCombination: 'pdelta' });
    const sync = modelStore.solveCombinations3D(false, false, true);
    const par = await modelStore.solveCombinations3DParallel(false, false, true);
    if (!sync || typeof sync === 'string' || !par || typeof par === 'string') throw new Error('no solve');
    const m = (x: AnalysisResults3D) => Math.max(Math.abs(forces(x, e).myStart), Math.abs(forces(x, e).mzStart));
    expect(par.perCombo.get(under)!.secondOrder).toMatchObject({ stable: true });
    expect(m(par.perCombo.get(under)!)).toBeCloseTo(m(sync.perCombo.get(under)!), 9);
    expect(m(par.perCombo.get(under)!)).toBeGreaterThan(0.12 * 4 * 1.005);
    expect(par.perCombo.has(past)).toBe(false);
    expect(par.unstable).toEqual([past]);
  });
});

describe('the self-weight rule follows the model', () => {
  it('deleting its case deletes its rows, and the single solve no longer counts them', () => {
    const { a } = beam(6, 'simple');
    const pp = modelStore.addLoadCase('PP', 'D');
    modelStore.setAnalysis({ selfWeight: [{ caseId: pp, direction: 'Z', factor: -1 }] });
    modelStore.addNodalLoad3D(a, 0, 0, -10, 0, 0, 0, 1);
    modelStore.removeLoadCase(pp);
    expect(modelStore.analysis?.selfWeight).toEqual([]);
    expect(sumFz(solve())).toBeCloseTo(10, 9);
  });

  it('a member listed by id: split, its segments are listed; deleted, it leaves the list', () => {
    const { e, w } = beam(6, 'simple');
    modelStore.setAnalysis({ selfWeight: [{ caseId: 1, direction: 'Z', factor: -1, elements: [e] }] });
    const r = modelStore.splitElementAtPoint(e, 0.5);
    if (!r) throw new Error('no split');
    expect([...modelStore.analysis!.selfWeight![0]!.elements!].sort()).toEqual([r.elemA, r.elemB].sort());
    expect(sumFz(solve())).toBeCloseTo(w * 6, 9);
    modelStore.removeElement(r.elemB);
    expect(modelStore.analysis!.selfWeight![0]!.elements).toEqual([r.elemA]);
  });
});

describe('cases and combinations that share a name', () => {
  it('solve in one multi-case pass, each under its own id', () => {
    const { a } = beam(6, 'simple');
    const c1 = modelStore.addLoadCase('CRANE', 'L'), c2 = modelStore.addLoadCase('CRANE', 'L');
    modelStore.addNodalLoad3D(a, 0, 0, -10, 0, 0, 0, c1);
    modelStore.addNodalLoad3D(a, 0, 0, -20, 0, 0, 0, c2);
    const k1 = modelStore.addCombination('U', [{ caseId: c1, factor: 1 }]);
    const k2 = modelStore.addCombination('U', [{ caseId: c2, factor: 1 }]);
    const warned: string[] = [];
    const orig = console.warn;
    console.warn = (...args: unknown[]) => { warned.push(args.map(String).join(' ')); };
    try {
      const r = modelStore.solveCombinations3D(false, false, true);
      if (!r || typeof r === 'string') throw new Error(String(r));
      expect(sumFz(r.perCase.get(c1)!)).toBeCloseTo(10, 9);
      expect(sumFz(r.perCase.get(c2)!)).toBeCloseTo(20, 9);
      expect(sumFz(r.perCombo.get(k1)!)).toBeCloseTo(10, 9);
      expect(sumFz(r.perCombo.get(k2)!)).toBeCloseTo(20, 9);
    } finally { console.warn = orig; }
    expect(warned.filter((w) => /Multi-case 3D failed/.test(w))).toEqual([]);
  });
});

describe('shear deformation, for the whole analysis', () => {
  it('off: no member carries shear areas to the engine, and a short cantilever reads PL³/3EI', () => {
    // A 1 m cantilever, deep enough that shear adds to its tip deflection.
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(1, 0, 0);
    const sec = modelStore.addSection({ name: 'R', a: 0.06, iy: 0.06 * 0.3 ** 2 / 12, iz: 0.2 * 0.3 ** 3 / 12 / 3, j: 1e-4, shearAreas: { basis: 'declared', asY: 0.05, asZ: 0.05 } } as never);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.updateElementSection(e, sec);
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addNodalLoad3D(b, 0, 0, -10, 0, 0, 0, 1);
    const tip = () => Math.abs(solve().displacements.find((d) => d.nodeId === b)!.uz);
    const withShear = tip();
    modelStore.setAnalysis({ shearDeformation: 'none' });
    const input = modelStore.buildSolverInput3D(false, false);
    for (const s of input!.sections.values()) { expect((s as { asY?: number }).asY).toBeUndefined(); expect((s as { asZ?: number }).asZ).toBeUndefined(); }
    const E = [...modelStore.materials.values()][0]!.e * 1000, I = modelStore.sections.get(sec)!.iy!;
    const bending = (10 * 1 ** 3) / (3 * E * I);
    expect(tip() / bending).toBeCloseTo(1, 6);
    expect(withShear).toBeGreaterThan(bending * 1.001);
  });
});
