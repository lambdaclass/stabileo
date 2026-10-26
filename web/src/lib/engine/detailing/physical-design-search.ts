/** Bounded exploration of physical repair alternatives. No store writes or structural solves. */
import type { DesignCodeAdapter } from '../design/code-adapter';
import type { MemberContext } from '../design/member-context';
import { designMember, outcomeFromProvided } from '../design/candidate-search';
import { beamCornerRecord, columnCageDia, type BeamCornerRecord } from '../design/end-support-anchorage';
import { columnBarsOf } from './joint-threading';
import { STANDARD_LONG_DIAS } from '../design/objective';
import { rebarHash } from '../design/rebar-hash';
import { detailableReinforcement, type MemberDesignOutcome } from '../design/outcome';
import type { RunDetailingResult } from './run-detailing';
import { beamLayerAlternatives, type BeamLayerAlternative } from './beam-layer-alternatives';
import { beamCageContinuityAlternatives, beamContinuityAlternatives, type BeamContinuityAlternative } from './beam-continuity-alternatives';
import { detailRegressionReasons } from './detail-regression';
import type { ProvidedRebarCheck } from '../station-design-forces';
import { completeAnchorage } from '../design/anchorage-hooks';
import { beamCompatibleCageAlternatives, beamStirrupContinuityAlternatives } from './beam-stirrup-alternatives';

export type PhysicalRepairOperator = 'diameterFamily' | 'columnDiameterFamily' | 'redistributeLayers' | 'preserveBottomRows' | 'harmonizeTop' | 'harmonizeTopLine' | 'harmonizeBottomLine' | 'harmonizeTopCatalog' | 'harmonizeCageCatalog' | 'harmonizeMixedCageCatalog' | 'harmonizeDemandCatalog' | 'harmonizeCoupledCatalog' | 'harmonizeStirrupCatalog' | 'retryExhausted';

export interface PhysicalSearchBudget {
  /** Full geometry builds, including rejected trials. */
  maxDetailingRuns: number;
  /** Nominal member searches, each additionally bounded by designMember's budget. */
  maxMemberSearches: number;
  /** Ordered repair operators. Omitted preserves the original diameter search. */
  operators?: readonly PhysicalRepairOperator[];
}

export const DEFAULT_PHYSICAL_SEARCH_BUDGET: PhysicalSearchBudget = {
  maxDetailingRuns: 8, maxMemberSearches: 64,
};

export interface PhysicalSearchTrial {
  elementId: number;
  /** Atomic replacement; elementId remains the representative for single-member readers. */
  elementIds?: number[];
  jointId?: string;
  jointIds?: string[];
  regressions?: string[];
  splicePairsBefore?: number;
  splicePairsAfter?: number;
  operator: PhysicalRepairOperator;
  diameterMm?: number;
  region?: BeamLayerAlternative['region'];
  counts?: number[];
  bottomCounts?: number[];
  bottomDiameterMm?: number;
  stirrupDiameterMm?: number;
  stirrupSpacings?: Array<{ elementId: number; support: number; span: number }>;
  disposition: 'nominalFailure' | 'unchanged' | 'regression' | 'noProgress' | 'accepted';
  /** Members acquiring a physical condition they did not previously have. */
  newlyBlocked?: number[];
  blockingConflicts?: number;
  nominalFailures?: number[];
  /** Failed checks retain the constraint and its numbers, not just the rejected member. */
  nominalChecks?: Array<{ elementId: number; checks: ProvidedRebarCheck[] }>;
  anchorageCompleted?: number[];
  /** Demand-guided repairs must strictly improve this global, lexicographic measure. */
  progressBefore?: number[];
  progressAfter?: number[];
  /** Tentative companion repairs; only published with an accepted parent trial. */
  companionTrials?: PhysicalSearchTrial[];
  companionIds?: number[];
  companionRetained?: boolean;
}

export interface PhysicalSearchResult {
  outcomes: ReadonlyMap<number, MemberDesignOutcome>;
  result: RunDetailingResult;
  trials: PhysicalSearchTrial[];
  changed: number[];
  /** A completed sweep can stop at the first improvement per member; not an exhaustion proof. */
  termination: 'budget' | 'sweepComplete';
  stats: { detailingRuns: number; memberSearches: number; candidatesConsidered: number; verifierCalls: number; structuralSolves: 0 };
}

/** Conservative scope: an unscoped condition blocks its whole assembly. */
export function physicallyBlockedMembers(result: RunDetailingResult): Set<number> {
  return new Set(result.assemblies.flatMap(a => [
    ...a.conflicts.filter(c => c.severity !== 'marginal').flatMap(c => c.elementIds),
    ...a.unsupported.flatMap(u => u.scope?.elementIds ?? a.elementIds),
  ]));
}

const conflicts = (r: RunDetailingResult) => r.assemblies.reduce((n, a) =>
  n + a.conflicts.filter(c => c.severity !== 'marginal').length, 0);

/** Non-negative counts: accepting only a strict decrease prevents repair cycles. */
function physicalProgressMeasure(r: RunDetailingResult): number[] {
  const conditions = r.assemblies.flatMap(a => a.unsupported);
  return [physicallyBlockedMembers(r).size, conflicts(r), conditions.length,
    conditions.filter(u => u.key === 'detailing.lapCheck.unarranged')
      .reduce((n, u) => n + (typeof u.params?.pairs === 'number' ? u.params.pairs : 1), 0)];
}

function strictlyImproves(before: number[], after: number[]): boolean {
  const first = before.findIndex((n, i) => n !== after[i]);
  return first >= 0 && after[first] < before[first];
}

