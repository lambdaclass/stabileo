/**
 * Member behaviour and lifting supports, each checked against the linear model it must reduce
 * to: a slack diagonal is the frame without it, a lifted support is the beam without it, an
 * inactive member is not there, and a modified stiffness scales the deflection it controls.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { historyStore } from '../../store/history.svelte';
import '../../store';
import * as wasmSolver from '../wasm-solver';
import { validateAndSolve3D, solveCombinations3D } from '../solver-service';
import { presetModifiers, CIRSOC201_STIFFNESS } from '../member-behaviour';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});
beforeEach(() => { modelStore.clear(); historyStore.clear(); });

const md = () => ({
  nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
  loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
  quads: modelStore.quads, plates: modelStore.plates, constraints: modelStore.constraints, connectors: modelStore.connectors,
});
function solve() {
  const r = validateAndSolve3D(md() as never, false, false);
  if (!r || typeof r === 'string') throw new Error(String(r));
  return r;
}
const disp = (r: ReturnType<typeof solve>, n: number) => r.displacements.find((d) => d.nodeId === n)!;

/**
 * A braced bay in the XZ plane: two pinned columns, a beam, and both diagonals as truss bars.
 * Pushed toward +X at the top left: diagonal 5 (bottom left → top right) lengthens, in tension,
 * and diagonal 6 (bottom right → top left) shortens, in compression.
 */
function bracedBay(behaviour?: 'tensionOnly') {
  const n1 = modelStore.addNode(0, 0, 0), n2 = modelStore.addNode(4, 0, 0);
  const n3 = modelStore.addNode(0, 0, 3), n4 = modelStore.addNode(4, 0, 3);
  for (const [a, b] of [[n1, n3], [n2, n4], [n3, n4]]) modelStore.addElement(a!, b!, 'frame');
  const d5 = modelStore.addElement(n1, n4, 'truss');
  const d6 = modelStore.addElement(n2, n3, 'truss');
  for (const n of [n1, n2]) modelStore.addSupport(n, 'pinned3d' as never);
  // Hold the bay in its plane.
  for (const n of [n3, n4]) modelStore.addSupport(n, 'custom3d' as never, undefined, { dofRestraints: { tx: false, ty: true, tz: false, rx: true, ry: false, rz: true } });
  modelStore.addNodalLoad3D(n3, 50, 0, 0, 0, 0, 0, 1);
  if (behaviour) { modelStore.updateElement(d5, { behaviour }); modelStore.updateElement(d6, { behaviour }); }
  return { n3, n4, d5, d6 };
}

describe('one-way members', () => {
  it('a compressed tension-only diagonal goes slack: the bay is the bay without it', () => {
    const { n3 } = bracedBay('tensionOnly');
    const withBehaviour = disp(solve(), n3).ux;
    modelStore.clear();
    const plain = bracedBay();
    modelStore.removeElement(plain.d6);
    expect(withBehaviour).toBeCloseTo(disp(solve(), plain.n3).ux, 9);
  });

  it('a combination is solved with its own loads, not summed from its cases', () => {
    const { n3 } = bracedBay('tensionOnly');
    // The combination pushes the other way (factor −1): now diagonal 5 is the slack one.
    modelStore.model.combinations = [{ id: 1, name: 'rev', factors: [{ caseId: 1, factor: -1 }] }];
    const b = solveCombinations3D(md() as never, modelStore.model.loadCases, modelStore.model.combinations);
    if (!b || typeof b === 'string') throw new Error(String(b));
    const ux1 = b.perCase.get(1)!.displacements.find((d) => d.nodeId === n3)!.ux;
    const uxC = b.perCombo.get(1)!.displacements.find((d) => d.nodeId === n3)!.ux;
    modelStore.clear();
    const plain = bracedBay();
    modelStore.removeElement(plain.d5);
    modelStore.model.loads = [];
    modelStore.addNodalLoad3D(plain.n3, -50, 0, 0, 0, 0, 0, 1);
    const linear = disp(solve(), plain.n3).ux;
    expect(uxC).toBeCloseTo(linear, 9);
    // Superposition would have given −ux1, which it is not.
    expect(Math.abs(uxC + ux1)).toBeGreaterThan(1e-5);
  });
});

describe('inactive members', () => {
  it('are left out with their loads', () => {
    const { n3, d5 } = bracedBay();
    modelStore.addDistributedLoad3D(d5, 0, 0, -5, -5, undefined, undefined, 1);
    modelStore.updateElement(d5, { behaviour: 'inactive' });
    const inactive = disp(solve(), n3).ux;
    modelStore.clear();
    const plain = bracedBay();
    modelStore.removeElement(plain.d5);
    expect(inactive).toBeCloseTo(disp(solve(), plain.n3).ux, 9);
  });
});

