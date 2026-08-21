/**
 * MemberContext — the plain-data bundle a design-code adapter needs for ONE member.
 *
 * Assembled once per element by an app-side builder so that adapters, the candidate
 * search and the authoritative verifier never touch a store. That boundary is what
 * makes the code-adapter seam real rather than decorative.
 *
 * Also owns the memoised `criticalSections` map: `computeBeamCriticalSections`
 * scans every element twice per beam end, so calling it per row per keystroke was
 * O(N·E) (~333k element iterations on the 408-member example). It is now computed
 * once per analysis revision.
 *
 * Pure: no store access, no side effects.
 */

import { classifyElement } from '../codes/argentina/cirsoc201';
import {
  computeBeamCriticalSections,
  type BeamCriticalSections,
  type ElementDesignDemands,
  type ElementStationResult,
} from '../station-design-forces';
import { resolveDesignAxes, type DesignAxes } from './design-axes';
import type { LimitingConstraint } from './outcome';
import type { ProvenancedValue, RegulationEdition } from '../../codes/regulation';
import { resolveMaxAggregateSize, type ConcreteProjectData } from '../../codes/project-code-settings';
import {
  materialFamilyOf, type GradeFamilyLookup, type StructuralMaterialFamily,
} from '../steel/material-family';

export interface RectSection {
  id: number;
  name: string;
  b: number;
  h: number;
}

export interface CodeMaterials {
  /** Concrete compressive strength f'c (MPa). */
  fc: number;
  /** Reinforcement yield strength fy (MPa). */
  fy: number;
  /** Clear cover to the stirrup (m). */
  cover: number;
  /** Assumed stirrup diameter used for cover/depth arithmetic (mm). */
  stirrupDia: number;
  /**
   * Maximum nominal coarse-aggregate size (mm), already resolved from project data.
   *
   * Carries its own provenance because CIRSOC 201-2025 §25.2.1 puts it inside the
   * mandatory clear-spacing rule while no edition states a default: a design run where
   * this was assumed rather than stated is a materially different document, and the
   * certificate has to be able to say which one it is.
   */
  maxAggregateSize: ProvenancedValue<number>;
}

/** Model slices the builder reads. Structurally typed so tests can pass literals. */
export interface ContextModelData {
  nodes: Map<number, { id: number; x: number; y: number; z?: number }>;
  elements: Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number; type: string }>;
  sections: Map<number, { id: number; name: string; b?: number; h?: number }>;
  /**
   * `gradeId` is PR #132's declared grade, and it is what decides the material FAMILY.
   *
   * Declared here rather than left to the `as never` casts every call site uses. The field was
   * always present at runtime — callers pass the live `modelStore.materials`, so real
   * `Material` objects flow through — but the type said otherwise, which made it look as
   * though the declared-grade path could not work. It could; nothing was supplying the
   * lookup. Naming it makes the contract match what actually arrives.
   */
  materials: Map<number, { id: number; name: string; fy?: number; gradeId?: string }>;
  supports: Map<number, { nodeId: number; type: string }>;
}

export interface MemberContext {
  /**
   * The member's FINAL physical geometry, when coordination has moved its steel.
   *
   * Absent during design, present during post-coordination re-verification. It adjusts the
   * layer centroids — and therefore the effective depths — without touching the section,
   * the true cover, the transverse fit or the anchorage geometry, none of which change
   * because a bar moved within the section.
   */
  finalGeometry?: { bottomRaise?: number; topLower?: number; depthTolerance?: number };
  elementId: number;
  elementType: 'beam' | 'column' | 'wall';
  /**
   * The family of the member's material, as `materialFamilyOf` resolved it.
   *
   * A context is only ever BUILT for a concrete member — see `buildAllMemberContexts` — so
   * in practice this is always `'concrete'`. It is carried anyway, because a certificate
   * that cannot state what the member is made of is a certificate that assumed it.
   */
  materialFamily: StructuralMaterialFamily;
  /** Member length (m). */
  L: number;
  section: RectSection;
  material: CodeMaterials;
  demands: ElementDesignDemands | undefined;
  stations: ElementStationResult | undefined;
  criticalSections: BeamCriticalSections | undefined;
  axes: DesignAxes;
  /** Slenderness magnifier for columns (>= 1). */
  slenderDeltaNs: number;
  /** True when this member's force components look inconsistent with its
   *  geometry — certification is blocked (O6). */
  orientationSuspect: boolean;
  /**
   * Edition of CIRSOC 201 this member is being designed to. Every rule the adapter
   * applies and every clause it cites is resolved against this and nothing else.
   */
  codeEdition: RegulationEdition;
  analysisRevision: number;
  demandRevision: number;
  /** The verificationStore solve-generation counter at the moment this context was
   *  built (bumped on every `setResults3D`/`setCombinationResults3D` publish — see
   *  store/index.ts). A context whose stamped generation is older than the current
   *  one describes forces that have since been superseded by a fresh solve (e.g. a
   *  self-weight/axis-convention toggle) without contexts being rebuilt — the
   *  display must read 'stale', not the demand's own (now-outdated) status. */
  solveGeneration: number;
  /** Reasons the member cannot be designed at all, if any. */
  blocking: LimitingConstraint[];
  /** Model slices retained so the verifier can compute geometry-aware sections. */
  modelData: ContextModelData;
}

