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
import { requestAutosave } from './autosave-service';
import { regulationsStore } from './regulations.svelte';
import type { RegulationEdition } from '../codes/regulation';
import { detailingStore } from './detailing.svelte';
import { resultsStore } from './results.svelte';
import { verificationStore } from './verification.svelte';
import { computeStationDemands, runCirsocDesign } from '../engine/verification-service';
import { censusRcCheckability } from '../engine/auto-verify';
import {
  buildAllMemberContexts, buildCriticalSectionMap, type ContextModelData, type MemberContext,
} from '../engine/design/member-context';
import { catalogueGradeFamily } from '../engine/steel/grade-family';
import { runOrientationDiagnostic } from '../engine/design/orientation-diagnostic';
import { runDesign, designMember, DEFAULT_RUN_MS } from '../engine/design/candidate-search';
import { getDesignCode, type DesignCodeId } from '../engine/design/code-adapter';
import { emptyRunSummary, type DesignRunSummary, type MemberDesignOutcome } from '../engine/design/outcome';
import type { RunProgress } from '../engine/design/candidate-search';
import {
  DESIGN_FAMILIES, FLOOR_FAMILIES, FRAME_FAMILIES, emptyFamilyResult, isFrameFamily,
  needsFloorPass, needsFramePass,
  type DesignFamily, type DesignFamilySelection, type DesignRunReport, type FamilyRunResult,
} from '../engine/design/design-families';

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
  /**
   * Whether `manualOverrides` is a statement or an absence.
   *
   * True for a fresh project — nothing has been retouched, and that is known. False only after
   * opening a file written before the set was persisted, where "no members" means "we have no
   * record", not "none were touched". The two are different claims and an export must not
   * print the second when it means the first. See `rcRetouchProvenance`.
   */
  let manualKnown = $state(true);
  /** Elements whose reinforcement came from auto-design. */
  let autoDesigned = $state<Set<number>>(new Set());
  /** Members whose provisional (failing) candidate was retained for review. */
  let provisionalIds = $state<Set<number>>(new Set());
  /**
   * Members carrying a PROVISIONAL_BIAXIAL proposal — steel in the model, no certificate.
   *
   * Separate from `provisionalIds`, which holds "the best candidate we could not make pass",
   * because these two mean opposite things: one is a member whose design FAILED and whose best
   * attempt is kept for review, the other is a member whose primary axis was designed and
   * verified and whose secondary axis nobody checks. Merging them would let a failing member
   * inherit a proposal's treatment.
   */
  let provisionalBiaxialIds = $state<Set<number>>(new Set());

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
        solveGeneration: verificationStore.solveGeneration,
        /*
         * A DECLARED grade decides the material family. An inferred one is the fallback.
         *
         * ── The defect this closes ──────────────────────────────────
         *
         * `materialFamilyOf` needs both a `gradeId` and a lookup: `if (material.gradeId &&
         * lookupGrade)`. The gradeId has always arrived — `md.materials` is the live map, so
         * the real `Material` objects flow through — but nothing in production ever supplied
         * the lookup. So the declared branch never ran and every material was classified by
         * the MAGNITUDE of `fy`, with `fy <= 80 MPa` read as concrete.
         *
         * Timber C24 is 24 MPa. It was being classified as concrete and admitted to the
         * reinforced-concrete pipeline, where 24 MPa reads as an ordinary f'c. The grade is in
         * the catalogue (`non-metal-grades.ts`, `en338-c24`, family `timber`) and was simply
         * never consulted. Aluminium below the threshold had the same problem.
         *
         * ── What this changes, and it is not only timber ─────────────
         *
         * Classification moves from inference to declaration, so members can CHANGE PIPELINE
         * in both directions: one that declares a steel grade and has a low `fy` leaves the
         * concrete design set, and one whose stored grade the catalogue no longer knows falls
         * back to the inference exactly as before. `buildAllMemberContexts` keeps only
         * `materialFamily === 'concrete'`, so this is the boundary between the concrete
         * pipeline and the metallic inventory — see the note in `grade-family.ts`.
         *
         * The lookup itself is M1's `catalogueGradeFamily`, taken as-is rather than
         * reimplemented: two functions answering "what family is this grade" would be two
         * answers, and this one is already the one the metallic surface uses. Its contract is
         * `(gradeId) => StructuralMaterialFamily | null`, where null means "this catalogue
         * cannot answer" and the caller falls back.
         */
        lookupGrade: catalogueGradeFamily,
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
      if (normalized.length === 0 || !summary) return failNothingChecked(a.name);
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

    /**
     * Two populations get steel written into the model, and they are not the same claim.
     *
     * VERIFIED members carry certified reinforcement. PROVISIONAL_BIAXIAL members carry a
     * PROPOSAL: the primary axis designed by the ordinary search, with the secondary axis
     * unchecked. Both are written, because a beam with no bars anywhere in the model is
     * invisible to the viewer, the drawings, the schedule and the report alike — which is
     * exactly the state 117 of the 119 beams in the flagship example were in.
     *
     * What keeps them apart is not the model, it is the OUTCOME: `provisionalBiaxialIds`
     * here, `PROVISIONAL_BIAXIAL` on the outcome, no certificate anywhere, and a status of
     * PROVISIONAL — never MODELLED — on every projection.
     */
    const withSteel: Array<{ id: number; rebar: NonNullable<MemberDesignOutcome['accepted']> }> = [];
    const provisional = new Set(provisionalIds);
    const biaxial = new Set(provisionalBiaxialIds);
    for (const [, o] of summary.outcomes) {
      if (o.outcome === 'VERIFIED' && o.accepted) withSteel.push({ id: o.elementId, rebar: o.accepted });
      if (o.outcome === 'PROVISIONAL_BIAXIAL' && o.provisional) {
        withSteel.push({ id: o.elementId, rebar: o.provisional.candidate });
        biaxial.add(o.elementId);
      } else {
        biaxial.delete(o.elementId);
      }
      if (o.outcome !== 'VERIFIED' && o.outcome !== 'PROVISIONAL_BIAXIAL' && o.provisional) {
        provisional.add(o.elementId);
      } else {
        provisional.delete(o.elementId);
      }
    }
    provisionalIds = provisional;
    provisionalBiaxialIds = biaxial;

    if (withSteel.length > 0) {
      const written = modelStore.reinforcementTransaction((api) => {
        for (const w of withSteel) api.setReinforcement(w.id, w.rebar);
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

    // A design run is the operation that made the old autosave fail — it is both the most
    // expensive state the app produces and the point at which the project outgrew
    // localStorage. It asks for a save immediately rather than waiting up to 30 s for the
    // timer, which is how the run got lost.
    void requestAutosave('design');
  }

  function recount(s: DesignRunSummary) {
    s.total = s.outcomes.size;
    s.verified = 0; s.sectionInadequate = 0; s.demandUnavailable = 0;
    s.searchExhausted = 0; s.unsupported = 0; s.provisionalRetained = 0;
    s.provisionalBiaxial = 0;
    for (const [, o] of s.outcomes) {
      if (o.provisional && o.outcome !== 'VERIFIED') s.provisionalRetained++;
      switch (o.outcome) {
        case 'VERIFIED': s.verified++; break;
        case 'PROVISIONAL_BIAXIAL': s.provisionalBiaxial++; break;
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

  /**
   * One command for the whole building, scoped to the families the user chose.
   *
   * ── Why this exists ────────────────────────────────────────────
   *
   * "Diseñar todo" ran `computeDemands → runCodeCheck → autoDesign` over the frame and
   * stopped. Slabs, walls and foundations came from `Ejecutar diseño de pisos` in a different
   * disclosure, so the button named "all" produced a building with no floors and said nothing
   * about it. The user found out from the 3-D view.
   *
   * ── One implementation, not two ────────────────────────────────
   *
   * This does not reimplement either pass. It calls `autoDesign` for the frame families and
   * `detailingStore.generate` / `generateFloors` for the rest — the same functions the
   * individual buttons call — so the advanced button and the global selector cannot diverge.
   * What it adds is the SCOPE and the per-family report.
   *
   * ── Idempotence ───────────────────────────────────────────────
   *
   * Nothing is run for a family that was not selected, and the frame pass is given only the
   * members of the selected frame families. Running it twice with the same selection reaches
   * the same state: `autoDesign` writes reinforcement through the existing transaction and
   * the detailing commands bump their own revisions, which is what the staleness machinery
   * already keys off.
   */
  function designFamilies(
    selection: DesignFamilySelection,
    opts: { verifierId?: string } = {},
  ): DesignRunReport {
    const families: FamilyRunResult[] = [];
    const chosen = new Set(selection);

    // ── Frame families ─────────────────────────────────────────
    const frameWanted = needsFramePass(selection);
    if (frameWanted) {
      const d = computeDemands();
      const c = d.ok ? runCodeCheck() : d;
      if (!d.ok || !c.ok) {
        const bad = !d.ok ? d : c;
        for (const f of FRAME_FAMILIES) {
          if (!chosen.has(f)) { families.push(emptyFamilyResult(f, 'skipped')); continue; }
          families.push({
            ...emptyFamilyResult(f, 'failed'),
            errorKey: bad.reasonKey, errorParams: bad.params,
          });
        }
      } else {
        // Split the members by what the context says they are, so "columns only" designs
        // columns only. The context is the same authority the search reads.
        const byFamily = new Map<DesignFamily, number[]>();
        for (const [id, ctx] of verificationStore.contexts) {
          const t = (ctx as { elementType?: string }).elementType;
          const f: DesignFamily | null = t === 'column' ? 'column' : t === 'beam' ? 'beam' : null;
          if (!f) continue;
          byFamily.set(f, [...(byFamily.get(f) ?? []), id]);
        }
        const target = FRAME_FAMILIES
          .filter((f) => chosen.has(f))
          .flatMap((f) => byFamily.get(f) ?? []);
        if (target.length > 0) autoDesign(target);

        for (const f of FRAME_FAMILIES) {
          if (!chosen.has(f)) { families.push(emptyFamilyResult(f, 'skipped')); continue; }
          const ids = byFamily.get(f) ?? [];
          if (ids.length === 0) { families.push(emptyFamilyResult(f, 'noElements')); continue; }
          let designed = 0;
          let refused = 0;
          let notModelled = 0;
          for (const id of ids) {
            const o = verificationStore.outcomeFor(id);
            if (!o) continue;
            if (o.outcome !== 'VERIFIED') refused += 1;
            else if (o.accepted) designed += 1;
            else notModelled += 1;
          }
          families.push({
            family: f, state: 'designed', processed: ids.length, designed, refused, notModelled,
          });
        }
      }
    } else {
      for (const f of FRAME_FAMILIES) families.push(emptyFamilyResult(f, 'skipped'));
    }

    // Frame detailing follows the frame design, and only when a frame family was designed.
    if (frameWanted && families.some((f) => isFrameFamily(f.family) && f.state === 'designed')) {
      detailingStore.generate({ verifierId: opts.verifierId });
    }

    // ── Floor families ─────────────────────────────────────────
    if (needsFloorPass(selection)) {
      const floorSel = FLOOR_FAMILIES.filter((f) => chosen.has(f));
      detailingStore.generateFloors({
        verifierId: opts.verifierId,
        families: floorSel as readonly ('slab' | 'wall' | 'footing')[],
      });
      const run = detailingStore.lastFloorRun;
      for (const f of FLOOR_FAMILIES) {
        if (!chosen.has(f)) { families.push(emptyFamilyResult(f, 'skipped')); continue; }
        families.push(floorFamilyResult(f, run));
      }
    } else {
      for (const f of FLOOR_FAMILIES) families.push(emptyFamilyResult(f, 'skipped'));
    }

    // Report in selector order rather than run order, so the panel reads the same as the
    // checkboxes above it.
    families.sort((a, b) =>
      DESIGN_FAMILIES.indexOf(a.family) - DESIGN_FAMILIES.indexOf(b.family));
    return { selection, families, ok: families.every((f) => f.state !== 'failed') };
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
      // `emptyRunSummary` rather than a literal: a counter added to the summary must not be
      // silently absent on the single-member path, which is how `provisionalBiaxial` would
      // have read zero after re-designing one member.
      : { ...emptyRunSummary(a.id, a.version), outcomes, wallMs: o.searchStats.ms };
    recount(s);
    verificationStore.setDesignOutcomes(s);
    // Keep provisionalIds in sync like publishOutcomes does — otherwise a
    // member re-designed alone stays flagged provisional after verifying (or
    // never gets flagged when it becomes provisional).
    const prov = new Set(provisionalIds);
    if (o.outcome !== 'VERIFIED' && o.provisional) prov.add(elementId);
    else prov.delete(elementId);
    provisionalIds = prov;

    const biax = new Set(provisionalBiaxialIds);
    if (o.outcome === 'PROVISIONAL_BIAXIAL') biax.add(elementId); else biax.delete(elementId);
    provisionalBiaxialIds = biax;

    const steel = o.outcome === 'VERIFIED' ? o.accepted
      : o.outcome === 'PROVISIONAL_BIAXIAL' ? o.provisional?.candidate : undefined;
    if (steel) {
      modelStore.reinforcementTransaction((api) => api.setReinforcement(elementId, steel));
      const auto = new Set(autoDesigned); auto.add(elementId); autoDesigned = auto;
      const manual = new Set(manualOverrides); manual.delete(elementId); manualOverrides = manual;
    }
    return o;
  }

  /**
   * What the floor run produced for one family.
   *
   * Read off the run's own records rather than recounted: the run already decided what it
   * designed, and a second tally here could disagree with the certificates it issued.
   */
  function floorFamilyResult(
    family: DesignFamily,
    run: { assemblies?: Array<{ families?: Array<{ family: string; barIds?: string[] }> }> } | null,
  ): FamilyRunResult {
    const records = (run?.assemblies ?? [])
      .flatMap((a) => a.families ?? [])
      .filter((r) => r.family === family);
    if (records.length === 0) return emptyFamilyResult(family, 'noElements');
    let designed = 0;
    let notModelled = 0;
    for (const r of records) {
      if ((r.barIds ?? []).length > 0) designed += 1; else notModelled += 1;
    }
    return {
      family, state: 'designed', processed: records.length,
      designed, refused: 0, notModelled,
    };
  }

  function fail(key: string, params?: Record<string, string | number>): CommandResult {
    lastError = { key, params };
    return { ok: false, reasonKey: key, params };
  }

  /**
   * Say WHY the concrete code checked nothing, not merely that it did.
   *
   * ── The report this replaces ───────────────────────────────────
   *
   * "CIRSOC 201-2025 verified no member in this model." True of a steel tower, true of a
   * model with generic sections, and true of a genuine defect — three different situations,
   * one sentence, no way to tell them apart. The steel case is not even an error: an all-steel
   * structure has no reinforced concrete to design, and the user is entitled to be told that
   * rather than left to suspect the app.
   *
   * The census comes from `rcCheckability`, the same predicate the verifier skips on, so this
   * explanation cannot drift from the silence it is explaining.
   */
  function failNothingChecked(codeName: string): CommandResult {
    const c = censusRcCheckability(modelData() as never);
    if (c.total === 0) return fail('design.error.nothingChecked', { code: codeName });
    if (c.checkable === 0 && c.notConcrete === c.total) {
      return fail('design.error.noConcreteMembers', { code: codeName, n: c.total });
    }
    if (c.checkable === 0 && c.noRectangle > 0) {
      return fail('design.error.noRectangularSections', { code: codeName, n: c.noRectangle });
    }
    if (c.checkable === 0) {
      return fail('design.error.noConcreteMembersMixed', {
        code: codeName, steel: c.notConcrete, other: c.noRectangle + c.noSection + c.noMaterial,
      });
    }
    // Members ARE checkable and the run still produced nothing. That is the case the original
    // message was written for, and the only one it describes correctly.
    return fail('design.error.nothingChecked', { code: codeName });
  }

  return {
    get running() { return running; },
    get phase() { return phase; },
    get progress() { return progress; },
    get lastError() { return lastError; },
    clearError() { lastError = null; },
    cancel() { abortFlag.aborted = true; },

    get manualOverrides() { return manualOverrides; },
    get manualProvenanceKnown() { return manualKnown; },
    /**
     * Adopt the override set from a project file.
     *
     * `undefined` means the file predates the field, and is the ONLY way `manualKnown` becomes
     * false — an empty array is a file that recorded "nothing was retouched" and is believed.
     */
    hydrateManual(ids: readonly number[] | undefined): void {
      manualKnown = ids !== undefined;
      manualOverrides = new Set(ids ?? []);
    },
    get autoDesigned() { return autoDesigned; },
    get provisionalIds() { return provisionalIds; },
    get provisionalBiaxialIds() { return provisionalBiaxialIds; },
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
    resetMarks() {
      // A new project knows its own history: nothing has been retouched yet.
      manualKnown = true;
      manualOverrides = new Set();
      autoDesigned = new Set();
      provisionalIds = new Set();
      provisionalBiaxialIds = new Set();
    },

    computeDemands,
    runCodeCheck,
    designFamilies,
    autoDesign,
    designAll,
    designOne,
  };
}

export const designRunStore = createDesignRunStore();
