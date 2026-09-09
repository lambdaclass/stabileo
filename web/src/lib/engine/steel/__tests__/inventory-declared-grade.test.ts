/**
 * The steel inventory classifies from the declared grade, not from the size of `fy`.
 *
 * ── What this pins ────────────────────────────────────────────────
 *
 * H1 built `catalogueGradeFamily` and wired it into the design path
 * (`design-run.svelte.ts`). `steel.svelte.ts` was the other call site and kept
 * `lookupGrade: undefined`, under a comment saying PR #132's catalogue "is not on this
 * branch" — while `structural-grades.ts` and `non-metal-grades.ts` were both sitting in it.
 *
 * Without a lookup, `materialFamilyOf` infers the family from the MAGNITUDE of `fy`. The
 * app says what that costs in the user's own words, in `conn.gap.aluminium.missing`:
 *
 *   > materialFamilyOf cannot tell aluminium from steel by the magnitude of fy until the
 *   > material declares its grade.
 *
 * 5052-H32 has fy = 195 MPa. That is comfortably into the range the inference reads as
 * steel, so an aluminium member was counted in an inventory of steel — and the inference
 * is right that it is metal and wrong about which metal.
 *
 * Both directions are asserted below. Testing only the fixed behaviour would leave the
 * lookup removable without a red test, which is the whole failure this file answers to.
 */

import { describe, it, expect } from 'vitest';
import { buildSteelInventory, type InventoryModel } from '../steel-inventory';
import { catalogueGradeFamily } from '../grade-family';

/** 5052-H32: aluminium by declaration, steel by the magnitude of its fy. */
const ALUMINIUM = { id: 1, name: 'Aluminio 5052', gradeId: 'alu-5052-h32', fy: 195 };

function oneMemberOf(material: { id: number; name: string; gradeId?: string; fy?: number }): InventoryModel {
  return {
    nodes: new Map<number, any>([[1, { x: 0, y: 0, z: 0 }], [2, { x: 6, y: 0, z: 0 }]]),
    elements: new Map<number, any>([[1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: material.id }]]),
    sections: new Map<number, any>([[1, { id: 1, name: 'IPE 200', b: 0.1, h: 0.2 }]]),
    materials: new Map<number, any>([[material.id, material]]),
  };
}

describe('an aluminium member is not steel, and the inventory says so', () => {
  it('classifies it as aluminium when the grade catalogue answers', () => {
    const inv = buildSteelInventory(oneMemberOf(ALUMINIUM), {
      lookupGrade: catalogueGradeFamily,
    });

    expect(inv.census.byFamily.aluminium).toBe(1);
    expect(inv.census.byFamily.steel).toBe(0);
  });

  it('keeps it out of the member list, which is a list of steel', () => {
    const inv = buildSteelInventory(oneMemberOf(ALUMINIUM), {
      lookupGrade: catalogueGradeFamily,
    });

    expect(inv.members).toHaveLength(0);
    // Counted, not dropped: the census still sees every element in the model.
    expect(inv.census.total).toBe(1);
  });

  it('counts it as STEEL without the lookup — the behaviour being replaced', () => {
    // Not a wish-list assertion. If this ever goes green with `lookupGrade: undefined`
    // removed from the equation, the inference changed and the fix above is moot.
    const inferred = buildSteelInventory(oneMemberOf(ALUMINIUM), { lookupGrade: undefined });

    expect(inferred.census.byFamily.steel).toBe(1);
    expect(inferred.census.byFamily.aluminium).toBe(0);
  });

  it('reports the declared reading as declared, not as an inference', () => {
    // `anyInferred` drives the caveat the panel shows. A verdict read from the catalogue
    // must not raise it, or a correct classification would carry a warning about guessing.
    const declared = buildSteelInventory(oneMemberOf(ALUMINIUM), {
      lookupGrade: catalogueGradeFamily,
    });
    const guessed = buildSteelInventory(oneMemberOf(ALUMINIUM), { lookupGrade: undefined });

    expect(declared.anyInferred).toBe(false);
    expect(guessed.anyInferred).toBe(true);
  });
});
