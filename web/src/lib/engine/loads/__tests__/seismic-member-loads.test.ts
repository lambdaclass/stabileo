import { readFileSync, writeFileSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import { computeDiagramValueAt } from '../../diagrams';
import { evaluateDiagramAt } from '../../diagrams-3d';
import { input2DToWireObject, input3DToWireObject, solve, solve3D, solvePDelta, solvePDelta3D } from '../../wasm-solver';
import type { SolverInput } from '../../types';
import type { SolverInput3D } from '../../types-3d';
import { designSpectrum, isBlocked } from '../../../codes/cirsoc103/spectrum';
import { modelStore } from '../../../store';
import { INPRES103_SEISMIC } from '../../../codes/families/cirsoc';
import { bindRole } from '../../../codes/roles';
import { buildLoadPlan, type LoadModelData, type LoadPlanInput, type PlannedDistributed, type SeismicPlanSink } from '../load-plan';
import type { SeismicLevel } from '../seismic-mass';
import { MODAL_SEISMIC_UNAVAILABLE } from '../seismic-generation';
import { input } from './gravity-width-mass-fixture';
import { mesh, transform } from './snow-surface-round2-fixture';
import { windResultants, remeshWind } from './wind-integration-fixture';

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
    const plan = buildLoadPlan(request(model));
    expect(plan.outcome).toBe('READY');
    const lines = plan.distributed.filter(p => p.caseType === 'E');
    const points = plan.nodal.filter(p => p.caseType === 'E');
    const force = 32 * model.sections.get(1)!.a * model.materials.get(1)!.rho;
    expect(plan.factors.baseShear!.value).toBeCloseTo(force, 10);
    const resultants = windResultants(model, lines, points);
    const centroidY = mirror * 5 * Math.sin(angle) + 3 * Math.cos(angle);
    expect(resultants[0]).toBeCloseTo(force, 10);
    expect(resultants[5] / force).toBeCloseTo(-centroidY, 10);
    expect(points).toEqual([]);
    for (const e of model.elements.values()) {
      const pieces = lines.filter(p => p.elementId === e.id);
      expect(pieces.length).toBeGreaterThan(0);
      for (const piece of pieces) {
        expect(piece.frame).toBe('global');
        expect(piece.qX! / force).toBeCloseTo(1 / 32, 10);
        expect((piece.qXJ ?? piece.qX!) / force).toBeCloseTo(1 / 32, 10);
        expect(piece.qY ?? 0).toBe(0);
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

function forceComponent(part: PlannedDistributed, rotated: boolean, end = false) {
  return rotated
    ? end ? part.qYJ! : part.qY!
    : end ? part.qXJ! : part.qX!;
}

function verifyCantilever(
  model: LoadModelData, members: Array<{ id: number; nodeI: number; nodeJ: number; sectionId: number }>,
  rotated: boolean, length: number, parts: PlannedDistributed[], momentOfLoad: (station: number, power: number) => number,
) {
  const ids = new Set(members.flatMap(e => [e.nodeI, e.nodeJ]));
  const nodes = new Map([...ids].map(id => [id, { id, x: 0, z: model.nodes.get(id)!.z! }]));
  const base = [...nodes.values()].find(n => n.z === 0)!.id, tip = [...nodes.values()].find(n => n.z === length)!.id;
  const component = (part: PlannedDistributed, end = false) => forceComponent(part, rotated, end);
  const common = {
    materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-4 }]]),
  };
  const plane: SolverInput = {
    ...common, nodes, elements: new Map(members.map(e => [e.id, { ...e, materialId: 1, type: 'frame', hingeStart: false, hingeEnd: false }])),
    supports: new Map([[base, { id: base, nodeId: base, type: 'fixed' }]]),
    loads: parts.map(p => ({ type: 'distributed', data: { elementId: p.elementId, a: p.a, b: p.b, qI: -component(p), qJ: -component(p, true) } })),
  };
  const spatial: SolverInput3D = {
    ...common, nodes: new Map([...ids].map(id => [id, { ...model.nodes.get(id)!, z: nodes.get(id)!.z }])),
    elements: new Map(members.map(e => [e.id, { ...e, materialId: 1, type: 'frame', localYx: rotated ? 0 : 1, localYy: rotated ? 1 : 0, localYz: 0,
      releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }])),
    supports: new Map([[base, { nodeId: base, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
    loads: parts.map(p => ({ type: 'distributed', data: { elementId: p.elementId, a: p.a, b: p.b, qYI: component(p), qYJ: component(p, true), qZI: 0, qZJ: 0 } })),
  };
  for (const is3d of [false, true]) for (const nonlinear of [false, true]) {
    const verify = (result: ReturnType<typeof solve> | ReturnType<typeof solve3D>) => {
      expect(result.elementForces.map(f => f.elementId).sort()).toEqual(members.map(m => m.id).sort());
      for (const f of result.elementForces) for (const t of [0, 0.2, 0.5, 0.8, 1]) {
        const s = nodes.get(model.elements.get(f.elementId)!.nodeI)!.z + t * f.length;
        const v = momentOfLoad(s, 0), m = momentOfLoad(s, 1) - s * v;
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
      expect(displacement).toBeCloseTo((3 * length * momentOfLoad(0, 2) - momentOfLoad(0, 3)) / (6 * 200000 * 1000 * 1e-4), 10);
    };
    if (nonlinear) {
      const solution = is3d ? solvePDelta3D(spatial) : solvePDelta(plane);
      expect(solution.converged).toBe(true);
      verify(solution.results);
    } else {
      verify(is3d ? solve3D(spatial) : solve(plane));
    }
    if (nativeInputPath) {
      const model = is3d ? input3DToWireObject(spatial) : input2DToWireObject(plane);
      nativeInputs.push({ dimension: is3d ? 3 : 2, input: nonlinear ? { analysis: 'pdelta', model } : model });
    }
    if (nativeResults) {
      const solution = nativeResults[nativeCount++]!;
      if (nonlinear) expect(solution.converged).toBe(true);
      verify(nonlinear ? solution.results! : solution as ReturnType<typeof solve> | ReturnType<typeof solve3D>);
    }
  }
}

function verifyCarrierMechanics() {
  const length = 4, half = length / 2;
  for (const variant of ['base', 'uneven', 'rotate', 'mirror'] as const) {
    const { model, sources } = remeshWind(mesh([-2, 2].map(y => [[0, y, 0], [0, y, length]])), variant);
    const rotated = variant === 'rotate';
    for (const torsion of ['low', 'medium', 'extreme'] as const) {
      const weightPerLength = model.sections.get(1)!.a * model.materials.get(1)!.rho;
      const staticRequest = request(model, {
        torsion, directions: { x: !rotated, y: rotated },
      });
      const plan = buildLoadPlan(staticRequest);
      expect(plan.outcome).toBe('READY');
      expect(plan.nodal.filter(n => n.caseType === 'E')).toEqual([]);
      for (const [caseIndex, c] of plan.cases.entries()) {
        if (c.type !== 'E') continue;
        const eccentricity = { low: 0, medium: 0.05, extreme: 0.1 }[torsion] * (c.nameParams?.sign === '−' ? -1 : 1);
        for (const carrier of [1, 2]) {
          const members = [...model.elements.values()].filter(e => sources.get(e.id) === carrier);
          const ids = new Set(members.flatMap(e => [e.nodeI, e.nodeJ]));
          const root = [...ids].map(id => model.nodes.get(id)!).find(n => n.z === 0)!;
          const radius = rotated ? root.x : -root.y;
          const q = weightPerLength * (1 + eccentricity * radius);
          const parts = plan.distributed.filter(d => d.caseIndex === caseIndex && sources.get(d.elementId) === carrier);
          expect(parts.length).toBeGreaterThan(0);
          const momentOfLoad = (station: number, power: number) => q * (length ** (power + 1) - Math.max(half, station) ** (power + 1)) / (power + 1);
          for (const part of parts) {
            const member = model.elements.get(part.elementId)!;
            const start = model.nodes.get(member.nodeI)!.z! + part.a!, end = model.nodes.get(member.nodeI)!.z! + part.b!;
            expect(start).toBeGreaterThanOrEqual(half);
            expect(end).toBeLessThanOrEqual(length);
            expect(forceComponent(part, rotated)).toBeCloseTo(q, 10);
            expect(forceComponent(part, rotated, true)).toBeCloseTo(q, 10);
          }
          verifyCantilever(model, members, rotated, length, parts, momentOfLoad);
        }
      }
    }
  }
}

it('#2208 partial carrier pressures reproduce cantilever shear, bending, torsion and deflection', () => {
  verifyCarrierMechanics();
});

it('#2208 keeps supported levels when an eccentric strip requires distributed couples', () => {
  const model = mesh([[ [0, -2, 0], [0, -2, 3] ], [ [0, 2, 0], [0, 2, 3] ], [ [0, 1, 6], [4, 1, 6] ]]);
  for (const width of [0, Number.EPSILON, 1]) {
    const base = buildLoadPlan(request(model, {}, { tributaryWidth: width, dead: [{ labelKey: 'test', q: 1 }] }));
    const plan = buildLoadPlan(request(model, { torsion: 'medium' }, { tributaryWidth: width, dead: [{ labelKey: 'test', q: 1 }], generateCombinations: true }));
    const lines = plan.distributed.filter(d => d.caseType === 'E');
    expect(lines.some(d => d.elementId === 1)).toBe(true);
    expect(lines.some(d => d.elementId === 2)).toBe(true);
    expect(lines.some(d => d.elementId === 3)).toBe(width === 0);
    expect(plan.outcome).toBe(width === 0 ? 'READY' : 'BLOCKED');
    expect(plan.blockedKeys).toEqual(width === 0 ? [] : [{ key: 'loadPlan.blocked.seismicMass.eccentric', params: { elevation: 6 } }]);
    if (width > 0) {
      expect(plan.combinations).toEqual([]);
      const one = lines.filter(d => d.caseIndex === plan.cases.findIndex(c => c.type === 'E'));
      const plain = base.distributed.filter(d => d.caseType === 'E' && d.elementId !== 3);
      expect(windResultants(model, one)[0]).toBeCloseTo(windResultants(model, plain)[0]!, 10);
    }
  }
});

it('#2208 flat shell self-weight and superimposed pressure stay on the physical loaded surface', () => {
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
  const plan = buildLoadPlan(request(model, {}, { gravity: { mode: 'panels' }, dead: [{ labelKey: 'test', q: 2 }] }));
  expect(plan.outcome).toBe('READY');
  expect(plan.distributed.filter(d => d.caseType === 'E')).toEqual([]);
  expect(plan.nodal.filter(d => d.caseType === 'E')).toEqual([]);
  const forces = plan.surface.filter(d => d.caseType === 'E');
  for (const [id, q] of [[1, 3], [2, 5]]) {
    const parts = forces.filter(d => d.quadId === id);
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.reduce((s, d) => s + d.q, 0)).toBeCloseTo(q, 10);
    for (const p of parts) expect(p.dir).toEqual([1, 0, 0]);
  }
});

it('#2208 keeps the supported level’s exact force when an upper tributary panel cannot be transferred', () => {
  const model = mesh([
    [[0, -2, 0], [0, -2, 3]], [[0, 2, 0], [0, 2, 3]],
    [[0, 0, 6], [4, 0, 6], [4, 2, 6], [0, 2, 6]],
  ]);
  const density = model.sections.get(1)!.a * model.materials.get(1)!.rho;
  const roofArea = 4 * 2, roofPerimeter = 2 * (4 + 2);
  const lower = 3 * density, upper = roofPerimeter * density + roofArea;
  const plan = buildLoadPlan(request(model, {}, {
    gravity: { mode: 'panels', loadEveryPanel: true }, dead: [{ labelKey: 'test', q: 1 }], generateCombinations: true,
  }));
  expect(plan.outcome).toBe('BLOCKED');
  expect(plan.blockedKeys).toEqual([{ key: 'loadPlan.blocked.seismicMass.panel', params: { elevation: 6 } }]);
  expect(plan.combinations).toEqual([]);
  const lines = plan.distributed.filter(d => d.caseType === 'E');
  expect(new Set(lines.map(d => d.elementId))).toEqual(new Set([1, 2]));
  expect(windResultants(model, lines)[0]).toBeCloseTo((lower + upper) * lower * 3 / (lower * 3 + upper * 6), 10);
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
  expect.soft(plan.levels.map(l => [l.elevation, l.weightKN])).toEqual(hasFloor ? [[0, 2], [2, 4], [4, 2]] : [[0, 4], [4, 4]]);
  expect.soft(plan.factors.seismicWeight!.value).toBe(hasFloor ? 6 : 4);
  expect(plan.cases.filter(c => c.type === 'E')).toHaveLength(1);
  expect(plan.nodal.filter(d => d.caseType === 'E')).toEqual([]);
  expect(plan.surface.filter(d => d.caseType === 'E')).toEqual([]);

  const bands: Array<[number, number]> = hasFloor ? [[0, 1], [1, 3], [3, 4]] : [[0, 2], [2, 4]];
  const intensities = hasFloor ? [0, 1.5, 3] : [0, 2];
  const forces = hasFloor ? [0, 3, 3] : [0, 4];
  const parts = plan.distributed.filter(d => d.caseType === 'E');
  const members = [...model.elements.values()];
  for (const [k, [a, b]] of bands.entries()) {
    const force = parts.reduce((sum, part) => {
      const z = model.nodes.get(model.elements.get(part.elementId)!.nodeI)!.z!;
      const overlap = Math.max(0, Math.min(b, z + part.b!) - Math.max(a, z + part.a!));
      return sum + overlap * (forceComponent(part, rotated) + forceComponent(part, rotated, true)) / 2;
    }, 0);
    expect.soft(force).toBeCloseTo(forces[k]!, 10);
  }
  for (const member of members) {
    const start = model.nodes.get(member.nodeI)!.z!, end = model.nodes.get(member.nodeJ)!.z!;
    const expected = bands.flatMap(([a, b], k) => {
      const lo = Math.max(a!, start), hi = Math.min(b, end);
      return lo < hi && intensities[k]! > 0 ? [{ a: lo - start, b: hi - start, q: intensities[k]! }] : [];
    });
    const loads = parts.filter(p => p.elementId === member.id).sort((a, b) => a.a! - b.a!);
    expect.soft(loads.map(p => [p.a, p.b])).toEqual(expected.map(p => [p.a, p.b]));
    for (const [k, load] of loads.entries()) {
      expect(load.frame).toBe('global');
      expect(forceComponent(load, !rotated)).toBe(0);
      expect(forceComponent(load, !rotated, true)).toBe(0);
      const piece = expected[k];
      if (!piece) continue;
      expect.soft(forceComponent(load, rotated)).toBeCloseTo(piece.q, 10);
      expect.soft(forceComponent(load, rotated, true)).toBeCloseTo(piece.q, 10);
    }
  }
  const momentOfLoad = (s: number, k: number) => bands.reduce((sum, [a, b], i) =>
    sum + intensities[i]! * (b ** (k + 1) - Math.min(b, Math.max(s, a)) ** (k + 1)) / (k + 1), 0);
  verifyCantilever(model, members, rotated, 4, parts, momentOfLoad);
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
    const far = modelStore.addNode(4, 0, 4);
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
    expect(plan.distributed.filter(d => d.caseType === 'E').length).toBeGreaterThan(0);
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
  return { model, byColumn };
}

function verifyRound2Columns(
  model: LoadModelData, byColumn: ReturnType<typeof round2Columns>['byColumn'], plan: ReturnType<typeof buildLoadPlan>,
  rotated: boolean, loadedFrom: number, intensity: number, power: number, planWidth = 0,
) {
  expect(plan.outcome).toBe('READY');
  expect(plan.nodal.filter(d => d.caseType === 'E')).toEqual([]);
  const carrierIds = new Set(byColumn.flat().map(e => e.id));
  const cases = plan.cases.flatMap((c, index) => c.type === 'E' ? [{ c, index }] : []);
  expect(cases).toHaveLength(planWidth === 0 ? 1 : 2);
  for (const { c, index } of cases) {
    const loads = plan.distributed.filter(d => d.caseIndex === index);
    expect(loads.every(d => carrierIds.has(d.elementId))).toBe(true);
    const sign = c.nameParams?.sign === '−' ? -1 : 1;
    const torque = 2 * intensity * (height ** (power + 1) - loadedFrom ** (power + 1)) / (power + 1) * sign * 0.05 * planWidth;
    for (const members of byColumn) {
      const parts = loads.filter(d => members.some(e => e.id === d.elementId));
      const root = model.nodes.get(members[0]!.nodeI)!;
      const arm = rotated ? root.x : -root.y;
      const q = intensity * (1 + sign * 0.05 * planWidth * arm / 4);
      const momentOfLoad = (station: number, k: number) =>
        q * (height ** (k + power + 1) - Math.max(loadedFrom, station) ** (k + power + 1)) / (k + power + 1);
      verifyCantilever(model, members, rotated, height, parts, momentOfLoad);
      for (const part of parts) {
        const member = model.elements.get(part.elementId)!;
        const z = model.nodes.get(member.nodeI)!.z!;
        expect(part.frame).toBe('global');
        expect(z + part.a!).toBeGreaterThanOrEqual(loadedFrom);
        expect(z + part.b!).toBeLessThanOrEqual(height);
        expect(forceComponent(part, rotated)).toBeCloseTo(q * (z + part.a!) ** power, 10);
        expect(forceComponent(part, rotated, true)).toBeCloseTo(q * (z + part.b!) ** power, 10);
        expect(forceComponent(part, !rotated)).toBeCloseTo(0, 10);
        expect(forceComponent(part, !rotated, true)).toBeCloseTo(0, 10);
      }
    }
    expect(windResultants(model, loads)[5]).toBeCloseTo(torque, 10);
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
    verifyRound2Columns(model, byColumn, plan, rotated, height / 2, w, 0, 10);
  });

}

it('#2316 a nonzero structural width with no polar mass refuses accidental torsion', () => {
  for (const width of [0, 5]) {
    const model = mesh([[[0, 0, 0], [0, 0, height]], ...(width > 0 ? [[[0, 0, height], [0, width, height]]] : [])]);
    model.materials.set(2, { id: 2, rho: 0 });
    const edge = model.elements.get(2);
    if (edge) edge.materialId = 2;
    const plan = buildLoadPlan(request(model, { torsion: 'medium' }, { generateCombinations: true }));
    expect(plan.outcome).toBe(width === 0 ? 'READY' : 'BLOCKED');
    if (width === 0) {
      const w = model.sections.get(1)!.a * model.materials.get(1)!.rho;
      const momentOfLoad = (s: number, k: number) => w * (height ** (k + 1) - Math.max(height / 2, s) ** (k + 1)) / (k + 1);
      for (const [index, c] of plan.cases.entries()) if (c.type === 'E') {
        verifyCantilever(model, [model.elements.get(1)!], false, height, plan.distributed.filter(d => d.caseIndex === index), momentOfLoad);
      }
    } else {
      expect(plan.blockedKeys).toEqual([{ key: 'loadPlan.blocked.seismicMass.torsion', params: { elevation: height } }]);
      expect(plan.distributed.filter(d => d.caseType === 'E')).toEqual([]);
      expect(plan.combinations).toEqual([]);
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
  const [fx, fy] = windResultants(model, plan.distributed.filter(d => d.caseIndex === caseIndex));
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
  const levels = buildLoadPlan(request(model)).levels as SeismicLevel[];
  const sink: SeismicPlanSink = {
    cases: [], nodal: [], distributed: [], surface: [], derivation: [], refs: [],
    assumptions: [], unsupportedKeys: [], blockedKeys: [], levelRefusals: [],
  };
  INPRES103_SEISMIC.plan(request(model, seismic), levels, sink);
  expect(sink.blockedKeys).toEqual([{ key: MODAL_SEISMIC_UNAVAILABLE }]);
  expect(sink).toMatchObject({ cases: [], distributed: [], nodal: [], surface: [] });
});
