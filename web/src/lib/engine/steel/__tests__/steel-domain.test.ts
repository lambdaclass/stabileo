/**
 * The metallic domain: family, status and inventory.
 *
 * The assertions that matter are the negative ones. Nothing here may report a pass, nothing
 * may report a number without disclosing what stands behind it, and nothing may quietly
 * omit a member a user can see in the viewport.
 */

import { describe, it, expect } from 'vitest';
import {
  CONCRETE_FY_CEILING, isConcrete, isInferred, isSteel, materialFamilyOf,
  type GradeFamilyLookup,
} from '../material-family';
import {
  assertSteelStateInvariants, steelCountsAsVerified, steelDisplayTone, steelStatusGlyph,
  STEEL_MEMBER_STATUSES, type SteelMemberState,
} from '../steel-status';
import {
  buildSteelInventory, countByKind, totalSteelLength, type InventoryModel,
} from '../steel-inventory';

// ─── material family ─────────────────────────────────────────────────

describe('materialFamilyOf', () => {
  it('reads a concrete strength as concrete, and says it inferred that', () => {
    const v = materialFamilyOf({ fy: 25 });
    expect(v.family).toBe('concrete');
    expect(v.basis).toBe('inferredFromFy');
    expect(v.caveatKey).toBeTruthy();
    expect(isConcrete(v)).toBe(true);
    expect(isInferred(v)).toBe(true);
  });

  it('reads a steel yield as steel, and discloses that it cannot tell which metal', () => {
    const v = materialFamilyOf({ fy: 345 });
    expect(v.family).toBe('steel');
    expect(v.basis).toBe('inferredFromFy');
    // Aluminium 6061-T6 carries fy = 276 and is indistinguishable here. The caveat is what
    // stops the verdict from being a claim.
    expect(v.caveatKey).toBe('steel.family.inferredMetalNotFerrousChecked');
    expect(materialFamilyOf({ fy: 276 }).family).toBe('steel');
  });

  it('splits exactly at the ceiling, inclusive on the concrete side', () => {
    expect(materialFamilyOf({ fy: CONCRETE_FY_CEILING }).family).toBe('concrete');
    expect(materialFamilyOf({ fy: CONCRETE_FY_CEILING + 0.001 }).family).toBe('steel');
  });

  it('refuses to classify a material with no strength, rather than defaulting it', () => {
    for (const m of [{}, { fy: 0 }, { fy: -5 }, { fy: NaN }]) {
      const v = materialFamilyOf(m);
      expect(v.family).toBe('unknown');
      expect(v.basis).toBe('noData');
      expect(v.caveatKey).toBeTruthy();
    }
    expect(materialFamilyOf(undefined).family).toBe('unknown');
    expect(materialFamilyOf(null).family).toBe('unknown');
  });

  it('lets a declared grade override the magnitude, with no caveat', () => {
    // The PR #132 path. A grade that says "concrete" wins even over a steel-looking fy —
    // which is the point: a declaration is a fact and a magnitude is an interpretation.
    const lookup: GradeFamilyLookup = (id) => (id === 'en-s355' ? 'steel' : id === 'h25' ? 'concrete' : null);
    const steel = materialFamilyOf({ fy: 355, gradeId: 'en-s355' }, lookup);
    expect(steel.basis).toBe('declaredGrade');
    expect(steel.caveatKey).toBeUndefined();
    expect(isInferred(steel)).toBe(false);

    const odd = materialFamilyOf({ fy: 355, gradeId: 'h25' }, lookup);
    expect(odd.family).toBe('concrete');
    expect(odd.basis).toBe('declaredGrade');
  });

  it('falls back to the inference for a grade the catalogue no longer knows', () => {
    const lookup: GradeFamilyLookup = () => null;
    const v = materialFamilyOf({ fy: 355, gradeId: 'withdrawn' }, lookup);
    expect(v.family).toBe('steel');
    expect(v.basis).toBe('inferredFromFy');
  });

  it('ignores a grade id when no lookup was supplied — this branch has no catalogue', () => {
    const v = materialFamilyOf({ fy: 355, gradeId: 'en-s355' });
    expect(v.basis).toBe('inferredFromFy');
    expect(isSteel(v)).toBe(true);
  });
});

// ─── status contract ─────────────────────────────────────────────────

describe('steel status — nothing here is ever a pass', () => {
  it.each(STEEL_MEMBER_STATUSES)('%s does not count as verified', (status) => {
    expect(steelCountsAsVerified(status)).toBe(false);
  });

  it.each(STEEL_MEMBER_STATUSES)('%s is never given a passing tone', (status) => {
    expect(['neutral', 'warn', 'info']).toContain(steelDisplayTone(status));
    expect(steelDisplayTone(status)).not.toBe('ok');
  });

  it.each(STEEL_MEMBER_STATUSES)('%s carries a glyph, so colour is never the only signal', (status) => {
    expect(steelStatusGlyph(status).length).toBeGreaterThan(0);
    expect(steelStatusGlyph(status)).not.toBe('✓');
  });
});

