/**
 * Snow on the model's roof: a single-bay gable shed, where the balanced case must put exactly
 * p_s × tributary width × horizontal length on the rafters, and the unbalanced cases must load
 * the slope past the ridge for each wind direction. Then the plan, with S in the combinations.
 */
import { describe, it, expect } from 'vitest';
import { roofGeometry, snowLoadCases } from '../snow-loads';
import { buildLoadPlan, type LoadModelData, type LoadPlanInput } from '../load-plan';
import { defaultRegulations, type ProjectRegulations } from '../../../codes/roles';
import { roofSnow } from '../../../codes/cirsoc104/snow';

/** Two columns 5 m high, two rafters to a ridge 2 m higher at mid-span, span 16 m along x. */
function shed(): LoadModelData {
  const nodes = new Map([
    [1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 16, y: 0, z: 0 }],
    [3, { id: 3, x: 0, y: 0, z: 5 }], [4, { id: 4, x: 16, y: 0, z: 5 }], [5, { id: 5, x: 8, y: 0, z: 7 }],
  ]);
  const elements = new Map([
    [1, { id: 1, nodeI: 1, nodeJ: 3, sectionId: 1, materialId: 1 }],
    [2, { id: 2, nodeI: 2, nodeJ: 4, sectionId: 1, materialId: 1 }],
    [3, { id: 3, nodeI: 3, nodeJ: 5, sectionId: 1, materialId: 1 }],
    [4, { id: 4, nodeI: 5, nodeJ: 4, sectionId: 1, materialId: 1 }],
  ]);
  return {
    nodes, elements, sections: new Map([[1, { id: 1, a: 0.005 }]]), materials: new Map([[1, { id: 1, rho: 78.5 }]]),
    loadCases: [{ id: 1, type: 'D', name: 'D' }],
  };
}
const snow = { pg: 1.5, terrain: 'C' as const, exposure: 'partial' as const, thermal: 'normal' as const, category: 'II' as const, roofKind: 'gable' as const, slippery: false };

describe('snow on the roof members', () => {
  it('reads the ridge, W and the slope from the geometry', () => {
    const g = roofGeometry(shed())!;
    expect(g.axis).toBe('x');
    expect(g.ridge).toBeCloseTo(8, 12);
    expect(g.W).toBeCloseTo(8, 12);
    expect(g.slopeDeg).toBeCloseTo((Math.atan(2 / 8) * 180) / Math.PI, 9);
  });

  it('balanced: the rafters carry p_s × width × horizontal length, all of it downward', () => {
    const out = snowLoadCases({ model: shed(), snow, tributaryWidth: 5 })!;
    const bal = out.cases[0]!;
    const m = shed();
    let vertical = 0;
    for (const d of bal.distributed) {
      const e = m.elements.get(d.elementId)!;
      const a = m.nodes.get(e.nodeI)!, b = m.nodes.get(e.nodeJ)!;
      const L = Math.hypot(b.x - a.x, (b.z ?? 0) - (a.z ?? 0)), cos = Math.abs(b.x - a.x) / L;
      vertical += d.q * L * cos;                     // the normal part's vertical component
    }
    vertical += bal.nodal.reduce((s, n) => s + n.fz, 0);
    expect(vertical).toBeCloseTo(-out.result.ps * 5 * 16, 9);
  });

  it('unbalanced: one case per wind direction, the far slope loaded', () => {
    const out = snowLoadCases({ model: shed(), snow, tributaryWidth: 5 })!;
    const r = roofSnow({ ...snow, roof: { kind: 'gable', slopeDeg: out.geometry.slopeDeg, W: 8, slippery: false } });
    expect(out.cases).toHaveLength(3);
    const plusX = out.cases.find((c) => c.nameParams.dir === '+X')!;
    const q = (id: number) => plusX.distributed.find((d) => d.elementId === id)?.q ?? 0;
    // Wind toward +x: rafter 4 (x 8→16) is leeward, rafter 3 windward at 0,3 p_s (W = 8 > 6).
    expect(Math.abs(q(4)) / Math.abs(q(3))).toBeCloseTo(r.unbalanced!.leeward / r.unbalanced!.windward, 9);
  });
});

describe('snow in the load plan', () => {
  const regs = (): ProjectRegulations => {
    const reg = defaultRegulations();
    for (const k of Object.keys(reg) as Array<keyof ProjectRegulations>) if (reg[k].adapterId) reg[k] = { ...reg[k], configComplete: true, state: 'applied' };
    return reg;
  };
  const input = (over: Partial<LoadPlanInput> = {}): LoadPlanInput => ({
    regulations: regs(), model: shed(), dead: [{ labelKey: 'a', q: 0.3 }], occupancyKey: 'vivienda',
    tributaryWidth: 5, reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false,
    generateCombinations: true,
    snow: { enabled: true, source: 'site', ...snow },
    ...over,
  });

  it('adds the snow cases and puts S in the combinations', () => {
    const p = buildLoadPlan(input());
    expect(p.outcome).toBe('READY');
    expect(p.cases.filter((c) => c.type === 'S')).toHaveLength(3);
    expect(p.combinations.some((c) => c.terms.some((t) => t.symbol === 'S' && t.factor === 1.6))).toBe(true);
    expect(p.derivation.some((m) => m.key === 'snow.derivation.pf')).toBe(true);
    expect(p.unsupportedKeys.some((m) => m.key === 'snow.note.notCovered')).toBe(true);
  });

  it('is blocked when the project has no usable snow regulation', () => {
    const reg = regs();
    reg.snow = { ...reg.snow, configComplete: false };
    expect(buildLoadPlan(input({ regulations: reg })).blockedKeys.map((m) => m.key)).toContain('loadPlan.blocked.snowRoleUnusable');
  });
});
