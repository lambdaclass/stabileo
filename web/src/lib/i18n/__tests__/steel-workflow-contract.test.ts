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

/**
 * The five stages, in order.
 *
 * They replaced eight, and the eight were not wrong so much as they were a list of the pieces in
 * the order they were built. Four of them — grade, section, geometry, assumptions — plus
 * verification are one question asked about four inputs: «are the sections I chose adequate».
 * They are `<section>`s inside stage 3 now, each keeping its own state, which is checked below.
 *
 * Joints and documents are new. Joints was reachable only from a separate tab; documents did not
 * exist at all.
 */
const STAGES = ['model', 'code', 'sections', 'joints', 'documents'];

/** The four former stages that became sub-sections of stage 3, plus verification. */
const SUBS = ['grade', 'section', 'geometry', 'assumptions', 'verification'];

describe('structure — the five stages, in order', () => {
  it('mounts one StageSection per stage, numbered 1 to 5', () => {
    for (const [i, stage] of STAGES.entries()) {
      const testid = `steel-stage-${stage}`;
      expect(SRC, stage).toContain(`testid="${testid}"`);
      // The step number is the position in the route, and a duplicated or skipped one would make
      // the sequence lie about where the user is.
      expect(SRC, `${stage} step`).toContain(`testid="${testid}" step={${i + 1}}`);
    }
  });

  it('mounts exactly five of them', () => {
    expect(SRC.match(/<StageSection/g) ?? []).toHaveLength(5);
  });

  /*
   * Merging four stages into one must not merge four answers into one. Each sub-section carries
   * its own state, so a reader still sees WHICH of the four is blocking.
   */
  it('keeps each merged sub-section answering for itself', () => {
    for (const sub of SUBS) {
      expect(SRC, sub).toContain(`data-testid="steel-sub-${sub}"`);
      expect(SRC, `${sub} state`).toContain(`data-testid="steel-sub-${sub}-state"`);
    }
  });

  /*
   * Limits stopped being a stage. It applies to every stage above it, so numbering it after the
   * last one implied it was something that arrives at the end.
   */
  it('carries the limits as a footer, not as a sixth stage', () => {
    expect(SRC).toContain('data-testid="steel-limits"');
    expect(SRC).not.toContain('testid="steel-stage-limits"');
    // And `SteelPanel` is still there: it used to BE this tab.
    expect(SRC).toContain('<SteelPanel />');
  });

  /*
   * C/Z are a family in the section selector, reachable from the sections tab and from every
   * generator row. A stage of their own would make a shape look like a step in a process.
   */
  it('gives cold-formed C/Z no stage of its own', () => {
    expect(SRC).not.toMatch(/testid="steel-stage-(cold|cf|zed)/i);
    expect(SRC).not.toContain('ColdFormedPanel');
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

describe('the regulation gate asks whether a code is declared', () => {
  /*
   * `roleUsable` returns false whenever a code's maturity is UNSUPPORTED, and CIRSOC 301 is
   * declared UNSUPPORTED — accurately, no adapter implements it. Gating progress on `usable`
   * meant choosing a code could never unblock anything at all.
   */
  it('does not gate the stage on usability', () => {
    expect(SRC).toContain('const regState');
    // The stage's state comes from whether a code label exists — i.e. whether one was declared.
    expect(SRC).toMatch(/const regState = \$derived<State>\(codeLabel/);
  });

  it('says on screen that declaring is not certifying', () => {
    expect(SRC).toContain('steel.workflow.regulation.declaredNotCertified');
    expect(SRC).toContain('data-testid="steel-stage-code-scope"');
  });
});

describe('the joints stage names what it cannot supply', () => {
  it('lists the bolt rules it computes and the geometry it does not', () => {
    for (const key of ['boltLayout', 'holeSize', 'plateUnavailable', 'weldUnavailable', 'battenUnavailable']) {
      expect(SRC, key).toContain(`steel.workflow.joints.scope.${key}`);
    }
  });

  /*
   * The two absences the shipped shed made necessary: it has 226 joints and had no material the
   * app could classify, so «no joints» would have been false about it.
   */
  it('distinguishes no joints from joints it cannot show', () => {
    expect(SRC).toContain('steel.workflow.joints.noneAtAll');
    expect(SRC).toContain('conn.jointsNotShown');
  });

  it('counts with the same predicate the connections panel uses', () => {
    expect(SRC).toContain('isMetallic:');
    expect(SRC).toContain('detectJoints(');
  });
});

describe('states — `done` means a choice, never a check', () => {
  it('never lets the verification stage reach `done`', () => {
    /*
     * The load-bearing assertion of this file, and the ONE that survived the change below:
     * `StageSection` renders `done` as a ✓ in `--st-ok`, so a `done` here would put a green tick
     * beside a metallic result — the claim this branch exists to refuse.
     *
     * It used to be checked as a literal constant `'blocked'`. That conflated two things: whether
     * the CALCULATION can run, and whether a human has reviewed it. The first has a factual answer
     * and belongs in the state; the second is a review state that arrives later and must not gate
     * development. So the state is now derived — blocked when computation is impossible, `current`
     * otherwise — and `'done'` is simply never among its outcomes.
     */
    const decl = SRC.split('const verificationState = $derived<State>(')[1].split(');')[0];
    expect(decl, 'the verification state must never be able to complete').not.toContain("'done'");
    // The three it CAN be, and no others.
    for (const state of ["'optional'", "'blocked'", "'current'"]) {
      expect(decl, state).toContain(state);
    }
  });

  it('blocks the stage on computation, not on the missing signature', () => {
    /*
     * The behavioural change, asserted so it cannot silently revert. The stage is blocked when
     * there are no demands or a member's inputs are incomplete — both facts about whether the
     * calculation can run. The signature is metadata beside it.
     */
    const decl = SRC.split('const verificationState = $derived<State>(')[1].split(');')[0];
    expect(decl).toContain('hasDemands');
    expect(decl).toContain('inputGaps');
    expect(decl, 'the signature must not appear in the state').not.toMatch(/signature|firma/i);
  });

  it('and shows the review state as metadata, never as an approval', () => {
    expect(SRC).toContain('steel.workflow.review.pending');
    expect(SRC).toContain('steel-review-state');
    // Neutral styling: a pending review coloured `--st-ok` would read as a pass.
    const css = SRC.split('<style>')[1];
    expect(css).not.toMatch(/\.review[^}]*--st-ok/);
  });

  it('reaches `done` only where a fact settles it, never a check', () => {
    /*
     * Two states may reach `done` now, and neither is a verdict about a member:
     *
     *   · **`regState`** — a code was declared. A choice the user made.
     *   · **`modelState`** — the model was solved. A fact about the analysis, not about whether
     *     any section is adequate.
     *
     * Every other stage tops out at `current`. `sectionsState` in particular can never be `done`:
     * `steelCountsAsVerified()` returns the literal `false`, and a green tick beside a metallic
     * result is the one claim this branch exists to refuse.
     */
    const MAY_BE_DONE = ['regState', 'modelState'];
    const NEVER_DONE = ['sectionsState', 'jointsState', 'documentsState', 'verificationState'];

    for (const name of MAY_BE_DONE) {
      const decl = SRC.match(new RegExp(`const ${name} = \\$derived<State>\\(([\\s\\S]*?)\\n  \\);`))?.[1]
        ?? SRC.match(new RegExp(`const ${name} = \\$derived<State>\\(([^;]*?)\\);`))?.[1];
      expect(String(decl), name).toContain("'done'");
    }
    for (const name of NEVER_DONE) {
      const decl = SRC.match(new RegExp(`const ${name} = \\$derived<State>\\(([\\s\\S]*?)\\n  \\);`))?.[1];
      expect(String(decl), name).not.toContain("'done'");
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

describe('limitations — what the app does not do, separated from what awaits review', () => {
  it('names each limitation the audit left standing', () => {
    /*
     * Renamed from «blockers», and that is the substance of the change rather than wording: a
     * limitation is something the app does or does not do, a review is a state a person moves.
     * Mixing the signature in among them made the stage look permanently broken when it was only
     * unreviewed.
     */
    for (const key of ['blocker.tests', 'blocker.inferredProperties', 'blocker.clauseRefs',
                       'blocker.unbracedLength', 'limit.flexuralCap',
                       'limit.sectionClassification', 'limit.netArea']) {
      expect(SRC, key).toContain(`steel.workflow.${key}`);
    }
  });

  it('marks what the normative audit closed, and what it did not', () => {
    /*
     * Four closed: the tests, the seven inferred inputs, the clause map, and the `1,5·My` cap that
     * the audit of the shipped F.2.1 and F.6.1 text turned up.
     *
     * Three open, and each for a different reason: the unbraced length needs a model field, the
     * section classification needs table values that are IMAGES in the source PDF, and the net area
     * needs connection geometry.
     */
    const block = SRC.split('const LIMITATIONS = [')[1].split('] as const')[0];
    const m = new Map([...block.matchAll(/workflow\.(?:blocker|limit)\.(\w+)', addressed: (true|false)/g)]
      .map((x) => [x[1], x[2] === 'true'] as const));
    for (const closed of ['tests', 'inferredProperties', 'clauseRefs', 'flexuralCap']) {
      expect(m.get(closed), `${closed} closed`).toBe(true);
    }
    for (const open of ['unbracedLength', 'sectionClassification', 'netArea']) {
      expect(m.get(open), `${open} open`).toBe(false);
    }
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
