/**
 * The imposed load of a roof reached only for maintenance, by family: ASCE/SEI 7-22 §4.8.2 (20 psf
 * reduced by R1 and R2 to no less than 12 psf), EN 1991-1-1 Table 6.10 (0.4 kN/m²), UK NA Table
 * NA.7 (0.6 kN/m² below 30°, nil at 60°) and TS 498 (none: snow governs), as the plan writes it on
 * the top beams of a 6 × 6 m frame loaded over a 3 m width.
 */
import { describe, expect, it } from 'vitest';
import { buildLoadPlan, type LoadModelData, type LoadPlanInput } from '../../engine/loads/load-plan';
import { bindRole, defaultRegulations, unsetBinding, type ProjectRegulations, type RegulationRole } from '../roles';
import { FAMILY_STACKS, type LoadFamilyChoice } from '../families/stacks';
import { asce7RoofLive } from '../asce7/roof-live';
import { ecRoofLive } from '../eurocode/roof-live';
import { ts498RoofLive } from '../turkey/ts498-roof';
import { planContextOf } from '../eurocode/context';
import { PSF } from '../asce7/refs';

const FT2 = 0.3048 ** 2;

function frame(): LoadModelData {
  const nodes = new Map<number, { id: number; x: number; y: number; z?: number }>();
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number }>();
  const corners = [[0, 0], [6, 0], [6, 6], [0, 6]] as const;
  corners.forEach(([x, y], i) => { nodes.set(i + 1, { id: i + 1, x, y, z: 0 }); nodes.set(i + 5, { id: i + 5, x, y, z: 3 }); });
  for (let i = 0; i < 4; i++) elements.set(i + 1, { id: i + 1, nodeI: i + 1, nodeJ: i + 5, sectionId: 1, materialId: 1 });
  for (let i = 0; i < 4; i++) elements.set(i + 5, { id: i + 5, nodeI: i + 5, nodeJ: ((i + 1) % 4) + 5, sectionId: 1, materialId: 1 });
  return { nodes, elements, sections: new Map([[1, { id: 1, a: 0.09 }]]), materials: new Map([[1, { id: 1, rho: 25 }]]), loadCases: [] };
}

function stack(family: LoadFamilyChoice): ProjectRegulations {
  const reg = defaultRegulations();
  for (const [role, id] of Object.entries(FAMILY_STACKS[family]) as Array<[RegulationRole, string | null]>) {
    reg[role] = id ? { ...bindRole(role, id), configComplete: true, state: 'applied' } : unsetBinding(role);
  }
  return reg;
}

const FLOOR: Record<LoadFamilyChoice, string> = { cirsoc: 'vivienda', eurocode: 'ec-B', uk: 'uk-B1', us: 'offices', turkey: 'tr_office' };

const plan = (family: LoadFamilyChoice, roof: LoadPlanInput['roof']) => buildLoadPlan({
  regulations: stack(family), model: frame(), dead: [{ labelKey: 'a', q: 2 }], occupancyKey: FLOOR[family], tributaryWidth: 3,
  reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, roof,
});
const lrOnBeams = (p: ReturnType<typeof plan>) => p.distributed.filter((d) => d.caseType === 'Lr').map((d) => -d.q);
const cites = (p: ReturnType<typeof plan>, regulation: string, c: string) => p.refs.some((r) => r.regulation === regulation && r.clause.startsWith(c));

describe('ASCE/SEI 7-22 §4.8.2', () => {
  it('is 20 psf up to 200 ft², 12 psf from 600 ft², and 1.2 − 0.001 At between', () => {
    expect(asce7RoofLive({ weight: 'heavy', atM2: 150 * FT2, slopePercent: 0 }).lr).toBeCloseTo(20 * PSF, 6);
    expect(asce7RoofLive({ weight: 'light', atM2: 150 * FT2, slopePercent: 0 }).lr).toBeCloseTo(20 * PSF, 6);
    expect(asce7RoofLive({ weight: 'heavy', atM2: 700 * FT2, slopePercent: 0 }).lr).toBeCloseTo(12 * PSF, 6);
    expect(asce7RoofLive({ weight: 'heavy', atM2: 400 * FT2, slopePercent: 0 }).lr).toBeCloseTo(16 * PSF, 6);
  });

  it('R2 = 1.2 − 0.05 F for a rise of 4 to 12 in per ft: 6 in per ft gives 18 psf on a small area', () => {
    expect(asce7RoofLive({ weight: 'heavy', atM2: 100 * FT2, slopePercent: 50 }).lr).toBeCloseTo(18 * PSF, 6);
  });

  it('the plan loads each top beam of 9 m² tributary area with 20 psf over 3 m', () => {
    const p = plan('us', { use: 'maintenance', dead: 1, slopeDeg: 0 });
    expect(lrOnBeams(p).length).toBe(4);
    for (const q of lrOnBeams(p)) expect(q).toBeCloseTo(20 * PSF * 3, 4);
    expect(cites(p, 'asce-7', '4.8.2')).toBe(true);
    expect(cites(p, 'cirsoc-101', '4.8')).toBe(false);
  });
});

