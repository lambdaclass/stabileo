/**
 * The declared grade, resolved against the catalogue that is now on this branch.
 *
 * `steel-domain.test.ts` already pins the CONTRACT of `materialFamilyOf` with a stub lookup:
 * a declaration wins, an unknown id falls back. This file pins the real lookup against real
 * ids, which is the part a stub cannot check — that the ids the material picker writes are
 * the ids this resolver answers for, and that it answers with the right family.
 */

import { describe, it, expect } from 'vitest';
import { catalogueGradeFamily } from '../grade-family';
import { isInferred, materialFamilyOf } from '../material-family';
import { buildSteelInventory, type InventoryModel } from '../steel-inventory';
import { ALL_GRADES } from '../../../data/structural-grades';
import { CONCRETE, TIMBER } from '../../../data/non-metal-grades';

describe('catalogueGradeFamily', () => {
  it('answers for every grade in the catalogue, and never with unknown', () => {
    // The value of this assertion is its breadth: a family added to the catalogue without a
    // case here fails the exhaustive switch at compile time and this at run time.
    for (const g of ALL_GRADES) {
      const family = catalogueGradeFamily(g.id);
      expect(family, g.id).not.toBeNull();
      expect(family, g.id).not.toBe('unknown');
    }
    for (const c of CONCRETE) expect(catalogueGradeFamily(c.id), c.id).toBe('concrete');
    for (const w of TIMBER) expect(catalogueGradeFamily(w.id), w.id).toBe('timber');
  });

  it('reads the ferrous grades as steel and the aluminium ones as aluminium', () => {
    expect(catalogueGradeFamily('iram-f24')).toBe('steel');       // hot-rolled
    expect(catalogueGradeFamily('en-s355')).toBe('steel');         // hot-rolled
    expect(catalogueGradeFamily('astm-a653-50')).toBe('steel');    // cold-formed
    expect(catalogueGradeFamily('ss-1.4301')).toBe('steel');       // stainless — ferrous
    expect(catalogueGradeFamily('alu-6082-t6')).toBe('aluminium');
  });

  it('returns null for an id the catalogue does not know, rather than a family', () => {
    // A project saved against a withdrawn grade has to fall back to the inference, not be
    // reported as unclassifiable.
    expect(catalogueGradeFamily('withdrawn-grade-1957')).toBeNull();
    expect(catalogueGradeFamily('')).toBeNull();
  });

  it('turns the metallic verdict from a guess into a reading', () => {
    // Same material, twice: without the lookup the family rests on the magnitude of fy and
    // says so; with it, the verdict is the project's own declaration and carries no caveat.
    const material = { fy: 240, gradeId: 'iram-f24' };
    const guessed = materialFamilyOf(material);
    expect(guessed.basis).toBe('inferredFromFy');
    expect(isInferred(guessed)).toBe(true);

    const read = materialFamilyOf(material, catalogueGradeFamily);
    expect(read.family).toBe('steel');
    expect(read.basis).toBe('declaredGrade');
    expect(read.caveatKey).toBeUndefined();
    expect(isInferred(read)).toBe(false);
  });

  it('separates aluminium from steel, which the magnitude of fy cannot', () => {
    // 6082-T6's 0.2 % proof stress is 250 MPa: above the concrete ceiling, so the inference
    // calls it steel and discloses that it cannot tell which metal. The declaration can.
    const alu = { fy: 250, gradeId: 'alu-6082-t6' };
    expect(materialFamilyOf(alu).family).toBe('steel');
    expect(materialFamilyOf(alu).caveatKey).toBe('steel.family.inferredMetalNotFerrousChecked');
    expect(materialFamilyOf(alu, catalogueGradeFamily).family).toBe('aluminium');
  });

  it('keeps a declared concrete out of the metallic surface', () => {
    // The picker writes a gradeId for concrete too. Answering from the catalogue means an
    // H-25 is concrete because it is an H-25, not because 25 is a small number.
    const v = materialFamilyOf({ fy: 25, gradeId: 'cirsoc-h25' }, catalogueGradeFamily);
    expect(v.family).toBe('concrete');
    expect(v.basis).toBe('declaredGrade');
  });

  it('classifies a timber class as timber, which no strength threshold would', () => {
    // D60's characteristic bending strength is 60 MPa — under the concrete ceiling, so the
    // inference would file it as concrete and nothing downstream would notice.
    expect(materialFamilyOf({ fy: 60 }).family).toBe('concrete');
    expect(materialFamilyOf({ fy: 60, gradeId: 'en338-d60' }, catalogueGradeFamily).family)
      .toBe('timber');
  });
});

// ─── what the panel shows because of it ──────────────────────────────

