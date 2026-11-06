import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { projectOnto, resetSwitchBackup, restore3D, sliceAt } from '../switch-2d';
import { effectiveBendingInertia, spaceBendingInertias } from '../../engine/solver-service';
import { membersBentOffAxis, planeBending } from '../../geometry/plane-cut-guard';
import type { DrawPlane } from '../../geometry/plane-projection';
import type { Constraint3D } from '../../engine/types-3d';
import { t } from '../../i18n';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear();
  resetSwitchBackup();
  uiStore.analysisMode = '3d';
});

function columnsInYZ(roll = 90): { b: number; d: number; columns: number[] } {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
  const c = modelStore.addNode(0, 5, 0), d = modelStore.addNode(0, 5, 3);
  const columns = [modelStore.addElement(a, b, 'frame'), modelStore.addElement(c, d, 'frame')];
  for (const id of columns) modelStore.elements.get(id)!.rollAngle = roll;
  modelStore.addSupport(a, 'fixed3d');
  modelStore.addSupport(c, 'fixed3d');
  modelStore.addNodalLoad3D(b, 0, 10, 0, 0, 0, 0);
  return { b, d, columns };
}

function columnsInXZ(): { b: number; d: number } {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
  const c = modelStore.addNode(5, 0, 0), d = modelStore.addNode(5, 0, 3);
  modelStore.addElement(a, b, 'frame');
  modelStore.addElement(c, d, 'frame');
  modelStore.addSupport(a, 'fixed3d');
  modelStore.addSupport(c, 'fixed3d');
  modelStore.addNodalLoad3D(b, 10, 0, 0, 0, 0, 0);
  return { b, d };
}

function swayOfBothHeads3D(b: number, d: number): [number, number] {
  const r3 = modelStore.solve3D(false, false, true);
  if (!r3 || typeof r3 === 'string') throw new Error(`3D: ${String(r3)}`);
  return [r3.displacements.find((x) => x.nodeId === b)!.uy, r3.displacements.find((x) => x.nodeId === d)!.uy];
}

function swayOfBothHeads2D(b: number, d: number): [number, number] {
  uiStore.analysisMode = '2d';
  const r2 = modelStore.solve(false);
  if (!r2 || typeof r2 === 'string') throw new Error(`2D: ${String(r2)}`);
  return [r2.displacements.find((x) => x.nodeId === b)!.ux, r2.displacements.find((x) => x.nodeId === d)!.ux];
}

type Take = 'slice' | 'project' | 'solveOnPlane';

function inPlane3D(plane: DrawPlane, d: { ux: number; uy: number; uz: number; rx: number; ry: number; rz: number }): [number, number, number] {
  if (plane === 'yz') return [d.uy, d.uz, d.rx];
  if (plane === 'xy') return [d.ux, d.uy, d.rz];
  return [d.ux, d.uz, -d.ry];
}

function expectPlaneSolveAgreesWith3D(plane: DrawPlane, take: Take, moving: number): void {
  const r3 = modelStore.solve3D(false, false, true);
  if (!r3 || typeof r3 === 'string') throw new Error(`3D: ${String(r3)}`);
  const want = new Map(r3.displacements.map((d) => [d.nodeId, inPlane3D(plane, d)]));
  expect(Math.abs(want.get(moving)![0]) + Math.abs(want.get(moving)![1])).toBeGreaterThan(1e-6);
  let r2;
  if (take === 'solveOnPlane') {
    r2 = modelStore.solve(false, plane);
  } else {
    expect((take === 'slice' ? sliceAt(plane, 0) : projectOnto(plane)).ok).toBe(true);
    uiStore.analysisMode = '2d';
    r2 = modelStore.solve(false);
  }
  if (!r2 || typeof r2 === 'string') throw new Error(`2D: ${String(r2)}`);
  for (const d of r2.displacements) {
    const [h, v, theta] = want.get(d.nodeId)!;
    expect(d.ux).toBeCloseTo(h, 9);
    expect(d.uz).toBeCloseTo(v, 9);
    expect(d.ry).toBeCloseTo(theta, 9);
  }
}

