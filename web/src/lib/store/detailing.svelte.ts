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
import {
  applyReview, emptyDetailingStore, invalidateAffected, isDemandStale, isReviewStale,
  type DetailingAssembly, type DetailingStore, type ReviewRecord,
} from '../engine/detailing/assembly';
import { provisionalKeys } from '../engine/detailing/coordinate-floor';
import type { BarConflict } from '../engine/detailing/collision';
import {
  ELEVATION_X, buildSchedule, buildTitleBlock, drawElevation, drawSection, sheetToSvg,
  type Sheet,
} from '../engine/detailing/drawings';
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
import {
  buildDocumentModel, supersede,
  type CertificateEntry, type DocumentModel,
} from '../engine/detailing/document-model';
import { regulationsStore } from './regulations.svelte';
import { resultsStore } from './results.svelte';
import {
  floorDesignReadiness, runFloorDesign,
  type FloorDesignReadiness, type FloorShell, type FloorShellStress,
  type RunFloorDesignResult,
} from '../engine/detailing/run-floor-design';
import type { SlabColumnJoint, SlabJointForce } from '../engine/detailing/slab-punching';
import type { ElementForces3D } from '../engine/types-3d';
// The app's own member classifier, shared with `member-context.ts`. Punching applicability
// must not depend on the design run having populated `verificationStore.contexts`.
import { classifyElement } from '../engine/codes/argentina/cirsoc201';
import { computeLocalAxes3D } from '../engine/local-axes-3d';
import { DEFAULT_COVER, DEFAULT_REBAR_FY } from '../engine/design/member-context';
import {
  runFootingDesign,
  type CaseReaction, type CombinationReaction, type FootingColumn,
  type NodeReactions, type RunFootingDesignResult,
} from '../engine/detailing/run-footing-design';
import type { ProvidedReinforcement } from './model.svelte';
import type { EngineMessage } from '../codes/message';
// A store is a locale boundary — `model.svelte.ts` translates here too. The combination
// name is a plain string because a user-given combination name is not translatable; only
// the synthetic "active result set" stand-in needs a locale.
import { t, tp } from '../i18n';
import type { RegulationEdition } from '../codes/regulation';
import type { MemberDesignOutcome } from '../engine/design/outcome';
import type { BentUpPolicy } from '../engine/detailing/generate-beam';
import { DAGG_ASSUMED_MM } from '../codes/project-code-settings';

export type SheetSelection = 'elevation' | 'section';

/** Design outcomes as a map, which is what the pipeline consumes. */
function designOutcomeMap(): ReadonlyMap<number, MemberDesignOutcome> {
  const out = new Map<number, MemberDesignOutcome>();
  for (const id of verificationStore.contexts.keys()) {
    const o = verificationStore.outcomeFor(id);
    if (o) out.set(id, o);
  }
  return out;
}

/** The concrete edition currently bound to the `concrete` role. */
function currentConcreteEdition(): RegulationEdition {
  const e = regulationsStore.binding('concrete').edition;
  return (e === '2005' ? '2005' : '2025') as RegulationEdition;
}

/**
 * THE authoritative verifier identity, derived from the verification that actually ran.
 *
 * Both production detailing commands used to default this to `''` and only the test chain
 * passed one, so every real user's certificate named no verifier at all. The fix belongs
 * here rather than in each caller: a certificate's provenance is a property of the run, not
 * an argument a panel happens to remember to supply, and two UI call sites able to disagree
 * is the same three-sources-for-one-decision shape `adapter()` was already repaired for.
 *
 * It is READ from the issued certificates, never composed from the binding alone. That
 * distinction is the whole point — the binding says which code is selected, the certificates
 * say which verifier was executed, and only the second is true of the work:
 *
 *   * no completed design run → no identity, and the export refuses;
 *   * a run that issued no certificate → no identity (nothing was actually verified);
 *   * a certificate naming a verifier other than the one bound NOW → no identity, because
 *     rebinding the regulation after the run makes the earlier identity a stale claim.
 *
 * Returning `''` is therefore never a silent default. It is the honest "no verifier ran",
 * and `buildFootingCadHandoff` turns it into a stated refusal rather than an empty field.
 */
function resolveVerifierId(): string {
  const summary = verificationStore.runSummary;
  if (!summary) return '';

  const boundId = regulationsStore.concreteDesignCode();
  const expected = boundId ? getDesignCode(boundId)?.provenance().verifierId : undefined;
  if (!expected) return '';

  let issued = 0;
  for (const outcome of summary.outcomes.values()) {
    const id = outcome.certificate?.verifierId;
    if (!id) continue;
    // One disagreeing certificate is enough to withhold the identity: the assembly would
    // otherwise carry a verifier that part of the design was not checked against.
    if (id !== expected) return '';
    issued++;
  }
  return issued > 0 ? expected : '';
}

/**
 * Maximum aggregate size as the MATERIALS state it, or null when none of them does.
 *
 * PR16 moved this off the regulation panel and onto the material, where a mix property
 * belongs. The largest value across the concretes in use governs the bar spacing, which is
 * the conservative reading when a model mixes mixes.
 *
 * Split from `resolveAggregate` so "stated" and "assumed" stay distinguishable. Both callers
 * need the same number, but an export must additionally say WHICH it is: the assumed 20 mm is
 * not a regulatory default, and a document that presented it as one would be claiming a
 * provenance it does not have.
 */