describe('EN 1991-1-1, category H', () => {
  it('Table 6.10 recommends 0.4 kN/m² whatever the slope', () => {
    for (const s of [0, 50, 200]) expect(ecRoofLive('eurocode')({ weight: 'heavy', atM2: 10, slopePercent: s }).lr).toBe(0.4);
  });

  it('UK NA Table NA.7: 0.6 kN/m² below 30°, 0.3 at 45°, nil from 60°', () => {
    const uk = (deg: number) => ecRoofLive('uk')({ weight: 'heavy', atM2: 10, slopePercent: Math.tan((deg * Math.PI) / 180) * 100 }).lr;
    expect(uk(0)).toBe(0.6);
    expect(uk(29)).toBe(0.6);
    expect(uk(45)).toBeCloseTo(0.3, 9);
    expect(uk(60)).toBeCloseTo(0, 9);
    expect(uk(70)).toBe(0);
  });

  it('the plan writes 0.4 × 3 = 1.2 kN/m on each top beam, with no CIRSOC heavy or light roof', () => {
    const p = plan('eurocode', { use: 'maintenance', dead: 1, slopeDeg: 0 });
    expect(p.blockedKeys).toEqual([]);
    for (const q of lrOnBeams(p)) expect(q).toBeCloseTo(1.2, 9);
    expect(cites(p, 'EN 1991-1-1', 'Table 6.10')).toBe(true);
    expect(cites(p, 'cirsoc-101', '4.8')).toBe(false);
    expect(p.derivation.some((d) => d.key === 'loadPlan.derivation.roofWeight' || d.key === 'loadPlan.derivation.roofLive')).toBe(false);
    expect(p.derivation.some((d) => d.key === 'loads.ec.roofLive')).toBe(true);
  });

  it('a roof with an occupancy takes a category A to D row and adds it to the ψ the combinations use', () => {
    const p = plan('eurocode', { use: 'occupancy', occupancyKey: 'ec-C1', dead: 1, slopeDeg: 0 });
    expect(p.blockedKeys).toEqual([]);
    expect(p.distributed.filter((d) => d.caseType === 'L').length).toBeGreaterThan(0);
    expect(cites(p, 'cirsoc-101', '4.8.2')).toBe(false);
    const ctx = planContextOf('eurocode', { occupancyKey: 'ec-B', roof: { use: 'occupancy', occupancyKey: 'ec-C1', dead: 1, slopeDeg: 0 } } as LoadPlanInput);
    expect([...ctx.categories].sort()).toEqual(['B', 'C']);
  });
});

describe('TS 498', () => {
  it('gives a maintenance roof no uniform imposed load, so the plan writes no Lr case', () => {
    expect(ts498RoofLive({ weight: 'heavy', atM2: 10, slopePercent: 0 }).lr).toBe(0);
    const p = plan('turkey', { use: 'maintenance', dead: 1, slopeDeg: 0 });
    expect(p.blockedKeys).toEqual([]);
    expect(lrOnBeams(p)).toEqual([]);
    expect(p.cases.some((c) => c.type === 'Lr')).toBe(false);
    expect(p.derivation.some((d) => d.key === 'loads.tr.roofLive')).toBe(true);
  });
});

describe('CIRSOC 101 keeps §4.8.1', () => {
  it('a heavy flat roof over 9 m² is 0.96 kN/m², cited to §4.8.1', () => {
    const p = plan('cirsoc', { use: 'maintenance', dead: 1, slopeDeg: 0 });
    for (const q of lrOnBeams(p)) expect(q).toBeCloseTo(0.96 * 3, 9);
    expect(cites(p, 'cirsoc-101', '4.8.1')).toBe(true);
  });
});
