/**
 * The load plan's wind with its dynamics (CIRSOC 102-2025 §1.9): a flexible building's level forces
 * scale with G_f/0,85, its torsional cases take Eq. (2.4-5), its service wind recomputes G_f, and a
 * structure declared flexible with no frequency is refused, building or not.
 */
import { describe, it, expect } from 'vitest';
import { buildLoadPlan, type LoadModelData, type LoadPlanInput } from '../load-plan';
import { defaultRegulations, type ProjectRegulations } from '../../../codes/roles';
import { defaultWindDynamics, fundamentalFrequencies } from '../wind-dynamics';

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

  it('picks each direction\'s frequency from its translational mode, and names a torsional first mode', () => {
    const f = fundamentalFrequencies([
      { frequency: 0.31, massRatioX: 0.02, massRatioY: 0.01 },
      { frequency: 0.37, massRatioX: 0.71, massRatioY: 0.01 },
      { frequency: 0.42, massRatioX: 0.01, massRatioY: 0.69 },
    ]);
    expect(f.x).toMatchObject({ n1: 0.37, mode: 2 });
    expect(f.y).toMatchObject({ n1: 0.42, mode: 3 });
    expect(f.notes.map((n) => n.key)).toEqual(['loads.cirsoc102.gust.torsionalFirstMode']);
  });

  it.each(['typed', 'modal'] as const)('does not load a chimney axis with a missing %s frequency', (n1Source) => {
    const p = plan({
      structure: { kind: 'chimney', section: 'roundSmooth', diameter: 2 },
      directions: { x: true, y: true }, senses: ['+x', '-x', '+y', '-y'],
      dynamics: { n1Source, n1: { x: 0.4 }, beta: 0.02, rigidG: 'default' },
    }, tower(13, 2, 2));
    expect(p.factors.windGust?.x?.kind).toBe('flexible');
    expect(p.unsupportedKeys).toContainEqual({ key: `loads.cirsoc102.gust.no${n1Source === 'typed' ? 'Typed' : 'Modal'}Frequency`, params: { axis: 'Y' } });
    expect(p.cases.filter((c) => c.type === 'W').map((c) => c.nameParams?.dir)).toEqual(['+X', '-X']);
    expect(p.nodal.some((n) => n.fx !== 0)).toBe(true);
    expect(p.nodal.every((n) => n.fy === 0)).toBe(true);
  });

  it('requires both gust factors for tower diagonals, even with only X selected', () => {
    const wind: Partial<NonNullable<LoadPlanInput['wind']>> = {
      structure: { kind: 'latticeTower', section: 'square', round: false, solidity: 0.2, diagonal: true, width: 2 },
      directions: { x: true, y: false }, senses: ['+x'],
      dynamics: { n1Source: 'typed', n1: { x: 0.4 }, beta: 0.02, rigidG: 'default' },
    };
    const missing = plan(wind, tower(13, 2, 2));
    expect(missing.cases.filter((c) => c.type === 'W').map((c) => c.nameParams?.dir)).toEqual(['+X']);
    expect(missing.nodal.every((n) => n.fy === 0)).toBe(true);
    expect(missing.unsupportedKeys.some((m) => m.key.endsWith('noTypedFrequency'))).toBe(true);
    const complete = plan({ ...wind, dynamics: { ...wind.dynamics!, n1: { x: 0.4, y: 0.5 } } }, tower(13, 2, 2));
    expect(complete.cases.filter((c) => c.type === 'W').map((c) => c.nameParams?.dir)).toEqual(['+X', '+X+Y']);
    expect(complete.nodal.some((n) => n.fy !== 0)).toBe(true);
  });

  it('does not require an unused axis, or warn of a rigid assumption when G_f was computed', () => {
    const p = plan({
      rigid: false, structure: { kind: 'chimney', section: 'roundSmooth', diameter: 2 },
      dynamics: { n1Source: 'typed', n1: { y: 0.4 }, beta: 0.02, rigidG: 'default' },
    }, tower(13, 2, 2));
    expect(p.nodal.some((n) => n.fy !== 0)).toBe(true);
    expect(p.unsupportedKeys.some((m) => m.key.endsWith('noTypedFrequency') || m.key === 'wind.other.flexibleAssumedRigid')).toBe(false);
  });

  it('refuses an axis whose resonant response cannot be computed', () => {
    const p = plan({
      structure: { kind: 'chimney', section: 'roundSmooth', diameter: 2 },
      directions: { x: true, y: true }, senses: ['+x', '+y'],
      dynamics: { n1Source: 'typed', n1: { x: 1.2, y: 0.4 }, beta: 0, rigidG: 'default' },
    }, tower(13, 2, 2));
    expect(p.unsupportedKeys.some((m) => m.key.endsWith('noResonance'))).toBe(true);
    expect(p.cases.filter((c) => c.type === 'W').map((c) => c.nameParams?.dir)).toEqual(['+X']);
    expect(p.nodal.every((n) => n.fy === 0)).toBe(true);
  });

  it('a free roof keeps its flexible response regardless of the building enclosure setting', () => {
    const wind: Partial<NonNullable<LoadPlanInput['wind']>> = {
      structure: { kind: 'freeRoof', roof: 'monoslope', blocked: false },
      dynamics: { n1Source: 'typed', n1: { y: 0.4 }, beta: 0.02, rigidG: 'default' },
    };
    const model = tower(3, 20, 20);
    const enclosed = plan({ ...wind, enclosure: 'enclosed' }, model);
    const open = plan({ ...wind, enclosure: 'open' }, model);
    expect(enclosed.factors.windGust?.y?.kind).toBe('flexible');
    expect(enclosed.factors.windGust?.y?.value.value).toBeCloseTo(1.152, 3);
    expect(enclosed.distributed.filter((d) => d.caseType === 'W').length).toBeGreaterThan(0);
    expect(enclosed.distributed).toEqual(open.distributed);
    // The low-rise exception still applies to an enclosed building of the same dimensions.
    expect(plan({ ...wind, structure: { kind: 'building' } }, model).factors.windGust?.y?.kind).toBe('rigidDefault');
  });
});