function statedAggregate(): number | null {
  let max = 0;
  for (const m of modelStore.model.materials.values()) {
    const d = (m as { maxAggregateSizeMm?: number | null }).maxAggregateSizeMm;
    if (typeof d === 'number' && d > max) max = d;
  }
  return max > 0 ? max : null;
}

function resolveAggregate(): number {
  return statedAggregate() ?? DAGG_ASSUMED_MM;
}

/**
 * The project's additional bar-spacing margin, m.
 *
 * The LARGEST stated margin across the concretes in use governs, which is the conservative
 * reading when a model mixes mixes — the same rule the aggregate size follows. Zero when no
 * concrete states one, and zero introduces no allowance anywhere: it is not a small
 * default, it is the absence of one.
 */
function resolveSpacingMargin(): number {
  let max = 0;
  for (const m of modelStore.model.materials.values()) {
    const v = (m as { spacingMarginMm?: number | null }).spacingMarginMm;
    if (typeof v === 'number' && v > max) max = v;
  }
  return max / 1000;
}

/**
 * Distributed wall bar diameter, mm.
 *
 * §11.6.1's relaxed ratios are available only to Ø16 and smaller, and Ø12 is what a
 * distributed curtain is normally drawn with. It is a starting size the design then checks,
 * not a result: `designWall` reports the ratios and spacings that follow from it.
 */
const DEFAULT_WALL_BAR_DIA_MM = 12;

// The footing bottom-mat diameter used to live here, as
// `const DEFAULT_FOOTING_BAR_DIA_MM = 16`. It set the effective depth of every footing check
// in the project and no user could see it or change it, which made a private module constant
// indistinguishable — from outside — from a designed result. It is now a persisted project
// preference on the model (`footingMatPreferences`), visible and editable in the Foundations
// panel, and the design states which of the two directions each diameter belongs to. See
// `model/footing.ts`.

/**
 * The concrete regulation this project's RC work is resolved against.
 *
 * One constant, consumed by the family records AND by the DocumentModel's regulation list,
 * so a record and the document built from it cannot name different regulations. The EDITION
 * still comes from Project Regulations via `currentConcreteEdition()` — that is the
 * selector, and this is only the instrument's identity.
 */
const CONCRETE_REGULATION_ID = 'cirsoc-201';

/** Every shell in the model — quads and plates alike are shells and both are designed. */
function collectShells(): FloorShell[] {
  const out: FloorShell[] = [];
  for (const q of modelStore.model.quads.values()) {
    out.push({ id: q.id, nodes: q.nodes, materialId: q.materialId, thickness: q.thickness });
  }
  for (const p of modelStore.model.plates.values()) {
    out.push({ id: p.id, nodes: p.nodes, materialId: p.materialId, thickness: p.thickness });
  }
  // Sorted so the run is deterministic regardless of Map insertion order.
  return out.sort((a, b) => a.id - b.id);
}

/** Shell stresses from the active result set, quads and plates in one list. */
function collectStresses(): FloorShellStress[] {
  const r = resultsStore.results3D;
  if (!r) return [];
  return [...(r.quadStresses ?? []), ...(r.plateStresses ?? [])]
    .map((s) => ({
      elementId: s.elementId,
      sigmaXx: s.sigmaXx, sigmaYy: s.sigmaYy, tauXy: s.tauXy,
      mx: s.mx, my: s.my, mxy: s.mxy,
    }))
    .sort((a, b) => a.elementId - b.elementId);
}

/**
 * Support reactions per footing node — per combination, and per case for the service sum.
 *
 * A footing's demand is a REACTION, not a shell stress, so this is a different collector
 * from `collectStresses` with a different result source: `perCombo3D` for the strength
 * combinations and `perCase3D` for the unit-factor service sum.
 *
 * Only nodes that actually carry a footing are collected. Building the map for every
 * support would walk every combination's whole reaction list for nodes nobody asked about.
 */
