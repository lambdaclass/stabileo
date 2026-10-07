/**
 * Snow on the model's roof: a single-bay gable shed, where the balanced case must put exactly
 * p_s × tributary width × horizontal length on the rafters, and the unbalanced cases must load
 * the slope past the ridge for each wind direction. Then the plan, with S in the combinations.
 */
import { describe, it, expect } from 'vitest';
import { roofGeometry, snowLoadCases } from '../snow-loads';
import { buildLoadPlan, type LoadModelData, type LoadPlanInput } from '../load-plan';
import { defaultRegulations, type ProjectRegulations } from '../../../codes/roles';
import { roofSnow, snowDensity } from '../../../codes/cirsoc104/snow';
import { gravityLayout } from '../plan-gravity';

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

/**
 * A smooth monoslope upper roof at 25° (two rafters climbing along +x from +6 m at x = 0 to the
 * step at x = 6, so nothing slides onto the lower roof), and a flat 6 × 6 m lower roof at +3 m
 * over x 6–12, closed by four beams.
 */
function stepped(): LoadModelData {
  const top = 6 + 6 * Math.tan((25 * Math.PI) / 180);
  const pts: Array<[number, number, number]> = [
    [0, 0, 6], [6, 0, top], [0, 6, 6], [6, 6, top],
    [6, 0, 3], [12, 0, 3], [12, 6, 3], [6, 6, 3],
  ];
  const members: Array<[number, number]> = [[1, 2], [3, 4], [5, 6], [6, 7], [7, 8], [8, 5]];
  return {
    nodes: new Map(pts.map(([x, y, z], i) => [i + 1, { id: i + 1, x, y, z }])),
    elements: new Map(members.map(([a, b], i) => [i + 1, { id: i + 1, nodeI: a, nodeJ: b, sectionId: 1, materialId: 1 }])),
    sections: new Map([[1, { id: 1, a: 0.005 }]]), materials: new Map([[1, { id: 1, rho: 78.5 }]]),
    loadCases: [{ id: 1, type: 'D', name: 'D' }],
  };
}
const smooth = { ...snow, roofKind: 'mono' as const, slippery: true };
const LOWER = new Set([3, 4, 5, 6]);
/** Total vertical load of a list of projected loads on the given members, kN. */
const totalOn = (m: LoadModelData, list: Array<{ elementId: number; q: number; qJ?: number; a?: number; b?: number }>, ids: Set<number>) =>
  list.filter((d) => ids.has(d.elementId)).reduce((s, d) => {
    const e = m.elements.get(d.elementId)!;
    const a = m.nodes.get(e.nodeI)!, b = m.nodes.get(e.nodeJ)!;
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    return s + ((d.q + (d.qJ ?? d.q)) / 2) * ((d.b ?? L) - (d.a ?? 0));
  }, 0);

describe('snow: each roof surface takes C_s from its own slope', () => {
  // p_f = 0,7 · 1,0 · 1,0 · 1,0 · 1,5 = 1,050 kN/m²; the 25° smooth roof has C_s = 45/65.
  const flat = roofSnow({ ...smooth, roof: { kind: 'mono', slopeDeg: 0, W: 6, slippery: true } });

  it('by width: the flat lower roof beside a 25° smooth roof takes p_f, not the sloped roof’s C_s p_f', () => {
    const m = stepped();
    const out = snowLoadCases({ model: m, snow: smooth, tributaryWidth: 2 })!;
    expect(out.result.cs).toBeCloseTo(45 / 65, 9);                      // the sloped roof's own
    expect(flat.ps).toBeCloseTo(1.05, 9);
    const bal = out.cases[0]!;
    for (const id of LOWER) expect(bal.distributed.find((d) => d.elementId === id)!.q).toBeCloseTo(-flat.ps * 2, 9);
    // The rafters keep the 25° roof's value.
    const raf = bal.distributed.find((d) => d.elementId === 1)!;
    const cos = Math.cos((25 * Math.PI) / 180);
    expect(raf.q).toBeCloseTo(-out.result.ps * 2 * cos * cos, 9);
  });

  it('by panels: the lower panel carries p_f over its 36 m², and a parapet drift reads h_b from it', () => {
    const m = stepped();
    const layout = gravityLayout(m, { mode: 'panels', tributaryWidth: 2 });
    const plain = snowLoadCases({ model: m, snow: smooth, tributaryWidth: 2, layout })!;
    expect(-totalOn(m, plain.cases[0]!.distributed, LOWER)).toBeCloseTo(flat.ps * 36, 6);
    const out = snowLoadCases({ model: m, snow: { ...smooth, parapet: { height: 1.5 } }, tributaryWidth: 2, layout })!;
    const par = out.derivation.find((x) => x.key === 'snow.derivation.parapet')!;
    expect(par.params?.hb).toBeCloseTo(flat.ps / snowDensity(1.5), 3);
  });
});

describe('snow: a ridge member under the unbalanced load', () => {
  /** The shed, as two frames 6 m apart joined by a ridge beam and two eave beams. */
  function shed3d(): LoadModelData {
    const m = shed();
    const n = m.nodes as Map<number, { id: number; x: number; y: number; z?: number }>;
    for (const [id, x, z] of [[13, 0, 5], [14, 16, 5], [15, 8, 7]] as const) n.set(id, { id, x, y: 6, z });
    const e = m.elements as Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number }>;
    for (const [id, a, b] of [[5, 13, 15], [6, 15, 14], [7, 5, 15], [8, 3, 13], [9, 4, 14]] as const) e.set(id, { id, nodeI: a, nodeJ: b, sectionId: 1, materialId: 1 });
    return m;
  }

  it('takes the mean of the two slopes in both directions, not the windward value in both', () => {
    const out = snowLoadCases({ model: shed3d(), snow, tributaryWidth: 3 })!;
    const u = out.result.unbalanced!;
    for (const dir of ['+X', '−X']) {
      const c = out.cases.find((x) => x.nameParams.dir === dir)!;
      expect(c.distributed.find((d) => d.elementId === 7)!.q).toBeCloseTo(-((u.leeward + u.windward) / 2) * 3, 9);
    }
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
