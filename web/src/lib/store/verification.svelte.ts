// Verification store — the single source of truth for RC design state.
//
// PR15 ARCHITECTURE
// ─────────────────
// Two INDEPENDENT freshness axes, which the previous implementation conflated:
//
//   analysisRevision  — bumped on every real model mutation and every new solve.
//                       Governs whether retained demand data is still valid.
//   demandRevision    — bumped when station demand data is replaced.
//                       Part of the provided-verification memo key.
//   baselineRevision  — the analysisRevision captured when the code-check baseline
//                       (required steel, memos, interaction diagrams) was computed.
//                       `isBaselineStale` compares it with the current analysis.
//
// Reinforcement edits touch NEITHER axis. Provided-reinforcement verification is
// DERIVED state, memoised per element on (rebarHash, demandRevision), so it is never
// "stale" — it is recomputed or it is a cache hit. This is what makes an edit cheap
// (one cache miss) and honest (the numbers shown are always current), and it is why
// `clear()` must never be called from a rebar-edit path.
//
// The store owns no model access: `_setReinforcementProvider` is wired in
// store/index.ts, mirroring the existing `_setModelFlatnessProvider` pattern.

import type { ElementVerification } from '../engine/codes/argentina/cirsoc201';
import type { SteelVerification } from '../engine/codes/argentina/cirsoc301';
import type { MemberDesignResult, DesignCheckSummary } from '../engine/design-check-results';
import type { ProvidedReinforcement } from './model.svelte';
import type { ProvidedRebarResult } from '../engine/station-design-forces';
import type { MemberContext } from '../engine/design/member-context';
import { regulationsStore } from './regulations.svelte';
import type { DesignRunSummary, MemberDesignOutcome } from '../engine/design/outcome';
import { utilizationStatus } from '../engine/design/outcome';
import { rebarHash } from '../engine/design/rebar-hash';
import { getDesignCode, type DesignCodeId } from '../engine/design/code-adapter';
import type { OrientationIssue } from '../engine/design/orientation-diagnostic';

export type VerificationStatus = 'ok' | 'warn' | 'fail';

/** Honest per-element display state for the table, summary and viewport. */
export type DisplayStatus =
  | 'ok' | 'warn' | 'fail'
  /** No reinforcement, no demand, or nothing checkable — never green. */
  | 'unavailable'
  /** The code-check baseline predates the current analysis. */
  | 'stale';

export interface ProvidedSummaryCounts {
  ok: number; warn: number; fail: number;
  unavailable: number; stale: number;
  total: number;
  /** Members with reinforcement assigned. */
  withReinforcement: number;
}

