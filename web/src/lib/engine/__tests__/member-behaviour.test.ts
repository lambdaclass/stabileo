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
import { buildSolverInput3D, validateAndSolve3D, solveCombinations3D, scaleSolverLoad } from '../solver-service';
import { SETTLEMENT_CASE_ID } from '../settlement-case';
import { presetModifiers, CIRSOC201_STIFFNESS, solveNonlinear3D } from '../member-behaviour';
import { modelHasJoints3D } from '../expand-joints-3d';
import { t } from '../../i18n';

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

describe('loose nodes', () => {
  /*
   * One click in empty space with the node tool left a node nothing holds. Its free degrees of
   * freedom made the stiffness matrix singular, so every solve failed and no result could be
   * shown until the node was found and deleted.
   */
  it('a node nothing holds is left out of the solve, with its support', () => {
    const { n3 } = bracedBay();
    const plain = disp(solve(), n3).ux;
    const bare = modelStore.addNode(9, 0, 9);
    const supported = modelStore.addNode(12, 0, 0);
    modelStore.addSupport(supported, 'pinned3d' as never);
    const r = solve();
    expect(disp(r, n3).ux).toBeCloseTo(plain, 9);
    expect(r.displacements.some((d) => [bare, supported].includes(d.nodeId))).toBe(false);
  });

  it('a loose node that carries a load still stops the solve and is named', () => {
    bracedBay();
    const loaded = modelStore.addNode(15, 0, 3);
    modelStore.addNodalLoad3D(loaded, 10, 0, 0, 0, 0, 0, 1);
    const r = validateAndSolve3D(md() as never, false, false);
    expect(r).toBe(t('svc.disconnectedNode').replace('{n}', String(loaded)));
  });

  it('combinations solve too', () => {
    bracedBay();
    modelStore.addNode(9, 0, 9);
    modelStore.model.combinations = [{ id: 1, name: 'c', factors: [{ caseId: 1, factor: 1.2 }] }];
    const b = solveCombinations3D(md() as never, modelStore.model.loadCases, modelStore.model.combinations);
    expect(typeof b === 'object' && b !== null && b.perCombo.has(1)).toBe(true);
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
    expect(r.reactions.every((r) => r.fz > -1e-6)).toBe(true);
    expect(r.reactions.reduce((s, r) => s + r.fz, 0)).toBeCloseTo(90, 6);
    expect(disp(r, ns[2]!).uz).toBeGreaterThan(0);
  });

  it('still releases a pulling support when another support has a multilinear spring', () => {
    const ns = overhang();
    const p = pulling(ns);
    const sup = [...modelStore.supports.values()].find((s) => s.nodeId === p)!;
    modelStore.updateSupport(sup.id, { uplift: true });
    const first = [...modelStore.supports.values()].find((s) => s.nodeId === ns[0])!;
    modelStore.updateSupport(first.id, { dofRestraints: { ...first.dofRestraints!, tx: false }, curves: { x: [[0.01, 100], [0.05, 150]] } });
    const r = solve();
    expect(disp(r, p).uz).toBeGreaterThan(0);
    expect(Math.abs(r.reactions.find((r) => r.nodeId === p)?.fz ?? 0)).toBeLessThan(1e-6);
    expect(r.reactions.reduce((s, r) => s + r.fz, 0)).toBeCloseTo(80, 5);
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
  function springModel(load: number, points: Array<[number, number]>) {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 0), c = modelStore.addNode(0, 3, 0);
    modelStore.addElement(a, b, 'truss'); modelStore.addElement(a, c, 'truss');
    modelStore.addSupport(b, 'fixed3d'); modelStore.addSupport(c, 'fixed3d');
    const s = modelStore.addSupport(a, 'custom3d', undefined, { dofRestraints: { tx: false, ty: false, tz: false, rx: false, ry: false, rz: false } });
    modelStore.updateSupport(s, { curves: { z: points } });
    modelStore.addNodalLoad3D(a, 0, 0, load, 0, 0, 0, 1);
    return a;
  }

  it('refuses an overloaded plateau spring instead of publishing the last iteration', () => {
    springModel(-120, [[0.01, 100], [0.05, 100]]);
    const r = validateAndSolve3D(md());
    expect(typeof r).toBe('string');
    expect(r).toContain('did not converge');
  });

  it('refuses a combination that exceeds the spring capacity even when its case converges', () => {
    springModel(-80, [[0.01, 100], [0.05, 100]]);
    const r = solveCombinations3D(md(), modelStore.model.loadCases, [{ id: 1, name: 'Overload', factors: [{ caseId: 1, factor: 1.5 }] }]);
    expect(typeof r).toBe('string');
    expect(r).toContain('did not converge');
  });

  it.each([-120, 120])('recovers spring reactions in equilibrium with %s kN', (load) => {
    const node = springModel(load, [[0.01, 100], [0.05, 150]]);
    const r = solve();
    expect(disp(r, node).uz).toBeCloseTo(Math.sign(load) * 0.026, 4);
    expect(r.reactions.reduce((s, x) => s + x.fz, 0)).toBeCloseTo(-load, 5);
    const b = solveCombinations3D(md(), modelStore.model.loadCases, [{ id: 1, name: 'Service', factors: [{ caseId: 1, factor: 1 }] }]);
    if (!b || typeof b === 'string') throw new Error(String(b));
    expect(b.perCombo.get(1)!.reactions.reduce((s, x) => s + x.fz, 0)).toBeCloseTo(-load, 5);
  });

  it('keeps ordinary support reactions as well as curved spring reactions', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 0);
    modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    const s = modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { tx: false, ty: false, tz: false, rx: false, ry: false, rz: false } });
    modelStore.updateSupport(s, { curves: { z: [[0.01, 100], [0.05, 150]] } });
    modelStore.addNodalLoad3D(b, 0, 0, -120, 0, 0, 0, 1);
    const r = solve();
    expect(r.reactions.find((r) => r.nodeId === a)!.fz).toBeGreaterThan(0);
    expect(r.reactions.find((r) => r.nodeId === b)!.fz).toBeGreaterThan(0);
    expect(r.reactions.reduce((s, x) => s + x.fz, 0)).toBeCloseTo(120, 5);
  });

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

