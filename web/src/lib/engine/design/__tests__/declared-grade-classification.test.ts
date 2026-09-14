/**
 * Timber C24 is not 24 MPa concrete.
 *
 * ── The defect ─────────────────────────────────────────────────────
 *
 * `materialFamilyOf` classifies by a declared grade when it has one and a lookup to resolve
 * it — `if (material.gradeId && lookupGrade)` — and otherwise infers from the MAGNITUDE of
 * `fy`, reading `fy <= 80 MPa` as concrete.
 *
 * The gradeId always arrived: `ContextModelData.materials` is handed the live
 * `modelStore.materials`, so real `Material` objects flow through. What never arrived was the
 * lookup. No production call site supplied one, so the declared branch could not run and every
 * material in the app was classified by magnitude.
 *
 * Timber C24 has a characteristic bending strength of 24 MPa. It was classified as concrete
 * and admitted to the reinforced-concrete design pipeline, where 24 MPa reads as an ordinary
 * f'c. The grade was in the catalogue the whole time — `en338-c24`, family `timber` — and
 * nothing consulted it.
 *
 * ── What these assert ──────────────────────────────────────────────
 *
 * Against the REAL catalogue, not an injected stub. `steel-excluded-from-rc.test.ts` already
 * covers the override with a hand-written lookup, which proves the mechanism; what was missing
 * is that the shipped catalogue gives the right answers and that the production wiring uses it.
 */

import { describe, it, expect } from 'vitest';
import { materialFamilyOf } from '../../steel/material-family';
import { catalogueGradeFamily } from '../../steel/grade-family';
import { buildAllMemberContexts, type ContextModelData } from '../member-context';

/** Real ids from the shipped catalogues, not invented ones. */
const GRADES = {
  concreteAr: 'cirsoc-h25',   // CIRSOC 201, f'c 25
  concreteUs: 'aci-3000',
  timberC24: 'en338-c24',     // EN 338 C24 — 24 MPa, the case that started this
  steelAr: 'iram-f24',        // IRAM F-24 — fy 240
  aluminium: 'alu-5052-h32',  // EN AW-5052 — fy 195
} as const;

const family = (gradeId: string, fy: number) =>
  materialFamilyOf({ gradeId, fy }, catalogueGradeFamily);

describe('the shipped catalogue answers each family correctly', () => {
  it('declared concrete is concrete', () => {
    for (const id of [GRADES.concreteAr, GRADES.concreteUs]) {
      const v = family(id, 25);
      expect(v.family, id).toBe('concrete');
      expect(v.basis, id).toBe('declaredGrade');
    }
  });

  it('declared timber is timber, at a strength the inference would call concrete', () => {
    // 24 MPa is below the 80 MPa ceiling, so the inference says concrete. The declaration
    // must win — that is the entire point of PR #132's field.
    const v = family(GRADES.timberC24, 24);
    expect(v.family).toBe('timber');
    expect(v.basis).toBe('declaredGrade');
  });

  it('declared steel is steel', () => {
    const v = family(GRADES.steelAr, 240);
    expect(v.family).toBe('steel');
    expect(v.basis).toBe('declaredGrade');
  });

  it('declared aluminium is aluminium, and not merely "metal"', () => {
    // The inference cannot tell aluminium from steel: both are above the fy ceiling and it
    // reports steel for either. So this one was already excluded from concrete, and excluded
    // for the wrong reason — which matters, because the metallic surface lists it by family.
    const v = family(GRADES.aluminium, 195);
    expect(v.family).toBe('aluminium');
    expect(v.basis).toBe('declaredGrade');
  });
});

describe('the documented fallback survives', () => {
  it('no gradeId keeps the magnitude inference', () => {
    const v = materialFamilyOf({ fy: 25 }, catalogueGradeFamily);
    expect(v.family).toBe('concrete');
    // Not a declaration — and the verdict says so, which is what lets a surface warn about it.
    expect(v.basis).not.toBe('declaredGrade');
  });

  it('an unknown gradeId falls back rather than reporting unknown', () => {
    // A stored project can name a grade that has since been withdrawn. Falling back is better
    // than calling a material with a plain strength unclassifiable.
    const v = materialFamilyOf({ gradeId: 'withdrawn-in-2019', fy: 30 }, catalogueGradeFamily);
    expect(v.family).toBe('concrete');
    expect(v.basis).not.toBe('declaredGrade');
  });

  it('and the lookup itself returns null for an id it cannot answer', () => {
    // The contract: null means "this catalogue cannot answer", not "unknown family".
    expect(catalogueGradeFamily('withdrawn-in-2019')).toBeNull();
    expect(catalogueGradeFamily(GRADES.timberC24)).toBe('timber');
  });
});

