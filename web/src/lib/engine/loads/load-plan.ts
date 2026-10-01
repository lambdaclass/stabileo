/**
 * The single authoritative regulation-backed load generator.
 *
 * ── What this replaces ─────────────────────────────────────────
 *
 * There were two generators. `ProAutoLoadsDialog` called the legacy `auto-loads.ts` and
 * `wind-loads.ts` — CIRSOC 101-2005 combinations, 102-2005 wind with no pressure
 * coefficients, an occupancy table with no clause references, and a seismic weight built
 * on a literal `× 50 // rough 50m² per floor`. The PR16 engines under `lib/codes/cirsoc101`
 * and `lib/codes/cirsoc102` were complete, tested, and had **zero callers**. The
 * regulation panel let a user pick a load edition that nothing read.
 *
 * This module is the one production path. It is driven by the bound regulation roles, it
 * produces a PLAN rather than mutating the model, and the plan is what the preview shows
 * and what Apply commits. Nothing else generates loads.
 *
 * ── Why a plan ─────────────────────────────────────────────────
 *
 * Because "changing a load regulation must not silently relabel existing loads" is only
 * enforceable if generation and mutation are separate steps. `buildLoadPlan` is pure and
 * side-effect free; `describePlanDelta` diffs it against what the model already has; the
 * caller applies it only after the user confirms.
 *
 * ── Floor mass ─────────────────────────────────────────────────
 *
 * Seismic weight comes from real geometry: member self-weight from length × section area
 * × density, plus the applied area loads over each level's true tributary plan area
 * computed from the node extents at that level. There is no assumed floor area anywhere
 * in this file.
 *
 * Pure: no store, no runes. Forces kN, lengths m, pressures kPa.
 */

import {
  generateCombinations, liveLoadFactorInCompanion,
  type CombinationInputs, type LoadCombinationSpec, type LoadSymbol,
} from '../../codes/cirsoc101/combinations';
import { generateServiceCombinations } from '../../codes/cirsoc101/service-combinations';
import {
  findOccupancy, reduceLiveLoad,
  type ElementKind, type OccupancyEntry,
} from '../../codes/cirsoc101/live-loads';
import type { Enclosure, Exposure, ServiceRecurrence } from '../../codes/cirsoc102/wind';
import type { WindCaseSet, WindDirection } from './wind-cases';
import { planWind } from './load-plan-wind';
import { planSnow } from './load-plan-snow';
import { gravityLayout } from './plan-gravity';
import { planAreaLoads, type RoofLoads } from './plan-area-loads';
import type { RoofWeight } from '../../codes/cirsoc101/roof-live';
import type { RoofExposure, SnowCategory, SnowTerrain, ThermalCondition } from '../../codes/cirsoc104/snow';
import {
  assumed, clause, fromProject, type ClauseRef, type ProvenancedValue, fromCode,
} from '../../codes/regulation';
import {
  designSpectrum, isBlocked, SIMULTANEITY_F1,
  type DestinationGroup, type OccupancyProbability,
  type SeismicZone, type SiteClass,
} from '../../codes/cirsoc103/spectrum';
import {
  designPeriod, designSeismicCoefficient, distributeInHeight, staticMethodApplicable,
  type PeriodSystem, type PlanRegularity,
} from '../../codes/cirsoc103/static-method';
import { findBehaviour, R_ELASTIC } from '../../codes/cirsoc103/behaviour';
import { dedupeMessages, msg, round, type EngineMessage } from '../../codes/message';
import type { ProjectRegulations } from '../../codes/roles';
import { findOption, optionLabel, roleUsable } from '../../codes/roles';

import { createSectionWeight } from '../../section/weight';
import type { DrawnSection } from '../../section/drawn';

// ─── Model slice ─────────────────────────────────────────────────

export interface LoadModelData {
  nodes: Map<number, { id: number; x: number; y: number; z?: number }>;
  elements: Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number; type?: 'frame' | 'truss' }>;
  sections: Map<number, { id: number; a: number; drawn?: DrawnSection }>;
  /** Quads, for a floor drawn as a slab of shells (`plan-gravity.ts`). */
  quads?: Map<number, { id: number; nodes: number[] }>;
  materials: Map<number, { id: number; rho: number }>;
  loadCases: Array<{ id: number; type: string; name: string }>;
}

// ─── Inputs ──────────────────────────────────────────────────────

export interface DeadComponent {
  /** i18n key naming the component, e.g. `loads.dead.piso_porcelanato`. */
  labelKey: string;
  /** Area load, kPa. */
  q: number;
}

/**
 * Everything INPRES-CIRSOC 103's static method needs that the model cannot answer.
 *
 * The zone is here rather than derived because Anexo A assigns zones department by
 * department and a digitised version of that annex would be a table nobody checked —
 * see `codes/cirsoc103/spectrum.ts`. Everything else is a property of the structure the
 * reader is describing, not of its geometry.
 */
