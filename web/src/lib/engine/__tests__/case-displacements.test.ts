/**
 * A displacement imposed by a load case: scaled with the case in a combination, added to the case's
 * forces, refused where no support restrains it.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import '../../store/index';
import { initSolver } from '../wasm-solver';
import { evaluateDiagramAt } from '../diagrams-3d';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); });

const L = 5, DZ = -0.01;

/** A beam fixed at both ends, along X; case 1 settles end J by DZ, case 2 loads it. */
function setup() {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
  const e = modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(b, 'fixed3d');
  const [c1, c2] = modelStore.model.loadCases;
  modelStore.addLoadEntry({ type: 'displacement3d', data: { id: 0, nodeId: b, dz: DZ, caseId: c1!.id } });
  modelStore.addDistributedLoad3D(e, 0, 0, -10, -10, undefined, undefined, c2!.id);
  const sec = [...modelStore.sections.values()][0]!, mat = [...modelStore.materials.values()][0]!;
  const EI = mat.e * 1000 * sec.iy!;
  return { a, b, e, c1: c1!.id, c2: c2!.id, EI };
}

describe('displacements imposed by a load case', () => {
  it('the case alone: the fixed-end moment of a settlement, 6·E·I·Δ/L²', () => {
    const { e, c1, c2, EI } = setup();
    const cid = modelStore.addCombination('1.5 A + B', [{ caseId: c1, factor: 1.5 }, { caseId: c2, factor: 1 }]);
    const r = modelStore.solveCombinations3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    const m = (res: typeof r.perCombo extends Map<number, infer R> ? R : never) => res.elementForces.find((f) => f.elementId === e)!;
    const settle = Math.abs(evaluateDiagramAt(m(r.perCase.get(c1)!), 'momentY', 0));
    // Bernoulli's value; the engine's shear deformation softens it by a fraction of a percent.
    expect(Math.abs(settle / ((6 * EI * Math.abs(DZ)) / (L * L)) - 1)).toBeLessThan(0.005);
    // The combination: 1,5 times the settlement's, plus the load's; the case of loads has none of it.
    const load = evaluateDiagramAt(m(r.perCase.get(c2)!), 'momentY', 0);
    const combo = evaluateDiagramAt(m(r.perCombo.get(cid)!), 'momentY', 0);
    const settleSigned = evaluateDiagramAt(m(r.perCase.get(c1)!), 'momentY', 0);
    expect(combo).toBeCloseTo(1.5 * settleSigned + load, 4);
    // The imposed node moved by 1,5 Δ in the combination.
    const uz = r.perCombo.get(cid)!.displacements.find((d) => d.nodeId === 2)!.uz;
    expect(uz).toBeCloseTo(1.5 * DZ, 9);
  });

  it('a single solve applies it with every load', () => {
    const { b } = setup();
    const r = modelStore.solve3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    expect(r.displacements.find((d) => d.nodeId === b)!.uz).toBeCloseTo(DZ, 9);
  });

  it('P-Delta per combination takes it times its factor too', () => {
    const { b, c1, c2 } = setup();
    modelStore.model.analysis = { ...(modelStore.model.analysis ?? {}), perCombination: 'pdelta' } as never;
    const cid = modelStore.addCombination('2 A + B', [{ caseId: c1, factor: 2 }, { caseId: c2, factor: 1 }]);
    const r = modelStore.solveCombinations3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    expect(r.perCombo.get(cid)!.displacements.find((d) => d.nodeId === b)!.uz).toBeCloseTo(2 * DZ, 9);
  });

  it('refused, by node, where nothing restrains the direction', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
    modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addLoadEntry({ type: 'displacement3d', data: { id: 0, nodeId: b, dz: DZ } });
    const r = modelStore.solve3D(false, false, true);
    expect(typeof r).toBe('string');
    expect(String(r)).toContain(String(b));
  });
});

/*
 * PRO's Solve takes the parallel entry whenever a combination exists (`live-calc.ts`); the workers
 * are absent under the tests, so it runs its fallback, which went to the linear core without the
 * displacements as well.
 */
describe('the parallel entry, as Solve calls it', () => {
  it('the case holds the settlement moment and the combination 1,5 times the displacement', async () => {
    const { e, b, c1, c2, EI } = setup();
    const cid = modelStore.addCombination('1.5 A + B', [{ caseId: c1, factor: 1.5 }, { caseId: c2, factor: 1 }]);
    const sync = modelStore.solveCombinations3D(false, false, true);
    const r = await modelStore.solveCombinations3DParallel(false, false, true);
    if (!r || typeof r === 'string' || !sync || typeof sync === 'string') throw new Error(String(r));
    const at0 = (res: typeof r.perCombo extends Map<number, infer R> ? R : never) => evaluateDiagramAt(res.elementForces.find((f) => f.elementId === e)!, 'momentY', 0);
    expect(Math.abs(Math.abs(at0(r.perCase.get(c1)!)) / ((6 * EI * Math.abs(DZ)) / (L * L)) - 1)).toBeLessThan(0.005);
    expect(r.perCombo.get(cid)!.displacements.find((d) => d.nodeId === b)!.uz).toBeCloseTo(1.5 * DZ, 9);
    // The case moves the node by Δ, so "All loads", the sum of the cases, does too.
    expect(r.perCase.get(c1)!.displacements.find((d) => d.nodeId === b)!.uz).toBeCloseTo(DZ, 9);
    // The two entries agree.
    expect(at0(r.perCombo.get(cid)!)).toBeCloseTo(at0(sync.perCombo.get(cid)!), 6);
  });

  it('refuses one where nothing restrains the direction, by node', async () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
    modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addLoadEntry({ type: 'displacement3d', data: { id: 0, nodeId: b, dz: DZ } });
    modelStore.addCombination('1.0 A', [{ caseId: modelStore.model.loadCases[0]!.id, factor: 1 }]);
    const r = await modelStore.solveCombinations3DParallel(false, false, true);
    expect(typeof r).toBe('string');
    expect(String(r)).toContain(`${b} (dz)`);
  });

  it('a moment on a truss member is refused by name, as the sequential solve refuses it', async () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0), c = modelStore.addNode(L / 2, 0, 2);
    const t = modelStore.addElement(a, b, 'truss');
    modelStore.addElement(a, c, 'truss'); modelStore.addElement(c, b, 'truss');
    modelStore.addSupport(a, 'pinned3d'); modelStore.addSupport(b, 'pinned3d'); modelStore.addSupport(c, 'pinned3d');
    modelStore.addLoadEntry({ type: 'pointOnElement3d', data: { id: 0, elementId: t, a: 1, py: 0, pz: 0, my: 5 } });
    modelStore.addCombination('1.0 A', [{ caseId: modelStore.model.loadCases[0]!.id, factor: 1 }]);
    const sync = modelStore.solveCombinations3D(false, false, true);
    const r = await modelStore.solveCombinations3DParallel(false, false, true);
    expect(typeof sync).toBe('string');
    expect(r).toBe(sync);
  });
});
