/**
 * The one limitation text M1 made false, and the patch that is waiting to be applied.
 *
 * ── The situation ──────────────────────────────────────────────────
 *
 * `conn.gap.aluminium.scope` says the metallic inventory lists aluminium members. Wiring the
 * grade catalogue in `6d274e37` ended that: the inventory admits rows by `isSteel`, so an
 * aluminium member is not listed — it is NAMED, in a notice, which is the honest version and the
 * one the sentence does not describe.
 *
 * The string lives in the three main dictionaries, which H1 is editing right now
 * (`design.floor.state.*`). So the fix waits, and what M1 can do meanwhile is make sure the
 * waiting is visible and the patch is ready: the behaviour is pinned, the proposed text is
 * checked against the properties it has to have, and the current shipped state is asserted so
 * that applying the patch is a single inversion in one place.
 *
 * Patch, impact and the apply procedure: `docs/handoffs/patches/conn-gap-aluminium-scope.md`.
 */

import { describe, it, expect } from 'vitest';
import { buildSteelInventory, type InventoryModel } from '../steel-inventory';
import { catalogueGradeFamily } from '../grade-family';
import esMain from '../../../i18n/locales/es';
import enMain from '../../../i18n/locales/en';
import ptMain from '../../../i18n/locales/pt';

const KEY = 'conn.gap.aluminium.scope';

/**
 * The proposed replacement, in the three offered languages.
 *
 * Kept here as data so the patch's CONTENT is under test before the patch is applied. It is the
 * same text as §3 of the patch document; if the two drift, the document is the one to fix,
 * because this is what the tests check.
 */
const PROPOSED: Record<'es' | 'en' | 'pt', string> = {
  es: 'Modelos con miembros de aluminio: sus nudos quedan fuera de esta lista, y el inventario metálico tampoco los lista — los nombra en un aviso, porque las tablas de bulones y electrodos son de acero.',
  en: 'Models with aluminium members: their joints fall outside this list, and the metallic inventory does not list them either — it names them in a notice, because the bolt and electrode tables are steel’s.',
  pt: 'Modelos com membros de alumínio: seus nós ficam fora desta lista, e o inventário metálico também não os lista — ele os nomeia em um aviso, porque as tabelas de parafusos e eletrodos são de aço.',
};

// ─── 1. The behaviour that makes the shipped sentence false ──────────

describe('the behaviour the sentence describes', () => {
  function aluminiumOnly(): InventoryModel {
    return {
      nodes: new Map([
        [1, { x: 0, y: 0, z: 0 }], [2, { x: 6, y: 0, z: 0 }],
      ]),
      elements: new Map([
        [10, { id: 10, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }],
      ]),
      sections: new Map([[1, { id: 1, name: 'IPE 200', b: 0.1, h: 0.2 }]]),
      materials: new Map([[1, { id: 1, name: '6082-T6', fy: 250, gradeId: 'alu-6082-t6' }]]),
    };
  }

  it('does not list an aluminium member — it names it', () => {
    const inv = buildSteelInventory(aluminiumOnly(), { lookupGrade: catalogueGradeFamily });
    expect(inv.members).toEqual([]);
    expect(inv.census.byFamily.aluminium).toBe(1);
    // The two things the sentence would have to mention to be true today.
    expect(inv.emptyReason).toBe('nonFerrousOnly');
    expect(inv.notices).toContain('steel.notice.nonFerrousNotCovered');
  });

  it('listed it before the grade catalogue was wired, which is why the sentence was written', () => {
    // Without the lookup the inference reads 250 MPa as metal and cannot tell which, so the
    // member IS listed — as steel. That was true when PR21 wrote the limitation.
    const inv = buildSteelInventory(aluminiumOnly());
    expect(inv.members).toHaveLength(1);
    expect(inv.members[0].family.family).toBe('steel');
  });
});

// ─── 2. The proposed text, checked before it is applied ──────────────