export interface SeismicCodeInputs {
  zone: SeismicZone;
  site: SiteClass;
  group: DestinationGroup;
  /** Tabla 5.1 row key for the system carrying the shear, e.g. `rc_frame_full_ductility`. */
  systemKey: string;
  /** Tabla 6.2 row for the approximate period. */
  periodSystem: PeriodSystem;
  regularity: PlanRegularity;
  /** Tabla 3.3 — how much of the imposed load is present during the earthquake. */
  occupancy: OccupancyProbability;
  /** §5.1.2 — the owner elected elastic behaviour, so R = 1,5 whatever the system. */
  elastic?: boolean;
  na?: number;
  nv?: number;
  /** A period from a modal analysis, s. Capped by [6.7] when given. */
  computedT?: number;
}

export interface LoadPlanInput {
  regulations: ProjectRegulations;
  model: LoadModelData;
  /** Superimposed dead components, kPa. */
  dead: DeadComponent[];
  /** Occupancy key from the CIRSOC 101 Table 4.1 catalogue. */
  occupancyKey: string;
  /** Tributary width used to convert area loads to line loads on beams, m. */
  tributaryWidth: number;
  /**
   * How area loads reach the structure (`plan-gravity.ts`): by the real tributary area of the
   * panels the beams close, or with `tributaryWidth` on every beam. Absent: the width.
   */
  gravity?: { mode: 'panels' | 'width'; slab?: 'twoWay' | 'oneWay'; spanAxis?: 'x' | 'y' };
  /**
   * The roof's own loads (`plan-area-loads.ts`): its superimposed dead load and either the roof
   * live load Lr of §4.8.1 (`maintenance`) or the live load of an occupancy (`occupancy`, §4.8.2).
   * Absent: roofs are loaded as floors.
   */
  roof?: { use: 'maintenance' | 'occupancy'; weight: RoofWeight; dead: number; occupancyKey?: string; slopeDeg: number };
  /** L and Lr also on alternate panels and spans, two checkerboard cases each (§4.3.3). */
  patterns?: boolean;
  /** Element kind for the §4.7.2 live-load reduction. */
  reductionElementKind: ElementKind;
  /** Floors the reduced member supports, for the 0,5/0,4 Lo floor. */
  floorsSupported: number;
  /** Apply the §4.7.2 reduction at all. */
  applyLiveReduction: boolean;
  wind?: {
    enabled: boolean;
    basicSpeed: number;
    exposure: Exposure;
    enclosure: Enclosure;
    siteAltitudeM: number;
    kzt: number;
    kztSurveyed: boolean;
    roofSlopeDeg: number;
    rigid: boolean;
    directions: { x: boolean; y: boolean };
    /** Which cases of Fig. 2.4-8 to generate. Absent: all four (§2.4.6). */
    caseSet?: WindCaseSet;
    /** Wind from −X and −Y as well. Absent: true. Read only when `senses` is absent. */
    bothSenses?: boolean;
    /**
     * The directions to generate, any of +X, −X, +Y and −Y. Absent: the axes of `directions`,
     * in both senses unless `bothSenses` is false.
     */
    senses?: WindDirection[];
    /** Service-level wind Wa (B.4.2): the 50-year speed and the recurrence to convert it to. */
    service?: { enabled: boolean; v50: number; mri: ServiceRecurrence };
  };
  /** CIRSOC 104-2005 roof snow (`snow-loads.ts`). */
  snow?: {
    enabled: boolean;
    /** Ground snow load, kN/m²: from Tablas 1.1 a 1.15 or a site value. */
    pg: number;
    /** Where p_g came from, for the derivation: a table locality or a site value. */
    source: string;
    terrain: SnowTerrain;
    exposure: RoofExposure;
    thermal: ThermalCondition;
    category: SnowCategory;
    roofKind: 'mono' | 'gable';
    slippery: boolean;
    /** The roof slope, degrees; absent: read from the roof members. */
    roofSlopeDeg?: number;
  };
  seismic?: {
    enabled: boolean;
    /**
     * Design seismic coefficient C, typed by the reader.
     *
     * Kept, and no longer the only way in: `code` below derives C from
     * INPRES-CIRSOC 103 instead. A typed coefficient is somebody's calculation done
     * elsewhere, which is legitimate and is recorded as a project value rather than as
     * something read off a table.
     */
    coefficient: number;
    /**
     * Derive C from INPRES-CIRSOC 103 Capítulo 6 instead of using `coefficient`.
     *
     * When present this wins, because it is the one of the two that can be checked.
     */
    code?: SeismicCodeInputs;
    /** Fraction of the imposed load in the seismic weight; null → recorded assumption. */
    liveParticipation: number | null;
    directions: { x: boolean; y: boolean };
  };
  generateCombinations: boolean;
  /**
   * Which combinations to generate when `generateCombinations` is on: the strength ones of
   * §2.3.2 (the default), the characteristic service ones, or both.
   */
  combinationSet?: 'ultimate' | 'service' | 'both';
  /**
   * The project's own combination rules, as specs, in place of the regulation's when given
   * (`combination-rules.ts`). They are expanded over the planned cases the same way.
   */
  projectCombinations?: LoadCombinationSpec[];
}

/** The wind directions a plan input asks for (see `senses`). */
export function windDirectionsOf(w: { directions: { x: boolean; y: boolean }; bothSenses?: boolean; senses?: WindDirection[] }): WindDirection[] {
  if (w.senses) return [...w.senses];
  const both = w.bothSenses ?? true;
  return [
    ...(w.directions.x ? (['+x', ...(both ? ['-x'] : [])] as WindDirection[]) : []),
    ...(w.directions.y ? (['+y', ...(both ? ['-y'] : [])] as WindDirection[]) : []),
  ];
}