/** Default reinforcement assumptions when the model carries no explicit values. */
export const DEFAULT_COVER = 0.025;      // m
export const DEFAULT_STIRRUP_DIA = 8;    // mm
export const DEFAULT_REBAR_FY = 420;     // MPa
/** CIRSOC 201-2025 — the edition legally in force since 22-01-2026 (Res. 11/2026). */
export const DEFAULT_CODE_EDITION: RegulationEdition = '2025';

/** Build the memoised critical-section map for all beams in one pass. */
export function buildCriticalSectionMap(
  model: ContextModelData,
  cover = DEFAULT_COVER,
  stirrupDia = DEFAULT_STIRRUP_DIA,
): Map<number, BeamCriticalSections> {
  const out = new Map<number, BeamCriticalSections>();
  for (const [id, elem] of model.elements) {
    const nI = model.nodes.get(elem.nodeI);
    const nJ = model.nodes.get(elem.nodeJ);
    if (!nI || !nJ) continue;
    const sec = model.sections.get(elem.sectionId);
    if (!sec?.b || !sec?.h) continue;
    const cls = classifyElement(nI.x, nI.y, nI.z ?? 0, nJ.x, nJ.y, nJ.z ?? 0, sec.b, sec.h);
    if (cls === 'column') continue;
    const cs = computeBeamCriticalSections(
      id, model.nodes, model.elements, model.sections, model.supports,
      { b: sec.b, h: sec.h, cover, stirrupDia },
    );
    if (cs) out.set(id, cs);
  }
  return out;
}

export interface BuildContextOptions {
  demands?: Map<number, ElementDesignDemands>;
  stations?: Map<number, ElementStationResult>;
  criticalSections?: Map<number, BeamCriticalSections>;
  /** Element ids whose force orientation is suspect (from the diagnostic). */
  orientationSuspect?: ReadonlySet<number>;
  /** Per-element slenderness magnifier. */
  slenderDeltaNs?: Map<number, number>;
  analysisRevision?: number;
  demandRevision?: number;
  solveGeneration?: number;
  cover?: number;
  stirrupDia?: number;
  rebarFy?: number;
  /** Edition of CIRSOC 201 to design to. Defaults to the edition in force. */
  codeEdition?: RegulationEdition;
  /** Project concrete data. Absent aggregate size becomes a visible assumption. */
  concrete?: ConcreteProjectData;
  /** Resolves PR #132's `Material.gradeId`. See `steel/material-family.ts`. */
  lookupGrade?: GradeFamilyLookup;
}

/**
 * Build the context for one member. Returns null only when the element does not
 * exist; every other deficiency is reported through `blocking` so the caller can
 * emit an honest DEMAND_UNAVAILABLE / UNSUPPORTED outcome instead of skipping.
 */
