/**
 * Detailing workflow store.
 *
 * Owns the coordinated assemblies, the selection, and the review actions. Everything it
 * computes comes from the pure engines in `lib/engine/detailing/`; this layer only holds
 * state and routes user intent, so the whole pipeline stays testable without a DOM.
 *
 * Assemblies live on the model (so they persist); this store is a view over them plus
 * the transient UI state that should NOT persist — which assembly is selected, which
 * conflict the user is stepping through, whether the sheet preview is open.
 */

import { modelStore } from './model.svelte';
import { requestAutosave } from './autosave-service';
import {
  applyReview, emptyDetailingStore, invalidateAffected, isDemandStale, isReviewStale,
  type DetailingAssembly, type DetailingStore, type ReviewRecord,
} from '../engine/detailing/assembly';
import { provisionalKeys } from '../engine/detailing/coordinate-floor';
import type { BarConflict } from '../engine/detailing/collision';
import { buildSchedule, buildTitleBlock } from '../engine/detailing/drawings';
import { rotuloFor } from './detailing-sheet-inputs';
import { rcEditConsequence, type RcEditConsequence } from '../flow/rc-selection';
import { clause } from '../codes/regulation';
import {
  detailingReadiness, runDetailing,
  type DetailingReadiness, type RunDetailingResult,
} from '../engine/detailing/run-detailing';
import { verificationStore } from './verification.svelte';
import { rebarHash } from '../engine/design/rebar-hash';
import { getDesignCode } from '../engine/design/code-adapter';
import {
  runDesignFeedbackLoop, type DesignFeedbackLoopResult,
} from '../engine/detailing/design-feedback-loop';
import { buildDocumentModel, supersede, type DocumentModel } from '../engine/detailing/document-model';
import { regulationsStore } from './regulations.svelte';
import {
  floorDesignReadiness, runFloorDesign,
  type FloorDesignReadiness, type RunFloorDesignResult,
} from '../engine/detailing/run-floor-design';
import {
  runFootingDesign, type RunFootingDesignResult,
} from '../engine/detailing/run-footing-design';
import type { EngineMessage } from '../codes/message';
// A store is a locale boundary — `model.svelte.ts` translates here too. The combination
// name is a plain string because a user-given combination name is not translatable; only
// the synthetic "active result set" stand-in needs a locale.
import { t, tp } from '../i18n';
import type { MemberDesignOutcome } from '../engine/design/outcome';
import { DAGG_ASSUMED_MM } from '../codes/project-code-settings';

/**
 * The sheet surface — kind, station, rótulo, SVG — is `detailing-sheet.svelte.ts`.
 *
 * It left when objectives 7 and 8 gave it real geometry and a title block, because the ceiling
 * gate says what to do when a change needs more room: extract, do not raise the number. It is
 * a store of its own and not another `-inputs.ts` module because it holds state.
 */
export type { SheetSelection } from './detailing-sheet.svelte';

/**
 * The model readings this store routes. Twenty functions that answer one question each and
 * hold no state; they moved out when this file was 1566 lines against a 800-line ceiling.
 * See `detailing-inputs.ts` for why they are grouped rather than threaded through arguments.
 */
