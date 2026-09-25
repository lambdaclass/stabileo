import { describe, it, expect } from 'vitest';
import { teAllAt, teAt } from '../../../i18n/engine-text';
import {
  buildLoadPlan, combinationSymbols, describePlanDelta, levelsWithPlanArea,
  type LoadModelData, type LoadPlanInput,
} from '../load-plan';
import {
  bindRole, defaultRegulations, unsetBinding, type ProjectRegulations,
} from '../../../codes/roles';
import { computeWindPressures, velocityPressure, G_RIGID } from '../../../codes/cirsoc102/wind';

/** Two-storey 6×6 frame with real sections and density. */
function frame(storeys = 2, bay = 6, h = 3): LoadModelData {
  const nodes = new Map<number, { id: number; x: number; y: number; z?: number }>();
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number }>();
  let nid = 1, eid = 1;
  const grid: number[][] = [];
  for (let s = 0; s <= storeys; s++) {
    const lvl: number[] = [];
    for (const [x, y] of [[0, 0], [bay, 0], [bay, bay], [0, bay]]) {
      nodes.set(nid, { id: nid, x, y, z: s * h }); lvl.push(nid); nid++;
    }
    grid.push(lvl);
  }
  for (let s = 0; s < storeys; s++) {
    for (let i = 0; i < 4; i++) {
      elements.set(eid, { id: eid, nodeI: grid[s][i], nodeJ: grid[s + 1][i], sectionId: 1, materialId: 1 }); eid++;
    }
    for (let i = 0; i < 4; i++) {
      elements.set(eid, { id: eid, nodeI: grid[s + 1][i], nodeJ: grid[s + 1][(i + 1) % 4], sectionId: 1, materialId: 1 }); eid++;
    }
  }
  return {
    nodes, elements,
    sections: new Map([[1, { id: 1, a: 0.09 }]]),
    materials: new Map([[1, { id: 1, rho: 25 }]]),
    loadCases: [{ id: 1, type: 'D', name: 'Dead' }, { id: 2, type: 'L', name: 'Live' }],
  };
}

function applied(reg: ProjectRegulations): ProjectRegulations {
  const out = { ...reg };
  for (const k of Object.keys(out) as Array<keyof ProjectRegulations>) {
    if (out[k].adapterId) out[k] = { ...out[k], configComplete: true, state: 'applied' };
  }
  return out;
}

function input(over: Partial<LoadPlanInput> = {}): LoadPlanInput {
  return {
    regulations: applied(defaultRegulations()),
    model: frame(),
    dead: [{ labelKey: 'a', q: 1.0 }, { labelKey: 'b', q: 0.8 }],
    occupancyKey: 'vivienda',
    tributaryWidth: 3,
    reductionElementKind: 'interiorBeam',
    floorsSupported: 1,
    applyLiveReduction: true,
    generateCombinations: true,
    ...over,
  };
}

// ─── Role gating ─────────────────────────────────────────────────

describe('role gating', () => {
  it('is READY with the default CIRSOC stack', () => {
    expect(buildLoadPlan(input()).outcome).toBe('READY');
  });

  it('is BLOCKED, with a reason, when the loads role is unset', () => {
    const reg = applied(defaultRegulations());
    reg.loads = unsetBinding('loads');
    const p = buildLoadPlan(input({ regulations: reg }));
    expect(p.outcome).toBe('BLOCKED');
    expect(p.blockedKeys.some((b) => b.key === 'loadPlan.blocked.roleUnusable')).toBe(true);
  });

  it('is BLOCKED when a bound role is still unconfigured', () => {
    const reg = applied(defaultRegulations());
    reg.loads = { ...reg.loads, configComplete: false };
    expect(buildLoadPlan(input({ regulations: reg })).outcome).toBe('BLOCKED');
  });

  it('is BLOCKED when wind is requested but the wind role is unusable', () => {
    const reg = applied(defaultRegulations());
    reg.wind = unsetBinding('wind');
    const p = buildLoadPlan(input({
      regulations: reg,
      wind: {
        enabled: true, basicSpeed: 45, exposure: 'C', enclosure: 'enclosed',
        siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 20, rigid: true,
        directions: { x: true, y: false },
      },
    }));
    expect(p.outcome).toBe('BLOCKED');
    expect(p.blockedKeys.some((b) => b.key === 'loadPlan.blocked.windRoleUnusable')).toBe(true);
  });

  it('is BLOCKED when seismic is requested with no seismic role', () => {
    const p = buildLoadPlan(input({
      seismic: { enabled: true, coefficient: 0.15, liveParticipation: 0.25, directions: { x: true, y: false } },
    }));
    expect(p.outcome).toBe('BLOCKED');
    expect(p.blockedKeys.some((b) => b.key === 'loadPlan.blocked.seismicRoleUnusable')).toBe(true);
  });

  it('never silently substitutes a default for an unusable role', () => {
    const reg = applied(defaultRegulations());
    reg.basis = unsetBinding('basis');
    const p = buildLoadPlan(input({ regulations: reg }));
    expect(p.distributed).toEqual([]);
    expect(p.combinations).toEqual([]);
  });
});

