import { expect, it } from 'vitest';
import { otherStructureWind } from '../wind-other';
import { planWind } from '../load-plan-wind';
import { levelsWithPlanArea, type LoadPlanInput, type PlanSink } from '../load-plan';
import { mesh, remeshWind, variants, windProject } from './wind-integration-fixture';
import { solve, solvePDelta, solve3D, solvePDelta3D } from '../../wasm-solver';
import type { SolverInput } from '../../types';
import type { SolverInput3D } from '../../types-3d';

const known = process.env.RUN_KNOWN_WRONG === '2220' ? it : it.skip;
const generate = (model: ReturnType<typeof mesh>, kind: string) => {
  if (kind !== 'wall') {
    const structure = kind === 'chimney' ? { kind: 'chimney' as const, section: 'squareNormal' as const, diameter: 2 }
      : kind === 'openSign' ? { kind: 'openSign' as const, members: 'flat' as const, solidity: 1, width: 2 }
      : { kind: 'latticeTower' as const, section: 'square' as const, round: false, solidity: 1, diagonal: false, width: 2 };
    const c = otherStructureWind({ model, structure, project: { ...windProject, basicSpeed: 1 }, directions: ['+x'], tributaryWidth: 2 }).cases[0]!;
    return { points: c.nodal, lines: c.distributed.map(d => ({ ...d, q: d.qZ })) };
  }
  const sink: PlanSink = { cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
  const levels = levelsWithPlanArea(model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 }));
  planWind({ model, tributaryWidth: 2, wind: { enabled: true, basicSpeed: 40, exposure: 'C', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, senses: ['+x'], directions: { x: true, y: false }, bothSenses: false, caseSet: 'case1', profile: [[0, 1], [6, 1]] } } as LoadPlanInput, levels, sink);
  expect(sink.blockedKeys).toEqual([]);
  return { points: sink.nodal.filter(n => n.caseIndex === 0), lines: sink.distributed.filter(n => n.caseIndex === 0) };
};

for (const kind of ['chimney', 'wall', 'openSign', 'latticeTower']) for (const variant of variants.filter(v => v !== 'rotate')) for (const spatial of [false, true]) for (const nonlinear of [false, true]) {
  known(`known wrong result: #2220 ${kind} member loading ${variant} spatial=${spatial} nonlinear=${nonlinear}`, () => {
    const { model } = remeshWind(mesh([[[0, 0, 0], [0, 0, 6]]]), variant);
    const { points, lines } = generate(model, kind);
    const w = kind === 'wall' ? 2 : 1.6;
    const base = [...model.nodes.values()].find(n => n.z === 0)!.id;
    const tip = [...model.nodes.values()].find(n => n.z === 6)!.id;
    const input: SolverInput = {
      nodes: new Map([...model.nodes].map(([id, n]) => [id, { id, x: n.x, z: n.z ?? 0 }])),
      elements: new Map([...model.elements].map(([id, e]) => [id, { ...e, type: 'frame', hingeStart: false, hingeEnd: false }])),
      materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]), sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
      supports: new Map([[base, { id: base, nodeId: base, type: 'fixed' }]]),
      loads: [...lines.map(d => ({ type: 'distributed' as const, data: { elementId: d.elementId, qI: -(d.qX ?? 0), qJ: -(d.qX ?? 0), a: d.a, b: d.b } })), ...points.map(p => ({ type: 'nodal' as const, data: { nodeId: p.nodeId, fx: p.fx, fz: 0, my: 0 } }))],
    };
    expect(points).toEqual([]);
    expect(lines.length).toBeGreaterThan(0);
    for (const e of model.elements.values()) {
      const a = model.nodes.get(e.nodeI)!.z!, b = model.nodes.get(e.nodeJ)!.z!;
      expect(lines.filter(d => d.elementId === e.id).reduce((s, d) => s + (d.qX ?? 0) * (d.b! - d.a!), 0)).toBeCloseTo(w * (b - a), 10);
    }
    if (spatial) {
      const input3: SolverInput3D = { ...input, nodes: new Map([...model.nodes].map(([id, n]) => [id, { ...n, z: n.z ?? 0 }])),
        elements: new Map([...model.elements].map(([id, e]) => [id, { ...e, type: 'frame', localYx: 1, localYy: 0, localYz: 0, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }])),
        sections: new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-4 }]]), supports: new Map([[base, { nodeId: base, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
        loads: lines.map(d => ({ type: 'distributed', data: { elementId: d.elementId, qYI: d.qX ?? 0, qYJ: d.qX ?? 0, qZI: 0, qZJ: 0, a: d.a, b: d.b } })),
      };
      const out = nonlinear ? solvePDelta3D(input3).results : solve3D(input3);
      expect(out.displacements.find(d => d.nodeId === tip)!.ux).toBeCloseTo(w * 6 ** 4 / (8 * 200000 * 1000 * 1e-4), 8);
      for (const f of out.elementForces) {
        const z = model.nodes.get(model.elements.get(f.elementId)!.nodeI)!.z!;
        expect(Math.abs(f.vyStart)).toBeCloseTo(w * (6 - z), 8);
        expect(Math.abs(f.mzStart)).toBeCloseTo(w * (6 - z) ** 2 / 2, 8);
        expect(f.mxStart).toBeCloseTo(0, 10);
      }
    } else {
      const out = nonlinear ? solvePDelta(input).results : solve(input);
      expect(out.displacements.find(d => d.nodeId === tip)!.ux).toBeCloseTo(w * 6 ** 4 / (8 * 200000 * 1000 * 1e-4), 8);
      for (const f of out.elementForces) {
        const z = model.nodes.get(model.elements.get(f.elementId)!.nodeI)!.z!;
        expect(Math.abs(f.vStart)).toBeCloseTo(w * (6 - z), 8);
        expect(Math.abs(f.mStart)).toBeCloseTo(w * (6 - z) ** 2 / 2, 8);
      }
    }
  });
}

for (const profile of [undefined, [[0, 1], [6, 1]]]) known(`known wrong result: #2220 an open building requires its free-roof declaration profile=${!!profile}`, () => {
  const model = mesh([[[0, 0, 0], [0, 0, 6], [10, 0, 6]]]);
  const sink: PlanSink = { cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
  const levels = levelsWithPlanArea(model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 }));
  planWind({ model, tributaryWidth: 2, wind: { enabled: true, basicSpeed: 40, exposure: 'C', enclosure: 'open', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, directions: { x: true, y: false }, profile } } as LoadPlanInput, levels, sink);
  expect(sink.cases).toEqual([]);
  expect(sink.blockedKeys.map(n => n.key)).toContain('wind.pressure.openBuildingRequiresFreeRoof');
});