function collectFootingReactions(): Map<number, NodeReactions> {
  const out = new Map<number, NodeReactions>();
  const wanted = new Set([...modelStore.model.footings.values()].map((f) => f.nodeId));
  if (wanted.size === 0) return out;

  const caseTypeOf = new Map(modelStore.model.loadCases.map((c) => [c.id, c.type ?? 'D']));
  const comboNameOf = new Map(modelStore.model.combinations.map((c) => [c.id, c.name]));

  const factored = new Map<number, CombinationReaction[]>();
  for (const [comboId, res] of resultsStore.perCombo3D) {
    for (const r of res.reactions ?? []) {
      if (!wanted.has(r.nodeId)) continue;
      const list = factored.get(r.nodeId) ?? [];
      list.push({
        combinationId: comboId,
        combinationName: comboNameOf.get(comboId) ?? `Combinación ${comboId}`,
        fz: r.fz, mx: r.mx, my: r.my,
      });
      factored.set(r.nodeId, list);
    }
  }

  const cases = new Map<number, CaseReaction[]>();
  for (const [caseId, res] of resultsStore.perCase3D) {
    for (const r of res.reactions ?? []) {
      if (!wanted.has(r.nodeId)) continue;
      const list = cases.get(r.nodeId) ?? [];
      list.push({
        caseId,
        caseType: caseTypeOf.get(caseId) ?? 'D',
        fz: r.fz, mx: r.mx, my: r.my,
      });
      cases.set(r.nodeId, list);
    }
  }

  // With no combinations solved, the single active result set is the only reaction there is.
  // It is offered as ONE combination named for what it is, rather than silently treated as a
  // factored envelope it may not be.
  if (factored.size === 0) {
    for (const r of resultsStore.results3D?.reactions ?? []) {
      if (!wanted.has(r.nodeId)) continue;
      factored.set(r.nodeId, [{
        combinationId: 0,
        combinationName: t('detailing.footingRun.activeResultSet'),
        fz: r.fz, mx: r.mx, my: r.my,
      }]);
    }
  }

  for (const nodeId of wanted) {
    const f = factored.get(nodeId);
    if (!f || f.length === 0) continue;
    // Sorted so the governing pick and the reported name cannot depend on Map order.
    const sorted = [...f].sort((a, b) => a.combinationId - b.combinationId);
    const c = cases.get(nodeId);
    out.set(nodeId, {
      factored: sorted,
      ...(c && c.length > 0
        ? { cases: [...c].sort((a, b) => a.caseId - b.caseId) }
        : {}),
    });
  }
  return out;
}

/**
 * The starter set a column's accepted reinforcement calls for.
 *
 * A column may be stored in either of two shapes: the structured `column` form (corner and
 * face bars per edge) or the legacy grouped `longitudinal`. Both are read, because a project
 * verified before the structured form existed still has columns to found.
 *
 * A single representative diameter is returned with the total count, because `DowelInput`
 * takes one `{ count, diameterMm }` pair. When corner and face diameters differ the LARGER
 * is used: it sets the longer development length, and a starter shorter than the bar it laps
 * with is the failure that matters.
 */
function columnBarSet(
  accepted: ProvidedReinforcement | undefined,
): { count: number; diameterMm: number } | undefined {
  const c = accepted?.column;
  if (c) {
    const count = 4 + c.nBottom + c.nTop + c.nLeft + c.nRight;
    const diameterMm = Math.max(c.cornerDia, c.faceDia);
    return count > 0 && diameterMm > 0 ? { count, diameterMm } : undefined;
  }
  const l = accepted?.longitudinal;
  if (l && l.count > 0 && l.diameter > 0) {
    return { count: l.count, diameterMm: l.diameter };
  }
  return undefined;
}

/**
 * Column geometry for each footing that names one.
 *
 * The section's `b`/`h` give the punching perimeter; the reinforcement the verifier already
 * chose for that column gives the dowels, so the starters match the bars they lap with
 * rather than a nominal set invented here.
 */
function collectFootingColumns(): Map<number, FootingColumn> {
  const out = new Map<number, FootingColumn>();
  for (const f of modelStore.model.footings.values()) {
    if (f.columnElementId === undefined || out.has(f.columnElementId)) continue;
    const el = modelStore.model.elements.get(f.columnElementId);
    if (!el) continue;
    const sec = modelStore.model.sections.get(el.sectionId);
    if (!sec?.b || !sec?.h) continue;
    // The starters must lap with the bars the verifier ACCEPTED for that column, so they are
    // read from the design outcome rather than invented here. `accepted` is present only for
    // a VERIFIED outcome, which is the right gate: starters lapping into steel that was
    // never accepted would be detailing a column that does not exist yet.
    const accepted = verificationStore.outcomeFor(f.columnElementId)?.accepted;
    const bars = columnBarSet(accepted);
    const tie = accepted?.stirrups?.diameter;
    out.set(f.columnElementId, {
      elementId: f.columnElementId,
      b: sec.b, h: sec.h,
      ...(bars ? { bars } : {}),
      ...(tie ? { tieDiaMm: tie } : {}),
    });
  }
  return out;
}

/**
 * Every slab–column joint in the model, with the per-combination forces at it.
 *
 * ── What used to be missing ─────────────────────────────────────
 *
 * This collector used to stop at APPLICABILITY: whether a column stands at a slab node, which
 * decides whether punching applies, and nothing more. So every column-supported panel reported
 * its governing check as unverified for want of forces the solver had already produced. This is
 * the rest of it.
 *
 * ── Which end of which column ───────────────────────────────────
 *
 * A column below the joint meets it at its TOP node; a column above meets it at its BOTTOM
 * node. Which node is `nodeI` and which is `nodeJ` is a modelling accident, so the two are told
 * apart by ELEVATION — the column's higher-z node — and the axial force is read from the end
 * that is actually at the joint. Reading the far end instead would report the force at the
 * other floor, and with self-weight in the model those differ by the column's own weight.
 *
 * Compression is positive here and `ElementForces3D` reports axial with tension positive, so
 * every reading is negated once, at the point it is read.
 *
 * ── The third force ─────────────────────────────────────────────
 *
 * Beams framing into the joint deliver load to the column WITHOUT crossing the slab's critical
 * perimeter, and so does any load applied at the joint node. Both are collected, because the
 * punching demand is the part of the axial step that does cross the perimeter, and calling the
 * whole step "punching" would fail an ordinary beam-and-slab floor on a mechanism that is not
 * carrying it. `slab-punching.ts` states the free body they enter.
 */