import {
  CONCRETE_REGULATION_ID, DEFAULT_WALL_BAR_DIA_MM, bentUpPolicy, currentConcreteEdition,
  collectCertificates, designOutcomeMap, lockedMemberIds, maxPersistedRevision, resolveAggregate,
  resolveConcreteProperties, resolveSpacingMargin, resolveVerifierId, statedAggregate,
} from './detailing-project-inputs';
import {
  analysisStaleForFloor, collectShells, collectStresses, factoredAreaLoads, scopedShells,
} from './detailing-floor-inputs';
import {
  collectFootingColumns, collectFootingReactions, collectSlabColumns, footingRunFingerprint,
} from './detailing-footing-inputs';
function createDetailingStore() {
  let selectedId = $state<string | null>(null);
  let conflictIndex = $state(0);
  let lastError = $state<string | null>(null);
  let reviewOpen = $state(false);
  let generating = $state(false);
  /**
   * Project policy: run detailing automatically after a successful design.
   *
   * On by default, because a user who has just verified a floor wants its bars. Opt-out
   * exists because regenerating is not free on a large model and some users detail once,
   * at the end. Persisted with the model, not with the browser: it is a project decision.
   */
  let lastRun = $state<RunDetailingResult | null>(null);
  let lastFloorRun = $state<RunFloorDesignResult | null>(null);
  let lastFootingRun = $state<RunFootingDesignResult | null>(null);
  /** The inputs `lastFootingRun` was produced from. See `footingRunFingerprint`. */
  let lastFootingRunFingerprint = $state<string | null>(null);
  let currentDocument = $state<DocumentModel | null>(null);
  let supersededDocs = $state<DocumentModel[]>([]);
  /** Monotonic per project. Bumped on supersession, never reused. */
  let documentRevision = $state(1);
  /**
   * The last design–detailing feedback loop: its outcome, iterations and full trace.
   *
   * Kept so the UI and the report can state what the repair actually did — which members
   * were re-sized, at what geometry, and where a repair was refused because a bar is pinned
   * or the section is the limit. Null when no adapter could enumerate candidates.
   */
  let lastFeedbackLoop = $state<DesignFeedbackLoopResult | null>(null);
  /**
   * The consequence of the last reinforcement edit — see `applyEdit`.
   *
   * Session state, not persisted: it names the levels that stopped being current, and a
   * regeneration answers it. A reopened project either has the assemblies or does not.
   */
  let lastEdit = $state<RcEditConsequence | null>(null);

  const store = $derived<DetailingStore>(modelStore.model.detailing ?? emptyDetailingStore());
  const assemblies = $derived(store.assemblies);
  const selected = $derived<DetailingAssembly | null>(
    assemblies.find((a) => a.id === selectedId) ?? assemblies[0] ?? null,
  );

  const conflicts = $derived<BarConflict[]>(
    (selected?.conflicts ?? []).filter((c) => c.severity !== 'marginal'),
  );

  /**
   * Anything that changes what a document describes retires it.
   *
   * Loads, analysis, reinforcement, detailing geometry, the spacing margin, review, and
   * regulation settings all reach here. Non-destructive: the old revision keeps its number
   * and content and moves to the superseded list. A stale document must never remain
   * current, because "current" is exactly the claim a builder relies on.
   */
  function retireDocument(): void {
    if (!currentDocument) return;
    documentRevision += 1;
    supersededDocs = [...supersededDocs, supersede(currentDocument, documentRevision)];
    currentDocument = null;
  }

  function write(next: DetailingStore): void {
    modelStore.model.detailing = next;
  }

  /**
   * Publish a new set of assemblies — the ONE path that replaces them. Retires the current
   * document (the old geometry is not what exists any more) and answers the edit notice (the
   * levels it named have just been rebuilt). Its three callers each did the first by hand and
   * none of them did the second.
   */
  function publishAssemblies(next: DetailingStore): void {
    retireDocument();
    lastEdit = null;
    write(next);
  }

  /**
   * Persist reinforcement the feedback loop replaced, and republish the outcomes.
   *
   * Both halves are required. Writing the bars without the outcomes would leave the design
   * table certifying steel the model no longer has; publishing the outcomes without the bars
   * would draw a cage the reinforcement panel disagrees with. The repaired outcomes carry a
   * `finalGeometryCertificate`, so what is published is a claim about the geometry that
   * exists rather than the nominal one it was originally sized against.
   */
  function publishRepairedReinforcement(
    next: ReadonlyMap<number, MemberDesignOutcome>,
    before: ReadonlyMap<number, MemberDesignOutcome>,
  ): void {
    const repaired = [...next.values()].filter((o) => {
      const prev = before.get(o.elementId)?.accepted;
      return o.outcome === 'VERIFIED' && o.accepted && prev
        && rebarHash(o.accepted) !== rebarHash(prev);
    });
    if (repaired.length === 0) return;
    modelStore.reinforcementTransaction((api) => {
      for (const o of repaired) api.setReinforcement(o.elementId, o.accepted!);
    });
    const prev = verificationStore.runSummary;
    if (prev) {
      verificationStore.setDesignOutcomes({
        ...prev,
        outcomes: new Map([...prev.outcomes, ...repaired.map(
          (o) => [o.elementId, o] as const)]),
      });
    }
  }

  function replace(assembly: DetailingAssembly): void {
    write({
      ...store,
      assemblies: store.assemblies.map((a) => (a.id === assembly.id ? assembly : a)),
    });
  }

  return {
    get assemblies() { return assemblies; },
    get selected() { return selected; },
    get selectedId() { return selected?.id ?? null; },
    get conflicts() { return conflicts; },
    get conflictIndex() { return conflictIndex; },
    get currentConflict(): BarConflict | null { return conflicts[conflictIndex] ?? null; },
    get lastError() { return lastError; },
    get reviewOpen() { return reviewOpen; },

    /** Provisional calculations in the selected assembly that need acknowledgement. */
    get provisional(): string[] {
      return selected ? provisionalKeys(selected) : [];
    },

    /** True when the selected assembly's review no longer matches its revision. */
    get superseded(): boolean {
      return selected ? isReviewStale(selected) : false;
    },

    /** True when the bars were generated against demands that have since moved. */
    staleFor(demandRevision: number): boolean {
      return selected ? isDemandStale(selected, demandRevision) : false;
    },

    select(id: string): void {
      selectedId = id;
      conflictIndex = 0;
      lastError = null;
    },

    nextConflict(): void {
      if (conflicts.length === 0) return;
      conflictIndex = (conflictIndex + 1) % conflicts.length;
    },
    prevConflict(): void {
      if (conflicts.length === 0) return;
      conflictIndex = (conflictIndex - 1 + conflicts.length) % conflicts.length;
    },
    /**
     * Point the pager at one conflict directly.
     *
     * The review list addresses conflicts by position; stepping to the fortieth with `next` forty
     * times is not navigation. Out-of-range indices are ignored rather than clamped, because a
     * caller asking for a conflict that is not there has a bug and a silent clamp hides it.
     */
    goToConflict(i: number): void {
      if (i < 0 || i >= conflicts.length) return;
      conflictIndex = i;
    },

    openReview(): void { reviewOpen = true; lastError = null; },
    closeReview(): void { reviewOpen = false; },

    get generating() { return generating; },
    get lastRun() { return lastRun; },
    /** The last feedback loop's outcome and trace. Null when no repair pass could run. */
    get lastFeedbackLoop() { return lastFeedbackLoop; },

    /**
     * Are the prerequisites for detailing satisfied, and if not, exactly which?
     *
     * Drives the enabled/disabled state of the Generate command and the text beside it.
     * Cheap: it inspects outcomes, it does not generate anything.
     */
    get readiness(): DetailingReadiness {
      return detailingReadiness({
        contexts: verificationStore.contexts,
        outcomes: designOutcomeMap(),
      });
    },

    get autoGenerate() { return modelStore.model.detailingAuto !== false; },
    setAutoGenerate(on: boolean): void { modelStore.model.detailingAuto = on; },

    /**
     * THE production entry point: verified design → coordinated assemblies → model.
     *
     * This is the call the forensic audit found missing. Everything downstream —
     * persistence, revision invalidation, review, drawings, exports — hangs off the
     * assemblies it writes.
     */
    generate(opts: { verifierId?: string } = {}): RunDetailingResult | null {
      generating = true;
      lastError = null;
      try {
        /**
         * One full detailing pass for a given reinforcement assignment.
         *
         * Factored out because the feedback loop needs to run it more than once: coordination
         * moves steel, re-verification at the geometry that results can fail, and the repair
         * has to be coordinated and re-verified in turn.
         */
        const detail = (outcomes: ReadonlyMap<number, MemberDesignOutcome>) => runDetailing({
          contexts: verificationStore.contexts,
          outcomes,
          nodes: modelStore.nodes as never,
          elements: modelStore.elements as never,
          edition: currentConcreteEdition(),
          // Explicit argument wins so the golden chain can pin an identity; otherwise the
          // verification that actually ran supplies it. Never a bare '' default.
          verifierId: opts.verifierId ?? resolveVerifierId(),
          demandRevision: verificationStore.demandRevision,
          previousRevision: maxPersistedRevision(),
          maxAggregateSizeMm: resolveAggregate(),
          spacingMargin: resolveSpacingMargin(),
          /**
           * The production command ALWAYS supplies the authoritative verifier.
           *
           * Constructibility requires every member to have been rechecked at its final
           * effective depth. A run without a verifier leaves that condition unmet and the
           * assessment NOT_ESTABLISHED — correct as a default, and unacceptable as the
           * behaviour of the real command.
           *
           * The reinforcement checked is the ASSIGNMENT'S, not the model's: mid-loop they
           * differ, and checking the model's would re-verify the steel the repair is trying
           * to replace.
           */
          reverify: (elementId, loss) => verificationStore.reverifyAtFinalDepth(
            elementId, loss, outcomes.get(elementId)?.accepted),
          lockedBars: store.assemblies.flatMap((a) => a.bars.filter((b) => b.locked)),
          bentUp: bentUpPolicy(),
          /**
           * Whether the adapter that ran actually verifies torsion on beams.
           *
           * Read off the adapter rather than assumed, so the warning disappears by itself the
           * day a code adapter gains the check — and so nothing in the detailing layer has to
           * know which codes do. With no adapter there is no claim to read, and the safe
           * reading of silence about a verification is that it did not happen.
           */
          checksTorsion: adapter?.capabilities.beams.torsion === true,
        });

        // Detailing used to take its EDITION from Project Regulations and its ADAPTER from
        // the toolbar dropdown, so a member could be verified against one edition's clauses
        // and detailed under the other's. One source now.
        const concreteCode = regulationsStore.concreteDesignCode();
        const adapter = concreteCode ? getDesignCode(concreteCode) : undefined;
        const initial = designOutcomeMap();
        /**
         * Close the design–detailing loop.
         *
         * Without an adapter there is no candidate enumeration to feed back into, so the
         * single pass is all that is honestly available — and it still re-verifies, it just
         * cannot repair what it finds.
         */
        const loop = adapter
          ? runDesignFeedbackLoop({
            adapter,
            contexts: verificationStore.contexts,
            outcomes: initial,
            detail,
            lockedMembers: lockedMemberIds(),
          })
          : null;
        const result = loop ? loop.result : detail(initial);
        lastFeedbackLoop = loop;
        // A repair is not real until the model carries it. Persisting AFTER the loop means a
        // proposal that failed re-verification never reached the engineer's model at all.
        if (loop && loop.iterations.some((i) => i.changed.length > 0)) {
          publishRepairedReinforcement(loop.outcomes, initial);
        }
        lastRun = result;
        publishAssemblies({ ...store, assemblies: result.assemblies });
        if (!result.assemblies.some((a) => a.id === selectedId)) {
          selectedId = result.assemblies[0]?.id ?? null;
        }
        // Detailing is downstream of reinforcement. Nothing upstream moved, so the graph
        // preserves the loads, the analysis and the design, and invalidates only the
        // detailing and the document — no solve is required.
        regulationsStore.noteChange('reinforcementEdit');
        // Detailing geometry is expensive computed state produced by one click, so it asks
        // to be saved now rather than at the next 30 s tick.
        void requestAutosave('detailing');
        return result;
      } catch (e) {
        lastError = String(e instanceof Error ? e.message : e);
        return null;
      } finally {
        generating = false;
      }
    },

    /**
     * Can the floor workflow run, and if not, exactly why? Cheap; designs nothing.
     */
    get floorReadiness(): FloorDesignReadiness {
      return floorDesignReadiness({
        shells: collectShells(),
        stresses: collectStresses(),
        footings: [...modelStore.model.footings.values()],
      });
    },

    /**
     * THE production entry point for slabs and walls.
     *
     * The counterpart of `generate()` for the families PR18 added. Before this existed,
     * `designSlabPanel`, `designWall` and `buildFloorAssembly` had no caller outside their
     * unit tests, so no user action could reach any of them.
     *
     * Floor assemblies are `DetailingAssembly` values, so everything already built on top
     * of that type — selection, conflict navigation, the review gate, the document, the
     * DXF and the XLSX — receives them without a parallel pipeline.
     */
    /**
     * The floor pass, scoped to the families the caller asked for.
     *
     * ── Why the filter is here and the classifier is not ───────────
     *
     * `classifyShell` already decides whether a shell is a slab or a wall, and it lives in the
     * engine with the rest of the floor design. Re-deriving that here to filter would be a
     * second opinion about the same shell — the kind that agrees for a year and then does not.
     * So the shells are filtered THROUGH it.
     *
     * Footings are simpler: they are their own collection, so an unselected footing family
     * passes an empty list and the run reports no footings rather than pretending it checked.
     *
     * `families` absent means every family, which is what the existing advanced button and
     * every previous caller mean.
     */
    generateFloors(
      opts: { verifierId?: string; families?: readonly ('slab' | 'wall' | 'footing')[] } = {},
    ): RunFloorDesignResult | null {
      generating = true;
      lastError = null;
      try {
        const props = resolveConcreteProperties();
        // Footings are checked FIRST, so their entries can join the level assemblies the
        // shell pass builds. Their demand is a support reaction and their level is their
        // founding elevation, so neither comes from the shell loop.
        const wants = (f: 'slab' | 'wall' | 'footing') =>
          opts.families === undefined || opts.families.includes(f);
        const footingRun = runFootingDesign({
          footings: wants('footing') ? [...modelStore.model.footings.values()] : [],
          geotechnical: modelStore.model.geotechnical,
          nodes: modelStore.model.nodes as never,
          columns: collectFootingColumns(),
          reactions: collectFootingReactions(),
          fc: props.fc,
          fy: props.fy,
          edition: currentConcreteEdition(),
          // The project's own stated mat, resolved through the model so an older project
          // without the field reads as the 16/16 default it was already designed to.
          matPreferences: modelStore.footingMatPreferences(),
          // The same provenanced aggregate size the shells and the reports use. One value per
          // run, from `resolveAggregate()`, rather than a second assumption inside the footing
          // path.
          maxAggregateSizeMm: resolveAggregate(),
          // The revision vector the records and certificates are stamped with. Read from the
          // authoritative stores rather than defaulted: a certificate whose vector was
          // invented cannot detect its own staleness, and PR18 already found one instance of
          // that — a certificate stamped at analysis 6 comparing FRESH against an empty
          // vector, which is the precise failure the revision graph exists to prevent.
          // Three DISTINCT stages of the project's own revision vector, not one number
          // repeated. `analysis` moves on a re-solve, `combination` on a load change and
          // `regulationConfig` on a regulation change, and the three have different remedies
          // — a record that collapsed them could say a certificate was stale but not why.
          revisions: {
            analysis: regulationsStore.revisions.analysis,
            loads: regulationsStore.revisions.combination,
            regulation: regulationsStore.revisions.regulationConfig,
          },
          // The same single-element stack the DocumentModel states, so a record and the
          // document built from it cannot disagree about which regulation was applied.
          regulationIds: [CONCRETE_REGULATION_ID],
          // The revision the physical mat bars belong to. The SAME number `runFloorDesign`
          // passes to `buildFloorAssembly` as `previousRevision`, so a bar and the assembly
          // holding it cannot end up one revision apart — both add 1 through
          // `nextDetailingRevision`.
          previousDetailingRevision: maxPersistedRevision(),
        });
        lastFootingRun = footingRun;
        // What this run was made FROM, so the panel can tell a current result from a
        // superseded one. See `footingRunStale`.
        lastFootingRunFingerprint = footingRunFingerprint();
        const result = runFloorDesign({
          nodes: modelStore.model.nodes as never,
          shells: scopedShells(wants),
          stresses: collectStresses(),
          factoredAreaLoad: factoredAreaLoads(),
          fc: props.fc,
          fy: props.fy,
          cover: props.cover,
          maxAggregateSizeMm: resolveAggregate(),
          wallBarDiameterMm: DEFAULT_WALL_BAR_DIA_MM,
          edition: currentConcreteEdition(),
          // Explicit argument wins so the golden chain can pin an identity; otherwise the
          // verification that actually ran supplies it. Never a bare '' default.
          verifierId: opts.verifierId ?? resolveVerifierId(),
          demandRevision: verificationStore.demandRevision,
          previousRevision: maxPersistedRevision(),
          seismicRequired: regulationsStore.binding('seismic').adapterId !== null,
          footingsByLevel: footingRun.entriesByLevel,
          // Footings that could not be checked reach their level's assembly too, so the
          // reason appears in the document rather than only in the panel.
          unverifiedFootingsByLevel: footingRun.unverifiedByLevel,
          // The same vector the footings were stamped with, so one run produces one
          // consistent revision across all three families.
          revisions: {
            analysis: regulationsStore.revisions.analysis,
            loads: regulationsStore.revisions.combination,
            regulation: regulationsStore.revisions.regulationConfig,
          },
          regulationIds: [CONCRETE_REGULATION_ID],
          // The slab–column joints and the per-combination forces at them, so punching applies
          // to those joints and to no others AND is actually checked at them. Absent it, every
          // beam-supported floor would carry a punching claim it has no joint for.
          slabColumns: collectSlabColumns(),
          // Measured, not assumed: whether the result sets on hand and the model's own
          // combinations still agree.
          analysisStale: analysisStaleForFloor(),
          // Shell design does not go through the frame verifier, so its members have not
          // been rechecked at a final effective depth. Claiming otherwise would satisfy
          // two constructibility conditions that nothing measured.
          membersVerified: false,
        });
        lastFloorRun = result;
        // Floor assemblies are ADDED to the beam/column ones rather than replacing them:
        // a floor has both, and a user who details beams and then slabs must not lose the
        // beams. Re-running replaces only the floor assemblies it owns.
        //
        // Read from the PERSISTED store, not from the `store` derived. A `$derived` does
        // not recompute inside the synchronous call that wrote it, so merging against it
        // would drop whatever the previous write in the same tick had added — and here the
        // thing dropped would be the user's beam assemblies.
        const current = modelStore.model.detailing ?? emptyDetailingStore();
        const kept = current.assemblies.filter((a) => !a.id.startsWith('FLOOR-'));
        const merged = [...kept, ...result.assemblies];
        publishAssemblies({ ...current, assemblies: merged });
        if (!merged.some((a) => a.id === selectedId)) {
          selectedId = merged[0]?.id ?? null;
        }
        // Downstream of reinforcement, like beam detailing: loads, analysis and design are
        // preserved, detailing and the document are invalidated, no solve is required.
        regulationsStore.noteChange('reinforcementEdit');
        // Same reason as the beam pass: a floor design is minutes of work behind one button.
        void requestAutosave('floorDesign');
        return result;
      } catch (e) {
        lastError = String(e instanceof Error ? e.message : e);
        return null;
      } finally {
        generating = false;
      }
    },

    /** The last floor run, for the panel that reports what it could not design. */
    get lastFloorRun(): RunFloorDesignResult | null { return lastFloorRun; },

    /**
     * The last footing run, for the panel that reports what could not be checked and why.
     *
     * Separate from `lastFloorRun` because the two answer different questions: a shell is
     * unsupported for reasons about its geometry and its stresses, a footing for reasons
     * about its soil, its reaction and its column.
     */
    get lastFootingRun(): RunFootingDesignResult | null { return lastFootingRun; },

    /**
     * The coarse-aggregate size the spacing rules were resolved against.
     *
     * Exposed because an export has to state the same number the rules used AND whether it was
     * stated by a material or assumed. Recomputing it at the export site would be a second copy
     * of the resolution rule, free to drift from this one.
     */
    get aggregate(): { maxAggregateSizeMm: number; assumed: boolean } {
      const stated = statedAggregate();
      return { maxAggregateSizeMm: stated ?? DAGG_ASSUMED_MM, assumed: stated === null };
    },

    /**
     * True when `lastFootingRun` describes a footing design the project no longer specifies.
     *
     * The Foundations panel must not present a superseded mat as current — see
     * `footingRunFingerprint`. `false` with no run at all, because "there is nothing" and
     * "there is something out of date" are different statements and the panel says each
     * differently.
     */
    get footingRunStale(): boolean {
      if (lastFootingRun === null || lastFootingRunFingerprint === null) return false;
      return lastFootingRunFingerprint !== footingRunFingerprint();
    },

    /** Footings that could not be checked, with the reason — the gate, as data for the UI. */
    get footingsNotVerified(): Array<{ name: string; reasons: EngineMessage[] }> {
      return (lastFootingRun?.outcomes ?? [])
        .filter((o) => o.check === null)
        .map((o) => ({ name: o.name, reasons: o.unsupported }));
    },

    /** Replace the whole set — used after a regeneration run. */
    setAssemblies(next: DetailingAssembly[]): void {
      publishAssemblies({ ...store, assemblies: next });
      if (!next.some((a) => a.id === selectedId)) selectedId = next[0]?.id ?? null;
    },

    /**
     * A reinforcement edit, made retroactive — objective 10. See `rcEditConsequence` for the
     * rule and for the half of it that was missing.
     *
     * It replaces `invalidate(changedElements)`, which had no production caller — that absence
     * WAS the defect — and which retired the current document before deciding whether anything
     * had changed. Two ways to invalidate, one of them wrong, is one too many.
     *
     * NOT during a run: `publishRepairedReinforcement` writes through the same transaction, and
     * the repair loop would invalidate the assemblies the run is about to replace wholesale.
     * A generation produces the assemblies; it does not contradict them.
     */
    applyEdit(written: Iterable<number>): RcEditConsequence {
      const ids = [...written];
      if (ids.length === 0 || generating) return rcEditConsequence([], []);
      /*
       * The PERSISTED store, not the `store` derived — `buildDocument`'s documented trap, and
       * it bites harder here: this runs inside a reinforcement transaction, one gesture and one
       * tick, so a derived that has not recomputed sees the assemblies from before and
       * invalidates nothing. Silently, which is the defect this method exists to close.
       */
      const current = modelStore.model.detailing ?? emptyDetailingStore();
      // Nothing to invalidate is a real outcome — a member on no assembly — and must not cost
      // the user the document they built, for the reason `review()` documents.
      const affected = invalidateAffected(current, ids);
      if (affected.invalidated.length === 0) {
        lastEdit = rcEditConsequence(ids, []);
        return lastEdit;
      }
      retireDocument();
      write(affected.store);
      lastEdit = rcEditConsequence(ids, affected.invalidated);
      void requestAutosave('detailing');
      return lastEdit;
    },

    /** What the last edit invalidated. Null once a regeneration has answered it. */
    get lastEdit(): RcEditConsequence | null { return lastEdit; },

    /**
     * Pin or unpin a bar; a pinned bar is a hard constraint on regeneration.
     *
     * Retired only once something is GOING to change: `retireDocument()` used to run before the
     * guard, so a toggle naming nothing cost the user the document they had built and did
     * nothing — the defect `review()` documents below, still here.
     *
     * And PERSISTED, not merely written. `write` puts the assemblies on the model; only
     * `requestAutosave` reaches disk, which is why every expensive operation asks for one. A
     * pin is a decision an engineer makes and then closes the tab on, and it was the single
     * detailing mutation that never asked.
     */
    toggleLock(barId: string): void {
      if (!selected) return;
      if (!selected.bars.some((b) => b.id === barId)) return;
      retireDocument();
      replace({
        ...selected,
        bars: selected.bars.map((b) => (b.id === barId ? { ...b, locked: !b.locked } : b)),
      });
      void requestAutosave('detailing');
    },

    /**
     * Record an engineer's review. Refuses for the reasons the engine states — below
     * CONSTRUCTIBLE, no named engineer, or unacknowledged provisional work.
     */
    review(record: Omit<ReviewRecord, 'revision'>): boolean {
      if (!selected) return false;
      const r = applyReview(selected, record, provisionalKeys(selected));
      if (!r.ok || !r.assembly) {
        // The store is the locale boundary, so the engine's refusal is translated HERE. It used
        // to arrive as a Spanish sentence built inside a pure module, which told an
        // English-locale user why their review was refused in the wrong language.
        lastError = r.reason
          ? tp(r.reason.key, (r.reason.params ?? {}) as Record<string, string | number>)
          : t('detailing.review.notRecorded');
        return false;
      }
      /*
       * Retired only once the review is GOING to be recorded.
       *
       * A review changes the readiness a document may claim, so the previous one is no longer
       * current even though the geometry is unchanged — that part was always right. What was
       * wrong was doing it first: `retireDocument()` ran before `applyReview` decided, so a
       * refused review superseded the document the user had just built and returned `false`.
       * Measured in the documents stage: readiness gone, `supersededDocuments` grown by one, and
       * an error where a document had been. A click that accomplished nothing cost them the
       * export.
       */
      retireDocument();
      replace(r.assembly);
      lastError = null;
      reviewOpen = false;
      return true;
    },

    get schedule() {
      if (!selected) return null;
      return buildSchedule(selected.marks, 12,
        selected.unsupported.map((u) => `${u.key}: ${u.message}`));
    },

    /** The schedule's own title block. Carries the same rótulo as the sheets. */
    get titleBlock() {
      if (!selected) return null;
      return buildTitleBlock({
        sheetNumber: `${selected.id}-P`, title: `${selected.label} — planilla`,
        assembly: selected,
        clauses: [clause('cirsoc-201', selected.provenance.edition, '25.2')],
        rotulo: rotuloFor(store.titleBlock ?? {}),
      });
    },

    /**
     * Build the DocumentModel from the CURRENT coordinated state.
     *
     * The single production caller. Everything the three exports print comes from the
     * object this returns, so a report, a drawing set and a schedule of the same floor
     * cannot disagree about the revision, the conflicts or the steel.
     *
     * Returns null when there is no coordinated detailing. That is not an error and must
     * not be papered over with the legacy per-member reinforcement: the pre-coordination
     * arrangement is a different thing from a coordinated cage, and showing one while
     * labelling it the other is the failure this whole workflow exists to prevent.
     */
    buildDocument(opts: { author: string; at: string }): DocumentModel | null {
      /**
       * Read from the PERSISTED store, not from the `store` derived.
       *
       * Same trap `generateFloors` documents, and it bites harder here. A `$derived` does not
       * necessarily recompute inside the synchronous turn that wrote its dependency, so
       * "design the floor, then export it" — which is one user gesture and one tick — could
       * see an empty assembly list and return null. The command appeared to do nothing.
       *
       * The model is also the stronger source on principle: a document must describe what is
       * PERSISTED, because that is what a reopened project will contain. A view that is one
       * tick behind is not the thing being issued.
       */
      const persisted = modelStore.model.detailing ?? emptyDetailingStore();
      if (persisted.assemblies.length === 0) return null;
      const laps = lastRun?.lapping.laps ?? [];
      const certificates = collectCertificates(persisted.assemblies);
      const doc = buildDocumentModel({
        seriesId: 'detailing',
        revision: {
          number: documentRevision,
          at: opts.at,
          author: opts.author,
          // Already the persisted source — `persisted` IS `modelStore.model.detailing` — so
          // this is the same read the helper now performs, by name rather than by argument.
          detailingRevision: maxPersistedRevision(),
          demandRevision: verificationStore.demandRevision,
        },
        regulations: [{ id: CONCRETE_REGULATION_ID, edition: currentConcreteEdition() }],
        assemblies: persisted.assemblies,
        laps,
        certificates,
        // The vector as it stands NOW, so a family certificate stamped at an earlier analysis
        // is reported as STALE rather than compared against its own vector and found equal.
        // Omitting this would produce a document that structurally cannot detect staleness.
        currentRevisions: {
          analysis: regulationsStore.revisions.analysis,
          loads: regulationsStore.revisions.combination,
          regulation: regulationsStore.revisions.regulationConfig,
          // The per-entity revision is per RECORD, so there is no single project-wide value
          // to compare against. Each record's own entity revision is used, which makes this
          // field a no-op for the comparison and keeps a footing edit detectable through the
          // geometry and input hashes instead.
          entity: -1,
        },
      });
      currentDocument = doc;
      return doc;
    },

    /** The document built by the last `buildDocument`, if any. */
    get document(): DocumentModel | null { return currentDocument; },

    /** Documents kept for the record after a later revision replaced them. */
    get supersededDocuments(): DocumentModel[] { return supersededDocs; },

    /**
     * Retire the current document.
     *
     * Called whenever anything the document depends on changes — loads, analysis,
     * reinforcement, detailing geometry, the spacing margin, review, or regulation
     * settings. Non-destructive: the old revision keeps its number and content and moves
     * to the superseded list, because a project that cannot show what it previously issued
     * cannot answer the only question that matters after something goes wrong.
     */
    supersedeDocuments(): void { retireDocument(); },

    clear(): void {
      write(emptyDetailingStore());
      selectedId = null;
      lastEdit = null;
      conflictIndex = 0;
      lastError = null;
      // The footing run and its fingerprint go together. Clearing one and keeping the other
      // would leave a run that compares as fresh against a project it was never made from.
      lastFootingRun = null;
      lastFootingRunFingerprint = null;
    },
  };
}

export const detailingStore = createDetailingStore();
