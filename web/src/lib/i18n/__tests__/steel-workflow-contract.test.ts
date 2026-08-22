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
    // The whole point of the file: a metallic workflow with no edit to a shared component.
    expect(SRC).toContain("import StageSection from './design/StageSection.svelte'");
    expect(SRC).not.toMatch(/data-state=/);   // that markup belongs to StageSection
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

  it('and never renders the word VERIFIED', () => {
    /*
     * Scoped to what a user can SEE: the markup after `</script>` and the dictionary values behind
     * the keys it renders. Scanning the whole file flagged `steelCountsAsVerified()` in a doc
     * comment — a function name, not a claim — which is a false positive that would have taught
     * whoever hit it to loosen the test rather than trust it.
     */
    const markup = SRC.split('</script>')[1];
    const rendered = [...markup.matchAll(/'((?:steel|section)\.[\w.]+)'/g)].map((m) => m[1]);
    const surfaces = [markup, ...rendered.flatMap((k) => [es[k], en[k], pt[k]].filter(Boolean))];
    for (const word of ['VERIFIED', 'VERIFICADO', 'Verified', 'certified', 'certificado', 'aprobado']) {
      for (const text of surfaces) {
        expect(text, `must not say ${word}`).not.toContain(word);
      }
    }
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