function collectSlabColumns(): Map<number, SlabColumnJoint> {
  const zOf = (nodeId: number) => modelStore.model.nodes.get(nodeId)?.z ?? 0;

  /** Columns at each node, tagged by whether the node is that column's top or bottom end. */
  type Leg = {
    elementId: number; b: number; h: number;
    /** True when the joint node is the column's TOP — so the column is BELOW the joint. */
    below: boolean;
    /** The end of the element that sits at the joint. */
    end: 'start' | 'end';
  };
  const legs = new Map<number, Leg[]>();
  /** Non-column frame members at each node, for the directly-delivered shear. */
  const others = new Map<number, Array<{ elementId: number; end: 'start' | 'end' }>>();

  for (const el of modelStore.model.elements.values()) {
    const ni = modelStore.model.nodes.get(el.nodeI);
    const nj = modelStore.model.nodes.get(el.nodeJ);
    if (!ni || !nj) continue;
    const sec0 = modelStore.model.sections.get(el.sectionId);
    /**
     * Classified by the app's OWN member classifier, not by `verificationStore.contexts`.
     *
     * `contexts` is populated by the design run, so reading the element type from it made
     * punching applicability depend on the user having pressed Compute Demands first — and a
     * user who designs a floor without it got an empty joint map and therefore no punching
     * claim at all. That is a false negative, which is worse than a stated limitation: the
     * panel looks like one that has no column rather than one whose columns were not found.
     *
     * `classifyElement` is the same pure function `member-context.ts` classifies with, so this
     * is one implementation read from two places rather than two implementations.
     */
    const kind = classifyElement(
      ni.x, ni.y, ni.z ?? 0, nj.x, nj.y, nj.z ?? 0,
      sec0?.b || undefined, sec0?.h || undefined);
    const zi = zOf(el.nodeI);
    const zj = zOf(el.nodeJ);
    if (kind === 'column') {
      // A column with no rectangular section is REGISTERED with zero plan dimensions, not
      // skipped. Skipping it would make the joint look like one that has no column, and the
      // engine's own missing-geometry refusal — which names the dimensions it did not get — is
      // the honest outcome instead.
      const topNode = zi > zj ? el.nodeI : el.nodeJ;
      for (const nodeId of [el.nodeI, el.nodeJ]) {
        const list = legs.get(nodeId) ?? [];
        list.push({
          elementId: el.id, b: sec0?.b ?? 0, h: sec0?.h ?? 0,
          below: nodeId === topNode,
          end: nodeId === el.nodeI ? 'start' : 'end',
        });
        legs.set(nodeId, list);
      }
      continue;
    }
    for (const nodeId of [el.nodeI, el.nodeJ]) {
      const list = others.get(nodeId) ?? [];
      list.push({ elementId: el.id, end: nodeId === el.nodeI ? 'start' : 'end' });
      others.set(nodeId, list);
    }
  }
  if (legs.size === 0) return new Map();

  const comboNameOf = new Map(modelStore.model.combinations.map((c) => [c.id, c.name]));

  /**
   * The combination result sets to read, as (id, name, results) triples.
   *
   * With no combinations solved the single active result set is offered as ONE combination
   * named for what it is — the same treatment `collectFootingReactions` gives a reaction, and
   * for the same reason: silently calling it a factored envelope would be a claim about
   * factors nobody applied.
   */
  const sets: Array<{ id: number; name: string; forces: ReadonlyMap<number, ElementForces3D> }> =
    [];
  const indexForces = (list: readonly ElementForces3D[]) =>
    new Map(list.map((f) => [f.elementId, f]));
  if (resultsStore.perCombo3D.size > 0) {
    for (const [comboId, res] of resultsStore.perCombo3D) {
      sets.push({
        id: comboId,
        name: comboNameOf.get(comboId) ?? `Combinación ${comboId}`,
        forces: indexForces(res.elementForces ?? []),
      });
    }
  } else if (resultsStore.results3D) {
    sets.push({
      id: 0,
      name: t('detailing.footingRun.activeResultSet'),
      forces: indexForces(resultsStore.results3D.elementForces ?? []),
    });
  }
  sets.sort((a, b) => a.id - b.id);

  /** Axial force at the joint end of a column leg, COMPRESSION POSITIVE, kN. */
  const axialAt = (leg: Leg, forces: ReadonlyMap<number, ElementForces3D>): number | null => {
    const f = forces.get(leg.elementId);
    if (!f) return null;
    const n = leg.end === 'start' ? f.nStart : f.nEnd;
    return typeof n === 'number' && Number.isFinite(n) ? -n : null;
  };

  /**
   * Vertical load delivered into the joint by everything that is not one of the two columns
   * and not the slab, kN, downward positive.
   *
   * A beam's end shears are in LOCAL axes and a beam can be rolled, so the global-Z component
   * is taken from the element's own local axes rather than from `vy` alone. Where the local
   * frame cannot be resolved the member is skipped and the omission is conservative in the
   * direction that matters: less is deducted, so V_u is larger.
   */
  const directlyDelivered = (
    nodeId: number, forces: ReadonlyMap<number, ElementForces3D>, setId: number,
  ): number => {
    let sum = 0;
    for (const o of others.get(nodeId) ?? []) {
      const f = forces.get(o.elementId);
      const el = modelStore.model.elements.get(o.elementId);
      if (!f || !el) continue;
      const ni = modelStore.model.nodes.get(el.nodeI);
      const nj = modelStore.model.nodes.get(el.nodeJ);
      if (!ni || !nj) continue;
      // Local x along the member; the global-Z components of the three local axes are what
      // project a local end force onto the vertical.
      const dx = nj.x - ni.x;
      const dy = nj.y - ni.y;
      const dz = (nj.z ?? 0) - (ni.z ?? 0);
      const L = Math.hypot(dx, dy, dz);
      if (!(L > 0)) continue;
      const exz = dz / L;
      // Local y and z: the app's default frame puts local z in the vertical plane containing
      // the member, so its global-Z component is the horizontal run over the length. A member
      // that is exactly vertical is not a beam and cannot be one of `others` and a column at
      // once, so the degenerate case does not arise here.
      const horiz = Math.hypot(dx, dy);
      const ezz = horiz / L;
      const [n, vy, vz] = o.end === 'start'
        ? [f.nStart, f.vyStart, f.vzStart]
        : [f.nEnd, f.vyEnd, f.vzEnd];
      // Force the ELEMENT exerts on the NODE, in local axes. The solver's raw
      // f_local = K·u − Fef is the force the NODE exerts on the ELEMENT, reported
      // as (n_start, vy_start, vz_start) = (−f_i_n, +f_i_vy, +f_i_vz) at I and
      // (n_end, vy_end, vz_end) = (+f_j_n, −f_j_vy, −f_j_vz) at J. Inverting:
      // element→node is (n, −vy, −vz) at the I end and (−n, vy, vz) at the J end.
      // (The inverse mapping was previously used — the node-on-element vector —
      // which inverted every beam-end shear delivered into the joint.)
      const [ln, lvy, lvz] = o.end === 'start' ? [n, -vy, -vz] : [-n, vy, vz];
      // Local y is horizontal for the default frame, so it contributes nothing vertical.
      void lvy;
      const globalZ = ln * exz + lvz * ezz;
      // Downward positive: a member pushing the node down delivers load into the column.
      sum += -globalZ;
    }
    // A load applied at the joint node itself also arrives inside the perimeter. Downward is
    // negative global Z, so it is negated to become a downward-positive delivery. The delivery
    // must carry the COMBINATION's factors: the set's element forces are factored per case,
    // so an unfactored raw load would mix magnitudes from two different worlds. The single
    // active result set (setId 0) is unfactored by construction — the raw value IS right there.
    for (const load of modelStore.model.loads) {
      if (load.type !== 'nodal' && load.type !== 'nodal3d') continue;
      const d = load.data as { nodeId: number; fz?: number; caseId?: number };
      if (d.nodeId !== nodeId) continue;
      if (setId === 0) {
        sum += -(d.fz ?? 0);
        continue;
      }
      const combo = modelStore.model.combinations.find((c) => c.id === setId);
      const factor = combo?.factors.find((fc) => fc.caseId === (d.caseId ?? 1))?.factor ?? 0;
      sum += factor * -(d.fz ?? 0);
    }
    return sum;
  };

  /** Step in the column end moments across the joint, kN·m, about global x and y. */
  const momentStep = (
    legsHere: readonly Leg[], forces: ReadonlyMap<number, ElementForces3D>,
  ): { x: number; y: number } => {
    let mx = 0;
    let my = 0;
    for (const leg of legsHere) {
      const f = forces.get(leg.elementId);
      const el = modelStore.model.elements.get(leg.elementId);
      if (!f || !el) continue;
      const ni = modelStore.model.nodes.get(el.nodeI);
      const nj = modelStore.model.nodes.get(el.nodeJ);
      if (!ni || !nj) continue;
      // Moment the ELEMENT exerts on the JOINT: the I-end fields are NOT inverted
      // (m_start = f_i), the J-end fields ARE (m_end = −f_j), so element→joint is
      // −reported at I and +reported at J. The local components must then be
      // projected to global with the element's OWN frame — a column modelled
      // top→base has ey flipped relative to the same column modelled base→top,
      // so reading local my/mz without projecting gives the moment of a
      // different building depending on how each member was drawn.
      const axes = computeLocalAxes3D(
        { id: ni.id, x: ni.x, y: ni.y, z: ni.z ?? 0 },
        { id: nj.id, x: nj.x, y: nj.y, z: nj.z ?? 0 },
      );
      const [mmx, mmy, mmz] = leg.end === 'start'
        ? [-f.mxStart, -f.myStart, -f.mzStart]
        : [f.mxEnd, f.myEnd, f.mzEnd];
      // M = mmx·ex + mmy·ey + mmz·ez — keep the two horizontal (joint-transfer)
      // components. For a vertical column ex is vertical and drops out here.
      mx += mmx * axes.ex[0] + mmy * axes.ey[0] + mmz * axes.ez[0];
      my += mmx * axes.ex[1] + mmy * axes.ey[1] + mmz * axes.ez[1];
    }
    return { x: mx, y: my };
  };

  const out = new Map<number, SlabColumnJoint>();
  for (const [nodeId, legsHere] of legs) {
    // Deterministic under any element iteration order.
    const ordered = [...legsHere].sort((a, b) => a.elementId - b.elementId);
    const below = ordered.find((l) => l.below) ?? null;
    const above = ordered.find((l) => !l.below) ?? null;
    // The perimeter is the surface the slab punches against, which is the SUPPORTING column's
    // face. A joint with only a column above uses that one, because it is the only face there
    // is.
    const perimeterLeg = below ?? above;
    if (!perimeterLeg) continue;

    const forces: SlabJointForce[] = [];
    for (const set of sets) {
      const ab = below ? axialAt(below, set.forces) : null;
      const aa = above ? axialAt(above, set.forces) : null;
      // A combination with no force for either column carries no free body, so it is omitted
      // rather than entered as a pair of zeros that would read as a measured null step.
      if (ab === null && aa === null) continue;
      const m = momentStep(ordered, set.forces);
      forces.push({
        combinationId: set.id,
        combinationName: set.name,
        axialBelow: ab,
        axialAbove: aa,
        directlyDelivered: directlyDelivered(nodeId, set.forces, set.id),
        unbalancedMomentX: m.x,
        unbalancedMomentY: m.y,
      });
    }

    const node = modelStore.model.nodes.get(nodeId);
    out.set(nodeId, {
      nodeId,
      at: { x: node?.x ?? 0, y: node?.y ?? 0 },
      columnElementId: perimeterLeg.elementId,
      b: perimeterLeg.b,
      h: perimeterLeg.h,
      elementBelow: below?.elementId ?? null,
      elementAbove: above?.elementId ?? null,
      forces,
    });
  }
  return out;
}

