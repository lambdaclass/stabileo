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

import { emptyStoredDecisions, migrateStoredDecisions, withProposals } from '../design-contract/decisions';
import { lateralResolver } from './lateral-system';
import type { ProvidedReinforcement } from '../design-contract/reinforcement';
import { designContextOptions, designData, verifyOptions } from './design-data';
import { beamFlanges, beamsInSlabPlane } from '../engine/design/beam-flange';
import { solveStiffnessFactors } from '../engine/member-behaviour';
import { PHYSICAL_GROUP_KIND } from '../model/physical/types';

/** The flanges of the model's beams, from its slabs' shells and its physical beams' spans. */
function modelFlanges() {
  if (modelStore.quads.size === 0) return new Map();
  const spans = new Map<number, number[]>();
  for (const g of modelStore.model.groups.values()) {
    if (g.kind !== PHYSICAL_GROUP_KIND || (g.data as { kind?: string } | undefined)?.kind !== 'beam') continue;
    for (const id of g.members.elements ?? []) spans.set(id, g.members.elements ?? []);
  }
  return beamFlanges({ nodes: modelStore.nodes, elements: modelStore.elements, sections: modelStore.sections, quads: modelStore.quads, spanOf: (id) => spans.get(id) });
}
import { physicalKindIndex } from '../model/physical';
import { groupSpanContexts, oneContextPerSpan, spanOutcomesToPieces, withSpanPieces } from './design-spans-store';
import { applySlabColumnJoints } from './analysis-validity-store';
import { activePerCombo3D, activeCombinations, noLinearCombinationActive } from './active-results';
import { applyStoreySway } from './storey-sway';
import { applySoftStoreys } from './seismic-design.svelte';
import { modelStore } from './model.svelte';
import { requestAutosave } from './autosave-service';
import { DESIGN_PHYSICAL_SEARCH_BUDGET } from '../engine/detailing/physical-design-search';
import { regulationsStore } from './regulations.svelte';
import type { RegulationEdition } from '../codes/regulation';
import { detailingStore } from './detailing.svelte';
import { resultsStore } from './results.svelte';
import { verificationStore } from './verification.svelte';
import { isKeptRefusal, recordRefusals } from './design-refusals';
import { computeStationDemands, runCirsocDesign } from '../engine/verification-service';
import { censusRcCheckability } from '../engine/auto-verify';
import { concreteStrengthWarnings } from '../engine/model-diagnostics';
import {
  buildAllMemberContexts, buildCriticalSectionMap, type ContextModelData, type MemberContext,
} from '../engine/design/member-context';
import { catalogueGradeFamily } from '../engine/steel/grade-family';
import { runOrientationDiagnostic } from '../engine/design/orientation-diagnostic';
import { runDesign, designMember, DEFAULT_RUN_MS } from '../engine/design/candidate-search';
import { getDesignCode, type DesignCodeId } from '../engine/design/code-adapter';
import { emptyRunSummary, type DesignRunSummary, type MemberDesignOutcome } from '../engine/design/outcome';
import type { RunProgress } from '../engine/design/candidate-search';
import { designDemands, isDesignedMember } from '../engine/design/behaviour-demands';
import {
  DESIGN_FAMILIES, DEFAULT_DESIGN_FAMILIES, FLOOR_FAMILIES, FRAME_FAMILIES, emptyFamilyResult,
  needsFloorPass, needsFramePass,
  type DesignFamily, type DesignFamilySelection, type DesignRunReport, type FamilyRunResult,
} from '../engine/design/design-families';

/** The sizing cycle can retain a scoped repair until its final structural solve. */
export type DeferredPhysicalRepair = (repair: () => void) => void;

