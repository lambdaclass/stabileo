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
  RC_STAGES, RC_STAGE_DISCLOSURES, currentRcStage, rcModelReadiness, rcStageDisclosure,
  rcStageTodoKey, rcStages,
  type RcFlowReadings,
} from '../rc-stages';
import es from '../../i18n/locales/es';
import en from '../../i18n/locales/en';

/** Nothing done. Every scenario below is this, with the prefix it needs turned on. */
const NOTHING: RcFlowReadings = {
  hasModel: false, solved: false, analysisStale: false, codeChosen: false,
  hasDemands: false, detailed: false, documented: false,
  designApplicable: 0, designProposed: 0, designVerified: 0, designUnresolved: 0,
};

/** A design cycle that converged: every applicable member proposed, checked and passing. */
const CONVERGED = { designApplicable: 4, designProposed: 4, designVerified: 4, designUnresolved: 0 };
const r = (over: Partial<RcFlowReadings>): RcFlowReadings => ({ ...NOTHING, ...over });

/** A project that has run the whole pipeline. */
const COMPLETE = r({
  hasModel: true, solved: true, codeChosen: true, hasDemands: true,
  ...CONVERGED, detailed: true, documented: true,
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
    expect(s.slice(1).every((x) => x.state !== 'current'), 'only one current').toBe(true);
  });

  it('a complete project has no current stage', () => {
    const s = rcStages(COMPLETE);
    expect(s.every((x) => x.complete)).toBe(true);
    expect(currentRcStage(s)).toBeNull();
  });

  /*
   * The five states, each reached by a real project rather than constructed. `pending` and
   * `blocked` are told apart by whether there is a model at all — in a strictly sequential
   * pipeline they would otherwise be the same situation with two names.
   */
  it('reaches all five states', () => {
    const empty = rcStages(NOTHING);
    expect(empty.find((x) => x.id === 'model')!.state).toBe('current');
    expect(empty.find((x) => x.id === 'design')!.state, 'no model: unreachable')
      .toBe('blocked');
    expect(empty.find((x) => x.id === 'documents')!.state, 'never "not yet"')
      .toBe('optional');

    const underway = rcStages(r({ hasModel: true }));
    expect(underway.find((x) => x.id === 'design')!.state, 'a model exists: merely not yet')
      .toBe('pending');

    expect(rcStages(COMPLETE).find((x) => x.id === 'documents')!.state).toBe('complete');
  });

  /*
   * An optional stage never takes the "you are here" marker: it would park it on a step nobody
   * has to take. With everything required finished, the marker belongs nowhere.
   */
  it('the optional stage is never current', () => {
    const allButDocs = r({
      hasModel: true, solved: true, codeChosen: true, hasDemands: true,
      ...CONVERGED, detailed: true,
    });
    const s = rcStages(allButDocs);
    expect(currentRcStage(s)).toBeNull();
    expect(s.find((x) => x.id === 'documents')!.state).toBe('optional');
  });

  /* `complete` is a statement about what the user did, never a verdict on the calculation. */
  it('does not use the word "done" anywhere in its states', () => {
    const states = new Set(rcStages(COMPLETE).map((x) => x.state));
    expect([...states]).not.toContain('done');
  });

  /*
   * "Where you are", not "where you could click". A model that is loaded but not solved keeps
   * the marker on MODELADO — pointing further down the pipeline would name a step that cannot
   * be started either.
   */
  it('a loaded but unsolved model stays on MODELADO', () => {
    expect(currentRcStage(rcStages(r({ hasModel: true })))?.id).toBe('model');
  });

  /*
   * The last step lands on null rather than on `documents`: an optional stage never takes the
   * marker. Exporting is not the step that finishes the work.
   */
  it('the stages advance one at a time as their outputs appear', () => {
    const steps: Array<[Partial<RcFlowReadings>, string | null]> = [
      [{ hasModel: true, solved: true }, 'codes'],
      [{ hasModel: true, solved: true, codeChosen: true, hasDemands: true }, 'design'],
      [{ hasModel: true, solved: true, codeChosen: true, hasDemands: true,
         ...CONVERGED }, 'detailing'],
      [{ hasModel: true, solved: true, codeChosen: true, hasDemands: true,
         ...CONVERGED, detailed: true }, null],
    ];
    for (const [over, expected] of steps) {
      expect(currentRcStage(rcStages(r(over)))?.id ?? null, JSON.stringify(over)).toBe(expected);
    }
  });
});

const UPSTREAM = {
  hasModel: true, solved: true, codeChosen: true, hasDemands: true,
} as const;