/**
 * Do the solved results on hand describe the model's own combinations?
 *
 * A real measurement rather than a flag. Per-combination results are keyed by combination id,
 * so a combination the model defines with no result, or a result for a combination the model no
 * longer defines, means the two have diverged — and reading per-combination column forces from
 * that set would attribute one combination's forces to another. This is the condition under
 * which a punching check would be a check of a different building.
 *
 * With no per-combination results at all there is nothing to be stale: the single active result
 * set is offered as itself, and the collector says so.
 */
function analysisStaleForFloor(): boolean {
  const solved = resultsStore.perCombo3D;
  if (solved.size === 0) return false;
  const defined = new Set(modelStore.model.combinations.map((c) => c.id));
  if (defined.size === 0) return true;
  for (const id of defined) if (!solved.has(id)) return true;
  for (const id of solved.keys()) if (!defined.has(id)) return true;
  return false;
}

/**
 * Factored area load per shell, kPa, enveloped over the project's combinations.
 *
 * The `surface3d` loads carry a case id, and a combination states a factor per case, so
 * the factored load is `max over combinations of Σ factor·q` — a real envelope built from
 * the project's own combinations rather than a nominal figure.
 *
 * With no combinations defined the unfactored sum is used, and `designSlabPanel` receives
 * a demand that is honestly service-level. That is visible: the shear memo prints the `qu`
 * it was given.
 */
