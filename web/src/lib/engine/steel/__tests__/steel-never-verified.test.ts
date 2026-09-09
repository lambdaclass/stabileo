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

/**
 * A component with its prose removed.
 *
 * The glyph sweep below bans `✓` from metallic surfaces. A comment EXPLAINING why the tick was
 * removed — or a contrast table whose rows are marked `✓` and `✗` — contains the very character
 * the rule forbids, so reading the raw file makes a component's own documentation fail the
 * component's own test, and the only way to pass is to stop writing the explanation down. What
 * the rule is about is what a user SEES, and a comment is not that.
 */
const readCode = (p: string) => read(p)
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

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
    'components/pro/ProVerificationTab.svelte',
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
      /*
       * A bare ✓ is the glyph a reader reads as approval, and no metallic surface may show one.
       *
       * `ProConnectionsTab` used to be exempt from this sweep. The exemption was a holding
       * position: the panel carried TWO verdict languages, the designed joint's — which never
       * says "verified" and speaks `incomplete / notVerifiable / designed / exceeded` — and the
       * auxiliary manual calculator's, which ended in a green tick on `--st-ok`. Rather than
       * settle which was right, the sweep skipped the file. §6.2 of `docs/handoffs/m1-m2-audit.md`
       * recorded it as open.
       *
       * It is settled now: the auxiliary block states its outcome in words of its own —
       * `within / near / over`, never `adequate` — under a label saying it is an auxiliary
       * manual check, and points at the designed joint for the state that counts. So the
       * exemption is gone and the tick is banned here like anywhere else.
       *
       * `ProVerificationTab` stays exempt, and only it. That tab is genuinely shared: the same
       * component renders reinforced-concrete rows, where a tick is a legitimate verdict main's
       * own guards protect, and scanning the whole file asserted about concrete — which this
       * rule was never about. The steel half of that tab is guarded precisely, and separately,
       * by «the verification tab shows no steel row through the green-tick path» below.
       */
      const SHARED_WITH_CONCRETE = ['ProVerificationTab.svelte'];
      if (!SHARED_WITH_CONCRETE.some((n) => f.endsWith(n))) {
        expect(readCode(f), `${f} shows a tick`).not.toMatch(/[✓✔]/);
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

/**
 * The joints panel's auxiliary calculator, and the verdict it is not allowed to give.
 *
 * ── What this closes ──────────────────────────────────────────────────
 *
 * `ProConnectionsTab` carries two things that both produce numbers. §1 designs the joint and
 * reports a `JointDesignState` — `incomplete`, `notVerifiable`, `designed`, `exceeded` — a
 * vocabulary built so that none of its words can be read as approval, with `verified` reserved
 * for an authority that does not exist. §2 and §3 are the older manual calculator: type a Vu and
 * a Tu, press a button, read a utilisation. It has no mapped clause, no test and no external
 * benchmark, and it said so at its own entry point — and then ended in a **green ✓**.
 *
 * A tick beside a percentage is read as "the joint is fine". The disclaimer above it does not
 * survive the glyph. So the two languages disagreed inside one panel, and the disagreement
 * favoured the half with no authority behind it.
 *
 * ── What is asserted, and why in this shape ───────────────────────────
 *
 * The glyph is banned by the sweep above. These assert the REPLACEMENT is not a rename: that
 * the block says what it is before it says a number, that its words are its own rather than
 * borrowed from the canonical checks, that the state it shows carries no success token, and that
 * it names where the real verdict lives. A future edit that reintroduces approval has to defeat
 * all four, not one.
 */
describe('the auxiliary calculator states an outcome, not a verdict', () => {
  const TAB = read('components/pro/ProConnectionsTab.svelte');

  it('labels itself as auxiliary before it shows a result', () => {
    // Once per card — bolts and welds — so neither can be read out of context.
    expect([...TAB.matchAll(/conn\.aux\.label/g)]).toHaveLength(2);
    expect([...TAB.matchAll(/conn\.aux\.normativeElsewhere/g)]).toHaveLength(2);
  });

  it('uses words of its own, never the canonical check vocabulary', () => {
    // `conn.checkState.*` belongs to the designed joint, where a state is reached through a
    // mapped clause. Borrowing `adequate` here would be the same claim in better manners.
    const auxRegion = TAB.slice(TAB.indexOf('conn-bolt-result'));
    expect(auxRegion).not.toContain('conn.checkState.');
    for (const k of ['conn.aux.within', 'conn.aux.near', 'conn.aux.over']) {
      expect(TAB, `${k} is the vocabulary this block uses`).toContain(k);
    }
  });

  it('has no success tone to reach for', () => {
    /*
     * `auxTone` is total over the three statuses and none of them maps to a pass class, so
     * there is no `.aux-ok` rule to style and no way to ask for one. Checked on the mapping
     * rather than on the stylesheet: a rule can be added, a branch that does not exist cannot
     * be styled.
     */
    const fn = TAB.match(/function auxTone[\s\S]*?\n  \}/)?.[0] ?? '';
    expect(fn, 'auxTone is present').toContain('aux-within');
    expect(fn).not.toMatch(/\bst-ok\b|--st-ok|aux-ok|success|pass\b/);
    // And the state span never carries the success token, whatever the tone is called.
    const stateRule = TAB.match(/\.conn-aux-state\.aux-within\s*\{[^}]*\}/)?.[0] ?? '';
    expect(stateRule, '.conn-aux-state.aux-within is styled').toBeTruthy();
    expect(stateRule).not.toContain('--st-ok');
  });

  /*
   * And the section HEADER cannot go green either.
   *
   * `StageSection` paints `done` as a ✓ in `--st-ok`, and both calculating sections reached it
   * the moment a result object existed — not when the result was good. An exceeded bolt group
   * turned its own header green. Removing the glyph from the card and leaving it on the card's
   * header would have moved the claim rather than withdrawn it.
   *
   * §1 — joint detection — keeps `done`, and the assertion allows exactly one for that reason:
   * it means the detector ran and found joints, which says nothing about adequacy.
   */
  it('never lets a calculating section reach the state that paints a green tick', () => {
    const dones = [...TAB.matchAll(/state=\{[^}]*'done'/g)];
    expect(dones, 'only joint detection may be `done`').toHaveLength(1);
    expect(TAB).toContain("state={joints.length > 0 ? 'done' : 'blocked'}");
    // The two calculating sections, by the state they DO use.
    expect([...TAB.matchAll(/state=\{selectedJoint \? 'optional' : 'blocked'\}/g)]).toHaveLength(2);
  });

  it('does not bring the old status icon back', () => {
    // The element that carried the tick. Its absence is what the sweep above enforces; this
    // names the specific route so a reader knows what was removed.
    expect(TAB).not.toContain('conn-status-icon');
    expect(TAB).not.toContain('statusClass(');
  });

  it('translates the whole vocabulary into every offered language', () => {
    const KEYS = [
      'conn.aux.label', 'conn.aux.within', 'conn.aux.near', 'conn.aux.over',
      'conn.aux.satisfied', 'conn.aux.notSatisfied', 'conn.aux.normativeElsewhere',
    ];
    for (const [name, dict] of [['en', steelEn], ['es', steelEs], ['pt', steelPt]] as const) {
      for (const k of KEYS) expect(dict[k], `${name}: ${k}`).toBeTruthy();
      /*
       * And the outcome words are not the canonical ones spelled the same. In Spanish this is
       * not hypothetical: `conn.checkState.adequate` is «cumple», so an auxiliary state reading
       * «cumple» would re-merge the two languages in the one locale where the collision is
       * natural to write.
       */
      const canonical = new Set(
        ['adequate', 'exceeded', 'unavailable'].map((s) => dict[`conn.checkState.${s}`]),
      );
      for (const k of ['conn.aux.within', 'conn.aux.near', 'conn.aux.over',
                       'conn.aux.satisfied', 'conn.aux.notSatisfied']) {
        expect(canonical.has(dict[k]), `${name}: ${k} must not reuse a canonical state word`)
          .toBe(false);
      }
    }
  });
});
