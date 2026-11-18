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
import { buildLoadPlan, type LoadModelData, type LoadPlanInput } from '../load-plan';
import { modalStoryForces } from '../seismic-modal';
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
          kind: 'line' as const, elementId: e.id, nodeI: { ...i, id: i.id + idOffset, z: elevation },
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

function verifyCarrierMechanics(method: 'static' | 'modal') {
  const length = 4, half = length / 2;
  for (const variant of ['base', 'uneven', 'rotate', 'mirror'] as const) {
    const { model, sources } = remeshWind(mesh([-2, 2].map(y => [[0, y, 0], [0, y, length]])), variant);
    const rotated = variant === 'rotate';
    for (const torsion of ['low', 'medium', 'extreme'] as const) {
      const weightPerLength = model.sections.get(1)!.a * model.materials.get(1)!.rho;
      const code = {
        zone: 4, site: 'SB', group: 'B', systemKey: 'rc_frame_full_ductility', periodSystem: 'concreteMomentFrame',
        regularity: 'regular', occupancy: 'reduced',
      } as const;
      const period = 1;
      const shape = new Map([...model.nodes.values()].map(n => [n.id, {
        ux: rotated ? 0 : n.z! / length, uy: rotated ? n.z! / length : 0, uz: 0,
        rx: rotated ? -1 / length : 0, ry: rotated ? 0 : 1 / length, rz: 0,
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
        const participation = (3 / 4) ** 2 / (7 / 12);
        const modal = plan.derivation.find(d => d.key === 'loadPlan.derivation.modal');
        expect(modal?.params?.ratio).toBe(96.4);
        intensity *= Math.max(participation * ordinate, 0.85 * plan.seismic!.c);
      }
      for (const [caseIndex, c] of plan.cases.entries()) {
        if (c.type !== 'E') continue;
        const eccentricity = { low: 0, medium: 0.05, extreme: 0.1 }[torsion] * (c.nameParams?.sign === '−' ? -1 : 1);
        for (const carrier of [1, 2]) {
          const members = [...model.elements.values()].filter(e => sources.get(e.id) === carrier);
          const ids = new Set(members.flatMap(e => [e.nodeI, e.nodeJ]));
          const nodes = new Map([...ids].map(id => [id, { id, x: 0, z: model.nodes.get(id)!.z! }]));
          const base = [...nodes.values()].find(n => n.z === 0)!.id, tip = [...nodes.values()].find(n => n.z === length)!.id;
          const root = model.nodes.get(base)!;
          const radius = rotated ? root.x : -root.y;
          const q = intensity * (1 + eccentricity * radius);
          const parts = plan.distributed.filter(d => d.caseIndex === caseIndex && sources.get(d.elementId) === carrier);
          expect(parts.length).toBeGreaterThan(0);
          const momentOfLoad = (station: number, power: number) => q * (length ** (power + 1) - Math.max(half, station) ** (power + 1)) / (power + 1);
          const component = (part: typeof parts[number], end = false) => rotated
            ? end ? part.qYJ! : part.qY!
            : end ? part.qXJ! : part.qX!;
          for (const part of parts) {
            const member = model.elements.get(part.elementId)!;
            const start = nodes.get(member.nodeI)!.z + part.a!, end = nodes.get(member.nodeI)!.z + part.b!;
            expect(start).toBeGreaterThanOrEqual(half);
            expect(end).toBeLessThanOrEqual(length);
            expect(component(part)).toBeCloseTo(q, 10);
            expect(component(part, true)).toBeCloseTo(q, 10);
          }
          const common = {
            materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]),
            sections: new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-4 }]]),
          };
          const plane: SolverInput = {
            ...common, nodes, elements: new Map(members.map(e => [e.id, { ...e, type: 'frame', hingeStart: false, hingeEnd: false }])),
            supports: new Map([[base, { id: base, nodeId: base, type: 'fixed' }]]),
            loads: parts.map(p => ({ type: 'distributed', data: { elementId: p.elementId, a: p.a, b: p.b, qI: -component(p), qJ: -component(p, true) } })),
          };
          const spatial: SolverInput3D = {
            ...common, nodes: new Map([...ids].map(id => [id, { ...model.nodes.get(id)!, z: nodes.get(id)!.z }])),
            elements: new Map(members.map(e => [e.id, { ...e, type: 'frame', localYx: rotated ? 0 : 1, localYy: rotated ? 1 : 0, localYz: 0,
              releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }])),
            supports: new Map([[base, { nodeId: base, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
            loads: parts.map(p => ({ type: 'distributed', data: { elementId: p.elementId, a: p.a, b: p.b, qYI: component(p), qYJ: component(p, true), qZI: 0, qZJ: 0 } })),
          };
          for (const is3d of [false, true]) for (const nonlinear of [false, true]) {
            const verify = (result: ReturnType<typeof solve> | ReturnType<typeof solve3D>) => {
              const d = result.displacements.find(d => d.nodeId === tip)!;
              const displacement = rotated && 'uy' in d ? d.uy : d.ux;
              expect(displacement).toBeCloseTo((3 * length * momentOfLoad(0, 2) - momentOfLoad(0, 3)) / (6 * 200000 * 1000 * 1e-4), 10);
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
            };
            verify(is3d ? nonlinear ? solvePDelta3D(spatial).results : solve3D(spatial) : nonlinear ? solvePDelta(plane).results : solve(plane));
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
    mass: [{ kind: 'line' as const, elementId: 1, nodeI, nodeJ, length: 1, a: 0, b: 1, wi: 100, wj: 100 }] }];
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
    const momentum = weightPerLength * length * (tip.ux * (h1J(1) - h1J(0.5)) + length * tip.ry * (h2J(1) - h2J(0.5)));
    const { seismicLevels } = plan as typeof plan & { seismicLevels: Parameters<typeof modalStoryForces>[0] };
    const forces = modalStoryForces(seismicLevels.filter(l => l.elevation > 0), [inX], 'x', () => 1);
    expect(forces.forces[0]).toBeCloseTo(Math.abs(inX.participation!.x.gamma * momentum), 10);
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
