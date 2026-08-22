/**
 * Per-member assumptions: the provenance, and the list that went stale.
 *
 * ── The property that matters ──────────────────────────────────────
 *
 * An assumption a user chose and an assumption the app made on their behalf are different risks,
 * and only the second is one they did not take knowingly. So every entry carries a source, and the
 * assertions below are mostly about that distinction holding — plus the one correctness check that
 * this exercise turned up: **the declared list must describe what the app actually does.**
 */

import { describe, it, expect } from 'vitest';
import { assumptionRows, assumptionSourceKey } from '../workflow-assumptions';
import { buildSteelInventory, type InventoryModel } from '../steel-inventory';
import { catalogueGradeFamily } from '../grade-family';
import { CIRSOC301_JS_ASSUMPTIONS } from '../../design/adapters/cirsoc301-capabilities';
import { missingSteelInputs } from '../../verification-service';
import es from '../../../i18n/locales/steel/es';
import en from '../../../i18n/locales/steel/en';
import pt from '../../../i18n/locales/steel/pt';

/** Two steel members of different lengths, so `lbM` has to vary. */
function inventory() {
  const m: InventoryModel = {
    nodes: new Map([
      [1, { x: 0, y: 0, z: 0 }], [2, { x: 6, y: 0, z: 0 }],
      [3, { x: 0, y: 0, z: 0 }], [4, { x: 0, y: 0, z: 4 }],
    ]),
    elements: new Map([
      [10, { id: 10, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }],
      [20, { id: 20, nodeI: 3, nodeJ: 4, sectionId: 1, materialId: 1 }],
    ]) as never,
    sections: new Map([[1, { id: 1, name: 'IPE 200', b: 0.1, h: 0.2 }]]) as never,
    materials: new Map([[1, { id: 1, name: 'F-24', fy: 235, gradeId: 'iram-f24' }]]),
  };
  return buildSteelInventory(m, {
    hasDemands: true, authorityBound: false, lookupGrade: catalogueGradeFamily,
  });
}

describe('Lb is reported, never invented', () => {
  it('gives each member its own length, to the millimetre', () => {
    /*
     * The value the checker actually receives. Two members of 6 m and 4 m must report 6 and 4 — a
     * single shared number would mean the row was restating the rule rather than reading the model.
     */
    const rows = assumptionRows(inventory());
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.elementId === 10)!.lbM).toBeCloseTo(6, 9);
    expect(rows.find((r) => r.elementId === 20)!.lbM).toBeCloseTo(4, 9);
  });

  it('and never a fraction of it', () => {
    // `L/2`, `L/n`, or any fraction would be trading a declared conservative assumption for an
    // undeclared and possibly unsafe one. The row's `lbM` must equal the member length exactly.
    for (const row of assumptionRows(inventory())) {
      expect(row.lbM).toBeGreaterThan(0);
      expect([6, 4]).toContain(Math.round(row.lbM));
    }
  });

  it('names the app as the source, not the user or a generator', () => {
    for (const row of assumptionRows(inventory())) {
      expect(row.lbSource).toBe('assumed');
    }
  });
});

describe('bracing: zero, and not because there is none', () => {
  it('records no bracing for any member', () => {
    for (const row of assumptionRows(inventory())) expect(row.bracingRecorded).toBe(0);
  });

  it('and the reason is a missing FIELD, listed as not inferable', () => {
    /*
     * The distinction between `assumed` and `notInferable`. A better rule could improve an assumed
     * value; nothing improves a field that does not exist. The shed generator DOES place explicit
     * braces — `emit.ts` throws the relationship away, since the role never reaches the stored
     * element and the section is named after its profile.
     */
    const [row] = assumptionRows(inventory());
    const keys = row.notInferable.map((a) => a.key);
    expect(keys).toContain('steel.assume.notInferable.bracingPoints');
    for (const a of row.notInferable) expect(a.source).toBe('notInferable');
  });

  it('and every not-inferable item says what would fix it', () => {
    // An absence with no route out reads as a permanent property of the world. Most are not.
    const [row] = assumptionRows(inventory());
    for (const a of row.notInferable) expect(a.routeOutKey).toBeTruthy();
  });
});

