import { expect, it } from 'vitest';
import { planWind } from '../load-plan-wind';
import { levelsWithPlanArea, type PlanSink, type LoadPlanInput } from '../load-plan';
import { columns, remeshWind, variants, windResultants, assertWindResultants } from './wind-integration-fixture';

const wrong = process.env.RUN_KNOWN_WRONG === '2204' ? it : it.skip;
for (const profile of [true, false]) for (const variant of variants) for (const dir of ['+x', '-x', '+y', '-y'] as const) {
  wrong(`known wrong result: #2204 full wall and foundation conserve force and moments ${profile} ${variant} ${dir}`, () => {
    const { model, back, direction } = remeshWind(columns(), variant);
    const d = direction(dir);
    const levels = levelsWithPlanArea(model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 }));
    const sink: PlanSink = { cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
    planWind({ model, tributaryWidth: 1, wind: { enabled: true, basicSpeed: 40, exposure: 'C', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, senses: [d], directions: { x: d.endsWith('x'), y: d.endsWith('y') }, bothSenses: false, caseSet: 'case1', ...(profile ? { profile: [[0, 1], [6, 1]] } : {}) } } as LoadPlanInput, levels, sink);
    const loads = sink.nodal.filter(n => n.caseIndex === 0);
    const F = (profile ? 1 : 0.75) * (dir.endsWith('x') ? 6 : 12) * 6 * (dir.startsWith('-') ? -1 : 1);
    const fx = dir.endsWith('x') ? F : 0, fy = dir.endsWith('y') ? F : 0;
    assertWindResultants(windResultants(model, [], loads, back), [fx, fy, 0, -3 * fy, 3 * fx, 6 * fy - 3 * fx]);
    expect(loads.some(n => model.nodes.get(n.nodeId)!.z === 0 && Math.hypot(n.fx, n.fy) > 0)).toBe(true);
  });
}
