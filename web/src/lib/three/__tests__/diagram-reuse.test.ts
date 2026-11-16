import { expect, it, vi } from 'vitest';
import * as diagrams from '../../engine/diagrams-3d';
import type { ElementForces3D } from '../../engine/types-3d';
import { modelStore } from '../../store/model.svelte';
import { createDiagramGroup3D } from '../diagram-render-3d';
import { disposeObject } from '../selection-helpers';
import type { Mesh } from 'three';

function force(): ElementForces3D {
  return {
    elementId: 1, length: 5, nStart: 0, nEnd: 0, vyStart: 0, vyEnd: 0,
    vzStart: 0, vzEnd: 0, myStart: 10, myEnd: 10, mzStart: 0, mzEnd: 0, mxStart: 0, mxEnd: 0,
    releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false,
    releaseTStart: false, releaseTEnd: false,
    qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, distributedLoadsY: [], distributedLoadsZ: [], pointLoadsY: [], pointLoadsZ: [],
  };
}

it('samples once per member while retaining the diagram scale and geometry', () => {
  modelStore.clear();
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(5, 0, 0);
  const id = modelStore.addElement(a, b);
  const ef = { ...force(), elementId: id };
  const spy = vi.spyOn(diagrams, 'computeDiagram3D');
  const group = createDiagramGroup3D(modelStore.elements, modelStore.nodes, [ef], 'momentY', 1, false);
  try {
    expect(spy).toHaveBeenCalledTimes(1);
    const mesh = group.children.find(c => c.userData.type === 'diagram3dMesh') as Mesh;
    const positions = mesh.geometry.getAttribute('position');
    expect(positions.count).toBe(42);
    expect(positions.getZ(0)).toBe(0);
    expect(positions.getZ(1)).toBeCloseTo(-0.4, 6);
    expect(positions.getX(40)).toBe(5);
    expect(positions.getZ(41)).toBeCloseTo(-0.4, 6);
  } finally { spy.mockRestore(); disposeObject(group); modelStore.clear(); }
});

it('does not share mutable diagram points between calls', () => {
  const first = diagrams.computeDiagram3D(force(), 'momentY');
  first.points[0].t = 99;
  first.points[0].value = 99;
  const next = diagrams.computeDiagram3D(force(), 'momentY');
  expect(next.points.map(p => p.t)).toEqual(Array.from({ length: 21 }, (_, i) => i / 20));
  expect(next.points.every(p => p.value === 10)).toBe(true);
});

it('retains off-grid point-load jumps and variable-member boundaries', () => {
  const ef = force();
  ef.pointLoadsZ = [{ a: 1.63, p: 7 }];
  const diagram = diagrams.computeDiagram3D(ef, 'shearZ');
  const t = 1.63 / 5;
  expect(diagram.points.find(p => p.t === t - 1e-6)?.value).toBe(0);
  expect(diagram.points.find(p => p.t === t + 1e-6)?.value).toBe(7);
  ef.pointLoadsZ = [];
  ef.pieces = [{ x0: 0, x1: 1.63, sectionId: 1, forces: { ...force(), length: 1.63 } },
    { x0: 1.63, x1: 5, sectionId: 1, forces: { ...force(), length: 3.37, myStart: 20 } }];
  const piecewise = diagrams.computeDiagram3D(ef, 'momentY');
  expect(piecewise.points.find(p => p.t === t)?.value).toBe(10);
  expect(piecewise.maxValue).toBe(20);
});
