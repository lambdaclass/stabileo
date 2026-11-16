import { expect, it } from 'vitest';
import { solve, solve3D, solvePDelta, solvePDelta3D } from '../../wasm-solver';
import type { SolverInput } from '../../types';
import type { SolverInput3D } from '../../types-3d';
import { windLoadCases } from '../wind-cases';
import { otherStructureWind } from '../wind-other';
import { planWind } from '../load-plan-wind';
import { levelsWithPlanArea, type PlanSink, type LoadPlanInput } from '../load-plan';
import { mesh, windAxis, windProject } from './wind-integration-fixture';

for (const dimension of ['2d', '3d']) for (const nonlinear of [false, true]) for (const surface of ['roof', 'wall', 'chimney'] as const) {
  it(`generated ${surface} force and moment reach the ${dimension} ${nonlinear ? 'nonlinear' : 'linear'} WASM analysis`, () => {
    const model = surface === 'roof' ? mesh([[[0, 0, 3], [12, 0, 3]]]) : mesh([[[0, 0, 0], [0, 0, 6]]]);
    const lines = surface === 'roof' ? windLoadCases({ model, axes: [{ ...windAxis, along: 12 }], set: 'case1', directions: ['+x'], tributaryWidth: 1, speed: 40 }).cases[0]!.distributed : [];
    let points: Array<{ nodeId: number; fx: number; fy: number; fz?: number; mz?: number }> = [];
    if (surface === 'chimney') points = otherStructureWind({ model, structure: { kind: 'chimney', section: 'squareNormal', diameter: 2 }, project: { ...windProject, basicSpeed: 1 }, directions: ['+x'], tributaryWidth: 1 }).cases[0]!.nodal;
    if (surface === 'wall') {
      const sink: PlanSink = { cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
      const levels = levelsWithPlanArea(model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 }));
      planWind({ model, tributaryWidth: 6, wind: { enabled: true, basicSpeed: 40, exposure: 'C', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, directions: { x: true, y: false }, bothSenses: false, caseSet: 'case1', profile: [[0, 1], [6, 1]] } } as LoadPlanInput, levels, sink);
      points = sink.nodal.filter(n => n.caseIndex === 0);
    }
    const input: SolverInput = {
      nodes: new Map([...model.nodes].map(([id, n]) => [id, { id, x: n.x, z: n.z ?? 0 }])),
      elements: new Map([...model.elements].map(([id, e]) => [id, { ...e, type: 'frame', hingeStart: false, hingeEnd: false }])),
      materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]),
      sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
      loads: [...lines.map(p => ({ type: 'distributed' as const, data: { elementId: p.elementId, qI: p.q, qJ: p.q, a: p.a, b: p.b } })), ...points.map(p => ({ type: 'nodal' as const, data: { nodeId: p.nodeId, fx: p.fx, fz: p.fz ?? 0, my: 0 } }))],
    };
    let fx: number, fz: number, my: number;
    if (dimension === '2d') {
      const out = nonlinear ? solvePDelta(input).results : solve(input);
      expect(out).toBeDefined();
      const r = out.reactions[0]!;
      fx = r.rx; fz = r.rz; my = r.my;
    } else {
      const spatial: SolverInput3D = { ...input,
        nodes: new Map([...model.nodes].map(([id, n]) => [id, { ...n, z: n.z ?? 0 }])),
        sections: new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-4 }]]),
        elements: new Map([...model.elements].map(([id, e]) => [id, { ...e, type: 'frame', localYx: 0, localYy: 1, localYz: 0, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }])),
        supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
        loads: [...lines.map(p => ({ type: 'distributed' as const, data: { elementId: p.elementId, qYI: 0, qYJ: 0, qZI: p.q, qZJ: p.q, a: p.a, b: p.b } })), ...points.map(p => ({ type: 'nodal' as const, data: { nodeId: p.nodeId, fx: p.fx, fy: p.fy, fz: p.fz ?? 0, mx: 0, my: 0, mz: p.mz ?? 0 } }))],
      };
      const out = nonlinear ? solvePDelta3D(spatial).results : solve3D(spatial);
      expect(out).toBeDefined();
      const r = out.reactions[0]!;
      fx = r.fx; fz = r.fz; my = r.my;
    }
    expect(fx).toBeCloseTo(surface === 'roof' ? 0 : surface === 'wall' ? -36 : -9.6, 8);
    expect(fz).toBeCloseTo(surface === 'roof' ? -5.1 : 0, 8);
    expect((dimension === '2d' ? -1 : 1) * my).toBeCloseTo(surface === 'roof' ? 22.95 : surface === 'wall' ? -108 : -28.8, 8);
  });
}
