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

/** Where the project is against a stage. */
export type RcStageState =
  /** Its output exists. */
  | 'done'
  /** The first stage whose output does not exist — where you ARE. */
  | 'current'
  /** After the current one. Not an error: a step not reached yet. */
  | 'blocked';

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
  /** Members carry provided reinforcement — `verificationStore.providedSummary.total > 0`. */
  designed: boolean;
  /**
   * The code check has run against the reinforcement provided.
   *
   * NOT a stage. Read `verificationStore.baselineRevision > 0`, and it only ever means
   * anything once `designed` is true — see the header.
   */
  verified: boolean;
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
  done: boolean;
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
    disclosure: 'floor-families-disclosure',
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
function isDone(id: RcStageId, r: RcFlowReadings): boolean {
  switch (id) {
    case 'model': return rcModelReadiness(r) === 'ready';
    case 'codes': return r.codeChosen && r.hasDemands;
    case 'design': return r.designed && r.verified;
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
  const done = RC_STAGES.map((s) => isDone(s.id, r));
  const currentIdx = done.indexOf(false);
  return RC_STAGES.map((s, i) => ({
    ...s,
    done: done[i],
    state: done[i] ? 'done' : i === currentIdx ? 'current' : 'blocked',
  }));
}

/** The stage the user is on, or null when every stage has produced its output. */
export function currentRcStage(stages: readonly RcStage[]): RcStage | null {
  return stages.find((s) => s.state === 'current') ?? null;
}

/** The disclosure a stage id owns, or null for an id that is not a stage. */
export function rcStageDisclosure(id: string): string | null {
  return RC_STAGES.find((s) => s.id === id)?.disclosure ?? null;
}