describe('the declared assumptions describe what the app ACTUALLY does', () => {
  it('no longer claims the thicknesses are inferred, because they are required', () => {
    /*
     * The correctness finding. The list carried `webAndFlangeThicknessInferred` and
     * `ultimateStrengthInferred` from when the call site filled them with guesses. It does not any
     * more: `missingSteelInputs` reports them as gaps and the element is skipped.
     *
     * Asserted from BOTH sides — the key is gone from the list, and the engine really does treat the
     * absence as a gap — so the list cannot drift back without one of the two failing.
     */
    expect(CIRSOC301_JS_ASSUMPTIONS).not.toContain('steel.assume.webAndFlangeThicknessInferred');
    expect(CIRSOC301_JS_ASSUMPTIONS).not.toContain('steel.assume.ultimateStrengthInferred');

    const gaps = missingSteelInputs(
      { a: 0.01, iz: 1e-5, iy: 2e-5, h: 0.2, b: 0.1 },   // no tw, no tf
      { fy: 235, e: 200_000 },                            // no fu
    );
    expect(gaps).toContain('webThickness');
    expect(gaps).toContain('flangeThickness');
    expect(gaps).toContain('ultimateStrength');
  });

  it('and no longer claims there are no tests, because there are', () => {
    // 18 benchmark cases in `cirsoc301-benchmarks.test.ts`. A stale warning teaches a reader to
    // discount the rest, and the unbraced length is the one that must be believed.
    expect(CIRSOC301_JS_ASSUMPTIONS).not.toContain('steel.assume.noTests');
  });

  it('still claims the ones that are still true', () => {
    for (const key of [
      'steel.assume.unbracedLengthIsMemberLength',
      'steel.assume.noSectionClassification',
      'steel.assume.netAreaEqualsGross',
      'steel.assume.noPlasticMomentCap',
      'steel.assume.noTorsionalBuckling',
      'steel.assume.momentGradientIsUnity',
      'steel.assume.torsionalConstantZeroWhenAbsent',
    ]) {
      expect(CIRSOC301_JS_ASSUMPTIONS, key).toContain(key);
    }
  });

  it('and every applicable assumption on a row is one the adapter declares', () => {
    // The row and the adapter must not drift apart: two lists of assumptions is one list too many.
    const [row] = assumptionRows(inventory());
    for (const a of row.applicable) {
      expect(CIRSOC301_JS_ASSUMPTIONS, a.key).toContain(a.key);
    }
    expect(row.applicable).toHaveLength(CIRSOC301_JS_ASSUMPTIONS.length);
  });
});

describe('what blocks validation is not data', () => {
  it('lists the clause map, the unbraced length and the signature', () => {
    const [row] = assumptionRows(inventory());
    expect(row.blockedBy).toContain('steel.workflow.blocker.clauseRefs');
    expect(row.blockedBy).toContain('steel.workflow.blocker.unbracedLength');
    expect(row.blockedBy).toContain('steel.workflow.blocker.signature');
  });

  it('and does not list the two that were addressed', () => {
    // Tests and inferred properties moved. A blocker list that never shrinks is a list nobody reads.
    const [row] = assumptionRows(inventory());
    expect(row.blockedBy).not.toContain('steel.workflow.blocker.tests');
    expect(row.blockedBy).not.toContain('steel.workflow.blocker.inferredProperties');
  });
});

describe('every key resolves in the three offered languages', () => {
  const dicts = { es, en, pt } as Record<string, Record<string, string>>;

  it('resolves every source', () => {
    for (const [name, dict] of Object.entries(dicts)) {
      for (const s of ['user', 'generator', 'assumed', 'notInferable'] as const) {
        expect(dict[assumptionSourceKey(s)], `${name}: ${s}`).toBeTruthy();
      }
    }
  });

  it('resolves every assumption, its route out, and every not-inferable item', () => {
    const [row] = assumptionRows(inventory());
    const keys = [
      ...row.applicable.flatMap((a) => [a.key, a.routeOutKey]),
      ...row.notInferable.flatMap((a) => [a.key, a.routeOutKey]),
      ...row.blockedBy,
    ].filter((k): k is string => !!k);
    for (const [name, dict] of Object.entries(dicts)) {
      for (const k of keys) expect(dict[k], `${name}: ${k}`).toBeTruthy();
    }
  });

  it('and the results section is a set of sentences, not labels', () => {
    // Stage 7 has no numbers to show, so prose is all it has. A three-word answer would be worse
    // than silence.
    const keys = ['noCertifiable', 'capabilities', 'tests', 'missingData', 'human', 'ae', 'cap'];
    for (const [name, dict] of Object.entries(dicts)) {
      for (const k of keys) {
        const v = dict[`steel.workflow.results.${k}`];
        expect(v, `${name}: results.${k}`).toBeTruthy();
        expect(v.length, `${name}: results.${k} is a sentence`).toBeGreaterThan(60);
      }
    }
  });

  it('and the two departures are named in every language', () => {
    for (const [name, dict] of Object.entries(dicts)) {
      expect(dict['steel.workflow.results.ae'], name).toMatch(/D\.2\.2/);
      expect(dict['steel.workflow.results.cap'], name).toMatch(/F\.2\.1/);
      expect(dict['steel.workflow.results.cap'], name).toMatch(/1,5/);
    }
  });
});
