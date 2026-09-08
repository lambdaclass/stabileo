/**
 * The one limitation text M1 made false, and the patch that corrected it.
 *
 * ── The situation ──────────────────────────────────────────────────
 *
 * `conn.gap.aluminium.scope` says the metallic inventory lists aluminium members. Wiring the
 * grade catalogue in `6d274e37` ended that: the inventory admits rows by `isSteel`, so an
 * aluminium member is not listed — it is NAMED, in a notice, which is the honest version and the
 * one the sentence does not describe.
 *
 * The string lives in the three main dictionaries, which H1 was editing at the time
 * (`design.floor.state.*`), so the fix waited for their commit to be published. It has been:
 * `ad4192e6` adds their keys as one contiguous block and touches no `conn.*` key, so the two
 * changes never meet. The patch is applied, and the three blocks below are what keep it: the
 * behaviour that made the old sentence false, the properties the new one has to have, and the
 * shipped values themselves.
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
 * Kept here as data so the text itself is under test rather than only its presence. It is the
 * same text as §3 of the patch document; if the two drift, the document is the one to fix,
 * because this is what the dictionaries are compared against.
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

// ─── 2. The replacement text, and the properties it has to have ──────

describe('the replacement text', () => {
  it('is a full sentence in all three offered languages', () => {
    // The "differs from what is shipped" check that lived here belonged to the pre-patch world
    // and inverted correctly the moment the patch landed: block 3 now asserts they are EQUAL.
    for (const lang of ['es', 'en', 'pt'] as const) {
      expect(PROPOSED[lang].trim().length, lang).toBeGreaterThan(60);
      expect(PROPOSED[lang].trim(), lang).toMatch(/\.$/);
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

// ─── 3. The shipped state — patch APPLIED, so this is now the guard ──

describe('the shipped dictionaries', () => {
  /**
   * The patch is in. This block used to assert the OLD text — that is what made the wait visible
   * — and it is now the assertion that keeps the correction from being undone.
   *
   * Applied once H1 published `ad4192e6`, which adds `design.floor.state.*` as its own contiguous
   * block around line 5961 of each dictionary and touches no `conn.*` key. Ours is a value
   * replacement of an existing key near line 4341, so the two changes never meet — and it was
   * applied BY KEY NAME, because in `pt.ts` that key lives in a different region of the file
   * and a line-numbered patch would have hit the wrong row.
   */
  const dicts = { es: esMain, en: enMain, pt: ptMain } as unknown as Record<string, Record<string, string>>;

  it('carries the corrected sentence, in all three languages', () => {
    for (const lang of ['es', 'en', 'pt'] as const) {
      expect(dicts[lang][KEY], `${lang} has the key at all`).toBeTruthy();
      expect(dicts[lang][KEY], `${lang} carries the corrected text`).toBe(PROPOSED[lang]);
    }
  });

  it('no longer claims the metallic inventory lists them', () => {
    // The clause that was false. Named rather than compared opaquely, so a future reword that
    // reintroduces the claim fails here saying what it was watching.
    expect(dicts.es[KEY]).not.toMatch(/inventario metálico sí los liste/i);
    expect(dicts.en[KEY]).not.toMatch(/inventory does list them/i);
    expect(dicts.pt[KEY]).not.toMatch(/inventário metálico os liste/i);
  });

  it('leaves H1’s floor-state keys alone, wherever they are', () => {
    /*
     * The patch touched one key per file. H1's block is a different namespace in a different
     * region, and this asserts M1 did not disturb it — vacuously true on this branch, where
     * those keys do not exist yet, and the assertion that matters after the merge.
     */
    for (const lang of ['es', 'en', 'pt'] as const) {
      const floorKeys = Object.keys(dicts[lang]).filter((k) => k.startsWith('design.floor.state.'));
      // Either none (before the merge) or all of H1's (after it) — never a partial set, which is
      // what a careless conflict resolution would leave behind.
      expect([0, 7], `${lang} has ${floorKeys.length} floor-state keys`).toContain(floorKeys.length);
    }
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