// ─── Real geometry, no assumed floor area ────────────────────────

describe('level plan areas come from real geometry', () => {
  it('computes each level extent from the actual nodes', () => {
    const lv = levelsWithPlanArea(frame(2, 6));
    expect(lv.map((l) => l.elevation)).toEqual([0, 3, 6]);
    // 6 × 6 bay -> 36 m², not an assumed constant.
    for (const l of lv) expect(l.planAreaM2).toBeCloseTo(36, 6);
  });

  it('scales with the actual bay, which a 50 m² literal could not', () => {
    expect(levelsWithPlanArea(frame(1, 4))[1].planAreaM2).toBeCloseTo(16, 6);
    expect(levelsWithPlanArea(frame(1, 10))[1].planAreaM2).toBeCloseTo(100, 6);
  });

  it('reports zero area for a level with too few nodes to bound a plan', () => {
    const m = frame(1);
    m.nodes.set(99, { id: 99, x: 0, y: 0, z: 99 });
    const lv = levelsWithPlanArea(m);
    expect(lv[lv.length - 1].planAreaM2).toBe(0);
  });

  it('derives level masses from self-weight plus applied loads, not an estimate', () => {
    const p = buildLoadPlan(input());
    const lv = p.levels.find((l) => l.elevation === 3)!;
    // 6 m bay, 4 beams: 4 × 6 × 0.09 × 25 = 54 kN, plus half the columns each side.
    expect(lv.selfWeightKN).toBeGreaterThan(50);
    expect(lv.superimposedKN).toBeCloseTo(1.8 * 36, 6);
    expect(teAllAt(p.derivation, 'es').join(' ')).toMatch(/de la extensión real de los nodos/);
  });

  it('gives different levels different weights', () => {
    const p = buildLoadPlan(input());
    const w = p.levels.map((l) => l.weightKN.toFixed(3));
    expect(new Set(w).size).toBeGreaterThan(1);
  });
});

// ─── Live loads and reduction ────────────────────────────────────

