/**
 * The concrete flow's stages — one vocabulary, stated once.
 *
 * ── The defect this replaces ───────────────────────────────────────
 *
 * The RC tab ran on three lists of stages that disagreed with each other:
 *
 *   `WorkflowStages.svelte`   drew SIX   model · demands · check · design · detailing · documents
 *   `ProRcWorkflowTab.svelte` had FIVE   disclosures
 *   `onGoTo(...)`             accepted   model · design · FLOORS · detailing · documents
 *
 * So `demands` and `check` were drawn as stages with no destination of their own; `floors` was a
 * destination with no stage; and `model` and `design` both fell through to the same `scrollTo`.
 * Three stages navigating to one disclosure is not a numbering bug — it is three names for a
 * place that has one.
 *
 * ── The correction that is not cosmetic ────────────────────────────
 *
 * The shared strip put CHECK third and DESIGN fourth, so it read "verification, then design".
 * A strip that shows a completed *Verificación* before the user has designed anything says the
 * reinforcement has been verified, which is the one claim this branch is not allowed to make by
 * accident. Reinforcement verification is not a stage BEFORE design; it is what makes the design
 * stage finished. It lives here as `verified` on `Diseñar`, not as a step of its own.
 *
 * Three distinct things were also collapsed under one word. They are separated here because §1
 * of the scope requires the screen to separate them:
 *
 *   solicitaciones          the solver's output. Produced in MODELADO, by solving.
 *   elección de reglamento  which code governs. REGLAMENTOS. Chooses nothing about steel.
 *   verificación de armaduras   whether the bars provided pass. Part of DISEÑAR, after design.
 *
 * ── Why this is pure, and takes readings rather than stores ────────
 *
 * `workspaceFilter` in `rebar-workspace.svelte.ts` records what happens otherwise: the
 * translation lived in a component, the component could not be mounted in this project's test
 * environment, and every test that wanted to assert it had to restate it — and a test that
 * restates the thing under test cannot fail when the thing under test is wrong.
 *
 * So the stage list is a function of a plain record. The component supplies the record from the
 * stores; this module never imports one, and the whole pipeline is exercisable without a DOM.
 */

/**
 * The five stages of the concrete flow, in the order the work happens.
 *
 * `codes` and not `regulations` in the id, matching `code-settings-disclosure`, which is the
 * element it owns. An id that does not match its destination is how the previous mismatch
 * started.
 */
export type RcStageId = 'model' | 'codes' | 'design' | 'detailing' | 'documents';

/**
 * Where the project is against a stage.
 *
 * Five values, and deliberately no `done`. "Done" reads as a verdict — it is the word a user
 * takes to mean the calculation is settled — and a stage strip is not entitled to say that. A
 * stage is `complete` when the USER'S ACTION that produces its output has been performed;
 * whether the result verifies is the design stage's own business and is shown by the outcome
 * badges, not here.
 */
export type RcStageState =
  /** The user performed the action and its output exists. Not a certification. */
  | 'complete'
  /** The first required stage without its output — where you ARE. */
  | 'current'
  /**
   * After the current stage. Not an error: a step not reached yet, in a project under way.
   *
   * `pending` and `blocked` would be the same situation in a strictly sequential pipeline, and
   * emitting both would be a distinction with nothing behind it. They are told apart by a real
   * condition instead — see `blocked`.
   */
  | 'pending'
  /**
   * Nothing can be started, because there is no model at all.
   *
   * The one case where a downstream stage is not merely "not yet" but genuinely unreachable:
   * an empty project has no members to design, no shells to detail and nothing to document. It
   * reads differently on purpose, because the remedy is different — load or draw something,
   * rather than finish the step above.
   */
  | 'blocked'
  /**
   * Reachable and not required. Only ever `documents`.
   *
   * Distinct from `pending` because the sentence next to it is different: pending says "not
   * yet", optional says "whenever you want, and the design is finished without it".
   */
  | 'optional';

