/**
 * The invariant the fingerprint alone can no longer carry.
 *
 * ── Why this file exists ───────────────────────────────────────────
 *
 * `rc-baseline-digest.test.ts` was written to catch one thing: PR21 changing a concrete result.
 * It did its job for the whole branch and then, on 2026-08-15, it went red for a reason that was
 * not PR21's — main had moved 113 commits and reclassified 22 refusals from `SEARCH_EXHAUSTED`
 * to `PROVISIONAL_BIAXIAL`. The fingerprint was re-recorded under authorisation, with the
 * measurement that proved whose drift it was.
 *
 * That re-recording costs something, and this file is the payment. A fingerprint that has been
 * re-recorded once can be re-recorded again, and the next time the argument "it was main" will
 * be easier to make and harder to check. So the invariant is restated here in a form that does
 * NOT move when main moves: **this branch's metallic work is not in the concrete design path at
 * all.**
 *
 * A digest asks "did the numbers change". This asks "could they have". The two fail on different
 * days, which is the point of having both.
 *
 * ── Read as source, deliberately ───────────────────────────────────
 *
 * These are structural claims about which modules exist and what they import, and the honest way
 * to check that is to read the files. A runtime assertion would only prove the code did not
 * happen to execute on one fixture.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = (rel: string) => fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
const read = (rel: string) => readFileSync(src(rel), 'utf8');

/** The modules that decide what a concrete member is designed as. */
const CONCRETE_DESIGN_PATH = [
  'engine/design/candidate-search.ts',
  'engine/design/outcome.ts',
  'engine/design/adapters/cirsoc201-adapter.ts',
];

/** Anything that would pull the metallic surface into that path. */
const METALLIC_IMPORTS = [
  'engine/steel/',
  'store/steel.svelte',
  'engine/generators/',
  'codes/argentina/cirsoc301',
];

describe('the concrete design path is untouched by the metallic work', () => {
  it('the modules that produce a concrete outcome import nothing metallic', () => {
    for (const rel of CONCRETE_DESIGN_PATH) {
      if (!existsSync(src(rel))) continue;   // a rename upstream must not silently pass
      const text = read(rel);
      const imports = text.split('\n').filter((l) => /^\s*import\b|from '/.test(l)).join('\n');
      for (const forbidden of METALLIC_IMPORTS) {
        expect(imports, `${rel} must not import ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('every module the path names still exists, so this test cannot pass by absence', () => {
    // The loop above skips a module it cannot find. That is correct — a rename upstream is not
    // this branch's defect — but it would also let the whole file go quiet. This is the alarm.
    const missing = CONCRETE_DESIGN_PATH.filter((rel) => !existsSync(src(rel)));
    expect(missing, 'if this lists anything, update CONCRETE_DESIGN_PATH and re-verify by hand')
      .toEqual([]);
  });

  /**
   * `member-context.ts` is the one file in the concrete path this branch DOES edit, and it edits
   * it to keep metallic members OUT. So it legitimately imports the material-family axis.
   *
   * What must hold is the direction of that dependency: it may ASK whether a member is metallic,
   * and it may not hand one to a concrete adapter. The exclusion is asserted behaviourally in
   * `steel-excluded-from-rc.test.ts`; here the claim is narrower and structural — the exclusion
   * is the only reason steel is named in this file.
   */
  it('member-context names steel only to exclude it', () => {
    const text = read('engine/design/member-context.ts');
    if (!/steel|material-family/i.test(text)) return;   // the import may move; not a failure

    // No adapter is selected on a metallic branch: the metallic answer is always "not ours".
    expect(text, 'no concrete adapter may be chosen for a metallic member')
      .not.toMatch(/metal\w*[\s\S]{0,120}cirsoc201/i);
  });

  /**
   * The generators produce geometry, and geometry that does not solve is the failure mode a
   * generator actually has. That net is `generated-models-solve.test.ts`, and it is the one the
   * integration handoff names as un-droppable.
   *
   * Asserted here as presence, not as a re-run: this file must fail if somebody deletes it.
   */
  it('the generated-geometry solvency net is still in the tree', () => {
    const net = fileURLToPath(
      new URL('../../generators/__tests__/generated-models-solve.test.ts', import.meta.url));
    expect(existsSync(net), 'the only test that can see a mechanism must not be deleted')
      .toBe(true);
  });
});
