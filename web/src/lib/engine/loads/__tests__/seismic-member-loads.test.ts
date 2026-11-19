import { readFileSync, writeFileSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import { computeDiagramValueAt } from '../../diagrams';
import { evaluateDiagramAt } from '../../diagrams-3d';
import { input2DToWireObject, input3DToWireObject, recoverMember, solve, solve3D, solvePDelta, solvePDelta3D } from '../../wasm-solver';
import type { SolverInput } from '../../types';
import type { AnalysisResults3D, SolverInput3D } from '../../types-3d';
import { buildSolverLoads3D, type ModelData } from '../../solver-service';
import type { Load } from '../../../store/model.svelte';
import { R_ELASTIC } from '../../../codes/cirsoc103/behaviour';
import { PERIOD_COEFFICIENTS } from '../../../codes/cirsoc103/static-method';
import { designSpectrum, isBlocked } from '../../../codes/cirsoc103/spectrum';
import { modelStore } from '../../../store';
import { INPRES103_SEISMIC } from '../../../codes/families/cirsoc';
import { bindRole } from '../../../codes/roles';
import { buildLoadPlan, type LoadModelData, type LoadPlanInput, type PlannedNodal, type SeismicPlanSink } from '../load-plan';
import { MODAL_SEISMIC_UNAVAILABLE } from '../seismic-generation';
import { input } from './gravity-width-mass-fixture';
import { mesh, transform } from './snow-surface-round2-fixture';
import { windResultants, remeshWind } from './wind-integration-fixture';

function supportAtZero(model: LoadModelData) {
  const baseNodes = [...model.nodes.values()].filter(n => n.z === 0);
  if (baseNodes.length === 0) {
    const id = Math.max(0, ...model.nodes.keys()) + 1;
    const top = model.nodes.values().next().value!;
    const base = { id, x: top.x, y: top.y, z: 0 };
    model.nodes.set(id, base);
    const elementId = Math.max(0, ...model.elements.keys()) + 1;
    model.materials.set(2, { id: 2, rho: 0 });
    model.elements.set(elementId, { id: elementId, nodeI: id, nodeJ: top.id, sectionId: 1, materialId: 2 });
    baseNodes.push(base);
  }
  model.supports = new Map(baseNodes.map(({ id }) => [id, { nodeId: id }]));
  return model;
}

function tieFloor(model: LoadModelData, masterNode: number, ...slaveNodes: number[]) {
  model.constraints = [...model.constraints ?? [], { type: 'diaphragm', masterNode, slaveNodes, plane: 'XY' }];
}

function request(model: LoadModelData, seismic: Partial<NonNullable<LoadPlanInput['seismic']>> = {}, overrides: Partial<LoadPlanInput> = {}) {
  const result = input(model, {
    dead: [], tributaryWidth: 0,
    seismic: { enabled: true, coefficient: 1, liveParticipation: 0, directions: { x: true, y: false }, ...seismic },
    ...overrides,
  });
  result.regulations.seismic = { ...bindRole('seismic', 'inpres103-2018'), configComplete: true, state: 'applied' };
  return result;
}

it('#2208 an edge subdivision does not move the force away from the mass centroid', () => {
  for (const angle of [0, Math.PI / 4]) for (const mirror of [1, -1]) for (const subdivide of [true, false]) {
    const ring = [[0, 0, 3], [10, 0, 3], [10, 6, 3], [0, 6, 3]];
    if (subdivide) ring.push([0, 1, 3]);
    const model = transform(mesh([ring]), angle, 0, mirror);
    const plan = buildLoadPlan(request(supportAtZero(model)));
    expect(plan.outcome).toBe('READY');
    const lines = plan.distributed.filter(p => p.caseType === 'E');
    const points = plan.nodal.filter(p => p.caseType === 'E');
    const force = 32 * model.sections.get(1)!.a * model.materials.get(1)!.rho;
    expect(plan.factors.baseShear!.value).toBeCloseTo(force, 10);
    const resultants = windResultants(model, lines, points);
    const centroidY = mirror * 5 * Math.sin(angle) + 3 * Math.cos(angle);
    expect(resultants[0]).toBeCloseTo(force, 10);
    expect(resultants[5] / force).toBeCloseTo(-centroidY, 10);
    expect(lines).toEqual([]);
    for (const [i, [x, y, z]] of ring.entries()) {
      const node = [...model.nodes.values()].find(n => n.z === z &&
        n.x === mirror * x! * Math.cos(angle) - y! * Math.sin(angle) &&
        n.y === mirror * x! * Math.sin(angle) + y! * Math.cos(angle))!;
      const actions = points.filter(p => p.nodeId === node.id);
      if (i === 4) expect(actions).toEqual([]);
      else {
        expect(actions).toHaveLength(1);
        expect(actions[0]!.fx / force).toBeCloseTo(8 / 32, 10);
        expect(actions[0]!.fy).toBe(0);
      }
    }
  }
});

const nativeInputs: Array<{ dimension: number; input: unknown }> = [];
const nativeInputPath = process.env.SEISMIC_NATIVE_INPUTS;
const nativeResultsPath = process.env.SEISMIC_NATIVE_RESULTS;
const nativeResults: Array<{ results?: ReturnType<typeof solve> | ReturnType<typeof solve3D>; converged?: boolean }> | undefined =
  nativeResultsPath ? JSON.parse(readFileSync(nativeResultsPath, 'utf8')) : undefined;
let nativeCount = 0;
afterAll(() => {
  if (nativeInputPath) writeFileSync(nativeInputPath, JSON.stringify(nativeInputs));
  if (nativeResults) expect(nativeCount).toBe(nativeResults.length);
});

it('#2316 applies the story force from a thin mass band at the roof', () => {
  for (const width of [2 ** -50, 0.5]) {
    const model = mesh([[[0, 0, 0], [0, 0, 2], [0, 0, 2 + width], [0, 0, 4]]]);
    model.elements.delete(4);
    model.sections.set(1, { id: 1, a: 1 });
    model.materials.set(1, { id: 1, rho: 1 / width });
    model.materials.set(2, { id: 2, rho: 0 });
    model.elements.get(1)!.materialId = 2;
    model.elements.get(3)!.materialId = 2;
    const options = request(supportAtZero(model), {}, { generateCombinations: true });
    const plan = buildLoadPlan(options);
    const sink = seismicSink();
    INPRES103_SEISMIC.plan(options, plan.seismicModel!, sink);
    const loads = plan.nodal.filter(load => load.caseType === 'E');
    expect.soft(plan.outcome).toBe('READY');
    expect.soft(sink.levelRefusals).toEqual([]);
    expect.soft(windResultants(model, [], loads)[0]).toBeCloseTo(1, 10);
    expect.soft(windResultants(model, [], loads)[4]).toBeCloseTo(4, 10);
    if (width === 0.5) verifyCantilever(model, [...model.elements.values()], false, 4, loads, [[4, 1]]);
  }
});

function verifyCantilever(
  model: LoadModelData, members: Array<{ id: number; nodeI: number; nodeJ: number; sectionId: number }>,
  rotated: boolean, length: number, loads: PlannedNodal[], storyActions: ReadonlyArray<readonly [number, number]>,
  baseElevation = 0,
) {
  const ids = new Set(members.flatMap(e => [e.nodeI, e.nodeJ]));
  const nodes = new Map([...ids].map(id => [id, { id, x: 0, z: model.nodes.get(id)!.z! }]));
  const base = [...nodes.values()].find(n => n.z === baseElevation)!.id, tip = [...nodes.values()].find(n => n.z === baseElevation + length)!.id;
  const plane: SolverInput = {
    ...cantileverSections, nodes, elements: new Map(members.map(e => [e.id, { ...e, materialId: 1, type: 'frame', hingeStart: false, hingeEnd: false }])),
    supports: new Map([[base, { id: base, nodeId: base, type: 'fixed' }]]),
    loads: loads.map(p => ({ type: 'nodal', data: { nodeId: p.nodeId, fx: rotated ? p.fy : p.fx, fz: p.fz, my: 0 } })),
  };
  const spatial = spatialCantilever(model, members, rotated, base, loads);
  for (const is3d of [false, true]) for (const nonlinear of [false, true]) {
    checkCantileverSolve(is3d ? spatial : plane, is3d, nonlinear, result => {
      expect(result.elementForces.map(f => f.elementId).sort()).toEqual(members.map(m => m.id).sort());
      for (const f of result.elementForces) for (const t of [0, 0.2, 0.5, 0.8, 1]) {
        const member = model.elements.get(f.elementId)!;
        const start = nodes.get(member.nodeI)!.z, end = nodes.get(member.nodeJ)!.z;
        const station = start + t * (end - start) - baseElevation;
        const above = storyActions.filter(([z]) => z > station || (t === 1 && z === station));
        const v = above.reduce((sum, [, f]) => sum + f, 0);
        const m = above.reduce((sum, [z, f]) => sum + (z - station) * f, 0);
        if ('vyStart' in f) {
          expect(evaluateDiagramAt(f, 'shearY', t)).toBeCloseTo(-v, 10);
          expect(evaluateDiagramAt(f, 'momentZ', t)).toBeCloseTo(-m, 10);
          expect(evaluateDiagramAt(f, 'torsion', t)).toBeCloseTo(0, 10);
        } else {
          expect(computeDiagramValueAt('shear', t, f)).toBeCloseTo(v, 10);
          expect(computeDiagramValueAt('moment', t, f)).toBeCloseTo(m, 10);
        }
      }
      const d = result.displacements.find(d => d.nodeId === tip)!;
      const displacement = rotated && 'uy' in d ? d.uy : d.ux;
      const flexure = storyActions.reduce((sum, [z, f]) => sum + f * z ** 2 * (3 * length - z), 0);
      expect(displacement).toBeCloseTo(flexure / (6 * 200000 * 1000 * 1e-4), 10);
    });
  }
}

const cantileverSections = {
  materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]),
  sections: new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-4 }]]),
};