/** A stick: one node per level, `storeys` of `dz` m, as a chimney or a tower is often modelled. */
function stick(storeys: number, dz: number): LoadModelData {
  const nodes = new Map<number, { id: number; x: number; y: number; z?: number }>();
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number }>();
  for (let s = 0; s <= storeys; s++) nodes.set(s + 1, { id: s + 1, x: 0, y: 0, z: s * dz });
  for (let s = 0; s < storeys; s++) elements.set(s + 1, { id: s + 1, nodeI: s + 1, nodeJ: s + 2, sectionId: 1, materialId: 1 });
  return { nodes, elements, sections: new Map([[1, { id: 1, a: 0.25 }]]), materials: new Map([[1, { id: 1, rho: 25 }]]), loadCases: [{ id: 1, type: 'D', name: 'D' }] };
}
/** A podium of `podium` storeys `bx` × `by`, and above it a tower `bx` × `byTower`, storeys of 3 m. */
function setback(storeys: number, podium: number, bx: number, by: number, byTower: number): LoadModelData {
  const m = tower(storeys, bx, by);
  for (const n of m.nodes.values()) if ((n.z ?? 0) > podium * 3 && n.y > 0) n.y = byTower;
  return m;
}
const sensitive = (p: ReturnType<typeof buildLoadPlan>) => p.unsupportedKeys.filter((m) => m.key.startsWith('loads.cirsoc102.gust.sensitive')).map((m) => m.key.split('.').pop());

