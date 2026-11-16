import { expect, it } from 'vitest';
import { modelStore, type DistributedLoad3D, type Load } from '../../../store/model.svelte';
import '../../../store/index';
import { transformInPlace } from '../../../model/edit/transform-in-place';
import { copyTransformed } from '../../../model/edit/transformed-copy';
import { rotation, reflection, compose, translation, applyAxial, applyVector, type Vec3 } from '../../../model/edit/affine';
import { distributedGlobalEnds, distributedGlobalMoments } from '../../member-loads';
import { memberRef3D } from '../../solver-service';
import { splitElementLoads } from '../../../model/edit/member-split';
import { subdivideForAnalysis } from '../../../model/edit/analysis-subdivision';
import { expandVariableMembers, variableExpansionFor } from '../../variable-members';
import { quadraticAt } from '../../member-moments';
import { builtSpec, builtSectionFields } from '../../generators/variable-pair';
import notice from '../../../provenance/result-changes/gravity-physical-regions.json';

const regression = it;

function member(slope = false) {
  modelStore.clear();
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, slope ? 3 : 0, slope ? 2 : 0);
  return modelStore.addElement(a, b);
}

for (const operation of ['inPlace', 'copy'] as const) for (const slope of [false, true]) for (const mirror of [false, true]) for (const frame of ['projected', 'global', 'local'] as const) {
  const run = frame === 'projected' ? regression : it;
  run(`known wrong result: #2219 ${operation} preserves ${frame} intensities slope=${slope} mirror=${mirror}`, () => {
    const id = member(slope), axes = memberRef3D(modelStore.model, id, false)!.axes;
    const d: DistributedLoad3D = { id: 1, elementId: id, frame, a: 1, b: 5, qXI: 2, qXJ: -1, qYI: 3, qYJ: 7, qZI: -4, qZJ: 1, moments: { x: [1, 2, -3], y: [1, 5, 2], z: [-2, 3, 4] } };
    const source = distributedGlobalEnds(d, axes), moments = distributedGlobalMoments(d, axes)!;
    modelStore.addLoadEntry({ type: 'distributed3d', data: d });
    const rotate = rotation([0, 0, 0], [0, 0, 1], 45);
    const T = compose(translation([10, 10, 0]), mirror ? compose(reflection([0, 0, 0], [1, 0, 0]), rotate) : rotate);
    const set = { elements: [id], nodes: [] };
    const to = operation === 'inPlace' ? (transformInPlace(set, T), id) : copyTransformed(set, [T], { withLoads: true }).elements[0]!;
    const load = modelStore.loads.find(l => l.type === 'distributed3d' && l.data.elementId === to)!;
    if (load.type !== 'distributed3d') throw new Error('Missing distributed loading');
    const targetAxes = memberRef3D(modelStore.model, to, false)!.axes;
    const actual = distributedGlobalEnds(load.data, targetAxes), actualMoments = distributedGlobalMoments(load.data, targetAxes)!;
    for (const [g, h] of [[source.gI, actual.gI], [source.gJ, actual.gJ]]) {
      applyVector(T, g!).forEach((v, k) => expect(h![k]).toBeCloseTo(v, 12));
    }
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const v = ['x', 'y', 'z'].map(k => quadraticAt(moments[k as keyof typeof moments], t)) as Vec3;
      applyAxial(T, v).forEach((value, k) => expect(quadraticAt(actualMoments[(['x', 'y', 'z'] as const)[k]!], t)).toBeCloseTo(value, 12));
    }
    if (frame === 'projected') expect(load.data.frame).toBe('global');
  });
}

for (const kind of ['components', 'opposite', 'forceAndMoment'] as const) regression(`known wrong result: #2219 split ${kind} assigns each emitted load a unique id`, () => {
  const h = 0.5e-9;
  const d: DistributedLoad3D = { id: 1, elementId: 1, a: 2 - h, b: 4, qYI: 1, qYJ: 1, qZI: kind === 'components' ? -2 : 0, qZJ: kind === 'components' ? -2 : 0 };
  if (kind === 'opposite') { d.a = 2 - h; d.b = 2; d.qYJ = -1; }
  if (kind === 'forceAndMoment') d.moments = { x: [1, 1, 1], y: [0, 0, 0], z: [0, 0, 0] };
  let id = 10;
  const result = splitElementLoads([{ type: 'distributed3d', data: d }], 1, [0, 2, 6], [2, 3], () => id++);
  const points = result.added.filter(l => l.type === 'pointOnElement3d');
  expect(points).toEqual([]);
  expect(result.added.every(l => l.type === 'distributed3d')).toBe(true);
  expect(result.added.length).toBe(kind === 'opposite' ? 1 : 2);
  expect(new Set(result.added.map(l => l.data.id)).size).toBe(result.added.length);
  modelStore.clear();
  for (const l of result.added) modelStore.addLoadEntry(l);
  expect(modelStore.loads).toHaveLength(result.added.length);
});

