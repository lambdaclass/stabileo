import { beforeAll, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { solve_2d, solve_3d, solve_pdelta_2d, solve_pdelta_3d } from '../../wasm/dedaliano_engine.js';
import { initSolver } from '../../engine/wasm-solver';
import { computeDiagramValueAt } from '../../engine/diagrams';
import type { AnalysisResults } from '../../engine/types';
import { evaluateDiagramAt } from '../../engine/diagrams-3d';
import type { AnalysisResults3D } from '../../engine/types-3d';
import { floorLoad } from '../../engine/loads/floor-loads';
import { areaLoads, bay } from '../../engine/loads/__tests__/gravity-regions-fixture';

const template = JSON.parse(readFileSync(new URL('../../../../../engine/tests/fixtures/nightly-2026-11-13.json', import.meta.url), 'utf8'))['2023'];

beforeAll(async () => { await initSolver(); });

function nativeResults<T>(model: unknown, dimension: '--2d' | '--3d'): T[] {
  const program = process.env.GRAVITY_NATIVE_SOLVE;
  if (!program) return [];
  const solve = (input: unknown) => JSON.parse(execFileSync(program, [dimension], { input: JSON.stringify(input), encoding: 'utf8' }));
  return [solve(model), solve({ analysis: 'pdelta', model, maxIter: 100, tolerance: 1e-10 }).results];
}

function checkResponse(fixture: ReturnType<typeof bay>, loads: Array<{ elementId: number; a?: number; b?: number; q: number; qJ?: number }>, a: number, b: number, q: number) {
  const { model, physical, root, ends } = fixture;
  const input = structuredClone(template);
  const elements = [...model.elements.values()].filter(member => {
    const [xi, yi] = physical.get(member.nodeI)!;
    const [xj, yj] = physical.get(member.nodeJ)!;
    return yi === yj && xi < xj;
  });
  const used = new Set(elements.flatMap(({ nodeI, nodeJ }) => [nodeI, nodeJ]));
  input.nodes = Object.fromEntries([...model.nodes].filter(([id]) => used.has(id)));
  input.elements = Object.fromEntries(elements.map(member => [member.id, { ...member, type: 'frame' }]));
  input.supports = Object.fromEntries(root.map(nodeId => [nodeId, { nodeId, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]));
  Object.assign(input.materials['1'], { e: 1000, nu: 0 });
  Object.assign(input.sections['1'], { a: 0.1, iy: 0.001, iz: 0.001, j: 0.002 });
  for (const key of ['cw', 'asY', 'asZ']) delete input.sections['1'][key];
  const ids = new Set(elements.map(member => member.id));
  input.loads = loads.filter(load => ids.has(load.elementId)).map(load => ({
    type: 'distributed', data: { elementId: load.elementId, a: load.a, b: load.b, qYI: 0, qYJ: 0, qZI: load.q, qZJ: load.qJ ?? load.q },
  }));
  const length = 10;
  const ei = 1000 * 1000 * 0.001;
  const primitive = (s: number) => length * s ** 3 - s ** 4 / 4;
  const tip = -q * (primitive(b) - primitive(a)) / (6 * ei);
  const checkStations = (elementId: number, memberLength: number, shear: (t: number) => number, moment: (t: number) => number) => {
    const member = model.elements.get(elementId)!;
    const x0 = physical.get(member.nodeI)![0];
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const x = x0 + t * memberLength;
      const from = Math.max(0, a - x), to = Math.max(0, b - x);
      expect(shear(t)).toBeCloseTo(q * (to - from), 8);
      expect(moment(t)).toBeCloseTo(-q * (to ** 2 - from ** 2) / 2, 8);
    }
  };
  const checkTip = (displacements: ReadonlyArray<{ nodeId: number; uz: number }>) => {
    for (const id of ends) expect(displacements.find(d => d.nodeId === id)!.uz).toBeCloseTo(tip, 10);
  };
  const nonlinear = JSON.parse(solve_pdelta_3d(JSON.stringify(input), 100, 1e-10));
  expect(nonlinear.converged).toBe(true);
  const space = [solve_3d(input), nonlinear.results, ...nativeResults<AnalysisResults3D>(input, '--3d')] as AnalysisResults3D[];
  for (const result of space) {
    expect(result.elementForces).toHaveLength(elements.length);
    for (const forces of result.elementForces) {
      checkStations(forces.elementId, forces.length, t => evaluateDiagramAt(forces, 'shearZ', t), t => evaluateDiagramAt(forces, 'momentY', t));
      for (const t of [0, 0.25, 0.5, 0.75, 1]) for (const kind of ['shearY', 'momentZ', 'torsion'] as const) {
        expect(evaluateDiagramAt(forces, kind, t)).toBeCloseTo(0, 8);
      }
    }
    checkTip(result.displacements);
  }

  const plane = {
    nodes: Object.fromEntries([...used].map(id => [id, { id, x: physical.get(id)![0], z: 3 }])),
    elements: input.elements, materials: input.materials, sections: input.sections,
    supports: Object.fromEntries(root.map(nodeId => [nodeId, { id: nodeId, nodeId, type: 'fixed' }])),
    loads: loads.filter(load => ids.has(load.elementId)).map(load => ({
      type: 'distributed', data: { elementId: load.elementId, a: load.a, b: load.b, qI: load.q, qJ: load.qJ ?? load.q },
    })),
  };
  const advanced = JSON.parse(solve_pdelta_2d(JSON.stringify(plane), 100, 1e-10));
  expect(advanced.converged).toBe(true);
  const results = [solve_2d(plane), advanced.results, ...nativeResults<AnalysisResults>(plane, '--2d')] as AnalysisResults[];
  for (const result of results) {
    expect(result.elementForces).toHaveLength(elements.length);
    for (const forces of result.elementForces) {
      checkStations(forces.elementId, forces.length, t => computeDiagramValueAt('shear', t, forces), t => -computeDiagramValueAt('moment', t, forces));
    }
    checkTip(result.displacements);
  }
}

it('#2199 each uncovered strip gives the hand-solved carrier response', () => {
  for (const [angle, mirror, mesh] of [[0, 1, 1], [0.37, 1, 3], [1.16, -1, 2]] as const) {
    const fixture = bay(4.76, angle, mirror, mesh, mesh > 1);
    checkResponse(fixture, areaLoads(fixture.model).distributed, 4.76, 10, 3);
  }
});

it('#2201 the concentric zone gives the hand-solved carrier response', () => {
  const fixture = bay(0, 0, 1, 1, true);
  const { model } = fixture;
  const result = floorLoad({
    nodes: model.nodes, beams: [...model.elements.values()].map(beam => ({ ...beam, type: 'frame' })),
    q: 1, distribution: 'oneWay', spanAxis: 'y', zone: { outer: [[2, 2, 3], [8, 2, 3], [8, 4, 3], [2, 4, 3]] },
  });
  checkResponse(fixture, result.loads.map(load => ({ ...load, q: load.qZI, qJ: load.qZJ })), 2, 8, 1);
});