const TAKES: Take[] = ['slice', 'project', 'solveOnPlane'];

describe('a plane model keeps the meaning of the constraints of a space model standing in any plane (#466)', () => {
  const ties: Array<[string, (b: number, d: number) => Constraint3D]> = [
    ['a sway tie on uy', (b, d) => ({ type: 'equalDOF', masterNode: b, slaveNode: d, dofs: [1] }) as Constraint3D],
    ['an out-of-plane tie on ux', (b, d) => ({ type: 'equalDOF', masterNode: b, slaveNode: d, dofs: [0] }) as Constraint3D],
    ['a tie of the in-plane rotations', (b, d) => ({ type: 'equalDOF', masterNode: b, slaveNode: d, dofs: [3] }) as Constraint3D],
    ['a floor diaphragm', (b, d) => ({ type: 'diaphragm', masterNode: b, slaveNodes: [d], plane: 'XY' }) as Constraint3D],
    ['a diaphragm in the plane of the frame', (b, d) => ({ type: 'diaphragm', masterNode: b, slaveNodes: [d], plane: 'YZ' }) as Constraint3D],
    ['a wall diaphragm across the frame', (b, d) => ({ type: 'diaphragm', masterNode: b, slaveNodes: [d], plane: 'XZ' }) as Constraint3D],
    ['a full rigid link', (b, d) => ({ type: 'rigidLink', masterNode: b, slaveNode: d, dofs: [0, 1, 2, 3, 4, 5] }) as Constraint3D],
    ['a translational rigid link', (b, d) => ({ type: 'rigidLink', masterNode: b, slaveNode: d }) as Constraint3D],
    ['a linear MPC mixing sway and rotation', (b, d) => ({ type: 'linearMPC', terms: [{ nodeId: d, dof: 1, coefficient: 1 }, { nodeId: b, dof: 3, coefficient: 2 }, { nodeId: b, dof: 1, coefficient: -1 }] }) as Constraint3D],
    ['an eccentric connection with a released rotation', (b, d) => ({ type: 'eccentricConnection', masterNode: b, slaveNode: d, offsetX: 0, offsetY: 5, offsetZ: 0, releases: [false, false, false, true, false, false] }) as Constraint3D],
  ];
  for (const [what, tie] of ties) {
    for (const take of TAKES) {
      it(`${what} on a Y–Z frame (${take}) agrees with 3D`, () => {
        const { b, d } = columnsInYZ();
        modelStore.addElement(b, d, 'frame');
        modelStore.addConstraint(tie(b, d));
        expectPlaneSolveAgreesWith3D('yz', take, b);
      });
    }
  }

  function cantileversInXY(): { b: number; d: number } {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 0);
    const c = modelStore.addNode(0, 5, 0), d = modelStore.addNode(3, 5, 0);
    for (const id of [modelStore.addElement(a, b, 'frame'), modelStore.addElement(c, d, 'frame')]) {
      modelStore.elements.get(id)!.rollAngle = 90;
    }
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addSupport(c, 'fixed3d');
    modelStore.addNodalLoad3D(b, 10, 20, 0, 0, 0, 0);
    return { b, d };
  }

  const xyTies: Array<[string, (b: number, d: number) => Constraint3D]> = [
    ['an axial tie as a linear MPC on ux', (b, d) => ({ type: 'linearMPC', terms: [{ nodeId: b, dof: 0, coefficient: 1 }, { nodeId: d, dof: 0, coefficient: -1 }] }) as Constraint3D],
    ['an out-of-plane linear MPC on uz', (b, d) => ({ type: 'linearMPC', terms: [{ nodeId: b, dof: 2, coefficient: 1 }, { nodeId: d, dof: 2, coefficient: -1 }] }) as Constraint3D],
    ['a linear MPC mixing translation and the in-plane rotation', (b, d) => ({ type: 'linearMPC', terms: [{ nodeId: d, dof: 1, coefficient: 1 }, { nodeId: b, dof: 5, coefficient: 3 }] }) as Constraint3D],
    ['a tie on uy', (b, d) => ({ type: 'equalDOF', masterNode: b, slaveNode: d, dofs: [1] }) as Constraint3D],
    ['a diaphragm in the plane of the frame', (b, d) => ({ type: 'diaphragm', masterNode: b, slaveNodes: [d], plane: 'XY' }) as Constraint3D],
  ];
  for (const [what, tie] of xyTies) {
    for (const take of ['slice', 'project'] as Take[]) {
      it(`${what} on an X–Y frame (${take}) agrees with 3D`, () => {
        const { b, d } = cantileversInXY();
        modelStore.addElement(b, d, 'frame');
        modelStore.addConstraint(tie(b, d));
        expectPlaneSolveAgreesWith3D('xy', take, b);
      });
    }
  }

  it('an axial tie on an X–Y cut keeps the 3D slave displacement to 1e-12', () => {
    const { b, d } = cantileversInXY();
    modelStore.addConstraint({ type: 'linearMPC', terms: [{ nodeId: b, dof: 0, coefficient: 1 }, { nodeId: d, dof: 0, coefficient: -1 }] } as Constraint3D);
    const r3 = modelStore.solve3D(false, false, true);
    if (!r3 || typeof r3 === 'string') throw new Error(`3D: ${String(r3)}`);
    const ux3 = r3.displacements.find((x) => x.nodeId === d)!.ux;
    expect(Math.abs(ux3)).toBeGreaterThan(1e-9);
    expect(sliceAt('xy', 0).ok).toBe(true);
    uiStore.analysisMode = '2d';
    const r2 = modelStore.solve(false);
    if (!r2 || typeof r2 === 'string') throw new Error(`2D: ${String(r2)}`);
    expect(r2.displacements.find((x) => x.nodeId === d)!.ux).toBeCloseTo(ux3, 12);
  });

  const coupled: Array<[string, DrawPlane, (b: number, d: number) => Constraint3D]> = [
    ['an MPC tying the Y–Z sway to an out-of-plane ux', 'yz', (b, d) => ({ type: 'linearMPC', terms: [{ nodeId: d, dof: 1, coefficient: 1 }, { nodeId: b, dof: 0, coefficient: 1 }] }) as Constraint3D],
    ['an MPC tying the X–Z sway to an out-of-plane uy', 'xz', (b, d) => ({ type: 'linearMPC', terms: [{ nodeId: d, dof: 0, coefficient: 1 }, { nodeId: b, dof: 1, coefficient: 1 }] }) as Constraint3D],
    ['an eccentric connection offset out of a Y–Z frame', 'yz', (b, d) => ({ type: 'eccentricConnection', masterNode: b, slaveNode: d, offsetX: 0.5, offsetY: 5, offsetZ: 0 }) as Constraint3D],
  ];
  for (const [what, plane, tie] of coupled) {
    it(`${what} is refused: a plane model cannot keep it`, () => {
      const { b, d } = plane === 'yz' ? columnsInYZ() : columnsInXZ();
      modelStore.addElement(b, d, 'frame');
      const free = modelStore.solve3D(false, false, true);
      if (!free || typeof free === 'string') throw new Error(`3D: ${String(free)}`);
      modelStore.addConstraint(tie(b, d));
      const tied = modelStore.solve3D(false, false, true);
      if (!tied || typeof tied === 'string') throw new Error(`3D: ${String(tied)}`);
      const sway = (r: typeof tied) => inPlane3D(plane, r.displacements.find((x) => x.nodeId === b)!)[0];
      expect(Math.abs(sway(tied) - sway(free))).toBeGreaterThan(1e-3 * Math.abs(sway(free)));
      for (const take of [() => sliceAt(plane, 0), () => projectOnto(plane)]) {
        expect(take()).toEqual({ ok: false, error: 'slice.constraintsCoupled' });
        expect(uiStore.simplified2DMode).toBe(false);
      }
      expect(modelStore.solve(false, plane)).toBe(t('svc.constraintsCoupled'));
      expect(modelStore.buildSolverInput(false, plane)).toBeNull();
    });
  }

  for (const [what, tie] of [
    ['a sway tie', (b: number, far: number) => ({ type: 'equalDOF', masterNode: b, slaveNode: far, dofs: [1] })],
    ['an MPC', (b: number, far: number) => ({ type: 'linearMPC', terms: [{ nodeId: b, dof: 1, coefficient: 1 }, { nodeId: far, dof: 1, coefficient: -1 }] })],
  ] as Array<[string, (b: number, far: number) => Constraint3D]>) {
    it(`${what} from the cut to a node left out of it refuses the cut`, () => {
      const { b } = columnsInYZ();
      const ground = modelStore.addNode(5, 0, 0), far = modelStore.addNode(5, 0, 3);
      modelStore.addElement(ground, far, 'frame');
      modelStore.addSupport(ground, 'fixed3d');
      modelStore.addConstraint(tie(b, far));
      const before = modelStore.constraints.length;
      expect(sliceAt('yz', 0)).toEqual({ ok: false, error: 'slice.constraintsCrossCut' });
      expect(uiStore.simplified2DMode).toBe(false);
      expect(modelStore.constraints).toHaveLength(before);
      expect(t('switch2d.constraintsCrossCut')).not.toBe('switch2d.constraintsCrossCut');
    });
  }

  for (const [what, tie] of [
    ['a rigid link on uy', (b: number, far: number) => ({ type: 'rigidLink', masterNode: b, slaveNode: far, dofs: [1] })],
    ['a translational rigid link', (b: number, far: number) => ({ type: 'rigidLink', masterNode: b, slaveNode: far })],
    ['a floor diaphragm', (b: number, far: number) => ({ type: 'diaphragm', masterNode: b, slaveNodes: [far], plane: 'XY' })],
  ] as Array<[string, (b: number, far: number) => Constraint3D]>) {
    it(`${what} between parallel Y–Z frames at different depths is refused: its arm turns rz into sway`, () => {
      const { b } = columnsInYZ();
      const ground = modelStore.addNode(2, 2, 0), far = modelStore.addNode(2, 2, 3);
      modelStore.addElement(ground, far, 'frame');
      modelStore.addSupport(ground, 'fixed3d');
      modelStore.addConstraint(tie(b, far));
      expect(projectOnto('yz')).toEqual({ ok: false, error: 'slice.constraintsCoupled' });
      expect(uiStore.simplified2DMode).toBe(false);
      expect(modelStore.solve(false, 'yz')).toBe(t('svc.constraintsCoupled'));
    });
  }

  it('a rotation-only rigid link between frames at different depths is kept: it has no arm', () => {
    const { b, d } = columnsInYZ();
    modelStore.addElement(b, d, 'frame');
    const ground = modelStore.addNode(2, 2, 0), far = modelStore.addNode(2, 2, 3);
    modelStore.addElement(ground, far, 'frame');
    modelStore.addSupport(ground, 'fixed3d');
    modelStore.addConstraint({ type: 'rigidLink', masterNode: b, slaveNode: far, dofs: [3] } as Constraint3D);
    expect(projectOnto('yz').ok).toBe(true);
    expect(modelStore.constraints).toHaveLength(1);
    uiStore.analysisMode = '2d';
    const r2 = modelStore.solve(false);
    if (!r2 || typeof r2 === 'string') throw new Error(`2D: ${String(r2)}`);
    const turn = (id: number) => r2.displacements.find((x) => x.nodeId === id)!.ry;
    expect(Math.abs(turn(b))).toBeGreaterThan(1e-9);
    expect(turn(far)).toBeCloseTo(turn(b), 12);
  });

  it('a projection that merges a constrained node into another is refused: the 2D model would keep a link to a node it no longer has', () => {
    const { b } = columnsInYZ();
    const ground = modelStore.addNode(2, 0, 0), far = modelStore.addNode(2, 0, 3);
    modelStore.addElement(ground, far, 'frame');
    modelStore.addSupport(ground, 'fixed3d');
    modelStore.addConstraint({ type: 'rigidLink', masterNode: b, slaveNode: far, dofs: [3] } as Constraint3D);
    const before = modelStore.constraints.length;
    expect(projectOnto('yz')).toEqual({ ok: false, error: 'slice.constraintsCrossCut' });
    expect(uiStore.simplified2DMode).toBe(false);
    expect(modelStore.constraints).toHaveLength(before);
  });

  it('a slice leaves behind a coupling tie on another frame and solves', () => {
    const { b, d } = columnsInXZ();
    modelStore.addElement(b, d, 'frame');
    const e = modelStore.addNode(0, 5, 0), f = modelStore.addNode(0, 5, 3), g = modelStore.addNode(5, 5, 3);
    modelStore.addElement(e, f, 'frame');
    modelStore.addElement(f, g, 'frame');
    modelStore.addSupport(e, 'fixed3d');
    modelStore.addConstraint({ type: 'linearMPC', terms: [{ nodeId: f, dof: 0, coefficient: 1 }, { nodeId: g, dof: 1, coefficient: 1 }] } as Constraint3D);
    expect(sliceAt('xz', 0).ok).toBe(true);
    expect(modelStore.constraints).toEqual([]);
    uiStore.analysisMode = '2d';
    const r2 = modelStore.solve(false);
    if (!r2 || typeof r2 === 'string') throw new Error(`2D: ${String(r2)}`);
    expect(Math.abs(r2.displacements.find((x) => x.nodeId === b)!.ux)).toBeGreaterThan(1e-6);
  });

  it('an X–Z frame keeps its constraints as they are', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
    const c = modelStore.addNode(5, 0, 0), d = modelStore.addNode(5, 0, 3);
    modelStore.addElement(a, b, 'frame');
    modelStore.addElement(c, d, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addSupport(c, 'fixed3d');
    modelStore.addNodalLoad3D(b, 10, 0, 0, 0, 0, 0);
    modelStore.addConstraint({ type: 'linearMPC', terms: [{ nodeId: d, dof: 0, coefficient: 1 }, { nodeId: b, dof: 4, coefficient: 2 }] } as Constraint3D);
    expectPlaneSolveAgreesWith3D('xz', 'slice', b);
  });

  it('restoring 3D brings back the constraints as they were written', () => {
    const { b, d } = columnsInYZ();
    const tie = { type: 'equalDOF', masterNode: b, slaveNode: d, dofs: [1] } as Constraint3D;
    modelStore.addConstraint(tie);
    expect(sliceAt('yz', 0).ok).toBe(true);
    expect(modelStore.constraints).toEqual([{ ...tie, dofs: [0] }]);
    restore3D();
    expect(modelStore.constraints).toEqual([tie]);
  });
});