describe('CIRSOC 101 imposed loads', () => {
  it('takes Lo from Table 4.1 and cites it', () => {
    const p = buildLoadPlan(input({ occupancyKey: 'oficina' }));
    expect(p.factors.occupancy.value).toBe(2.5);
    expect(p.refs.some((r) => r.clause === 'Tabla 4.1')).toBe(true);
  });

  it('applies the §4.7.2 reduction and records why', () => {
    const p = buildLoadPlan(input({ applyLiveReduction: true }));
    expect(p.factors.liveReduced.value).toBeLessThanOrEqual(p.factors.occupancy.value);
    expect(teAllAt(p.derivation, 'es').join(' ')).toMatch(/K_LL·A_t|no corresponde reducción/);
  });

  it('skips the reduction when the project says so, and says so', () => {
    const p = buildLoadPlan(input({ applyLiveReduction: false }));
    expect(p.factors.liveReduced.value).toBe(p.factors.occupancy.value);
    expect(teAllAt(p.derivation, 'es').join(' ')).toMatch(/no aplicada por decisión del proyecto/);
  });

  it('BLOCKS on an occupancy whose table entry is a cross-reference', () => {
    // Table 4.1 sends "Balcones — otros casos" to article 4.11; inventing a number here
    // would be worse than refusing.
    const p = buildLoadPlan(input({ occupancyKey: 'balcon_otros' }));
    expect(p.outcome).toBe('BLOCKED');
    expect(p.blockedKeys[0].key).toBe('loadPlan.blocked.occupancyCrossReference');
    expect(p.blockedKeys[0].params?.article).toBe('4.11');
  });

  it('BLOCKS on an unknown occupancy key', () => {
    expect(buildLoadPlan(input({ occupancyKey: 'nope' })).blockedKeys[0].key)
      .toBe('loadPlan.blocked.unknownOccupancy');
  });

  it('puts dead and live line loads on beam-like members only', () => {
    const p = buildLoadPlan(input());
    // 8 beams over two storeys; columns excluded.
    const beams = p.distributed.filter((d) => d.caseType === 'D');
    expect(beams).toHaveLength(8);
    for (const d of p.distributed) expect(d.q).toBeLessThan(0);   // downward
  });

  it('scales the line load with the tributary width', () => {
    const a = buildLoadPlan(input({ tributaryWidth: 2 })).distributed.find((d) => d.caseType === 'D')!;
    const b = buildLoadPlan(input({ tributaryWidth: 4 })).distributed.find((d) => d.caseType === 'D')!;
    expect(b.q).toBeCloseTo(2 * a.q, 6);
  });
});

// ─── Combinations ────────────────────────────────────────────────

describe('combinations come from the basis role', () => {
  it('generates the §2.3.2 set and cites it', () => {
    const p = buildLoadPlan(input());
    expect(p.combinations.length).toBeGreaterThan(0);
    expect(p.combinations.some((c) => c.label === '1.4 D')).toBe(true);
    expect(p.refs.some((r) => r.clause === '2.3.2')).toBe(true);
  });

  it('omits combinations entirely when asked', () => {
    expect(buildLoadPlan(input({ generateCombinations: false })).combinations).toEqual([]);
  });

  it('never mixes W and E in one combination', () => {
    const reg = applied(defaultRegulations());
    reg.seismic = { ...bindRole('seismic', 'inpres103-2018'), configComplete: true, state: 'applied' };
    const p = buildLoadPlan(input({
      regulations: reg,
      wind: { enabled: true, basicSpeed: 45, exposure: 'C', enclosure: 'enclosed',
        siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 20, rigid: true,
        directions: { x: true, y: false } },
      seismic: { enabled: true, coefficient: 0.15, liveParticipation: 0.25, directions: { x: true, y: false } },
    }));
    for (const c of p.combinations) {
      const s = combinationSymbols(c);
      expect(s.includes('W') && s.includes('E'), c.id).toBe(false);
    }
  });

  it('records the Exception 1 decision in the derivation', () => {
    const p = buildLoadPlan(input({ occupancyKey: 'vivienda' }));
    expect(teAllAt(p.derivation, 'es').join(' ')).toMatch(/Excepción 1/);
  });
});

// ─── Wind ────────────────────────────────────────────────────────