// ─── Plan ────────────────────────────────────────────────────────

export interface PlannedCase {
  /** Existing case id when one matches, else null → a new case is needed. */
  existingId: number | null;
  type: 'D' | 'L' | 'Lr' | 'S' | 'W' | 'Wa' | 'E';
  /** i18n key for the case name. */
  nameKey: string;
  nameParams?: Record<string, string | number>;
  /** Patterns of one action, taken one at a time in a combination (see LoadCase.alternatives). */
  alternatives?: string;
}

export interface PlannedDistributed {
  elementId: number;
  caseType: PlannedCase['type'];
  /** Index into `LoadPlan.cases` when a type has several cases (wind, seismic). */
  caseIndex?: number;
  /**
   * Line load, kN/m, negative downward: along local z by default, along global Z per metre of
   * member (`global`) or per metre of horizontal projection (`projected`) when `frame` says so.
   * `qJ` and the stretch [a, b] from node I when it is not uniform over the whole member.
   */
  q: number;
  qJ?: number;
  a?: number;
  b?: number;
  frame?: 'local' | 'global' | 'projected';
}

/** An area load on a quad, kN/m², positive downward (`SurfaceLoad3D`). */
export interface PlannedSurface {
  quadId: number;
  caseType: PlannedCase['type'];
  caseIndex?: number;
  q: number;
}

export interface PlannedNodal {
  nodeId: number;
  caseType: PlannedCase['type'];
  /** Index into `LoadPlan.cases` when a type has several cases (wind, seismic). */
  caseIndex?: number;
  fx: number;
  fy: number;
  fz: number;
  /** Moment about the vertical, kN·m (a wind torsion on a one-node level). */
  mz?: number;
}

/** The lists a planning step appends to: the plan's cases, loads and what it says about them. */
export interface PlanSink {
  cases: PlannedCase[];
  nodal: PlannedNodal[];
  distributed: PlannedDistributed[];
  derivation: EngineMessage[];
  refs: ClauseRef[];
  assumptions: EngineMessage[];
  unsupportedKeys: LoadPlan['unsupportedKeys'];
  blockedKeys: LoadPlan['blockedKeys'];
}

export interface LevelMass {
  elevation: number;
  nodeIds: number[];
  /** Tributary plan area computed from the node extents at this level, m². */
  planAreaM2: number;
  selfWeightKN: number;
  superimposedKN: number;
  liveTotalKN: number;
  liveParticipatingKN: number;
  weightKN: number;
}

export type PlanOutcome = 'READY' | 'BLOCKED';

/** What the static method concluded, so the report can show the derivation. */
export interface SeismicPlanDetail {
  source: 'cirsoc103' | 'manual';
  zone?: SeismicZone;
  spectralType?: 1 | 2 | 3;
  ca?: number;
  cv?: number;
  t1?: number;
  t2?: number;
  t3?: number;
  /** Period used, s, and the approximate period it was checked against. */
  t?: number;
  ta?: number;
  periodCapped?: boolean;
  r?: number;
  gammaR?: number;
  c: number;
  /** Which floor of §6.2.2 governed, if one did. */
  floorApplied?: 'nearFault' | 'lowZone' | null;
  /** True when [6.12]/[6.13] placed a tenth of the shear on the top mass. */
  topHeavy?: boolean;
  /** §3.6 Tabla 3.3 simultaneity factor actually used. */
  f1?: number;
}

export interface LoadPlan {
  outcome: PlanOutcome;
  cases: PlannedCase[];
  distributed: PlannedDistributed[];
  nodal: PlannedNodal[];
  surface: PlannedSurface[];
  combinations: LoadCombinationSpec[];
  /** Provenanced scalars for the report's basis-of-calculation block. */
  factors: {
    occupancy: ProvenancedValue<number>;
    liveReduced: ProvenancedValue<number>;
    deadTotal: ProvenancedValue<number>;
    windQh?: ProvenancedValue<number>;
    seismicWeight?: ProvenancedValue<number>;
    baseShear?: ProvenancedValue<number>;
  };
  levels: LevelMass[];
  /** The 103 derivation, when the code path produced the coefficient. */
  seismic?: SeismicPlanDetail;
  assumptions: EngineMessage[];
  /** Conditions the plan could not cover. */
  unsupportedKeys: EngineMessage[];
  refs: ClauseRef[];
  /** The derivation, one message per decision, in the order the decisions were made. */
  derivation: EngineMessage[];
  /** Reasons the plan is BLOCKED. */
  blockedKeys: EngineMessage[];
}

const R101 = (c: string, l?: string) => clause('cirsoc-101', '2025', c, l);

/** The alternatives groups of the live load and roof live load with their checkerboards (§4.3.3). */
export const LIVE_PATTERNS = 'live-patterns';
export const ROOF_LIVE_PATTERNS = 'roof-live-patterns';

function elevationOf(n: { z?: number }): number { return n.z ?? 0; }

