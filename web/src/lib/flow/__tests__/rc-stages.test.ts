/**
 * The stage vocabulary, and the two claims it exists to stop the app from making.
 *
 * The interesting assertions here are not "five stages". They are:
 *
 *   1. one stage owns one disclosure, and no two share — the bijection whose absence produced
 *      six drawn stages, five disclosures and three navigating to the same place;
 *   2. a project that has designed but not checked does NOT read as a finished design stage,
 *      because the previous strip put a completed *Verificación* before DISEÑAR and that says
 *      the reinforcement was verified before it existed.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RC_STAGES, RC_STAGE_DISCLOSURES, currentRcStage, rcModelReadiness, rcStageDisclosure, rcStages,
  type RcFlowReadings,
} from '../rc-stages';
import es from '../../i18n/locales/es';
import en from '../../i18n/locales/en';

/** Nothing done. Every scenario below is this, with the prefix it needs turned on. */
const NOTHING: RcFlowReadings = {
  hasModel: false, solved: false, analysisStale: false, codeChosen: false,
  hasDemands: false, designed: false, verified: false, detailed: false, documented: false,
};
const r = (over: Partial<RcFlowReadings>): RcFlowReadings => ({ ...NOTHING, ...over });

/** A project that has run the whole pipeline. */
const COMPLETE = r({
  hasModel: true, solved: true, codeChosen: true, hasDemands: true,
  designed: true, verified: true, detailed: true, documented: true,
});

describe('one stage, one destination', () => {
  it('has five stages', () => {
    expect(RC_STAGES).toHaveLength(5);
  });

  /*
   * The whole correction, in one assertion. Three stages sharing a destination is what made the
   * previous strip un-navigable: clicking `demands`, `check` or `design` all scrolled to the
   * same element, so the strip could not tell the user where they had just been sent.
   */
  it('no two stages own the same disclosure', () => {
    expect(new Set(RC_STAGE_DISCLOSURES).size).toBe(RC_STAGES.length);
  });

  it('every stage id resolves to its own disclosure, and nothing else does', () => {
    for (const s of RC_STAGES) expect(rcStageDisclosure(s.id)).toBe(s.disclosure);
    // The ids the OLD strip drew with no destination of their own. They must not resolve.
    for (const orphan of ['demands', 'check', 'floors']) {
      expect(rcStageDisclosure(orphan), `${orphan} is not a stage`).toBeNull();
    }
  });

  /*
   * The disclosures are named as strings here and mounted in a Svelte file that this project's
   * unit environment cannot render. Asserting against the source is weaker than asserting
   * against the DOM and stronger than asserting nothing: it catches a testid renamed on one
   * side only, which is precisely how the two lists drifted apart the first time. The E2E
   * suite asserts they are real elements.
   */
  it('each disclosure exists in the tab that mounts them', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const tab = readFileSync(
      resolve(here, '../../../components/pro/ProRcWorkflowTab.svelte'), 'utf8');
    for (const d of RC_STAGE_DISCLOSURES) {
      expect(tab, `${d} is not mounted`).toContain(d);
    }
  });
});

describe('the stages resolve against a project', () => {
  it('an empty project is on MODELADO, and nothing after it is current', () => {
    const s = rcStages(NOTHING);
    expect(currentRcStage(s)?.id).toBe('model');
    expect(s.filter((x) => x.state === 'current')).toHaveLength(1);
    expect(s.slice(1).every((x) => x.state === 'blocked')).toBe(true);
  });

  it('a complete project has no current stage', () => {
    const s = rcStages(COMPLETE);
    expect(s.every((x) => x.done)).toBe(true);
    expect(currentRcStage(s)).toBeNull();
  });

  /*
   * "Where you are", not "where you could click". A model that is loaded but not solved keeps
   * the marker on MODELADO — pointing further down the pipeline would name a step that cannot
   * be started either.
   */
  it('a loaded but unsolved model stays on MODELADO', () => {
    expect(currentRcStage(rcStages(r({ hasModel: true })))?.id).toBe('model');
  });

  it('the stages advance one at a time as their outputs appear', () => {
    const steps: Array<[Partial<RcFlowReadings>, string]> = [
      [{ hasModel: true, solved: true }, 'codes'],
      [{ hasModel: true, solved: true, codeChosen: true, hasDemands: true }, 'design'],
      [{ hasModel: true, solved: true, codeChosen: true, hasDemands: true,
         designed: true, verified: true }, 'detailing'],
      [{ hasModel: true, solved: true, codeChosen: true, hasDemands: true,
         designed: true, verified: true, detailed: true }, 'documents'],
    ];
    for (const [over, expected] of steps) {
      expect(currentRcStage(rcStages(r(over)))?.id, JSON.stringify(over)).toBe(expected);
    }
  });
});