export function buildMemberContext(
  elementId: number,
  model: ContextModelData,
  opts: BuildContextOptions = {},
): MemberContext | null {
  const elem = model.elements.get(elementId);
  if (!elem) return null;
  const nI = model.nodes.get(elem.nodeI);
  const nJ = model.nodes.get(elem.nodeJ);
  const sec = model.sections.get(elem.sectionId);
  const mat = model.materials.get(elem.materialId);

  const blocking: LimitingConstraint[] = [];
  if (!nI || !nJ) blocking.push('missingSection');
  if (!sec || !sec.b || !sec.h) blocking.push('missingSection');
  // In this model fy on a material doubles as f'c for concrete (<= 80 MPa).
  const fc = mat?.fy;
  if (!mat || fc === undefined || fc <= 0) blocking.push('missingMaterial');

  /**
   * The material family, asked ONCE and recorded.
   *
   * This used to be the one place in the app that did not ask at all: `fc = mat?.fy` reads
   * a steel yield as a concrete strength, and a 345 MPa member came through as concrete
   * H-345 with a rectangular section the size of its bounding box. The adapter refused it
   * later — so nothing was ever certified — but under `DEMAND_UNAVAILABLE`, with demands
   * that were perfectly available, and counted against the concrete summary the whole way.
   *
   * `missingMaterial` rather than a new constraint: the adapter already reports
   * `design.reason.notConcrete` off the same fact, and widening `LimitingConstraint` would
   * collide with PR #125, which is editing that union for its own reasons.
   */
  const family = materialFamilyOf(mat, opts.lookupGrade);
  if (family.family !== 'concrete' && !blocking.includes('missingMaterial')) {
    blocking.push('missingMaterial');
  }

  const dx = (nJ?.x ?? 0) - (nI?.x ?? 0);
  const dy = (nJ?.y ?? 0) - (nI?.y ?? 0);
  const dz = (nJ?.z ?? 0) - (nI?.z ?? 0);
  const L = Math.sqrt(dx * dx + dy * dy + dz * dz);

  const b = sec?.b ?? 0;
  const h = sec?.h ?? 0;
  const elementType = (nI && nJ)
    ? classifyElement(nI.x, nI.y, nI.z ?? 0, nJ.x, nJ.y, nJ.z ?? 0, b || undefined, h || undefined)
    : 'beam';

  const demands = opts.demands?.get(elementId);
  const stations = opts.stations?.get(elementId);
  if (!demands || demands.demands.length === 0) blocking.push('missingDemand');
  if (!stations || stations.comboResults.length === 0) blocking.push('missingCombinations');

  const cover = opts.cover ?? DEFAULT_COVER;
  const stirrupDia = opts.stirrupDia ?? DEFAULT_STIRRUP_DIA;
  const fy = opts.rebarFy ?? DEFAULT_REBAR_FY;
  const codeEdition = opts.codeEdition ?? DEFAULT_CODE_EDITION;
  const maxAggregateSize = resolveMaxAggregateSize(
    opts.concrete ?? { maxAggregateSizeMm: null, shotcrete: false },
  );

  const axes = resolveDesignAxes(elementType, { b, h }, demands);
  if (axes.basis === 'no-demand' && !blocking.includes('missingDemand')) blocking.push('missingDemand');

  return {
    elementId,
    elementType,
    materialFamily: family.family,
    L,
    section: { id: sec?.id ?? -1, name: sec?.name ?? '—', b, h },
    material: { fc: fc ?? 0, fy, cover, stirrupDia, maxAggregateSize },
    demands,
    stations,
    criticalSections: opts.criticalSections?.get(elementId),
    axes,
    slenderDeltaNs: Math.max(1, opts.slenderDeltaNs?.get(elementId) ?? 1),
    codeEdition,
    orientationSuspect: opts.orientationSuspect?.has(elementId) ?? false,
    analysisRevision: opts.analysisRevision ?? 0,
    demandRevision: opts.demandRevision ?? 0,
    solveGeneration: opts.solveGeneration ?? 0,
    blocking: [...new Set(blocking)],
    modelData: model,
  };
}

/**
 * Build contexts for every CONCRETE element in the model.
 *
 * ── Why non-concrete members are left out rather than blocked ──────
 *
 * They used to be included. A steel frame therefore appeared, member by member, in the RC
 * design table; it was refused rather than designed, so no certificate was ever issued —
 * but it was counted. `verificationStore.providedSummary` walks these contexts, so a hall
 * with two concrete columns and three hundred steel members reported "2 verified of 302",
 * and the reason shown against each steel row was "demand unavailable" for members whose
 * demand was sitting right there.
 *
 * Blocking them instead of omitting them would fix the label and keep the pollution. They
 * are not members this pipeline refused; they are members it was never asked about. The
 * metallic surface lists them, with a census that says how many there are — see
 * `steel/steel-inventory.ts` — so nothing disappears, it just stops being counted as
 * concrete that failed.
 */
export function buildAllMemberContexts(
  model: ContextModelData,
  opts: BuildContextOptions = {},
): Map<number, MemberContext> {
  const out = new Map<number, MemberContext>();
  for (const id of model.elements.keys()) {
    const ctx = buildMemberContext(id, model, opts);
    if (!ctx) continue;
    if (ctx.materialFamily !== 'concrete') continue;
    out.set(id, ctx);
  }
  return out;
}

/**
 * Contexts for every element, concrete or not.
 *
 * For callers that need to reason about what was excluded — a diagnostic, a test asserting
 * the exclusion happened, a future surface that wants to show a metallic member's demands
 * without designing it. Normal design paths use `buildAllMemberContexts`.
 */
export function buildAllMemberContextsUnfiltered(
  model: ContextModelData,
  opts: BuildContextOptions = {},
): Map<number, MemberContext> {
  const out = new Map<number, MemberContext>();
  for (const id of model.elements.keys()) {
    const ctx = buildMemberContext(id, model, opts);
    if (ctx) out.set(id, ctx);
  }
  return out;
}

/** Section data in the shape `verifyProvidedReinforcement` expects. */
export function verifierSection(ctx: MemberContext) {
  return {
    b: ctx.axes.bFlex,
    h: ctx.axes.hFlex,
    fc: ctx.material.fc,
    fy: ctx.material.fy,
    cover: ctx.material.cover,
    stirrupDia: ctx.material.stirrupDia,
  };
}