/** Group nodes into levels and compute each level's true plan extent. */
export function levelsWithPlanArea(
  model: LoadModelData, tolerance = 0.05,
): Array<{ elevation: number; nodeIds: number[]; planAreaM2: number }> {
  const buckets: Array<{ elevation: number; nodeIds: number[]; planAreaM2: number }> = [];
  const sorted = [...model.nodes.values()].sort((a, b) => elevationOf(a) - elevationOf(b));
  for (const n of sorted) {
    const z = elevationOf(n);
    const last = buckets[buckets.length - 1];
    if (last && Math.abs(last.elevation - z) <= tolerance) last.nodeIds.push(n.id);
    else buckets.push({ elevation: z, nodeIds: [n.id], planAreaM2: 0 });
  }
  for (const b of buckets) {
    b.nodeIds.sort((x, y) => x - y);
    const pts = b.nodeIds.map((id) => model.nodes.get(id)!).filter(Boolean);
    if (pts.length < 3) { b.planAreaM2 = 0; continue; }
    // Axis-aligned extent of the nodes at this level. Real geometry, not an assumption.
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    b.planAreaM2 = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  }
  return buckets;
}

/** Member self-weight apportioned half to each end node's level. */
function selfWeightByLevel(
  model: LoadModelData, levelOfNode: Map<number, number>, count: number,
): { weights: number[]; skipped: number } {
  const weights = new Array(count).fill(0);
  const sectionWeight = createSectionWeight(model.materials);
  let skipped = 0;
  for (const el of model.elements.values()) {
    const nI = model.nodes.get(el.nodeI);
    const nJ = model.nodes.get(el.nodeJ);
    const sec = model.sections.get(el.sectionId);
    const mat = model.materials.get(el.materialId);
    if (!nI || !nJ || !sec || !mat || !(sec.a > 0)) { skipped++; continue; }
    const L = Math.hypot(nJ.x - nI.x, nJ.y - nI.y, elevationOf(nJ) - elevationOf(nI));
    const w = sectionWeight(sec, el.materialId) * L;
    for (const id of [el.nodeI, el.nodeJ]) {
      const lv = levelOfNode.get(id);
      if (lv !== undefined) weights[lv] += w / 2;
    }
  }
  return { weights, skipped };
}

function findCase(model: LoadModelData, type: string, nameMatch?: string): number | null {
  const c = model.loadCases.find((x) =>
    x.type === type && (nameMatch === undefined || x.name.includes(nameMatch)));
  return c?.id ?? null;
}

/**
 * Build the load plan.
 *
 * BLOCKED, with reasons, when the bound roles cannot produce loads — an unusable role is
 * reported rather than silently substituted with a default.
 */
