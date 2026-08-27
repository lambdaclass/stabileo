/**
 * I-07 on screen: an obsolete joint is visible, named, and has a way out.
 *
 * The store refuses to apply a stored joint that does not match the model, and that half is
 * tested twice already. This file is about the other half of the finding, which is the half that
 * makes it a defect rather than an implementation detail: an obsolete entry that is merely not
 * applied is indistinguishable from a joint nobody ever designed. One of those two is work the
 * user did, and the panel has to say which.
 *
 * Asserted against the sources rather than a rendered DOM, the same way
 * `pro-section-modal-contract.test.ts` pins the sections tab: what must not come back is
 * machinery, and machinery is what a source can be checked for.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dictFor } from '../../i18n/store.svelte';
import { OFFERED_LOCALES } from '../../i18n/store.svelte';

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');
const PANEL = readFileSync(
  resolve(__dirname, '../../../components/pro/ProConnectionsTab.svelte'), 'utf8',
);
const STORE = read('store/joint-design.svelte.ts');
const MODEL = read('store/model.svelte.ts');
const HISTORY = read('store/history.svelte.ts');

describe('the panel says so', () => {
  it('renders the notice, with a count', () => {
    expect(PANEL).toContain('conn-obsolete-notice');
    expect(PANEL).toContain("tp('conn.obsolete.title'");
    expect(PANEL).toContain('jointDesignStore.obsolete');
  });

  /*
   * The reason, per joint. «Obsolete» on its own does not tell a user whether to look for a
   * deleted node, a moved one, or a member they added — three different things to go and do.
   */
  it('names the reason for each joint, not merely that there is one', () => {
    expect(PANEL).toContain('conn-obsolete-reason-');
    expect(PANEL).toMatch(/conn\.obsolete\.reason\.\$\{o\.reason\}/);
  });

  /* A notice with no way out is a complaint. Both remedies are reachable from it. */
  it('offers both remedies', () => {
    expect(PANEL).toContain('conn-obsolete-discard-all');
    expect(PANEL).toContain('jointDesignStore.discardObsolete()');
    expect(PANEL).toContain('conn-obsolete-discard-');
    expect(PANEL).toContain('jointDesignStore.clear(o.nodeId)');
  });

  it('gives its controls a focus ring, from the token set', () => {
    const style = PANEL.slice(PANEL.indexOf('<style>'));
    const block = style.slice(style.indexOf('.conn-obsolete'));
    expect(block).toContain(':focus-visible');
    expect(block).toContain('--st-value');
  });

  /*
   * Warn-toned, not danger-toned, and not a colour-only signal. Nothing is broken and no number
   * is wrong: work exists that this model cannot claim. The words carry it; the tint ranks it.
   */
  it('is warn-toned and says it in words', () => {
    const style = PANEL.slice(PANEL.indexOf('<style>'));
    const block = style.slice(style.indexOf('.conn-obsolete {'), style.indexOf('.conn-explain'));
    expect(block).toContain('--st-warn');
    expect(block).not.toContain('--st-danger');
    expect(PANEL).toContain("t('conn.obsolete.why')");
  });

  it('speaks every locale the app offers', () => {
    const keys = [
      'conn.obsolete.title', 'conn.obsolete.why',
      'conn.obsolete.discardOne', 'conn.obsolete.discardAll',
      'conn.obsolete.reason.nodeMissing', 'conn.obsolete.reason.nodeMoved',
      'conn.obsolete.reason.topologyChanged',
    ];
    for (const locale of OFFERED_LOCALES) {
      const dict = dictFor(locale);
      for (const k of keys) expect(dict[k], `${k} in ${locale}`).toBeTruthy();
    }
  });
});

describe('the choices travel on the model, which is what makes them persist', () => {
  /*
   * I-06. They lived in a `$state` Map and in nothing else, so twenty designed joints were lost
   * on closing the tab. On the model they ride `.ded`, undo/redo, tab capture and autosave — all
   * four of which go through this one pair.
   */
  it('snapshot and restore both carry the field', () => {
    expect(MODEL).toContain('jointDesigns?: StoredJointDesigns');
    expect(MODEL).toMatch(/jointDesigns:\s*snap\.jointDesigns/);
    expect(MODEL).toMatch(/model\.jointDesigns = s\.jointDesigns/);
    expect(HISTORY).toContain('jointDesigns?: StoredJointDesigns');
  });

  /* Deep-cloned at the boundary, so the undo entry does not alias the live choices. */
  it('clones at the snapshot boundary', () => {
    expect(MODEL).toContain('cloneStoredJointDesigns');
  });

  /* A new project starts with no joints, the same way it starts with no soil. */
  it('a new model drops them', () => {
    expect(MODEL).toContain('model.jointDesigns = undefined');
  });

  /*
   * Still only the choices. The store's own rule, and now also what stops a SAVED joint from
   * reporting a capacity against a member that has since been deleted.
   */
  it('stores no computed capacity or geometry', () => {
    const CHOICES = read('connection/joint-choices.ts');
    const code = CHOICES
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const gone of ['capacityKN', 'holesM', 'utilisation', 'designJoint']) {
      expect(code, gone).not.toContain(gone);
    }
    /*
     * And it imports no design engine at all. `StoredJointDesign` is a data record and contains
     * the substring `JointDesign`, so the absence has to be asserted on the IMPORT rather than on
     * the name — my first version banned the substring and failed on the type it was defining.
     */
    expect(code).not.toMatch(/from '\.\/joint-design'/);
    expect(code).not.toMatch(/from '\.\/joint-demands'/);
  });

  /*
   * The store no longer keeps a Map of its own. That Map WAS the finding: a second home for
   * project data, invisible to every serialiser.
   */
  it('the store keeps no parallel copy', () => {
    const code = STORE
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/\/\*\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/\$state<Map<number, JointChoices>>/);
    expect(code).toContain('modelStore.model.jointDesigns');
  });

  /*
   * `reset()` is kept and still works, but nothing has to remember to call it: `restore()` and
   * `clear()` both replace the field. A `reset()` nobody called was the defect; a `reset()`
   * nobody NEEDS to call is the repair.
   */
  it('does not depend on anyone remembering to reset', () => {
    expect(STORE).toContain('reset()');
    expect(MODEL).toContain('model.jointDesigns = undefined');
  });
});
