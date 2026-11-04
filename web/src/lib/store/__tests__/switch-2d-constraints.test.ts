import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { projectOnto, resetSwitchBackup, restore3D, sliceAt } from '../switch-2d';
import { effectiveBendingInertia, spaceBendingInertias } from '../../engine/solver-service';
import { constraintsMisreadOn, membersBentOffAxis } from '../../geometry/plane-cut-guard';
import type { Constraint3D } from '../../engine/types-3d';

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

describe('a model cut along Y–Z keeps the meaning of its constraints (#466)', () => {
  it('a sway tie on uy is refused rather than dropped from the plane solve', () => {
    const { b, d } = columnsInYZ();
    modelStore.addConstraint({ type: 'equalDOF', masterNode: b, slaveNode: d, dofs: [1] } as Constraint3D);
    const [ub, ud] = swayOfBothHeads3D(b, d);
    expect(ud).toBeCloseTo(ub, 9);
    expect(Math.abs(ud)).toBeGreaterThan(1e-6);
    for (const take of [() => sliceAt('yz', 0), () => projectOnto('yz')]) {
      const outcome = take();
      expect(outcome).toEqual({ ok: false, error: 'slice.constraintsPlane' });
      expect(uiStore.simplified2DMode).toBe(false);
      expect(modelStore.nodes.get(d)!.y).toBe(5);
    }
  });

  it('an out-of-plane tie on ux is refused rather than read as an in-plane one', () => {
    const { b, d } = columnsInYZ();
    modelStore.addConstraint({ type: 'equalDOF', masterNode: b, slaveNode: d, dofs: [0] } as Constraint3D);
    expect(sliceAt('yz', 0)).toEqual({ ok: false, error: 'slice.constraintsPlane' });
  });

  it('a floor diaphragm means the same on a Y–Z cut, so the cut goes ahead and agrees with 3D', () => {
    const { b, d } = columnsInYZ();
    modelStore.addConstraint({ type: 'diaphragm', masterNode: b, slaveNodes: [d], plane: 'XY' } as Constraint3D);
    const [ub3, ud3] = swayOfBothHeads3D(b, d);
    expect(sliceAt('yz', 0).ok).toBe(true);
    const [ub2, ud2] = swayOfBothHeads2D(b, d);
    expect(ub2).toBeCloseTo(ub3, 9);
    expect(ud2).toBeCloseTo(ud3, 9);
    expect(Math.abs(ud2)).toBeGreaterThan(1e-6);
  });

  it('a full rigid link means the same on a Y–Z cut', () => {
    const { b, d } = columnsInYZ();
    modelStore.addConstraint({ type: 'rigidLink', masterNode: b, slaveNode: d, dofs: [0, 1, 2, 3, 4, 5] } as Constraint3D);
    expect(sliceAt('yz', 0).ok).toBe(true);
  });

  it('an X–Z cut keeps every constraint, as the plane solver reads them', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
    const c = modelStore.addNode(5, 0, 0), d = modelStore.addNode(5, 0, 3);
    modelStore.addElement(a, b, 'frame');
    modelStore.addElement(c, d, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addSupport(c, 'fixed3d');
    modelStore.addNodalLoad3D(b, 10, 0, 0, 0, 0, 0);
    modelStore.addConstraint({ type: 'equalDOF', masterNode: b, slaveNode: d, dofs: [0] } as Constraint3D);
    expect(sliceAt('xz', 0).ok).toBe(true);
  });

  function cantileversInXY(): { b: number; d: number } {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 0);
    const c = modelStore.addNode(0, 5, 0), d = modelStore.addNode(3, 5, 0);
    for (const id of [modelStore.addElement(a, b, 'frame'), modelStore.addElement(c, d, 'frame')]) {
      modelStore.elements.get(id)!.rollAngle = 90;
    }
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addSupport(c, 'fixed3d');
    modelStore.addNodalLoad3D(b, 10, 0, 0, 0, 0, 0);
    return { b, d };
  }

  it('an axial tie written as a linear MPC on ux means the same on an X–Y cut, so the cut goes ahead and agrees with 3D', () => {
    const { b, d } = cantileversInXY();
    const tie = { type: 'linearMPC', terms: [{ nodeId: b, dof: 0, coefficient: 1 }, { nodeId: d, dof: 0, coefficient: -1 }] } as Constraint3D;
    modelStore.addConstraint(tie);
    expect(constraintsMisreadOn('xy', [tie], new Set([b, d]))).toEqual([]);
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

  it('a linear MPC on uz, out of an X–Y cut, is refused rather than read as an in-plane one', () => {
    const { b, d } = cantileversInXY();
    const tie = { type: 'linearMPC', terms: [{ nodeId: b, dof: 2, coefficient: 1 }, { nodeId: d, dof: 2, coefficient: -1 }] } as Constraint3D;
    modelStore.addConstraint(tie);
    expect(constraintsMisreadOn('xy', [tie], new Set([b, d]))).toEqual([tie]);
    expect(sliceAt('xy', 0)).toEqual({ ok: false, error: 'slice.constraintsPlane' });
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
