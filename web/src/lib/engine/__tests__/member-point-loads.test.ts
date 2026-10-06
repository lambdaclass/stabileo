/**
 * Concentrated loads inside a member's span, a tendon, a side-to-side temperature gradient and an
 * initial strain, against their closed forms.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import '../../store/index';
import { initSolver } from '../wasm-solver';
import { evaluateDiagramAt } from '../diagrams-3d';
import { ENGINE_ALPHA } from '../thermal-alpha';
import { checkModel } from '../model-diagnostics';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); });

const L = 6;
const sec = () => [...modelStore.sections.values()][0]!;
const mat = () => [...modelStore.materials.values()][0]!;
const solve = () => {
  const r = modelStore.solve3D(false, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  return r;
};

/** A beam along X, I at the origin; supports by the caller. */
function beam() {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
  const e = modelStore.addElement(a, b, 'frame');
  return { a, b, e };
}

describe('concentrated loads inside the span', () => {
  it('a moment at a third of a simply supported span jumps the diagram by M there, and the reactions are M/L', () => {
    const { a, b, e } = beam();
    modelStore.addSupport(a, 'pinned3d');
    modelStore.addSupport(b, 'pinned3d');
    modelStore.updateSupport([...modelStore.supports.values()][1]!.id, { dofRestraints: { tx: false, ty: true, tz: true, rx: true, ry: false, rz: false } });
    const M = 12, x0 = L / 3;
    modelStore.addLoadEntry({ type: 'pointOnElement3d', data: { id: 0, elementId: e, a: x0, py: 0, pz: 0, my: M } });
    const r = solve();
    // No interior node left in what the app reads; one member.
    expect(r.displacements.map((d) => d.nodeId).sort()).toEqual([a, b]);
    const f = r.elementForces.find((x) => x.elementId === e)!;
    expect(f.length).toBeCloseTo(L, 9);
    const fz = (id: number) => r.reactions.find((x) => x.nodeId === id)!.fz;
    expect(Math.abs(fz(a))).toBeCloseTo(M / L, 6);
    expect(fz(a) + fz(b)).toBeCloseTo(0, 6);
    const before = evaluateDiagramAt(f, 'momentY', (x0 - 1e-6) / L), after = evaluateDiagramAt(f, 'momentY', (x0 + 1e-6) / L);
    expect(Math.abs(after - before)).toBeCloseTo(M, 4);
    // Linear on each side, zero at the supports.
    expect(evaluateDiagramAt(f, 'momentY', 0)).toBeCloseTo(0, 6);
    expect(evaluateDiagramAt(f, 'momentY', 1)).toBeCloseTo(0, 6);
  });

  it('an axial force at mid-height of a column fixed at both ends splits by stiffness: half above, half below', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, L);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(b, 'fixed3d');
    const P = 40;
    modelStore.addLoadEntry({ type: 'pointOnElement3d', data: { id: 0, elementId: e, a: L / 4, py: 0, pz: 0, px: -P } });
    const r = solve();
    const f = r.elementForces.find((x) => x.elementId === e)!;
    // A quarter of the way up: three quarters of P go down to the stiffer short part.
    expect(evaluateDiagramAt(f, 'axial', 0.1)).toBeCloseTo(-0.75 * P, 4);
    expect(evaluateDiagramAt(f, 'axial', 0.9)).toBeCloseTo(0.25 * P, 4);
    const rz = (id: number) => r.reactions.find((x) => x.nodeId === id)!.fz;
    expect(rz(a) + rz(b)).toBeCloseTo(P, 6);
  });

  it('a global load on an inclined member is the same as its local components', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 4);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addLoadEntry({ type: 'pointOnElement3d', data: { id: 0, elementId: e, a: 2.5, py: 0, pz: -10, px: 0, frame: 'global' } });
    const r = solve();
    const rz = r.reactions.find((x) => x.nodeId === a)!;
    expect(rz.fz).toBeCloseTo(10, 6);
    // The moment about the base is the force times its plan lever arm: 2,5 m along a 3-4-5 member is 1,5 m in plan.
    expect(Math.abs(rz.my)).toBeCloseTo(15, 5);
  });
});