describe('lifting supports', () => {
  /** A beam on three supports with an overhang loaded at its tip. */
  function overhang() {
    const ns = [0, 4, 8, 11].map((x) => modelStore.addNode(x, 0, 0));
    for (let i = 1; i < ns.length; i++) modelStore.addElement(ns[i - 1]!, ns[i]!, 'frame');
    modelStore.addSupport(ns[0]!, 'custom3d' as never, undefined, { dofRestraints: { tx: true, ty: true, tz: true, rx: true, ry: false, rz: true } });
    modelStore.addSupport(ns[1]!, 'pinned3d' as never);
    modelStore.addSupport(ns[2]!, 'pinned3d' as never);
    modelStore.addNodalLoad3D(ns[3]!, 0, 0, -80, 0, 0, 0, 1);
    return ns;
  }
  /** The node whose support pulls in the linear solve. */
  function pulling(ns: number[]) {
    const r = solve().reactions.filter((x) => ns.includes(x.nodeId)).sort((a, b) => a.fz - b.fz)[0]!;
    expect(r.fz).toBeLessThan(0);
    return r.nodeId;
  }

  it('releases where the reaction pulls, and matches the beam without that support', () => {
    let ns = overhang();
    const p = pulling(ns);
    const sup = [...modelStore.supports.values()].find((s) => s.nodeId === p)!;
    modelStore.updateSupport(sup.id, { uplift: true });
    const r = solve();
    expect(Math.abs(r.reactions.find((x) => x.nodeId === p)?.fz ?? 0)).toBeLessThan(1e-6);
    expect(disp(r, p).uz).toBeGreaterThan(0);
    const tipLifted = disp(r, ns[3]!).uz;
    modelStore.clear();
    ns = overhang();
    modelStore.removeSupport([...modelStore.supports.values()].find((s) => s.nodeId === p)!.id);
    expect(tipLifted).toBeCloseTo(disp(solve(), ns[3]!).uz, 9);
  });

  it('stays when the reaction pushes', () => {
    const ns = overhang();
    for (const s of modelStore.supports.values()) modelStore.updateSupport(s.id, { uplift: true });
    modelStore.model.loads = [];
    modelStore.addNodalLoad3D(ns[3]!, 0, 0, 10, 0, 0, 0, 1);
    modelStore.addNodalLoad3D(ns[1]!, 0, 0, -100, 0, 0, 0, 1);
    const r = solve();
    expect(Math.abs(disp(r, ns[1]!).uz)).toBeLessThan(1e-9);
  });
});

describe('stiffness modifiers', () => {
  it('a cracked beam (CIRSOC 201, 0,35 Ig) deflects 1/0,35 as much', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d' as never);
    modelStore.addNodalLoad3D(b, 0, 0, -10, 0, 0, 0, 1);
    const full = disp(solve(), b).uz;
    modelStore.updateElement(e, { stiffness: presetModifiers('beam') });
    const cracked = disp(solve(), b).uz;
    expect(CIRSOC201_STIFFNESS.beam).toBe(0.35);
    expect(cracked / full).toBeCloseTo(1 / 0.35, 6);
    // The model's section is untouched.
    expect(modelStore.sections.get(modelStore.elements.get(e)!.sectionId)!.iy).toBeDefined();
  });
});

describe('multilinear springs', () => {
  it('a bilinear vertical spring: past its first branch the node follows the second', () => {
    // 10 000 kN/m up to 100 kN at 10 mm, then 1 250 kN/m to 150 kN at 50 mm. Under 120 kN:
    // 10 mm + 20 kN / 1 250 kN/m = 26 mm.
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 0), c = modelStore.addNode(0, 3, 0);
    modelStore.addElement(a, b, 'truss'); modelStore.addElement(a, c, 'truss');
    modelStore.addSupport(b, 'fixed3d' as never);
    modelStore.addSupport(c, 'fixed3d' as never);
    const s = modelStore.addSupport(a, 'custom3d' as never, undefined, { dofRestraints: { tx: false, ty: false, tz: false, rx: false, ry: false, rz: false } });
    modelStore.updateSupport(s, { curves: { z: [[0.01, 100], [0.05, 150]] } });
    modelStore.addNodalLoad3D(a, 0, 0, -120, 0, 0, 0, 1);
    expect(disp(solve(), a).uz).toBeCloseTo(-0.026, 4);
  });
});

describe('semi-rigid ends', () => {
  it('a cantilever on a rotational spring: δ = P·L³/(3EI) + P·L²/kθ', () => {
    const E = 200_000, L = 3, P = 10, k = 5000;
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d' as never);
    modelStore.addNodalLoad3D(b, 0, 0, -P, 0, 0, 0, 1);
    const sec = modelStore.sections.get(modelStore.elements.get(e)!.sectionId)!;
    const mat = modelStore.materials.get(modelStore.elements.get(e)!.materialId)!;
    const rigid = -disp(solve(), b).uz;
    modelStore.updateElement(e, { semiRigid: { i: { ky: k, kz: k } } });
    const semi = -disp(solve(), b).uz;
    // What the spring adds is the base rotation P·L/kθ carried to the tip.
    expect(semi - rigid).toBeCloseTo((P * L * L) / k, 6);
    void E; void sec; void mat;
  });
});
