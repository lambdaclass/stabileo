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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STEEL_MEMBER_STATUSES } from '../steel-status';
import steelEn from '../../../i18n/locales/steel/en';
import steelEs from '../../../i18n/locales/steel/es';
import steelPt from '../../../i18n/locales/steel/pt';

const SRC = new URL('../../../..', import.meta.url).pathname;
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

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
  const FILES = [
    'components/pro/steel/SteelPanel.svelte',
    'components/pro/steel/SteelStatusBadge.svelte',
    'components/pro/steel/SteelExperimentalBanner.svelte',
    'components/pro/generators/ProGeneratorsPanel.svelte',
    'components/pro/ProConnectionsTab.svelte',
    'components/pro/ProVerificationTab.svelte',
  ];

  it('never name a VERIFIED status of their own', () => {
    // A component that hardcoded the string would bypass the state machine entirely, which is
    // exactly how a surface starts disagreeing with the engine behind it.
    for (const f of FILES) {
      expect(read(f), f).not.toMatch(/['"`]VERIFIED['"`]/);
    }
  });

  it('carry an experimental banner on both calculating surfaces', () => {
    // The inventory and the joints panel are the two places a number appears. Both say what
    // the number is worth before showing it.
    expect(read('components/pro/steel/SteelPanel.svelte')).toMatch(/experimentalBanner|SteelExperimentalBanner/);
    expect(read('components/pro/ProConnectionsTab.svelte')).toMatch(/conn\.experimentalBanner/);
  });

  it('the verification tab shows no steel row through the green-tick path', () => {
    // `statusIcon`/`statusClass` map 'ok' to ✓ and green. A steel row's `overallStatus`
    // comes from the untested CIRSOC 301 table, so routing the row through that path is the
    // green tick this branch exists to kill. Steel rows render the steel-status vocabulary
    // instead, and no steel row may be counted as ok in the summary header.
    const tab = read('components/pro/ProVerificationTab.svelte');
    expect(tab).not.toMatch(/statusIcon\(sv\.overallStatus\)/);
    expect(tab).not.toMatch(/statusClass\(sv\.overallStatus\)/);
    expect(tab).not.toMatch(/steelVerifications\.filter\([^)]*overallStatus === 'ok'/);
    expect(tab).toMatch(/SteelStatusBadge/);
  });
});