export function buildLoadPlan(input: LoadPlanInput): LoadPlan {
  const derivation: EngineMessage[] = [];
  const assumptions: EngineMessage[] = [];
  const refs: ClauseRef[] = [];
  const unsupportedKeys: LoadPlan['unsupportedKeys'] = [];
  const blockedKeys: LoadPlan['blockedKeys'] = [];

  // ── Role gates ──
  for (const role of ['basis', 'loads'] as const) {
    if (!roleUsable(input.regulations, role)) {
      blockedKeys.push(msg('loadPlan.blocked.roleUnusable', {
        role: `regulations.role.${role}`,
        name: input.regulations[role].adapterId ?? '',
      }));
    }
  }
  if (input.wind?.enabled && !roleUsable(input.regulations, 'wind')) {
    blockedKeys.push(msg('loadPlan.blocked.windRoleUnusable'));
  }
  if (input.snow?.enabled && !roleUsable(input.regulations, 'snow')) {
    blockedKeys.push(msg('loadPlan.blocked.snowRoleUnusable'));
  }
  if (input.seismic?.enabled && !roleUsable(input.regulations, 'seismic')) {
    blockedKeys.push(msg('loadPlan.blocked.seismicRoleUnusable'));
  }

  const empty: LoadPlan = {
    outcome: 'BLOCKED', cases: [], distributed: [], nodal: [], surface: [], combinations: [],
    factors: {
      occupancy: fromProject(0, 'kN/m²'),
      liveReduced: fromProject(0, 'kN/m²'),
      deadTotal: fromProject(0, 'kN/m²'),
    },
    levels: [], assumptions, unsupportedKeys, refs, derivation, blockedKeys,
  };
  if (blockedKeys.length > 0) return empty;

  const loadsOpt = findOption(input.regulations.loads.adapterId!)!;
  derivation.push(msg('loadPlan.derivation.basis', { regulation: optionLabel(loadsOpt) }));

  // ── Dead ──
  const deadTotal = input.dead.reduce((s, d) => s + d.q, 0);
  refs.push(R101('3.1.1', 'definición de cargas permanentes'));

  // ── Live: Table 4.1 then §4.7.2 ──
  const occ: OccupancyEntry | undefined = findOccupancy(input.occupancyKey);
  if (!occ) {
    blockedKeys.push(msg('loadPlan.blocked.unknownOccupancy', { key: input.occupancyKey }));
    return { ...empty, blockedKeys };
  }
  if (occ.uniformKNm2 === null) {
    blockedKeys.push(msg('loadPlan.blocked.occupancyCrossReference', {
      article: occ.seeArticle ?? '', occupancy: occ.labelKey,
    }));
    return { ...empty, blockedKeys };
  }
  refs.push(...occ.refs);
  const lo = occ.uniformKNm2;
  derivation.push(msg('loadPlan.derivation.occupancy', {
    occupancy: msg(occ.labelKey), lo,
  }));
  derivation.push(msg('loadPlan.derivation.dead', { total: round(deadTotal, 3) }));

  const levelsRaw = levelsWithPlanArea(input.model);
  const levelOfNode = new Map<number, number>();
  levelsRaw.forEach((lv, i) => { for (const id of lv.nodeIds) levelOfNode.set(id, i); });

  // Tributary area for the reduction: the largest level plan area is the honest upper
  // bound for a member of this kind in this model.
  const tributaryAreaM2 = Math.max(
    input.tributaryWidth * input.tributaryWidth,
    ...levelsRaw.map((l) => l.planAreaM2 / Math.max(1, l.nodeIds.length / 4)),
  );

  let liveDesign = lo;
  if (input.applyLiveReduction) {
    const red = reduceLiveLoad({
      loKNm2: lo, tributaryAreaM2, elementKind: input.reductionElementKind,
      floorsSupported: input.floorsSupported,
      // Structured, not sniffed from the label: `garaje_camiones` is a garage but not a
      // *passenger* garage, and §4.7.4's 20 % applies only to passenger vehicles.
      passengerGarage: occ.assemblyKind === 'passengerGarage',
      publicAssembly: occ.assemblyKind === 'publicAssembly',
      // Table 4.1 note (a) and the rows printed "(No se puede reducir)".
      noReduction: occ.noReduction === true,
    });
    liveDesign = red.lKNm2;
    refs.push(...red.refs);
    derivation.push(red.reason);
  } else {
    derivation.push(msg('loadPlan.derivation.reductionDisabled'));
  }

  // ── Cases ──
  const cases: PlannedCase[] = [
    { existingId: findCase(input.model, 'D'), type: 'D', nameKey: 'autoLoad.deadCase' },
    { existingId: findCase(input.model, 'L'), type: 'L', nameKey: 'autoLoad.liveCase' },
  ];

  // ── Dead, live and roof live, where the area loads go (`plan-gravity.ts`, `plan-area-loads.ts`) ──
  const panelMode = input.gravity?.mode === 'panels';
  const layout = gravityLayout(input.model, {
    mode: panelMode ? 'panels' : 'width', slab: input.gravity?.slab, spanAxis: input.gravity?.spanAxis,
    tributaryWidth: input.tributaryWidth,
  });
  derivation.push(...layout.notes);
  /** The design live load of a member for an occupancy: by its own tributary area in panel mode. */
  const reducedFor = (entry: OccupancyEntry, loKNm2: number, uniform: number, areas: Map<number, number>) => (elementId: number): number => {
    if (!input.applyLiveReduction) return loKNm2;
    if (!panelMode) return uniform;
    return reduceLiveLoad({
      loKNm2, tributaryAreaM2: areas.get(elementId) ?? 0, elementKind: input.reductionElementKind,
      floorsSupported: input.floorsSupported,
      passengerGarage: entry.assemblyKind === 'passengerGarage', publicAssembly: entry.assemblyKind === 'publicAssembly',
      noReduction: entry.noReduction === true,
    }).lKNm2;
  };
  // Without roof settings a roof is a floor: its area counts as floor area.
  const floorAreas = input.roof ? layout.areaOf : new Map([...layout.areaOf].map(([id, a]) => [id, a + (layout.roofAreaOf.get(id) ?? 0)]));
  for (const [id, a] of layout.roofAreaOf) if (!input.roof && !floorAreas.has(id)) floorAreas.set(id, a);
  const liveOf = reducedFor(occ, lo, liveDesign, floorAreas);
  if (input.applyLiveReduction && panelMode) {
    const ls = [...floorAreas.keys()].map(liveOf);
    if (ls.length) derivation.push(msg('loadPlan.derivation.reductionPerMember', { min: round(Math.min(...ls), 3), max: round(Math.max(...ls), 3), n: ls.length }));
  }
  let roofLoads: RoofLoads | undefined;
  if (input.roof) {
    const r = input.roof;
    const slopePercent = Math.tan((r.slopeDeg * Math.PI) / 180) * 100;
    if (r.use === 'occupancy') {
      const roofOcc = findOccupancy(r.occupancyKey ?? '');
      if (!roofOcc || roofOcc.uniformKNm2 === null) {
        blockedKeys.push(msg('loadPlan.blocked.unknownOccupancy', { key: r.occupancyKey ?? '' }));
        return { ...empty, blockedKeys };
      }
      const rlo = roofOcc.uniformKNm2;
      refs.push(...roofOcc.refs, clause('cirsoc-101', '2025', '4.8.2', 'cubiertas para propósitos especiales'));
      const uniform = input.applyLiveReduction
        ? reduceLiveLoad({ loKNm2: rlo, tributaryAreaM2, elementKind: input.reductionElementKind, floorsSupported: 1,
            passengerGarage: roofOcc.assemblyKind === 'passengerGarage', publicAssembly: roofOcc.assemblyKind === 'publicAssembly',
            noReduction: roofOcc.noReduction === true }).lKNm2
        : rlo;
      roofLoads = { dead: r.dead, use: 'occupancy', weight: r.weight, slopePercent, lo: rlo, liveOf: reducedFor(roofOcc, rlo, uniform, layout.roofAreaOf) };
      derivation.push(msg('loadPlan.derivation.roofOccupancy', { occupancy: msg(roofOcc.labelKey), lo: rlo, dead: round(r.dead, 3), n: layout.roof.size }));
    } else {
      roofLoads = { dead: r.dead, use: 'maintenance', weight: r.weight, slopePercent };
      derivation.push(msg('loadPlan.derivation.roofDead', { dead: round(r.dead, 3), n: layout.roof.size + layout.roofQuads.size }));
    }
  }
  const area = planAreaLoads({
    layout, tributaryWidth: input.tributaryWidth, legacyWidth: !panelMode,
    floor: { dead: deadTotal, lo, liveOf }, roof: roofLoads, patterns: input.patterns,
  });
  derivation.push(...area.derivation);
  refs.push(...area.refs);
  const surface: PlannedSurface[] = area.surface.map((d) => ({ ...d }));
  if (area.planned.has('Lr')) cases.push({ existingId: findCase(input.model, 'Lr'), type: 'Lr', nameKey: 'autoLoad.roofLiveCase' });
  // A building that is only a maintenance roof has no L; its case would be empty.
  if (input.roof && !area.planned.has('L')) cases.splice(cases.findIndex((c) => c.type === 'L'), 1);
  // The checkerboards, one case each: alternatives to the full load, never added to it.
  // The full load and its two checkerboards are one action three ways: an alternatives group
  // (`LoadCase.alternatives`), so a combination takes one of the three.
  const arrangementIndex = new Map<string, number>();
  for (const sym of area.arranged) {
    const group = sym === 'L' ? LIVE_PATTERNS : ROOF_LIVE_PATTERNS;
    const full = cases.find((c) => c.type === sym && c.alternatives === undefined);
    if (full) full.alternatives = group;
    for (const k of [0, 1]) {
      arrangementIndex.set(`${sym}${k}`, cases.length);
      cases.push({ existingId: null, type: sym, nameKey: sym === 'L' ? 'autoLoad.liveCasePattern' : 'autoLoad.roofLiveCasePattern', nameParams: { k: k === 0 ? 'A' : 'B' }, alternatives: group });
    }
  }
  const distributed: PlannedDistributed[] = area.distributed.map(({ arrangement, ...d }) =>
    (arrangement !== undefined ? { ...d, caseIndex: arrangementIndex.get(`${d.caseType}${arrangement}`)! } : d));

  // ── Level masses from real geometry ──
  const sw = selfWeightByLevel(input.model, levelOfNode, levelsRaw.length);
  if (sw.skipped > 0) {
    const note = msg('loadPlan.assumption.selfWeightSkipped', { count: sw.skipped });
    assumptions.push(note);
    derivation.push(note);
  }

  /*
   * How much of the imposed load is present when the earthquake arrives.
   *
   * Tabla 3.3 answers this by OCCUPANCY — a warehouse carries three quarters of its
   * imposed load and a flat a quarter — so where the code path names one, it is read off
   * the table rather than assumed. A typed value still wins over both, and the 0,25
   * fallback is what it always was: an assumption, and reported as one.
   */
  const codeF1 = input.seismic?.code
    ? SIMULTANEITY_F1[input.seismic.code.occupancy]
    : undefined;
  const participation: ProvenancedValue<number> = input.seismic?.liveParticipation !== null
    && input.seismic?.liveParticipation !== undefined
    ? fromProject(input.seismic.liveParticipation)
    : codeF1 !== undefined
      ? fromCode(codeF1, [clause('inpres-cirsoc-103-i', '2018', 'Tabla 3.3',
          'factor de simultaneidad para sobrecargas')])
      : assumed(0.25, msg('loadPlan.assumption.liveParticipation', { fraction: 0.25 }),
          [clause('inpres-cirsoc-103-i', '2018', '3.6', 'acciones gravitatorias para la acción sísmica')]);
  if (participation.origin === 'assumed' && input.seismic?.enabled) {
    assumptions.push(participation.assumption!);
  }

  /*
   * What the area loads add to each level's mass. By area, each member and slab brings the area
   * it carries, at the dead and live load of the floor or roof it belongs to. By width, the
   * extent of the level's nodes, at the roof's loads when every member there is a roof member.
   */
  const levelIndexOf = (z: number) => {
    let best = 0;
    levelsRaw.forEach((lv, k) => { if (Math.abs(lv.elevation - z) < Math.abs(levelsRaw[best]!.elevation - z)) best = k; });
    return best;
  };
  const byArea = levelsRaw.map(() => ({ area: 0, dead: 0, live: 0, any: false }));
  if (panelMode) {
    for (const [areas, m] of [[layout.areaOf, area.floorMass], [layout.roofAreaOf, area.roofMass]] as const) {
      for (const [id, a] of areas) {
        const k = levelIndexOf(layout.zOf.get(id) ?? 0);
        byArea[k]!.area += a; byArea[k]!.dead += a * m.dead; byArea[k]!.live += a * m.live; byArea[k]!.any = true;
      }
    }
    for (const sq of layout.shellQuads) {
      const k = levelIndexOf(sq.z), m = area.massOfQuad(sq.quadId);
      byArea[k]!.area += sq.area; byArea[k]!.dead += sq.area * m.dead; byArea[k]!.live += sq.area * m.live; byArea[k]!.any = true;
    }
  }
  const roofLevel = (k: number) => {
    if (!roofLoads) return false;
    const ids = [...layout.zOf].filter(([, z]) => levelIndexOf(z) === k).map(([id]) => id);
    return ids.length > 0 && ids.every((id) => layout.roof.has(id));
  };
  const levels: LevelMass[] = levelsRaw.map((lv, i) => {
    const ba = byArea[i]!;
    const atRoof = !ba.any && roofLevel(i);
    const area = ba.any ? ba.area : lv.planAreaM2;
    const superimposed = ba.any ? ba.dead : (atRoof ? roofLoads!.dead : deadTotal) * area;
    const liveTotal = ba.any ? ba.live : (atRoof ? (roofLoads!.use === 'occupancy' ? roofLoads!.lo ?? 0 : 0) : lo) * area;
    const liveP = liveTotal * participation.value;
    return {
      elevation: lv.elevation, nodeIds: lv.nodeIds, planAreaM2: area,
      selfWeightKN: sw.weights[i], superimposedKN: superimposed,
      liveTotalKN: liveTotal, liveParticipatingKN: liveP,
      weightKN: sw.weights[i] + superimposed + liveP,
    };
  });
  for (const lv of levels) {
    derivation.push(msg('loadPlan.derivation.level', {
      elevation: round(lv.elevation, 2), area: round(lv.planAreaM2, 1),
      selfWeight: round(lv.selfWeightKN, 1), superimposed: round(lv.superimposedKN, 1),
      weight: round(lv.weightKN, 1),
    }));
  }

  // ── Wind (load-plan-wind.ts) ──
  const nodal: PlannedNodal[] = [];
  const sink: PlanSink = { cases, nodal, distributed, derivation, refs, assumptions, unsupportedKeys, blockedKeys };
  const { windQh } = planWind(input, levels, sink);

  // ── Snow (load-plan-snow.ts) ──
  const snowPlanned = planSnow(input, sink);

  /*
   * ── Seismic ────────────────────────────────────────────────────
   *
   * Two ways to a coefficient. The reader can type C — somebody's calculation done
   * elsewhere, which is legitimate — or give the building's zone, site, destination
   * group and structural system, and have INPRES-CIRSOC 103 Capítulo 6 produce it. The
   * second is the one that can be checked, so it wins when both are present, and the
   * derivation is carried out of here message by message rather than reduced to a
   * number.
   *
   * The distribution in height is the same 6.11 it always was, with one addition that
   * only the code path can make: past T > 2·T2, [6.12]/[6.13] move a tenth of the base
   * shear onto the topmost mass. Nothing in a typed coefficient says what T is, so that
   * branch is unreachable without the spectrum.
   */
  let seismicWeight: ProvenancedValue<number> | undefined;
  let baseShear: ProvenancedValue<number> | undefined;
  let seismicDetail: SeismicPlanDetail | undefined;
  if (input.seismic?.enabled) {
    const elevated = levels.filter((l) => l.elevation > 0 && l.weightKN > 0);
    const W = elevated.reduce((s, l) => s + l.weightKN, 0);
    if (W <= 0) {
      unsupportedKeys.push(msg('loadPlan.unsupported.noSeismicMass'));
    } else {
      const code = input.seismic.code;
      let C = input.seismic.coefficient;
      let uncappedT = 0;
      let t2 = Infinity;
      seismicDetail = { source: 'manual', c: C };

      if (code) {
        const spectrum = designSpectrum({ zone: code.zone, site: code.site, na: code.na, nv: code.nv });
        if (isBlocked(spectrum)) {
          blockedKeys.push(spectrum.blocked);
          refs.push(...spectrum.refs);
        } else {
          const H = Math.max(...elevated.map((l) => l.elevation), 0);
          const period = designPeriod(
            { heightM: H, system: code.periodSystem, computedT: code.computedT },
            spectrum.as,
          );
          /* [6.12]/[6.13] test the period WITHOUT the [6.7] cap — the clause says so,
             and using the capped one would shorten it and skip the extra force. */
          uncappedT = code.computedT !== undefined && code.computedT > 0 ? code.computedT : period.ta;
          t2 = spectrum.t2;

          const applicability = staticMethodApplicable({
            zone: code.zone, group: code.group, heightM: H, levels: elevated.length,
            regularity: code.regularity, t: uncappedT, t2,
          });
          refs.push(...applicability.refs);
          for (const r of applicability.reasons) {
            if (r.key.startsWith('seismic.blocked.')) blockedKeys.push(r);
            else assumptions.push(r);
          }

          const entry = findBehaviour(code.systemKey);
          const R = code.elastic ? R_ELASTIC : entry?.r ?? null;
          if (R === null) {
            /* Tabla 5.1 row 1 prints a formula on the wall layout, not a value; an
               unknown key is the same hole. Either way there is no R to divide by. */
            blockedKeys.push(msg('loadPlan.blocked.seismicNoR', { system: code.systemKey }));
          } else if (applicability.allowed) {
            const coeff = designSeismicCoefficient({
              spectrum, group: code.group, r: R, t: period.t,
            });
            C = coeff.c;
            refs.push(...period.refs, ...coeff.refs);
            derivation.push(period.derivation, ...coeff.derivation);
            assumptions.push(...spectrum.assumptions);
            seismicDetail = {
              source: 'cirsoc103', zone: spectrum.zone, spectralType: spectrum.type,
              ca: spectrum.ca, cv: spectrum.cv, t1: spectrum.t1, t2: spectrum.t2,
              t3: spectrum.t3, t: period.t, ta: period.ta, periodCapped: period.capped,
              r: R, gammaR: coeff.gammaR, c: C, floorApplied: coeff.floorApplied,
              f1: SIMULTANEITY_F1[code.occupancy],
            };
          }
        }
      }

      const V0 = C * W;
      seismicWeight = fromProject(W, 'kN');
      baseShear = fromProject(V0, 'kN');

      const dist = distributeInHeight(
        elevated.map((l) => ({ h: l.elevation, w: l.weightKN })), V0, uncappedT, t2,
      );
      refs.push(...dist.refs);
      derivation.push(dist.derivation);
      if (seismicDetail) seismicDetail.topHeavy = dist.topHeavy;

      const exIndex = input.seismic.directions.x ? cases.length : -1;
      if (exIndex >= 0) {
        cases.push({ existingId: findCase(input.model, 'E', 'X'), type: 'E',
          nameKey: 'autoLoad.seismicCaseDir', nameParams: { dir: 'X' } });
      }
      const eyIndex = input.seismic.directions.y ? cases.length : -1;
      if (eyIndex >= 0) {
        cases.push({ existingId: findCase(input.model, 'E', 'Y'), type: 'E',
          nameKey: 'autoLoad.seismicCaseDir', nameParams: { dir: 'Y' } });
      }
      elevated.forEach((lv, i) => {
        const Fk = dist.forces[i]?.f ?? 0;
        const per = Fk / Math.max(1, lv.nodeIds.length);
        for (const id of lv.nodeIds) {
          if (exIndex >= 0) nodal.push({ nodeId: id, caseType: 'E', caseIndex: exIndex, fx: per, fy: 0, fz: 0 });
          if (eyIndex >= 0) nodal.push({ nodeId: id, caseType: 'E', caseIndex: eyIndex, fx: 0, fy: per, fz: 0 });
        }
      });

      derivation.push(msg('loadPlan.derivation.seismic', {
        weight: round(W, 1), coefficient: round(C, 4), baseShear: round(V0, 1),
      }));
    }
  }

  /*
   * Blocked conditions found while generating, not only while gating.
   *
   * The role gate above returns early; everything discovered afterwards — zone 0, site
   * SF, a system Tabla 5.1 gives no R, a building past Tabla 2.5 — used to be collected
   * into `blockedKeys` and then returned alongside `outcome: 'READY'`. A plan that
   * carries its own refusal and calls itself ready is worse than one that fails: the
   * caller applies it.
   */
  if (blockedKeys.length > 0) return empty;

  // ── Combinations from the basis role ──
  let combinations: LoadCombinationSpec[] = [];
  if (input.generateCombinations) {
    const present: CombinationInputs['present'] = {
      L: area.planned.has('L') || !input.roof, Lr: area.planned.has('Lr'), S: snowPlanned, R: false,
      W: !!input.wind?.enabled && nodal.some((n) => n.caseType === 'W'),
      Wa: nodal.some((n) => n.caseType === 'Wa'),
      E: !!input.seismic?.enabled && nodal.some((n) => n.caseType === 'E'),
      F: false, H: false,
    };
    const ci: CombinationInputs = {
      present, maxLoKNm2: lo,
      hasGarageOrPublicAssembly: occ.garageOrPublicAssembly === true,
    };
    const set = input.combinationSet ?? 'ultimate';
    if (input.projectCombinations) {
      combinations = [...input.projectCombinations];
    } else if (set !== 'service') {
      combinations = generateCombinations(ci);
      const exc = liveLoadFactorInCompanion(ci);
      if (exc.note) derivation.push(exc.note);
      refs.push(R101('2.3.2', 'combinaciones básicas'));
    }
    if (set !== 'ultimate' && !input.projectCombinations) combinations = [...combinations, ...generateServiceCombinations(ci)];
    derivation.push(msg('loadPlan.derivation.combinationCount', { count: combinations.length }));
  }

  return {
    outcome: 'READY',
    cases, distributed, nodal, surface, combinations,
    factors: {
      occupancy: fromProject(lo, 'kN/m²'),
      liveReduced: fromProject(liveDesign, 'kN/m²'),
      deadTotal: fromProject(deadTotal, 'kN/m²'),
      windQh, seismicWeight, baseShear,
    },
    levels,
    seismic: seismicDetail,
    assumptions: dedupeMessages(assumptions),
    unsupportedKeys, refs, derivation, blockedKeys: [],
  };
}

export { describePlanDelta, type CaseAction, type CaseDisposition, type PlanDelta, type CurrentLoadState } from './load-plan-delta';

/** Symbols a combination references, for mapping onto real case ids at apply time. */
export function combinationSymbols(spec: LoadCombinationSpec): LoadSymbol[] {
  return spec.terms.map((t) => t.symbol);
}