function loadedCantilever() {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 0);
  const e = modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, 'fixed3d');
  modelStore.addNodalLoad3D(b, 0, 0, 10, 0, 0, 0, 1);
  return { a, b, e };
}
const freeDofs = { tx: false, ty: false, tz: false, rx: false, ry: false, rz: false };

describe('inclined lifting supports', () => {
  it.each([[0, 0, 1], [1, 0, 1], [-1, 0, -1]])('releases a pulling normal (%s, %s, %s)', (nx, ny, nz) => {
    const { b } = loadedCantilever();
    const free = disp(solve(), b);
    const s = modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: freeDofs });
    modelStore.updateSupport(s, { isInclined: true, normalX: nx, normalY: ny, normalZ: nz, uplift: true });
    const r = solveNonlinear3D(md(), buildSolverInput3D(md())!);
    expect(r.report).toMatchObject({ converged: true, lifted: [b] });
    expect(disp(r.results, b).uz).toBeCloseTo(free.uz, 8);
    expect(disp(r.results, b).ux).toBeCloseTo(free.ux, 8);
    expect(r.results.reactions.find((r) => r.nodeId === b)?.fz ?? 0).toBeCloseTo(0, 6);
    const combo = solveCombinations3D(md(), modelStore.model.loadCases, [{id: 1, name: 'Uplift', factors: [{caseId: 1, factor: 1}]}]);
    if (!combo || typeof combo === 'string') throw new Error(String(combo));
    expect(disp(combo.perCombo.get(1)!, b).uz).toBeCloseTo(free.uz, 8);
    modelStore.model.loads = [];
    modelStore.addNodalLoad3D(b, 0, 0, -10, 0, 0, 0, 1);
    const bearing = solveNonlinear3D(md(), buildSolverInput3D(md())!);
    expect(bearing.report.lifted).toEqual([]);
    expect(bearing.results.reactions.find((r) => r.nodeId === b)!.fz).toBeGreaterThan(0);
  });

  it('refuses an ambiguous mixed inclined restraint', () => {
    const { b } = loadedCantilever();
    const s = modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { ...freeDofs, tx: true } });
    modelStore.updateSupport(s, { isInclined: true, normalX: 1, normalY: 0, normalZ: 1, uplift: true });
    expect(validateAndSolve3D(md())).toContain('cannot also have translational restraints');
  });
});