function factoredAreaLoads(): Map<number, number> {
  const byCase = new Map<number, Map<number, number>>();
  for (const load of modelStore.model.loads) {
    if (load.type !== 'surface3d') continue;
    const { quadId, q, caseId } = load.data;
    const key = caseId ?? 0;
    const per = byCase.get(quadId) ?? new Map<number, number>();
    per.set(key, (per.get(key) ?? 0) + q);
    byCase.set(quadId, per);
  }

  const combos = modelStore.model.combinations;
  const out = new Map<number, number>();
  for (const [quadId, per] of byCase) {
    if (combos.length === 0) {
      out.set(quadId, [...per.values()].reduce((s, v) => s + v, 0));
      continue;
    }
    let worst = 0;
    for (const combo of combos) {
      let total = 0;
      for (const { caseId, factor } of combo.factors) total += factor * (per.get(caseId) ?? 0);
      if (total > worst) worst = total;
    }
    out.set(quadId, worst);
  }
  return out;
}

/**
 * Concrete and steel properties for the shell families.
 *
 * Resolved exactly the way `member-context.ts` resolves them for frames, so the two paths
 * cannot disagree about the same project: f'c is the concrete `Material.fy` field — the
 * app's established convention for a concrete material — and the reinforcement fy and the
 * cover are the shared defaults. The MINIMUM f'c across the concretes in use governs,
 * which is the conservative reading when a model mixes mixes.
 */