/**
 * How ready the model is for design, as one word.
 *
 * §1 requires MODELADO to explain the model's readiness rather than only whether it exists.
 * All four values are backed by a signal a store actually publishes — there is no state here
 * that the app cannot answer:
 *
 *   `empty`     no nodes.
 *   `unsolved`  nodes, no results. The solver has not run.
 *   `stale`     results exist but do not match the combinations now defined, or the code-check
 *               baseline was computed against an older analysis revision. Two different
 *               staleness signals, one word, because the remedy for both is "solve again".
 *   `ready`     results exist and match.
 */
export type RcModelReadiness = 'empty' | 'unsolved' | 'stale' | 'ready';

/**
 * Everything the stage list needs to know, as plain booleans.
 *
 * Deliberately NOT the stores. Each field names the question rather than the store call that
 * answers it, so the mapping is visible at the one call site instead of spread through five
 * `$derived`s.
 */
export interface RcFlowReadings {
  /** `modelStore.nodes.size > 0` */
  hasModel: boolean;
  /** `resultsStore.results3D !== null || resultsStore.results !== null` */
  solved: boolean;
  /** Results disagree with the combinations defined, or the baseline is stale. */
  analysisStale: boolean;
  /** A concrete design code is chosen and usable — `regulationsStore.concreteDesignCode()`. */
  codeChosen: boolean;
  /** Station demands have been derived — `verificationStore.demandRevision > 0`. */
  hasDemands: boolean;
  /**
   * The design cycle's real state, per member.
   *
   * ── What this replaces, and why the old rule was a lie ────────────
   *
   * DISEÑAR used to complete on `designed && verified`, where `verified` was
   * `baselineRevision > 0` — the flag that says a REQUIRED-STEEL baseline was published.
   * `runCodeCheck` reads results, demands and the code adapter and never looks at a single
   * provided bar, so that rule let the stage report itself finished on a number that says
   * nothing about the reinforcement chosen. It was the exact claim F1 removed from the strip,
   * reintroduced in the completion rule.
   *
   * Designing is a CYCLE: demands, code requirements, a concrete proposal, a check of that
   * proposal, a re-proposal where it fails, and again until it converges. The stage is finished
   * only at convergence, and these four numbers are what say so. They come from
   * `verificationStore.providedSummary`, which classifies every applicable member against the
   * reinforcement actually provided.
   */
  /** Applicable members — the denominator. Zero means there is nothing to design. */
  designApplicable: number;
  /** Members that carry a concrete proposal. */
  designProposed: number;
  /** Members whose proposal passes the selected code. */
  designVerified: number;
  /**
   * Members whose proposal is provisional, failing, unavailable or stale.
   *
   * Four different situations and one number, because the remedy is the same for all four —
   * the design has not converged — and the per-element badges are where they are told apart.
   * A `warn` is deliberately NOT counted: a warning is a note on a check that passed, not an
   * unresolved one.
   */
  designUnresolved: number;
  /** Coordinated assemblies exist — `detailingStore.assemblies.length > 0`. */
  detailed: boolean;
  /** A document has been built — `detailingStore.document !== null`. */
  documented: boolean;
}

/** A stage, with its identity and the element it owns. */
export interface RcStageDef {
  id: RcStageId;
  /** i18n key for the stage's name. This module names keys; it never translates. */
  labelKey: string;
  /** i18n key for the sentence a user reads while the stage is unfinished. */
  todoKey: string;
  /**
   * Whether the flow can proceed without it.
   *
   * Only `documents` is optional, and it is the honest reading: the design is finished whether
   * or not anything was exported, nothing downstream waits on an emission, and "exported" is
   * explicitly not "issued for construction". An optional stage is never `current` — it would
   * otherwise park the "you are here" marker on a step nobody has to take.
   */
  optional?: boolean;
  /**
   * The `data-testid` of the `<details>` this stage owns.
   *
   * One stage, one disclosure, and no two stages share one. That bijection is the whole
   * correction — `RC_STAGE_DISCLOSURES` below asserts it holds, and the F0 test asserts the
   * elements exist.
   */
  disclosure: string;
}