describe('a design is not finished until it has been checked', () => {
  const designedNotChecked = r({
    hasModel: true, solved: true, codeChosen: true, hasDemands: true, designed: true,
  });

  /*
   * The claim the previous strip made by accident. `verified` false with `designed` true is a
   * real state — the design ran, the code check has not — and it must read as unfinished.
   */
  it('designed but unchecked leaves DISEÑAR current, not done', () => {
    const s = rcStages(designedNotChecked);
    const design = s.find((x) => x.id === 'design')!;
    expect(design.done).toBe(false);
    expect(design.state).toBe('current');
  });

  it('and checking it is what finishes the stage', () => {
    const s = rcStages({ ...designedNotChecked, verified: true });
    expect(s.find((x) => x.id === 'design')!.done).toBe(true);
  });

  /*
   * The other half: a check that ran with nothing designed cannot finish the stage either.
   * Both halves matter — one guards against claiming verification early, the other against a
   * stale baseline standing in for a design.
   */
  it('checked but undesigned does not finish it', () => {
    const s = rcStages(r({
      hasModel: true, solved: true, codeChosen: true, hasDemands: true, verified: true,
    }));
    expect(s.find((x) => x.id === 'design')!.done).toBe(false);
  });
});

describe('model readiness says which of the four situations it is', () => {
  it.each([
    [NOTHING, 'empty'],
    [r({ hasModel: true }), 'unsolved'],
    [r({ hasModel: true, solved: true, analysisStale: true }), 'stale'],
    [r({ hasModel: true, solved: true }), 'ready'],
  ])('%#', (readings, expected) => {
    expect(rcModelReadiness(readings as RcFlowReadings)).toBe(expected);
  });

  /*
   * Stale outranks ready, and a stale solve does not finish MODELADO. Results that disagree
   * with the combinations now defined are worse than no results, because they look like an
   * answer — and the stage that consumes them would otherwise proceed on them.
   */
  it('a stale solve does not finish MODELADO', () => {
    const s = rcStages(r({ hasModel: true, solved: true, analysisStale: true }));
    expect(s.find((x) => x.id === 'model')!.done).toBe(false);
    expect(currentRcStage(s)?.id).toBe('model');
  });
});

describe('the keys it names exist', () => {
  it.each(RC_STAGES.map((s) => [s.id, s.labelKey, s.todoKey]))(
    '%s has both its sentences in es and en', (_id, labelKey, todoKey) => {
      for (const dict of [es, en]) {
        expect(dict[labelKey as keyof typeof dict], labelKey).toBeTruthy();
        expect(dict[todoKey as keyof typeof dict], todoKey).toBeTruthy();
      }
    });

  /*
   * The Reglamentos sentence carries the distinction §1 of the scope demands: choosing a code
   * is not computing demands and is not verifying reinforcement. Asserted on meaning rather
   * than wording — it must deny computing something, in both languages.
   */
  it('the code stage says what it does NOT do', () => {
    expect(es['design.stage.needCode']).toMatch(/no (las )?calcula/i);
    expect(en['design.stage.needCode']).toMatch(/neither|does not compute/i);
  });
});