describe('assertSteelStateInvariants', () => {
  const ok: SteelMemberState = {
    elementId: 7, status: 'NOT_DESIGNED',
    reasons: [{ key: 'steel.reason.noMetallicAuthority' }],
  };

  it('accepts a well-formed state', () => {
    expect(() => assertSteelStateInvariants(ok)).not.toThrow();
  });

  it('refuses any state with no reason', () => {
    expect(() => assertSteelStateInvariants({ ...ok, reasons: [] })).toThrow(/without a reason/);
  });

  it('refuses EXPERIMENTAL without its basis', () => {
    expect(() => assertSteelStateInvariants({ ...ok, status: 'EXPERIMENTAL' }))
      .toThrow(/without its basis/);
  });

  it('refuses EXPERIMENTAL that discloses no assumption', () => {
    expect(() => assertSteelStateInvariants({
      ...ok, status: 'EXPERIMENTAL',
      experimental: {
        source: 'x', worstUtilization: 0.8, checksPerformed: ['flexure'],
        assumptions: [], promotionKey: 'k',
      },
    })).toThrow(/without a disclosed assumption/);
  });

  it('refuses EXPERIMENTAL with no route out of it', () => {
    expect(() => assertSteelStateInvariants({
      ...ok, status: 'EXPERIMENTAL',
      experimental: {
        source: 'x', worstUtilization: 0.8, checksPerformed: ['flexure'],
        assumptions: ['a'], promotionKey: '',
      },
    })).toThrow(/without a stated route out/);
  });

  it('refuses a utilization with no check behind it', () => {
    expect(() => assertSteelStateInvariants({
      ...ok, status: 'EXPERIMENTAL',
      experimental: {
        source: 'x', worstUtilization: 0.8, checksPerformed: [],
        assumptions: ['a'], promotionKey: 'k',
      },
    })).toThrow(/no check behind it/);
  });

  it('refuses a non-experimental state that carries an experimental basis', () => {
    expect(() => assertSteelStateInvariants({
      ...ok,
      experimental: {
        source: 'x', worstUtilization: 0.8, checksPerformed: ['flexure'],
        assumptions: ['a'], promotionKey: 'k',
      },
    })).toThrow(/cannot have earned/);
  });

  it('accepts a fully disclosed EXPERIMENTAL state', () => {
    expect(() => assertSteelStateInvariants({
      ...ok, status: 'EXPERIMENTAL',
      experimental: {
        source: 'cirsoc301.js.untested', worstUtilization: 0.84,
        checksPerformed: ['tension', 'flexure'],
        assumptions: ['steel.assume.unbracedLengthIsMemberLength'],
        promotionKey: 'steel.promotion.needsClauseMapAndBenchmark',
      },
    })).not.toThrow();
  });
});

// ─── inventory ───────────────────────────────────────────────────────

function model(materials: Array<{ id: number; name: string; fy?: number; gradeId?: string }>,
                elements: Array<{ id: number; materialId: number; vertical?: boolean }>): InventoryModel {
  const nodes = new Map<number, { x: number; y: number; z?: number }>();
  const els = new Map<number, any>();
  let n = 1;
  for (const e of elements) {
    const a = n++;
    const b = n++;
    nodes.set(a, { x: 0, y: 0, z: 0 });
    nodes.set(b, e.vertical ? { x: 0, y: 0, z: 4 } : { x: 6, y: 0, z: 0 });
    els.set(e.id, { id: e.id, nodeI: a, nodeJ: b, sectionId: 1, materialId: e.materialId });
  }
  return {
    nodes,
    elements: els,
    sections: new Map([[1, { id: 1, name: 'IPE 200', b: 0.1, h: 0.2 }]]),
    materials: new Map(materials.map((m) => [m.id, m])),
  };
}

const STEEL = { id: 1, name: 'Acero A572', fy: 345 };
const CONCRETE = { id: 2, name: 'H-25', fy: 25 };
const BLANK = { id: 3, name: 'Sin datos' };