describe('fixed DOFs with stored spring curves', () => {
  it('fixity takes precedence, freeing the DOF restores the curve', () => {
    const { b } = loadedCantilever();
    const s = modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: freeDofs });
    const curves = { z: [[0.01, 100], [0.05, 150]] as Array<[number, number]> };
    modelStore.updateSupport(s, { curves });
    const spring = disp(solve(), b).uz;
    expect(spring).toBeGreaterThan(0);
    modelStore.updateSupport(s, { dofRestraints: { ...freeDofs, tz: true } });
    expect(disp(solve(), b).uz).toBeCloseTo(0, 10);
    expect(modelStore.supports.get(s)!.curves).toEqual(curves);
    modelStore.updateSupport(s, { dofRestraints: freeDofs });
    expect(disp(solve(), b).uz).toBeCloseTo(spring, 10);
  });
});

describe('semi-rigid limits and analysis guards', () => {
  it('zero stiffness releases rotation and exposes a cantilever mechanism', () => {
    const { e } = loadedCantilever();
    modelStore.updateElement(e, { semiRigid: { i: { ky: 0, kz: 5000 } } });
    const input = buildSolverInput3D(md())!;
    expect([...input.connectors!.values()][0]!.kBendZ).toBe(0);
    const result = validateAndSolve3D(md());
    // The constrained solver may return its failed equilibrium diagnostics instead of an
    // error string for a mechanism. It must not return the former stable fixed-end answer.
    expect(result).not.toBeNull();
    if (typeof result !== 'string') expect(result).toHaveProperty('equilibrium.equilibriumOk', false);
  });

  it('zero stiffness on a stable beam matches an explicit end release', () => {
    const { b, e } = loadedCantilever();
    modelStore.model.loads = [];
    modelStore.addSupport(b, 'pinned3d');
    modelStore.addDistributedLoad3D(e, 0, 0, -10, -10, undefined, undefined, 1);
    modelStore.updateElement(e, { semiRigid: { i: { ky: 0, kz: 5000 } } });
    const semi = solve();
    modelStore.updateElement(e, { semiRigid: undefined });
    modelStore.setElementJoint(e, 'i', [false, false, false, false, true, false]);
    const released = solve();
    for (const r of released.reactions) expect(semi.reactions.find((s) => s.nodeId === r.nodeId)!.fz).toBeCloseTo(r.fz, 6);
  });

  it.each(['i', 'j'] as const)('the advanced guard recognises a semi-rigid %s end', (end) => {
    const { e } = loadedCantilever();
    expect(modelStore.hasJoint3D()).toBe(false);
    modelStore.updateElement(e, { semiRigid: { [end]: { ky: 50, kz: 50 } } });
    expect(modelStore.hasJoint3D()).toBe(true);
    expect(modelHasJoints3D(modelStore.elements.values())).toBe(true);
    modelStore.updateElement(e, { semiRigid: undefined });
    expect(modelStore.hasJoint3D()).toBe(false);
  });
});

describe('factored loads in the nonlinear combinations', () => {
  it('scale the temperature of a quad, not its material coefficient', () => {
    const l = { type: 'quadThermal', data: { elementId: 7, dtUniform: 10, dtGradient: 4, alpha: 1.2e-5 } } as never;
    expect((scaleSolverLoad(l, 1.2) as unknown as { data: Record<string, number> }).data).toEqual({ elementId: 7, dtUniform: 12, dtGradient: 4.8, alpha: 1.2e-5 });
  });
});