/**
 * The pipeline boundary.
 *
 * `buildAllMemberContexts` keeps only `materialFamily === 'concrete'`, so this is where a
 * misclassification becomes a design. One member per family, all with a low `fy` so that the
 * inference would admit every one of them.
 */
describe('the concrete pipeline admits concrete and nothing else', () => {
  function model(gradeId: string, fy: number): ContextModelData {
    return {
      nodes: new Map([
        [1, { id: 1, x: 0, y: 0, z: 0 }],
        [2, { id: 2, x: 5, y: 0, z: 0 }],
      ]),
      elements: new Map([
        [1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, type: 'frame' }],
      ]),
      sections: new Map([[1, { id: 1, name: 'V 20x40', b: 0.2, h: 0.4 }]]),
      materials: new Map([[1, { id: 1, name: 'M', fy, gradeId }]]),
      supports: new Map([[1, { nodeId: 1, type: 'fixed' }]]),
    };
  }

  const admitted = (gradeId: string, fy: number) =>
    [...buildAllMemberContexts(model(gradeId, fy), { lookupGrade: catalogueGradeFamily }).keys()];

  it('admits a declared concrete member', () => {
    expect(admitted(GRADES.concreteAr, 25)).toEqual([1]);
  });

  it('refuses timber C24 — the case this was written for', () => {
    // Same fy as the concrete above. Only the declaration differs.
    expect(admitted(GRADES.timberC24, 24)).toEqual([]);
  });

  it('refuses a declared steel member even at a concrete-looking strength', () => {
    expect(admitted(GRADES.steelAr, 30)).toEqual([]);
  });

  it('refuses a declared aluminium member even at a concrete-looking strength', () => {
    expect(admitted(GRADES.aluminium, 30)).toEqual([]);
  });

  it('without the lookup, every one of them is admitted — the defect, pinned', () => {
    // The state before this change, kept as a test so the regression is visible rather than
    // remembered. Remove the lookup and timber walks into the concrete pipeline.
    const noLookup = (gradeId: string, fy: number) =>
      [...buildAllMemberContexts(model(gradeId, fy), {}).keys()];
    expect(noLookup(GRADES.timberC24, 24)).toEqual([1]);
    expect(noLookup(GRADES.concreteAr, 25)).toEqual([1]);
  });
});

/**
 * The H1/M1 boundary.
 *
 * Classification moves from inference to declaration, so members can change pipeline in BOTH
 * directions. These are the two crossings, stated as tests so neither branch discovers them by
 * surprise.
 */
describe('the boundary between the concrete pipeline and the metallic inventory', () => {
  it('a low-fy member declaring steel LEAVES the concrete side', () => {
    // Inference: concrete (fy 30 ≤ 80). Declaration: steel. It leaves.
    expect(materialFamilyOf({ gradeId: GRADES.steelAr, fy: 30 }, catalogueGradeFamily).family)
      .toBe('steel');
    expect(materialFamilyOf({ fy: 30 }, catalogueGradeFamily).family).toBe('concrete');
  });

  it('a high-fy member declaring concrete ENTERS the concrete side', () => {
    // Inference: steel (fy 100 > 80). Declaration: concrete. It enters.
    expect(materialFamilyOf({ gradeId: GRADES.concreteAr, fy: 100 }, catalogueGradeFamily).family)
      .toBe('concrete');
    expect(materialFamilyOf({ fy: 100 }, catalogueGradeFamily).family).toBe('steel');
  });

  it('timber and masonry belong to NEITHER pipeline', () => {
    // Not a concrete member and not a metallic one. The metallic inventory filters on
    // `isSteel`, so timber does not appear there either — it is simply not designed, which is
    // the honest outcome for a material this app has no authority for.
    const v = materialFamilyOf({ gradeId: GRADES.timberC24, fy: 24 }, catalogueGradeFamily);
    expect(v.family).toBe('timber');
    expect(['concrete', 'steel']).not.toContain(v.family);
  });
});