/** One steel member, one concrete member, on the smallest model that carries both. */
function twoMemberModel(
  materials: Array<{ id: number; name: string; fy?: number; gradeId?: string }>,
): InventoryModel {
  return {
    nodes: new Map([
      [1, { x: 0, y: 0, z: 0 }], [2, { x: 6, y: 0, z: 0 }],
      [3, { x: 0, y: 0, z: 0 }], [4, { x: 0, y: 0, z: 4 }],
    ]),
    elements: new Map([
      [10, { id: 10, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: materials[0].id }],
      [11, { id: 11, nodeI: 3, nodeJ: 4, sectionId: 1, materialId: materials[0].id }],
    ]),
    sections: new Map([[1, { id: 1, name: 'IPE 200', b: 0.1, h: 0.2 }]]),
    materials: new Map(materials.map((m) => [m.id, m])),
  };
}

describe('the inventory with the catalogue behind it', () => {
  it('stops warning about a deduced family once the project declares one', () => {
    const declared = buildSteelInventory(
      twoMemberModel([{ id: 1, name: 'F-24', fy: 240, gradeId: 'iram-f24' }]),
      { lookupGrade: catalogueGradeFamily },
    );
    expect(declared.members).toHaveLength(2);
    expect(declared.anyInferred).toBe(false);
    for (const m of declared.members) expect(m.family.basis).toBe('declaredGrade');
    // The warning is a consequence of the basis, so it has to go with it.
    expect(declared.notices).not.toContain('steel.panel.inferredWarning');
  });

  it('keeps warning about a model saved before grades were recorded', () => {
    // Every project older than the material picker's grade field is this case, and the
    // fallback is what keeps those models listed at all.
    const legacy = buildSteelInventory(
      twoMemberModel([{ id: 1, name: 'Acero A572', fy: 345 }]),
      { lookupGrade: catalogueGradeFamily },
    );
    expect(legacy.members).toHaveLength(2);
    expect(legacy.anyInferred).toBe(true);
    for (const m of legacy.members) expect(m.family.basis).toBe('inferredFromFy');
  });

  it('still refuses to call any of it verified', () => {
    // The declaration says what the material IS. It says nothing about whether anything was
    // checked, and no amount of catalogue data may change that.
    const inv = buildSteelInventory(
      twoMemberModel([{ id: 1, name: 'F-36', fy: 360, gradeId: 'iram-f36' }]),
      { lookupGrade: catalogueGradeFamily, hasDemands: true, authorityBound: true },
    );
    for (const m of inv.members) {
      expect(m.state.status).not.toBe('VERIFIED');
      expect(['NOT_DESIGNED', 'EXPERIMENTAL', 'DEMAND_UNAVAILABLE', 'NOT_APPLICABLE'])
        .toContain(m.state.status);
    }
  });

  it('lists an aluminium member as aluminium instead of filing it under steel', () => {
    // The metallic surface has to be able to say "this is aluminium and nothing here covers
    // it" rather than showing it beside the steel and implying the same treatment.
    const inv = buildSteelInventory(
      twoMemberModel([{ id: 1, name: '6082-T6', fy: 250, gradeId: 'alu-6082-t6' }]),
      { lookupGrade: catalogueGradeFamily },
    );
    expect(inv.census.byFamily.aluminium).toBe(2);
    expect(inv.census.byFamily.steel).toBe(0);
    expect(inv.members).toEqual([]);
    // Not `noneMetallic`: aluminium is metal, and saying otherwise about a model built out
    // of it would be false. What is true is that this surface does not cover it.
    expect(inv.emptyReason).toBe('nonFerrousOnly');
    expect(inv.notices).toContain('steel.notice.nonFerrousNotCovered');
  });
});

describe('a mixed model does not hide the members it cannot list', () => {
  it('names the non-ferrous members even when there is steel to show', () => {
    const inv = buildSteelInventory({
      nodes: new Map([
        [1, { x: 0, y: 0, z: 0 }], [2, { x: 6, y: 0, z: 0 }],
        [3, { x: 0, y: 0, z: 0 }], [4, { x: 0, y: 0, z: 4 }],
      ]),
      elements: new Map([
        [10, { id: 10, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }],
        [11, { id: 11, nodeI: 3, nodeJ: 4, sectionId: 1, materialId: 2 }],
      ]),
      sections: new Map([[1, { id: 1, name: 'IPE 200', b: 0.1, h: 0.2 }]]),
      materials: new Map([
        [1, { id: 1, name: 'F-24', fy: 240, gradeId: 'iram-f24' }],
        [2, { id: 2, name: '6082-T6', fy: 250, gradeId: 'alu-6082-t6' }],
      ]),
    }, { lookupGrade: catalogueGradeFamily });

    expect(inv.members.map((m) => m.elementId)).toEqual([10]);
    expect(inv.emptyReason).toBeNull();
    // The row is missing from the table on purpose; the notice is what keeps that from being
    // a silent omission.
    expect(inv.notices).toContain('steel.notice.nonFerrousNotCovered');
  });
});