/** Prefer a bounded alternative addressing the failed constraint; never prune or certify it. */
function nominalRepairPriority(
  previous: BeamContinuityAlternative, next: BeamContinuityAlternative, checks: readonly ProvidedRebarCheck[],
  finalDepthRepair = false,
): number {
  const instructions = checks.flatMap(check => {
    const more = check.limiting === 'flexure' || check.limiting === 'minSteel';
    const anchor = check.limiting === 'anchorage';
    const fit = check.limiting === 'congestion' || check.limiting === 'barFit';
    if (!more && !anchor && !fit) return [];
    const category = check.category.toLowerCase();
    const faces = check.anchorHook?.face === 'bottom' || category.includes('bottom') || category === 'min steel (span)'
      ? ['bottom'] as const : category.includes('top') ? ['top'] as const : ['top', 'bottom'] as const;
    return faces.map(face => ({ face, more, anchor, flexure: check.limiting === 'flexure' }));
  });
  if (!instructions.length) return 0;
  let score = 0;
  for (const face of ['top', 'bottom'] as const) {
    const a = face === 'top' ? previous.layers : previous.bottomLayers;
    const b = face === 'top' ? next.layers : next.bottomLayers;
    if (!a?.length || !b?.length) continue;
    const area = (ls: typeof a) => ls.reduce((n, l) => n + l.count * l.diameter ** 2, 0);
    const count = (ls: typeof a) => ls.reduce((n, l) => n + l.count, 0);
    const relevant = instructions.filter(i => i.face === face);
    if (!relevant.length) {
      // Opposite-face steel also enters the flexural calculation. Try one extra bar
      // without moving the tensile face before forcing it into another row.
      const tensileUnchanged = instructions.filter(i => i.flexure && JSON.stringify(i.face === 'top' ? previous.layers : previous.bottomLayers)
        === JSON.stringify(i.face === 'top' ? next.layers : next.bottomLayers)).length;
      const oneMore = a.length === b.length && b.every((l, i) => l.diameter === a[i].diameter
        && l.row === a[i].row && l.count >= a[i].count && l.count <= a[i].count + 1) && count(b) === count(a) + 1;
      if (finalDepthRepair && tensileUnchanged && oneMore) score += 6 * tensileUnchanged;
      else if (JSON.stringify(a) !== JSON.stringify(b)) score--;
      continue;
    }
    for (const i of relevant) {
      const helpful = i.more ? area(b) > area(a) : b[0].diameter < a[0].diameter || b.length < a.length
        || (!i.anchor && (count(b) < count(a) || Math.max(...b.map(l => l.count)) < Math.max(...a.map(l => l.count))));
      if (helpful) score += 4 + (b[0].diameter === a[0].diameter ? 1 : 0);
    }
  }
  return score;
}

/** Refresh the neighboring beam seats after every accepted assignment. */
function contextsFor(
  contexts: ReadonlyMap<number, MemberContext>, outcomes: ReadonlyMap<number, MemberDesignOutcome>,
): ReadonlyMap<number, MemberContext> {
  const corners = new Map<number, BeamCornerRecord>();
  const absent = new Set<number>();
  for (const [id, ctx] of contexts) {
    if (ctx.elementType !== 'beam') continue;
    const record = beamCornerRecord(detailableReinforcement(outcomes.get(id))?.rebar, ctx.material.stirrupDia);
    if (record) corners.set(id, record); else absent.add(id);
  }
  const columns = [...contexts].filter(([, ctx]) => ctx.elementType === 'column')
    .map(([id]) => ({ id, rebar: detailableReinforcement(outcomes.get(id))?.rebar }));
  return new Map([...contexts].map(([id, ctx]) => {
    if (ctx.elementType !== 'beam') return [id, ctx];
    // A different column cage changes beam threading and anchorage too. Refresh the
    // trial's registries before full verification, without mutating the retained context
    // or dropping neighbours outside a partial context map.
    const columnCages = new Map(ctx.columnCages), columnBars = new Map(ctx.columnBars);
    for (const column of columns) {
      const dia = columnCageDia(column.rebar), bars = columnBarsOf(column.rebar);
      if (dia > 0) columnCages.set(column.id, dia); else columnCages.delete(column.id);
      if (bars) columnBars.set(column.id, bars); else columnBars.delete(column.id);
    }
    return [id, { ...ctx, beamCorners: corners, absentBeams: absent, columnCages, columnBars }];
  }));
}

