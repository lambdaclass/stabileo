/**
 * The load plan's wind with its dynamics (CIRSOC 102-2025 §1.9): a flexible building's level forces
 * scale with G_f/0,85, its torsional cases take Eq. (2.4-5), its service wind recomputes G_f, and a
 * structure declared flexible with no frequency is refused, building or not.
 */
import { describe, it, expect } from 'vitest';
import { buildLoadPlan, type LoadModelData, type LoadPlanInput } from '../load-plan';
import { defaultRegulations, type ProjectRegulations } from '../../../codes/roles';
import { fundamentalFrequencies } from '../wind-dynamics';

/** A tower 30 × 20 m in plan, `storeys` of 3 m. */
function tower(storeys = 20, bx = 30, by = 20): LoadModelData {
  const nodes = new Map<number, { id: number; x: number; y: number; z?: number }>();
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number }>();
  let nid = 1, eid = 1;
  const grid: number[][] = [];
  for (let s = 0; s <= storeys; s++) {
    const lvl: number[] = [];
    for (const [x, y] of [[0, 0], [bx, 0], [bx, by], [0, by]]) { nodes.set(nid, { id: nid, x, y, z: s * 3 }); lvl.push(nid); nid++; }
    grid.push(lvl);
  }
  for (let s = 0; s < storeys; s++) {
    for (let i = 0; i < 4; i++) { elements.set(eid, { id: eid, nodeI: grid[s]![i]!, nodeJ: grid[s + 1]![i]!, sectionId: 1, materialId: 1 }); eid++; }
    for (let i = 0; i < 4; i++) { elements.set(eid, { id: eid, nodeI: grid[s + 1]![i]!, nodeJ: grid[s + 1]![(i + 1) % 4]!, sectionId: 1, materialId: 1 }); eid++; }
  }
  return { nodes, elements, sections: new Map([[1, { id: 1, a: 0.25 }]]), materials: new Map([[1, { id: 1, rho: 25 }]]), loadCases: [{ id: 1, type: 'D', name: 'D' }] };
}
const applied = (reg: ProjectRegulations): ProjectRegulations => {
  const out = { ...reg };
  for (const k of Object.keys(out) as Array<keyof ProjectRegulations>) if (out[k].adapterId) out[k] = { ...out[k], configComplete: true, state: 'applied' };
  return out;
};
const plan = (wind: Partial<NonNullable<LoadPlanInput['wind']>>, model = tower()) => buildLoadPlan({
  regulations: applied(defaultRegulations()), model, dead: [{ labelKey: 'a', q: 1 }], occupancyKey: 'vivienda', tributaryWidth: 3,
  reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: false,
  wind: { enabled: true, basicSpeed: 45, exposure: 'C', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, directions: { x: false, y: true }, senses: ['+y'], caseSet: 'case1', ...wind },
});
const yForce = (p: ReturnType<typeof buildLoadPlan>, nodeIds: number[]) => p.nodal.filter((n) => n.caseType === 'W' && nodeIds.includes(n.nodeId)).reduce((s, n) => s + n.fy, 0);