describe('a tendon by its equivalent loads', () => {
  it('a parabolic tendon in a simply supported beam: midspan moment −P·f, axial −P, reactions zero', () => {
    const { a, b, e } = beam();
    modelStore.addSupport(a, 'pinned3d');
    modelStore.addSupport(b, 'pinned3d');
    modelStore.updateSupport([...modelStore.supports.values()][1]!.id, { dofRestraints: { tx: false, ty: true, tz: true, rx: true, ry: false, rz: false } });
    const P = 500, f0 = 0.2;
    modelStore.addLoadEntry({ type: 'prestress3d', data: { id: 0, elementId: e, force: P, eI: 0, eM: f0, eJ: 0 } });
    const r = solve();
    const ef = r.elementForces.find((x) => x.elementId === e)!;
    expect(evaluateDiagramAt(ef, 'axial', 0.5)).toBeCloseTo(-P, 4);
    // Hogging: the tendon below the axis lifts the beam. |M| = P·e(x), here P·f at midspan.
    expect(Math.abs(evaluateDiagramAt(ef, 'momentY', 0.5))).toBeCloseTo(P * f0, 3);
    expect(Math.abs(evaluateDiagramAt(ef, 'momentY', 0.25))).toBeCloseTo(P * 0.75 * f0, 3);
    for (const x of r.reactions) expect(Math.hypot(x.fx, x.fy, x.fz)).toBeLessThan(1e-6);
  });

  it('in a beam fixed at both ends a straight concentric tendon leaves the concrete unstressed', () => {
    const { a, b, e } = beam();
    modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(b, 'fixed3d');
    modelStore.addLoadEntry({ type: 'prestress3d', data: { id: 0, elementId: e, force: 300, eI: 0, eM: 0, eJ: 0 } });
    const r = solve();
    const ef = r.elementForces.find((x) => x.elementId === e)!;
    expect(Math.abs(ef.nStart)).toBeLessThan(1e-6);
  });
});

