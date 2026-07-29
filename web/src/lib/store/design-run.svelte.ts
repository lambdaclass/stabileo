// Design command layer.
//
// The three explicit commands plus Design all. Splitting them is the fix for the
// old single "Run Design" button, which conflated three conceptually different
// actions — check, generate, accept — and performed the third as an un-undoable
// mutation of every un-detailed member.
//
//   1. Compute demands   — station demands + contexts + orientation diagnostic
//   2. Run code check    — required steel / memos / interaction diagrams (baseline)
//   3. Auto-design       — bounded candidate search + accept ONLY verified results
//   +  Design all        — 1 → 2 → 3 over all un-designed members, one undo step
//
// Reinforcement is written exclusively through `modelStore.reinforcementTransaction`,
// so one command is one undo step, results survive, and no structural solve fires.

import { modelStore } from './model.svelte';
import { regulationsStore } from './regulations.svelte';
import type { RegulationEdition } from '../codes/regulation';
import { detailingStore } from './detailing.svelte';
import { resultsStore } from './results.svelte';
import { verificationStore } from './verification.svelte';
import { computeStationDemands, runCirsocDesign } from '../engine/verification-service';
import {
  buildAllMemberContexts, buildCriticalSectionMap, type ContextModelData, type MemberContext,
} from '../engine/design/member-context';
import { runOrientationDiagnostic } from '../engine/design/orientation-diagnostic';
import { runDesign, designMember, DEFAULT_RUN_MS } from '../engine/design/candidate-search';
import { getDesignCode, type DesignCodeId } from '../engine/design/code-adapter';
import type { DesignRunSummary, MemberDesignOutcome } from '../engine/design/outcome';
import type { RunProgress } from '../engine/design/candidate-search';

export interface CommandResult {
  ok: boolean;
  /** i18n key describing a refusal. */
  reasonKey?: string;
  params?: Record<string, string | number>;
}

function modelData(): ContextModelData {
  return {
    nodes: modelStore.nodes as never,
    elements: modelStore.elements as never,
    sections: modelStore.sections as never,
    materials: modelStore.materials as never,
    supports: modelStore.supports as never,
  };
}