describe('a flexible building in the load plan', () => {
  it('a 60 m concrete frame by the approximate frequency: G_f 0,978 along Y, its level forces 1,151 times the rigid ones', () => {
    const rigid = plan({});
    const flex = plan({ dynamics: { n1Source: 'approximate', system: 'concreteMomentFrame', beta: 0.02, rigidG: 'default' } });
    expect(flex.factors.windGust?.y?.kind).toBe('flexible');
    expect(flex.factors.windGust!.y!.value.value).toBeCloseTo(0.978, 3);
    // A level high enough that the §2.1.5 minimum does not govern: the 15th storey's nodes.
    const lvl = [57, 58, 59, 60];
    expect(yForce(flex, lvl) / yForce(rigid, lvl)).toBeCloseTo(0.978 / 0.85, 2);
    expect(flex.derivation.some((m) => m.key === 'loadPlan.derivation.windGust.flexible')).toBe(true);
    // None of the commentary's triggers here: h 60 < 120 and < 4 × 20, n₁ > 0,25, V̄/(n₁·B) = 4,84 < 5.
    expect(flex.unsupportedKeys.some((m) => m.key.startsWith('loads.cirsoc102.gust.sensitive'))).toBe(false);
    // A taller and lighter one trips them.
    const tall = plan({ dynamics: { n1Source: 'typed', n1: { y: 0.2 }, beta: 0.02, rigidG: 'default' } }, tower(45));
    expect(tall.unsupportedKeys.filter((m) => m.key.startsWith('loads.cirsoc102.gust.sensitive')).map((m) => m.key.split('.').pop())).toEqual(['tall', 'slender', 'lowFrequency', 'reducedSpeed']);
  });

  it('a typed frequency above 1 Hz is rigid, the calculated G when asked', () => {
    const p = plan({ dynamics: { n1Source: 'typed', n1: { y: 1.4 }, beta: 0.02, rigidG: 'calculated' } });
    expect(p.factors.windGust?.y?.kind).toBe('rigidCalculated');
    expect(p.factors.windGust!.y!.value.value).toBeGreaterThan(0.85);
  });

  it('torsional cases of a flexible axis take Eq. (2.4-5); the rigid ones ±0,15 B', () => {
    const dyn = { n1Source: 'approximate' as const, system: 'concreteMomentFrame' as const, beta: 0.02, rigidG: 'default' as const, eR: { y: 1.5 } };
    const flex = plan({ dynamics: dyn, caseSet: 'all', directions: { x: true, y: true }, senses: ['+x', '+y'] });
    const rigid = plan({ caseSet: 'all', directions: { x: true, y: true }, senses: ['+x', '+y'] });
    const model = tower();
    const torsion = (p: ReturnType<typeof buildLoadPlan>) => {
      const i = p.cases.findIndex((c) => c.nameKey === 'autoLoad.windCase2' && String((c.nameParams as { dir?: string }).dir).includes('Y'));
      // About the plan's centre: the torsion is spread as forces over each level's nodes.
      let mz = 0, fy = 0;
      for (const n of p.nodal.filter((x) => x.caseIndex === i)) {
        const nd = model.nodes.get(n.nodeId)!;
        mz += (nd.x - 15) * n.fy - (nd.y - 10) * n.fx + (n.mz ?? 0);
        fy += n.fy;
      }
      return Math.abs(mz / fy);
    };
    // The lever of the torsion: e for the flexible axis, 0,15·30 = 4,5 m for the rigid one.
    expect(torsion(rigid)).toBeCloseTo(4.5, 6);
    expect(torsion(flex)).toBeCloseTo(4.016, 2);
  });

  it('a structure declared flexible with nothing to compute G_f with is refused, building or chimney', () => {
    expect(plan({ rigid: false }).nodal.some((n) => n.caseType === 'W')).toBe(false);
    const chimney = plan({ rigid: false, structure: { kind: 'chimney', section: 'roundSmooth', diameter: 2 } as never }, tower(13, 2, 2));
    expect(chimney.nodal.some((n) => n.caseType === 'W')).toBe(false);
    expect(chimney.unsupportedKeys.map((u) => u.key)).toContain('loads.cirsoc102.unsupported.flexibleBuilding');
    const withN1 = plan({ structure: { kind: 'chimney', section: 'roundSmooth', diameter: 2 } as never, dynamics: { n1Source: 'typed', n1: { x: 0.8, y: 0.8 }, beta: 0.005, rigidG: 'default' } }, tower(13, 2, 2));
    expect(withN1.factors.windGust?.y?.kind).toBe('flexible');
    expect(withN1.factors.windGust!.y!.value.value).toBeGreaterThan(1.2);
  });

  it('picks each direction\'s frequency from the translational mode with the most mass along it', () => {
    const f = fundamentalFrequencies([
      { frequency: 0.31, massRatioX: 0.02, massRatioY: 0.01 },
      { frequency: 0.37, massRatioX: 0.71, massRatioY: 0.01 },
      { frequency: 0.42, massRatioX: 0.01, massRatioY: 0.69 },
    ]);
    expect(f.x).toMatchObject({ n1: 0.37, mode: 2 });
    expect(f.y).toMatchObject({ n1: 0.42, mode: 3 });
    expect(f.notes.map((n) => n.key)).toEqual(['loads.cirsoc102.gust.torsionalFirstMode']);
  });
});