export function searchPhysicalDesignAlternatives(input: {
  adapter: DesignCodeAdapter;
  contexts: ReadonlyMap<number, MemberContext>;
  outcomes: ReadonlyMap<number, MemberDesignOutcome>;
  result: RunDetailingResult;
  detail: (outcomes: ReadonlyMap<number, MemberDesignOutcome>, contexts: ReadonlyMap<number, MemberContext>) => RunDetailingResult;
  /** Shared full-detail acceptance gate, supplied by the feedback loop. */
  regresses: (before: RunDetailingResult, after: RunDetailingResult) => boolean;
  lockedMembers?: ReadonlySet<number>;
  budget: PhysicalSearchBudget;
}): PhysicalSearchResult {
  for (const value of [input.budget.maxDetailingRuns, input.budget.maxMemberSearches]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Physical search budgets must be non-negative integers');
  }
  const operators = [...new Set<PhysicalRepairOperator>(input.budget.operators ?? ['diameterFamily'])];
  if (operators.some(o => o !== 'diameterFamily' && o !== 'columnDiameterFamily' && o !== 'redistributeLayers' && o !== 'preserveBottomRows' && o !== 'harmonizeTop' && o !== 'harmonizeTopLine' && o !== 'harmonizeBottomLine' && o !== 'harmonizeTopCatalog' && o !== 'harmonizeCageCatalog' && o !== 'harmonizeMixedCageCatalog' && o !== 'harmonizeDemandCatalog' && o !== 'harmonizeCoupledCatalog' && o !== 'harmonizeStirrupCatalog' && o !== 'retryExhausted')) {
    throw new Error('Unknown physical repair operator');
  }
  if (operators.some(o => o.startsWith('harmonize') || o === 'retryExhausted')) {
    if (operators.length === 1) return operators[0] === 'retryExhausted' ? searchExhausted(input) : searchBeamContinuity(input);
    // Atomic neighbourhood repair is a separate sweep. All sweeps share the caller's budgets.
    let retained: PhysicalSearchResult = { outcomes: input.outcomes, result: input.result, trials: [],
      changed: [], termination: 'sweepComplete', stats: { detailingRuns: 0, memberSearches: 0,
        candidatesConsidered: 0, verifierCalls: 0, structuralSolves: 0 } };
    for (const operator of operators) {
      const next = searchPhysicalDesignAlternatives({ ...input, outcomes: retained.outcomes, result: retained.result,
        budget: { operators: [operator], maxDetailingRuns: input.budget.maxDetailingRuns - retained.stats.detailingRuns,
          maxMemberSearches: input.budget.maxMemberSearches - retained.stats.memberSearches } });
      const stats = { ...retained.stats };
      for (const key of ['detailingRuns', 'memberSearches', 'candidatesConsidered', 'verifierCalls'] as const) stats[key] += next.stats[key];
      retained = { ...next, stats, trials: [...retained.trials, ...next.trials],
        changed: [...new Set([...retained.changed, ...next.changed])].sort((a, b) => a - b) };
      if (next.termination === 'budget') break;
    }
    return retained;
  }
  let result = input.result, outcomes = input.outcomes;
  let contexts = contextsFor(input.contexts, outcomes);
  const trials: PhysicalSearchTrial[] = [], changed = new Set<number>();
  const stats: PhysicalSearchResult['stats'] = { detailingRuns: 0, memberSearches: 0, candidatesConsidered: 0, verifierCalls: 0, structuralSolves: 0 };
  let termination: PhysicalSearchResult['termination'] = 'sweepComplete';
  const ranked = new Map<number, number>();
  for (const a of result.assemblies) {
    for (const c of a.conflicts) {
      if (c.severity === 'marginal') continue;
      for (const id of new Set(c.elementIds)) ranked.set(id, (ranked.get(id) ?? 0) + 1);
    }
  }
  // One sweep, most physical conflicts first. Do not repeatedly spend the budget
  // on the same member; a rejected trial does not stop exploration of its alternatives.
  members: for (const [id] of [...ranked].sort((a, b) => b[1] - a[1] || a[0] - b[0])) {
    const ctx = contexts.get(id), current = outcomes.get(id);
    // Multi-element spans require an atomic group replacement, which this first operator
    // does not implement. Never modify just one analysis piece or a provisional design.
    const columnRepair = ctx?.elementType === 'column' && operators.includes('columnDiameterFamily');
    if (!ctx || (ctx.elementType !== 'beam' && !columnRepair) || ctx.span || current?.outcome !== 'VERIFIED'
      || !current.accepted || input.lockedMembers?.has(id) || !physicallyBlockedMembers(result).has(id)) continue;
    const allowed = ctx.material.longDiametersMm ?? STANDARD_LONG_DIAS;
    // A priority, not a restricted project catalog. Remaining sizes remain alternatives.
    // The operator asks whether one diameter family can simplify this member's cage;
    // it does not assume that larger bars improve anchorage or physical clearance.
    const diameters = [...new Set([16, 12, 20, 25, ...allowed])].filter(d => allowed.includes(d));
    const seen = new Set([rebarHash(current.accepted)]);
    function* proposals(): Generator<{ trial: PhysicalSearchTrial; evaluate: () => MemberDesignOutcome | null }> {
      for (const operator of operators) {
        if ((operator === 'columnDiameterFamily') !== columnRepair) continue;
        if (operator === 'diameterFamily' || operator === 'columnDiameterFamily') {
          for (const diameterMm of diameters) yield {
            trial: { elementId: id, operator, diameterMm, disposition: 'nominalFailure' },
            evaluate: () => designMember(input.adapter, {
              ...ctx!, material: { ...ctx!.material, longDiametersMm: [diameterMm] },
            }),
          };
        } else {
          for (const alternative of beamLayerAlternatives(ctx!, current!.accepted!, operator === 'preserveBottomRows')) yield {
            trial: { elementId: id, operator, region: alternative.region, counts: alternative.counts, disposition: 'nominalFailure' },
            evaluate: () => {
              const verdict = input.adapter.verify(ctx!, alternative.reinforcement);
              const checked = outcomeFromProvided(input.adapter, ctx!, alternative.reinforcement, verdict);
              if (checked) checked.searchStats = { ...checked.searchStats, candidatesTried: 1, verifierCalls: 1 };
              return checked;
            },
          };
        }
      }
    }
    for (const proposal of proposals()) {
      if (stats.detailingRuns >= input.budget.maxDetailingRuns
        || stats.memberSearches >= input.budget.maxMemberSearches) {
        termination = 'budget'; break members;
      }
      const candidate = proposal.evaluate();
      stats.memberSearches++;
      const direct = proposal.trial.operator !== 'diameterFamily' && proposal.trial.operator !== 'columnDiameterFamily';
      stats.candidatesConsidered += direct ? 1 : candidate!.searchStats.candidatesTried;
      stats.verifierCalls += direct ? 1 : candidate!.searchStats.verifierCalls;
      const trial = proposal.trial;
      trials.push(trial);
      if (!candidate || candidate.outcome !== 'VERIFIED' || !candidate.accepted) continue;
      const hash = rebarHash(candidate.accepted);
      if (seen.has(hash)) { trial.disposition = 'unchanged'; continue; }
      seen.add(hash);
      const proposed = new Map(outcomes).set(id, candidate);
      // Updating the seats is required both for the next search and for this trial's
      // authoritative re-verification. Demands and sections are unchanged.
      const trialContexts = contextsFor(input.contexts, proposed);
      const detailed = input.detail(proposed, trialContexts);
      stats.detailingRuns++;
      const before = physicallyBlockedMembers(result), after = physicallyBlockedMembers(detailed);
      trial.newlyBlocked = [...after].filter(member => !before.has(member)).sort((a, b) => a - b);
      trial.blockingConflicts = conflicts(detailed);
      trial.regressions = detailRegressionReasons(result, detailed);
      if (trial.newlyBlocked.length || input.regresses(result, detailed)
        || (columnRepair && !detailed.reverification.some(r => r.elementId === id
          && (r.status === 'ok' || r.status === 'warn')))) {
        trial.disposition = 'regression'; continue;
      }
      if (after.size >= before.size && trial.blockingConflicts >= conflicts(result)) {
        trial.disposition = 'noProgress'; continue;
      }
      trial.disposition = 'accepted';
      outcomes = proposed; result = detailed; contexts = trialContexts; changed.add(id);
      break;
    }
  }
  return { outcomes, result, trials, changed: [...changed].sort((a, b) => a - b), termination, stats };
}

