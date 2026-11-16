import { expect, it } from 'vitest';
import { computeDiagram3D } from '../../diagrams-3d';
import { computeElementDiagram } from '../../diagrams';
import type { ElementForces3D } from '../../types-3d';
import { physicalRegion, transferRegionToCarriers } from '../physical-region-loads';
import { regionModel } from './physical-region-invariance';
import { floorLoad } from '../floor-loads';
import { modelStore } from '../../../store/model.svelte';
import '../../../store/index';
import { buildSolverInput2D, buildSolverInput3D, loadRefusal } from '../../solver-service';

const regression = it.skip;
const empty = { elementId: 1, length: 100, nStart: 0, nEnd: 0, vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 0, mxStart: 0, mxEnd: 0, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0, pointLoadsX: [], pointLoadsY: [], pointLoadsZ: [], distributedLoadsY: [], distributedLoadsZ: [] } as ElementForces3D;
for (const axis of ['x', 'y', 'z'] as const) for (const sign of [1, -1]) for (const width of [1, 1e-8]) regression(`density boundaries retain cancelling ${axis} peak sign=${sign} width=${width}`, () => {
  const moments = (value: number) => ({ x: [0, 0, 0], y: [0, 0, 0], z: [0, 0, 0], [axis]: [value, value, value] }) as NonNullable<ElementForces3D['memberMoments']>[number]['moments'];
  const a = 1, b = a + width, c = b + width;
  const ef = { ...empty, memberMoments: [{ a, b, moments: moments(sign / (b - a)) }, { a: b, b: c, moments: moments(-sign / (c - b)) }] };
  const d = computeDiagram3D(ef, axis === 'x' ? 'torsion' : axis === 'y' ? 'momentY' : 'momentZ');
  expect(d.maxValue).toBeCloseTo(sign > 0 ? 1 : 0, 10);
  expect(d.minValue).toBeCloseTo(sign < 0 ? -1 : 0, 10);
  expect(d.maxAbsValue).toBeCloseTo(sign, 10);
  for (const x of [a, b, c]) expect(d.points.some(p => p.t === x / ef.length)).toBe(true);
});
for (const axis of ['x', 'y', 'z'] as const) for (const sign of [1, -1]) regression(`quadratic ${axis} density finds both off-grid critical stations sign=${sign}`, () => {
  const moments = { x: [0, 0, 0], y: [0, 0, 0], z: [0, 0, 0], [axis]: [3 * sign / 16, -sign / 16, 3 * sign / 16] } as NonNullable<ElementForces3D['memberMoments']>[number]['moments'];
  const ef = { ...empty, memberMoments: [{ a: 1, b: 2, moments }, { a: 2, b: 3, moments: { ...moments, [axis]: [-sign / 48, -sign / 48, -sign / 48] } }] };
  const d = computeDiagram3D(ef, axis === 'x' ? 'torsion' : axis === 'y' ? 'momentY' : 'momentZ');
  expect(d.maxValue).toBeCloseTo(sign > 0 ? 1 / 48 : 0, 12);
  expect(d.minValue).toBeCloseTo(sign < 0 ? -1 / 48 : 0, 12);
  for (const x of [1.25, 1.75]) expect(d.points.some(p => Math.abs(p.t - x / 100) < 1e-12)).toBe(true);
});
for (const plane of [true, false]) for (const sign of [1, -1]) regression(`partial force critical stations plane=${plane} sign=${sign}`, () => {
  const loads = [{ a: 1, b: 2, qI: sign, qJ: -sign }];
  const d = plane ? computeElementDiagram('shear', { mStart: 0, mEnd: 0, vStart: 0, vEnd: 0, nStart: 0, nEnd: 0, qI: 0, qJ: 0, length: 100, distributedLoads: loads }, 0, 0, 100, 0) : computeDiagram3D({ ...empty, distributedLoadsY: loads }, 'shearY');
  expect(d.maxValue).toBeCloseTo(sign > 0 ? 1 / 4 : 0, 12);
  expect(d.minValue).toBeCloseTo(sign < 0 ? -1 / 4 : 0, 12);
});
for (const angle of [0, 0.37]) for (const mirror of [1, -1]) for (const split of [false, true]) regression(`separated collinear carriers preserve actual intervals angle=${angle} mirror=${mirror} split=${split}`, () => {
  const transform = ([x, y]: number[]): [number, number] => [mirror * x! * Math.cos(angle) - y! * Math.sin(angle), mirror * x! * Math.sin(angle) + y! * Math.cos(angle)];
  const corners = [[0, 0], [10, 0], [10, 10], [7, 10], [5, 9], [3, 10], [0, 10]];
  const ring = corners.flatMap((p, i) => split ? [p, p.map((v, j) => (v + corners[(i + 1) % corners.length]![j]!) / 2)] : [p]).map(transform);
  const model = regionModel([ring]);
  const full = transferRegionToCarriers(model, physicalRegion(corners.map(transform)), [...model.elements.keys()]);
  expect(full.pieces.reduce((s, p) => s + (p.wI + p.wJ) * (p.b - p.a) / 2, 0)).toBeCloseTo(98, 10);
  const patch = transferRegionToCarriers(model, physicalRegion([[4.9, 8.8], [5.1, 8.8], [5.1, 8.9], [4.9, 8.9]].map(transform)), [...model.elements.keys()]);
  const ids = split ? [4, 13] : [2, 7];
  expect([...new Set(patch.pieces.map(p => p.elementId))].sort((a, b) => a - b)).toEqual(ids);
  for (const id of ids) {
    const pieces = patch.pieces.filter(p => p.elementId === id);
    expect(pieces.reduce((s, p) => s + (p.wI + p.wJ) * (p.b - p.a) / 2, 0)).toBeCloseTo(0.01, 12);
    for (const p of pieces) { expect(p.wI).toBeCloseTo(0.1, 10); expect(p.wJ).toBeCloseTo(0.1, 10); }
  }
  expect(floorLoad({ nodes: model.nodes, beams: [...model.elements.values()], q: 1, distribution: 'twoWay' }).totalKN).toBeCloseTo(98, 10);
});
for (const plane of [true, false]) regression(`moment refusals reach the localized load channel plane=${plane}`, () => {
  modelStore.clear();
  const i = modelStore.addNode(0, 0, 0), j = modelStore.addNode(2, 0, 0), elementId = modelStore.addElement(i, j);
  modelStore.addLoadEntry({ type: 'distributed3d', data: { id: 1, elementId, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, moments: { x: [1, 1, 1], y: [0, 0, 0], z: [0, 0, 0] } } });
  if (!plane) modelStore.updateElement(elementId, { type: 'truss' });
  let caught = false;
  try { plane ? buildSolverInput2D(modelStore.model) : buildSolverInput3D(modelStore.model); } catch (e) { caught = true; expect(loadRefusal(e)).toContain(plane ? 'spatial' : String(elementId)); }
  expect(caught).toBe(true);
});