describe('wind uses the CIRSOC 102-2025 engine', () => {
  const windOn = (over = {}) => buildLoadPlan(input({
    wind: {
      enabled: true, basicSpeed: 45, exposure: 'C', enclosure: 'enclosed',
      siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 20, rigid: true,
      directions: { x: true, y: false }, ...over,
    },
  }));

  it('produces nodal wind forces and a q_h factor', () => {
    const p = windOn();
    expect(p.nodal.some((n) => n.caseType === 'W')).toBe(true);
    expect(p.factors.windQh?.value).toBeGreaterThan(0);
  });

  it('scales with the square of the basic speed', () => {
    const a = windOn({ basicSpeed: 40 }).factors.windQh!.value;
    const b = windOn({ basicSpeed: 80 }).factors.windQh!.value;
    expect(b / a).toBeCloseTo(4, 6);
  });

  it('records the unsurveyed K_zt as an assumption', () => {
    const p = windOn({ kztSurveyed: false });
    expect(teAllAt(p.assumptions, 'es').join(' ')).toMatch(/relevamiento del sitio/);
  });

  it('produces no wind forces for a flexible building, and says why', () => {
    const p = windOn({ rigid: false });
    expect(p.nodal.some((n) => n.caseType === 'W')).toBe(false);
    expect(p.unsupportedKeys.map((u) => u.key))
      .toContain('loads.cirsoc102.unsupported.flexibleBuilding');
    expect(teAllAt(p.unsupportedKeys, 'es').join(' ')).toMatch(/1\.9\.5/);
  });

  it('no longer reports the torsional cases as not covered: it builds them', () => {
    const p = windOn({ directions: { x: true, y: true } });
    expect(p.unsupportedKeys.map((u) => u.key)).not.toContain('loads.cirsoc102.unsupported.torsionalCases');
    expect(p.cases.some((c) => c.nameKey === 'autoLoad.windCase2')).toBe(true);
    expect(p.cases.some((c) => c.nameKey === 'autoLoad.windCase4')).toBe(true);
  });

  it('loads each level with the velocity pressure at its own height', () => {
    // A 10-storey, 30 m frame in exposure B, where K_z grows from 0.57 at 5 m to ~1.0 at
    // 30 m. The generator used to apply the windward pressure at z = 5 m to every level.
    const bay = 6;
    const p = buildLoadPlan(input({
      model: frame(10, bay, 3),
      wind: {
        enabled: true, basicSpeed: 45, exposure: 'B', enclosure: 'enclosed',
        siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true,
        directions: { x: true, y: false },
      },
    }));
    const byLevel = new Map<number, number>();
    const zOf = new Map([...frame(10, bay, 3).nodes.values()].map((n) => [n.id, n.z ?? 0]));
    // Case 1 from +X only: the plan now also carries −X and cases 2 to 4.
    const first = p.cases.findIndex((c) => c.nameKey.startsWith('autoLoad.windCase1') && c.nameParams?.dir === '+X');
    for (const n of p.nodal.filter((x) => x.caseType === 'W' && x.caseIndex === first)) {
      const z = zOf.get(n.nodeId)!;
      byLevel.set(z, (byLevel.get(z) ?? 0) + n.fx);
    }
    // Force per metre of height, on the intermediate storeys (3 m bands).
    const perM = (z: number) => byLevel.get(z)! / 3 / bay;   // kPa
    const project = {
      basicSpeed: 45, exposure: 'B' as const, siteAltitudeM: 0, kzt: 1, kztSurveyed: true,
      structureKind: 'building' as const, enclosure: 'enclosed' as const, meanRoofHeight: 30,
      L: bay, B: bay, roofSlopeDeg: 0, rigid: true,
    };
    const res = computeWindPressures(project);
    const cpW = res.pressures.find((x) => x.surface === 'windwardWall')!.cp;
    const cpL = res.pressures.find((x) => x.surface === 'leewardWall')!.cp;
    const expected = (z0: number, z1: number) => {
      // The band's mean q_z, by a fine rectangle rule: independent of the generator's Simpson.
      let sum = 0; const n = 600;
      for (let k = 0; k < n; k++) sum += velocityPressure(z0 + (k + 0.5) * (z1 - z0) / n, project);
      return (sum / n * G_RIGID * cpW - res.qhNm2 * G_RIGID * cpL) / 1000;
    };
    for (const z of [6, 15, 27]) {
      expect(perM(z) / expected(z - 1.5, z + 1.5)).toBeCloseTo(1, 4);
    }
    // And the top storeys carry clearly more than the lower ones.
    expect(perM(27) / perM(6)).toBeGreaterThan(1.25);
  });

  it('adds a wind case per requested direction, and the cases of Fig. 2.4-8 on request', () => {
    const one = windOn({ directions: { x: true, y: true }, caseSet: 'case1', bothSenses: false });
    const roofCase1 = one.cases.filter((c) => c.type === 'W');
    // One per direction, twice when a roof takes the internal pressure with each sign.
    expect(roofCase1.length % 2).toBe(0);
    expect(new Set(roofCase1.map((c) => c.nameParams?.dir))).toEqual(new Set(['+X', '+Y']));
    const all = windOn({ directions: { x: true, y: true } });
    const perCase1 = roofCase1.length / 2;   // internal-pressure variants per direction and sense
    // case 1: 2 axes × 2 senses × variants; case 2: 2 × 2 × 2 e; case 3: 4 quadrants; case 4: 4 × 2 e.
    expect(all.cases.filter((c) => c.type === 'W')).toHaveLength(4 * perCase1 + 8 + 4 + 8);
  });
});

