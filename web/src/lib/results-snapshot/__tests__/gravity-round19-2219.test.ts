import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initSolver } from '../../engine/wasm-solver';
import { compute_envelope_3d, solve_3d, solve_pdelta_3d } from '../../wasm/dedaliano_engine.js';
import { skewCarriers } from '../../engine/loads/__tests__/gravity-axes-fixture';
import { gravityLayout } from '../../engine/loads/plan-gravity';
import { computeLocalAxes3D } from '../../engine/local-axes-3d';
import { globalMomentToMember, memberMomentToGlobal } from '../../engine/member-loads';
import { mapMoments } from '../../engine/member-moments';
import { evaluateDiagramAt } from '../../engine/diagrams-3d';
import type { AnalysisResults3D } from '../../engine/types-3d';

beforeAll(async () => { await initSolver(); });
const regression = it;
const fixture = JSON.parse(readFileSync(new URL('../../../../../engine/tests/fixtures/nightly-2026-11-13.json', import.meta.url), 'utf8'))['2023'];

for (const axis of ['x', 'y', 'z'] as const) for (const sign of [1, -1]) {
  regression(`known wrong result: #2219 WASM combinations retain evaluated ${axis} extrema sign=${sign}`, () => {
    const width = 2 ** -32;
    const moments = { x: [0, 0, 0], y: [0, 0, 0], z: [0, 0, 0] };
    moments[axis] = [sign / width, -0.5 * sign / width, sign / width];
    const ef = { elementId: 1, length: 2, nStart: 0, nEnd: 0, vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 0, mxStart: 0, mxEnd: 0, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, distributedLoadsY: [], distributedLoadsZ: [], pointLoadsY: [], pointLoadsZ: [], memberMoments: [{ a: 0.5, b: 0.5 + width, moments }] };
    const r = { displacements: [], reactions: [], elementForces: [ef] };
    const kind = axis === 'x' ? 'torsion' : axis === 'y' ? 'momentY' : 'momentZ';
    const env = compute_envelope_3d([r, r])[kind];
    expect(Math.abs(env.globalMax - Math.sqrt(3) / 18)).toBeLessThan(1e-14);
  });
}

for (const roll of [0, 30, 90]) for (const custom of [false, true]) for (const angle of [0, Math.PI / 2]) for (const mirror of [1, -1]) for (const divided of [false, true]) {
  it(`gravity member hand solution roll=${roll} custom=${custom} angle=${angle} mirror=${mirror} divided=${divided}`, () => {
    const { model, fractions, orientation, spanAxis } = skewCarriers(roll, custom, angle, mirror, divided);
    const layout = gravityLayout(model, { mode: 'panels', slab: 'oneWay', spanAxis, tributaryWidth: 1, loadEveryPanel: true });
    const elements = [...model.elements.values()].slice(0, fractions.length);
    const nodeIds = [elements[0]!.nodeI, ...elements.map(e => e.nodeJ)];
    const s = structuredClone(fixture);
    s.nodes = Object.fromEntries(nodeIds.map(id => [id, model.nodes.get(id)]));
    s.elements = Object.fromEntries(elements.map(e => [e.id, { ...e, ...orientation }]));
    Object.assign(s.materials['1'], { e: 1000, nu: 0 });
    Object.assign(s.sections['1'], { a: 0.1, iy: 0.001, iz: 0.001, j: 0.002 });
    for (const key of ['cw', 'asY', 'asZ']) delete s.sections['1'][key];
    s.supports = Object.fromEntries([nodeIds[0], nodeIds.at(-1)].map(nodeId => [nodeId, { nodeId, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]));
    s.loads = elements.flatMap(e => {
      const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
      const axes = computeLocalAxes3D({ ...a, z: 3 }, { ...b, z: 3 }, custom ? { x: 0, y: 0, z: 1 } : undefined, roll);
      return [
        ...layout.pieces.filter(p => p.elementId === e.id).map(p => ({ type: 'distributed', data: { elementId: e.id, a: p.a, b: p.b, qYI: -p.wI * axes.ey[2], qYJ: -p.wJ * axes.ey[2], qZI: -p.wI * axes.ez[2], qZJ: -p.wJ * axes.ez[2] } })),
        ...layout.moments.filter(p => p.elementId === e.id).map(p => ({ type: 'distributed', data: { elementId: e.id, a: p.a, b: p.b, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, moments: mapMoments(p.moments, v => globalMomentToMember(v, axes)) } })),
      ];
    });
    const L = Math.sqrt(40), f = 12 / L;
    const root = model.nodes.get(nodeIds[0]!)!, end = model.nodes.get(nodeIds.at(-1)!)!;
    const ex = [(end.x - root.x) / L, (end.y - root.y) / L, 0];
    const ey = [-ex[1]!, ex[0]!, 0];
    for (const result of [solve_3d(s), JSON.parse(solve_pdelta_3d(JSON.stringify(s), 100, 1e-10)).results] as AnalysisResults3D[]) {
      for (const [i, e] of elements.entries()) {
        const ef = result.elementForces.find(v => v.elementId === e.id)!;
        const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
        const axes = computeLocalAxes3D({ ...a, z: 3 }, { ...b, z: 3 }, custom ? { x: 0, y: 0, z: 1 } : undefined, roll);
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const x = fractions[i]! * L + t * ef.length;
          const shear = [0, 1, 2].map(k => axes.ey[k]! * evaluateDiagramAt(ef, 'shearY', t) + axes.ez[k]! * evaluateDiagramAt(ef, 'shearZ', t));
          const moment = memberMomentToGlobal([evaluateDiagramAt(ef, 'torsion', t), evaluateDiagramAt(ef, 'momentY', t), evaluateDiagramAt(ef, 'momentZ', t)], axes);
          expect(shear[2]).toBeCloseTo(f * (L / 2 - x) - 0.6, 8);
          expect(shear[0]).toBeCloseTo(0, 8);
          expect(shear[1]).toBeCloseTo(0, 8);
          expect(moment.reduce((v, a, k) => v + a * ey[k]!, 0)).toBeCloseTo(-f * L * L / 12 + f * L * x / 2 - f * x * x / 2, 8);
          expect(evaluateDiagramAt(ef, 'torsion', t)).toBeCloseTo(-mirror * 1.8 * (x - L / 2), 8);
          expect(moment[2]).toBeCloseTo(0, 8);
        }
      }
      const middle = result.displacements.find(v => v.nodeId === nodeIds[fractions.indexOf(0.5)])!;
      expect(middle.uz).toBeCloseTo(-f * L ** 4 / (384 * 1e6 * 0.001), 10);
      expect([middle.rx, middle.ry, middle.rz].reduce((v, a, k) => v + a * ex[k]!, 0)).toBeCloseTo(-mirror * 1.8 * L * L / (8 * 0.5e6 * 0.002), 10);
    }
  });
}
