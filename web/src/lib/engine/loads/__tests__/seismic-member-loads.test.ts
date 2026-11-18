import { readFileSync, writeFileSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import { computeDiagramValueAt } from '../../diagrams';
import { evaluateDiagramAt } from '../../diagrams-3d';
import { input2DToWireObject, input3DToWireObject, solve, solve3D, solvePDelta, solvePDelta3D } from '../../wasm-solver';
import type { SolverInput } from '../../types';
import type { SolverInput3D } from '../../types-3d';
import { designSpectrum, isBlocked, spectralOrdinate } from '../../../codes/cirsoc103/spectrum';
import { modelStore } from '../../../store';
import { modesForPlan } from '../../../store/seismic-modes';
import { bindRole } from '../../../codes/roles';
import { buildLoadPlan, type LoadModelData, type LoadPlanInput, type PlannedDistributed } from '../load-plan';
import { modalLoadingLevels, modalStoryForces, type ModeShape } from '../seismic-modal';
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

it('#2209 integrates the same physical mode across a nonuniform mesh', () => {
  for (const subdivide of [false, true]) for (const idOffset of [0, 100]) {
    const model = mesh([[[0, 0, 3], [1, 0, 3]], subdivide
      ? [[0, 0, 6], [0.25, 0, 6], [1, 0, 6]]
      : [[0, 0, 6], [1, 0, 6]]]);
    if (subdivide) model.elements.delete(4);
    const shape = new Map([...model.nodes.values()].map(n => [
      n.id + idOffset, { ux: n.z === 3 ? 1 : 1 + 2 * n.x, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 },
    ]));
    const levels = [3, 6].map(elevation => ({
      elevation, weightKN: 100,
      nodeIds: [...model.nodes.values()].filter(n => n.z === elevation).map(n => n.id + idOffset),
      mass: [...model.elements.values()].flatMap(e => {
        const i = model.nodes.get(e.nodeI)!, j = model.nodes.get(e.nodeJ)!;
        const length = Math.abs(j.x - i.x);
        return i.z === elevation ? [{
          kind: 'line' as const, hasBendingRelease: false, elementId: e.id, nodeI: { ...i, id: i.id + idOffset, z: elevation },
          nodeJ: { ...j, id: j.id + idOffset, z: elevation }, length, a: 0, b: length, wi: 100, wj: 100,
        }] : [];
      }),
    }));
    const m = modalStoryForces(levels, [{ period: 1, shape }], 'x', () => 1);
    const gamma = 3 / (1 + 13 / 3);
    expect(m.perMode[0]!.gamma).toBeCloseTo(gamma, 10);
    expect(m.massRatio).toBeCloseTo(3 * gamma / 2, 10);
    expect(m.forces[0]).toBeCloseTo(100 * gamma, 10);
    expect(m.forces[1]).toBeCloseTo(200 * gamma, 10);
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

function verifyCarrierMechanics(method: 'static' | 'modal') {
  const length = 4, half = length / 2;
  for (const variant of ['base', 'uneven', 'rotate', 'mirror'] as const) {
    const { model, sources } = remeshWind(mesh([-2, 2].map(y => [[0, y, 0], [0, y, length]])), variant);
    const rotated = variant === 'rotate';
    if (method === 'modal') {
      model.materials.set(2, { id: 2, rho: 0 });
      for (const e of [...model.elements.values()]) {
        const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
        if (a.z! < half && b.z! > half) {
          const id = model.nodes.size + 1;
          model.nodes.set(id, { ...a, id, z: half });
          const upper = model.elements.size + 1;
          model.elements.set(upper, { ...e, id: upper, nodeI: id });
          sources.set(upper, sources.get(e.id)!);
          e.nodeJ = id;
        }
        if (model.nodes.get(e.nodeJ)!.z! <= half) e.materialId = 2;
      }
    }
    for (const torsion of ['low', 'medium', 'extreme'] as const) {
      const weightPerLength = model.sections.get(1)!.a * model.materials.get(1)!.rho;
      const code = {
        zone: 4, site: 'SB', group: 'B', systemKey: 'rc_frame_full_ductility', periodSystem: 'concreteMomentFrame',
        regularity: 'regular', occupancy: 'reduced',
      } as const;
      const period = 1;
      const shape = new Map([...model.nodes.values()].map(n => [n.id, {
        ux: !rotated && n.z! >= half ? 1 : 0, uy: rotated && n.z! >= half ? 1 : 0, uz: 0,
        rx: 0, ry: 0, rz: 0,
      }]));
      const requestForMethod = request(model, {
        torsion, directions: { x: !rotated, y: rotated },
        ...(method === 'modal' ? { code, modal: { modes: [{ period, shape }] } } : {}),
      });
      const plan = buildLoadPlan(requestForMethod);
      expect(plan.outcome).toBe('READY');
      expect(plan.nodal.filter(n => n.caseType === 'E')).toEqual([]);
      let intensity = weightPerLength;
      if (method === 'modal') {
        const spectrum = designSpectrum(code);
        if (isBlocked(spectrum)) throw new Error('Test spectrum was refused');
        const ordinate = spectralOrdinate(period, spectrum) * plan.seismic!.gammaR! / plan.seismic!.r!;
        const modal = plan.derivation.find(d => d.key === 'loadPlan.derivation.modal');
        expect(modal?.params?.ratio).toBe(100);
        intensity *= Math.max(ordinate, 0.85 * plan.seismic!.c);
      }
      for (const [caseIndex, c] of plan.cases.entries()) {
        if (c.type !== 'E') continue;
        const eccentricity = { low: 0, medium: 0.05, extreme: 0.1 }[torsion] * (c.nameParams?.sign === '−' ? -1 : 1);
        for (const carrier of [1, 2]) {
          const members = [...model.elements.values()].filter(e => sources.get(e.id) === carrier);
          const ids = new Set(members.flatMap(e => [e.nodeI, e.nodeJ]));
          const root = [...ids].map(id => model.nodes.get(id)!).find(n => n.z === 0)!;
          const radius = rotated ? root.x : -root.y;
          const q = intensity * (1 + eccentricity * radius);
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
  verifyCarrierMechanics('static');
});

it('#2209 modal carrier pressures reproduce cantilever shear, bending, torsion and deflection', () => {
  verifyCarrierMechanics('modal');
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

it('#2209 refuses incomplete mode samples before they change story shear', () => {
  const nodeI = { id: 1, x: 0, y: 0, z: 3 }, nodeJ = { id: 2, x: 1, y: 0, z: 3 };
  const levels = [{ elevation: 3, weightKN: 100, nodeIds: [1, 2],
    mass: [{ kind: 'line' as const, hasBendingRelease: false, elementId: 1, nodeI, nodeJ, length: 1, a: 0, b: 1, wi: 100, wj: 100 }] }];
  const sample = { ux: 1, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 };
  const complete = new Map([[1, sample], [2, sample]]);
  expect(modalStoryForces(levels, [{ period: 1, shape: complete }], 'x', () => 1).forces[0]).toBeCloseTo(100, 10);
  for (const value of [NaN, Infinity, -Infinity]) {
    const shape = new Map([[1, sample], [2, { ...sample, rz: value }]]);
    expect(() => modalStoryForces(levels, [{ period: 1, shape }], 'x', () => 1)).toThrow();
  }
  expect(() => modalStoryForces(levels, [{ period: 1, shape: new Map([[1, sample]]) }], 'x', () => 1)).toThrow();
});

it('#2209 the production modal adapter retains the mass participation and complete frame shape', () => {
  modelStore.clear();
  try {
    const i = modelStore.addNode(0, 0, 0), j = modelStore.addNode(0, 0, 4);
    modelStore.addElement(i, j, 'frame');
    modelStore.addSupport(i, 'fixed3d');
    const model = modelStore.model as unknown as LoadModelData;
    const plan = buildLoadPlan(request(model));
    expect(plan.outcome).toBe('READY');
    const result = modesForPlan(plan, 0);
    expect(result).not.toHaveProperty('error');
    if ('error' in result) throw new Error(result.error);
    type ReportedMode = (typeof result.modes)[number] & {
      shape: Map<number, { ux: number; uy: number; uz: number; rx: number; ry: number; rz: number }>;
      participation?: { x: { gamma: number; ratio: number } };
    };
    const inX = (result.modes as ReportedMode[]).find(m => (m.participation?.x.ratio ?? 0) > 0.1)!;
    expect(inX).toBeDefined();
    const tip = inX.shape.get(j)!;
    expect(Math.abs(tip.ry)).toBeGreaterThan(0);
    expect(tip.uz).toBeCloseTo(0, 10);
    const length = 4, weightPerLength = model.sections.values().next().value!.a * model.materials.values().next().value!.rho;
    const h1J = (x: number) => x ** 3 - x ** 4 / 2;
    const h2J = (x: number) => x ** 4 / 4 - x ** 3 / 3;
    const momentum = weightPerLength * length * (tip.ux * (h1J(1) - h1J(0)) + length * tip.ry * (h2J(1) - h2J(0)));
    const { seismicLevels } = plan as typeof plan & { seismicLevels: Parameters<typeof modalStoryForces>[0] };
    const forces = modalStoryForces(seismicLevels, [inX], 'x', () => 1);
    expect(forces.baseShear).toBeCloseTo(Math.abs(inX.participation!.x.gamma * momentum), 10);
    expect(forces.massRatio).toBe(inX.participation!.x.ratio);
  } finally {
    modelStore.clear();
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

const knownWrong = process.env.RUN_KNOWN_WRONG === '2319' ? it : it.skip;
const round2Code = {
  zone: 4, site: 'SB', group: 'B', systemKey: 'rc_frame_full_ductility', periodSystem: 'concreteMomentFrame',
  regularity: 'regular', occupancy: 'reduced',
} as const;
const height = 4;
const round2Spectrum = designSpectrum(round2Code);
if (isBlocked(round2Spectrum)) throw new Error('Test spectrum was refused');
const round2Period = (round2Spectrum.t1 + round2Spectrum.t2) / 2;

function prescribedMode(model: LoadModelData, rotated: boolean, displacement: (z: number) => number, slope: number): ModeShape {
  return {
    period: round2Period,
    shape: new Map([...model.nodes.values()].map(n => [n.id, {
      ux: rotated ? 0 : displacement(n.z!), uy: rotated ? displacement(n.z!) : 0,
      uz: 0, rx: rotated ? -slope : 0, ry: rotated ? 0 : slope, rz: 0,
    }])),
  };
}

function modalRequest(mode: ModeShape, rotated: boolean) {
  return {
    code: { ...round2Code, computedT: round2Period },
    modal: { modes: [mode] },
    directions: { x: !rotated, y: rotated },
  };
}

function verifyColumnStoryPartition(cuts: number[], rotated: boolean, floorRole: 'master' | 'slave' | 'none', method: 'static' | 'modal') {
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

  const mode = prescribedMode(model, rotated, () => 1, 0);
  const directions = { x: !rotated, y: rotated };
  const plan = buildLoadPlan(request(model, method === 'modal' ? modalRequest(mode, rotated) : { directions }));
  const hasFloor = floorRole !== 'none';
  expect(plan.outcome).toBe('READY');
  expect.soft(plan.levels.map(l => [l.elevation, l.weightKN])).toEqual(hasFloor ? [[0, 2], [2, 4], [4, 2]] : [[0, 4], [4, 4]]);
  expect.soft(plan.factors.seismicWeight!.value).toBe(hasFloor ? 6 : 4);
  expect(plan.cases.filter(c => c.type === 'E')).toHaveLength(1);
  expect(plan.nodal.filter(d => d.caseType === 'E')).toEqual([]);
  expect(plan.surface.filter(d => d.caseType === 'E')).toEqual([]);

  const bands: Array<[number, number]> = hasFloor ? [[0, 1], [1, 3], [3, 4]] : [[0, 2], [2, 4]];
  const ordinate = spectralOrdinate(mode.period, round2Spectrum);
  const modalIntensity = method === 'modal'
    ? Math.max(2 * ordinate * plan.seismic!.gammaR! / plan.seismic!.r!, 0.85 * plan.seismic!.c * (hasFloor ? 6 : 4) / 4)
    : 0;
  const intensities = method === 'modal' ? bands.map(() => modalIntensity) : hasFloor ? [0, 1.5, 3] : [0, 2];
  const forces = method === 'modal'
    ? bands.map(([a, b]) => modalIntensity * (b - a))
    : hasFloor ? [0, 3, 3] : [0, 4];
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

const diaphragmStoryReproducer = process.env.RUN_KNOWN_WRONG === '2316' ? it : it.skip;
for (const cuts of [[0, 2, 4], [0, 0.5, 1.5, 2, 2.5, 3.5, 4]]) {
  for (const rotated of [false, true]) {
    for (const method of ['static', 'modal'] as const) {
      const variant = `${method}, ${rotated ? 'Y' : 'X'}, ${cuts.length - 1} elements`;
      for (const role of ['master', 'slave'] as const) {
        diaphragmStoryReproducer(`known wrong result: #2316 column story partition keeps a diaphragm ${role} (${variant})`, () => {
          verifyColumnStoryPartition(cuts, rotated, role, method);
        });
      }
      it(`#2316 column story partition skips unmarked subdivisions (${variant})`, () => {
        verifyColumnStoryPartition(cuts, rotated, 'none', method);
      });
    }
  }
}

function withPinnedCarriers(check: (model: LoadModelData, members: string) => void) {
  modelStore.clear();
  try {
    const base = modelStore.addNode(0, 0, 0), top = modelStore.addNode(0, 0, 4);
    const far = modelStore.addNode(4, 0, 4);
    const column = modelStore.addElement(base, top, 'frame')!;
    const beam = modelStore.addElement(top, far, 'frame')!;
    modelStore.addSupport(base, 'fixed3d');
    modelStore.addSupport(far, 'fixed3d');
    modelStore.updateElement(column, { name: 'C1' });
    modelStore.toggleRelease(column, 'i', 'my');
    modelStore.toggleHinge3D(beam, 'end');
    const model = modelStore.model as unknown as LoadModelData;
    const nodes = new Map([...model.nodes].map(([id, n]) => [id, { ...n, z: n.z ?? 0 }]));
    check({ ...model, nodes }, `#${column} (C1), #${beam}`);
  } finally {
    modelStore.clear();
  }
}

it('#2316 the modal solver adapter identifies all released carriers', () => {
  withPinnedCarriers((model, members) => {
    const plan = buildLoadPlan(request(model));
    expect(plan.outcome).toBe('READY');
    expect(plan.distributed.filter(d => d.caseType === 'E').length).toBeGreaterThan(0);
    expect(modesForPlan(plan, 0)).toEqual({ error: expect.stringContaining(members) });
  });
});

it('#2316 both modal reducers refuse to interpolate released carrier ends', () => {
  withPinnedCarriers((model, members) => {
    const mode = prescribedMode(model, false, z => z / height, 1 / height);
    const { seismicLevels } = buildLoadPlan(request(model));
    expect(seismicLevels).toBeDefined();
    const refusal = expect.objectContaining({ params: { members } });
    expect.soft(() => modalLoadingLevels(seismicLevels!, [mode])).toThrow(refusal);
    expect(() => modalStoryForces(seismicLevels!, [mode], 'x', () => 1)).toThrow(refusal);
  });
});

it('#2316 supplied modes on released carriers block seismic cases and combinations', () => {
  withPinnedCarriers((model, members) => {
    const mode = prescribedMode(model, false, z => z / height, 1 / height);
    const plan = buildLoadPlan(request(model, modalRequest(mode, false), { generateCombinations: true }));
    expect.soft(plan.outcome).toBe('BLOCKED');
    expect.soft(plan.blockedKeys).toContainEqual({
      key: 'loadPlan.blocked.seismicMass.bendingRelease', params: { members },
    });
    expect.soft(plan.cases.filter(c => c.type === 'E')).toEqual([]);
    expect.soft(plan.distributed.filter(d => d.caseType === 'E')).toEqual([]);
    expect.soft(plan.surface.filter(d => d.caseType === 'E')).toEqual([]);
    expect.soft(plan.nodal.filter(d => d.caseType === 'E')).toEqual([]);
    expect(plan.combinations).toEqual([]);
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

for (const rotated of [false, true]) for (const mirror of [false, true]) for (const cuts of [[0, 1, 4], [0, 1, 2, 3, 4]]) {
  for (const floor of [false, true]) {
    it(`#2316 moving base-band mass loads its carrier (${rotated}, ${mirror}, ${cuts.length - 1} elements, floor ${floor})`, () => {
      const { model, byColumn } = round2Columns(cuts, rotated, mirror, undefined, true);
      for (const members of byColumn) members[0]!.materialId = 2;
      const mode = prescribedMode(model, rotated, z => z === 0 ? 0 : 1, 0);
      if (floor) mode.period = 10 * round2Period;
      const plan = buildLoadPlan(request(model, modalRequest(mode, rotated)));
      const w = model.sections.get(1)!.a * model.materials.get(1)!.rho;
      const cm = spectralOrdinate(mode.period, round2Spectrum) * plan.seismic!.gammaR! / plan.seismic!.r!;
      const qFloor = 0.85 * plan.factors.baseShear!.value / (2 * (height - 1));
      expect(w * cm < qFloor).toBe(floor);
      verifyRound2Columns(model, byColumn, plan, rotated, 1, Math.max(w * cm, qFloor), 0);
    });
  }
}

for (const rotated of [false, true]) for (const cuts of [[0, 4], [0, 2, 4], [0, 1, 2, 3, 4]]) {
  it(`#2316 the modal base shear includes the moving lower half (${rotated}, ${cuts.length - 1} elements)`, () => {
    const { model } = round2Columns(cuts, rotated, false);
    const mode = prescribedMode(model, rotated, z => z / height, 1 / height);
    mode.participation = { x: { gamma: 0, ratio: 0 }, y: { gamma: 0, ratio: 0 } };
    mode.participation[rotated ? 'y' : 'x'] = { gamma: 3 / 2, ratio: 3 / 4 };
    const plan = buildLoadPlan(request(model, modalRequest(mode, rotated)));
    expect(plan.outcome).toBe('READY');
    const w = model.sections.get(1)!.a * model.materials.get(1)!.rho;
    const shear = windResultants(model, plan.distributed.filter(d => d.caseType === 'E'))[rotated ? 1 : 0];
    expect(shear).toBeCloseTo(2 * w * height * (3 / 4) * plan.seismic!.c, 10);
  });
}

for (const rotated of [false, true]) for (const cuts of [[0, 2, 4], [0, 1, 2, 3, 4]]) {
  knownWrong(`known wrong result: #2319 a linear mode retains the upper-half inertia field (${rotated}, ${cuts.length - 1} elements)`, () => {
    const { model, byColumn } = round2Columns(cuts, rotated, false);
    for (const e of model.elements.values()) if (model.nodes.get(e.nodeJ)!.z! <= height / 2) e.materialId = 2;
    const mode = prescribedMode(model, rotated, z => z / height, 1 / height);
    const plan = buildLoadPlan(request(model, modalRequest(mode, rotated)));
    const w = model.sections.get(1)!.a * model.materials.get(1)!.rho;
    verifyRound2Columns(model, byColumn, plan, rotated, height / 2, w * plan.seismic!.c * (9 / 7) / height, 1);
  });
}

for (const rotated of [false, true]) for (const mirror of [false, true]) for (const cuts of [[0, 2, 4], [0, 1, 2, 3, 4]]) {
  for (const method of ['static', 'modal'] as const) {
    it(`#2316 ${method} eccentricity uses the massless structural perimeter (${rotated}, ${mirror}, ${cuts.length - 1} elements)`, () => {
      const { model, byColumn } = round2Columns(cuts, rotated, mirror, 5);
      for (const e of model.elements.values()) if (model.nodes.get(e.nodeJ)!.z! <= height / 2) e.materialId = 2;
      const mode = prescribedMode(model, rotated, z => z >= height / 2 ? 1 : 0, 0);
      const plan = buildLoadPlan(request(model, {
        ...(method === 'modal' ? modalRequest(mode, rotated) : { directions: { x: !rotated, y: rotated } }),
        torsion: 'medium',
      }));
      const w = model.sections.get(1)!.a * model.materials.get(1)!.rho;
      verifyRound2Columns(model, byColumn, plan, rotated, height / 2, w * (method === 'modal' ? plan.seismic!.c : 1), 0, 10);
    });
  }
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

const upperBandStart = height / 2;
for (const rotated of [false, true]) {
  const missing = rotated ? 'x' : 'y';
  for (const selection of ['single-axis', 'two-axis', 'diagonal'] as const) {
    it(`#2316 zero modal base shear in ${missing} blocks a ${selection} request`, () => {
      const { model, byColumn } = round2Columns([0, upperBandStart, height], rotated, false);
      for (const members of byColumn) members[0]!.materialId = 2;
      const mode = prescribedMode(model, rotated, z => z >= upperBandStart ? 1 : 0, 0);
      if (selection === 'two-axis') {
        mode.participation = {
          x: { gamma: rotated ? 0 : 1, ratio: rotated ? 0 : 1 },
          y: { gamma: rotated ? 1 : 0, ratio: rotated ? 1 : 0 },
        };
      }
      const plan = buildLoadPlan(request(model, {
        ...modalRequest(mode, rotated),
        directions: {
          x: selection === 'two-axis' || (selection === 'single-axis' && missing === 'x'),
          y: selection === 'two-axis' || (selection === 'single-axis' && missing === 'y'),
        },
        diagonal: selection === 'diagonal',
        torsion: selection === 'two-axis' ? 'medium' : 'low',
      }, { generateCombinations: true }));
      expect(plan.outcome).toBe('BLOCKED');
      expect(plan.blockedKeys).toEqual([{ key: 'loadPlan.blocked.modalBaseShear', params: { dir: missing.toUpperCase() } }]);
      expect(plan.cases.filter(c => c.type === 'E')).toEqual([]);
      expect([...plan.distributed, ...plan.nodal, ...plan.surface].filter(p => p.caseType === 'E')).toEqual([]);
      expect(plan.combinations).toEqual([]);
    });
  }

  for (const cuts of [[0, upperBandStart, height], [0, 1, upperBandStart, 3, height]]) {
    it(`#2316 the modal shear floor accepts small positive ${missing} participation (${cuts.length - 1} elements)`, () => {
      const { model, byColumn } = round2Columns(cuts, rotated, cuts.length > 3);
      for (const e of model.elements.values()) if (model.nodes.get(e.nodeJ)!.z! <= upperBandStart) e.materialId = 2;
      const mode = prescribedMode(model, rotated, z => z >= upperBandStart ? 1 : 0, 0);
      const weightPerLength = model.sections.get(1)!.a * model.materials.get(1)!.rho;
      const unscaled = buildLoadPlan(request(model, modalRequest(mode, rotated)));
      expect(unscaled.outcome).toBe('READY');
      const ordinate = spectralOrdinate(round2Period, round2Spectrum) * unscaled.seismic!.gammaR! / unscaled.seismic!.r!;
      verifyRound2Columns(model, byColumn, unscaled, rotated, upperBandStart, weightPerLength * ordinate, 0);

      const smallComponent = 1 / 16;
      for (const [id, sample] of mode.shape) {
        mode.shape.set(id, { ...sample, [rotated ? 'ux' : 'uy']: smallComponent * (rotated ? sample.uy : sample.ux) });
      }
      const scaled = buildLoadPlan(request(model, modalRequest(mode, !rotated)));
      const minIntensity = 0.85 * weightPerLength * unscaled.seismic!.c;
      const unscaledIntensity = weightPerLength * ordinate * smallComponent ** 2 / (1 + smallComponent ** 2);
      expect(unscaledIntensity).toBeGreaterThan(0);
      expect(unscaledIntensity).toBeLessThan(minIntensity);
      verifyRound2Columns(model, byColumn, scaled, !rotated, upperBandStart, minIntensity, 0);
    });
  }
}