// ─── Seismic ─────────────────────────────────────────────────────

describe('seismic uses the real level masses', () => {
  function seismicPlan(over = {}) {
    const reg = applied(defaultRegulations());
    reg.seismic = { ...bindRole('seismic', 'inpres103-2018'), configComplete: true, state: 'applied' };
    return buildLoadPlan(input({
      regulations: reg,
      seismic: { enabled: true, coefficient: 0.15, liveParticipation: 0.25, directions: { x: true, y: false }, ...over },
    }));
  }

  it('derives W from the level masses and V0 = C·W', () => {
    const p = seismicPlan();
    const W = p.factors.seismicWeight!.value;
    expect(W).toBeGreaterThan(0);
    expect(p.factors.baseShear!.value).toBeCloseTo(0.15 * W, 6);
    expect(teAllAt(p.derivation, 'es').join(' ')).toMatch(/de las masas reales por nivel/);
  });

  it('distributes by W·h and sums to V0', () => {
    const p = seismicPlan();
    const total = p.nodal.filter((n) => n.caseType === 'E').reduce((s, n) => s + n.fx, 0);
    expect(total).toBeCloseTo(p.factors.baseShear!.value, 4);
  });

  it('flags an unstated live participation as an assumption', () => {
    const p = seismicPlan({ liveParticipation: null });
    expect(teAllAt(p.assumptions, 'es').join(' ')).toMatch(/no la indica/);
  });

  it('does not flag a stated participation', () => {
    const p = seismicPlan({ liveParticipation: 0.5 });
    expect(p.assumptions.join(' ')).not.toMatch(/no la indica/);
  });

  it('reports no seismic mass rather than inventing one', () => {
    // A genuinely massless model: zero density AND a level too narrow to bound a plan, so
    // neither self-weight nor an area load can contribute. The plan must say so rather
    // than fall back to an assumed floor weight.
    const m = frame();
    m.materials = new Map([[1, { id: 1, rho: 0 }]]);
    for (const n of m.nodes.values()) { n.x = 0; n.y = 0; }   // collinear -> plan area 0
    const reg = applied(defaultRegulations());
    reg.seismic = { ...bindRole('seismic', 'inpres103-2018'), configComplete: true, state: 'applied' };
    const p = buildLoadPlan(input({
      regulations: reg, model: m, dead: [],
      seismic: { enabled: true, coefficient: 0.15, liveParticipation: 0.25, directions: { x: true, y: false } },
    }));
    expect(p.outcome).toBe('READY');
    expect(p.factors.seismicWeight).toBeUndefined();
    expect(p.unsupportedKeys.some((u) => u.key === 'loadPlan.unsupported.noSeismicMass')).toBe(true);
    expect(p.nodal.some((n) => n.caseType === 'E')).toBe(false);
  });
});

// ─── Plan is pure, and the delta drives the preview ──────────────

