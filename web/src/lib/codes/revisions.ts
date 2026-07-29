/**
 * The revision dependency graph.
 *
 * ── The problem ────────────────────────────────────────────────
 *
 * Stabileo already had `analysisRevision`, `demandRevision`, `baselineRevision` and
 * `detailingRevision`, each invalidating by hand at its own call sites. That works while
 * there are four of them and stops working at nine, because the interesting question is
 * not "did X change" but "given X changed, what is no longer trustworthy, and what is
 * still perfectly good?".
 *
 * Getting that wrong in either direction is a product defect. Over-invalidating throws
 * away a user's work and forces a needless solve — the PR15 regression, one level up.
 * Under-invalidating leaves a stale certificate looking current, which is worse.
 *
 * ── The graph ──────────────────────────────────────────────────
 *
 *   regulationConfig
 *        │
 *        ├──────────────► loadDefinition ──► generatedLoad ──► combination
 *        │                                                          │
 *        │                                                          ▼
 *        │                                                      analysis
 *        │                                                          │
 *        └──────────────────────────────────────────────► design ◄──┘
 *                                                             │
 *                                        materialSpec ────────►│
 *                                                             ▼
 *                                                       reinforcement
 *                                                             │
 *                                                             ▼
 *                                                         detailing
 *                                                             │
 *                                                             ▼
 *                                                         document
 *
 * `materialSpec` feeds `design` (f'c, f_y) and `reinforcement` (cover, aggregate size)
 * but NOT `analysis`: changing the concrete grade does not move the forces in a linear
 * elastic model whose stiffness came from E, and changing the aggregate size certainly
 * does not. That edge is what makes "change the aggregate size" cost a detailing re-run
 * rather than a solve.
 *
 * Pure: no store, no runes.
 */

// ─── Stages ──────────────────────────────────────────────────────

export const REVISION_STAGES = [
  'regulationConfig',
  'materialSpec',
  'loadDefinition',
  'generatedLoad',
  'combination',
  'analysis',
  'design',
  'reinforcement',
  'detailing',
  'document',
] as const;
export type RevisionStage = (typeof REVISION_STAGES)[number];

/** Direct dependencies: stage → the stages it consumes. */
const DEPENDS_ON: Readonly<Record<RevisionStage, readonly RevisionStage[]>> = Object.freeze({
  regulationConfig: [],
  materialSpec: [],
  loadDefinition: ['regulationConfig'],
  generatedLoad: ['loadDefinition'],
  combination: ['generatedLoad'],
  analysis: ['combination'],
  design: ['analysis', 'regulationConfig', 'materialSpec'],
  reinforcement: ['design', 'materialSpec'],
  detailing: ['reinforcement'],
  document: ['detailing', 'design', 'analysis', 'regulationConfig'],
});

/** Reverse edges, computed once. */
const DEPENDENTS: Record<RevisionStage, RevisionStage[]> = (() => {
  const out = {} as Record<RevisionStage, RevisionStage[]>;
  for (const s of REVISION_STAGES) out[s] = [];
  for (const s of REVISION_STAGES) {
    for (const dep of DEPENDS_ON[s]) out[dep].push(s);
  }
  return out;
})();

export function dependenciesOf(stage: RevisionStage): readonly RevisionStage[] {
  return DEPENDS_ON[stage];
}

/**
 * Every stage transitively downstream of `stage`, in dependency order.
 *
 * Excludes `stage` itself: the caller is bumping that one deliberately.
 */
export function downstreamOf(stage: RevisionStage): RevisionStage[] {
  const seen = new Set<RevisionStage>();
  const queue = [...DEPENDENTS[stage]];
  while (queue.length > 0) {
    const s = queue.shift()!;
    if (seen.has(s)) continue;
    seen.add(s);
    queue.push(...DEPENDENTS[s]);
  }
  return REVISION_STAGES.filter((s) => seen.has(s));
}

/** True when `later` depends, directly or transitively, on `earlier`. */
export function dependsOn(later: RevisionStage, earlier: RevisionStage): boolean {
  return downstreamOf(earlier).includes(later);
}

// ─── State ───────────────────────────────────────────────────────

export type RevisionVector = Record<RevisionStage, number>;

/**
 * What a stage's output was produced against.
 *
 * A stage's result is FRESH when, for every dependency, the revision it recorded still
 * matches the current one. This is the whole mechanism: a stored certificate carries the
 * vector it was made with, and freshness is a comparison rather than a flag someone has
 * to remember to clear.
 */
export interface StageStamp {
  stage: RevisionStage;
  /** Revision of this stage when the output was produced. */
  own: number;
  /** Revisions of each dependency at production time. */
  inputs: Partial<RevisionVector>;
}

export function emptyRevisions(): RevisionVector {
  const out = {} as RevisionVector;
  for (const s of REVISION_STAGES) out[s] = 0;
  return out;
}

/** Bump one stage and every stage downstream of it. */
export function bump(current: RevisionVector, stage: RevisionStage): RevisionVector {
  const next = { ...current };
  next[stage] = current[stage] + 1;
  for (const d of downstreamOf(stage)) next[d] = current[d] + 1;
  return next;
}

/**
 * Bump a stage WITHOUT touching a subtree that the change provably does not affect.
 *
 * Used for the one case where the graph is coarser than reality: changing the RC design
 * regulation invalidates design and everything after it, but must not invalidate the
 * generated loads or the analysis — the forces are still the forces. Rather than
 * special-casing that inside `bump`, the caller states which stages to preserve, and a
 * guard refuses to preserve something that genuinely depends on the change.
 */