/** Reopen nominal refusals against the retained neighbours, once per member in this sweep. */
function searchExhausted(input: Parameters<typeof searchPhysicalDesignAlternatives>[0]): PhysicalSearchResult {
  let outcomes = input.outcomes, result = input.result;
  const trials: PhysicalSearchTrial[] = [], changed: number[] = [];
  const stats: PhysicalSearchResult['stats'] = { detailingRuns: 0, memberSearches: 0,
    candidatesConsidered: 0, verifierCalls: 0, structuralSolves: 0 };
  let termination: PhysicalSearchResult['termination'] = 'sweepComplete';
  for (const [id, prior] of input.outcomes) {
    const original = input.contexts.get(id);
    if (prior.outcome !== 'SEARCH_EXHAUSTED' || original?.elementType !== 'beam' || original.span
      || input.lockedMembers?.has(id)) continue;
    if (stats.detailingRuns >= input.budget.maxDetailingRuns || stats.memberSearches >= input.budget.maxMemberSearches) {
      termination = 'budget'; break;
    }
    const ctx = contextsFor(input.contexts, outcomes).get(id)!;
    const candidate = designMember(input.adapter, ctx);
    stats.memberSearches++;
    stats.candidatesConsidered += candidate.searchStats.candidatesTried;
    stats.verifierCalls += candidate.searchStats.verifierCalls;
    const trial: PhysicalSearchTrial = { elementId: id, operator: 'retryExhausted', disposition: 'nominalFailure' };
    trials.push(trial);
    if (candidate.outcome !== 'VERIFIED' || !candidate.accepted) continue;
    const proposed = new Map(outcomes).set(id, candidate);
    const detailed = input.detail(proposed, contextsFor(input.contexts, proposed));
    stats.detailingRuns++;
    const before = physicallyBlockedMembers(result), after = physicallyBlockedMembers(detailed);
    trial.newlyBlocked = [...after].filter(member => !before.has(member)).sort((a, b) => a - b);
    trial.blockingConflicts = conflicts(detailed);
    trial.regressions = detailRegressionReasons(result, detailed);
    // Adding bars is progress only if the recovered member verifies physically too.
    // Never turn a nominal refusal into a geometrically blocked "recovery".
    if (after.has(id) || trial.newlyBlocked.length || input.regresses(result, detailed)
      || !detailed.reverification.some(r => r.elementId === id && (r.status === 'ok' || r.status === 'warn'))) {
      trial.disposition = 'regression'; continue;
    }
    trial.disposition = 'accepted';
    outcomes = proposed; result = detailed; changed.push(id);
  }
  return { outcomes, result, trials, changed: changed.sort((a, b) => a - b), termination, stats };
}

/** Follow the coordinator's straight lines and splice transitions, never numbering or proximity. */
export function continuityLines(contexts: ReadonlyMap<number, MemberContext>, result: RunDetailingResult):
  Array<{ ids: number[]; jointIds: string[] }> {
  const edges = new Map<number, Map<number, string>>();
  // A continuous, already fused joint has no lap record. Include the coordinator's
  // line membership so repairing its neighbour cannot leave that joint behind.
  const transitions = [...(result.lapping?.laps ?? [])].map(l => ({
    fromElementId: l.fromElementId, toElementId: l.toElementId, jointId: l.jointId,
  }));
  const atNode = new Map<string, number[]>();
  for (const [id, line] of result.layering?.lineOfMember ?? []) {
    const e = contexts.get(id)?.modelData.elements.get(id);
    if (!e) continue;
    for (const node of [e.nodeI, e.nodeJ]) {
      const key = `${line}:${node}`, neighbors = atNode.get(key) ?? [];
      for (const other of neighbors) transitions.push({ fromElementId: other, toElementId: id, jointId: `n${node}` });
      neighbors.push(id); atNode.set(key, neighbors);
    }
  }
  for (const lap of transitions) {
    const a = lap.fromElementId, b = lap.toElementId;
    if (a === undefined || b === undefined || a === b) continue;
    const ca = contexts.get(a), cb = contexts.get(b);
    if (ca?.elementType !== 'beam' || cb?.elementType !== 'beam') continue;
    const ea = ca.modelData.elements.get(a), eb = cb.modelData.elements.get(b);
    if (!ea || !eb) continue;
    const joint = [ea.nodeI, ea.nodeJ].find(n => n === eb.nodeI || n === eb.nodeJ);
    if (joint === undefined) continue;
    const vector = (c: MemberContext, e: typeof ea) => {
      const i = c.modelData.nodes.get(e.nodeI), j = c.modelData.nodes.get(e.nodeJ);
      return i && j ? [j.x - i.x, j.y - i.y, (j.z ?? 0) - (i.z ?? 0)] : undefined;
    };
    const va = vector(ca, ea), vb = vector(cb, eb);
    if (!va || !vb) continue;
    const scale = Math.hypot(...va) * Math.hypot(...vb);
    const directions = (ea.nodeI === joint ? 1 : -1) * (eb.nodeI === joint ? 1 : -1);
    if (!scale || directions * va.reduce((sum, v, i) => sum + v * vb[i], 0) / scale > -0.999999) continue;
    if (!edges.has(a)) edges.set(a, new Map());
    if (!edges.has(b)) edges.set(b, new Map());
    edges.get(a)!.set(b, lap.jointId); edges.get(b)!.set(a, lap.jointId);
  }
  const seen = new Set<number>(), lines: Array<{ ids: number[]; jointIds: string[] }> = [];
  for (const start of [...edges.keys()].sort((a, b) => a - b)) {
    if (seen.has(start)) continue;
    const ids: number[] = [], jointIds = new Set<string>(), stack = [start];
    let branched = false;
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id); ids.push(id);
      const adjacent = edges.get(id)!;
      branched ||= adjacent.size > 2 || new Set(adjacent.values()).size < adjacent.size;
      for (const [other, joint] of adjacent) { jointIds.add(joint); if (!seen.has(other)) stack.push(other); }
    }
    if (!branched && ids.length > 1) lines.push({ ids: ids.sort((a, b) => a - b), jointIds: [...jointIds].sort() });
  }
  return lines;
}