function createVerificationStore() {
  // ── Legacy CIRSOC-specific results (memos, interaction diagrams, required steel) ──
  let concreteVerifs = $state<ElementVerification[]>([]);
  let steelVerifs = $state<SteelVerification[]>([]);
  let concreteMap = $state<Map<number, ElementVerification>>(new Map());
  let steelMap = $state<Map<number, SteelVerification>>(new Map());

  // ── Unified code-check baseline ──
  let designResults = $state<MemberDesignResult[]>([]);
  let designMap = $state<Map<number, MemberDesignResult>>(new Map());
  let designSummary = $state<DesignCheckSummary | null>(null);

  // ── Revisions ──
  let analysisRevision = $state(1);
  let demandRevision = $state(0);
  let baselineRevision = $state(0);

  // ── Retained demand data (independent of presentation) ──
  let contexts = $state<Map<number, MemberContext>>(new Map());
  let orientationIssues = $state<OrientationIssue[]>([]);

  // ── Design outcomes (VERIFIED / SECTION_INADEQUATE / …) ──
  let runSummary = $state<DesignRunSummary | null>(null);

  // ── Provided-verification memo cache (NOT reactive: keyed, rebuilt on demand) ──
  const providedCache = new Map<number, { key: string; result: ProvidedRebarResult }>();
  /** Bumped whenever the cache is invalidated, so $derived consumers recompute. */
  let providedRevision = $state(0);

  let reinforcementProvider: ((elementId: number) => ProvidedReinforcement | undefined) | null = null;

  function rebuildLegacyMaps() {
    const cm = new Map<number, ElementVerification>();
    for (const v of concreteVerifs) cm.set(v.elementId, v);
    concreteMap = cm;
    const sm = new Map<number, SteelVerification>();
    for (const v of steelVerifs) sm.set(v.elementId, v);
    steelMap = sm;
  }

  function rebuildDesignMap() {
    const dm = new Map<number, MemberDesignResult>();
    for (const r of designResults) dm.set(r.elementId, r);
    designMap = dm;
  }

  function dropCache() {
    providedCache.clear();
    providedRevision++;
  }

  /** Compute (or reuse) the authoritative provided-rebar verification. */
  function providedFor(elementId: number): ProvidedRebarResult | null {
    void providedRevision;   // explicit reactive dependency
    void demandRevision;
    const ctx = contexts.get(elementId);
    if (!ctx) return null;
    const reinf = reinforcementProvider?.(elementId);
    if (!reinf) return null;
    // The concrete design code comes from Project Regulations, and it is part of the cache
    // key: a project that rebinds the role must not read back a result verified under the
    // previous one.
    const codeId = regulationsStore.concreteDesignCode();
    if (!codeId) return null;
    const key = `${rebarHash(reinf)}|${demandRevision}|${codeId}`;
    const hit = providedCache.get(elementId);
    if (hit && hit.key === key) return hit.result;
    const adapter = getDesignCode(codeId);
    if (!adapter) return null;
    const result = adapter.verify(ctx, reinf);
    providedCache.set(elementId, { key, result });
    return result;
  }

  /**
   * Re-verify one member at the effective depth its FINAL geometry actually has.
   *
   * Coordination moves steel. A joint-layer raise costs lever arm directly, and Table
   * 26.6.2.1(a)'s unfavourable tolerance on d applies whether or not anything moved. A
   * certificate issued against the pre-coordination arrangement describes geometry that no
   * longer exists, so the authoritative check is run again here against the real one.
   *
   * The depth loss is applied to the LAYER CENTROIDS, which is the only quantity that
   * actually changed. Inflating the cover produced the same `d` and quietly falsified
   * everything else that reads cover — the transverse fit check, anchorage geometry, and
   * the cover checks themselves. The section and its true cover are the member; only the
   * bars moved within it.
   */
  function reverifyAtFinalDepth(
    elementId: number,
    loss: { bottomRaise: number; topLower: number; depthTolerance: number },
    /**
     * Reinforcement to check, when it is not (yet) the model's.
     *
     * The design–detailing feedback loop proposes replacement steel and needs it re-verified
     * BEFORE anything is persisted — if it were written first, a repair that turned out not
     * to work would already have overwritten the engineer's model. Absent, the model's own
     * reinforcement is used, which is what every other caller wants.
     */
    reinforcement?: ProvidedReinforcement,
  ): 'ok' | 'warn' | 'fail' {
    const ctx = contexts.get(elementId);
    const reinf = reinforcement ?? reinforcementProvider?.(elementId);
    if (!ctx || !reinf) return 'fail';
    // Same source as every other design decision: the project's `concrete` role.
    const codeId = regulationsStore.concreteDesignCode();
    const adapter = codeId ? getDesignCode(codeId) : undefined;
    if (!adapter) return 'fail';
    const total = Math.max(0, loss.bottomRaise) + Math.max(0, loss.topLower)
      + Math.max(0, loss.depthTolerance);
    const atFinal = total < 1e-9 ? ctx : {
      ...ctx,
      // Each face carries its own movement; the tolerance applies to both because it
      // applies to d itself.
      finalGeometry: {
        bottomRaise: Math.max(0, loss.bottomRaise),
        topLower: Math.max(0, loss.topLower),
        depthTolerance: Math.max(0, loss.depthTolerance),
      },
    };
    const result = adapter.verify(atFinal, reinf);
    if (!result) return 'fail';
    return result.overallStatus === 'fail'
      ? 'fail'
      : result.overallStatus === 'warn' ? 'warn' : 'ok';
  }

  /** The reinforcement currently attached to a member, for hashing and for documents. */
  function reinforcementFor(elementId: number): ProvidedReinforcement | undefined {
    return reinforcementProvider?.(elementId) ?? undefined;
  }

  /**
   * The rebar hash the cached certificate was issued against.
   *
   * Empty when nothing has been verified. A document compares this with the hash of the
   * reinforcement actually in the model; disagreement means the certificate describes
   * geometry that no longer exists, which is worse than having no certificate at all.
   */
  function certifiedHashFor(elementId: number): string {
    return providedCache.get(elementId)?.key.split('|')[0] ?? '';
  }

  return {
    reverifyAtFinalDepth,
    reinforcementFor,
    certifiedHashFor,
    // ── Legacy accessors (backward compat) ──
    get concrete() { return concreteVerifs; },
    get steel() { return steelVerifs; },
    get concreteMap() { return concreteMap; },
    get steelMap() { return steelMap; },

    // ── Unified baseline accessors ──
    get design() { return designResults; },
    get designMap() { return designMap; },
    get summary() { return designSummary; },

    /** Whether any verification results exist (legacy or unified). */
    get hasResults() { return concreteVerifs.length > 0 || steelVerifs.length > 0 || designResults.length > 0; },

    // ── Revisions ──
    get analysisRevision() { return analysisRevision; },
    get demandRevision() { return demandRevision; },
    get baselineRevision() { return baselineRevision; },
    get providedRevision() { return providedRevision; },
    /** True when the code-check baseline was computed for an older analysis. */
    get isBaselineStale() {
      return designResults.length > 0 && baselineRevision !== analysisRevision;
    },
    get hasDemandData() { return contexts.size > 0; },

    /**
     * The design code in force, resolved from the project's `concrete` role binding.
     *
     * Read-only on purpose. This store used to OWN the selection, writable from a dropdown
     * beside the Design commands, which made it a second regulation surface that could
     * disagree with Project Regulations. There is one selector now, and it is not here.
     */
    get concreteCodeId() { return regulationsStore.concreteDesignCode(); },

    /** Wired in store/index.ts so this store never imports modelStore. */
    _setReinforcementProvider(fn: (elementId: number) => ProvidedReinforcement | undefined) {
      reinforcementProvider = fn;
    },

    /**
     * A real model mutation happened (or a fresh solve landed): the analysis moved
     * on. Drops retained demand, the code-check baseline and every cached
     * verification. Replaces the old unconditional `clear()` in the mutation hook —
     * unconditional so the revision counter can never silently fail to advance.
     */
    invalidateAnalysis() {
      analysisRevision++;
      contexts = new Map();
      orientationIssues = [];
      runSummary = null;
      concreteVerifs = [];
      steelVerifs = [];
      concreteMap = new Map();
      steelMap = new Map();
      designResults = [];
      designMap = new Map();
      designSummary = null;
      dropCache();
    },

    /**
     * The project's design code or edition changed.
     *
     * Deliberately NOT invalidateAnalysis(): that clears the member contexts, and
     * clearing state the user did not ask to lose is the exact regression PR15 was
     * written to repair. The reinforcement itself lives on the model and is untouched
     * here — what stops being valid is the verdicts, because they were reached under a
     * different rule set.
     *
     * Bumping demandRevision is what forces every memoised verification to recompute
     * under the new adapter; the design table stays on screen, showing "not verified"
     * rather than a stale pass.
     */
    invalidateForCodeChange() {
      demandRevision++;
      runSummary = null;
      concreteVerifs = [];
      steelVerifs = [];
      concreteMap = new Map();
      steelMap = new Map();
      designResults = [];
      designMap = new Map();
      designSummary = null;
      dropCache();
    },

    // ── Retained demand ──
    /** Publish freshly computed member contexts (station demands + geometry). */
    setDemandData(next: Map<number, MemberContext>, issues: OrientationIssue[] = []) {
      contexts = next;
      orientationIssues = issues;
      demandRevision++;
      dropCache();
    },
    get contexts() { return contexts; },
    contextFor(elementId: number): MemberContext | undefined { return contexts.get(elementId); },
    hasDemandFor(elementId: number): boolean { return contexts.has(elementId); },
    get orientationIssues() { return orientationIssues; },
    get orientationSuspectCount() { return new Set(orientationIssues.map(i => i.elementId)).size; },

    // ── Code-check baseline ──
    /**
     * Publish the code-check baseline (required steel, memos, P-M diagrams) and
     * stamp the analysis revision it belongs to.
     *
     * Unlike the old `setConcrete`, this does NOT wipe the unified results — that
     * behaviour made opening the report dialog erase the whole design table.
     */
    setDesignBaseline(
      concrete: ElementVerification[],
      normalized: MemberDesignResult[],
      summary: DesignCheckSummary | null,
      steel: SteelVerification[] = [],
    ) {
      concreteVerifs = concrete;
      steelVerifs = steel;
      rebuildLegacyMaps();
      designResults = normalized;
      designSummary = summary;
      rebuildDesignMap();
      baselineRevision = analysisRevision;
    },

    /** Legacy setter kept for the report path; no longer wipes unified results. */
    setConcrete(verifs: ElementVerification[]) {
      concreteVerifs = verifs;
      rebuildLegacyMaps();
      if (baselineRevision === 0) baselineRevision = analysisRevision;
    },
    setSteel(verifs: SteelVerification[]) {
      steelVerifs = verifs;
      rebuildLegacyMaps();
    },
    /** Set unified design-check results (multi-code baseline). */
    setDesignResults(results: MemberDesignResult[], summary: DesignCheckSummary) {
      designResults = results;
      designSummary = summary;
      rebuildDesignMap();
      baselineRevision = analysisRevision;
    },

    // ── Design outcomes ──
    setDesignOutcomes(summary: DesignRunSummary | null) {
      runSummary = summary;
      dropCache();
    },
    get runSummary() { return runSummary; },
    outcomeFor(elementId: number): MemberDesignOutcome | undefined {
      return runSummary?.outcomes.get(elementId);
    },

    // ── Provided-reinforcement verification (the PRIMARY status) ──
    providedFor,
    /** Invalidate one element's cached verification (after a rebar edit). */
    invalidateElement(elementId: number) {
      providedCache.delete(elementId);
      providedRevision++;
    },
    invalidateElements(ids: Iterable<number>) {
      let n = 0;
      for (const id of ids) { providedCache.delete(id); n++; }
      if (n > 0) providedRevision++;
    },

    /**
     * Honest display status. Provided-reinforcement verification takes priority
     * over the code-check baseline, because the baseline describes the steel the
     * code REQUIRES, not the steel the member HAS. Reading the baseline was the
     * actual trust bug: the viewport stayed green after a user weakened rebar.
     */
    getDisplayStatus(elementId: number): DisplayStatus {
      void providedRevision;
      const reinf = reinforcementProvider?.(elementId);
      if (!contexts.has(elementId)) return 'unavailable';
      if (!reinf) return 'unavailable';
      const pv = providedFor(elementId);
      if (!pv || pv.strengthCheckCount === 0) return 'unavailable';
      if (pv.overallStatus === 'none') return 'unavailable';
      if (this.isBaselineStale) return 'stale';
      return pv.overallStatus;
    },

    /** Utilization for display: ALWAYS demand/capacity. Null when unavailable. */
    getDisplayRatio(elementId: number): number | null {
      void providedRevision;
      const pv = providedFor(elementId);
      if (pv && pv.strengthCheckCount > 0) {
        return Number.isFinite(pv.worstUtilization) ? pv.worstUtilization : 99;
      }
      // Fall back to the code-check baseline only for members with no rebar, and
      // only so the viewport can show *something* — the status stays 'unavailable'.
      const dr = designMap.get(elementId);
      return dr ? dr.utilization : null;
    },

    /** Aggregate counts for the summary bar. Never merges non-passing into pass. */
    get providedSummary(): ProvidedSummaryCounts {
      void providedRevision;
      const counts: ProvidedSummaryCounts = {
        ok: 0, warn: 0, fail: 0, unavailable: 0, stale: 0, total: 0, withReinforcement: 0,
      };
      for (const id of contexts.keys()) {
        counts.total++;
        if (reinforcementProvider?.(id)) counts.withReinforcement++;
        switch (this.getDisplayStatus(id)) {
          case 'ok': counts.ok++; break;
          case 'warn': counts.warn++; break;
          case 'fail': counts.fail++; break;
          case 'stale': counts.stale++; break;
          default: counts.unavailable++; break;
        }
      }
      return counts;
    },

    /**
     * Worst utilization for an element, for the viewport colour map.
     * PROVIDED-FIRST: the previous implementation read `designMap`, i.e. the
     * auto-design status, which is "designed to pass" by construction and ignored
     * the user's actual reinforcement entirely.
     */
    getMaxRatio(elementId: number): number | null {
      return this.getDisplayRatio(elementId);
    },

    /** Overall status for an element (viewport labels). Provided-first. */
    getStatus(elementId: number): VerificationStatus | null {
      const d = this.getDisplayStatus(elementId);
      if (d === 'ok' || d === 'warn' || d === 'fail') return d;
      if (d === 'stale') {
        const pv = providedFor(elementId);
        return pv && pv.overallStatus !== 'none' ? pv.overallStatus : null;
      }
      return null;
    },

    /** Status derived purely from the code-check baseline (reports/back-compat). */
    getBaselineStatus(elementId: number): VerificationStatus | null {
      const dr = designMap.get(elementId);
      if (dr) return dr.status;
      const cv = concreteMap.get(elementId);
      if (cv) return cv.overallStatus;
      const sv = steelMap.get(elementId);
      if (sv) return sv.overallStatus;
      return null;
    },

    /** Utilization status under the approved convention (demand/capacity). */
    statusForUtilization(u: number): VerificationStatus { return utilizationStatus(u); },

    /**
     * Full reset. Used by explicit "new model" flows and tests. The model-mutation
     * hook uses `invalidateAnalysis()` instead so revisions keep advancing.
     */
    clear() {
      concreteVerifs = [];
      steelVerifs = [];
      concreteMap = new Map();
      steelMap = new Map();
      designResults = [];
      designMap = new Map();
      designSummary = null;
      contexts = new Map();
      orientationIssues = [];
      runSummary = null;
      baselineRevision = 0;
      dropCache();
    },
  };
}

export const verificationStore = createVerificationStore();