interface DesignDetailingOptions { force?: boolean; verifierId?: string; deferPhysicalRepair?: DeferredPhysicalRepair }

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
  /**
   * What the next design run will cover.
   *
   * Lifted out of `DesignFamilyPanel` in F2 so that ONE command can run it. The selector and
   * the command sit in different components — the boxes below the table, the button in the
   * command bar — and while the selection lived in the panel there had to be a second button
   * beside the boxes to reach it. Two buttons that design different scopes is precisely the
   * contradiction §2 of the scope names.
   */
  let familySelection = $state<DesignFamily[]>([...DEFAULT_DESIGN_FAMILIES]);
  /**
   * What the last scoped run reported, family by family.
   *
   * Held here and not in `DesignFamilyPanel` because F2 moved the COMMAND out of that panel: the
   * button that starts the run is in the command bar, the block that reports it is below the
   * table, and while the report lived in the panel only the panel's own (now removed) button
   * could fill it. The result was that the run report stopped appearing at all — with it went
   * the distinction between a family skipped because the user did not ask for it and one absent
   * because the model has none.
   */
  let lastFamilyReport = $state<DesignRunReport | null>(null);
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
      const computed = computeStationDemands(
        activePerCombo3D(), activeCombinations(), md as never,
      );
      // Design follows the member's behaviour: inactive members out, one-way ones masked.
      const stationData = { ...computed, demands: designDemands(computed.demands, (id) => { const e = modelStore.elements.get(id); return isDesignedMember(e, modelStore.sections) ? e?.behaviour : 'inactive'; }) };
      // With every active combination an SRSS or ABS one there is no signed demand to design for,
      // and that is what is said: "no demands could be extracted" read as a fault of the results.
      if (stationData.demands.size === 0) return fail(noLinearCombinationActive() ? 'design.error.noLinearCombination' : 'design.error.noDemands');

      const orient = runOrientationDiagnostic(md, stationData.demands, modelStore.model.loads as never);
      const contexts = buildAllMemberContexts(md, {
        demands: stationData.demands,
        stations: stationData.stations,
        criticalSections: buildCriticalSectionMap(md, designData().covers.beam, designData().stirrupDiaMm),
        // The project's steel, covers, stirrup and the bars it lets the design choose from.
        ...designContextOptions(),
        orientationSuspect: orient.suspect,
        analysisRevision: verificationStore.analysisRevision,
        demandRevision: verificationStore.demandRevision + 1,
        // The project decides which edition governs and what the aggregate size is.
        // Without this the design would silently run under the built-in default rather
        // than under what the project states it is designed to.
        codeEdition: concreteEdition(),
        concrete: modelStore.model.codeSettings?.concrete,
        // A beam cast with its slab acts as a T or an L (Table 6.3.2.1).
        flangeOf: ((f) => (id: number) => f.get(id))(modelFlanges()),
        // The J the analysis gave each member (its own modifier, or the project's on concrete beams).
        torsionStiffnessOf: ((md) => (id: number) => solveStiffnessFactors(md as never, id).j)({ nodes: modelStore.nodes, elements: modelStore.elements, materials: modelStore.materials, sections: modelStore.sections, analysis: modelStore.analysis }),
        // Its in-plane bending carried by the slab's diaphragm, flange or not.
        inSlabPlane: ((s) => (id: number) => s.has(id))(modelStore.quads.size ? beamsInSlabPlane({ nodes: modelStore.nodes, elements: modelStore.elements, sections: modelStore.sections, quads: modelStore.quads }) : new Set<number>()),
        // The model's physical elements say what each bar is; geometry only where none does.
        physicalKindOf: ((idx) => (id: number) => idx.get(id))(physicalKindIndex(modelStore.model.groups.values())),
        // Each member's role in the lateral system, as the project declares it; none is read off
        // the geometry (`model/lateral-system.ts`).
        lateralOf: lateralResolver(),
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
      // A sway storey magnifies its slender columns' moments by δs (§6.6.4.6); a soft storey's
      // members take their amplification in the seismic combinations.
      applyStoreySway(contexts); applySoftStoreys(contexts);
      // A beam the analysis cut into pieces (a slab's mesh nodes) is designed as its span: each
      // piece's context becomes the span's, under the piece's own id (`design-spans.ts`).
      groupSpanContexts(contexts);
      // How each member's floor joins its slab to the columns (`analysis-validity.ts`): a one-node
      // joint leaves the split of the slab's load between beams and columns unestablished, and that
      // is stated on the member, the certificate and the document, never read as a pass.
      applySlabColumnJoints(contexts);
      verificationStore.setDemandData(contexts, orient.issues);
      resultsStore.diagramType = 'verification';
      /*
       * No concrete member at all is not a success. It used to return ok here, and every
       * member then read `unavailable` with no message anywhere — the case of a concrete
       * building whose material carries fy = 420, filed as steel by its magnitude. The
       * explanation is the same one the code check gives, so the two steps cannot disagree.
       */
      if (contexts.size === 0 && modelStore.elements.size > 0) {
        const strength = failConcreteStrength();
        if (strength) return strength;
        const a = adapter();
        if (a) return failNothingChecked(a.name);
      }
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
        verifyOptions(),
      );
      if (normalized.length === 0 || !summary) return failNothingChecked(a.name);
      verificationStore.setDesignBaseline(concrete, normalized, summary);
      resultsStore.diagramType = 'verification';
      return { ok: true };
    } finally {
      phase = 'idle';
    }
  }

  /** What the last run left alone: locked members, and edited ones it was told to keep. */
  let lastSkipped = $state<{ locked: number; edited: number }>({ locked: 0, edited: 0 });
  const currentDecisions = () => (modelStore.designDecisions ? migrateStoredDecisions(modelStore.designDecisions) : emptyStoredDecisions());
  const lockedNow = () => new Set(currentDecisions().locked);

  /**
   * 3. Auto-design. Only VERIFIED results are written to the model; provisional
   *    (failing) candidates are retained on the outcome for review and are never
   *    assigned, never certified and never counted as passing.
   */
  function autoDesign(
    elementIds: Iterable<number>,
    /**
     * `edited`: what to do with members a person edited and did not lock, keep their bars or
     * design over them. Kept unless the caller says to overwrite: one rule for every design
     * command, so no button designs over a person's bars without asking. Locked members are
     * never redesigned.
     */
    opts: { maxRunMs?: number; deferDetailing?: boolean; edited?: 'keep' | 'overwrite';
      detailing?: DesignDetailingOptions } = {},
  ): CommandResult {
    lastError = null;
    const a = adapter();
    if (!a) return fail('design.error.noAdapter');
    if (!a.capabilities.candidateGeneration) return fail('design.error.codeUnsupported', { code: a.name });
    if (!verificationStore.hasDemandData) {
      const r = computeDemands();
      if (!r.ok) return r;
    }
    // A piece of a span is designed as the span, so asking for one asks for all of them.
    const ctxOf = (id: number) => verificationStore.contextFor(id);
    const asked = withSpanPieces(elementIds, ctxOf);
    const locked = lockedNow();
    const keepEdited = opts.edited !== 'overwrite';
    lastSkipped = {
      locked: asked.filter((id) => locked.has(id)).length,
      edited: keepEdited ? asked.filter((id) => !locked.has(id) && manualOverrides.has(id)).length : 0,
    };
    const held = (id: number) => locked.has(id) || (keepEdited && manualOverrides.has(id));
    // A span with one piece held is held whole: its pieces carry one arrangement.
    const wanted = new Set(asked.filter((id) => !withSpanPieces([id], ctxOf).some(held)));
    if (wanted.size === 0 && asked.length > 0) return fail('design.error.allLocked');
    const all: MemberContext[] = [];
    for (const [id, ctx] of verificationStore.contexts) if (wanted.has(id)) all.push(ctx);
    const ctxs = oneContextPerSpan(all);
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
      summary.outcomes = spanOutcomesToPieces(summary.outcomes, ctxOf);
      publishOutcomes(summary, opts.deferDetailing ?? false, opts.detailing);
      return { ok: true };
    } finally {
      running = false;
      phase = 'idle';
    }
  }

  /** Merge a run's outcomes into the store and assign the verified reinforcement. */
  function publishOutcomes(summary: DesignRunSummary, deferDetailing: boolean,
    detailing?: DesignDetailingOptions) {
    // Merge with any previous run so designing a selection does not erase the rest.
    const prev = verificationStore.runSummary;
    const merged: DesignRunSummary = prev
      ? { ...summary, outcomes: new Map([...prev.outcomes, ...summary.outcomes]) }
      : summary;
    // Recount after the merge so the summary bar reflects every known member.
    recount(merged);
    verificationStore.setDesignOutcomes(merged);
    // The refusals, kept with the project: a refused member has no bars to come back from.
    recordRefusals(merged.outcomes.values());

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

    // Never over a lock, whatever asked for the run.
    const locked = lockedNow();
    const writes = withSteel.filter((w) => !locked.has(w.id));
    if (writes.length > 0) {
      const written = modelStore.reinforcementTransaction((api) => {
        for (const w of writes) api.setReinforcement(w.id, w.rebar);
        // What was proposed, kept to revert to — also after the project is reopened.
        api.setDecisions(withProposals(currentDecisions(), writes.map((w) => [w.id, w.rebar] as [number, ProvidedReinforcement])));
      });
      const auto = new Set(autoDesigned);
      const manual = new Set(manualOverrides);
      for (const id of written) { auto.add(id); manual.delete(id); }
      autoDesigned = auto;
      manualOverrides = manual;
    }

    // Repair only the members reached by this sizing command. Skipped edits, locks,
    // unselected families and unreached members remain neighbours, never repair targets.
    if (!deferDetailing && (detailing?.force || detailingStore.autoGenerate)) {
      const scope = { verifierId: detailing?.verifierId, repairMemberIds: [...summary.outcomes.keys()] };
      const repair = () => { detailingStore.generate({ ...scope, physicalSearch: DESIGN_PHYSICAL_SEARCH_BUDGET }); };
      if (detailing?.deferPhysicalRepair) {
        detailingStore.generate(scope);
        detailing.deferPhysicalRepair(repair);
      } else repair();
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

  /**
   * Design all: the convenience chain. Progress + cancellation + partial honesty.
   *
   * `maxRunMs`: the run's wall-clock cap, the user's 20 s by default (`DEFAULT_RUN_MS`). A caller
   * that needs the whole model designed whatever the machine, a test on the 408-member flagship,
   * passes its own, as the engine's tests pass theirs to `runDesign`.
   */
  function designAll(opts: { maxRunMs?: number } = {}): CommandResult {
    const d = computeDemands();
    if (!d.ok) return d;
    const c = runCodeCheck();
    if (!c.ok) return c;
    /*
     * Undesigned: no bars, and no refusal either. A refused member has no bars because the design
     * ran on it and refused, and its refusal is kept with the project (`design-refusals.ts`). Read
     * as undesigned, one refusal anywhere turned every later «design all» into a retry of the
     * refused members alone: after a reopen the members with bars were never designed again, had
     * no outcome, and the detailing read all of them as not verified (rc-qa-diagnostic, 26 of 26).
     */
    const all = [...verificationStore.contexts.keys()];
    /*
     * Bars the design wrote and has no answer for any more: a structural change (a member
     * deleted, a section changed) clears every outcome, and the kept refusals with them, since
     * they were reached on another model. Reading those bars as «designed» made «design all»
     * redesign only the members that had none, the refused ones (qa-8 with a beam deleted: 2 of
     * the 7 left), and the detailing then refused the rest as not verified. So, as after a
     * reopen, the whole model is designed again, except the bars a person wrote
     * (`manualOverrides`), which stay theirs. Not only the lost ones: a run records the
     * refusals it holds (`recordRefusals`), and one that left the refused members out would
     * drop theirs.
     */
    const answerLost = all.some((id) => !!modelStore.elements.get(id)?.reinforcement
      && !verificationStore.outcomeFor(id) && !manualOverrides.has(id));
    if (answerLost) {
      const again = all.filter((id) => !manualOverrides.has(id));
      return autoDesign(again.length > 0 ? again : all, { maxRunMs: opts.maxRunMs });
    }
    const undesigned: number[] = [];
    for (const id of all) {
      if (modelStore.elements.get(id)?.reinforcement) continue;
      if (isKeptRefusal(verificationStore.outcomeFor(id))) continue;
      undesigned.push(id);
    }
    const target = undesigned.length > 0 ? undesigned : all;
    return autoDesign(target, { maxRunMs: opts.maxRunMs });
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
    opts: { verifierId?: string; edited?: 'keep' | 'overwrite'; maxRunMs?: number; deferPhysicalRepair?: DeferredPhysicalRepair } = {},
  ): DesignRunReport {
    // Recorded before returning, so both the caller and the panel read one report.
    const record = <T extends DesignRunReport>(r: T): T => { lastFamilyReport = r; return r; };
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
        if (target.length > 0) {
          // The global command owns detailing, including its verifier. Run its feedback
          // once, before reading the repaired outcomes into the family summaries.
          autoDesign(target, { maxRunMs: opts.maxRunMs, detailing: { force: true, verifierId: opts.verifierId, deferPhysicalRepair: opts.deferPhysicalRepair },
            ...(opts.edited ? { edited: opts.edited } : {}) });
        }

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
    return record({ selection, families, ok: families.every((f) => f.state !== 'failed') });
  }

  /** Re-run the search for one member (used after a section change is approved). */
  function designOne(elementId: number): MemberDesignOutcome | null {
    const a = adapter();
    const ctx = verificationStore.contextFor(elementId);
    if (!a || !ctx) return null;
    const o = designMember(a, ctx);
    // A piece of a span is designed as the span: the outcome and the steel go to all its pieces.
    const pieces = withSpanPieces([elementId], (id) => verificationStore.contextFor(id));
    const prev = verificationStore.runSummary;
    const outcomes = new Map(prev?.outcomes ?? []);
    for (const id of pieces) outcomes.set(id, id === elementId ? o : { ...o, elementId: id });
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
    const biax = new Set(provisionalBiaxialIds);
    for (const id of pieces) {
      if (o.outcome !== 'VERIFIED' && o.provisional) prov.add(id);
      else prov.delete(id);
      if (o.outcome === 'PROVISIONAL_BIAXIAL') biax.add(id); else biax.delete(id);
    }
    provisionalIds = prov;
    provisionalBiaxialIds = biax;

    const steel = o.outcome === 'VERIFIED' ? o.accepted
      : o.outcome === 'PROVISIONAL_BIAXIAL' ? o.provisional?.candidate : undefined;
    const locked = lockedNow();
    if (steel && !pieces.some((id) => locked.has(id))) {
      modelStore.reinforcementTransaction((api) => {
        for (const id of pieces) api.setReinforcement(id, steel);
        api.setDecisions(withProposals(currentDecisions(), pieces.map((id) => [id, steel] as [number, ProvidedReinforcement])));
      });
      const auto = new Set(autoDesigned), manual = new Set(manualOverrides);
      for (const id of pieces) { auto.add(id); manual.delete(id); }
      autoDesigned = auto; manualOverrides = manual;
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
    if (c.checkable === 0) {
      const strength = failConcreteStrength();
      if (strength) return strength;
    }
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

  /**
   * The refusal for a concrete whose `fy` holds a steel number, or null when no member's
   * material looks like that.
   *
   * Checked before the census, because the census would otherwise answer "all N members are
   * steel" — true of the classification and false of the building, and precisely the sentence
   * that sends the user looking for a defect in the app instead of in the material.
   */
  function failConcreteStrength(): CommandResult | null {
    const suspects = concreteStrengthWarnings(modelStore.materials, modelStore.elements);
    if (suspects.length === 0) return null;
    const first = suspects[0]!.details as { material: string; fy: number };
    const n = suspects.reduce((sum, d) => sum + (d.elementIds?.length ?? 0), 0);
    return fail('design.error.concreteFyReadAsSteel', { material: first.material, fy: first.fy, n });
  }

  return {
    get running() { return running; },
    get phase() { return phase; },
    get progress() { return progress; },
    get lastError() { return lastError; },
    clearError() { lastError = null; },
    cancel() { abortFlag.aborted = true; },

    get lastFamilyReport(): DesignRunReport | null { return lastFamilyReport; },
    get familySelection(): readonly DesignFamily[] { return familySelection; },
    /**
     * Replace the scope of the next run.
     *
     * Sorted into `DESIGN_FAMILIES` order and de-duplicated, so the read-out beside the command
     * and the boxes below the table name the families the same way round.
     */
    setFamilySelection(next: Iterable<DesignFamily>): void {
      const want = new Set(next);
      familySelection = DESIGN_FAMILIES.filter((f) => want.has(f));
    },
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
    get lastSkipped() { return lastSkipped; },
    markManual(ids: Iterable<number>) {
      const m = new Set(manualOverrides);
      const a = new Set(autoDesigned);
      for (const id of ids) { m.add(id); a.delete(id); }
      manualOverrides = m;
      autoDesigned = a;
    },
    /** Bars put back to the design run's own arrangement: designed, not retouched. */
    markAuto(ids: Iterable<number>) {
      const m = new Set(manualOverrides);
      const a = new Set(autoDesigned);
      for (const id of ids) { m.delete(id); a.add(id); }
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
    /** The bound concrete design code, or none. */
    currentAdapter: adapter,
  };
}

export const designRunStore = createDesignRunStore();
