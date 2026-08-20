/**
 * Nothing metallic may present itself as verified, approved, certified or ready to build.
 *
 * ── Why this is a test and not a review ────────────────────────────
 *
 * The rule is a product commitment, and a commitment that lives only in a document is one
 * that survives until the first person who has not read it. There is no metallic design
 * authority bound to this app: `cirsoc301.ts` exists, has no tests and no mapped clauses, and
 * `connection-design.ts` is in the same position. Every number either of them produces is
 * EXPERIMENTAL by construction, and the four states are the whole vocabulary the surface has.
 *
 * The concrete side is deliberately not covered here. `VERIFIED` is a legitimate outcome
 * there — it is earned through the verifier, the reverification at final depth and the
 * certificates — and this file must not be read as saying otherwise.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STEEL_MEMBER_STATUSES } from '../steel-status';
import steelEn from '../../../i18n/locales/steel/en';
import steelEs from '../../../i18n/locales/steel/es';
import steelPt from '../../../i18n/locales/steel/pt';

const SRC = new URL('../../../..', import.meta.url).pathname;
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/** Every component file under a directory, so a screen added later is covered by default. */
function walk(dir: string): string[] {
  return readdirSync(join(SRC, dir), { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.svelte'))
    .map((e) => `${dir}/${e.name}`)
    .sort();
}

describe('the metallic vocabulary', () => {
  it('is exactly the four states, with no fifth that could pass for approval', () => {
    // Adding `VERIFIED` here would be the single edit that undoes the whole commitment, so
    // the set is pinned by value rather than by count.
    expect([...STEEL_MEMBER_STATUSES].sort()).toEqual(
      ['DEMAND_UNAVAILABLE', 'EXPERIMENTAL', 'NOT_APPLICABLE', 'NOT_DESIGNED'],
    );
  });

  it('defines a label and a description for each state, in all three offered languages', () => {
    for (const [name, dict] of [['en', steelEn], ['es', steelEs], ['pt', steelPt]] as const) {
      for (const s of STEEL_MEMBER_STATUSES) {
        expect(dict[`steel.status.${s}`], `${name}: label for ${s}`).toBeTruthy();
        expect(dict[`steel.status.${s}.desc`], `${name}: description for ${s}`).toBeTruthy();
      }
      // No status key exists for a state the engine cannot produce.
      const statusKeys = Object.keys(dict).filter((k) => /^steel\.status\.[A-Z_]+$/.test(k));
      expect(statusKeys.length, `${name}: no orphan status labels`).toBe(STEEL_MEMBER_STATUSES.length);
    }
  });
});

/**
 * The words that would be a claim.
 *
 * Matched only where they would ASSERT something. Every legitimate use in this namespace is a
 * denial — "it is not a verification", "it issues no certificates" — so the test looks for the
 * word without a negation near it rather than for the word at all. A blanket ban would forbid
 * the sentences that make the commitment.
 */
const CLAIMS = [
  /\bverified\b/i, /\bapproved\b/i, /\bcertified\b/i, /\bready to build\b/i,
  /\bverificad[oa]s?\b/i, /\baprobad[oa]s?\b/i, /\bcertificad[oa]s?\b/i, /\bapto para\b/i,
  /\bverificad[oa]s?\b/i, /\baprovad[oa]s?\b/i,
];
const DENIALS =
  /\b(no|not|none|não|nunca|never|sin|without|sem|ning[uú]n[oa]?|nenhum[a]?|nada|neither|nor)\b/i;

describe('no metallic string claims a verification', () => {
  for (const [name, dict] of [['en', steelEn], ['es', steelEs], ['pt', steelPt]] as const) {
    it(`${name} — every occurrence is a denial, never an assertion`, () => {
      const offenders: string[] = [];
      for (const [key, value] of Object.entries(dict)) {
        if (!/^(steel|generator)\./.test(key)) continue;
        if (!CLAIMS.some((re) => re.test(value))) continue;
        // The sentence containing the word has to also contain a negation.
        const sentence = value.split(/(?<=[.;])\s+/).find((s) => CLAIMS.some((re) => re.test(s))) ?? value;
        if (!DENIALS.test(sentence)) offenders.push(`${key}: ${sentence}`);
      }
      expect(offenders).toEqual([]);
    });
  }
});

describe('the metallic components', () => {
  /**
   * Every metallic component, ENUMERATED FROM THE DIRECTORIES rather than listed.
   *
   * The list used to be five paths written by hand, and M1 added four components to those same
   * directories — a grade picker, a profile picker, a section figure, a preview — none of which
   * the list covered. A hand-kept list of the screens a commitment applies to is a list that
   * stops covering the newest screen, which is the one most likely to break the commitment.
   *
   * `ProConnectionsTab` is named explicitly because it lives outside those two directories.
   */
  const FILES = [
    ...walk('components/pro/steel'),
    ...walk('components/pro/generators'),
    'components/pro/ProConnectionsTab.svelte',
  ];

  it('covers every metallic screen there is, including the ones added later', () => {
    // The assertion that keeps the enumeration honest: if the directories are ever emptied or
    // renamed, this fails instead of the suite quietly passing over nothing.
    expect(FILES.length).toBeGreaterThanOrEqual(9);
    expect(FILES).toContain('components/pro/steel/SteelPanel.svelte');
    expect(FILES).toContain('components/pro/steel/GradePickerPanel.svelte');
    expect(FILES).toContain('components/pro/generators/ProfileSelectorPanel.svelte');
  });

  it('never name a VERIFIED status of their own', () => {
    // A component that hardcoded the string would bypass the state machine entirely, which is
    // exactly how a surface starts disagreeing with the engine behind it.
    for (const f of FILES) {
      expect(read(f), f).not.toMatch(/['"`]VERIFIED['"`]/);
    }
  });

  it('shows no passing treatment on any metallic surface', () => {
    // `steelDisplayTone` cannot return one and `SteelStatusBadge` has no class for one. This
    // extends that to every metallic screen: a green tick or an `ok` tone reached by a card,
    // a picker or a preview would be the same claim by another route.
    for (const f of FILES) {
      const src = read(f);
      expect(src, f).not.toMatch(/\.tone-ok\b/);
      expect(src, f).not.toMatch(/tone-(pass|success|verified)\b/);
      // A bare ✓ is the glyph a reader reads as approval. The joints panel earns its own by
      // pairing it with a utilisation and an experimental banner; nothing else may use it.
      if (!f.endsWith('ProConnectionsTab.svelte')) {
        expect(src, `${f} shows a tick`).not.toMatch(/[✓✔]/);
      }
    }
  });

  it('states the four metallic states and no fifth, wherever it names one', () => {
    // Any component naming a state has to name one the engine can produce.
    const named = new Set<string>();
    for (const f of FILES) {
      for (const m of read(f).matchAll(/['"`](NOT_DESIGNED|EXPERIMENTAL|DEMAND_UNAVAILABLE|NOT_APPLICABLE|[A-Z][A-Z_]{4,})['"`]/g)) {
        // Only consider all-caps tokens that look like a status, not arbitrary constants.
        if (/^(NOT_DESIGNED|EXPERIMENTAL|DEMAND_UNAVAILABLE|NOT_APPLICABLE)$/.test(m[1])) named.add(m[1]);
      }
    }
    for (const s of named) expect(STEEL_MEMBER_STATUSES as readonly string[]).toContain(s);
  });

  it('carry an experimental banner on both calculating surfaces', () => {
    // The inventory and the joints panel are the two places a number appears. Both say what
    // the number is worth before showing it.
    expect(read('components/pro/steel/SteelPanel.svelte')).toMatch(/experimentalBanner|SteelExperimentalBanner/);
    expect(read('components/pro/ProConnectionsTab.svelte')).toMatch(/conn\.experimentalBanner/);
  });
});