describe('the plan is a plan, not a mutation', () => {
  it('never touches the model it was given', () => {
    const m = frame();
    const before = JSON.stringify({ n: [...m.nodes], e: [...m.elements], c: m.loadCases });
    buildLoadPlan(input({ model: m }));
    expect(JSON.stringify({ n: [...m.nodes], e: [...m.elements], c: m.loadCases })).toBe(before);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(buildLoadPlan(input()))).toBe(JSON.stringify(buildLoadPlan(input())));
  });

  it('reuses an existing case id where one matches, so Apply does not duplicate cases', () => {
    const p = buildLoadPlan(input());
    expect(p.cases.find((c) => c.type === 'D')!.existingId).toBe(1);
    expect(p.cases.find((c) => c.type === 'L')!.existingId).toBe(2);
  });

  it('reports a new case as needing creation', () => {
    const reg = applied(defaultRegulations());
    reg.seismic = { ...bindRole('seismic', 'inpres103-2018'), configComplete: true, state: 'applied' };
    const p = buildLoadPlan(input({
      regulations: reg,
      seismic: { enabled: true, coefficient: 0.15, liveParticipation: 0.25, directions: { x: true, y: false } },
    }));
    expect(p.cases.find((c) => c.type === 'E')!.existingId).toBeNull();
  });

  it('adds to the existing loads when replace is off — the count the audit caught', () => {
    // The preview used to report the plan's own counts as "after" regardless of the flag.
    // With replace OFF, applying a 16-load plan to a model holding 4 leaves 20, not 16,
    // and a user who trusted the preview would have silently doubled their loads.
    const p = buildLoadPlan(input());
    const current = { distributed: 4, nodal: 0, combinations: 2, caseTypes: ['D', 'L'] };
    const keep = describePlanDelta(p, current, { replaceExisting: false });
    expect(keep.before.distributed).toBe(4);
    expect(keep.after.distributed).toBe(4 + p.distributed.length);
    expect(keep.changes).toBe(true);

    const replace = describePlanDelta(p, current, { replaceExisting: true });
    expect(replace.after.distributed).toBe(p.distributed.length);
  });

  it('warns that regenerating into existing cases double-counts them', () => {
    const p = buildLoadPlan(input());
    const d = describePlanDelta(
      p, { distributed: 4, nodal: 0, combinations: 2, caseTypes: ['D', 'L'] },
      { replaceExisting: false });
    expect(d.warnings.map((w) => w.key))
      .toContain('loadPlan.warning.addedOnTopOfExisting');
    expect(d.dispositions.filter((x) => x.action === 'regenerated').map((x) => x.caseType))
      .toEqual(['D', 'L']);
    expect(d.dispositions.every((x) => x.lossy)).toBe(true);
  });

  it('never drops a load case silently — every removal is explained', () => {
    // A model carrying W and E from an earlier run, re-planned with wind and seismic off.
    // The plan stops producing them; the combinations stop referencing them. Both the
    // disposition and a warning must say so, in both flag states.
    const p = buildLoadPlan(input());
    expect(p.cases.map((c) => c.type).sort()).toEqual(['D', 'L']);
    const current = {
      distributed: 8, nodal: 12, combinations: 12, caseTypes: ['D', 'E', 'L', 'W'],
    };

    for (const replaceExisting of [false, true]) {
      const d = describePlanDelta(p, current, { replaceExisting });
      expect(d.removedCaseTypes).toEqual(['E', 'W']);

      // Every case type present before or after has a stated fate. No elisions.
      expect(d.dispositions.map((x) => x.caseType)).toEqual(['D', 'E', 'L', 'W']);
      for (const t of ['E', 'W']) {
        const x = d.dispositions.find((y) => y.caseType === t)!;
        expect(x.action).toBe(replaceExisting ? 'cleared' : 'retained');
        expect(x.lossy).toBe(true);
        // Rendered in both locales, so the explanation is never a bare key.
        for (const locale of ['en', 'es']) {
          expect(teAt(x.reason, locale)).not.toMatch(/^loadPlan\./);
          expect(teAt(x.reason, locale)).toContain(t);
        }
      }
      expect(d.warnings.map((w) => w.key)).toEqual(
        expect.arrayContaining([replaceExisting
          ? 'loadPlan.warning.caseCleared'
          : 'loadPlan.warning.caseRetainedNotCombined']));
      // One warning per dropped case, so neither E nor W is folded into the other.
      expect(d.warnings.filter((w) => w.params?.caseType === 'E')).toHaveLength(1);
      expect(d.warnings.filter((w) => w.params?.caseType === 'W')).toHaveLength(1);
    }
  });

  it('reports no change only when the plan truly changes nothing', () => {
    const p = buildLoadPlan(input({ generateCombinations: false }));
    // With replace ON and the model already equal to the plan, nothing moves.
    expect(describePlanDelta(p, {
      distributed: p.distributed.length, nodal: p.nodal.length,
      combinations: 0, caseTypes: ['D', 'L'],
    }, { replaceExisting: true }).changes).toBe(false);

    // With replace OFF the same call DOES change the model — it doubles the loads.
    expect(describePlanDelta(p, {
      distributed: p.distributed.length, nodal: p.nodal.length,
      combinations: 0, caseTypes: ['D', 'L'],
    }, { replaceExisting: false }).changes).toBe(true);
  });

  it('echoes the flag its counts were computed under', () => {
    const p = buildLoadPlan(input());
    const c = { distributed: 0, nodal: 0, combinations: 0, caseTypes: [] as string[] };
    expect(describePlanDelta(p, c, { replaceExisting: true }).replaceExisting).toBe(true);
    expect(describePlanDelta(p, c, { replaceExisting: false }).replaceExisting).toBe(false);
  });

  it('names the case types a plan adds', () => {
    const reg = applied(defaultRegulations());
    reg.seismic = { ...bindRole('seismic', 'inpres103-2018'), configComplete: true, state: 'applied' };
    const p = buildLoadPlan(input({
      regulations: reg,
      seismic: { enabled: true, coefficient: 0.15, liveParticipation: 0.25, directions: { x: true, y: false } },
    }));
    const d = describePlanDelta(p, { distributed: 0, nodal: 0, combinations: 0, caseTypes: ['D', 'L'] }, { replaceExisting: false });
    expect(d.addedCaseTypes).toContain('E');
  });
});