export function bumpPreserving(
  current: RevisionVector, stage: RevisionStage, preserve: readonly RevisionStage[],
): RevisionVector {
  for (const p of preserve) {
    if (dependsOn(p, stage) === false) continue;
    // `p` really does depend on `stage`; preserving it would hide a stale result.
    if (DEPENDS_ON[p].includes(stage)) {
      throw new Error(
        `Cannot preserve "${p}" while bumping "${stage}": it depends on it directly. ` +
        'Preserving it would leave a stale result presented as current.',
      );
    }
  }
  const next = { ...current };
  next[stage] = current[stage] + 1;
  const keep = new Set(preserve);
  for (const d of downstreamOf(stage)) {
    if (keep.has(d)) continue;
    next[d] = current[d] + 1;
  }
  return next;
}

export function stamp(
  stage: RevisionStage, revisions: RevisionVector,
): StageStamp {
  const inputs: Partial<RevisionVector> = {};
  for (const dep of DEPENDS_ON[stage]) inputs[dep] = revisions[dep];
  return { stage, own: revisions[stage], inputs };
}

export type Freshness = 'fresh' | 'stale' | 'absent';

export interface FreshnessResult {
  state: Freshness;
  /** Dependencies that have moved since the output was produced. */
  changed: RevisionStage[];
}

/** Is a stamped output still valid against the current revisions? */
export function freshness(
  s: StageStamp | null | undefined, revisions: RevisionVector,
): FreshnessResult {
  if (!s) return { state: 'absent', changed: [] };
  const changed: RevisionStage[] = [];
  for (const dep of DEPENDS_ON[s.stage]) {
    if ((s.inputs[dep] ?? -1) !== revisions[dep]) changed.push(dep);
  }
  if (s.own !== revisions[s.stage]) {
    // The stage itself was bumped after the output was produced.
    return { state: 'stale', changed: changed.length > 0 ? changed : [s.stage] };
  }
  return { state: changed.length === 0 ? 'fresh' : 'stale', changed };
}

// ─── Change descriptions, for the UI ─────────────────────────────

export type ChangeKind =
  /** A load-affecting regulation role. */
  | 'loadRegulation'
  /** A design-only regulation role (concrete, steel, …). */
  | 'designRegulation'
  /** Concrete/steel material specification. */
  | 'materialSpec'
  /** A detailing-only material property such as maximum aggregate size. */
  | 'detailingSpec'
  /** Manual edit to loads. */
  | 'loadEdit'
  /** Manual edit to reinforcement. */
  | 'reinforcementEdit';

export interface ChangeConsequence {
  kind: ChangeKind;
  /** Stage that is bumped first. */
  origin: RevisionStage;
  /** Stages preserved despite being downstream, with the reason. */
  preserved: RevisionStage[];
  /** Stages invalidated. */
  invalidated: RevisionStage[];
  /** True when the user must re-run the structural solve. */
  requiresSolve: boolean;
  /** i18n key explaining the consequence. */
  explanationKey: string;
}

/**
 * What each kind of change actually costs.
 *
 * This table is the honest answer to "why did my results disappear?" and, just as
 * importantly, to "why did they NOT disappear?".
 */
export function consequenceOf(kind: ChangeKind): ChangeConsequence {
  switch (kind) {
    case 'loadRegulation':
      return {
        kind, origin: 'regulationConfig', preserved: [],
        invalidated: downstreamOf('regulationConfig'),
        requiresSolve: true,
        explanationKey: 'revisions.consequence.loadRegulation',
      };
    case 'designRegulation':
      // The forces are still the forces. Preserve everything up to and including the
      // analysis; invalidate design and after.
      return {
        kind, origin: 'design',
        preserved: ['loadDefinition', 'generatedLoad', 'combination', 'analysis'],
        invalidated: ['design', ...downstreamOf('design')],
        requiresSolve: false,
        explanationKey: 'revisions.consequence.designRegulation',
      };
    case 'materialSpec':
      return {
        kind, origin: 'materialSpec',
        preserved: ['loadDefinition', 'generatedLoad', 'combination', 'analysis'],
        invalidated: downstreamOf('materialSpec').filter((s) => s !== 'analysis'),
        requiresSolve: false,
        explanationKey: 'revisions.consequence.materialSpec',
      };
    case 'detailingSpec':
      // Aggregate size and the like: the section capacities do not change, only whether
      // the bars fit. Design survives; reinforcement fit and detailing are re-run.
      return {
        kind, origin: 'reinforcement',
        preserved: ['loadDefinition', 'generatedLoad', 'combination', 'analysis', 'design'],
        invalidated: ['reinforcement', 'detailing', 'document'],
        requiresSolve: false,
        explanationKey: 'revisions.consequence.detailingSpec',
      };
    case 'loadEdit':
      return {
        kind, origin: 'generatedLoad', preserved: [],
        invalidated: downstreamOf('generatedLoad'),
        requiresSolve: true,
        explanationKey: 'revisions.consequence.loadEdit',
      };
    case 'reinforcementEdit':
      return {
        kind, origin: 'reinforcement',
        preserved: ['loadDefinition', 'generatedLoad', 'combination', 'analysis', 'design'],
        invalidated: ['detailing', 'document'],
        requiresSolve: false,
        explanationKey: 'revisions.consequence.reinforcementEdit',
      };
  }
}

/** Apply a change's consequence to a revision vector. */
export function applyChange(
  current: RevisionVector, kind: ChangeKind,
): { revisions: RevisionVector; consequence: ChangeConsequence } {
  const c = consequenceOf(kind);
  const revisions = c.preserved.length > 0
    ? bumpPreserving(current, c.origin, c.preserved)
    : bump(current, c.origin);
  return { revisions, consequence: c };
}
