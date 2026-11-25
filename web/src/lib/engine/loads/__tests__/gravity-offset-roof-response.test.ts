import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { solve_2d, solve_3d, solve_pdelta_2d, solve_pdelta_3d } from '../../../wasm/dedaliano_engine.js';
import { evaluateDiagramAt } from '../../diagrams-3d';
import { buildSolverLoads3D } from '../../solver-service';
import { finiteObjectWire } from '../../wasm-solver';
import type { Load } from '../../../store/model.svelte';
import type { AnalysisResults3D } from '../../types-3d';
import type { AnalysisResults } from '../../types';
import { buildLoadPlan } from '../load-plan';
import { input as loadPlanInput } from './gravity-width-mass-fixture';
import { gravityLayout } from '../plan-gravity';
import { planAreaLoads } from '../plan-area-loads';
import type { LoadModelData } from '../load-plan';
import { offsetRoof, roofPlan } from './gravity-offset-roof-fixture';

const template = JSON.parse(readFileSync(new URL('../../../../../../engine/tests/fixtures/nightly-2026-11-13.json', import.meta.url), 'utf8'))['2023'];

it('#2282 shell-borne gravity leaves the restrained offset rafters unloaded', () => {
  for (const [angle, mirror, subdivide] of [[0, 1, false], [0.53, 1, true], [1.21, -1, true]] as const) {
    const { model, rafter } = offsetRoof(0.02, angle, mirror, subdivide);
    const plan = roofPlan(model);
    const loads: Load[] = [
      ...plan.surface.filter(load => load.caseType === 'D').map((load, index) => ({
        type: 'surface3d' as const, data: { id: index + 1, quadId: load.quadId, q: load.q },
      })),
      ...plan.distributed.filter(load => load.caseType === 'D').map((load, index) => ({
        type: 'distributed3d' as const, data: {
          id: plan.surface.length + index + 1, elementId: load.elementId, qYI: 0, qYJ: 0,
          qZI: load.q, qZJ: load.qJ ?? load.q, a: load.a, b: load.b, frame: load.frame,
        },
      })),
    ];
    const supported = [...new Set([...model.quads.values()].flatMap(quad => quad.nodes))].filter(id => id !== 4);
    const supports = new Map(supported.map(nodeId => [nodeId, { nodeId, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]));
    const input = finiteObjectWire({
      ...structuredClone(template),
      nodes: Object.fromEntries(model.nodes), elements: Object.fromEntries(model.elements),
      quads: Object.fromEntries(model.quads), constraints: model.constraints,
      supports: Object.fromEntries(supports),
      loads: buildSolverLoads3D({ ...model, supports, loads } as never, loads, false, false),
    });
    const nonlinear = JSON.parse(solve_pdelta_3d(JSON.stringify(input), 100, 1e-10));
    expect(nonlinear.converged).toBe(true);
    for (const result of [solve_3d(input), nonlinear.results] as AnalysisResults3D[]) {
      expect(result.elementForces.map(member => member.elementId).sort()).toEqual([...model.elements.keys()]);
      for (const member of result.elementForces) {
        for (const station of [0, 0.25, 0.5, 0.75, 1]) {
          for (const kind of ['shearY', 'shearZ', 'momentY', 'momentZ', 'torsion'] as const) {
            expect(evaluateDiagramAt(member, kind, station)).toBeCloseTo(0, 8);
          }
        }
      }
      for (const id of rafter) expect(result.displacements.find(node => node.nodeId === id)?.uz).toBeCloseTo(0, 10);
      expect(Math.abs(result.displacements.find(node => node.nodeId === 4)!.uz)).toBeGreaterThan(0);
    }
  }
});

it('#2512 linear and P-Delta reactions include both nearby decks sharing a fixed master', () => {
  const { model: roof } = offsetRoof(0.02);
  const ground = 9;
  const nodes = new Map([[ground, { id: ground, x: -1, y: -1, z: 0 }]]);
  for (const [index, z] of [3, 3.02].entries()) {
    for (const [i, [x, y]] of [[0, 0], [10, 0], [10, 6], [0, 6]].entries()) {
      const id = index * 4 + i + 1;
      nodes.set(id, { id, x: x!, y: y!, z });
    }
  }
  const quads = new Map([
    [1, { id: 1, nodes: [1, 2, 3, 4], materialId: 1, thickness: 0.1 }],
    [2, { id: 2, nodes: [5, 6, 7, 8], materialId: 1, thickness: 0.1 }],
  ]);
  const model: LoadModelData = {
    ...roof, nodes, quads, elements: new Map(),
    supports: new Map([[ground, { id: ground, nodeId: ground, type: 'fixed3d' }]]),
    constraints: [
      ...[1, 2, 3, 5, 6, 7].map(slaveNode => ({ type: 'equalDOF' as const, masterNode: ground, slaveNode, dofs: [2] })),
      { type: 'equalDOF', masterNode: 4, slaveNode: 8, dofs: [2] },
    ],
  };
  const pressure = 1;
  const plan = buildLoadPlan(loadPlanInput(model, { gravity: { mode: 'panels' }, dead: [{ labelKey: 'a', q: pressure }] }));
  expect(plan.outcome).toBe('READY');
  const dead = plan.surface.filter(load => load.caseType === 'D');
  expect(dead.map(load => [load.quadId, load.q])).toEqual([[1, pressure], [2, pressure]]);
  const loads: Load[] = dead.map((load, index) => ({
    type: 'surface3d', data: { id: index + 1, quadId: load.quadId, q: load.q },
  }));
  const supports = new Map([...nodes.keys()].map(nodeId => [
    nodeId, { nodeId, rx: true, ry: true, rz: nodeId === ground, rrx: true, rry: true, rrz: true },
  ]));
  const input = finiteObjectWire({
    ...structuredClone(template),
    nodes: Object.fromEntries(nodes), elements: {}, quads: Object.fromEntries(quads), constraints: model.constraints,
    supports: Object.fromEntries(supports),
    loads: buildSolverLoads3D({ ...model, supports, loads } as never, loads, false, false),
  });
  const nonlinear = JSON.parse(solve_pdelta_3d(JSON.stringify(input), 100, 1e-10));
  expect(nonlinear.converged).toBe(true);
  for (const result of [solve_3d(input), nonlinear.results] as AnalysisResults3D[]) {
    expect(result.reactions.reduce((total, reaction) => total + reaction.fz, 0)).toBeCloseTo(2 * 10 * 6 * pressure, 8);
  }
});

it('#2512 exact cover preserves the plane beam reactions on both sides of the end', () => {
  const elements = new Map([
    [1, { id: 1, nodeI: 1, nodeJ: 2, type: 'frame' as const, sectionId: 1, materialId: 1 }],
    [2, { id: 2, nodeI: 3, nodeJ: 4, type: 'frame' as const, sectionId: 1, materialId: 1 }],
  ]);
  for (const mode of ['panels', 'width'] as const) for (const edge of [5.01, 5, 4.99]) {
    const nodes = new Map([
      [1, { id: 1, x: 0, y: 0, z: 3 }], [2, { id: 2, x: 10, y: 0, z: 3 }],
      [3, { id: 3, x: edge, y: 0, z: 6 }], [4, { id: 4, x: 10, y: 0, z: 6 }],
    ]);
    const layout = gravityLayout({ nodes, elements }, { mode, tributaryWidth: 1 });
    const area = planAreaLoads({
      layout, tributaryWidth: 1, floor: { dead: 1, lo: 0, liveOf: () => 0 },
      roof: { dead: 2, use: 'occupancy', weight: 'heavy', slopePercent: 0 },
    });
    const input = finiteObjectWire({
      nodes: Object.fromEntries([...nodes].map(([id, { x, z }]) => [id, { id, x, z }])),
      elements: Object.fromEntries(elements),
      materials: template.materials, sections: template.sections,
      supports: {
        1: { id: 1, nodeId: 1, type: 'fixed' },
        3: { id: 3, nodeId: 3, type: 'fixed' },
      },
      loads: area.distributed.filter(load => load.caseType === 'D').map(load => ({
        type: 'distributed', data: { elementId: load.elementId, a: load.a, b: load.b, qI: load.q, qJ: load.qJ ?? load.q },
      })),
    });
    const nonlinear = JSON.parse(solve_pdelta_2d(JSON.stringify(input), 100, 1e-10));
    expect(nonlinear.converged).toBe(true);
    for (const result of [solve_2d(input), nonlinear.results] as AnalysisResults[]) {
      expect(result.reactions.find(reaction => reaction.nodeId === 1)?.rz).toBeCloseTo(10 * (edge > 5 ? 2 : 1), 8);
      expect(result.reactions.find(reaction => reaction.nodeId === 3)?.rz).toBeCloseTo(2 * (10 - edge), 8);
    }
  }
});