describe('semi-rigid ends the solve cannot model', () => {
  it('a member not along global axes is refused, not solved with rigid ends', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 2);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addNodalLoad3D(b, 0, 0, -10, 0, 0, 0, 1);
    modelStore.updateElement(e, { semiRigid: { i: { ky: 5000, kz: 5000 } } });
    const r = validateAndSolve3D(md());
    expect(typeof r).toBe('string');
    expect(r).toContain(String(e));
  });

  it('a negative stiffness is an error message, from the single solve and the combinations', () => {
    const { e } = loadedCantilever();
    modelStore.updateElement(e, { semiRigid: { i: { ky: -500, kz: 5000 } } });
    expect(() => validateAndSolve3D(md())).not.toThrow();
    expect(typeof validateAndSolve3D(md())).toBe('string');
    const combos = [{ id: 1, name: 'C', factors: [{ caseId: 1, factor: 1 }] }];
    expect(() => solveCombinations3D(md(), modelStore.model.loadCases, combos)).not.toThrow();
    expect(typeof solveCombinations3D(md(), modelStore.model.loadCases, combos)).toBe('string');
  });
});

describe('a settlement in a model that is not linear', () => {
  it('is its own case, out of the load cases, and in every combination once — loaded or not', () => {
    // A lifting support that stays down, and a settlement at the one next to it.
    const ns = [0, 4, 8].map((x) => modelStore.addNode(x, 0, 0));
    for (let i = 1; i < ns.length; i++) modelStore.addElement(ns[i - 1]!, ns[i]!, 'frame');
    modelStore.addSupport(ns[0]!, 'custom3d' as never, undefined, { dofRestraints: { tx: true, ty: true, tz: true, rx: true, ry: false, rz: true } });
    modelStore.addSupport(ns[1]!, 'pinned3d' as never, undefined, { dz: -0.001 });
    const lifting = modelStore.addSupport(ns[2]!, 'pinned3d' as never);
    modelStore.updateSupport(lifting, { uplift: true });
    modelStore.addNodalLoad3D(ns[2]!, 0, 0, -50, 0, 0, 0, 1);
    const empty = modelStore.addLoadCase('L', 'L');
    const combos = [
      { id: 1, name: 'D', factors: [{ caseId: 1, factor: 1 }] },
      { id: 2, name: 'L', factors: [{ caseId: empty, factor: 1 }] },
    ];
    const b = solveCombinations3D(md(), modelStore.model.loadCases, combos);
    if (!b || typeof b === 'string') throw new Error(String(b));
    const uz = (r: ReturnType<typeof solve> | undefined) => r?.displacements.find((d) => d.nodeId === ns[1])?.uz;
    expect(uz(b.perCase.get(1))).toBeCloseTo(0, 9);
    expect(uz(b.perCase.get(SETTLEMENT_CASE_ID))).toBeCloseTo(-0.001, 9);
    expect(uz(b.perCombo.get(1))).toBeCloseTo(-0.001, 9);
    expect(uz(b.perCombo.get(2))).toBeCloseTo(-0.001, 9);
  });

  it('imposes settlements with one-way members once in single solves and combinations', () => {
    bracedBay('tensionOnly');
    const right = [...modelStore.supports.values()].find((s) => s.type === 'pinned3d' && s.nodeId !== 1)!;
    modelStore.updateSupport(right.id, { dz: -0.01 });
    const single = solve();
    expect(single.nonlinear?.converged).toBe(true);
    expect(disp(single, right.nodeId).uz).toBeCloseTo(-0.01, 9);
    const combos = [{ id: 1, name: 'D', factors: [{ caseId: 1, factor: 1 }] }];
    const bundle = solveCombinations3D(md(), modelStore.model.loadCases, combos);
    if (!bundle || typeof bundle === 'string') throw new Error(String(bundle));
    expect(disp(bundle.perCase.get(1)!, right.nodeId).uz).toBeCloseTo(0, 9);
    const combined = bundle.perCombo.get(1)!;
    expect(combined.nonlinear?.converged).toBe(true);
    for (const d of single.displacements) {
      const c = disp(combined, d.nodeId);
      for (const key of ['ux', 'uy', 'uz'] as const) expect(c[key]).toBeCloseTo(d[key], 9);
    }
  });
});