describe('temperature and strain', () => {
  it('a side-to-side gradient bends a cantilever toward its colder face, by α·ΔT·L²/(2b)', () => {
    const { a, b, e } = beam();
    modelStore.addSupport(a, 'fixed3d');
    const dT = 20;
    // ΔT(−y face) − ΔT(+y face) = 20: the −y face is hotter, so the tip goes to +y.
    modelStore.addLoadEntry({ type: 'thermal', data: { id: 0, elementId: e, dtUniform: 0, dtGradient: 0, dtGradientY: dT } });
    const r = solve();
    const d = r.displacements.find((x) => x.nodeId === b)!;
    // The section's real width, not its equivalent rectangle's: an I section here.
    const width = sec().b!;
    expect(sec().shape).toBe('I');
    expect(d.uz).toBeCloseTo(0, 9);
    expect(d.uy).toBeGreaterThan(0);
    expect(d.uy).toBeCloseTo((ENGINE_ALPHA * dT * L * L) / (2 * width), 6);
  });

  it('a gradient through the depth of an I section curves it by α·ΔT/h over its real depth', () => {
    const { a, b, e } = beam();
    modelStore.addSupport(a, 'fixed3d');
    const dT = 20;
    modelStore.addLoadEntry({ type: 'thermal', data: { id: 0, elementId: e, dtUniform: 0, dtGradient: dT } });
    const r = solve();
    expect(r.displacements.find((x) => x.nodeId === b)!.uz).toBeCloseTo((ENGINE_ALPHA * dT * L * L) / (2 * sec().h!), 6);
  });

  it('a plane model takes the gradient over the same real depth: α·ΔT·L²/(2h)', () => {
    // Nodes in the plane and a plane support: the model is solved embedded in XZ.
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(L, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed');
    const dT = 20;
    modelStore.addThermalLoad(e, 0, dT);
    const r = solve();
    const d = r.displacements.find((x) => x.nodeId === b)!;
    expect(sec().shape).toBe('I');
    expect(Math.hypot(d.uy, d.uz)).toBeCloseTo((ENGINE_ALPHA * dT * L * L) / (2 * sec().h!), 6);
  });

  it('a side-to-side gradient on a plane model makes it a space one: it bends out of its plane', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(L, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed');
    const dT = 20;
    modelStore.addLoadEntry({ type: 'thermal', data: { id: 0, elementId: e, dtUniform: 0, dtGradient: 0, dtGradientY: dT } });
    const r = solve();
    const d = r.displacements.find((x) => x.nodeId === b)!;
    expect(d.uy).toBeCloseTo((ENGINE_ALPHA * dT * L * L) / (2 * sec().b!), 6);
  });

  it('an initial strain lengthens a free member by ε·L, whatever its material', () => {
    const { a, b, e } = beam();
    modelStore.addSupport(a, 'fixed3d');
    modelStore.updateMaterial(mat().id, { e: 30000 } as never);
    modelStore.addLoadEntry({ type: 'thermal', data: { id: 0, elementId: e, dtUniform: 0, dtGradient: 0, strain: 1e-3 } });
    const r = solve();
    expect(r.displacements.find((x) => x.nodeId === b)!.ux).toBeCloseTo(1e-3 * L, 9);
  });
});

describe('a concentrated load on a member that takes no bending', () => {
  /** A bar between two fixed nodes, with an axial force at a third of its length. */
  function bar(kind: 'truss' | 'tensionOnly') {
    const { a, b, e } = beam();
    if (kind === 'truss') modelStore.updateElement(e, { type: 'truss' });
    else modelStore.updateElement(e, { behaviour: 'tensionOnly' });
    modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(b, 'fixed3d');
    modelStore.addLoadEntry({ type: 'pointOnElement3d', data: { id: 0, elementId: e, a: L / 3, py: 0, pz: 0, px: 10 } });
    return { a, b, e };
  }

  it('an axial force inside a tension-only brace goes to its nodes by the lever rule, as on a truss', () => {
    const fx = (r: ReturnType<typeof solve>, id: number) => r.reactions.find((x) => x.nodeId === id)!.fx;
    const truss = bar('truss');
    const t = solve();
    modelStore.clear();
    const brace = bar('tensionOnly');
    const r = solve();
    // Two thirds of it to the nearer end, a third to the farther.
    expect(fx(r, brace.a)).toBeCloseTo(-10 * (2 / 3), 6);
    expect(fx(r, brace.b)).toBeCloseTo(-10 / 3, 6);
    expect(fx(r, brace.a)).toBeCloseTo(fx(t, truss.a), 9);
  });

  it('a moment on one is refused by name, as a moment and not as anything else', () => {
    const { e } = beam();
    modelStore.updateElement(e, { behaviour: 'tensionOnly' });
    modelStore.addSupport([...modelStore.nodes.keys()][0]!, 'fixed3d'); modelStore.addSupport([...modelStore.nodes.keys()][1]!, 'fixed3d');
    modelStore.addLoadEntry({ type: 'pointOnElement3d', data: { id: 0, elementId: e, a: L / 3, py: 0, pz: 0, my: 5 } });
    const r = modelStore.solve3D(false, false, true);
    expect(typeof r).toBe('string');
    expect(String(r)).toContain(String(e));
  });
});

describe('a gradient on a section with no stated depth', () => {
  const noted = () => checkModel(modelStore.model as never).find((d) => d.code === 'MODEL_THERMAL_DEPTH_UNKNOWN')?.elementIds;

  it('is taken over the equivalent rectangle, and the model check says so by member', () => {
    const { a, e } = beam();
    modelStore.addSupport(a, 'fixed3d');
    // Stated by its properties only: no depth, no width.
    const sid = modelStore.addSection({ name: 'props', a: 0.01, iz: 2e-5, iy: 8e-5 } as never);
    modelStore.updateElement(e, { sectionId: sid });
    modelStore.addLoadEntry({ type: 'thermal', data: { id: 0, elementId: e, dtUniform: 0, dtGradient: 20 } });
    expect(noted()).toEqual([e]);
  });

  it('says nothing for a section with its depth, or for a uniform temperature', () => {
    const { a, e } = beam();
    modelStore.addSupport(a, 'fixed3d');
    const id = modelStore.addLoadEntry({ type: 'thermal', data: { id: 0, elementId: e, dtUniform: 0, dtGradient: 20 } });
    expect(noted()).toBeUndefined();
    const sid = modelStore.addSection({ name: 'props', a: 0.01, iz: 2e-5, iy: 8e-5 } as never);
    modelStore.updateElement(e, { sectionId: sid });
    modelStore.removeLoad(id);
    modelStore.addLoadEntry({ type: 'thermal', data: { id: 0, elementId: e, dtUniform: 30, dtGradient: 0 } });
    expect(noted()).toBeUndefined();
  });
});