describe('DISEÑAR completes on convergence, never on activity', () => {
  /*
   * The defect this replaces, and it shipped. The stage used to complete on
   * `designed && verified`, where `verified` was `baselineRevision > 0` — a flag saying a
   * REQUIRED-STEEL baseline was published. `runCodeCheck` reads results, demands and the code
   * adapter and never looks at one provided bar, so the stage could report itself finished on a
   * number that says nothing about the reinforcement chosen.
   */
  it('1. a code baseline with no proposal does not complete it', () => {
    const s = rcStages(r({ ...UPSTREAM, designApplicable: 4, designProposed: 0 }));
    expect(s.find((x) => x.id === 'design')!.complete).toBe(false);
  });

  it('2. a proposal nobody checked does not complete it', () => {
    const s = rcStages(r({
      ...UPSTREAM, designApplicable: 4, designProposed: 4, designVerified: 0,
    }));
    expect(s.find((x) => x.id === 'design')!.complete).toBe(false);
  });

  it('3. a proposal that fails does not complete it', () => {
    const s = rcStages(r({
      ...UPSTREAM, designApplicable: 4, designProposed: 4, designVerified: 3, designUnresolved: 1,
    }));
    expect(s.find((x) => x.id === 'design')!.complete).toBe(false);
  });

  /* Partly proposed is partly designed, which is not designed. */
  it('4. a partially proposed model does not complete it', () => {
    const s = rcStages(r({
      ...UPSTREAM, designApplicable: 4, designProposed: 2, designVerified: 2,
    }));
    expect(s.find((x) => x.id === 'design')!.complete).toBe(false);
  });

  it('5. only a fully proposed and fully verified model completes it', () => {
    const s = rcStages(r({ ...UPSTREAM, ...CONVERGED }));
    expect(s.find((x) => x.id === 'design')!.complete).toBe(true);
  });

  /*
   * 6. The cycle keeps its trace. Proposal → check → re-proposal → check is a sequence of
   * readings, and the stage tracks it without remembering anything: it is unfinished at every
   * intermediate step and finished only at the end, so stepping backwards un-finishes it. A
   * stage that latched would report a convergence that a later edit had broken.
   */
  it('6. the propose-verify-repropose cycle stays traceable, and does not latch', () => {
    const steps = [
      [{ designApplicable: 4, designProposed: 4, designVerified: 1, designUnresolved: 3 }, false],
      [{ designApplicable: 4, designProposed: 4, designVerified: 3, designUnresolved: 1 }, false],
      [{ designApplicable: 4, designProposed: 4, designVerified: 4, designUnresolved: 0 }, true],
      // An edit puts one member back into doubt: the stage stops being complete again.
      [{ designApplicable: 4, designProposed: 4, designVerified: 3, designUnresolved: 1 }, false],
    ] as const;
    for (const [counts, expected] of steps) {
      const s = rcStages(r({ ...UPSTREAM, ...counts }));
      expect(s.find((x) => x.id === 'design')!.complete, JSON.stringify(counts)).toBe(expected);
    }
  });

  /*
   * Provisional, failed, unavailable and stale are four situations with one remedy — the design
   * has not converged — and any of them alone is enough to keep the stage open. The per-element
   * badges are where they are told apart.
   */
  it('any unresolved member keeps it open, whatever the reason', () => {
    for (const n of [1, 2, 4]) {
      const s = rcStages(r({
        ...UPSTREAM, designApplicable: 4, designProposed: 4,
        designVerified: 4 - n, designUnresolved: n,
      }));
      expect(s.find((x) => x.id === 'design')!.complete, `${n} unresolved`).toBe(false);
    }
  });

  /*
   * A model with nothing applicable has not finished designing — it has not started. Completing
   * on an empty denominator would be a vacuous success, and it is the shape a fresh project has.
   */
  it('nothing applicable is not a finished design', () => {
    const s = rcStages(r({ ...UPSTREAM, designApplicable: 0 }));
    expect(s.find((x) => x.id === 'design')!.complete).toBe(false);
    expect(currentRcStage(s)?.id).toBe('design');
  });
});

describe('7. no sentence says required steel is verified reinforcement', () => {
  /*
   * The claim this branch may not make by accident, checked on the copy rather than on the
   * code. `runCodeCheck` publishes what the CODE REQUIRES; it never reads a provided bar. A
   * stage sentence that called that a verification would be wrong in the place a user reads.
   */
  it('the design stage sentence does not promise a verification', () => {
    for (const dict of [es, en]) {
      const sentence = String(dict['design.stage.needDemands' as keyof typeof dict] ?? '');
      expect(sentence.length).toBeGreaterThan(0);
      expect(sentence, 'it asks for demands, it does not claim bars were checked')
        .not.toMatch(/armadura verificada|verified reinforcement/i);
    }
  });

  it('the code stage sentence still denies computing anything', () => {
    expect(es['design.stage.needCode']).toMatch(/no (las )?calcula/i);
    expect(en['design.stage.needCode']).toMatch(/neither|does not compute/i);
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
    expect(s.find((x) => x.id === 'model')!.complete).toBe(false);
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

describe('MODELADO says what it is actually waiting for', () => {
  /*
   * The regression this caught in review: a single static key per stage made the strip say
   * "load or draw a model" while a model was loaded. The remedy differs for each readiness, and
   * the sentence has to differ with it.
   */
  it.each([
    ['empty', 'design.stage.needModel'],
    ['unsolved', 'design.stage.needSolve'],
    ['stale', 'design.stage.readiness.stale'],
  ] as const)('with a %s model it asks for %s', (readiness, key) => {
    const model = rcStages(NOTHING).find((s) => s.id === 'model')!;
    expect(rcStageTodoKey(model, readiness)).toBe(key);
  });

  /** The other four have one prerequisite each, so their sentence does not move. */
  it('the other stages keep their own sentence whatever the model is doing', () => {
    for (const s of rcStages(NOTHING).filter((x) => x.id !== 'model')) {
      for (const readiness of ['empty', 'unsolved', 'stale', 'ready'] as const) {
        expect(rcStageTodoKey(s, readiness)).toBe(s.todoKey);
      }
    }
  });

  it('every sentence it can name exists in es and en', () => {
    const model = rcStages(NOTHING).find((s) => s.id === 'model')!;
    for (const readiness of ['empty', 'unsolved', 'stale', 'ready'] as const) {
      const k = rcStageTodoKey(model, readiness);
      expect(es[k as keyof typeof es], k).toBeTruthy();
      expect(en[k as keyof typeof en], k).toBeTruthy();
    }
  });
});
