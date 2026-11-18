import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { solve_3d, solve_pdelta_3d } from '../../../wasm/dedaliano_engine.js';
import { evaluateDiagramAt } from '../../diagrams-3d';
import { buildSolverLoads3D } from '../../solver-service';
import type { Load } from '../../types';
import type { AnalysisResults3D } from '../../types-3d';
import { offsetRoof, roofPlan } from './gravity-offset-roof-fixture';

const regression = process.env.RUN_KNOWN_WRONG === '2282' ? it : it.skip;
const template = JSON.parse(readFileSync(new URL('../../../../../../engine/tests/fixtures/nightly-2026-11-13.json', import.meta.url), 'utf8'))['2023'];

regression('known wrong result: #2282 shell-borne gravity leaves the restrained offset rafters unloaded', () => {
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
    const input = {
      ...structuredClone(template),
      nodes: Object.fromEntries(model.nodes), elements: Object.fromEntries(model.elements),
      quads: Object.fromEntries(model.quads), constraints: model.constraints,
      supports: Object.fromEntries(supports),
      loads: buildSolverLoads3D({ ...model, supports, loads } as never, loads, false, false),
    };
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