/** A stage with the project's progress against it resolved. */
export interface RcStage extends RcStageDef {
  /**
   * Whether the action that produces this stage's output has been performed.
   *
   * Named `complete` and not `done` for the reason on `RcStageState`: this is a statement about
   * what the user did, never about whether the result verifies.
   */
  complete: boolean;
  state: RcStageState;
}

/**
 * The pipeline.
 *
 * `todoKey` reuses the existing `design.stage.*` sentences wherever one already says the right
 * thing. Two are new because no existing key says them: the code stage had no sentence at all
 * (it was not a stage), and the design stage's old sentence pointed at demands, which is now
 * the previous stage's business.
 */
export const RC_STAGES: readonly RcStageDef[] = [
  {
    id: 'model',
    labelKey: 'design.stage.model',
    todoKey: 'design.stage.needModel',
    disclosure: 'design-overview-disclosure',
  },
  {
    id: 'codes',
    labelKey: 'design.stage.codes',
    todoKey: 'design.stage.needCode',
    disclosure: 'code-settings-disclosure',
  },
  {
    id: 'design',
    labelKey: 'design.stage.design',
    todoKey: 'design.stage.needDemands',
    /*
     * The design surface itself, not the floor pass.
     *
     * It used to be `floor-families-disclosure`, which was the only `<details>` the stage had —
     * beams and columns were designed in `ProDesignTab`, mounted below every other stage. So the
     * stage's own destination was an OPTIONAL sub-step of it, and clicking DISEÑAR took you past
     * the design table to the floor families. `ProDesignTab` now lives inside this disclosure and
     * the floor pass is a sub-step within it.
     */
    disclosure: 'design-stage-disclosure',
  },
  {
    id: 'detailing',
    labelKey: 'design.stage.detailing',
    todoKey: 'design.stage.needDesign',
    disclosure: 'detailing-disclosure',
  },
  {
    id: 'documents',
    labelKey: 'design.stage.documents',
    todoKey: 'design.stage.needDetailing',
    optional: true,
    disclosure: 'documents-disclosure',
  },
] as const;

/** Every disclosure a stage can navigate to. Exported so the bijection is assertable. */
export const RC_STAGE_DISCLOSURES: readonly string[] = RC_STAGES.map((s) => s.disclosure);

/**
 * Which model readiness a set of readings describes.
 *
 * `stale` outranks `ready` and not the other way round: results that disagree with the
 * combinations now defined are worse than no results, because they look like an answer.
 */
export function rcModelReadiness(r: RcFlowReadings): RcModelReadiness {
  if (!r.hasModel) return 'empty';
  if (!r.solved) return 'unsolved';
  if (r.analysisStale) return 'stale';
  return 'ready';
}

/**
 * Whether each stage has produced its output.
 *
 * MODELADO is done only when the model is `ready` — solved AND not stale. A stale solve is not
 * a finished stage, and this is the one place that decision is made.
 *
 * DISEÑAR is done when members carry reinforcement AND that reinforcement has been checked.
 * The conjunction is the correction described in the header: designed-but-unchecked is a real
 * state, it is not finished, and it must not read as verified.
 */
function isComplete(id: RcStageId, r: RcFlowReadings): boolean {
  switch (id) {
    case 'model': return rcModelReadiness(r) === 'ready';
    case 'codes': return r.codeChosen && r.hasDemands;
    /*
     * Convergence, not activity. Every applicable member carries a proposal, every proposal
     * passes, and nothing is left provisional, failed, unavailable or stale. A model with
     * nothing applicable is not "finished designing" — it has not started, and `designApplicable
     * === 0` keeps the stage current rather than claiming a vacuous success.
     */
    case 'design':
      return r.designApplicable > 0
        && r.designProposed === r.designApplicable
        && r.designVerified === r.designApplicable
        && r.designUnresolved === 0;
    case 'detailing': return r.detailed;
    case 'documents': return r.detailed && r.documented;
  }
}