function spatialCantilever(
  model: LoadModelData, members: Array<{ id: number; nodeI: number; nodeJ: number; sectionId: number }>,
  rotated: boolean, base: number, loads: PlannedNodal[],
): SolverInput3D {
  const ids = new Set(members.flatMap(e => [e.nodeI, e.nodeJ]));
  return {
    ...cantileverSections, nodes: new Map([...ids].map(id => [id, { ...model.nodes.get(id)!, z: model.nodes.get(id)!.z! }])),
    elements: new Map(members.map(e => [e.id, { ...e, materialId: 1, type: 'frame', localYx: rotated ? 0 : 1, localYy: rotated ? 1 : 0, localYz: 0,
      releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }])),
    supports: new Map([[base, { nodeId: base, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
    loads: loads.map(p => ({ type: 'nodal', data: { nodeId: p.nodeId, fx: p.fx, fy: p.fy, fz: p.fz, mx: 0, my: 0, mz: p.mz ?? 0 } })),
  };
}

function checkCantileverSolve(
  input: SolverInput | SolverInput3D, is3d: boolean, nonlinear: boolean,
  verify: (result: ReturnType<typeof solve> | ReturnType<typeof solve3D>) => void,
) {
  if (nonlinear) {
    const solution = is3d ? solvePDelta3D(input as SolverInput3D) : solvePDelta(input as SolverInput);
    expect(solution.converged).toBe(true);
    verify(solution.results);
  } else {
    verify(is3d ? solve3D(input as SolverInput3D) : solve(input as SolverInput));
  }
  if (nativeInputPath) {
    const model = is3d ? input3DToWireObject(input as SolverInput3D) : input2DToWireObject(input as SolverInput);
    nativeInputs.push({ dimension: is3d ? 3 : 2, input: nonlinear ? { analysis: 'pdelta', model } : model });
  }
  if (nativeResults) {
    const solution = nativeResults[nativeCount++]!;
    if (nonlinear) expect(solution.converged).toBe(true);
    verify(nonlinear ? solution.results! : solution as ReturnType<typeof solve> | ReturnType<typeof solve3D>);
  }
}

function verifyCarrierMechanics() {
  const length = 4, half = length / 2;
  for (const variant of ['base', 'uneven', 'rotate', 'mirror'] as const) {
    const { model, sources } = remeshWind(mesh([-2, 2].map(y => [[0, y, 0], [0, y, length]])), variant);
    const rotated = variant === 'rotate';
    const tops = [...model.nodes.values()].filter(n => n.z === length);
    tieFloor(model, tops[0]!.id, tops[1]!.id);
    for (const torsion of ['low', 'medium', 'extreme'] as const) {
      const weightPerLength = model.sections.get(1)!.a * model.materials.get(1)!.rho;
      const staticRequest = request(supportAtZero(model), {
        torsion, directions: { x: !rotated, y: rotated },
      });
      const plan = buildLoadPlan(staticRequest);
      expect(plan.outcome).toBe('READY');
      expect(plan.distributed.filter(n => n.caseType === 'E')).toEqual([]);
      for (const [caseIndex, c] of plan.cases.entries()) {
        if (c.type !== 'E') continue;
        const eccentricity = { low: 0, medium: 0.05, extreme: 0.1 }[torsion] * (c.nameParams?.sign === '−' ? -1 : 1);
        for (const carrier of [1, 2]) {
          const members = [...model.elements.values()].filter(e => sources.get(e.id) === carrier);
          const ids = new Set(members.flatMap(e => [e.nodeI, e.nodeJ]));
          const root = [...ids].map(id => model.nodes.get(id)!).find(n => n.z === 0)!;
          const radius = rotated ? root.x : -root.y;
          const q = weightPerLength * (1 + eccentricity * radius);
          const parts = plan.nodal.filter(d => d.caseIndex === caseIndex && ids.has(d.nodeId));
          const tip = [...ids].find(id => model.nodes.get(id)!.z === length)!;
          expect(parts).toHaveLength(1);
          expect(parts[0]!.nodeId).toBe(tip);
          expect(rotated ? parts[0]!.fy : parts[0]!.fx).toBeCloseTo(q * (length - half), 10);
          expect(rotated ? parts[0]!.fx : parts[0]!.fy).toBe(0);
          verifyCantilever(model, members, rotated, length, parts, [[length, q * (length - half)]]);
        }
      }
    }
  }
}

it('#2208 tributary nodal actions reproduce cantilever shear, bending, torsion and deflection', () => {
  verifyCarrierMechanics();
});

it('#2208 keeps supported levels when an eccentric strip requires distributed couples', () => {
  const model = mesh([
    [[0, -2, 0], [0, -2, 3]], [[0, 2, 0], [0, 2, 3]], [[0, 2, 6], [4, 2, 6]],
    [[0, 2, 3], [0, 2, 6]],
  ]);
  tieFloor(model, 2, 4);
  model.materials.set(2, { id: 2, rho: 0 });
  model.elements.get(4)!.materialId = 2;
  for (const width of [0, Number.EPSILON, 1]) {
    const base = buildLoadPlan(request(supportAtZero(model), {}, { tributaryWidth: width, dead: [{ labelKey: 'test', q: 1 }] }));
    const plan = buildLoadPlan(request(model, { torsion: 'medium' }, { tributaryWidth: width, dead: [{ labelKey: 'test', q: 1 }], generateCombinations: true }));
    const loads = plan.nodal.filter(d => d.caseType === 'E');
    expect(loads.some(d => d.nodeId === 2)).toBe(true);
    expect(loads.some(d => d.nodeId === 4)).toBe(true);
    expect(loads.some(d => model.nodes.get(d.nodeId)!.z === 6)).toBe(width === 0);
    expect(plan.outcome).toBe(width === 0 ? 'READY' : 'BLOCKED');
    expect(plan.blockedKeys).toEqual(width === 0 ? [] : [{ key: 'loadPlan.blocked.seismicMass.eccentric', params: { elevation: 6 } }]);
    if (width > 0) {
      expect(plan.combinations).toEqual([]);
      const one = loads.filter(d => d.caseIndex === plan.cases.findIndex(c => c.type === 'E'));
      const plain = base.nodal.filter(d => d.caseType === 'E' && model.nodes.get(d.nodeId)!.z === 3);
      expect(windResultants(model, [], one)[0]).toBeCloseTo(windResultants(model, [], plain)[0]!, 10);
    }
  }
});

it('#2208 flat shell self-weight and superimposed pressure follow tributary mass', () => {
  const model = mesh([]);
  for (const [id, y, thickness] of [[1, 0, 0.1], [2, 3, 0.3]]) {
    const points = [[0, y, 3], [1, y, 3], [1, y + 1, 3], [0, y + 1, 3]];
    const nodes = points.map(([x, yy, z], k) => {
      const nodeId = 10 * id + k;
      model.nodes.set(nodeId, { id: nodeId, x, y: yy, z });
      return nodeId;
    });
    model.quads ??= new Map();
    model.quads.set(id, { id, nodes, thickness, materialId: 1 });
  }
  model.materials.set(1, { id: 1, rho: 10 });
  tieFloor(model, 10, 20);
  const plan = buildLoadPlan(request(supportAtZero(model), {}, { gravity: { mode: 'panels' }, dead: [{ labelKey: 'test', q: 2 }] }));
  expect(plan.outcome).toBe('READY');
  expect(plan.distributed.filter(d => d.caseType === 'E')).toEqual([]);
  expect(plan.surface.filter(d => d.caseType === 'E')).toEqual([]);
  const forces = plan.nodal.filter(d => d.caseType === 'E');
  expect(forces).toHaveLength(8);
  for (const [id, weight] of [[1, 3], [2, 5]] as const) {
    const cornerLoads = forces.filter(d => Math.floor(d.nodeId / 10) === id);
    expect(cornerLoads).toHaveLength(4);
    for (const p of cornerLoads) {
      expect(p.fx).toBeCloseTo(weight / 4, 10);
      expect(p.fy).toBe(0);
      expect(p.fz).toBe(0);
    }
  }
});

it('#2208 keeps the supported level’s exact force when an upper tributary panel cannot be transferred', () => {
  const model = mesh([
    [[0, -2, 0], [0, -2, 3]], [[0, 2, 0], [0, 2, 3]],
    [[0, 0, 6], [4, 0, 6], [4, 2, 6], [0, 2, 6]], [[0, 2, 3], [0, 2, 6]],
  ]);
  tieFloor(model, 2, 4);
  model.materials.set(2, { id: 2, rho: 0 });
  model.elements.get(7)!.materialId = 2;
  const density = model.sections.get(1)!.a * model.materials.get(1)!.rho;
  const roofArea = 4 * 2, roofPerimeter = 2 * (4 + 2);
  const lower = 3 * density, upper = roofPerimeter * density + roofArea;
  const plan = buildLoadPlan(request(supportAtZero(model), {}, {
    gravity: { mode: 'panels', loadEveryPanel: true }, dead: [{ labelKey: 'test', q: 1 }], generateCombinations: true,
  }));
  expect(plan.outcome).toBe('BLOCKED');
  expect(plan.blockedKeys).toEqual([{ key: 'loadPlan.blocked.seismicMass.panel', params: { elevation: 6 } }]);
  expect(plan.combinations).toEqual([]);
  const loads = plan.nodal.filter(d => d.caseType === 'E');
  expect(new Set(loads.map(d => d.nodeId))).toEqual(new Set([2, 4]));
  expect(windResultants(model, [], loads)[0]).toBeCloseTo((lower + upper) * lower * 3 / (lower * 3 + upper * 6), 10);
});

const round2Code = {
  zone: 4, site: 'SB', group: 'B', systemKey: 'rc_frame_full_ductility', periodSystem: 'concreteMomentFrame',
  regularity: 'regular', occupancy: 'reduced',
} as const;
const height = 4;
const round2Spectrum = designSpectrum(round2Code);
if (isBlocked(round2Spectrum)) throw new Error('Test spectrum was refused');
const round2Period = (round2Spectrum.t1 + round2Spectrum.t2) / 2;

function prescribedMode(model: LoadModelData, rotated: boolean, displacement: (z: number) => number, slope: number) {
  return {
    period: round2Period,
    shape: new Map([...model.nodes.values()].map(n => [n.id, {
      ux: rotated ? 0 : displacement(n.z!), uy: rotated ? displacement(n.z!) : 0,
      uz: 0, rx: rotated ? -slope : 0, ry: rotated ? 0 : slope, rz: 0,
    }])),
  };
}

function modalRequest(mode: ReturnType<typeof prescribedMode>, rotated: boolean) {
  return {
    code: { ...round2Code, computedT: round2Period },
    modal: { modes: [mode] },
    directions: { x: !rotated, y: rotated },
  };
}

function verifyColumnStoryPartition(cuts: number[], rotated: boolean, floorRole: 'master' | 'slave' | 'none') {
  const column = mesh(cuts.slice(1).map((z, i) => [[0, 0, cuts[i]!], [0, 0, z]]));
  const base = [...column.nodes.values()].find(n => n.z === 0)!;
  const floor = [...column.nodes.values()].find(n => n.z === 2)!;
  const reference = column.nodes.size + 1;
  const model: LoadModelData = {
    ...column,
    supports: new Map([[base.id, { nodeId: base.id }]]),
    constraints: [],
  };
  model.nodes.set(reference, { id: reference, x: rotated ? -1 : 0, y: rotated ? 0 : 1, z: floor.z });
  if (floorRole !== 'none') {
    const [masterNode, slaveNode] = floorRole === 'master' ? [floor.id, reference] : [reference, floor.id];
    model.constraints = [{ type: 'diaphragm', masterNode, slaveNodes: [slaveNode], plane: 'XY' }];
  }
  model.sections.set(1, { id: 1, a: 0.5 });
  model.materials.set(1, { id: 1, rho: 4 });

  const directions = { x: !rotated, y: rotated };
  const plan = buildLoadPlan(request(model, { directions }));
  const hasFloor = floorRole !== 'none';
  expect(plan.outcome).toBe('READY');
  expect.soft(plan.seismicModel!.levels.map(l => [l.elevation, l.weightKN])).toEqual(hasFloor ? [[0, 2], [2, 4], [4, 2]] : [[0, 4], [4, 4]]);
  expect.soft(plan.factors.seismicWeight!.value).toBe(hasFloor ? 6 : 4);
  expect(plan.cases.filter(c => c.type === 'E')).toHaveLength(1);
  expect(plan.distributed.filter(d => d.caseType === 'E')).toEqual([]);
  expect(plan.surface.filter(d => d.caseType === 'E')).toEqual([]);

  const storyActions = hasFloor ? [[2, 3], [4, 3]] as const : [[4, 4]] as const;
  const loads = plan.nodal.filter(d => d.caseType === 'E');
  expect(loads.map(p => p.nodeId)).toEqual(storyActions.map(([z]) => [...column.nodes.values()].find(n => n.z === z)!.id));
  for (const [i, p] of loads.entries()) {
    expect(rotated ? p.fy : p.fx).toBeCloseTo(storyActions[i]![1], 10);
    expect(rotated ? p.fx : p.fy).toBe(0);
  }
  verifyCantilever(model, [...model.elements.values()], rotated, 4, loads, storyActions);
}

for (const cuts of [[0, 2, 4], [0, 0.5, 1.5, 2, 2.5, 3.5, 4]]) {
  for (const rotated of [false, true]) {
    const variant = `static, ${rotated ? 'Y' : 'X'}, ${cuts.length - 1} elements`;
    for (const role of ['master', 'slave'] as const) {
      it(`#2316 column story partition keeps a diaphragm ${role} (${variant})`, () => {
        verifyColumnStoryPartition(cuts, rotated, role);
      });
    }
    it(`#2316 column story partition skips unmarked subdivisions (${variant})`, () => {
      verifyColumnStoryPartition(cuts, rotated, 'none');
    });

  }
}

function withPinnedCarriers(check: (model: LoadModelData) => void) {
  modelStore.clear();
  try {
    const base = modelStore.addNode(0, 0, 0), top = modelStore.addNode(0, 0, 4);
    const far = modelStore.addNode(4, 0, 0);
    const column = modelStore.addElement(base, top, 'frame')!;
    const beam = modelStore.addElement(top, far, 'frame')!;
    modelStore.addSupport(base, 'fixed3d');
    modelStore.addSupport(far, 'fixed3d');
    modelStore.toggleRelease(column, 'i', 'my');
    modelStore.toggleHinge3D(beam, 'end');
    const model = modelStore.model as unknown as LoadModelData;
    const nodes = new Map([...model.nodes].map(([id, n]) => [id, { ...n, z: n.z ?? 0 }]));
    check({ ...model, nodes });
  } finally {
    modelStore.clear();
  }
}

it('#2316 static loads on released carriers stay available and modal generation refuses', () => {
  withPinnedCarriers(model => {
    const plan = buildLoadPlan(request(model));
    expect(plan.outcome).toBe('READY');
    expect(plan.nodal.filter(d => d.caseType === 'E').length).toBeGreaterThan(0);
    const mode = prescribedMode(model, false, z => z / height, 1 / height);
    expectModalRefusal(buildLoadPlan(request(model, modalRequest(mode, false), { generateCombinations: true })));
  });
});

function round2Columns(cuts: number[], rotate: boolean, mirror: boolean, perimeter?: number, foundation = false) {
  const at = (r: number, z: number) => rotate ? [-r, 0, z] : [0, r, z];
  const columns = [-2, 2].map(r => cuts.slice(1).map((z, k) => [at(mirror ? -r : r, cuts[k]!), at(mirror ? -r : r, z)]));
  const edges = perimeter === undefined ? [] : [-1, 1].map(s => [at(s * 2, height), at(s * perimeter, height)]);
  const model = mesh([...columns.flat(), ...edges, ...(foundation ? [[at(-2, 0), at(2, 0)]] : [])]);
  const members = [...model.elements.values()];
  const byColumn = [members.slice(0, cuts.length - 1), members.slice(cuts.length - 1, 2 * (cuts.length - 1))];
  model.materials.set(2, { id: 2, rho: 0 });
  for (const e of members.slice(2 * (cuts.length - 1), 2 * (cuts.length - 1) + edges.length)) e.materialId = 2;
  supportAtZero(model);
  tieFloor(model, byColumn[0]!.at(-1)!.nodeJ, byColumn[1]!.at(-1)!.nodeJ);
  return { model, byColumn };
}

function verifyRound2Columns(
  model: LoadModelData, byColumn: ReturnType<typeof round2Columns>['byColumn'], plan: ReturnType<typeof buildLoadPlan>,
  rotated: boolean, loadedFrom: number, intensity: number, planWidth: number,
) {
  expect(plan.outcome).toBe('READY');
  expect(plan.distributed.filter(d => d.caseType === 'E')).toEqual([]);
  const tips = byColumn.map(members => members.at(-1)!.nodeJ);
  const cases = plan.cases.flatMap((c, index) => c.type === 'E' ? [{ c, index }] : []);
  expect(cases).toHaveLength(planWidth === 0 ? 1 : 2);
  for (const { c, index } of cases) {
    const loads = plan.nodal.filter(d => d.caseIndex === index);
    expect(loads.map(d => d.nodeId).sort()).toEqual(tips.slice().sort());
    const sign = c.nameParams?.sign === '−' ? -1 : 1;
    const torque = 2 * intensity * (height - loadedFrom) * sign * 0.05 * planWidth;
    for (const members of byColumn) {
      const root = model.nodes.get(members[0]!.nodeI)!;
      const arm = rotated ? root.x : -root.y;
      const force = intensity * (1 + sign * 0.05 * planWidth * arm / 4) * (height - loadedFrom);
      const parts = loads.filter(d => d.nodeId === members.at(-1)!.nodeJ);
      expect(rotated ? parts[0]!.fy : parts[0]!.fx).toBeCloseTo(force, 10);
      expect(rotated ? parts[0]!.fx : parts[0]!.fy).toBe(0);
      verifyCantilever(model, members, rotated, height, parts, [[height, force]]);
    }
    expect(windResultants(model, [], loads)[5]).toBeCloseTo(torque, 10);
  }
}

for (const rotated of [false, true]) for (const cuts of [[0, 2, 4], [0, 1, 2, 3, 4]]) {
  it(`#2319 refuses modal generation for a linear upper-half inertia field (${rotated}, ${cuts.length - 1} elements)`, () => {
    const { model } = round2Columns(cuts, rotated, false);
    for (const e of model.elements.values()) if (model.nodes.get(e.nodeJ)!.z! <= height / 2) e.materialId = 2;
    const mode = prescribedMode(model, rotated, z => z / height, 1 / height);
    expectModalRefusal(buildLoadPlan(request(model, modalRequest(mode, rotated))));
  });
}

for (const rotated of [false, true]) for (const mirror of [false, true]) for (const cuts of [[0, 2, 4], [0, 1, 2, 3, 4]]) {
  it(`#2316 static eccentricity uses the massless structural perimeter (${rotated}, ${mirror}, ${cuts.length - 1} elements)`, () => {
    const { model, byColumn } = round2Columns(cuts, rotated, mirror, 5);
    for (const e of model.elements.values()) if (model.nodes.get(e.nodeJ)!.z! <= height / 2) e.materialId = 2;
    const plan = buildLoadPlan(request(model, {
      directions: { x: !rotated, y: rotated },
      torsion: 'medium',
    }));
    const w = model.sections.get(1)!.a * model.materials.get(1)!.rho;
    verifyRound2Columns(model, byColumn, plan, rotated, height / 2, w, 10);
  });

}

it('#2316 a nonzero structural width with no polar mass refuses accidental torsion', () => {
  for (const width of [0, 5]) {
    const model = mesh([[[0, 0, 0], [0, 0, height]], ...(width > 0 ? [[[0, 0, height], [0, width, height]]] : [])]);
    model.materials.set(2, { id: 2, rho: 0 });
    const edge = model.elements.get(2);
    if (edge) edge.materialId = 2;
    const plan = buildLoadPlan(request(supportAtZero(model), { torsion: 'medium' }, { generateCombinations: true }));
    expect(plan.outcome).toBe(width === 0 ? 'READY' : 'BLOCKED');
    if (width === 0) {
      const w = model.sections.get(1)!.a * model.materials.get(1)!.rho;
      const force = w * height / 2;
      for (const [index, c] of plan.cases.entries()) if (c.type === 'E') {
        verifyCantilever(model, [model.elements.get(1)!], false, height, plan.nodal.filter(d => d.caseIndex === index), [[height, force]]);
      }
    } else {
      expect(plan.blockedKeys).toEqual([{ key: 'loadPlan.blocked.seismicMass.torsion', params: { elevation: height } }]);
      expect(plan.distributed.filter(d => d.caseType === 'E')).toEqual([]);
      expect(plan.combinations).toEqual([]);
    }
  }
});

function masslessRoof(floors: number[], roof?: number, cuts: number[] = [0, ...floors]) {
  const column = cuts.slice(1).map((z, i) => [[0, 0, cuts[i]!], [0, 0, z]]);
  if (roof !== undefined) column.push([[0, 0, floors.at(-1)!], [0, 0, roof]]);
  const model = supportAtZero(mesh([...column, ...floors.map(z => [[0, 0, z], [1, 0, z]])]));
  model.sections.set(1, { id: 1, a: 0.5 });
  model.materials.set(1, { id: 1, rho: 4 });
  model.materials.set(2, { id: 2, rho: 0 });
  for (const e of model.elements.values()) {
    if (e.id > cuts.length - 1) e.materialId = 2;
  }
  return { model, members: [...model.elements.values()].slice(0, column.length) };
}

it('#2316 a zero-weight roof sets the approximate period and member loads', () => {
  const code = { ...round2Code, periodSystem: 'steelMomentFrame', elastic: true } as const;
  const { cr, x } = PERIOD_COEFFICIENTS[code.periodSystem];
  const { ca, cv, t2 } = round2Spectrum;
  for (const roof of [undefined, 16]) for (const cuts of [[0, 4], [0, 1, 3, 4]]) {
    const { model, members } = masslessRoof([4], roof, cuts);
    const seismicInput = request(model, { code });
    const plan = buildLoadPlan(seismicInput);
    const h = roof ?? 4, t = cr * h ** x;
    const c = (t <= t2 ? 2.5 * ca : cv / t) / R_ELASTIC;
    expect(plan.outcome).toBe('READY');
    expect(plan.seismicModel!.levels.map(l => [l.elevation, l.weightKN])).toEqual(roof ? [[0, 4], [4, 4], [roof, 0]] : [[0, 4], [4, 4]]);
    expect.soft(plan.seismic?.ta).toBeCloseTo(t, 10);
    expect.soft(plan.factors.baseShear?.value).toBeCloseTo(4 * c, 10);
    expect(plan.seismic?.stories).toEqual([{ h: 4, w: 4 }]);
    expect(plan.distributed.filter(n => n.caseType === 'E')).toEqual([]);
    const loads = plan.nodal.filter(p => p.caseType === 'E');
    const floor = [...model.nodes.values()].find(n => n.z === 4)!;
    expect(loads).toHaveLength(1);
    expect(loads[0]).toMatchObject({ nodeId: floor.id, fy: 0, fz: 0 });
    expect.soft(loads[0]!.fx).toBeCloseTo(4 * c, 10);
    const sink = seismicSink();
    const direct = INPRES103_SEISMIC.plan(seismicInput, plan.seismicModel!, sink);
    expect(sink.blockedKeys).toEqual([]);
    expect.soft(direct.seismicDetail?.ta).toBeCloseTo(t, 10);
    verifyCantilever(model, members, false, h, loads, [[4, 4 * c]]);
  }
});

it('#2316 a zero-weight roof counts toward the static height and story limits', () => {
  const code = { ...round2Code, group: 'Ao', computedT: round2Period } as const;
  for (const [floors, roof, blocked] of [
    [[3, 6], 12.5, false],
    [[3, 6, 9], 11.5, false],
    [[3, 6, 9], 12, false],
    [[3, 6, 9], 12.5, true],
  ] as const) {
    const { model } = masslessRoof([...floors], roof);
    const plan = buildLoadPlan(request(model, { code }));
    expect.soft(plan.outcome, `roof at ${roof} m, ${floors.length + 1} stories`).toBe(blocked ? 'BLOCKED' : 'READY');
    if (blocked) {
      expect.soft(plan.blockedKeys.map(r => r.key)).toEqual(['seismic.blocked.heightOverTable25']);
      expect.soft(plan.cases.filter(c => c.type === 'E')).toEqual([]);
    } else {
      expect(plan.seismicModel!.levels.at(-1)).toMatchObject({ elevation: roof, weightKN: 0 });
      expect(plan.seismic?.stories).toHaveLength(floors.length);
      expect(plan.nodal.some(p => p.caseType === 'E')).toBe(true);
    }
  }
});

it('#2316 a zero-weight roof can require the dynamic method', () => {
  const code = { ...round2Code, periodSystem: 'steelMomentFrame' } as const;
  const { cr, x } = PERIOD_COEFFICIENTS[code.periodSystem];
  const limit = 3 * round2Spectrum.t2;
  for (const t of [limit * 0.99, limit * 1.01]) {
    const roof = (t / cr) ** (1 / x);
    const { model } = masslessRoof([4], roof);
    const plan = buildLoadPlan(request(model, { code }));
    expect.soft(plan.outcome).toBe(t <= limit ? 'READY' : 'BLOCKED');
    if (t <= limit) {
      expect.soft(plan.seismic?.ta).toBeCloseTo(t, 10);
      expect.soft(plan.seismic?.topHeavy).toBe(true);
      expect(plan.seismic?.stories).toEqual([{ h: 4, w: 4 }]);
    } else {
      expect.soft(plan.blockedKeys.map(r => r.key)).toEqual(['seismic.blocked.dynamicRequired']);
      expect.soft(plan.cases.filter(c => c.type === 'E')).toEqual([]);
    }
  }
});

it('#2316 a massless offset member in the seismic footprint refuses generation', () => {
  for (const rotated of [false, true]) for (const cuts of [[0, 4], [0, 1, 3, 4]]) {
    for (const code of [undefined, round2Code]) {
      const { model, byColumn } = round2Columns(cuts, rotated, false, 5);
      const edge = [...model.elements.values()].at(-1)!;
      const atEdge = { ...edge, offset: { frame: 'global' as const, j: { x: 0, y: 0, z: 0 } } };
      model.elements.set(edge.id, atEdge);
      const seismicInput = request(model, {
        code, torsion: 'medium', directions: { x: !rotated, y: rotated },
      }, { generateCombinations: true });
      const baseline = buildLoadPlan(seismicInput);
      const w = model.sections.get(1)!.a * model.materials.get(1)!.rho;
      verifyRound2Columns(model, byColumn, baseline, rotated, height / 2, w * baseline.seismic!.c, 10);

      atEdge.offset.j = rotated ? { x: -2, y: 0, z: 0 } : { x: 0, y: 2, z: 0 };
      for (const materialId of [2, 1]) {
        atEdge.materialId = materialId;
        const plan = buildLoadPlan(seismicInput);
        expect.soft(plan.outcome).toBe('BLOCKED');
        expect.soft(plan.blockedKeys).toEqual([{ key: 'loadPlan.blocked.seismicMass.member', params: { elevation: height } }]);
        expect.soft(plan.cases.filter(c => c.type === 'E')).toEqual([]);
        expect.soft(plan.distributed.filter(d => d.caseType === 'E')).toEqual([]);
        expect.soft(plan.combinations).toEqual([]);
      }
    }
  }
});

function diagonalModalFixture() {
  const model = mesh([
    [[0, 0, 0], [0, 0, 3]], [[0, 0, 3], [0, 0, 6]],
    [[0, 0, 3], [1, 0, 3]], [[0, 0, 6], [1, 0, 6]],
  ]);
  model.supports = new Map([[1, { nodeId: 1 }]]);
  model.materials.set(2, { id: 2, rho: 0 });
  for (const member of model.elements.values()) {
    if (model.nodes.get(member.nodeI)!.z !== model.nodes.get(member.nodeJ)!.z) member.materialId = 2;
  }
  const mode = prescribedMode(model, false, z => z === 0 ? 0 : z === 3 ? -0.2 : 1, 0);
  for (const sample of mode.shape.values()) sample.uy = sample.ux;
  const code = modalRequest(mode, false).code;
  const reference = buildLoadPlan(request(model, { code }));
  model.materials.get(1)!.rho *= 80 / (0.85 * reference.factors.baseShear!.value);
  return { model, code, modal: { modes: [mode] } };
}

for (const withAxes of [false, true]) {
  it(`#2316 a sign-changing modal mode refuses the 45° case (axes selected: ${withAxes})`, () => {
    const { model, ...seismic } = diagonalModalFixture();
    const plan = buildLoadPlan(request(model, {
      ...seismic, directions: { x: withAxes, y: withAxes }, diagonal: true,
    }, { generateCombinations: true }));
    expectModalRefusal(plan);
  });
}

it('#2316 a static diagonal-only case still applies the static base shear at 45°', () => {
  const { model, code } = diagonalModalFixture();
  const plan = buildLoadPlan(request(model, { code, directions: { x: false, y: false }, diagonal: true }));
  expect(plan.outcome).toBe('READY');
  expect(plan.cases.filter(c => c.type === 'E').map(c => c.nameParams?.dir)).toEqual(['45°']);
  const caseIndex = plan.cases.findIndex(c => c.nameParams?.dir === '45°');
  const [fx, fy] = windResultants(model, [], plan.nodal.filter(d => d.caseIndex === caseIndex));
  expect(fx).toBeCloseTo(80 / (0.85 * Math.SQRT2), 10);
  expect(fy).toBeCloseTo(80 / (0.85 * Math.SQRT2), 10);
});

function expectModalRefusal(plan: ReturnType<typeof buildLoadPlan>) {
  expect(plan.blockedKeys).toEqual([{ key: MODAL_SEISMIC_UNAVAILABLE }]);
  expect(plan).toMatchObject({ outcome: 'BLOCKED', cases: [], distributed: [], nodal: [], surface: [], combinations: [] });
}

for (const selection of ['legacy modes', 'empty modes', 'explicit modal', 'diagonal only'] as const) {
  it(`#2319 refuses ${selection} before planning any load cases`, () => {
    const { model, ...seismic } = diagonalModalFixture();
    const proposed = selection === 'legacy modes' ? seismic
      : selection === 'empty modes' ? { ...seismic, modal: { modes: [] } }
      : { code: seismic.code, method: 'modal' as const };
    const plan = buildLoadPlan(request(model, {
      ...proposed,
      directions: { x: selection !== 'diagonal only', y: false },
      diagonal: selection === 'diagonal only',
    }, { generateCombinations: true }));
    expectModalRefusal(plan);
  });
}

it('#2319 the seismic code adapter refuses modal requests directly', () => {
  const { model, ...seismic } = diagonalModalFixture();
  const levels = buildLoadPlan(request(model)).seismicModel!;
  const sink = seismicSink();
  INPRES103_SEISMIC.plan(request(model, seismic), levels, sink);
  expect(sink.blockedKeys).toEqual([{ key: MODAL_SEISMIC_UNAVAILABLE }]);
  expect(sink).toMatchObject({ cases: [], distributed: [], nodal: [], surface: [] });
});

function seismicSink(): SeismicPlanSink {
  return {
    cases: [], nodal: [], distributed: [], surface: [], derivation: [], refs: [],
    assumptions: [], unsupportedKeys: [], blockedKeys: [], levelRefusals: [],
  };
}

function checkSeismicDatum(base: number, twoStories: boolean, rotated: boolean, subdivided: boolean) {
  const storyCuts = twoStories ? [0, 2, 4] : [0, 4];
  const cuts = subdivided
    ? storyCuts.flatMap((z, i) => i === 0 ? [z] : [z - (i === 1 ? 1.5 : 0.5), z])
    : storyCuts;
  const column = mesh(cuts.slice(1).map((z, i) => [[0, 0, base + cuts[i]!], [0, 0, base + z]]));
  const model: LoadModelData = { ...column, supports: new Map([[1, { nodeId: 1 }]]) };
  if (twoStories) {
    const floor = [...model.nodes.values()].find(n => n.z === base + 2)!;
    const reference = model.nodes.size + 1;
    model.nodes.set(reference, { id: reference, x: rotated ? 0 : 1, y: rotated ? 1 : 0, z: floor.z });
    const high = reference + 1;
    model.nodes.set(high, { id: high, x: rotated ? 0 : 1, y: rotated ? 1 : 0, z: base + 4 });
    model.supports = new Map([[high, { nodeId: high }], [1, { nodeId: 1 }]]);
    model.constraints = [{ type: 'diaphragm', masterNode: floor.id, slaveNodes: [reference], plane: 'XY' }];
  }
  const area = 0.5, density = 4;
  model.sections.set(1, { id: 1, a: area });
  model.materials.set(1, { id: 1, rho: density });
  const w = twoStories ? 3 * area * density : 2 * area * density;
  const directions = { x: !rotated, y: rotated };
  const manual = request(model, { directions });
  const plan = buildLoadPlan(manual);
  expect(plan.outcome).toBe('READY');
  expect(plan.unsupportedKeys).toEqual([]);
  expect(plan.factors.seismicWeight?.value).toBe(w);
  expect(plan.factors.baseShear?.value).toBe(w);
  const loads = plan.nodal.filter(d => d.caseType === 'E');
  expect(plan.distributed.filter(d => d.caseType === 'E')).toEqual([]);
  expect(plan.surface.filter(d => d.caseType === 'E')).toEqual([]);
  expect(plan.cases.filter(c => c.type === 'E')).toHaveLength(1);
  const storyActions = twoStories ? [[2, 3], [4, 3]] as const : [[4, 4]] as const;
  expect(loads.map(p => model.nodes.get(p.nodeId)!.z! - base)).toEqual(storyActions.map(([z]) => z));
  for (const [i, p] of loads.entries()) {
    expect(rotated ? p.fy : p.fx).toBeCloseTo(storyActions[i]![1], 10);
    expect(rotated ? p.fx : p.fy).toBe(0);
  }
  verifyCantilever(model, [...model.elements.values()], rotated, 4, loads, storyActions, base);

  const codeInput = request(model, { directions, code: round2Code });
  const codePlan = buildLoadPlan(codeInput);
  expect(codePlan.outcome).toBe('READY');
  const { cr, x } = PERIOD_COEFFICIENTS[round2Code.periodSystem];
  expect(codePlan.seismic?.ta).toBeCloseTo(cr * 4 ** x, 10);
  const c = codePlan.seismic!.c;
  expect(codePlan.factors.seismicWeight?.value).toBe(w);
  expect(codePlan.factors.baseShear?.value).toBe(c * w);
  const codeLoads = codePlan.nodal.filter(p => p.caseType === 'E');
  expect(codeLoads.map(p => p.nodeId)).toEqual(loads.map(p => p.nodeId));
  for (const [i, part] of codeLoads.entries()) {
    expect(part.fx).toBeCloseTo(c * loads[i]!.fx, 10);
    expect(part.fy).toBeCloseTo(c * loads[i]!.fy, 10);
  }

  const sink = seismicSink();
  const direct = INPRES103_SEISMIC.plan(codeInput, codePlan.seismicModel!, sink);
  expect(sink.blockedKeys).toEqual([]);
  expect(direct.seismicWeight).toEqual(codePlan.factors.seismicWeight);
  expect(direct.baseShear).toEqual(codePlan.factors.baseShear);
  expect(sink.nodal).toEqual(codeLoads.map(p => ({ ...p, caseIndex: 0 })));
}

function checkSeismicDatumVariants(base: number, twoStories: boolean) {
  for (const rotated of [false, true]) for (const subdivided of [false, true]) {
    checkSeismicDatum(base, twoStories, rotated, subdivided);
  }
}

it('#2316 a supported column at zero retains its static seismic member loads', () => {
  checkSeismicDatumVariants(0, false);
  checkSeismicDatumVariants(0, true);
});

for (const base of [10, -5]) {
  it(`#2316 static seismic member loads are invariant at support elevation ${base}`, () => {
    checkSeismicDatumVariants(base, false);
  });

  it(`#2316 static seismic story forces are invariant at support elevation ${base}`, () => {
    checkSeismicDatumVariants(base, true);
  });
}

for (const kind of ['missing', 'empty', 'dangling', 'invalid elevation']) {
  it(`#2316 static seismic refuses the ${kind} support datum`, () => {
    const model: LoadModelData = mesh([[[0, 0, 0], [0, 0, 4]]]);
    if (kind !== 'missing') {
      model.supports = kind === 'empty' ? new Map() : new Map([[1, { nodeId: kind === 'dangling' ? 100 : 1 }]]);
    }
    if (kind === 'invalid elevation') model.nodes.get(1)!.z = Number.NaN;
    const options = request(model, {}, { generateCombinations: true });
    const plan = buildLoadPlan(options);
    expect(plan.outcome).toBe('BLOCKED');
    expect(plan.blockedKeys).toContainEqual({ key: 'loadPlan.blocked.seismicBase' });
    expect(plan.factors.seismicWeight).toBeUndefined();
    expect(plan.factors.baseShear).toBeUndefined();
    expect(plan.cases.filter(c => c.type === 'E')).toEqual([]);
    expect(plan.distributed.filter(d => d.caseType === 'E')).toEqual([]);
    expect(plan.combinations).toEqual([]);

    const sink = seismicSink();
    const direct = INPRES103_SEISMIC.plan(options, plan.seismicModel!, sink);
    expect(sink).toMatchObject({ blockedKeys: [{ key: 'loadPlan.blocked.seismicBase' }], cases: [], nodal: [], distributed: [], surface: [] });
    expect(direct.seismicWeight).toBeUndefined();
    expect(direct.baseShear).toBeUndefined();
  });
}

function mixedSeismicModel(surface: 'quads' | 'plates') {
  const model: LoadModelData = supportAtZero(mesh([[[0, 0, 0], [0, 0, 4]]]));
  model.sections.set(1, { id: 1, a: 0.5 });
  model.materials.set(1, { id: 1, rho: 4 });
  const points = [[2, 0], [4, 0], [4, 2], [2, 2]].slice(0, surface === 'quads' ? 4 : 3);
  const nodes = points.map(([x, y], i) => {
    const id = i + 3;
    model.nodes.set(id, { id, x, y, z: 4 });
    return id;
  });
  model[surface] = new Map([[1, { id: 1, nodes, thickness: 0.25, materialId: 1 }]]);
  return model;
}

function verifyShellGeometryRefusal(model: LoadModelData, elevations: number[]) {
  for (const data of [{ coefficient: 1 }, { code: round2Code }]) {
    const options = request(model, data, { generateCombinations: true });
    const plan = buildLoadPlan(options);
    const diagnostics = elevations.map(elevation => ({ key: 'loadPlan.blocked.seismicMass.shell', params: { elevation } }));
    expect(plan.outcome).toBe('BLOCKED');
    expect(plan.blockedKeys).toEqual(diagnostics);
    expect(plan.factors.seismicWeight).toBeUndefined();
    expect(plan.factors.baseShear).toBeUndefined();
    expect(plan.cases.filter(c => c.type === 'E')).toEqual([]);
    expect([...plan.nodal, ...plan.distributed, ...plan.surface].filter(load => load.caseType === 'E')).toEqual([]);
    expect(plan.combinations).toEqual([]);

    const sink = seismicSink();
    const direct = INPRES103_SEISMIC.plan(options, plan.seismicModel!, sink);
    expect(sink).toMatchObject({ levelRefusals: diagnostics, cases: [], nodal: [], distributed: [], surface: [] });
    expect(direct.seismicWeight).toBeUndefined();
    expect(direct.baseShear).toBeUndefined();
  }
}

for (const surface of ['quads', 'plates'] as const) {
  const invalidCoordinates = [
    ['z', NaN], ['z', Infinity],
    ['x', NaN], ['x', Infinity], ['x', -Infinity],
    ['y', NaN], ['y', Infinity], ['y', -Infinity],
  ] as const;
  for (const [coordinate, invalid] of invalidCoordinates) {
    it(`#2316 a mixed model refuses ${surface} with ${coordinate} = ${invalid}`, () => {
      const model = mixedSeismicModel(surface);
      model.nodes.get(3)![coordinate] = invalid;
      verifyShellGeometryRefusal(model, [0, 4]);
    });
  }

  it(`#2316 a mixed model refuses ${surface} with a negative infinite elevation`, () => {
    const model = mixedSeismicModel(surface);
    model.nodes.get(3)!.z = -Infinity;
    verifyShellGeometryRefusal(model, [0, 4]);
  });

  it(`#2316 a mixed model refuses a finite sloping ${surface} surface at its elevations`, () => {
    const model = mixedSeismicModel(surface);
    model.nodes.get(3)!.z = 5;
    tieFloor(model, 2, 4);
    verifyShellGeometryRefusal(model, [4, 5]);
  });

  for (const alsoSupported of [false, true]) {
    it(`#2316 refuses detached ${surface} mass (separate support: ${alsoSupported})`, () => {
      const model = mixedSeismicModel(surface);
      if (alsoSupported) {
        const root = { ...model.nodes.get(3)!, id: 7, z: 0 };
        model.nodes.set(root.id, root);
        model.materials.set(2, { id: 2, rho: 0 });
        model.elements.set(2, { ...model.elements.get(1)!, id: 2, nodeI: root.id, nodeJ: 3, materialId: 2 });
        model.supports = new Map([[1, { nodeId: 1 }], [root.id, { nodeId: root.id }]]);
      }
      expectDatumRefusal(model, disconnectedSeismic);
    });
  }

  it(`#2316 a mixed model keeps the correct frame and connected flat ${surface} seismic actions`, () => {
    const model = mixedSeismicModel(surface);
    tieFloor(model, 2, 4);
    const plan = buildLoadPlan(request(model));
    const shellArea = surface === 'quads' ? 4 : 2;
    expect(plan.outcome).toBe('READY');
    expect(plan.blockedKeys).toEqual([]);
    expect(plan.factors.seismicWeight?.value).toBeCloseTo(4 + shellArea, 10);
    expect(plan.factors.baseShear?.value).toBeCloseTo(4 + shellArea, 10);
    expect(plan.distributed.filter(load => load.caseType === 'E')).toEqual([]);
    expect(plan.surface.filter(load => load.caseType === 'E')).toEqual([]);
    const loads = plan.nodal.filter(load => load.caseType === 'E');
    const corners = model[surface]!.get(1)!.nodes;
    expect(loads.map(load => load.nodeId)).toEqual([2, ...corners]);
    for (const load of loads) {
      expect(load.fx).toBeCloseTo(load.nodeId === 2 ? 4 : shellArea / corners.length, 10);
      expect(load.fy).toBe(0);
      expect(load.fz).toBe(0);
    }
  });
}

it('#2316 a mixed model refuses a shell with an unlocatable corner', () => {
  const model = mixedSeismicModel('quads');
  model.nodes.get(3)!.z = NaN;
  model.nodes.delete(4);
  model.nodes.delete(6);
  verifyShellGeometryRefusal(model, [0, 4]);
});

function datumCantilever() {
  const model = supportAtZero(mesh([[[0, 0, 0], [0, 0, 4]]]));
  model.sections.set(1, { id: 1, a: 0.5 });
  model.materials.set(1, { id: 1, rho: 4 });
  return model;
}

const disconnectedSeismic = 'loadPlan.blocked.seismicDisconnected';

function expectDatumRefusal(model: LoadModelData, key: string, seismic: Partial<NonNullable<LoadPlanInput['seismic']>> = {}) {
  for (const data of [{ coefficient: 1 }, { code: round2Code }]) {
    const options = request(model, { ...data, ...seismic }, { generateCombinations: true });
    const plan = buildLoadPlan(options);
    expect(plan.outcome).toBe('BLOCKED');
    expect(plan.blockedKeys).toContainEqual({ key });
    expect(plan.factors.seismicWeight).toBeUndefined();
    expect(plan.factors.baseShear).toBeUndefined();
    expect(plan.cases.filter(c => c.type === 'E')).toEqual([]);
    expect([...plan.nodal, ...plan.distributed, ...plan.surface].filter(d => d.caseType === 'E')).toEqual([]);
    expect(plan.combinations).toEqual([]);

    const sink = seismicSink();
    const direct = INPRES103_SEISMIC.plan(options, plan.seismicModel!, sink);
    expect(sink).toMatchObject({ blockedKeys: [{ key }], cases: [], nodal: [], distributed: [], surface: [] });
    expect(direct.seismicWeight).toBeUndefined();
    expect(direct.baseShear).toBeUndefined();
  }
}

for (const [label, elevation] of [
  ['an isolated lower support', -5],
  ['an isolated intermediate support', 3],
] as const) {
  it(`#2316 static seismic ignores ${label}`, () => {
    const model = datumCantilever();
    model.nodes.set(3, { id: 3, x: 2, y: 0, z: elevation });
    model.supports = new Map([[3, { nodeId: 3 }], [1, { nodeId: 1 }]]);
    const options = request(model);
    const plan = buildLoadPlan(options);
    expect(plan.outcome).toBe('READY');
    expect(plan.blockedKeys).toEqual([]);
    expect(plan.unsupportedKeys).toEqual([]);
    const expected = 4 * 0.5 * 4 / 2;
    expect(plan.factors.seismicWeight?.value).toBe(expected);
    expect(plan.factors.baseShear?.value).toBe(expected);
    const loads = plan.nodal.filter(d => d.caseType === 'E');
    expect(loads).toMatchObject([{ nodeId: 2, fy: 0, fz: 0 }]);
    expect(loads[0]!.fx).toBeCloseTo(4, 10);

    const sink = seismicSink();
    const direct = INPRES103_SEISMIC.plan(options, plan.seismicModel!, sink);
    expect(sink.blockedKeys).toEqual([]);
    expect(direct.seismicWeight?.value).toBe(expected);
    expect(direct.baseShear?.value).toBe(expected);
    expect(sink.nodal).toEqual(loads.map(p => ({ ...p, caseIndex: 0 })));

    verifyCantilever(model, [model.elements.get(1)!], false, 4, loads, [[4, 4]]);
  });
}

it('#2316 refuses a disconnected massless member with its own support', () => {
  const model = datumCantilever();
  model.nodes.set(3, { id: 3, x: 2, y: 0, z: -5 });
  model.nodes.set(4, { id: 4, x: 2, y: 0, z: -4 });
  model.materials.set(2, { id: 2, rho: 0 });
  model.elements.set(2, { ...model.elements.get(1)!, id: 2, nodeI: 3, nodeJ: 4, materialId: 2 });
  model.supports = new Map([[3, { nodeId: 3 }], [1, { nodeId: 1 }]]);
  expectDatumRefusal(model, disconnectedSeismic);
});

it('#2316 a detached support cannot supply the seismic datum', () => {
  const model = datumCantilever();
  model.nodes.set(3, { id: 3, x: 2, y: 0, z: -5 });
  model.supports = new Map([[3, { nodeId: 3 }]]);
  expectDatumRefusal(model, 'loadPlan.blocked.seismicBase');
});

for (const surface of ['quads', 'plates'] as const) {
  it(`#2316 supports connected through ${surface} must share a seismic datum`, () => {
    const model = datumCantilever();
    model.nodes.set(3, { id: 3, x: 2, y: 0, z: 4 });
    model.nodes.set(4, { id: 4, x: 2, y: 2, z: 4 });
    model.nodes.set(5, { id: 5, x: 0, y: 2, z: 4 });
    model.nodes.set(6, { id: 6, x: 2, y: 0, z: 0 });
    model.materials.set(2, { id: 2, rho: 0 });
    model.elements.set(2, { ...model.elements.get(1)!, id: 2, nodeI: 6, nodeJ: 3, materialId: 2 });
    model[surface] = new Map([[1, { id: 1, nodes: surface === 'quads' ? [2, 3, 4, 5] : [2, 3, 4], thickness: 1, materialId: 2 }]]);
    model.supports = new Map([[1, { nodeId: 1 }], [6, { nodeId: 6 }]]);
    const plan = buildLoadPlan(request(model));
    expect(plan.outcome).toBe('READY');
    expect(plan.factors.seismicWeight?.value).toBe(4);
    expect(plan.factors.baseShear?.value).toBe(4);

    model.nodes.get(6)!.z = 1;
    expectDatumRefusal(model, 'loadPlan.blocked.seismicSteppedBase');
  });
}

it('#2316 a stepped frame base refuses static seismic generation', () => {
  const model = datumCantilever();
  model.nodes.set(3, { id: 3, x: 2, y: 0, z: 1 });
  model.materials.set(2, { id: 2, rho: 0 });
  model.elements.set(2, { ...model.elements.get(1)!, id: 2, nodeI: 3, nodeJ: 2, materialId: 2 });
  model.supports = new Map([[1, { nodeId: 1 }], [3, { nodeId: 3 }]]);
  expectDatumRefusal(model, 'loadPlan.blocked.seismicSteppedBase');
});

function diaphragmColumns() {
  const model = datumCantilever();
  model.nodes.set(3, { id: 3, x: 0, y: 2, z: 0 });
  model.nodes.set(4, { id: 4, x: 0, y: 2, z: 4 });
  model.nodes.set(5, { id: 5, x: 0, y: 9, z: 4 });
  model.materials.set(2, { id: 2, rho: 0 });
  model.elements.set(2, { ...model.elements.get(1)!, id: 2, nodeI: 3, nodeJ: 4, materialId: 2 });
  model.constraints = [{ type: 'diaphragm', masterNode: 5, slaveNodes: [2, 4], plane: 'XY' }];
  return model;
}

it('#2316 accepts a datum reached only through the rigid floor and a massless column', () => {
  const model = diaphragmColumns();
  model.supports = new Map([[3, { nodeId: 3 }]]);
  for (const data of [{ coefficient: 1 }, { code: round2Code }]) {
    const options = request(model, data);
    const plan = buildLoadPlan(options);
    expect(plan.outcome).toBe('READY');
    expect(plan.blockedKeys).toEqual([]);
    expect(plan.unsupportedKeys).toEqual([]);
    expect(plan.factors.seismicWeight?.value).toBe(4);
    const loads = plan.nodal.filter(d => d.caseType === 'E');
    const coefficient = plan.seismic!.c;
    expect(plan.factors.baseShear?.value).toBe(4 * coefficient);
    expect(loads).toMatchObject([{ nodeId: 2, fy: 0, fz: 0 }]);
    expect(loads[0]!.fx).toBeCloseTo(4 * coefficient, 10);
    expect(plan.seismicModel!.levels.at(-1)?.planWidth).toEqual({ x: 0, y: 2 });

    const sink = seismicSink();
    const direct = INPRES103_SEISMIC.plan(options, plan.seismicModel!, sink);
    expect(sink.blockedKeys).toEqual([]);
    expect(direct.seismicWeight?.value).toBe(4);
    expect(direct.baseShear?.value).toBe(4 * coefficient);
    expect(sink.nodal).toEqual(loads.map(d => ({ ...d, caseIndex: 0 })));
  }
});

it('#2316 includes a diaphragm-connected massless column when checking for a stepped datum', () => {
  const model = diaphragmColumns();
  model.nodes.get(3)!.z = 1;
  model.supports = new Map([[1, { nodeId: 1 }], [3, { nodeId: 3 }]]);
  expectDatumRefusal(model, 'loadPlan.blocked.seismicSteppedBase');
});

function seismicWidthWithDetachedBeam() {
  const { model, byColumn } = round2Columns([0, height], false, false);
  const right = byColumn[1]![0]!.nodeJ;
  const beamStart = { ...model.nodes.get(right)!, id: 5 };
  model.nodes.set(beamStart.id, beamStart);
  model.nodes.set(6, { ...beamStart, id: 6, y: 6 });
  model.elements.set(3, { ...model.elements.get(1)!, id: 3, nodeI: 5, nodeJ: 6, materialId: 2 });
  return { model, byColumn };
}

it('#2316 refuses a disconnected massless beam in the seismic footprint', () => {
  const { model } = seismicWidthWithDetachedBeam();
  expectDatumRefusal(model, disconnectedSeismic, { torsion: 'medium' });
});

it('#2316 an attached massless beam contributes to accidental eccentricity without carrying seismic load', () => {
  const { model, byColumn } = seismicWidthWithDetachedBeam();
  model.elements.get(3)!.nodeI = byColumn[1]![0]!.nodeJ;
  model.nodes.delete(5);
  const plan = buildLoadPlan(request(model, { torsion: 'medium' }));
  expect(plan.seismicModel!.levels.at(-1)?.planWidth).toEqual({ x: 0, y: 8 });
  const intensity = model.sections.get(1)!.a * model.materials.get(1)!.rho;
  verifyRound2Columns(model, byColumn, plan, false, height / 2, intensity, 8);
});

for (const levels of [1, 2]) {
  it(`#2316 ${levels}-story static actions are applied at the loaded floor nodes`, () => {
    const elevations = levels === 1 ? [4] : [2, 4];
    const forces = levels === 1 ? [4] : [3, 3];
    const offsets = levels === 1 ? [0] : [-2, 2];
    for (const rotated of [false, true]) for (const subdivided of [false, true]) {
      const cuts = [0, ...elevations.flatMap(z => subdivided ? [z - 0.5, z] : [z])];
      const at = (y: number, z: number) => rotated ? [-y, 0, z] : [0, y, z];
      const model = supportAtZero(mesh(offsets.flatMap(y =>
        cuts.slice(1).map((z, k) => [at(y, cuts[k]!), at(y, z)]))));
      model.sections.set(1, { id: 1, a: 0.5 });
      model.materials.set(1, { id: 1, rho: 4 });
      for (const z of elevations) {
        const ids = [...model.nodes.values()].filter(n => n.z === z).map(n => n.id);
        if (ids.length === 2) tieFloor(model, ids[0]!, ids[1]!);
      }
      const options = request(model, { directions: { x: !rotated, y: rotated } }, { generateCombinations: true });
      const plan = buildLoadPlan(options);
      const loads = plan.nodal.filter(p => p.caseType === 'E');
      expect(plan.outcome).toBe('READY');
      expect.soft(plan.distributed.filter(p => p.caseType === 'E')).toEqual([]);
      expect.soft(plan.surface.filter(p => p.caseType === 'E')).toEqual([]);
      expect.soft(plan.combinations.some(c => c.terms.some(t => t.symbol === 'E'))).toBe(true);
      const sink = seismicSink();
      INPRES103_SEISMIC.plan(options, plan.seismicModel!, sink);
      expect(sink.levelRefusals).toEqual([]);
      expect(sink.nodal).toEqual(loads.map(p => ({ ...p, caseIndex: 0 })));
      expect.soft(sink.distributed).toEqual([]);
      expect.soft(loads).toHaveLength(elevations.length * offsets.length);
      for (const y of offsets) {
        const [x, yy] = at(y, 0);
        const ids = new Set([...model.nodes.values()].filter(n => n.x === x && n.y === yy).map(n => n.id));
        const members = [...model.elements.values()].filter(e => ids.has(e.nodeI));
        verifyCantilever(model, members, rotated, 4, loads.filter(p => ids.has(p.nodeId)), elevations.map((z, k) => [z, forces[k]!]));
      }
      for (const node of model.nodes.values()) {
        const k = elevations.indexOf(node.z!);
        const atNode = loads.filter(p => p.nodeId === node.id);
        if (k === -1) expect.soft(atNode).toEqual([]);
        else {
          expect.soft(atNode).toHaveLength(1);
          expect.soft(rotated ? atNode[0]?.fy : atNode[0]?.fx).toBeCloseTo(forces[k]!, 10);
          expect.soft(rotated ? atNode[0]?.fx : atNode[0]?.fy).toBe(0);
          expect.soft(atNode[0]?.fz).toBe(0);
        }
      }
      const sectionActions = [0, ...elevations].map(z => loads.reduce(([v, m], p) => {
        const h = model.nodes.get(p.nodeId)!.z!;
        const f = rotated ? p.fy : p.fx;
        return h > z ? [v + f, m + f * (h - z)] : [v, m];
      }, [0, 0]));
      const expected = levels === 1 ? [[4, 16], [0, 0]] : [[12, 36], [6, 12], [0, 0]];
      for (const [i, [shear, moment]] of sectionActions.entries()) {
        expect.soft(shear).toBeCloseTo(expected[i]![0]!, 10);
        expect.soft(moment).toBeCloseTo(expected[i]![1]!, 10);
      }
    }
  });
}

it('#2316 a raked carrier retains its mass centroid in plan at roof level', () => {
  for (const variant of ['base', 'uneven', 'rotate', 'mirror'] as const) {
    const reflection = variant === 'mirror' ? -1 : 1;
    const { model, back } = remeshWind(mesh([[[0, 0, 0], [0, 3 * reflection, 4]]]), variant === 'mirror' ? 'base' : variant);
    model.sections.set(1, { id: 1, a: 0.5 });
    model.materials.set(1, { id: 1, rho: 4 });
    const rotated = variant === 'rotate';
    const plan = buildLoadPlan(request(supportAtZero(model), { directions: { x: !rotated, y: rotated } }));
    const roof = [...model.nodes.values()].find(n => n.z === 4)!;
    const loads = plan.nodal.filter(p => p.caseType === 'E');
    expect(plan.outcome).toBe('READY');
    expect.soft(loads.map(p => p.nodeId)).toEqual([roof.id]);
    const lines = plan.distributed.filter(p => p.caseType === 'E');
    const resultant = windResultants(model, lines, loads.map(p => ({ ...p, mz: reflection * (p.mz ?? 0) })), reflection < 0 ? (x, y) => [x, -y] : back);
    expect.soft(resultant[0]).toBeCloseTo(5, 10);
    expect.soft(resultant[4]).toBeCloseTo(20, 10);
    expect.soft(resultant[5]).toBeCloseTo(-11.25, 10);
    const base = [...model.nodes.values()].find(n => n.z === 0)!.id;
    const solver = spatialCantilever(model, [...model.elements.values()], rotated, base, loads);
    for (const nonlinear of [false, true]) {
      checkCantileverSolve(solver, true, nonlinear, result => {
        const reaction = (result as ReturnType<typeof solve3D>).reactions.find(r => r.nodeId === base)!;
        expect(rotated ? reaction.fy : reaction.fx).toBeCloseTo(-5, 10);
        expect(rotated ? reaction.mx : -reaction.my).toBeCloseTo(20, 10);
        expect(reaction.mz * reflection).toBeCloseTo(11.25, 10);
      });
    }
    expect.soft(lines).toEqual([]);
  }
});

for (const surface of ['quads', 'plates'] as const) {
  it(`#2316 a suspended ${surface} floor below the datum refuses static generation`, () => {
    for (const [elevation, density, refused] of [
      [-1, 4, true], [-Number.EPSILON, 4, true], [0, 4, false], [1, 4, false], [-1, 0, false],
    ] as const) {
      const model = datumCantilever();
      model.materials.set(2, { id: 2, rho: 0 });
      model.materials.set(3, { id: 3, rho: density });
      const corners = [[1, 0], [3, 0], [3, 2], [1, 2]].slice(0, surface === 'plates' ? 3 : 4);
      for (const [[x, y], k] of corners.map((point, k) => [point, k] as const)) {
        const id = k + 3;
        model.nodes.set(id, { id, x: x!, y: y!, z: elevation });
      }
      model.elements.set(2, { ...model.elements.get(1)!, id: 2, nodeI: 1, nodeJ: 3, materialId: 2 });
      if (elevation > 0) {
        model.nodes.set(7, { id: 7, x: 0, y: 0, z: elevation });
        model.elements.get(1)!.nodeJ = 7;
        model.elements.get(2)!.nodeI = 7;
        model.elements.set(3, { ...model.elements.get(1)!, id: 3, nodeI: 7, nodeJ: 2 });
      }
      model[surface] = new Map([[1, { id: 1, nodes: corners.map((_, k) => k + 3), thickness: 0.25, materialId: 3 }]]);
      if (refused) {
        expectDatumRefusal(model, 'loadPlan.blocked.seismicBelowDatum');
      } else {
        const options = request(model);
        const plan = buildLoadPlan(options);
        expect(plan.outcome).toBe('READY');
        const weight = elevation === 1 ? 7 + (surface === 'quads' ? 4 : 2) : 4;
        expect(plan.factors.baseShear?.value).toBeCloseTo(weight, 10);
        const actions = windResultants(model, plan.distributed.filter(p => p.caseType === 'E'), plan.nodal.filter(p => p.caseType === 'E'));
        if (elevation <= 0) {
          expect(actions[0]).toBeCloseTo(4, 10);
          expect(actions[4]).toBeCloseTo(16, 10);
        }
      }
    }
  });
}

it('#2316 a weighted member below the datum refuses even inside the base band', () => {
  for (const participating of [true, false]) {
    const model = datumCantilever();
    model.nodes.set(3, { id: 3, x: 0, y: 0, z: -0.01 });
    model.materials.set(2, { id: 2, rho: 0 });
    model.elements.set(2, { ...model.elements.get(1)!, id: 2, nodeI: 1, nodeJ: 3, materialId: participating ? 1 : 2 });
    if (participating) expectDatumRefusal(model, 'loadPlan.blocked.seismicBelowDatum');
    else expect(buildLoadPlan(request(model)).factors.baseShear?.value).toBe(4);
  }
});

it('#2316 carrier mass needs a physical attachment at the loaded story', () => {
  for (const [subdivide, attach] of [[false, false], [true, false], [true, true]] as const) {
    const column = subdivide ? [[[0, 0, 0], [0, 0, 2]], [[0, 0, 2], [0, 0, 4]]] : [[[0, 0, 0], [0, 0, 4]]];
    const model = supportAtZero(mesh([...column, [[0, 2, 0], [0, 2, 2]], [[0, 2, 2], [0, 2, 4]]]));
    const at = (y: number, z: number) => [...model.nodes.values()].find(n => n.y === y && n.z === z)!.id;
    tieFloor(model, at(0, 4), at(2, 4));
    model.nodes.set(10, { id: 10, x: 1, y: 2, z: 2 });
    tieFloor(model, at(2, 2), 10, ...(attach ? [at(0, 2)] : []));
    const options = request(model, {}, { generateCombinations: true });
    const plan = buildLoadPlan(options);
    const sink = seismicSink();
    INPRES103_SEISMIC.plan(options, plan.seismicModel!, sink);
    const refusal = { key: 'loadPlan.blocked.seismicMass.storyNode', params: { elevation: 2 } };
    expect.soft(plan.outcome).toBe(attach ? 'READY' : 'BLOCKED');
    expect.soft(plan.blockedKeys).toEqual(attach ? [] : [refusal]);
    expect.soft(sink.levelRefusals).toEqual(attach ? [] : [refusal]);
    const atFloor = plan.nodal.filter(p => p.caseType === 'E' && model.nodes.get(p.nodeId)!.z === 2);
    if (attach) {
      const weightPerMetre = model.sections.get(1)!.a * model.materials.get(1)!.rho;
      expect.soft(atFloor.map(p => p.nodeId)).toEqual([at(0, 2), at(2, 2)]);
      for (const p of atFloor) expect.soft(p.fx).toBeCloseTo(1.5 * weightPerMetre, 10);
    } else {
      expect.soft(atFloor).toEqual([]);
      expect.soft(plan.combinations).toEqual([]);
    }
  }
});

const issue2316Roof = process.env.RUN_KNOWN_WRONG === '2316' ? it : it.skip;

for (const fixed of [false, true]) {
  issue2316Roof(`known wrong result: #2316 roof inertia produces span bending and deflection (fixed: ${fixed})`, () => {
    const length = 4, q = 2, ei = 200000 * 1000 * 1e-4;
    for (const [variant, rotated] of [['base', false], ['uneven', false], ['base', true], ['uneven', true], ['mirror', false]] as const) {
      const roof = mesh([[[0, 0, 3], [0, length, 3]], [[0, 0, 0], [0, 0, 3]]]);
      const oriented = rotated ? transform(roof, -Math.PI / 2, 0) : roof;
      if (rotated) for (const n of oriented.nodes.values()) n.y = 0;
      const { model, sources } = remeshWind(oriented, variant);
      model.sections.set(1, { id: 1, a: 0.5 });
      model.materials.set(1, { id: 1, rho: 4 });
      model.materials.set(2, { id: 2, rho: 0 });
      for (const e of model.elements.values()) if (sources.get(e.id) === 2) e.materialId = 2;
      const direction = rotated ? { x: false, y: true } : { x: true, y: false };
      const side = (x: number, y: number) => rotated ? x : y;
      const transverse = (x: number, y: number) => rotated ? y : x;
      const options = request(supportAtZero(model), { directions: direction }, { generateCombinations: true });
      const plan = buildLoadPlan(options);
      const caseIndex = plan.cases.findIndex(c => c.type === 'E');
      const lines = plan.distributed.filter(p => p.caseIndex === caseIndex && p.caseType === 'E');
      const points = plan.nodal.filter(p => p.caseIndex === caseIndex && p.caseType === 'E');
      const sink = seismicSink();
      INPRES103_SEISMIC.plan(options, plan.seismicModel!, sink);
      expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
      expect(plan.factors.baseShear?.value).toBeCloseTo(q * length, 10);
      expect(plan.combinations.some(c => c.terms.some(t => t.symbol === 'E'))).toBe(true);
      expect(sink.distributed).toEqual(lines.map(d => ({ ...d, caseIndex: 0 })));
      expect.soft(points).toEqual([]);

      const members = [...model.elements.values()].filter(e => sources.get(e.id) === 1);
      expect.soft(lines.map(p => p.elementId)).toEqual(members.map(e => e.id));
      for (const p of lines) {
        const e = model.elements.get(p.elementId)!;
        const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
        expect(p.frame).toBe('global');
        expect(p.a ?? 0).toBe(0);
        expect(p.b ?? Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(Math.hypot(b.x - a.x, b.y - a.y), 10);
        expect(transverse(p.qX ?? 0, p.qY ?? 0)).toBeCloseTo(q, 10);
        expect(transverse(p.qXJ ?? p.qX ?? 0, p.qYJ ?? p.qY ?? 0)).toBeCloseTo(q, 10);
        expect(side(p.qX ?? 0, p.qY ?? 0)).toBe(0);
        expect(p.q).toBe(0);
      }

      const nodes = new Map([...model.nodes].filter(([, n]) => n.z === 3).map(([id, n]) => [id, { ...n, z: 3 }]));
      const elements = new Map(members.map(e => [e.id, { ...e, materialId: 1, type: 'frame' as const,
        localYx: rotated ? 0 : 1, localYy: rotated ? 1 : 0, localYz: 0,
        releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false,
        releaseTStart: false, releaseTEnd: false,
      }]));
      const supports = new Map([...nodes].filter(([, n]) => [0, length].includes(side(n.x, n.y))).map(([nodeId]) =>
        [nodeId, { nodeId, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: fixed }]));
      const loads: Load[] = [
        ...points.map((p, id) => ({ type: 'nodal3d' as const, data: { id, nodeId: p.nodeId, fx: p.fx, fy: p.fy, fz: p.fz, mx: 0, my: 0, mz: p.mz ?? 0 } })),
        ...lines.map((p, id) => ({ type: 'distributed3d' as const, data: { id: id + points.length, elementId: p.elementId, frame: p.frame,
          a: p.a, b: p.b, qXI: p.qX, qXJ: p.qXJ ?? p.qX, qYI: p.qY ?? 0, qYJ: p.qYJ ?? p.qY ?? 0, qZI: p.q, qZJ: p.qJ ?? p.q } })),
      ];
      const solverModel = { ...model, nodes, elements, supports, loads } as unknown as ModelData;
      const solver = { ...cantileverSections, nodes, elements, supports, loads: buildSolverLoads3D(solverModel, loads, false, false) };
      for (const nonlinear of [false, true]) checkCantileverSolve(solver, true, nonlinear, raw => {
        const result = raw as AnalysisResults3D;
        expect(result.elementForces.map(f => f.elementId)).toEqual(members.map(e => e.id));
        for (const f of result.elementForces) {
          const member = elements.get(f.elementId)!;
          const i = nodes.get(member.nodeI)!, j = nodes.get(member.nodeJ)!;
          const start = side(i.x, i.y), end = side(j.x, j.y);
          for (const t of [0, 0.25, 0.5, 0.75, 1]) {
            const x = start + t * (end - start);
            expect.soft(evaluateDiagramAt(f, 'shearY', t)).toBeCloseTo(q * (x - length / 2), 10);
            expect.soft(evaluateDiagramAt(f, 'momentZ', t)).toBeCloseTo(q * x * (length - x) / 2 - (fixed ? q * length ** 2 / 12 : 0), 10);
            expect.soft(evaluateDiagramAt(f, 'torsion', t)).toBeCloseTo(0, 10);
          }
          const mid = length / 2;
          if (!(start <= mid && mid <= end)) continue;
          const di = result.displacements.find(d => d.nodeId === i.id)!, dj = result.displacements.find(d => d.nodeId === j.id)!;
          const rotation = rotated ? 1 : -1;
          const sample = recoverMember({
            space: 'spatial', length: f.length, ei,
            vI: transverse(di.ux, di.uy), vJ: transverse(dj.ux, dj.uy), rI: rotation * di.rz, rJ: rotation * dj.rz,
            hingeStart: false, hingeEnd: false, points: [], dist: f.distributedLoadsY ?? [],
            positions: [(mid - start) / (end - start)],
          });
          expect.soft(sample[0]!.v).toBeCloseTo((fixed ? 1 : 5) * q * length ** 4 / (384 * ei), 10);
        }
      });
    }
  });
}

for (const torsion of ['medium', 'extreme'] as const) {
  issue2316Roof(`known wrong result: #2316 45° seismic refuses ${torsion} accidental torsion`, () => {
    const { model, code } = diagonalModalFixture();
    const diagnostic = { key: 'loadPlan.blocked.seismicDiagonalTorsion' };
    for (const withAxes of [false, true]) for (const diagonal of [false, true]) {
      const options = request(model, { code, diagonal, torsion, directions: { x: withAxes, y: withAxes } },
        { generateCombinations: true });
      const plan = buildLoadPlan(options);
      const sink = seismicSink();
      INPRES103_SEISMIC.plan(options, plan.seismicModel!, sink);
      expect.soft(plan.blockedKeys).toEqual(diagonal ? [diagnostic] : []);
      expect.soft(sink.blockedKeys).toEqual(diagonal ? [diagnostic] : []);
      expect.soft(plan.outcome).toBe(diagonal ? 'BLOCKED' : 'READY');
      const names = withAxes && !diagonal ? ['X', 'X', 'Y', 'Y'] : [];
      expect.soft(plan.cases.filter(c => c.type === 'E').map(c => c.nameParams?.dir)).toEqual(names);
      expect.soft(sink.cases.map(c => c.nameParams?.dir)).toEqual(names);
      if (diagonal) expect.soft(plan).toMatchObject({ distributed: [], surface: [], nodal: [], combinations: [] });
    }
  });
}

for (const surface of ['quads', 'plates'] as const) {
  issue2316Roof(`known wrong result: #2316 story inertia stays on ${surface} as in-plane traction`, () => {
    const model = mixedSeismicModel(surface);
    model.materials.set(2, { id: 2, rho: 0 });
    model.elements.get(1)!.materialId = 2;
    tieFloor(model, 2, 4);
    const options = request(model, {}, { generateCombinations: true });
    const plan = buildLoadPlan(options);
    const sink = seismicSink();
    INPRES103_SEISMIC.plan(options, plan.seismicModel!, sink);
    expect(plan.outcome).toBe('READY');
    expect(plan.combinations.some(c => c.terms.some(t => t.symbol === 'E'))).toBe(true);
    const tractions = plan.surface.filter(s => s.caseType === 'E');
    const shellArea = surface === 'quads' ? 4 : 2;
    expect(plan.factors.baseShear?.value).toBeCloseTo(shellArea, 10);
    expect.soft(tractions).toMatchObject([{ quadId: 1, on: surface === 'plates' ? 'plate' : undefined, frame: 'global', dir: [1, 0, 0], q: 1 }]);
    expect.soft(plan.nodal.filter(n => n.caseType === 'E')).toEqual([]);
    expect(sink.surface).toEqual(tractions.map(d => ({ ...d, caseIndex: 0 })));
    const loads: Load[] = tractions.map(({ quadId, on, frame, dir, q }, id) =>
      ({ type: 'surface3d', data: { id, quadId, on, frame, dir, q } }));
    const solverLoads = buildSolverLoads3D(model as unknown as ModelData, loads, false, false);
    const cornerIds = model[surface]!.get(1)!.nodes;
    expect.soft(solverLoads).toHaveLength(cornerIds.length);
    for (const l of solverLoads) {
      expect(l.type).toBe('nodal');
      if (l.type !== 'nodal') continue;
      expect(cornerIds).toContain(l.data.nodeId);
      expect(l.data.fx).toBeCloseTo(shellArea / cornerIds.length, 10);
      expect(l.data.fy).toBe(0);
      expect(l.data.fz).toBe(0);
    }
  });
}
