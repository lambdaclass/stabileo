/**
 * A tendon's anchors act on its member's end, on the member's side of whatever joins that end to
 * its node: a hinge, a joint, a semi-rigid connection. The set of a tendon's equivalent loads is
 * in equilibrium on its own, so on a statically determinate structure it moves no support and
 * stresses no other member: the member alone carries N = −P and M = P·e.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import '../../store/index';
import { initSolver } from '../wasm-solver';
import { evaluateDiagramAt } from '../diagrams-3d';
import { checkModel } from '../model-diagnostics';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); });

const L = 6, H = 3, P = 500, e0 = 0.1;
const solve = () => {
  const r = modelStore.solve3D(false, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  return r;
};
const ONLY_TZ = { tx: false, ty: false, tz: true, rx: false, ry: false, rz: false };
const straight = (elementId: number, e = e0) =>
  modelStore.addLoadEntry({ type: 'prestress3d', data: { id: 0, elementId, force: P, eI: e, eM: e, eJ: e } });

function noReactions(r: ReturnType<typeof solve>) {
  for (const x of r.reactions) {
    expect(Math.hypot(x.fx, x.fy, x.fz)).toBeLessThan(1e-6);
    expect(Math.hypot(x.mx, x.my, x.mz)).toBeLessThan(1e-6);
  }
}

/** A column fixed at its foot and a beam from its head to a roller; `end` joins the beam to the column. */
function frame(end: (beam: number) => void) {
  const foot = modelStore.addNode(0, 0, 0), head = modelStore.addNode(0, 0, H), far = modelStore.addNode(L, 0, H);
  const column = modelStore.addElement(foot, head, 'frame');
  const beam = modelStore.addElement(head, far, 'frame');
  modelStore.addSupport(foot, 'fixed3d');
  modelStore.addSupport(far, 'custom3d', undefined, { dofRestraints: ONLY_TZ });
  end(beam);
  return { column, beam, foot, head, far };
}

function beamCarriesThePrimaryOnly(r: ReturnType<typeof solve>, beam: number, column: number) {
  const fb = r.elementForces.find((x) => x.elementId === beam)!;
  for (const t of [0, 0.25, 0.5, 1]) {
    expect(Math.abs(evaluateDiagramAt(fb, 'momentY', t))).toBeCloseTo(P * e0, 5);
    expect(evaluateDiagramAt(fb, 'axial', t)).toBeCloseTo(-P, 5);
  }
  const fc = r.elementForces.find((x) => x.elementId === column)!;
  for (const t of [0, 0.5, 1]) {
    expect(Math.abs(evaluateDiagramAt(fc, 'momentY', t))).toBeLessThan(1e-6);
    expect(Math.abs(evaluateDiagramAt(fc, 'axial', t))).toBeLessThan(1e-6);
  }
}

