/**
 * The metallic workflow's contract, checked on the source rather than on a render.
 *
 * ── Why source and not a mounted component ─────────────────────────
 *
 * The properties that matter here are not visual. They are: which stages exist, which states each
 * one can reach, that the verification stage can never reach `done`, and that every string it shows
 * resolves in all three offered languages. A mounted test would exercise Svelte; this exercises the
 * rules — and the rule «no metallic stage may show a green tick for a result» is a property of the
 * SOURCE, which is where someone would break it.
 *
 * The rendered behaviour is covered by the E2E; this is the half that fails fast.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import es from '../locales/steel/es';
import en from '../locales/steel/en';
import pt from '../locales/steel/pt';
import { CIRSOC301_JS_ASSUMPTIONS } from '../../engine/design/adapters/cirsoc301-capabilities';

const SRC = readFileSync(
  join(import.meta.dirname, '../../../components/pro/ProSteelWorkflowTab.svelte'), 'utf8',
);

/** The eight stages the brief specifies, in order. */
const STAGES = [
  'regulation', 'grade', 'section', 'geometry', 'assumptions', 'analysis', 'verification', 'limits',
];

describe('structure — the eight stages, in order', () => {
  it('mounts one StageSection per stage, numbered 1 to 8', () => {
    for (const [i, stage] of STAGES.entries()) {
      const testid = `steel-stage-${stage}`;
      expect(SRC, stage).toContain(`testid="${testid}"`);
      // The step number is the position in the pipeline, and a duplicated or skipped one would
      // make the sequence lie about where the user is.
      expect(SRC, `${stage} step`).toContain(`testid="${testid}" step={${i + 1}}`);
    }
  });

  it('mounts exactly eight of them', () => {
    expect(SRC.match(/<StageSection/g) ?? []).toHaveLength(8);
  });

  it('consumes StageSection and does not reimplement it', () => {
    /*
     * The whole point of the file: a metallic workflow with no edit to a shared component.
     *
     * «Does not reimplement» is about the stage CARD — the numbered marker, the state glyph, the
     * disclosure — not about the `data-state` attribute in general. The per-member tables carry
     * their own `data-state` on each row, which is this file's markup and nothing to do with
     * `StageSection`; an earlier version of this assertion banned the attribute outright and
     * flagged exactly that.
     *
     * So what is checked is the absence of a rival stage card: no `.stage` or `.marker[data-state]`
     * styling of its own.
     */
    expect(SRC).toContain("import StageSection from './design/StageSection.svelte'");
    const css = SRC.split('<style>')[1];
    expect(css).not.toMatch(/\.stage\b/);
    expect(css).not.toMatch(/\.marker\[data-state/);
  });
});

describe('states — `done` means a choice, never a check', () => {
  it('never lets the verification stage reach `done`', () => {
    /*
     * The load-bearing assertion of this file. `StageSection` renders `done` as a ✓ in `--st-ok`,
     * so a `done` here would put a green tick beside a metallic result — the one claim this branch
     * exists to refuse.
     *
     * Checked as a literal: the state is a constant, not a derivation, so there is no input that
     * could move it.
     */
    expect(SRC).toContain("const verificationState = $derived<State>('blocked')");
    expect(SRC).not.toMatch(/verificationState[^;]*'done'/);
  });

  it('reaches `done` only on stages that record a user’s choice', () => {
    /*
     * Regulation, grade, section and analysis may complete: declaring a code, declaring a grade,
     * supplying the section data, running the solve. Geometry, assumptions, verification and limits
     * may not, because none of them is a choice the user finishes.
     */
    const canComplete = ['regState', 'gradeState', 'sectionState', 'analysisState'];
    const cannot = ['geometryState', 'assumptionState', 'verificationState', 'limitsState'];
    for (const name of canComplete) {
      const line = SRC.split('\n').filter((l) => l.includes(`const ${name} =`)).join(' ')
        + SRC.split(`const ${name} =`)[1]?.split(';')[0];
      expect(line, name).toContain("'done'");
    }
    for (const name of cannot) {
      const decl = SRC.split(`const ${name} =`)[1]?.split(';')[0] ?? '';
      expect(decl, `${name} must not be able to complete`).not.toContain("'done'");
    }
  });

  it('says nothing rather than inventing progress', () => {
    // No bar, no percentage, no cancel — the brief's explicit prohibitions, as an absence.
    for (const forbidden of ['progress', 'percent', '%', 'cancel', 'Cancel']) {
      expect(SRC, `must not offer ${forbidden}`).not.toContain(`>${forbidden}`);
    }
    expect(SRC).not.toMatch(/role="progressbar"/);
  });

  it('never ASSERTS a verification — every mention is a denial', () => {
    /*
     * ── Third rewrite of this assertion, and the reason is the same each time ──
     *
     * Banning the claim words outright keeps flagging sentences whose whole job is to deny the
     * claim: «none is shown as verified», «ninguno se presenta como aprobado», `SteelPanel`'s
     * «none of them is verified». Banning the word bans the honesty.
     *
     * The property that actually matters — and the one the E2E settled on — is that **every line
     * mentioning a claim word carries a negation.** That permits the denials, catches an assertion,
     * and does not need updating every time the screen says something true.
     *
     * Checked over the markup and over the dictionary values behind the keys it renders, in all
     * three languages, since a claim could arrive through a translation.
     */
    const markup = SRC.split('</script>')[1];
    const rendered = [...markup.matchAll(/'((?:steel|section)\.[\w.]+)'/g)].map((m) => m[1]);
    /*
     * ── Two refinements the first run of this matcher forced ─────────
     *
     * **The claim is a participle, not the noun.** `verificad` also matches «verificador» — the
     * VERIFIER, the name of a module — and naming it is not claiming anything. So the patterns end
     * in `[oa]s?\b`, which accepts «verificado» and rejects «verificador» and «verificación».
     *
     * **Whole strings, never split.** Splitting on `.` and `;` tore «El verificador existe y produce
     * números; ninguno se presenta como aprobado» in half and flagged the first clause for lacking
     * the negation that was in the second. A dictionary value is authored as one statement and has
     * to be judged as one.
     */
    const CLAIM = /verificad[oa]s?\b|\bverified\b|aprobad[oa]s?\b|\bapproved\b|certificad[oa]s?\b|\bapto\b/i;
    const NEGATION = /\bno\b|\bnone\b|\bnot\b|\bnothing\b|ningun|ningún|nada|nenhum|\bnão\b|\bsin\b|\bsem\b|without/i;

    const lines: string[] = [markup];
    for (const key of rendered) {
      for (const dict of [es, en, pt]) {
        const v = (dict as Record<string, string>)[key];
        if (v) lines.push(v);
      }
    }
    const offenders = lines
      .map((l) => l.trim())
      .filter((l) => CLAIM.test(l) && !NEGATION.test(l));
    expect(offenders, `these assert a verification: ${JSON.stringify(offenders)}`).toEqual([]);
  });

  it('and the denials are actually present, so the check is not vacuous', () => {
    // If the screen stopped mentioning verification at all, the assertion above would pass by
    // having nothing to check — and the reader would lose the sentence that says the numbers are
    // not a check.
    expect(es['steel.workflow.results.noCertifiable']).toMatch(/aprobad|verificad/i);
    expect(en['steel.workflow.results.noCertifiable']).toMatch(/pass|verified/i);
  });
});

describe('blockers — the four the brief names, plus the signature', () => {
  const REQUIRED = ['tests', 'clauseRefs', 'unbracedLength', 'inferredProperties', 'signature'];

  it('names every one of them', () => {
    for (const b of REQUIRED) {
      expect(SRC, b).toContain(`steel.workflow.blocker.${b}`);
    }
  });

  it('marks the two that this branch addressed, and leaves three outstanding', () => {
    /*
     * Tests and inferred properties moved — the benchmark suite and the end of the seven guessed
     * inputs. The clause map, the unbraced length and the signature did not, and the stage does not
     * unblock on two out of five.
     */
    const block = SRC.split('const BLOCKERS = [')[1].split('] as const')[0];
    const addressed = [...block.matchAll(/blocker\.(\w+)', addressed: (true|false)/g)]
      .map((m) => [m[1], m[2] === 'true'] as const);
    expect(new Map(addressed).get('tests')).toBe(true);
    expect(new Map(addressed).get('inferredProperties')).toBe(true);
    expect(new Map(addressed).get('clauseRefs')).toBe(false);
    expect(new Map(addressed).get('unbracedLength')).toBe(false);
    expect(new Map(addressed).get('signature')).toBe(false);
  });

  it('does not colour an addressed blocker green', () => {
    // Dimmed, not green: it is one of five and the stage is still blocked, so colour would read as
    // progress toward a pass.
    const css = SRC.split('<style>')[1];
    expect(css).toContain('.blockers li.addressed { opacity');
    expect(css).not.toMatch(/\.addressed[^}]*--st-ok/);
  });

  it('blocks geometry on the Lb assumption without inventing a number', () => {
    expect(SRC).toContain('steel.workflow.geometry.blocked');
    // No fraction of L anywhere: that would be the invention the brief forbids.
    expect(SRC).not.toMatch(/Lb\s*[:=]\s*L\s*[*/]/);
  });
});

describe('accessibility', () => {
  it('pairs every glyph with a word, so state never depends on colour', () => {
    /*
     * `StageSection` already does this for the stage state — `STATE_TEXT` carries a glyph AND a key
     * «so the state never depends on the colour». The blocker list is this file's own markup, so it
     * has to carry the same property: the ✓/· is `aria-hidden` and a screen-reader word sits beside
     * it.
     */
    expect(SRC).toContain('<span class="mark" aria-hidden="true">');
    expect(SRC).toContain("steel.workflow.blocker.addressed");
    expect(SRC).toContain("steel.workflow.blocker.outstanding");
  });

  it('hides the state word visually without removing it from the accessibility tree', () => {
    // `display: none` would take it out of the tree too. The clip-rect pattern keeps it readable.
    const css = SRC.split('<style>')[1];
    expect(css).toMatch(/\.sr\s*\{[^}]*clip:\s*rect\(0 0 0 0\)/);
    expect(css).not.toMatch(/\.sr\s*\{[^}]*display:\s*none/);
  });
});

describe('every key it renders resolves in all three languages', () => {
  const dicts = { es, en, pt } as Record<string, Record<string, string>>;
  const keys = [...new Set([...SRC.matchAll(/'((?:steel|section)\.[\w.]+)'/g)].map((m) => m[1]))];

  it('finds the keys to check', () => {
    // A guard on the guard: if the regex stops matching, the test below would pass vacuously.
    expect(keys.length).toBeGreaterThan(25);
  });

  it('resolves each one', () => {
    for (const [name, dict] of Object.entries(dicts)) {
      for (const key of keys) {
        // Prefixes built at runtime (`steel.inputGap.` + gap) are checked separately below.
        if (key.endsWith('.')) continue;
        expect(dict[key], `${name}: ${key}`).toBeTruthy();
      }
    }
  });

  it('resolves every input-gap key the engine can emit', () => {
    // Built by concatenation in `steelInputGapKey`, so the literal never appears in the source and
    // the previous test cannot see them.
    const gaps = ['ultimateStrength', 'depth', 'flangeWidth', 'webThickness', 'flangeThickness',
                  'strongAxisInertia', 'weakAxisInertia', 'area'];
    for (const [name, dict] of Object.entries(dicts)) {
      for (const g of gaps) expect(dict[`steel.inputGap.${g}`], `${name}: ${g}`).toBeTruthy();
    }
  });

  it('and every assumption the checker declares', () => {
    for (const [name, dict] of Object.entries(dicts)) {
      for (const key of CIRSOC301_JS_ASSUMPTIONS) expect(dict[key], `${name}: ${key}`).toBeTruthy();
    }
  });

  it('keeps the placeholders in every language', () => {
    for (const [name, dict] of Object.entries(dicts)) {
      expect(dict['steel.workflow.regulation.declared'], name).toContain('{name}');
      expect(dict['steel.workflow.grade.someInferred'], name).toContain('{n}');
    }
  });
});