/**
 * The stage list with progress resolved.
 *
 * "You are here" is the first stage that has not produced its output — deliberately not "the
 * first reachable one". The two differ exactly when the current step is itself waiting on
 * something (a model loaded but not solved), and there the strip must still point at MODELADO
 * and say what it needs, rather than pointing further down at a step that cannot start either.
 * It is where you ARE, not where you could click.
 *
 * Derived on every call rather than stored, so stepping back to an earlier disclosure does not
 * move the marker: it tracks the PROJECT's progress, not the panel's scroll position. That also
 * removes the possibility of a "current stage" variable falling out of sync with the commands,
 * which is what the shared strip's own header warns about.
 */
export function rcStages(r: RcFlowReadings): RcStage[] {
  const complete = RC_STAGES.map((s) => isComplete(s.id, r));
  /*
   * The first REQUIRED stage without its output. Optional stages are skipped, so the marker
   * never lands on a step nobody has to take — with everything designed and detailed, "you are
   * here" belongs nowhere rather than on Documentos.
   */
  const currentIdx = RC_STAGES.findIndex((s, i) => !complete[i] && !s.optional);

  /*
   * An empty project is the one case where downstream stages are unreachable rather than
   * merely unfinished, and the remedy differs: load or draw something, instead of finishing
   * the step above. Read from the same readiness the MODELADO stage shows, so the strip and
   * the stage cannot disagree about whether there is a model.
   */
  const noModel = rcModelReadiness(r) === 'empty';

  return RC_STAGES.map((s, i): RcStage => {
    if (complete[i]) return { ...s, complete: true, state: 'complete' };
    if (i === currentIdx) return { ...s, complete: false, state: 'current' };
    // Optional outranks blocked and pending: `documents` is never "not yet", it is "not
    // required" — and that stays true whatever is upstream of it.
    if (s.optional) return { ...s, complete: false, state: 'optional' };
    return { ...s, complete: false, state: noModel ? 'blocked' : 'pending' };
  });
}

/**
 * The sentence a stage owes the reader right now.
 *
 * Only MODELADO varies, and it has to: "load or draw a model" is wrong the moment a model is
 * loaded, and the remedy for each readiness is different — draw one, solve it, solve it again.
 * The strip this replaces got that right with an inline conditional; keeping a single static
 * key per stage would have been a regression in what the panel tells you.
 *
 * The other four have one answer each, because their prerequisite is a single fact.
 */
export function rcStageTodoKey(s: RcStage, readiness: RcModelReadiness): string {
  if (s.id !== 'model') return s.todoKey;
  switch (readiness) {
    case 'empty': return 'design.stage.needModel';
    case 'unsolved': return 'design.stage.needSolve';
    case 'stale': return 'design.stage.readiness.stale';
    case 'ready': return s.todoKey;
  }
}

/** The stage the user is on, or null when every REQUIRED stage has its output. */
export function currentRcStage(stages: readonly RcStage[]): RcStage | null {
  return stages.find((s) => s.state === 'current') ?? null;
}

/** The disclosure a stage id owns, or null for an id that is not a stage. */
export function rcStageDisclosure(id: string): string | null {
  return RC_STAGES.find((s) => s.id === id)?.disclosure ?? null;
}

/**
 * The five states, narrowed to the four `StageSection` accepts.
 *
 * `StageSection.svelte` is shared with the metallic flow — `ProConnectionsTab` renders it — so
 * its `State` union is not this branch's to widen. The mapping is here rather than inline at
 * the call site so that there is still exactly ONE derivation of stage state in the concrete
 * flow: the timeline and the five disclosures read the same `rcStages()` array, and a section
 * cannot come to disagree with the strip above it about whether its step is finished.
 *
 * `pending` narrows to `blocked` because that is the closest thing the shared component can
 * draw. The distinction survives where it is visible — in the timeline, which is this branch's
 * own component and does render all five.
 */
export function rcStageSectionState(s: RcStage): 'done' | 'current' | 'blocked' | 'optional' {
  switch (s.state) {
    case 'complete': return 'done';
    case 'current': return 'current';
    case 'optional': return 'optional';
    case 'pending':
    case 'blocked': return 'blocked';
  }
}