describe('the proposed replacement', () => {
  it('exists in all three offered languages, and says something different from the current text', () => {
    for (const lang of ['es', 'en', 'pt'] as const) {
      expect(PROPOSED[lang].trim().length, lang).toBeGreaterThan(60);
    }
    const dicts = { es: esMain, en: enMain, pt: ptMain } as unknown as Record<string, Record<string, string>>;
    for (const lang of ['es', 'en', 'pt'] as const) {
      expect(PROPOSED[lang], `${lang} is not a no-op`).not.toBe(dicts[lang][KEY]);
    }
  });

  it('states that the inventory does NOT list them, which is the correction', () => {
    // The clause that was false is the one about the inventory, so each language has to carry a
    // negation attached to it rather than dropping the subject.
    expect(PROPOSED.es).toMatch(/inventario metálico tampoco los lista/i);
    expect(PROPOSED.en).toMatch(/inventory does not list them/i);
    expect(PROPOSED.pt).toMatch(/inventário metálico também não os lista/i);
  });

  it('says what happens INSTEAD, so the reader is not left with an absence', () => {
    // The notice is the behaviour that replaced the listing. A correction that only removed the
    // false clause would leave the panel silent about where those members went.
    expect(PROPOSED.es).toMatch(/aviso/i);
    expect(PROPOSED.en).toMatch(/notice/i);
    expect(PROPOSED.pt).toMatch(/aviso/i);
  });

  it('keeps the warning that protects the user', () => {
    // The half of the sentence that was always right: these tables are steel's, so they would be
    // wrong for aluminium even if the joint appeared.
    expect(PROPOSED.es).toMatch(/bulones y electrodos son de acero/i);
    expect(PROPOSED.en).toMatch(/bolt and electrode tables are steel/i);
    expect(PROPOSED.pt).toMatch(/parafusos e eletrodos são de aço/i);
  });

  it('survives the never-verified rule', () => {
    // Same rule `steel-never-verified.test.ts` applies to the steel namespace: a word that would
    // be a claim may only appear inside a denial. The proposed text uses none of them at all,
    // which is the simplest way to pass.
    const CLAIMS = [
      /\bverified\b/i, /\bapproved\b/i, /\bcertified\b/i,
      /\bverificad[oa]s?\b/i, /\baprobad[oa]s?\b/i, /\bcertificad[oa]s?\b/i,
      /\baprovad[oa]s?\b/i,
    ];
    for (const lang of ['es', 'en', 'pt'] as const) {
      for (const re of CLAIMS) expect(re.test(PROPOSED[lang]), `${lang} ${re}`).toBe(false);
    }
  });
});

// ─── 3. The shipped state — INVERT THIS WHEN THE PATCH IS APPLIED ────

describe('the shipped dictionaries, until the patch lands', () => {
  /**
   * ⚠ THE ONE PLACE TO EDIT WHEN APPLYING THE PATCH.
   *
   * This asserts that the dictionaries still carry the OLD text, which is what makes the wait
   * visible instead of forgotten. When the three values are replaced, invert both assertions:
   * `toBe(PROPOSED[lang])` and drop the stale-clause check. Step 4 of §7 of the patch document.
   */
  const dicts = { es: esMain, en: enMain, pt: ptMain } as unknown as Record<string, Record<string, string>>;

  it('still carries the sentence M1 made false, in all three languages', () => {
    for (const lang of ['es', 'en', 'pt'] as const) {
      const shipped = dicts[lang][KEY];
      expect(shipped, `${lang} has the key at all`).toBeTruthy();
      expect(shipped, `${lang} is still the pre-patch text`).not.toBe(PROPOSED[lang]);
    }
  });

  it('and the stale clause is the one about the inventory listing them', () => {
    // Named precisely, so that if someone rewords the sentence for another reason this test says
    // what it was watching rather than failing on an opaque comparison.
    expect(dicts.es[KEY]).toMatch(/inventario metálico sí los liste/i);
    expect(dicts.en[KEY]).toMatch(/inventory does list them/i);
    expect(dicts.pt[KEY]).toMatch(/inventário metálico os liste/i);
  });

  it('keeps the four sibling facets of the limitation intact meanwhile', () => {
    // The patch touches one facet. The others are what keep the limitation legible, and none of
    // them is affected by the behaviour change.
    for (const lang of ['es', 'en', 'pt'] as const) {
      for (const facet of ['title', 'exists', 'missing', 'note']) {
        expect(dicts[lang][`conn.gap.aluminium.${facet}`], `${lang} ${facet}`).toBeTruthy();
      }
    }
  });
});