describe('a cut bends each member about the axis the space model bends it about (#1238)', () => {
  function portalInYZ(roll: number): { b: number; d: number; columns: number[]; beam: number } {
    const { b, d, columns } = columnsInYZ(roll);
    return { b, d, columns, beam: modelStore.addElement(b, d, 'frame') };
  }

  it('an I portal standing in Y–Z, its columns bending about the weak axis, is cut with the weak-axis inertia and agrees with 3D', () => {
    for (const take of [() => sliceAt('yz', 0), () => projectOnto('yz')]) {
      modelStore.clear();
      resetSwitchBackup();
      uiStore.analysisMode = '3d';
      const { b, d, columns } = portalInYZ(0);
      const sectionsBefore = [...modelStore.sections.keys()];
      const [ub3, ud3] = swayOfBothHeads3D(b, d);
      expect(ub3).toBeGreaterThan(0.012);
      expect(membersBentOffAxis('yz', modelStore.elements.keys(), modelStore.elements, modelStore.nodes, modelStore.sections)).toEqual([]);
      expect(take().ok).toBe(true);
      for (const id of columns) {
        const s = modelStore.sections.get(modelStore.elements.get(id)!.sectionId)!;
        expect(s.rotation).toBe(90);
        expect(effectiveBendingInertia(s)).toBeCloseTo(spaceBendingInertias(s).iz, 15);
      }
      const [ub2, ud2] = swayOfBothHeads2D(b, d);
      expect(ub2).toBeCloseTo(ub3, 9);
      expect(ud2).toBeCloseTo(ud3, 9);
      restore3D();
      expect([...modelStore.sections.keys()]).toEqual(sectionsBefore);
      for (const id of columns) expect(modelStore.elements.get(id)!.sectionId).toBe(sectionsBefore[0]);
    }
  });

  it('horizontal I members cut along X–Y bend about their weak axis there, as in 3D', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 0);
    const c = modelStore.addNode(0, 4, 0), d = modelStore.addNode(3, 4, 0);
    modelStore.addElement(a, b, 'frame');
    modelStore.addElement(c, d, 'frame');
    modelStore.addElement(b, d, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addSupport(c, 'fixed3d');
    modelStore.addNodalLoad3D(b, 0, 10, 0, 0, 0, 0);
    const r3 = modelStore.solve3D(false, false, true);
    if (!r3 || typeof r3 === 'string') throw new Error(`3D: ${String(r3)}`);
    const uy3 = r3.displacements.find((x) => x.nodeId === b)!.uy;
    expect(Math.abs(uy3)).toBeGreaterThan(1e-3);
    expect(sliceAt('xy', 0).ok).toBe(true);
    uiStore.analysisMode = '2d';
    const r2 = modelStore.solve(false);
    if (!r2 || typeof r2 === 'string') throw new Error(`2D: ${String(r2)}`);
    expect(r2.displacements.find((x) => x.nodeId === b)!.uz).toBeCloseTo(uy3, 9);
  });

  it('a rolled column in an X–Z cut bends about its weak axis there, as in 3D', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
    const column = modelStore.addElement(a, b, 'frame');
    modelStore.elements.get(column)!.rollAngle = 90;
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addNodalLoad3D(b, 10, 0, 0, 0, 0, 0);
    const r3 = modelStore.solve3D(false, false, true);
    if (!r3 || typeof r3 === 'string') throw new Error(`3D: ${String(r3)}`);
    const ux3 = r3.displacements.find((x) => x.nodeId === b)!.ux;
    const s = modelStore.sections.get(modelStore.elements.get(column)!.sectionId)!;
    const { iz } = spaceBendingInertias(s);
    const e = modelStore.materials.get(modelStore.elements.get(column)!.materialId)!.e * 1000;
    expect(ux3).toBeCloseTo((10 * 27) / (3 * e * iz), 6);
    expect(sliceAt('xz', 0).ok).toBe(true);
    uiStore.analysisMode = '2d';
    const r2 = modelStore.solve(false);
    if (!r2 || typeof r2 === 'string') throw new Error(`2D: ${String(r2)}`);
    expect(r2.displacements.find((x) => x.nodeId === b)!.ux).toBeCloseTo(ux3, 9);
  });

  it('a channel that would have to be turned in the plane model is refused, its sign of turn being unknown there', () => {
    const { columns } = portalInYZ(0);
    const sid = modelStore.addSection({ name: 'UPN 200', shape: 'U', a: 0.00322, iy: 1.91e-5, iz: 1.48e-6, j: 1.1e-7, b: 0.075, h: 0.2, tw: 0.0085, tf: 0.0115 } as never);
    for (const id of columns) modelStore.elements.get(id)!.sectionId = sid;
    expect(membersBentOffAxis('yz', columns, modelStore.elements, modelStore.nodes, modelStore.sections)).toEqual(columns);
    expect(sliceAt('yz', 0)).toEqual({ ok: false, error: 'slice.sectionAxis' });
  });

  it('the same portal with its columns turned to bend about the strong axis is cut, and agrees with 3D', () => {
    const { b, d } = portalInYZ(90);
    const [ub3, ud3] = swayOfBothHeads3D(b, d);
    expect(sliceAt('yz', 0).ok).toBe(true);
    const [ub2, ud2] = swayOfBothHeads2D(b, d);
    expect(ub2).toBeCloseTo(ub3, 9);
    expect(ud2).toBeCloseTo(ud3, 9);
  });

  it('the portal standing in X–Z, with default axes, is cut and agrees with 3D', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
    const c = modelStore.addNode(5, 0, 0), d = modelStore.addNode(5, 0, 3);
    modelStore.addElement(a, b, 'frame');
    modelStore.addElement(c, d, 'frame');
    modelStore.addElement(b, d, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addSupport(c, 'fixed3d');
    modelStore.addNodalLoad3D(b, 10, 0, 0, 0, 0, 0);
    const r3 = modelStore.solve3D(false, false, true);
    if (!r3 || typeof r3 === 'string') throw new Error(`3D: ${String(r3)}`);
    const sway3 = r3.displacements.find((x) => x.nodeId === b)!.ux;
    expect(sliceAt('xz', 0).ok).toBe(true);
    uiStore.analysisMode = '2d';
    const r2 = modelStore.solve(false);
    if (!r2 || typeof r2 === 'string') throw new Error(`2D: ${String(r2)}`);
    expect(r2.displacements.find((x) => x.nodeId === b)!.ux).toBeCloseTo(sway3, 9);
  });

  it('a section with equal inertias bends alike about either axis, so nothing is refused', () => {
    const { columns } = portalInYZ(0);
    const sid = modelStore.addSection({ name: 'square', a: 0.01, iy: 2e-5, iz: 2e-5, j: 3e-5, b: 0.2, h: 0.2 } as never);
    for (const id of modelStore.elements.keys()) modelStore.elements.get(id)!.sectionId = sid;
    expect(membersBentOffAxis('yz', columns, modelStore.elements, modelStore.nodes, modelStore.sections)).toEqual([]);
  });

  it('a section with equal inertias but a wide outline still turns when the plane bends it about the other axis', () => {
    const { columns } = portalInYZ(0);
    const sid = modelStore.addSection({ name: 'wide', a: 0.006, iy: 2e-5, iz: 2e-5, j: 1e-7, b: 0.3, h: 0.15 } as never);
    for (const id of modelStore.elements.keys()) modelStore.elements.get(id)!.sectionId = sid;
    const bending = planeBending('yz', columns, modelStore.elements, modelStore.nodes, modelStore.sections);
    expect(bending.offAxis).toEqual([]);
    for (const id of columns) expect(bending.turns.get(id)).toEqual({ rotation: 90, sections: [sid] });
    expect(sliceAt('yz', 0).ok).toBe(true);
    for (const id of columns) {
      const s = modelStore.sections.get(modelStore.elements.get(id)!.sectionId)!;
      expect(s.rotation).toBe(90);
      expect([s.b, s.h]).toEqual([0.3, 0.15]);
    }
  });

  it('a square rolled 45° bends with the same inertia but its corner is farther out, so the cut is refused', () => {
    const { columns } = portalInYZ(0);
    const sid = modelStore.addSection({ name: 'square', a: 0.04, iy: 1.3333e-4, iz: 1.3333e-4, j: 2.25e-4, b: 0.2, h: 0.2, shape: 'rect' } as never);
    for (const id of modelStore.elements.keys()) modelStore.elements.get(id)!.sectionId = sid;
    const guard = () => membersBentOffAxis('yz', columns, modelStore.elements, modelStore.nodes, modelStore.sections);
    expect(guard()).toEqual([]);
    for (const id of columns) modelStore.elements.get(id)!.rollAngle = 45;
    expect(guard()).toEqual([...columns].sort((x, y) => x - y));
    const tube = modelStore.addSection({ name: 'tube', a: 0.004, iy: 5e-6, iz: 5e-6, j: 1e-5, d: 0.2, t: 0.008, shape: 'CHS' } as never);
    for (const id of columns) modelStore.elements.get(id)!.sectionId = tube;
    expect(guard()).toEqual([]);
  });

  it('a T rolled half a turn hangs its flange on the other side, so the cut is refused unless the outline is doubly symmetric', () => {
    const a = modelStore.addNode(0, 0, 3), b = modelStore.addNode(5, 0, 3);
    const beam = modelStore.addElement(a, b, 'frame');
    const tee = modelStore.addSection({ name: 'T', shape: 'T', a: 0.005, iy: 2e-5, iz: 4e-6, j: 1e-7, b: 0.15, h: 0.2, tw: 0.01, tf: 0.015 } as never);
    const ipe = modelStore.addSection({ name: 'IPE 300', shape: 'I', a: 0.00538, iy: 8.356e-5, iz: 6.04e-6, j: 2.01e-7, b: 0.15, h: 0.3, tw: 0.0071, tf: 0.0107 } as never);
    const guard = () => membersBentOffAxis('xz', [beam], modelStore.elements, modelStore.nodes, modelStore.sections);
    const el = modelStore.elements.get(beam)!;
    el.sectionId = tee;
    expect(guard()).toEqual([]);
    el.rollAngle = 180;
    expect(guard()).toEqual([beam]);
    el.sectionId = ipe;
    expect(guard()).toEqual([]);
  });

  it('a T on a member drawn the other way faces the plane model\'s local y the other way, so the cut is refused', () => {
    const a = modelStore.addNode(5, 0, 3), b = modelStore.addNode(0, 0, 3);
    const beam = modelStore.addElement(a, b, 'frame');
    const tee = modelStore.addSection({ name: 'T', shape: 'T', a: 0.005, iy: 2e-5, iz: 4e-6, j: 1e-7, b: 0.15, h: 0.2, tw: 0.01, tf: 0.015 } as never);
    const guard = () => membersBentOffAxis('xz', [beam], modelStore.elements, modelStore.nodes, modelStore.sections);
    modelStore.elements.get(beam)!.sectionId = tee;
    expect(guard()).toEqual([beam]);
    modelStore.elements.get(beam)!.rollAngle = 180;
    expect(guard()).toEqual([]);
  });

  it('a section turned −90° is judged as the same section turned 270°', () => {
    const a = modelStore.addNode(0, 0, 3), b = modelStore.addNode(5, 0, 3);
    const beam = modelStore.addElement(a, b, 'frame');
    const tee = (rotation: number) => modelStore.addSection({ name: 'T', shape: 'T', a: 0.005, iy: 1e-5, iz: 1e-5, j: 1e-7, b: 0.15, h: 0.2, tw: 0.01, tf: 0.015, rotation } as never);
    const guard = () => membersBentOffAxis('xz', [beam], modelStore.elements, modelStore.nodes, modelStore.sections);
    modelStore.elements.get(beam)!.sectionId = tee(270);
    expect(guard()).toEqual([]);
    modelStore.elements.get(beam)!.sectionId = tee(-90);
    expect(guard()).toEqual([]);
  });

  it('a column whose section is turned 30° couples in-plane and out-of-plane bending, so even an X–Z cut is refused', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
    const column = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addNodalLoad3D(b, 10, 0, 0, 0, 0, 0);
    const sid = modelStore.addSection({ name: 'turned I', a: 0.0069, iy: 9.8e-5, iz: 4.51e-6, j: 4.7e-7, b: 0.125, h: 0.3, rotation: 30 } as never);
    modelStore.elements.get(column)!.sectionId = sid;
    const r3 = modelStore.solve3D(false, false, true);
    if (!r3 || typeof r3 === 'string') throw new Error(`3D: ${String(r3)}`);
    const head = r3.displacements.find((x) => x.nodeId === b)!;
    expect(Math.abs(head.uy)).toBeGreaterThan(0.05 * Math.abs(head.ux));
    expect(membersBentOffAxis('xz', [column], modelStore.elements, modelStore.nodes, modelStore.sections)).toEqual([column]);
    expect(sliceAt('xz', 0)).toEqual({ ok: false, error: 'slice.sectionAxis' });
  });

  it('a nearly aligned, strongly anisotropic section is judged by its stiffness, not by the size of its coupling', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
    const column = modelStore.addElement(a, b, 'frame');
    const turned = (rotation: number) => modelStore.addSection({ name: 'blade', a: 0.01, iy: 1e-12, iz: 1, j: 1e-6, b: 1, h: 0.01, rotation } as never);
    const guard = () => membersBentOffAxis('xz', [column], modelStore.elements, modelStore.nodes, modelStore.sections);
    modelStore.elements.get(column)!.sectionId = turned(0);
    expect(guard()).toEqual([]);
    modelStore.elements.get(column)!.sectionId = turned(Math.asin(5e-7) * 180 / Math.PI);
    expect(guard()).toEqual([column]);
  });
});