describe('buildSteelInventory — a model with no metallic member says which kind of none', () => {
  it('distinguishes an empty model from one with no steel in it', () => {
    const none = buildSteelInventory(model([], []));
    expect(none.members).toEqual([]);
    expect(none.emptyReason).toBe('noElements');

    const concreteOnly = buildSteelInventory(model([CONCRETE], [{ id: 1, materialId: 2 }]));
    expect(concreteOnly.members).toEqual([]);
    expect(concreteOnly.emptyReason).toBe('noneMetallic');
    expect(concreteOnly.census.total).toBe(1);
    expect(concreteOnly.census.byFamily.concrete).toBe(1);
  });

  it('distinguishes "no steel" from "nothing has a strength to classify by"', () => {
    const blank = buildSteelInventory(model([BLANK], [{ id: 1, materialId: 3 }]));
    expect(blank.emptyReason).toBe('allUnclassified');
    expect(blank.census.byFamily.unknown).toBe(1);
  });
});

describe('buildSteelInventory — metallic members', () => {
  const inv = buildSteelInventory(
    model([STEEL, CONCRETE], [
      { id: 10, materialId: 1 },
      { id: 11, materialId: 1, vertical: true },
      { id: 12, materialId: 2 },
    ]),
  );

  it('lists the metallic members and only those', () => {
    expect(inv.members.map((m) => m.elementId)).toEqual([10, 11]);
    expect(inv.emptyReason).toBeNull();
  });

  it('counts every element in the census, metallic or not', () => {
    expect(inv.census.total).toBe(3);
    expect(inv.census.byFamily.steel).toBe(2);
    expect(inv.census.byFamily.concrete).toBe(1);
  });

  it('does not confuse a metallic column with a metallic beam', () => {
    expect(countByKind(inv)).toEqual({ beam: 1, column: 1, wall: 0 });
    expect(inv.members.find((m) => m.elementId === 11)!.memberKind).toBe('column');
  });

  it('reports a length it can defend', () => {
    expect(totalSteelLength(inv)).toBeCloseTo(6 + 4, 9);
  });

  it('sorts by element id, so the panel order is stable', () => {
    const shuffled = buildSteelInventory(model([STEEL], [
      { id: 30, materialId: 1 }, { id: 3, materialId: 1 }, { id: 12, materialId: 1 },
    ]));
    expect(shuffled.members.map((m) => m.elementId)).toEqual([3, 12, 30]);
  });

  it('never reports a metallic member as designed or verified', () => {
    for (const m of inv.members) {
      expect(steelCountsAsVerified(m.state.status)).toBe(false);
      expect(m.state.experimental).toBeUndefined();
      expect(m.state.reasons.length).toBeGreaterThan(0);
    }
  });
});

describe('buildSteelInventory — what it tells the user, and when', () => {
  const m = model([STEEL], [{ id: 1, materialId: 1 }]);

  it('says there is no metallic authority, because there is not', () => {
    const inv = buildSteelInventory(m, { hasDemands: true, authorityBound: false });
    expect(inv.notices).toContain('steel.notice.noAuthorityBound');
    expect(inv.members[0].state.status).toBe('NOT_DESIGNED');
    expect(inv.members[0].state.reasons[0].key).toBe('steel.reason.noMetallicAuthority');
  });

  it('says to solve first when there are no demands, which is the actionable reason', () => {
    const inv = buildSteelInventory(m, { hasDemands: false, authorityBound: false });
    expect(inv.members[0].state.status).toBe('DEMAND_UNAVAILABLE');
    expect(inv.notices).toContain('steel.notice.noDemands');
  });

  it('STILL reports not-designed once an authority is bound, rather than assuming success', () => {
    const inv = buildSteelInventory(m, { hasDemands: true, authorityBound: true });
    expect(inv.members[0].state.status).toBe('NOT_DESIGNED');
    expect(inv.members[0].state.reasons[0].key).toBe('steel.reason.designNotRun');
    expect(inv.notices).not.toContain('steel.notice.noAuthorityBound');
    // And binding one still cannot produce a pass.
    expect(steelCountsAsVerified(inv.members[0].state.status)).toBe(false);
  });

  it('flags that the family was guessed, and stops flagging once it is declared', () => {
    const guessed = buildSteelInventory(m, { hasDemands: true });
    expect(guessed.anyInferred).toBe(true);
    expect(guessed.notices).toContain('steel.family.inferredMetalNotFerrousChecked');

    const declared = buildSteelInventory(
      model([{ ...STEEL, gradeId: 'en-s355' }], [{ id: 1, materialId: 1 }]),
      { hasDemands: true, lookupGrade: () => 'steel' },
    );
    expect(declared.anyInferred).toBe(false);
    expect(declared.notices).not.toContain('steel.family.inferredMetalNotFerrousChecked');
  });

  it('returns its notices deduplicated and ordered', () => {
    const many = buildSteelInventory(model([STEEL], [
      { id: 1, materialId: 1 }, { id: 2, materialId: 1 }, { id: 3, materialId: 1 },
    ]), { hasDemands: true });
    expect(new Set(many.notices).size).toBe(many.notices.length);
    expect(many.notices).toEqual([...many.notices].sort());
  });
});