describe('a tendon on a statically determinate structure moves no support', () => {
  it('a simply supported beam: M = P·e all along, N = −P, no reactions', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'pinned3d');
    modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { ...ONLY_TZ, ty: true, rx: true } });
    straight(e);
    const r = solve();
    noReactions(r);
    const f = r.elementForces.find((x) => x.elementId === e)!;
    expect(Math.abs(evaluateDiagramAt(f, 'momentY', 0.3))).toBeCloseTo(P * e0, 5);
  });

  it('a simply supported beam hinged at both ends: the same, the anchors on the beam and not on the pins', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'pinned3d');
    modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { ...ONLY_TZ, ty: true, rx: true } });
    modelStore.updateElement(e, { releaseI: { my: true, mz: false, t: false }, releaseJ: { my: true, mz: false, t: false } });
    straight(e);
    const r = solve();
    expect(typeof r).toBe('object');
    noReactions(r);
    const f = r.elementForces.find((x) => x.elementId === e)!;
    for (const t of [0, 0.5, 1]) expect(Math.abs(evaluateDiagramAt(f, 'momentY', t))).toBeCloseTo(P * e0, 5);
  });

  it('a cantilever: M = P·e all along, no reactions', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    straight(e);
    const r = solve();
    noReactions(r);
    const f = r.elementForces.find((x) => x.elementId === e)!;
    expect(Math.abs(evaluateDiagramAt(f, 'momentY', 0))).toBeCloseTo(P * e0, 5);
    expect(Math.abs(evaluateDiagramAt(f, 'momentY', 1))).toBeCloseTo(P * e0, 5);
  });

  it('a beam hinged to a column: the anchor moment stays in the beam, the column carries nothing', () => {
    const { beam, column } = frame((b) => modelStore.updateElement(b, { releaseI: { my: true, mz: false, t: false } }));
    straight(beam);
    const r = solve();
    noReactions(r);
    beamCarriesThePrimaryOnly(r, beam, column);
    // The helper the anchor sits on is not a node of the model.
    expect(r.displacements.map((d) => d.nodeId).sort((x, y) => x - y)).toEqual([1, 2, 3]);
  });

  it('the hinge at the far end, the tendon parabolic and eccentric at the ends: still no reactions', () => {
    const foot = modelStore.addNode(0, 0, 0), head = modelStore.addNode(0, 0, H), far = modelStore.addNode(-L, 0, H);
    const column = modelStore.addElement(foot, head, 'frame');
    const beam = modelStore.addElement(far, head, 'frame');
    modelStore.addSupport(foot, 'fixed3d');
    modelStore.addSupport(far, 'custom3d', undefined, { dofRestraints: ONLY_TZ });
    modelStore.updateElement(beam, { releaseJ: { my: true, mz: false, t: false } });
    modelStore.addLoadEntry({ type: 'prestress3d', data: { id: 0, elementId: beam, force: P, eI: 0.05, eM: 0.25, eJ: 0.15 } });
    const r = solve();
    noReactions(r);
    const fc = r.elementForces.find((x) => x.elementId === column)!;
    expect(Math.abs(evaluateDiagramAt(fc, 'momentY', 1))).toBeLessThan(1e-6);
    const fb = r.elementForces.find((x) => x.elementId === beam)!;
    // The primary moment P·e(x) at the hinged end.
    expect(Math.abs(evaluateDiagramAt(fb, 'momentY', 1))).toBeCloseTo(P * 0.15, 5);
  });

  it('a semi-rigid end of zero stiffness is a hinge: the same answer', () => {
    const { beam, column } = frame((b) => modelStore.updateElement(b, { semiRigid: { i: { ky: 0, kz: 1e9 } } }));
    straight(beam);
    const r = solve();
    noReactions(r);
    beamCarriesThePrimaryOnly(r, beam, column);
  });

  it('a joint releasing the rotation is a hinge: the same answer', () => {
    const { beam, column } = frame((b) => modelStore.updateElement(b, { jointI: { dof: [false, false, false, false, true, false] } }));
    straight(beam);
    const r = solve();
    noReactions(r);
    beamCarriesThePrimaryOnly(r, beam, column);
  });

  it('an end free to slide along the member: the anchor force compresses the member, not the supports', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'pinned3d');
    modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { tx: true, ty: true, tz: true, rx: true, ry: false, rz: false } });
    // Both supports hold X: only the slide at I leaves the member free to shorten.
    modelStore.updateElement(e, { jointI: { dof: [true, false, false, false, false, false] } });
    straight(e, 0);
    const r = solve();
    noReactions(r);
    const f = r.elementForces.find((x) => x.elementId === e)!;
    expect(evaluateDiagramAt(f, 'axial', 0.5)).toBeCloseTo(-P, 5);
  });
});

describe('in a combination', () => {
  it('the hinged frame under 1,2 × the tendon: the beam carries 1,2·P·e, the column and the supports nothing', () => {
    const { beam, column } = frame((b) => modelStore.updateElement(b, { releaseI: { my: true, mz: false, t: false } }));
    straight(beam);
    const caseId = [...modelStore.loadCases.values()][0]!.id;
    const id = modelStore.addCombination('1,2 P', [{ caseId, factor: 1.2 }]);
    const r = modelStore.solveCombinations3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    const c = r.perCombo.get(id)!;
    noReactions(c);
    const fb = c.elementForces.find((x) => x.elementId === beam)!;
    expect(Math.abs(evaluateDiagramAt(fb, 'momentY', 0.5))).toBeCloseTo(1.2 * P * e0, 5);
    const fc = c.elementForces.find((x) => x.elementId === column)!;
    expect(Math.abs(evaluateDiagramAt(fc, 'momentY', 1))).toBeLessThan(1e-6);
  });
});

describe('a tendon in a member that works one way', () => {
  it('a tension-only bar its tendon would compress goes slack, and its anchors go with it', () => {
    // A cantilever A–B and, in line with it, a tension-only bar B–C to a fixed C.
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0), c = modelStore.addNode(2 * L, 0, 0);
    const beam = modelStore.addElement(a, b, 'frame');
    const bar = modelStore.addElement(b, c, 'frame');
    modelStore.updateElement(bar, { behaviour: 'tensionOnly' });
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addSupport(c, 'fixed3d');
    // Eccentric too: a member that takes no bending takes the tendon as its axial force only.
    modelStore.addLoadEntry({ type: 'prestress3d', data: { id: 0, elementId: bar, force: 100, eI: 0.1, eM: 0.1, eJ: 0.1 } });
    const r = solve();
    noReactions(r);
    const fb = r.elementForces.find((x) => x.elementId === beam)!;
    expect(Math.abs(fb.nStart)).toBeLessThan(1e-6);
  });
});

describe('a joined end the solve cannot give a node of its own', () => {
  const named = () => checkModel(modelStore.model as never).find((d) => d.code === 'MODEL_TENDON_END_UNPLACED')?.elementIds;

  it('a hinged member with an offset is named by the model check; one without is not', () => {
    const { beam } = frame((b) => modelStore.updateElement(b, { releaseI: { my: true, mz: false, t: false } }));
    straight(beam);
    expect(named()).toBeUndefined();
    modelStore.updateElement(beam, { offset: { frame: 'global', j: { x: 0, y: 0, z: -0.2 } } });
    expect(named()).toEqual([beam]);
  });
});