/** Uniform longitudinal patterns are checked and published on a whole neighbourhood atomically. */
function searchBeamContinuity(
  input: Parameters<typeof searchPhysicalDesignAlternatives>[0],
  /** A companion completes one tentative proposal; judge the pair against the retained design. */
  retained?: RunDetailingResult,
): PhysicalSearchResult {
  const operator = input.budget.operators![0] as Extract<PhysicalRepairOperator, `harmonize${string}`>;
  const mixed = operator === 'harmonizeMixedCageCatalog';
  const coupled = operator === 'harmonizeCoupledCatalog';
  const stirrupOnly = operator === 'harmonizeStirrupCatalog';
  const demand = operator === 'harmonizeDemandCatalog' || coupled || stirrupOnly;
  const cage = operator === 'harmonizeCageCatalog' || mixed || demand;
  const catalog = operator === 'harmonizeTopCatalog' || cage;
  let result = input.result, outcomes = input.outcomes;
  const trials: PhysicalSearchTrial[] = [], changed = new Set<number>();
  const stats: PhysicalSearchResult['stats'] = { detailingRuns: 0, memberSearches: 0,
    candidatesConsidered: 0, verifierCalls: 0, structuralSolves: 0 };
  let termination: PhysicalSearchResult['termination'] = 'sweepComplete';
  // Real transitions come from topology; catalog repair also handles already fused bars.
  const conditions = (r: RunDetailingResult, jointId: string) => r.assemblies.flatMap(a => a.unsupported)
    .filter(u => (u.key === 'detailing.lapCheck.unarranged' || u.key === 'detailing.lapCheck.integrity')
      && u.params?.joint === jointId).length;
  const splicePairs = (r: RunDetailingResult, jointIds: string[]) => r.assemblies.flatMap(a => a.unsupported)
    .filter(u => u.key === 'detailing.lapCheck.unarranged' && jointIds.includes(String(u.params?.joint)))
    .reduce((sum, u) => sum + (typeof u.params?.pairs === 'number' ? u.params.pairs : 1), 0);
  const pairs = new Map<string, { ids: [number, number]; jointId: string }>();
  for (const lap of result.lapping?.laps ?? []) {
    if (lap.fromElementId === undefined || lap.toElementId === undefined || lap.fromElementId === lap.toElementId) continue;
    const ids = [lap.fromElementId, lap.toElementId].sort((a, b) => a - b) as [number, number];
    if (conditions(result, lap.jointId)) pairs.set(`${lap.jointId}:${ids.join(',')}`, { ids, jointId: lap.jointId });
  }
  // Top continuity starts with smaller neighbourhoods. Bottom repair prioritizes the
  // heavy repeated clashes caused by bars extending into the next member's stirrups.
  const burden = (ids: number[]) => result.assemblies.reduce((n, a) => n + a.conflicts
    .filter(c => c.severity !== 'marginal' && c.elementIds.some(id => ids.includes(id))).length, 0);
  // A top-only change cannot repair an isolated bottom or transverse clash. Use the
  // actual conflicting bars (including fused ownership), not every blocked member.
  const topOwners = new Map(result.assemblies.flatMap(a => a.bars ?? [])
    .filter(b => b.role === 'longitudinal' && b.layerId?.includes(':top'))
    .map(b => [b.id, b.ownerElementIds]));
  const topClashes = (ids: number[]) => result.assemblies.reduce((n, a) => n + a.conflicts
    .filter(c => c.severity !== 'marginal' && [c.barA, c.barB]
      .some(bar => topOwners.get(bar)?.some(id => ids.includes(id)))).length, 0);
  // An unavailable/provisional neighbour must not exclude an otherwise verified beam
  // from repair. Demand-based proposals can cover each contiguous eligible segment,
  // including one isolated member; full detailing still checks its boundary splices.
  const eligible = demand ? new Map([...input.contexts].filter(([id, ctx]) => ctx.elementType === 'beam'
    && !ctx.span && !input.lockedMembers?.has(id) && outcomes.get(id)?.outcome === 'VERIFIED'
    && outcomes.get(id)?.accepted)) : input.contexts;
  const lines = continuityLines(eligible, result);
  if (demand) {
    const covered = new Set(lines.flatMap(p => p.ids));
    for (const id of eligible.keys()) if (!covered.has(id)) lines.push({ ids: [id], jointIds: [] });
  }
  const companionBlocked = retained ? physicallyBlockedMembers(result) : new Set<number>();
  const hasFinalFailure = (ids: number[]) => result.reverification.some(r => ids.includes(r.elementId) && r.status === 'fail');
  const targets = operator !== 'harmonizeTop'
    ? lines.filter(p => catalog
      ? (cage ? burden(p.ids) : topClashes(p.ids)) > 0 || (demand && (p.jointIds.some(j => conditions(result, j)) || hasFinalFailure(p.ids) || p.ids.some(id => companionBlocked.has(id))))
      : p.jointIds.some(j => conditions(result, j)))
    : [...pairs.values()].map(p => ({ ids: [...p.ids], jointIds: [p.jointId] }));
  const ranked = targets.map(p => ({ ...p, burden: burden(p.ids), offset: 0, consecutiveTrials: 0, promising: false, order: undefined as number[] | undefined,
    deferredProposal: undefined as BeamContinuityAlternative | undefined }))
    .sort((a, b) => (operator === 'harmonizeBottomLine' || coupled ? b.burden - a.burden : a.burden - b.burden)
      || a.ids[0] - b.ids[0] || a.ids[1] - b.ids[1]);
  const seen = new Set<string>();
  // Resuming a line must not rebuild its Cartesian catalog on every failed proposal.
  // Cache only within one retained assignment; accepted changes invalidate every domain.
  const domains = new Map<string, BeamContinuityAlternative[]>();
  const nodesOf = (ids: number[]) => new Set(ids.flatMap(id => {
    const ctx = input.contexts.get(id), e = ctx?.modelData.elements.get(id);
    return e ? [e.nodeI, e.nodeJ] : [];
  }));
  pairLoop: for (let targetIndex = 0; targetIndex < ranked.length; targetIndex++) {
    const target = ranked[targetIndex];
    const { ids, jointIds } = target;
    const open = (r: RunDetailingResult) => jointIds.reduce((n, j) => n + conditions(r, j), 0);
    if (!catalog && !open(result)) continue;
    const contexts = new Map(contextsFor(input.contexts, outcomes));
    for (const r of result.reverification) if (r.status === 'fail' && r.finalGeometry && contexts.has(r.elementId))
      contexts.set(r.elementId, { ...contexts.get(r.elementId)!, finalGeometry: r.finalGeometry });
    if (ids.some(id => !contexts.has(id) || contexts.get(id)!.elementType !== 'beam'
      || contexts.get(id)!.span || input.lockedMembers?.has(id)
      || outcomes.get(id)?.outcome !== 'VERIFIED' || !outcomes.get(id)?.accepted)) continue;
    // Do not construct a Cartesian catalog when the caller cannot afford even one
    // complete proposal. Keep the inner check for operators that consume several here.
    if (stats.detailingRuns >= input.budget.maxDetailingRuns || stats.memberSearches + ids.length > input.budget.maxMemberSearches) {
      termination = 'budget'; break pairLoop;
    }
    const ctx = ids.map(id => contexts.get(id)!);
    const current = ids.map(id => outcomes.get(id)!.accepted!);
    const transverseFamilies = new Set(current.flatMap(r => [r.stirrups?.diameter,
      r.regions?.stirrupsSupport?.diameter, r.regions?.stirrupsSpan?.diameter].filter(d => d !== undefined))).size;
    let proposalIndex = 0;
    const proposals = stirrupOnly ? beamStirrupContinuityAlternatives(ctx, current)
      : coupled ? beamCompatibleCageAlternatives(ctx, current)
      : cage ? beamCageContinuityAlternatives(ctx, current, demand ? 'all' : mixed ? 'mixed' : 'common', demand ? 'demand' : 'retained')
      : beamContinuityAlternatives(ctx, current, operator === 'harmonizeBottomLine' ? 'bottom' : 'top', catalog ? 'catalog' : 'existing');
    const domainKey = ids.join(',');
    const domain = target.deferredProposal ? [target.deferredProposal]
      : demand ? domains.get(domainKey) ?? [...proposals] : undefined;
    if (domain && !target.deferredProposal) domains.set(domainKey, domain);
    let remaining = domain ? [...(target.order ?? domain.map((_, i) => i))] : [];
    for (const proposal of domain ? remaining.map(i => domain[i]) : proposals) {
      if (demand) remaining = remaining.slice(1);
      if (proposalIndex++ < target.offset) continue;
      const runsBeforeProposal = stats.detailingRuns;
      const resume = () => {
        if (target.deferredProposal) return;
        const promising = target.promising || (coupled && trial.blockingConflicts !== undefined
          && trial.blockingConflicts < conflicts(result) && trial.regressions?.length === 0);
        const next = { ...target, offset: demand ? 0 : proposalIndex, order: demand ? remaining : undefined, promising };
        // Four proposals to follow nominal feedback. A full build with fewer conflicts
        // and no aggregate regression earns four more, then yields to the other neighbourhoods.
        // Transverse alternatives add another catalog dimension even after the seats
        // have become uniform. Give that bounded product a first pass before yielding.
        const hasTransverseAlternatives = coupled && domain?.some(p => p.stirrupDiameterMm !== undefined);
        const consecutiveLimit = coupled && (transverseFamilies > 1 || hasTransverseAlternatives) ? 12 : coupled && promising ? 8 : 4;
        // A companion can spend six complete builds. Charge those to this line's
        // turn as well as the global budget, or one line monopolizes the whole sweep.
        const used = target.consecutiveTrials + Math.max(1, stats.detailingRuns - runsBeforeProposal);
        if (demand && (coupled || hasFinalFailure(ids)) && used < consecutiveLimit)
          ranked.splice(targetIndex + 1, 0, { ...next, consecutiveTrials: used });
        else ranked.push({ ...next, consecutiveTrials: 0, promising: false });
      };
      if (stats.detailingRuns >= input.budget.maxDetailingRuns || stats.memberSearches + ids.length > input.budget.maxMemberSearches) {
        termination = 'budget'; break pairLoop;
      }
      if (proposal.reinforcement.every((r, i) => rebarHash(r) === rebarHash(current[i]))) continue;
      // Neighbours are part of the key: a refusal from an earlier assignment is not final.
      const hash = [...outcomes].map(([id, o]) => `${id}:${o.accepted ? rebarHash(o.accepted) : o.outcome}`).join('|')
        + `>${ids.join(',')}:${proposal.reinforcement.map(rebarHash).join(',')}`
        + (target.deferredProposal ? ':companion' : '');
      if (seen.has(hash)) continue;
      seen.add(hash);
      let proposed = new Map(outcomes);
      ids.forEach((id, i) => proposed.set(id, { ...outcomes.get(id)!, accepted: proposal.reinforcement[i] }));
      const trialContexts = contextsFor(input.contexts, proposed);
      const trial: PhysicalSearchTrial = { elementId: ids[0], elementIds: [...ids], jointId: jointIds[0], jointIds,
        operator, ...(proposal.stirrupDiameterMm ? { stirrupDiameterMm: proposal.stirrupDiameterMm,
          stirrupSpacings: proposal.reinforcement.map((r, i) => ({ elementId: ids[i],
            support: r.regions!.stirrupsSupport!.spacing, span: r.regions!.stirrupsSpan!.spacing })) }
          : {}),
        ...(!stirrupOnly ? { diameterMm: proposal.layers[0].diameter, counts: proposal.layers.map(l => l.count) } : {}),
        ...(proposal.bottomLayers ? { bottomCounts: proposal.bottomLayers.map(l => l.count),
          bottomDiameterMm: proposal.bottomLayers[0].diameter } : {}),
        disposition: 'nominalFailure', nominalFailures: [] };
      trials.push(trial);
      for (let i = 0; i < ids.length; i++) {
        const retainedFailure = result.reverification.find(r => r.elementId === ids[i] && r.status === 'fail');
        const c = retainedFailure?.finalGeometry
          ? { ...trialContexts.get(ids[i])!, finalGeometry: retainedFailure.finalGeometry }
          : trialContexts.get(ids[i])!;
        let reinforcement = proposal.reinforcement[i];
        let verdict = input.adapter.verify(c, reinforcement);
        let verifierCalls = 1;
        if (demand && !stirrupOnly) {
          // A requested bottom hook is an actionable repair, not a reason to discard the
          // whole family. Reuse the bounded completion used by nominal design, then build
          // and check the actual hooks in the full-detail gate below.
          const completion = completeAnchorage(input.adapter, c, reinforcement, verdict,
            v => (v.overallStatus === 'ok' || v.overallStatus === 'warn') && !v.checks.some(check => check.anchorHook));
          if (completion.verified) verifierCalls++;
          if (completion.reinf !== reinforcement) {
            reinforcement = completion.reinf; verdict = completion.verdict;
            proposal.reinforcement[i] = reinforcement;
            (trial.anchorageCompleted ??= []).push(ids[i]);
          }
        }
        const checked = outcomeFromProvided(input.adapter, c, reinforcement, verdict);
        stats.memberSearches++; stats.candidatesConsidered++; stats.verifierCalls += verifierCalls;
        // outcomeFromProvided also admits a warning asking the caller to add a hook.
        // No operator can certify an unbuilt hook. Demand-guided completion above must
        // have removed the request by verifying a reinforcement that actually contains it.
        if ((verdict.overallStatus !== 'ok' && verdict.overallStatus !== 'warn')
          || verdict.checks.some(c => c.anchorHook) || !checked?.accepted || checked.outcome !== 'VERIFIED') {
          trial.nominalFailures!.push(ids[i]);
          (trial.nominalChecks ??= []).push({ elementId: ids[i],
            checks: verdict.checks.filter(c => c.status === 'fail' || c.anchorHook) });
        }
        else {
          checked.searchStats = { ...checked.searchStats, candidatesTried: 1, verifierCalls };
          proposed.set(ids[i], checked);
        }
      }
      if (trial.nominalFailures!.length) {
        // Mixed faces have a product of catalog families. One difficult line must not use
        // the nominal budget before the other lines get even their first proposal.
        if (demand) {
          const checks = trial.nominalChecks!.flatMap(f => f.checks);
          const priorities = new Map(remaining.map(i => [i, nominalRepairPriority(proposal, domain![i], checks, hasFinalFailure(ids))]));
          remaining.sort((a, b) => priorities.get(b)! - priorities.get(a)!);
        }
        if (mixed || demand) { resume(); break; }
        continue;
      }
      let detailed = input.detail(proposed, trialContexts);
      stats.detailingRuns++;
      let companions: number[] = [];
      if (coupled && conflicts(detailed) < conflicts(result)
        && stats.detailingRuns < input.budget.maxDetailingRuns && stats.memberSearches < input.budget.maxMemberSearches) {
        const beforeBlocked = physicallyBlockedMembers(result);
        const newlyBlocked = new Set([...physicallyBlockedMembers(detailed)].filter(id => !beforeBlocked.has(id)));
        const primaryBars = new Set(detailed.assemblies.flatMap(a => a.bars ?? [])
          .filter(b => b.role === 'longitudinal' && b.ownerElementIds.some(id => ids.includes(id))).map(b => b.id));
        const directClash = detailed.assemblies.some(a => a.conflicts.some(c => c.severity !== 'marginal'
          && c.elementIds.some(id => newlyBlocked.has(id)) && [c.barA, c.barB].some(id => primaryBars.has(id))));
        if (directClash && !target.deferredProposal) {
          // First change the primary bars causing the new hold. Joint tie ownership can
          // otherwise send six builds to perpendicular beams that did not cause it.
          // Keep the coupled route in the queue: a neighbour may still be the solution
          // if the direct alternatives fail. Replay uses fresh neighbours and all gates.
          ranked.push({ ...target, offset: 0, consecutiveTrials: 0, promising: false,
            order: undefined, deferredProposal: proposal });
        } else if (newlyBlocked.size || input.regresses(result, detailed)) {
          // Use the actual collateral failures, even when floor coordination moved a line
          // that does not directly share a node with the primary change.
          const affected = new Set<number>();
          for (const a of detailed.assemblies) for (const c of a.conflicts) {
            if (c.severity !== 'marginal' && c.elementIds.some(id => newlyBlocked.has(id)))
              c.elementIds.forEach(id => affected.add(id));
          }
          const conditionKey = (key: string, ids: readonly number[], joint: unknown) =>
            JSON.stringify([key, [...ids].sort((a, b) => a - b), joint ?? '']);
          const previousConditions = new Set(result.assemblies.flatMap(a => a.unsupported.map(u =>
            conditionKey(u.key, u.scope?.elementIds ?? a.elementIds, u.params?.joint))));
          const regressedKeys = new Set(detailRegressionReasons(result, detailed));
          for (const a of detailed.assemblies) for (const u of a.unsupported) {
            const members = u.scope?.elementIds ?? a.elementIds;
            // Changed clash records can move among already blocked members without a
            // regression. Do not let that noise expand a lap repair to unrelated spans.
            if ((regressedKeys.has(u.key) || members.some(id => newlyBlocked.has(id)))
              && !previousConditions.has(conditionKey(u.key, members, u.params?.joint))) {
              members.forEach(id => affected.add(id));
              // A cover report names one member, but a continuous bar can belong to
              // several spans. Repair its actual owners together; changing only the
              // reported span creates a new splice at the next support.
              if (typeof u.params?.bar === 'string') {
                const bar = detailed.assemblies.flatMap(a => a.bars ?? []).find(b => b.id === u.params!.bar);
                bar?.ownerElementIds.forEach(id => affected.add(id));
              }
            }
          }
          // Repair the affected segment first. Expanding to an entire line can needlessly
          // change already sound joints and consume its budget on unrelated failures.
          ids.forEach(id => affected.delete(id));
          if ([...affected].some(id => eligible.has(id))) {
            // One level of look-ahead, at most six full builds and 32 member checks,
            // all charged to the outer budget. The primary proposal stays locked.
            const next = searchBeamContinuity({ ...input, outcomes: proposed, result: detailed,
              lockedMembers: new Set([...(input.lockedMembers ?? []),
                ...[...input.contexts.keys()].filter(id => !affected.has(id))]),
              budget: { operators: ['harmonizeDemandCatalog'],
                maxDetailingRuns: Math.min(6, input.budget.maxDetailingRuns - stats.detailingRuns),
                maxMemberSearches: Math.min(32, input.budget.maxMemberSearches - stats.memberSearches) } }, result);
            for (const key of ['detailingRuns', 'memberSearches', 'candidatesConsidered', 'verifierCalls'] as const) stats[key] += next.stats[key];
            trial.companionTrials = next.trials;
            trial.companionRetained = false;
            companions = next.changed;
            proposed = new Map(next.outcomes); detailed = next.result;
          }
        }
      }
      const baseline = retained ?? result;
      const before = physicallyBlockedMembers(baseline), after = physicallyBlockedMembers(detailed);
      trial.newlyBlocked = [...after].filter(id => !before.has(id)).sort((a, b) => a - b);
      trial.blockingConflicts = conflicts(detailed);
      trial.regressions = detailRegressionReasons(baseline, detailed);
      trial.splicePairsBefore = splicePairs(result, jointIds);
      trial.splicePairsAfter = splicePairs(detailed, jointIds);
      if (demand && trial.newlyBlocked.length && trial.blockingConflicts < conflicts(baseline)
        && trial.regressions.length === 0) {
        // Nominal feedback can keep a face fixed long after it passes strength. Read the
        // constructed collisions before spending the remaining catalog on the other face.
        // This only orders proposals; every candidate still passes all acceptance gates.
        const bars = new Map(detailed.assemblies.flatMap(a => a.bars ?? []).map(b => [b.id, b]));
        const faces = new Set<'top' | 'bottom'>();
        for (const a of detailed.assemblies) for (const c of a.conflicts) {
          if (c.severity === 'marginal' || !c.elementIds.some(id => trial.newlyBlocked!.includes(id))) continue;
          for (const barId of [c.barA, c.barB]) {
            const b = bars.get(barId);
            if (b?.role !== 'longitudinal' || !b.ownerElementIds.some(id => ids.includes(id))) continue;
            if (b.layerId?.includes(':top')) faces.add('top');
            if (b.layerId?.includes(':bottom')) faces.add('bottom');
          }
        }
        if (faces.size) {
          const score = (next: BeamContinuityAlternative) => {
            let value = 0;
            for (const face of ['top', 'bottom'] as const) {
              const shape = (candidate: BeamContinuityAlternative) => (face === 'top' ? candidate.layers : candidate.bottomLayers)
                ?.map(l => `${l.row}:${l.count}:${l.diameter}`).join('|');
              const same = shape(proposal) === shape(next);
              if (!faces.has(face)) { value += same ? 2 : 0; continue; }
              if (same) continue;
              value += 4;
              const previousLayers = face === 'top' ? proposal.layers : proposal.bottomLayers;
              const nextLayers = face === 'top' ? next.layers : next.bottomLayers;
              if (previousLayers?.length && nextLayers?.length) {
                // Try a nearby arrangement before replacing an entire diameter family:
                // redistributing the same bars or changing count parity can open a joint.
                if (previousLayers[0].diameter === nextLayers[0].diameter) value += 2;
                const delta = Math.abs(previousLayers.reduce((n, l) => n + l.count, 0)
                  - nextLayers.reduce((n, l) => n + l.count, 0));
                value += 1 / (1 + delta);
              }
            }
            return value + (next.stirrupDiameterMm === proposal.stirrupDiameterMm ? 0.5 : 0);
          };
          const priorities = new Map(remaining.map(i => [i, score(domain![i])]));
          remaining.sort((a, b) => priorities.get(b)! - priorities.get(a)!);
        }
      }
      if (trial.newlyBlocked.length || ids.some(id => !detailed.reverification.some(r => r.elementId === id
        && (r.status === 'ok' || r.status === 'warn'))) || input.regresses(baseline, detailed)) {
        trial.disposition = 'regression';
        // Give every catalog neighbourhood a full trial before spending another on
        // the same line. Resume at the next proposal against the latest neighbours.
        if (catalog) { resume(); break; }
        continue;
      }
      // Do not accept a change that merely displaces this joint's unresolved splice.
      // One grouped warning can represent many bad pairs. Resolving some of those
      // pairs is real progress even while the remaining pairs keep that warning open.
      const localClashes = (r: RunDetailingResult) => r.assemblies.reduce((n, a) => n + a.conflicts
        .filter(c => c.severity !== 'marginal' && c.elementIds.some(id => ids.includes(id))).length, 0);
      const localProgress = catalog && (ids.filter(id => after.has(id)).length < ids.filter(id => before.has(id)).length
        || localClashes(detailed) < localClashes(result));
      if (demand) {
        trial.progressBefore = physicalProgressMeasure(baseline);
        trial.progressAfter = physicalProgressMeasure(detailed);
      }
      if ((demand && !strictlyImproves(trial.progressBefore!, trial.progressAfter!))
        || (!retained && !localProgress && open(detailed) >= open(result) && trial.splicePairsAfter >= trial.splicePairsBefore)) {
        trial.disposition = 'noProgress';
        if (catalog) { resume(); break; }
        continue;
      }
      trial.disposition = 'accepted';
      if (trial.companionTrials) {
        trial.companionRetained = true;
        trial.companionIds = companions;
        companions.forEach(id => changed.add(id));
      }
      ids.forEach((id, i) => { if (rebarHash(proposal.reinforcement[i]) !== rebarHash(current[i])) changed.add(id); });
      outcomes = proposed; result = detailed;
      domains.clear();
      // Return the first complete combination. The parent still checks its own members
      // and all global gates before publishing either half of this tentative repair.
      if (retained) break pairLoop;
      if (demand) {
        // A refusal was against the OLD seats. Restart adjacent lines, including their
        // consumed prefix, after changing a shared joint. Keep unrelated queues intact.
        // The assignment-aware seen key and strict progress gate still prevent cycles;
        // retries use the caller's remaining budget, never a fresh one.
        const acceptedIds = [...ids, ...companions];
        const nodes = nodesOf(acceptedIds);
        const affected = targets.filter(p => burden(p.ids) > 0 && !p.ids.some(id => acceptedIds.includes(id))
          && [...nodesOf(p.ids)].some(node => nodes.has(node)));
        const keys = new Set(affected.map(p => p.ids.join(',')));
        for (let i = ranked.length - 1; i > targetIndex; i--) {
          if (keys.has(ranked[i].ids.join(','))) ranked.splice(i, 1);
        }
        ranked.splice(targetIndex + 1, 0, ...affected.map(p => ({ ...p, burden: burden(p.ids),
          offset: 0, consecutiveTrials: 0, promising: false, order: undefined, deferredProposal: undefined })));
      }
      break;
    }
  }
  return { outcomes, result, trials, changed: [...changed].sort((a, b) => a - b), termination, stats };
}