for (const operation of ['store', 'analysis', 'variable'] as const) for (const width of [0.5e-12, 0.5e-9, 1e-9, 1.5e-9]) regression(`known wrong result: #2219 ${operation} splits a projected overlap width=${width}`, () => {
  const id = member(true), axes = memberRef3D(modelStore.model, id, false)!.axes, cut = axes.L / 2;
  modelStore.addLoadEntry({ type: 'distributed3d', data: { id: 1, elementId: id, a: cut - width, b: axes.L, frame: 'projected', qXI: 2, qXJ: 2, qYI: 3, qYJ: 3, qZI: -4, qZJ: -4, moments: { x: [1, 1, 1], y: [2, 2, 2], z: [3, 3, 3] } } });
  const original = modelStore.loads[0]!.data as DistributedLoad3D;
  const g = distributedGlobalEnds(original, axes).gI, m = distributedGlobalMoments(original, axes)!;
  let loads: Load[] = [];
  let first = 0;
  const run = () => {
  if (operation === 'store') {
    const split = modelStore.splitElementAtPoint(id, 0.5)!;
    first = split.elemA; loads = modelStore.loads;
  } else if (operation === 'analysis') {
    const split = subdivideForAnalysis(modelStore.model, 2);
    first = split.segments.get(id)![0]!; loads = split.model.loads;
  } else {
    const rect = (h: number) => modelStore.addSection(builtSectionFields(builtSpec('concrete-rect', { b: 0.2, h }))! as never);
    modelStore.updateElement(id, { sectionId: rect(0.2), variableSection: { sectionJ: rect(0.4), segments: 2 } });
    const split = expandVariableMembers(modelStore.model);
    first = variableExpansionFor(modelStore.model)!.members.get(id)!.pieces[0]!.id; loads = split.loads;
  }
  };
  run();
  const part = loads.filter(l => 'elementId' in l.data && l.data.elementId === first);
  const h = cut - original.a!;
  expect(part.length).toBeGreaterThan(0);
  expect(new Set(loads.map(l => l.data.id)).size).toBe(loads.length);
  const force: Vec3 = [0, 0, 0], moment: Vec3 = [0, 0, 0];
  for (const l of part) {
    if (l.type === 'distributed3d') {
      const ends = distributedGlobalEnds(l.data, axes), span = (l.data.b ?? cut) - (l.data.a ?? 0);
      const moments = distributedGlobalMoments(l.data, axes)!;
      for (let k = 0; k < 3; k++) { force[k]! += span * (ends.gI[k]! + ends.gJ[k]!) / 2; moment[k]! += span * moments[(['x', 'y', 'z'] as const)[k]!][0]; }
    } else if (l.type === 'pointOnElement3d') {
      expect(l.data.frame).toBe('global');
      [l.data.px ?? 0, l.data.py, l.data.pz].forEach((v, k) => force[k]! += v);
      [l.data.mx ?? 0, l.data.my ?? 0, l.data.mz ?? 0].forEach((v, k) => moment[k]! += v);
    } else throw new Error('Unexpected load');
  }
  for (let k = 0; k < 3; k++) { expect(force[k]! / h).toBeCloseTo(g[k]!, 11); expect(moment[k]! / h).toBeCloseTo(m[(['x', 'y', 'z'] as const)[k]!][0], 11); }
});

regression('known wrong result: #2219 Hungarian recovery notice includes seismic area rotation and weight regeneration', () => {
  expect(notice.explanation.hu).toContain('#2210');
  expect(notice.explanation.hu).toContain('alaprajzi elforgatás');
  expect(notice.explanation.hu).toContain('szeizmikus súlyokat');
  expect(notice.explanation.hu).toContain('D, L és Lr');
});

for (const operation of ['inPlace', 'copy'] as const) regression(`known wrong result: #2219 ${operation} preserves the unit global Y projected moment`, () => {
  const id = member();
  modelStore.addLoadEntry({ type: 'distributed3d', data: { id: 1, elementId: id, frame: 'projected', qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, moments: { x: [0, 0, 0], y: [1, 1, 1], z: [0, 0, 0] } } });
  const T = compose(translation([10, 10, 0]), rotation([0, 0, 0], [0, 0, 1], 45));
  const set = { elements: [id], nodes: [] };
  const to = operation === 'inPlace' ? (transformInPlace(set, T), id) : copyTransformed(set, [T], { withLoads: true }).elements[0]!;
  const load = modelStore.loads.find(l => l.type === 'distributed3d' && l.data.elementId === to)!;
  if (load.type !== 'distributed3d') throw new Error('Missing distributed loading');
  const m = distributedGlobalMoments(load.data, memberRef3D(modelStore.model, to, false)!.axes)!;
  expect(m.x[0]).toBeCloseTo(-Math.SQRT1_2, 12);
  expect(m.y[0]).toBeCloseTo(Math.SQRT1_2, 12);
  expect(Math.hypot(m.x[0], m.y[0], m.z[0])).toBeCloseTo(1, 12);
});

it('short-span torque stays a density and never reaches endpoint snapping', async () => {
  const { memberLoadSpans } = await import('../member-load-spans');
  const a = 2 - 0.5e-9, h = 2 - a;
  const load = { elementId: 1, a, b: 2, frame: 'global' as const, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, moments: { x: [1 / h, 1 / h, 1 / h] as [number, number, number], y: [0, 0, 0] as [number, number, number], z: [0, 0, 0] as [number, number, number] } };
  const result = memberLoadSpans([load], () => 2);
  expect(result.concentrated).toEqual([]);
  expect(result.distributed).toEqual([load]);
});

it('projected subdivision refuses missing source geometry before emitting any loads', () => {
  let id = 10;
  expect(() => splitElementLoads([{ type: 'distributed3d', data: { id: 1, elementId: 1, frame: 'projected', qYI: 1, qYJ: 1, qZI: 0, qZJ: 0 } }], 1, [0, 2, 6], [2, 3], () => id++)).toThrow('Projected member loading requires source member geometry');
  expect(id).toBe(10);
});

it('plane distributed subdivision retains distinct IDs for every segment', () => {
  let id = 10;
  const result = splitElementLoads([{ type: 'distributed', data: { id: 1, elementId: 1, qI: 1, qJ: 1 } }], 1, [0, 2, 6], [2, 3], () => id++);
  expect(result.added.map(l => l.data.id)).toEqual([10, 11]);
  expect(result.added.map(l => 'elementId' in l.data && l.data.elementId)).toEqual([2, 3]);
});