function resolveConcreteProperties(): { fc: number; fy: number; cover: number } {
  let fc = Infinity;
  for (const m of modelStore.model.materials.values()) {
    const v = (m as { fy?: number }).fy;
    if (typeof v === 'number' && v > 0) fc = Math.min(fc, v);
  }
  return {
    fc: Number.isFinite(fc) ? fc : 0,
    fy: DEFAULT_REBAR_FY,
    cover: DEFAULT_COVER,
  };
}

/**
 * Members whose reinforcement the engineer pinned.
 *
 * Derived from the bars actually locked rather than kept as a second list: a locked bar's
 * `ownerElementIds` is what says whose steel it is, and any member owning one may not have
 * its reinforcement replaced by the repair loop.
 */
function lockedMemberIds(): ReadonlySet<number> {
  const out = new Set<number>();
  for (const a of modelStore.model.detailing?.assemblies ?? []) {
    for (const b of a.bars) {
      if (!b.locked) continue;
      for (const id of b.ownerElementIds ?? []) out.add(id);
    }
  }
  return out;
}

/**
 * Highest revision among the PERSISTED assemblies, so a regeneration increments.
 *
 * ── Why this reads the model and takes no argument ──────────────────
 *
 * It used to be called as `maxRevision(store.assemblies)`, and `store` is a `$derived`. A
 * `$derived` is lazy and memoised: it recomputes when a dependency changes AND it is read, so
 * whether it is current at the moment a command runs depends on what ELSE read it in the same
 * tick. That made the revision counter a function of unrelated parts of the UI — mounting one
 * more panel elsewhere in the tab was enough to make every regeneration report revision 1.
 *
 * This branch already found and fixed the identical class twice, a few lines away, and said so
 * in the source: the floor-assembly merge and `buildDocument` both read
 * `modelStore.model.detailing` directly because a `$derived` does not recompute inside the
 * synchronous call that wrote it. These two callers were left on the derived.
 *
 * The argument is REMOVED rather than left optional. A helper that can be handed either source
 * is a helper that will be handed the wrong one again; there is exactly one correct source for
 * "what revision is this project on", and it is the persisted model — which is also what a
 * reopened project carries.
 */
/**
 * What a footing run was made FROM, as one comparable string.
 *
 * ── The failure this exists to prevent ─────────────────────────
 *
 * `supersedeDocuments()` retires the DOCUMENT when a foundation input changes, and it leaves
 * `lastFootingRun` alone. That was harmless while the run held numbers: a superseded schedule
 * on screen next to a retired document is a visible inconsistency the user can read.
 *
 * It stops being harmless now that the run holds BARS. Change the layer-order preference and
 * the panel would go on drawing the previous mat — real bar positions, real elevations, real
 * marks — with nothing saying they belong to a design the project no longer specifies. Stale
 * geometry presented as current is the one failure the whole revision graph exists to prevent.
 *
 * So the run records its inputs and the panel compares. It does NOT re-run: regeneration stays
 * an explicit command, because a panel that silently redesigned a footing on every keystroke
 * would be making the engineer's decision for them.
 *
 * The mat preferences and every footing's own revision, and nothing else — those are exactly
 * the inputs `runFootingDesign` reads that a user can change without re-solving. A change to
 * the ANALYSIS moves the demand revision instead, and the certificate's own freshness catches
 * that on a different axis.
 */
function footingRunFingerprint(): string {
  const prefs = modelStore.footingMatPreferences();
  const footings = [...modelStore.model.footings.values()]
    .sort((a, b) => a.id - b.id)
    .map((f) => `${f.id}:${f.revision}`);
  return JSON.stringify({ prefs, footings });
}

function maxPersistedRevision(): number {
  let r = 0;
  for (const a of modelStore.model.detailing?.assemblies ?? []) {
    r = Math.max(r, a.detailingRevision ?? 0);
  }
  return r;
}

/**
 * The project's bent-up bar policy.
 *
 * `unstated` until the seismic role says otherwise, and no bent-up bar is generated under
 * `unstated`. PR19 supplies the seismic verdict; until then the conservative reading holds.
 */
function bentUpPolicy(): BentUpPolicy {
  const optOut = modelStore.model.detailingBentUpOptOut === true;
  const seismicBound = regulationsStore.bound('seismic');
  return {
    seismicDesign: seismicBound ? 'required' : 'unstated',
    optOut,
  };
}

