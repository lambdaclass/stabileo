import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildLoadPlan } from '../../engine/loads/load-plan';
import { witness, input } from '../../engine/loads/__tests__/gravity-width-mass-fixture';
import { initSolver } from '../../engine/wasm-solver';
import { solve_3d, solve_pdelta_3d } from '../../wasm/dedaliano_engine.js';
import { evaluateDiagramAt } from '../../engine/diagrams-3d';
import type { AnalysisResults3D } from '../../engine/types-3d';

beforeAll(async () => { await initSolver(); });
const fixture = JSON.parse(readFileSync(new URL('../../../../../engine/tests/fixtures/nightly-2026-11-13.json', import.meta.url), 'utf8'))['2023'];

for (const separation of [3, 6]) for (const angle of [0, 37]) for (const pieces of [1, 3]) {
  it(`#2269 width carrier hand solution y=${separation} angle=${angle} pieces=${pieces}`, () => {
    const model = witness(separation, angle, pieces, -1);
    const plan = buildLoadPlan(input(model));
    const s = structuredClone(fixture);
    s.nodes = Object.fromEntries(model.nodes);
    s.elements = Object.fromEntries([...model.elements].map(([id, e]) => [id, { ...e, type: 'frame' }]));
    Object.assign(s.materials['1'], { e: 1000, nu: 0 });
    Object.assign(s.sections['1'], { a: 0.1, iy: 0.001, iz: 0.001, j: 0.002 });
    for (const key of ['cw', 'asY', 'asZ']) delete s.sections['1'][key];
    s.supports = Object.fromEntries([1, pieces + 2].map(nodeId => [nodeId, { nodeId, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]));
    s.loads = plan.distributed.filter(load => load.caseType === 'D').map(load => ({ type: 'distributed', data: { elementId: load.elementId, a: load.a, b: load.b, qYI: 0, qYJ: 0, qZI: load.q, qZJ: load.qJ ?? load.q } }));
    for (const result of [solve_3d(s), JSON.parse(solve_pdelta_3d(JSON.stringify(s), 100, 1e-10)).results] as AnalysisResults3D[]) {
      for (const [id, element] of model.elements) {
        const carrier = id <= pieces ? 0 : 1;
        const root = model.nodes.get(carrier === 0 ? 1 : pieces + 2)!;
        const start = model.nodes.get(element.nodeI)!;
        const offset = Math.hypot(start.x - root.x, start.y - root.y);
        const force = result.elementForces.find(force => force.elementId === id)!;
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const x = offset + t * force.length;
          expect(evaluateDiagramAt(force, 'shearZ', t)).toBeCloseTo(3 * (10 - x), 8);
          expect(evaluateDiagramAt(force, 'momentY', t)).toBeCloseTo(-3 * (10 - x) ** 2 / 2, 8);
          for (const kind of ['shearY', 'momentZ', 'torsion'] as const) expect(evaluateDiagramAt(force, kind, t)).toBeCloseTo(0, 8);
        }
      }
      for (const nodeId of [pieces + 1, pieces + 3]) {
        expect(result.displacements.find(displacement => displacement.nodeId === nodeId)!.uz).toBeCloseTo(-3 * 10 ** 4 / (8 * 1e6 * 0.001), 10);
      }
    }
    expect(plan.levels[0]!.planAreaM2).toBeCloseTo(60, 10);
    expect(plan.levels[0]!.weightKN).toBeCloseTo(140, 10);
  });
}