// ─── INPRES-CIRSOC 103, the static method ────────────────────────

describe('seismic loads from INPRES-CIRSOC 103 rather than a typed coefficient', () => {
  const code103 = {
    zone: 4 as const,
    site: 'SB' as const,
    group: 'B' as const,
    systemKey: 'rc_frame_full_ductility',
    periodSystem: 'concreteMomentFrame' as const,
    regularity: 'regular' as const,
    occupancy: 'reduced' as const,
  };
  /* The seismic role has to be BOUND before any of this runs: an unbound role blocks
     the plan, which is the gate that stopped seismic loads appearing under a regulation
     nobody chose. */
  const withSeismicRole = () => {
    const reg = applied(defaultRegulations());
    return applied({ ...reg, seismic: bindRole('seismic', 'inpres103-2018') });
  };
  const seismicInput = (over: Record<string, unknown> = {}) => input({
    regulations: withSeismicRole(),
    model: frame(4),
    seismic: {
      enabled: true, coefficient: 0.15, liveParticipation: null,
      directions: { x: true, y: false }, code: code103, ...over,
    } as LoadPlanInput['seismic'],
  });

  it('derives the coefficient instead of using the typed one', () => {
    const p = buildLoadPlan(seismicInput());
    expect(p.outcome).toBe('READY');
    expect(p.seismic?.source).toBe('cirsoc103');
    // Zone 4 / site SB / group B / R = 7. Whatever the period, it is not the 0,15 that
    // was typed into the box beside it.
    expect(p.seismic!.c).not.toBeCloseTo(0.15, 6);
    expect(p.seismic!.r).toBe(7);
    expect(p.seismic!.gammaR).toBe(1.0);
    expect(p.seismic!.zone).toBe(4);
    expect(p.seismic!.spectralType).toBe(1);
  });

  it('keeps the typed coefficient when no code inputs are given', () => {
    const p = buildLoadPlan(seismicInput({ code: undefined }));
    expect(p.seismic?.source).toBe('manual');
    expect(p.seismic!.c).toBeCloseTo(0.15, 12);
  });

  it('scales the base shear with the behaviour factor', () => {
    const ductile = buildLoadPlan(seismicInput());
    const brittle = buildLoadPlan(seismicInput({
      code: { ...code103, systemKey: 'rc_cantilever_columns' },
    }));
    expect(brittle.seismic!.r).toBe(2.5);
    // Same building, same weight — the coefficient is the reciprocal of R.
    expect(brittle.seismic!.c / ductile.seismic!.c).toBeCloseTo(7 / 2.5, 6);
    expect(brittle.factors.baseShear!.value / ductile.factors.baseShear!.value)
      .toBeCloseTo(7 / 2.5, 6);
  });

  it('scales with the destination group', () => {
    const b = buildLoadPlan(seismicInput());
    const ao = buildLoadPlan(seismicInput({ code: { ...code103, group: 'Ao' } }));
    expect(ao.seismic!.c / b.seismic!.c).toBeCloseTo(1.5, 6);
  });

  it('reads the imposed-load fraction off Tabla 3.3 instead of assuming 0,25', () => {
    const flat = buildLoadPlan(seismicInput());
    const store = buildLoadPlan(seismicInput({ code: { ...code103, occupancy: 'high' } }));
    expect(flat.seismic!.f1).toBe(0.25);
    expect(store.seismic!.f1).toBe(0.75);
    // A warehouse is genuinely heavier during the earthquake, which a single
    // project-wide participation number could not express.
    expect(store.factors.seismicWeight!.value)
      .toBeGreaterThan(flat.factors.seismicWeight!.value);
  });

  it('lets a typed participation override the table, and says which was used', () => {
    const p = buildLoadPlan(seismicInput({ liveParticipation: 0.5 }));
    const flat = buildLoadPlan(seismicInput());
    expect(p.factors.seismicWeight!.value).toBeGreaterThan(flat.factors.seismicWeight!.value);
  });

  it('distributes the shear in height and sums back to it', () => {
    const p = buildLoadPlan(seismicInput());
    const total = p.nodal.filter((n) => n.caseType === 'E').reduce((s, n) => s + n.fx, 0);
    expect(total).toBeCloseTo(p.factors.baseShear!.value, 4);
    expect(total).toBeGreaterThan(0);
  });

  it('blocks when Tabla 5.1 gives the system no R', () => {
    // Row 1 prints an expression on the wall layout, not a value.
    const p = buildLoadPlan(seismicInput({ code: { ...code103, systemKey: 'rc_walls' } }));
    expect(p.outcome).toBe('BLOCKED');
    expect(p.blockedKeys.map((b) => b.key)).toContain('loadPlan.blocked.seismicNoR');
  });

  it('blocks in zone 0, where Tabla 3.1 prints no spectrum', () => {
    const p = buildLoadPlan(seismicInput({ code: { ...code103, zone: 0 } }));
    expect(p.outcome).toBe('BLOCKED');
    expect(p.blockedKeys.map((b) => b.key)).toContain('seismic.blocked.zone0');
  });

  it('blocks on site class SF, which needs a site-specific study', () => {
    const p = buildLoadPlan(seismicInput({ code: { ...code103, site: 'SF' } }));
    expect(p.outcome).toBe('BLOCKED');
    expect(p.blockedKeys.map((b) => b.key)).toContain('seismic.blocked.siteSF');
  });

  it('blocks a building the static method does not reach', () => {
    // 20 storeys at 3 m is 60 m; Tabla 2.5 stops at 45 m for group B in zone 4.
    const p = buildLoadPlan(input({
      regulations: withSeismicRole(),
      model: frame(20),
      seismic: {
        enabled: true, coefficient: 0.15, liveParticipation: null,
        directions: { x: true, y: false }, code: code103,
      } as LoadPlanInput['seismic'],
    }));
    expect(p.outcome).toBe('BLOCKED');
    const keys = p.blockedKeys.map((b) => b.key);
    expect(keys.some((k) => k === 'seismic.blocked.heightOverTable25'
      || k === 'seismic.blocked.dynamicRequired')).toBe(true);
  });

  it('renders the whole derivation as sentences, in both locales', () => {
    const p = buildLoadPlan(seismicInput());
    for (const locale of ['en', 'es'] as const) {
      const text = teAllAt(p.derivation, locale);
      expect(text.every((t) => t.length > 0 && !t.startsWith('seismic.'))).toBe(true);
      // The period and the coefficient are both explained, not just reported.
      expect(text.some((t) => t.includes('Ta') || t.includes('Cr'))).toBe(true);
    }
  });
});
