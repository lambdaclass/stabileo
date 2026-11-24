/**
 * Reversing a member describes the same structure: every load, release and
 * end record follows it, so the solution does not move.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore, uiStore } from '..';
import { buildSolverInput2D, buildSolverInput3D, validateAndSolve2D, validateAndSolve3D } from '../../engine/solver-service';
import { solvePDelta, solvePDelta3D } from '../../engine/wasm-solver';
import { flipMembers } from '../../model/edit/flip-members';
import { modelFeatures } from '../../provenance/model-features';
import type { AnalysisResults } from '../../engine/types';
import type { AnalysisResults3D } from '../../engine/types-3d';

function spaceResults() {
  const r = modelStore.solve3D(false, false, false);
  expect(r).toBeTypeOf('object');
  expect(r).not.toBeNull();
  return r as AnalysisResults3D;
}

function sameSpaceResults(actual: AnalysisResults3D, expected: AnalysisResults3D) {
  for (const key of ['reactions', 'displacements'] as const) {
    for (const row of expected[key]) {
      const other = actual[key].find((r) => r.nodeId === row.nodeId)!;
      expect(other).toBeDefined();
      for (const [field, value] of Object.entries(row)) {
        if (typeof value === 'number') expect((other as unknown as Record<string, number>)[field]).toBeCloseTo(value, 8);
      }
    }
  }
}

function peak(r: { displacements: Array<Record<string, number>> }) {
  return r.displacements.map((d) => [d.nodeId, +(d.ux ?? 0).toFixed(9), +(d.uz ?? d.uy ?? 0).toFixed(9)]);
}
function reactions(r: { reactions: Array<Record<string, number>> }) {
  // Rounded, and a round-off below the last digit is zero whatever its sign (−0 is not 0 to toEqual).
  const r6 = (v: number) => +v.toFixed(6) + 0;
  return r.reactions.map((x) => [x.nodeId, r6(x.rx ?? x.fx ?? 0), r6(x.rz ?? x.fz ?? 0), r6(x.my ?? 0)]);
}

beforeEach(() => { historyStore.clear(); modelStore.clear(); });

describe('reverseElement', () => {
  it('3D: a semi-rigid end spring swaps with its end, so the solution does not move', () => {
    uiStore.analysisMode = '3d';
    modelStore.clear();
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0);
    const e = modelStore.addElement(a, b);
    modelStore.addSupport(a, 'fixed3d');
    modelStore.updateSection(modelStore.elements.get(e)!.sectionId, { iy: 0.0001, iz: 0.00001 });
    // A soft spring at the fixed end: the tip deflection depends on where it sits.
    modelStore.updateElement(e, { semiRigid: { i: { ky: 500, kz: 500 } } } as never);
    modelStore.addNodalLoad3D(b, 0, 0, -10, 0, 0, 0);
    const before = spaceResults();
    modelStore.reverseElement(e);
    expect(modelStore.elements.get(e)!.semiRigid).toEqual({ j: { ky: 500, kz: 500 } });
    sameSpaceResults(spaceResults(), before);
    modelStore.reverseElement(e);
    expect(modelStore.elements.get(e)!.semiRigid).toEqual({ i: { ky: 500, kz: 500 } });
  });

  it.each([false, true])('3D preserves a section rotation and shared section (explicit Y: %s)', (explicitY) => {
    uiStore.analysisMode = '3d';
    modelStore.clear();
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
    const e = modelStore.addElement(a, b);
    modelStore.addSupport(a, 'fixed3d');
    const sectionId = modelStore.elements.get(e)!.sectionId;
    modelStore.updateSection(sectionId, { rotation: 30, iy: 0.0001, iz: 0.00001 });
    modelStore.updateElement(e, { rollAngle: 12, ...(explicitY ? { localYx: 0, localYy: 1, localYz: 0 } : {}) });
    modelStore.addNodalLoad3D(b, 0, 0, -10, 0, 0, 0);
    modelStore.addDistributedLoad3D(e, 2, 5, -8, -3, 0.5, 4);
    modelStore.addPointLoadOnElement3D(e, 1.5, 3, -6);
    const before = spaceResults();
    expect(Math.abs(before.displacements.find((d) => d.nodeId === b)!.uy)).toBeGreaterThan(1e-6);
    modelStore.reverseElement(e);
    sameSpaceResults(spaceResults(), before);
    expect(modelStore.sections.get(sectionId)!.rotation).toBe(30);
    modelStore.reverseElement(e);
    sameSpaceResults(spaceResults(), before);
    expect(modelStore.elements.get(e)!.rollAngle).toBe(12);
  });

  it.each([false, true])('3D preserves thermal reactions when reversing (explicit Y: %s)', (explicitY) => {
    uiStore.analysisMode = '3d';
    modelStore.clear();
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
    const e = modelStore.addElement(a, b);
    modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(b, 'fixed3d');
    if (explicitY) modelStore.updateElement(e, { localYx: 0, localYy: 1, localYz: 0 });
    modelStore.addThermalLoad(e, 10, 30);
    const before = spaceResults();
    expect(Math.abs(before.reactions[0].my)).toBeGreaterThan(1);
    modelStore.reverseElement(e);
    sameSpaceResults(spaceResults(), before);
    modelStore.reverseElement(e);
    sameSpaceResults(spaceResults(), before);
  });

  it('2D: local and global loads, a partial load, a point load, a gradient and a hinge', () => {
    uiStore.analysisMode = '2d';
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 1), c = modelStore.addNode(10, 1);
    const e1 = modelStore.addElement(a, b);
    modelStore.addElement(b, c);
    modelStore.addSupport(a, 'fixed'); modelStore.addSupport(c, 'pinned');
    modelStore.addDistributedLoad(e1, -10, -4, undefined, false, undefined, 1, 4.5);
    modelStore.addDistributedLoad(e1, -3, -3, 20, true);
    modelStore.addPointLoadOnElement(e1, 2, -7, { px: 2, my: 3 });
    modelStore.addThermalLoad(e1, 10, 25);
    modelStore.toggleRelease(e1, 'j', 'mz');
    const before = modelStore.solve(false) as never;
    modelStore.reverseElement(e1);
    expect(modelStore.elements.get(e1)!.nodeI).toBe(b);
    expect(modelStore.elements.get(e1)!.releaseI.mz).toBe(true);
    const after = modelStore.solve(false) as never;
    expect(reactions(after)).toEqual(reactions(before));
    expect(peak(after)).toEqual(peak(before));
    modelStore.reverseElement(e1);
    expect(reactions(modelStore.solve(false) as never)).toEqual(reactions(before));
  });

  it('3D: local qY/qZ, a point load and a roll angle', () => {
    uiStore.analysisMode = '3d';
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(5, 2, 1);
    const e = modelStore.addElement(a, b);
    modelStore.addSupport(a, 'fixed3d');
    modelStore.updateElement(e, { rollAngle: 30 });
    modelStore.model.loads = [
      { type: 'distributed3d', data: { id: 900, elementId: e, qYI: 2, qYJ: 5, qZI: -8, qZJ: -3, a: 0.5, b: 4 } },
      { type: 'pointOnElement3d', data: { id: 901, elementId: e, a: 1.5, py: 3, pz: -6 } },
    ];
    const before = modelStore.solve3D(false, false, false) as never;
    modelStore.reverseElement(e);
    const after = modelStore.solve3D(false, false, false) as never;
    expect(reactions(after)).toEqual(reactions(before));
  });
});

for (const [qI, qJ] of [[2, 2], [2, 5]] as const) {
  it(`#2268 a reversed member preserves the physical axial load ${qI} to ${qJ}`, () => {
    uiStore.analysisMode = '3d';
    const length = 4;
    const root = modelStore.addNode(0, 0, 0);
    const tip = modelStore.addNode(length, 0, 0);
    const member = modelStore.addElement(root, tip);
    modelStore.addSupport(root, 'fixed3d');
    modelStore.addDistributedLoad3D(member, 0, 0, 0, 0, undefined, undefined, undefined, { qXI: qI, qXJ: qJ });
    const expectedReaction = -length * (qI + qJ) / 2;
    expect(spaceResults().reactions.find(({ nodeId }) => nodeId === root)?.fx).toBeCloseTo(expectedReaction, 12);
    modelStore.reverseElement(member);
    expect(spaceResults().reactions.find(({ nodeId }) => nodeId === root)?.fx).toBeCloseTo(expectedReaction, 12);
  });
}

const axialLength = 4;
const a = 0.5;
const b = 3;
const physicalTotal = (qI: number, qJ: number) => (b - a) * (qI + qJ) / 2;

function axialModel(mode: '2d' | '3d') {
  uiStore.analysisMode = mode;
  uiStore.useNative3DPresentation();
  const plane = mode === '2d';
  const root = modelStore.addNode(0, 0, plane ? undefined : 0);
  const tip = modelStore.addNode(axialLength, 0, plane ? undefined : 0);
  const member = modelStore.addElement(root, tip);
  modelStore.addSupport(root, plane ? 'fixed' : 'fixed3d');
  return { root, member };
}

function planeAxialResults(): AnalysisResults[] {
  const model = modelStore.model;
  const linear = validateAndSolve2D(model);
  const input = buildSolverInput2D(model);
  if (!input || !linear || typeof linear === 'string') throw new Error(String(linear));
  const secondOrder = solvePDelta(input);
  expect(secondOrder.isStable).toBe(true);
  return [linear, secondOrder.results];
}

function spaceAxialResults(): AnalysisResults3D[] {
  const model = modelStore.model;
  const linear = validateAndSolve3D(model);
  const input = buildSolverInput3D(model);
  if (!input || !linear || typeof linear === 'string') throw new Error(String(linear));
  const secondOrder = solvePDelta3D(input);
  expect(secondOrder.isStable).toBe(true);
  return [linear, secondOrder.results];
}

function expectAxial(
  root: number, member: number, mode: '2d' | '3d', qI: number, qJ: number, reversed: boolean,
) {
  const total = physicalTotal(qI, qJ);
  const results = mode === '2d' ? planeAxialResults() : spaceAxialResults();
  const close = (actual: number | undefined, expected: number) => expect.soft(actual).toBeCloseTo(expected, 12);
  for (const result of results) {
    const reaction = result.reactions.find(r => r.nodeId === root)!;
    const forces = result.elementForces.find(f => f.elementId === member)!;
    close('fx' in reaction ? reaction.fx : reaction.rx, -total);
    close(forces.nStart, reversed ? 0 : total);
    close(forces.nEnd, reversed ? total : 0);
    const [span] = forces.distributedLoadsX ?? [];
    close(span?.qI, reversed ? -qJ : qI);
    close(span?.qJ, reversed ? -qI : qJ);
    close(span?.a, reversed ? axialLength - b : a);
    close(span?.b, reversed ? axialLength - a : b);
  }
}

for (const [qI, qJ] of [[2, 2], [2, 5]] as const) {
  it(`#2268 preserves a spatial axial load over a partial span ${qI} to ${qJ}`, () => {
    const { root, member } = axialModel('3d');
    modelStore.addDistributedLoad3D(member, 0, 0, 0, 0, a, b, undefined, { qXI: qI, qXJ: qJ });
    expect(modelFeatures(modelStore.snapshot()).has('spatialDistributedLoadOrientation')).toBe(true);
    expectAxial(root, member, '3d', qI, qJ, false);
    modelStore.reverseElement(member);
    expectAxial(root, member, '3d', qI, qJ, true);
    modelStore.reverseElement(member);
    expectAxial(root, member, '3d', qI, qJ, false);
    expect(flipMembers([member]).flipped).toEqual([member]);
    expectAxial(root, member, '3d', qI, qJ, true);
  });

  for (const mode of ['2d', '3d'] as const) {
    it(`#2268 preserves a drawn axial load ${qI} to ${qJ} in the ${mode} solve`, () => {
      const { root, member } = axialModel('2d');
      modelStore.addDistributedLoad(member, qI, qJ, 90, false, undefined, a, b);
      expectAxial(root, member, mode, qI, qJ, false);
      modelStore.reverseElement(member);
      expectAxial(root, member, mode, qI, qJ, true);
      expect(flipMembers([member]).flipped).toEqual([member]);
      expectAxial(root, member, mode, qI, qJ, false);
    });
  }
}

for (const frame of ['global', 'projected'] as const) {
  it(`#2268 reverses the span profile in the fixed ${frame} frame`, () => {
    uiStore.analysisMode = '3d';
    const root = modelStore.addNode(0, 0, 0);
    const tip = modelStore.addNode(4, 0, 3);
    const member = modelStore.addElement(root, tip);
    modelStore.addSupport(root, 'fixed3d');
    const qI = 2, qJ = 5, qYI = 3, qYJ = 7;
    const length = 5;
    modelStore.addDistributedLoad3D(member, qYI, qYJ, 0, 0, a, b, undefined, { frame, qXI: qI, qXJ: qJ });
    const projection = frame === 'projected' ? 3 / length : 1;
    const expected = -physicalTotal(qI, qJ) * projection;
    const before = spaceResults();
    expect(before.reactions.find(r => r.nodeId === root)?.fx).toBeCloseTo(expected, 12);
    modelStore.reverseElement(member);
    expect.soft(modelStore.loads[0]?.data).toMatchObject({ qXI: qJ, qXJ: qI, qYI: qYJ, qYJ: qYI, a: length - b, b: length - a });
    sameSpaceResults(spaceResults(), before);
    expect(flipMembers([member]).flipped).toEqual([member]);
    expect(modelStore.loads[0]?.data).toMatchObject({ qXI: qI, qXJ: qJ, qYI, qYJ, a, b });
    sameSpaceResults(spaceResults(), before);
  });
}

it('#2268 reverses a one-sided axial profile from a saved model', () => {
  const { root, member } = axialModel('3d');
  modelStore.model.loads = [{
    type: 'distributed3d', data: { id: 1, elementId: member, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, qXJ: 5, a, b },
  }];
  modelStore.restore(JSON.parse(JSON.stringify(modelStore.snapshot())));
  expectAxial(root, member, '3d', 0, 5, false);
  modelStore.reverseElement(member);
  expectAxial(root, member, '3d', 0, 5, true);
});
