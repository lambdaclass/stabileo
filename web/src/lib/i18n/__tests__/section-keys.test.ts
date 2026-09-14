/**
 * The `section.*` and `battens.*` keys built from TEMPLATES, which no regex can find.
 *
 * ── The gap this closes ────────────────────────────────────────────
 *
 * `t()` returns the KEY when it cannot find a translation, so a missing entry does not throw —
 * it renders `section.sheet.basis.tabulated` into the data sheet, and the only thing that
 * catches it is somebody looking.
 *
 * Two tests already guard against that and neither covers these components:
 *
 *   · `steel-keys.test.ts` expands template-built keys properly, by importing the enumerations
 *     rather than grepping for them — but its scope is `/'((?:steel|generator)\....)'/`. It has
 *     no `section.` or `battens.` in it at all.
 *   · `pro-section-modal-contract.test.ts` says «every key these components render exists in all
 *     three offered locales», and its extractor is `t\('([a-z][A-Za-z0-9.]+)'\)` — SINGLE QUOTES.
 *     Template literals do not match it, so the claim is wider than the check.
 *
 * The section components build six families this way:
 *
 *     t(`section.modal.category.${c}`)          BuiltSectionPanel
 *     t(`section.sheet.material.${...}`)        SectionDataSheet
 *     t(`section.sheet.basis.${...}`)           SectionDataSheet, twice
 *     t(`battens.group.${plan.group}`)          BattenPanel
 *     t(k)  over missingKeys and ruleKeys       BattenPanel
 *
 * All of them are complete today — that was checked before writing this. Nothing held them
 * there.
 *
 * ── What this can and cannot catch ─────────────────────────────────
 *
 * The parity test below catches the realistic failure: a value translated into one locale and
 * forgotten in another. It cannot catch a value added to a union and translated NOWHERE, because
 * that leaves all three dictionaries equally empty and equally consistent.
 *
 * `PROPERTY_BASES` is expanded from its own array, which does catch that second case — it is the
 * one family here that ships a runtime list. `MaterialCategory`, `BuiltUpGroup` and
 * `FamilyClassification['material']` are type-only unions, so the same treatment would need a
 * runtime array added to each, and that is a production change this test should not smuggle in.
 * Naming the limit is the honest alternative to implying it is not there.
 */

import { describe, it, expect } from 'vitest';
import es from '../locales/steel/es';
import en from '../locales/steel/en';
import pt from '../locales/steel/pt';
import { PROPERTY_BASES } from '../../profiles/properties';

const DICTS = { es, en, pt } as Record<string, Record<string, string>>;

/** The namespaces these components own. `steel-keys.test.ts` owns the other two. */
const OWNED = /^(section|battens)\./;

const keysUnder = (d: Record<string, string>) => Object.keys(d).filter((k) => OWNED.test(k));

describe('section and battens keys', () => {
  it('are present in all three locales, or absent from all three', () => {
    /*
     * Set difference in both directions, per pair, so the message names WHICH locale is short
     * rather than only that the counts differ. A count comparison would pass two dictionaries
     * that had drifted by the same number of different keys.
     */
    const sets = Object.fromEntries(
      Object.entries(DICTS).map(([lang, d]) => [lang, new Set(keysUnder(d))]),
    ) as Record<string, Set<string>>;

    const missing: string[] = [];
    for (const [lang, own] of Object.entries(sets)) {
      for (const [other, theirs] of Object.entries(sets)) {
        if (lang === other) continue;
        for (const k of theirs) if (!own.has(k)) missing.push(`${lang} is missing ${k} (in ${other})`);
      }
    }

    expect(
      [...new Set(missing)].sort(),
      'a key exists in one locale and not another. t() renders the raw key, so this ships as ' +
        'section.sheet.basis.tabulated on screen rather than as an error.',
    ).toEqual([]);
  });

  it('cover every PROPERTY_BASES value the data sheet can render', () => {
    /*
     * `SectionDataSheet` renders `t(\`section.sheet.basis.${row.quantity.basis}\`)`, and
     * `row.quantity.basis` is a `PropertyBasis`. Expanding the array here means adding a basis
     * to the union fails this test until it is translated — the case parity alone cannot see.
     */
    const missing: string[] = [];
    for (const basis of PROPERTY_BASES) {
      const key = `section.sheet.basis.${basis}`;
      for (const [lang, d] of Object.entries(DICTS)) {
        if (!(key in d)) missing.push(`${lang}: ${key}`);
      }
    }
    expect(
      missing,
      'a PropertyBasis has no translation. Every value in PROPERTY_BASES reaches the data ' +
        'sheet through a template, so an untranslated one renders as its own key.',
    ).toEqual([]);
  });

  it('and the namespaces are not empty, which would make the parity test vacuous', () => {
    // Guards the guard: if a rename emptied `section.*`, the comparison above would pass on
    // three empty sets and report nothing.
    for (const [lang, d] of Object.entries(DICTS)) {
      expect(keysUnder(d).length, `${lang} has no section.* or battens.* keys at all`)
        .toBeGreaterThan(10);
    }
  });
});