function createDetailingStore() {
  let selectedId = $state<string | null>(null);
  let conflictIndex = $state(0);
  let sheetKind = $state<SheetSelection>('elevation');
  let sectionAt = $state(0);
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
    get sheetKind() { return sheetKind; },
    get sectionAt() { return sectionAt; },
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

    setSheetKind(k: SheetSelection): void { sheetKind = k; },
    setSectionAt(x: number): void { sectionAt = x; },

    nextConflict(): void {
      if (conflicts.length === 0) return;
      conflictIndex = (conflictIndex + 1) % conflicts.length;
    },
    prevConflict(): void {
      if (conflicts.length === 0) return;
      conflictIndex = (conflictIndex - 1 + conflicts.length) % conflicts.length;
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
        // Regeneration produces new geometry, so any document describing the old geometry
        // stops being current. This is the commonest supersession trigger by far and it
        // does not go through setAssemblies, which is why it is retired here explicitly.
        retireDocument();
        write({ ...store, assemblies: result.assemblies });
        if (!result.assemblies.some((a) => a.id === selectedId)) {
          selectedId = result.assemblies[0]?.id ?? null;
        }
        // Detailing is downstream of reinforcement. Nothing upstream moved, so the graph
        // preserves the loads, the analysis and the design, and invalidates only the
        // detailing and the document — no solve is required.
        regulationsStore.noteChange('reinforcementEdit');
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
    generateFloors(opts: { verifierId?: string } = {}): RunFloorDesignResult | null {
      generating = true;
      lastError = null;
      try {
        const props = resolveConcreteProperties();
        // Footings are checked FIRST, so their entries can join the level assemblies the
        // shell pass builds. Their demand is a support reaction and their level is their
        // founding elevation, so neither comes from the shell loop.
        const footingRun = runFootingDesign({
          footings: [...modelStore.model.footings.values()],
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
          shells: collectShells(),
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
        // New geometry retires the document describing the old geometry, exactly as a
        // beam regeneration does.
        retireDocument();
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
        write({ ...current, assemblies: merged });
        if (!merged.some((a) => a.id === selectedId)) {
          selectedId = merged[0]?.id ?? null;
        }
        // Downstream of reinforcement, like beam detailing: loads, analysis and design are
        // preserved, detailing and the document are invalidated, no solve is required.
        regulationsStore.noteChange('reinforcementEdit');
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
      // New geometry: whatever the old document drew is no longer what exists.
      retireDocument();
      write({ ...store, assemblies: next });
      if (!next.some((a) => a.id === selectedId)) selectedId = next[0]?.id ?? null;
    },

    /** Targeted invalidation after an element edit. */
    invalidate(changedElements: Iterable<number>): string[] {
      retireDocument();
      const r = invalidateAffected(store, changedElements);
      write(r.store);
      return r.invalidated;
    },

    /** Pin or unpin a bar; a pinned bar is a hard constraint on regeneration. */
    toggleLock(barId: string): void {
      retireDocument();
      if (!selected) return;
      replace({
        ...selected,
        bars: selected.bars.map((b) => (b.id === barId ? { ...b, locked: !b.locked } : b)),
      });
    },

    /**
     * Record an engineer's review. Refuses for the reasons the engine states — below
     * CONSTRUCTIBLE, no named engineer, or unacknowledged provisional work.
     */
    review(record: Omit<ReviewRecord, 'revision'>): boolean {
      if (!selected) return false;
      // A review changes the readiness a document may claim, so the previous one is no
      // longer current — even though the geometry is unchanged.
      retireDocument();
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
      replace(r.assembly);
      lastError = null;
      reviewOpen = false;
      return true;
    },

    /** The sheet for the current selection, or null when nothing is selected. */
    get sheet(): Sheet | null {
      if (!selected) return null;
      const clauses = [clause('cirsoc-201', selected.provenance.edition, '9.7.3'),
        clause('cirsoc-201', selected.provenance.edition, '25.2')];
      if (sheetKind === 'section') {
        return drawSection({
          assembly: selected, atX: sectionAt,
          outline: [
            { x: -0.15, y: -0.30 }, { x: 0.15, y: -0.30 },
            { x: 0.15, y: 0.30 }, { x: -0.15, y: 0.30 },
          ],
          projection: ELEVATION_X, clauses,
          sheetNumber: `${selected.id}-S`, title: `${selected.label} — sección`,
        });
      }
      return drawElevation({
        assembly: selected,
        outlines: [],
        projection: ELEVATION_X, clauses,
        sheetNumber: `${selected.id}-E`, title: `${selected.label} — elevación`,
      });
    },

    get sheetSvg(): string | null {
      const s = this.sheet;
      return s ? sheetToSvg(s) : null;
    },

    get schedule() {
      if (!selected) return null;
      return buildSchedule(selected.marks, 12,
        selected.unsupported.map((u) => `${u.key}: ${u.message}`));
    },

    get titleBlock() {
      if (!selected) return null;
      return buildTitleBlock({
        sheetNumber: `${selected.id}-P`, title: `${selected.label} — planilla`,
        assembly: selected,
        clauses: [clause('cirsoc-201', selected.provenance.edition, '25.2')],
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
      const certificates: CertificateEntry[] = [];
      for (const a of persisted.assemblies) {
        for (const id of a.elementIds) {
          const reinf = verificationStore.reinforcementFor(id);
          const result = verificationStore.providedFor(id);
          const current = reinf ? rebarHash(reinf) : '';
          const certified = verificationStore.certifiedHashFor(id);
          certificates.push({
            elementId: id,
            certifiedHash: certified,
            currentHash: current,
            // Empty on either side means the question was never answered, which is not a
            // match. Silence is not agreement.
            matches: certified !== '' && current !== '' && certified === current,
            verifierId: a.provenance.verifierId,
            status: result?.overallStatus === 'ok' ? 'ok'
              : result?.overallStatus === 'warn' ? 'warn'
                : result?.overallStatus === 'fail' ? 'fail' : 'notRun',
          });
        }
      }
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