function createDesignRunStore() {
  let running = $state(false);
  let phase = $state<'idle' | 'demands' | 'codeCheck' | 'autoDesign'>('idle');
  let progress = $state<RunProgress | null>(null);
  let lastError = $state<{ key: string; params?: Record<string, string | number> } | null>(null);
  let abortFlag = { aborted: false };
  /** Elements the user has edited by hand (badge + protect-overrides). */
  let manualOverrides = $state<Set<number>>(new Set());
  /** Elements whose reinforcement came from auto-design. */
  let autoDesigned = $state<Set<number>>(new Set());
  /** Members whose provisional (failing) candidate was retained for review. */
  let provisionalIds = $state<Set<number>>(new Set());

  /**
   * The design adapter, from the project's `concrete` role binding and nowhere else.
   *
   * This used to default to `verificationStore.activeCodeId` — a dropdown beside the Design
   * commands — and then silently rewrite it when the legacy `codeSettings.concreteEdition`
   * said '2005'. Three sources for one decision, able to disagree. Project Regulations is
   * the only one now; when it has not bound a usable concrete code this returns null and the
   * caller gates rather than picking a default.
   */
  function adapter() {
    const id = regulationsStore.concreteDesignCode();
    return id ? getDesignCode(id) : undefined;
  }

  /** The bound concrete edition, narrowed to the editions this engine implements. */
  function concreteEdition(): RegulationEdition | undefined {
    const e = regulationsStore.binding('concrete').edition;
    return e === '2005' || e === '2025' ? e : undefined;
  }

  /** 1. Compute demands: station forces → member contexts (+ orientation check). */
  function computeDemands(): CommandResult {
    lastError = null;
    const results3D = resultsStore.results3D;
    if (!results3D) return fail('design.error.solveFirst');
    if (!resultsStore.hasCombinations3D) return fail('design.error.noCombinations');

    phase = 'demands';
    try {
      const md = modelData();
      const stationData = computeStationDemands(
        resultsStore.perCombo3D, modelStore.model.combinations, md as never,
      );
      if (stationData.demands.size === 0) return fail('design.error.noDemands');

      const orient = runOrientationDiagnostic(md, stationData.demands, modelStore.model.loads as never);
      const contexts = buildAllMemberContexts(md, {
        demands: stationData.demands,
        stations: stationData.stations,
        criticalSections: buildCriticalSectionMap(md),
        orientationSuspect: orient.suspect,
        analysisRevision: verificationStore.analysisRevision,
        demandRevision: verificationStore.demandRevision + 1,
        // The project decides which edition governs and what the aggregate size is.
        // Without this the design would silently run under the built-in default rather
        // than under what the project states it is designed to.
        codeEdition: concreteEdition(),
        concrete: modelStore.model.codeSettings?.concrete,
      });
      verificationStore.setDemandData(contexts, orient.issues);
      resultsStore.diagramType = 'verification';
      return { ok: true };
    } finally {
      phase = 'idle';
    }
  }

  /** 2. Run code check: publish the required-steel / memo baseline. */
  function runCodeCheck(): CommandResult {
    lastError = null;
    const results3D = resultsStore.results3D;
    if (!results3D) return fail('design.error.solveFirst');
    if (!verificationStore.hasDemandData) {
      const r = computeDemands();
      if (!r.ok) return r;
    }
    const a = adapter();
    if (!a) return fail('design.error.noAdapter');
    if (!a.capabilities.candidateGeneration) {
      return fail('design.error.codeUnsupported', { code: a.name });
    }

    phase = 'codeCheck';
    try {
      const sectionNames = new Map<number, string>();
      for (const elem of modelStore.elements.values()) {
        const sec = modelStore.sections.get(elem.sectionId);
        if (sec) sectionNames.set(elem.id, sec.name);
      }
      const stationDemands = new Map(
        [...verificationStore.contexts].flatMap(([id, c]) => (c.demands ? [[id, c.demands] as const] : [])),
      );
      const { concrete, normalized, summary } = runCirsocDesign(
        results3D,
        modelData() as never,
        stationDemands.size > 0 ? stationDemands : undefined,
        sectionNames,
        resultsStore.governing3D.size > 0 ? resultsStore.governing3D : null,
      );
      if (normalized.length === 0 || !summary) return fail('design.error.nothingChecked', { code: a.name });
      verificationStore.setDesignBaseline(concrete, normalized, summary);
      resultsStore.diagramType = 'verification';
      return { ok: true };
    } finally {
      phase = 'idle';
    }
  }

  /**
   * 3. Auto-design. Only VERIFIED results are written to the model; provisional
   *    (failing) candidates are retained on the outcome for review and are never
   *    assigned, never certified and never counted as passing.
   */
  function autoDesign(elementIds: Iterable<number>, opts: { maxRunMs?: number } = {}): CommandResult {
    lastError = null;
    const a = adapter();
    if (!a) return fail('design.error.noAdapter');
    if (!a.capabilities.candidateGeneration) return fail('design.error.codeUnsupported', { code: a.name });
    if (!verificationStore.hasDemandData) {
      const r = computeDemands();
      if (!r.ok) return r;
    }
    const wanted = new Set(elementIds);
    const ctxs: MemberContext[] = [];
    for (const [id, ctx] of verificationStore.contexts) if (wanted.has(id)) ctxs.push(ctx);
    if (ctxs.length === 0) return fail('design.error.emptySelection');

    running = true;
    phase = 'autoDesign';
    abortFlag = { aborted: false };
    progress = { done: 0, total: ctxs.length, verified: 0, elementId: -1 };
    try {
      const summary = runDesign(a, ctxs, {
        signal: abortFlag,
        maxRunMs: opts.maxRunMs ?? DEFAULT_RUN_MS,
        onProgress: (p) => { progress = p; },
      });
      publishOutcomes(summary);
      return { ok: true };
    } finally {
      running = false;
      phase = 'idle';
    }
  }

  /** Merge a run's outcomes into the store and assign the verified reinforcement. */
  function publishOutcomes(summary: DesignRunSummary) {
    // Merge with any previous run so designing a selection does not erase the rest.
    const prev = verificationStore.runSummary;
    const merged: DesignRunSummary = prev
      ? { ...summary, outcomes: new Map([...prev.outcomes, ...summary.outcomes]) }
      : summary;
    // Recount after the merge so the summary bar reflects every known member.
    recount(merged);
    verificationStore.setDesignOutcomes(merged);

    const verified: MemberDesignOutcome[] = [];
    const provisional = new Set(provisionalIds);
    for (const [, o] of summary.outcomes) {
      if (o.outcome === 'VERIFIED' && o.accepted) verified.push(o);
      if (o.outcome !== 'VERIFIED' && o.provisional) provisional.add(o.elementId);
      else provisional.delete(o.elementId);
    }
    provisionalIds = provisional;

    if (verified.length > 0) {
      const written = modelStore.reinforcementTransaction((api) => {
        for (const o of verified) api.setReinforcement(o.elementId, o.accepted);
      });
      const auto = new Set(autoDesigned);
      const manual = new Set(manualOverrides);
      for (const id of written) { auto.add(id); manual.delete(id); }
      autoDesigned = auto;
      manualOverrides = manual;

      // A user who has just verified a floor wants its bars. Detailing runs automatically
      // unless the project has opted out — the explicit Generate command stays either way,
      // so the automatic path is a convenience, never the only way in.
      if (detailingStore.autoGenerate) detailingStore.generate();
    }
  }

  function recount(s: DesignRunSummary) {
    s.total = s.outcomes.size;
    s.verified = 0; s.sectionInadequate = 0; s.demandUnavailable = 0;
    s.searchExhausted = 0; s.unsupported = 0; s.provisionalRetained = 0;
    for (const [, o] of s.outcomes) {
      if (o.provisional && o.outcome !== 'VERIFIED') s.provisionalRetained++;
      switch (o.outcome) {
        case 'VERIFIED': s.verified++; break;
        case 'SECTION_INADEQUATE': s.sectionInadequate++; break;
        case 'DEMAND_UNAVAILABLE': s.demandUnavailable++; break;
        case 'SEARCH_EXHAUSTED': s.searchExhausted++; break;
        case 'UNSUPPORTED': s.unsupported++; break;
      }
    }
  }

  /** Design all: the convenience chain. Progress + cancellation + partial honesty. */
  function designAll(): CommandResult {
    const d = computeDemands();
    if (!d.ok) return d;
    const c = runCodeCheck();
    if (!c.ok) return c;
    const undesigned: number[] = [];
    for (const id of verificationStore.contexts.keys()) {
      if (!modelStore.elements.get(id)?.reinforcement) undesigned.push(id);
    }
    const target = undesigned.length > 0 ? undesigned : [...verificationStore.contexts.keys()];
    return autoDesign(target);
  }

  /** Re-run the search for one member (used after a section change is approved). */
  function designOne(elementId: number): MemberDesignOutcome | null {
    const a = adapter();
    const ctx = verificationStore.contextFor(elementId);
    if (!a || !ctx) return null;
    const o = designMember(a, ctx);
    const prev = verificationStore.runSummary;
    const outcomes = new Map(prev?.outcomes ?? []);
    outcomes.set(elementId, o);
    const s: DesignRunSummary = prev
      ? { ...prev, outcomes }
      : {
          codeId: a.id, codeVersion: a.version, total: 0, verified: 0, sectionInadequate: 0,
          demandUnavailable: 0, searchExhausted: 0, unsupported: 0, provisionalRetained: 0,
          outcomes, wallMs: o.searchStats.ms, aborted: false, notReached: 0,
        };
    recount(s);
    verificationStore.setDesignOutcomes(s);
    if (o.outcome === 'VERIFIED' && o.accepted) {
      modelStore.reinforcementTransaction((api) => api.setReinforcement(elementId, o.accepted));
      const auto = new Set(autoDesigned); auto.add(elementId); autoDesigned = auto;
      const manual = new Set(manualOverrides); manual.delete(elementId); manualOverrides = manual;
    }
    return o;
  }

  function fail(key: string, params?: Record<string, string | number>): CommandResult {
    lastError = { key, params };
    return { ok: false, reasonKey: key, params };
  }

  return {
    get running() { return running; },
    get phase() { return phase; },
    get progress() { return progress; },
    get lastError() { return lastError; },
    clearError() { lastError = null; },
    cancel() { abortFlag.aborted = true; },

    get manualOverrides() { return manualOverrides; },
    get autoDesigned() { return autoDesigned; },
    get provisionalIds() { return provisionalIds; },
    markManual(ids: Iterable<number>) {
      const m = new Set(manualOverrides);
      const a = new Set(autoDesigned);
      for (const id of ids) { m.add(id); a.delete(id); }
      manualOverrides = m;
      autoDesigned = a;
    },
    clearMarks(ids: Iterable<number>) {
      const m = new Set(manualOverrides);
      const a = new Set(autoDesigned);
      for (const id of ids) { m.delete(id); a.delete(id); }
      manualOverrides = m;
      autoDesigned = a;
    },
    resetMarks() { manualOverrides = new Set(); autoDesigned = new Set(); provisionalIds = new Set(); },

    computeDemands,
    runCodeCheck,
    autoDesign,
    designAll,
    designOne,
  };
}

export const designRunStore = createDesignRunStore();