describe('where n₁, B and β come from (C 1.9, C 1.1.2)', () => {
  it('takes each direction\'s fundamental frequency: the lowest mode with a tenth of the mass along it, not the one with the most', () => {
    // Coupled modes: the first carries 40 % of the mass along X, the third 45 %. n₁ along X is the
    // first's 0,55 Hz (flexible); the most-mass rule took 1,2 Hz, rigid and 0,85.
    const f = fundamentalFrequencies([
      { frequency: 0.55, massRatioX: 0.40, massRatioY: 0.02 },
      { frequency: 0.90, massRatioX: 0.01, massRatioY: 0.70 },
      { frequency: 1.20, massRatioX: 0.45, massRatioY: 0.01 },
    ]);
    expect(f.x).toMatchObject({ n1: 0.55, mode: 1 });
    expect(f.y).toMatchObject({ n1: 0.9, mode: 2 });
    expect(f.lowest).toBe(0.55);
    expect(f.notes).toEqual([]);
    // No mode reaches a tenth along Y: the one with the most is taken, and named.
    const weak = fundamentalFrequencies([
      { frequency: 0.5, massRatioX: 0.8, massRatioY: 0.04 },
      { frequency: 0.7, massRatioX: 0.05, massRatioY: 0.06 },
    ]);
    expect(weak.y).toMatchObject({ n1: 0.7, mode: 2 });
    expect(weak.notes.map((n) => n.key)).toEqual(['loads.cirsoc102.gust.weakModalMass']);
  });

  it('refuses the approximate frequency of §1.9.3 for a structure that is not a building', () => {
    // A 30 m lattice tower 10 × 10 m: n_a would be 0,762 Hz and G_f 0,969, from equations for buildings.
    const p = plan({
      structure: { kind: 'latticeTower', section: 'square', round: false, solidity: 0.2, diagonal: false },
      dynamics: { n1Source: 'approximate', system: 'otherSteelOrConcrete', beta: 0.005, rigidG: 'default' },
    }, tower(10, 10, 10));
    expect(p.factors.windGust?.y).toBeUndefined();
    expect(p.unsupportedKeys.map((m) => m.key)).toContain('loads.cirsoc102.gust.approxNotBuilding');
    expect(p.nodal.some((n) => n.caseType === 'W')).toBe(false);
    // A free roof is an open building (§2.4.3): the approximate frequency stays open to it.
    const roof = plan({
      structure: { kind: 'freeRoof', roof: 'monoslope', blocked: false },
      dynamics: { n1Source: 'approximate', system: 'otherSteelOrConcrete', beta: 0.02, rigidG: 'default' },
    }, tower(3, 20, 20));
    expect(roof.unsupportedKeys.map((m) => m.key)).not.toContain('loads.cirsoc102.gust.approxNotBuilding');
  });

  it('a chimney modelled as a stick takes its declared D for B, L and B_min: G_f 1,299 and the triggers of C 1.1.2', () => {
    // h 40 m, D 2 m, exposure C, V 45 m/s, n₁ 0,8 Hz, β 0,5 %: B = L = 0,1 m gave 1,404.
    const p = plan({
      structure: { kind: 'chimney', section: 'roundSmooth', diameter: 2 },
      dynamics: { n1Source: 'typed', n1: { x: 0.8, y: 0.8 }, beta: 0.005, rigidG: 'default' },
    }, stick(10, 4));
    expect(p.factors.windGust!.y!.value.value).toBeCloseTo(1.299, 3);
    // h 40 > 4·2 and V̄/(n₁·B_min) = 33,5/1,6 > 5; with B_min = 0 neither was said.
    expect(sensitive(p)).toEqual(['slender', 'reducedSpeed']);
  });

  it('names a torsional first mode in the plan, and trigger III reads the lowest frequency of any mode', () => {
    const torsion = fundamentalFrequencies([
      { frequency: 0.20, massRatioX: 0.01, massRatioY: 0.01 },
      { frequency: 0.30, massRatioX: 0.70, massRatioY: 0.01 },
      { frequency: 0.32, massRatioX: 0.01, massRatioY: 0.70 },
    ]);
    expect(torsion.lowest).toBe(0.2);
    const p = plan({ dynamics: { n1Source: 'modal', n1: { x: torsion.x!.n1, y: torsion.y!.n1 }, modal: { lowest: torsion.lowest, notes: torsion.notes }, beta: 0.02, rigidG: 'default' } });
    expect(p.unsupportedKeys.map((m) => m.key)).toContain('loads.cirsoc102.gust.torsionalFirstMode');
    expect(p.unsupportedKeys).toContainEqual({ key: 'loads.cirsoc102.gust.sensitive.lowFrequency', params: { n1: 0.2 } });
  });

  it('defaults β by the kind of structure: 2 % a building, 0,5 % a chimney, tower or sign (commentary C 1.9)', () => {
    expect(defaultWindDynamics('building').beta).toBe(0.02);
    expect(defaultWindDynamics('freeRoof').beta).toBe(0.02);
    for (const k of ['chimney', 'latticeTower', 'openSign', 'solidSign'] as const) expect(defaultWindDynamics(k).beta).toBe(0.005);
    // The chimney above with the default and its typed n₁: 1,299, where 2 % gave 1,013.
    const p = plan({
      structure: { kind: 'chimney', section: 'roundSmooth', diameter: 2 },
      dynamics: { ...defaultWindDynamics('chimney'), n1Source: 'typed', n1: { x: 0.8, y: 0.8 } },
    }, stick(10, 4));
    expect(p.factors.windGust!.y!.value.value).toBeCloseTo(1.299, 3);
  });

  it('refuses the approximate frequency once a trigger of C 1.1.2 fires', () => {
    // 78 m, within §1.9.2.1, but n_a 0,296 Hz gives V̄/(n₁·B_min) = 6,3 > 5: the commentary asks
    // for an analysis then, not a height-based equation.
    const p = plan({ dynamics: { n1Source: 'approximate', system: 'concreteMomentFrame', beta: 0.02, rigidG: 'default' } }, tower(26));
    expect(p.unsupportedKeys.map((m) => m.key)).toContain('loads.cirsoc102.gust.approxSensitive');
    expect(p.factors.windGust?.y).toBeUndefined();
    expect(p.nodal.some((n) => n.caseType === 'W')).toBe(false);
  });

  it('B_min of trigger II is the height-weighted width, least over the directions: a setback tower', () => {
    // A 6 m podium 30 × 20 under a 60 m tower 30 × 10: B_min ≈ 10,1 m and 60 > 4·B_min.
    const p = plan({ dynamics: { n1Source: 'typed', n1: { x: 1.4, y: 1.4 }, beta: 0.02, rigidG: 'default' } }, setback(20, 2, 30, 20, 10));
    expect(sensitive(p)).toEqual(['slender']);
  });
});
