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
import {
  applyMinimumWindLoad, computeWindPressures, internalPressureCoefficient, velocityPressure, G_RIGID,
  type Enclosure, type Exposure, type WindProject,
} from '../../codes/cirsoc102/wind';
import { windLoadCases, type WindAxis, type WindCaseSet, type WindLevel } from './wind-cases';
import { SERVICE_WIND_FACTOR, type ServiceRecurrence } from '../../codes/cirsoc102/wind';
import { snowLoadCases } from './snow-loads';
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

// ─── Model slice ─────────────────────────────────────────────────

export interface LoadModelData {
  nodes: Map<number, { id: number; x: number; y: number; z?: number }>;
  elements: Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number }>;
  sections: Map<number, { id: number; a: number }>;
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
    /** Wind from −X and −Y as well. Absent: true. */
    bothSenses?: boolean;
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
}

// ─── Plan ────────────────────────────────────────────────────────

export interface PlannedCase {
  /** Existing case id when one matches, else null → a new case is needed. */
  existingId: number | null;
  type: 'D' | 'L' | 'Lr' | 'S' | 'W' | 'Wa' | 'E';
  /** i18n key for the case name. */
  nameKey: string;
  nameParams?: Record<string, string | number>;
}

export interface PlannedDistributed {
  elementId: number;
  caseType: PlannedCase['type'];
  /** Index into `LoadPlan.cases` when a type has several cases (wind, seismic). */
  caseIndex?: number;
  /** Local-z line load, kN/m, negative downward. */
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
const R102 = (c: string, l?: string) => clause('cirsoc-102', '2025', c, l);

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
  let skipped = 0;
  for (const el of model.elements.values()) {
    const nI = model.nodes.get(el.nodeI);
    const nJ = model.nodes.get(el.nodeJ);
    const sec = model.sections.get(el.sectionId);
    const mat = model.materials.get(el.materialId);
    if (!nI || !nJ || !sec || !mat || !(sec.a > 0) || !(mat.rho > 0)) { skipped++; continue; }
    const L = Math.hypot(nJ.x - nI.x, nJ.y - nI.y, elevationOf(nJ) - elevationOf(nI));
    const w = sec.a * L * mat.rho;
    for (const id of [el.nodeI, el.nodeJ]) {
      const lv = levelOfNode.get(id);
      if (lv !== undefined) weights[lv] += w / 2;
    }
  }
  return { weights, skipped };
}

/** True when a member is close enough to horizontal to carry an area load. */
function isBeamLike(
  model: LoadModelData, el: { nodeI: number; nodeJ: number },
): { ok: boolean; length: number } {
  const nI = model.nodes.get(el.nodeI);
  const nJ = model.nodes.get(el.nodeJ);
  if (!nI || !nJ) return { ok: false, length: 0 };
  const dx = nJ.x - nI.x, dy = nJ.y - nI.y, dz = elevationOf(nJ) - elevationOf(nI);
  const L = Math.hypot(dx, dy, dz);
  if (L < 0.01) return { ok: false, length: 0 };
  return { ok: Math.abs(dz) / L <= 0.5, length: L };
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
    outcome: 'BLOCKED', cases: [], distributed: [], nodal: [], combinations: [],
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

  // ── Distributed dead + live on beam-like members ──
  const distributed: PlannedDistributed[] = [];
  for (const el of input.model.elements.values()) {
    const { ok } = isBeamLike(input.model, el);
    if (!ok) continue;
    const qDead = -deadTotal * input.tributaryWidth;
    const qLive = -liveDesign * input.tributaryWidth;
    if (Math.abs(qDead) > 1e-3) distributed.push({ elementId: el.id, caseType: 'D', q: qDead });
    if (Math.abs(qLive) > 1e-3) distributed.push({ elementId: el.id, caseType: 'L', q: qLive });
  }

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

  const levels: LevelMass[] = levelsRaw.map((lv, i) => {
    const superimposed = deadTotal * lv.planAreaM2;
    const liveTotal = lo * lv.planAreaM2;
    const liveP = liveTotal * participation.value;
    return {
      elevation: lv.elevation, nodeIds: lv.nodeIds, planAreaM2: lv.planAreaM2,
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

  // ── Wind ──
  const nodal: PlannedNodal[] = [];
  const windAxes: WindAxis[] = [];
  let windQh: ProvenancedValue<number> | undefined;
  if (input.wind?.enabled) {
    const elevations = levels.map((l) => l.elevation);
    const h = Math.max(...elevations, 0);
    const xs = [...input.model.nodes.values()].map((n) => n.x);
    const ys = [...input.model.nodes.values()].map((n) => n.y);
    const bx = Math.max(...xs) - Math.min(...xs);
    const by = Math.max(...ys) - Math.min(...ys);

    /** The wind on each axis at basic speed `speed`; `service` for Wa (no minimum, no derivation). */
    const axesFor = (speed: number, service: boolean): WindAxis[] => {
      const out: WindAxis[] = [];
      for (const [dir, enabled, along, across] of [
        ['x', input.wind!.directions.x, bx, by],
        ['y', input.wind!.directions.y, by, bx],
      ] as const) {
        if (!enabled) continue;
        const project: WindProject = {
          basicSpeed: speed, exposure: input.wind!.exposure,
          siteAltitudeM: input.wind!.siteAltitudeM, kzt: input.wind!.kzt,
          kztSurveyed: input.wind!.kztSurveyed, structureKind: 'building',
          enclosure: input.wind!.enclosure, meanRoofHeight: Math.max(h, 1),
          L: Math.max(along, 1), B: Math.max(across, 1),
          roofSlopeDeg: input.wind!.roofSlopeDeg, rigid: input.wind!.rigid,
        };
        const res = computeWindPressures(project);
        if (!service) {
          refs.push(...res.factors.kd.refs, ...res.factors.kh.refs);
          assumptions.push(...res.assumptions);
          unsupportedKeys.push(...res.unsupported);
        }

        if (res.pressures.length === 0) continue;
        if (!service) windQh = fromProject(res.qhNm2, 'N/m²');

        /*
         * Windward + leeward on each level, distributed over that level's nodes.
         *
         * The windward wall sees q_z, which grows with height (§2.4.1); the leeward wall
         * sees q_h everywhere. The internal pressure acts on both walls and cancels in the
         * net lateral force. This used to take the windward row evaluated at
         * z = min(5 m, h) and apply it at every level, so the upper storeys of anything
         * taller than 5 m got the base's pressure: about 40 % short at the top of a 30 m
         * building in exposure B. Each level's band is now integrated over its own heights.
         */
        const cpWw = res.pressures.find((p) => p.surface === 'windwardWall')?.cp ?? 0;
        const cpLw = res.pressures.find((p) => p.surface === 'leewardWall')?.cp ?? 0;
        const qz = (z: number) => velocityPressure(Math.max(z, 0), project);
        /** Net lateral pressure on the band [z0, z1], averaged over it, kPa. */
        const bandNet = (z0: number, z1: number) => {
          if (z1 <= z0) return (qz(z0) * G_RIGID * cpWw - res.qhNm2 * G_RIGID * cpLw) / 1000;
          // Simpson over the band: q_z is smooth in z (a power law of height past 5 m).
          const n = 8, hh = (z1 - z0) / n;
          let sum = qz(z0) + qz(z1);
          for (let k = 1; k < n; k++) sum += (k % 2 ? 4 : 2) * qz(z0 + k * hh);
          const meanQz = (sum * hh / 3) / (z1 - z0);
          return (meanQz * G_RIGID * cpWw - res.qhNm2 * G_RIGID * cpLw) / 1000;
        };
        const net = bandNet(h, h);   // kPa, at the roof: what the summary line reports

        const elevated = levels.filter((l) => l.elevation > 0);
        const windLevels: WindLevel[] = [];
        for (let i = 0; i < elevated.length; i++) {
          const lv = elevated[i];
          const below = i === 0 ? 0 : elevated[i - 1].elevation;
          const above = i === elevated.length - 1 ? lv.elevation : elevated[i + 1].elevation;
          // The lower half of the first storey goes straight to the foundation, as before.
          const z0 = (below + lv.elevation) / 2;
          const z1 = (lv.elevation + above) / 2;
          const tribH = z1 - z0;
          const levelNet = bandNet(z0, z1);
          const force = levelNet * across * tribH;
          if (!service) derivation.push(msg('loadPlan.derivation.windLevel', {
            dir: dir.toUpperCase(), level: round(lv.elevation, 2),
            z0: round(z0, 2), z1: round(z1, 2), net: round(levelNet, 3), force: round(force, 1),
          }));
          const min = applyMinimumWindLoad(force * 1000, across * tribH, 0);
          const applied = min.totalN / 1000;
          if (!service && min.governedByMinimum) {
            unsupportedKeys.push(msg('loadPlan.note.windMinimumGoverns', {
              level: round(lv.elevation, 2),
            }));
            refs.push(...min.refs);
          }
          // §2.1.5's minimum is a design load; service wind (Wa) is the pressures alone.
          windLevels.push({ elevation: lv.elevation, nodeIds: lv.nodeIds, force: service ? force : applied, pressureForce: force });
        }
        out.push({
          axis: dir, across, along, levels: windLevels, project, qhNm2: res.qhNm2,
          gcpi: internalPressureCoefficient(input.wind!.enclosure),
        });
        if (!service) derivation.push(msg('loadPlan.derivation.wind', {
          dir: dir.toUpperCase(), qh: round(res.qhNm2, 0),
          net: round(net, 3), front: round(across, 1),
        }));
      }
      return out;
    };
    windAxes.push(...axesFor(input.wind.basicSpeed, false));
    if (windAxes.length > 0) {
      const set = input.wind.caseSet ?? 'all';
      const generated = windLoadCases({
        model: input.model, axes: windAxes, set, bothSenses: input.wind.bothSenses ?? true,
        tributaryWidth: input.tributaryWidth, speed: input.wind.basicSpeed,
      });
      unsupportedKeys.push(...generated.notes);
      refs.push(R102('2.4.6', 'casos de carga de viento de diseño'));
      derivation.push(msg('loadPlan.derivation.windCases', { set, count: generated.cases.length }));
      for (const c of generated.cases) {
        const index = cases.length;
        cases.push({ existingId: null, type: 'W', nameKey: c.nameKey, nameParams: c.nameParams });
        for (const n of c.nodal) nodal.push({ nodeId: n.nodeId, caseType: 'W', caseIndex: index, fx: n.fx, fy: n.fy, fz: 0, mz: n.mz });
        for (const d of c.distributed) distributed.push({ elementId: d.elementId, caseType: 'W', caseIndex: index, q: d.q });
      }
    }

    /*
     * Wa, for the service combinations of B.4.2: the same procedure at the speed of a shorter
     * recurrence, the 50-year speed of Figura C AB.4.2-1 times its conversion factor. Case 1 in
     * each direction and sense: the torsional and simultaneous cases are for strength.
     */
    const sw = input.wind.service;
    if (sw?.enabled && sw.v50 > 0) {
      const factor = SERVICE_WIND_FACTOR[sw.mri];
      const speed = sw.v50 * factor;
      const waAxes = axesFor(speed, true);
      if (waAxes.length > 0) {
        const generated = windLoadCases({
          model: input.model, axes: waAxes, set: 'case1', bothSenses: input.wind.bothSenses ?? true,
          tributaryWidth: input.tributaryWidth, speed: round(speed, 1),
        });
        refs.push(R102('B.4.2', 'servicio'));
        derivation.push(msg('loadPlan.derivation.windService', { v50: sw.v50, mri: sw.mri, factor, v: round(speed, 1), count: generated.cases.length }));
        for (const c of generated.cases) {
          const index = cases.length;
          cases.push({ existingId: null, type: 'Wa', nameKey: c.nameKey.replace('windCase1', 'windCaseWa'), nameParams: { ...c.nameParams, mri: sw.mri } });
          for (const n of c.nodal) nodal.push({ nodeId: n.nodeId, caseType: 'Wa', caseIndex: index, fx: n.fx, fy: n.fy, fz: 0, mz: n.mz });
          for (const d of c.distributed) distributed.push({ elementId: d.elementId, caseType: 'Wa', caseIndex: index, q: d.q });
        }
      }
    }
  }

  // ── Snow ──
  let snowPlanned = false;
  if (input.snow?.enabled) {
    const sn = input.snow;
    const out = snowLoadCases({ model: input.model, snow: sn, tributaryWidth: input.tributaryWidth });
    if (!out) {
      unsupportedKeys.push(msg('snow.note.noRoof'));
    } else if (out.result.refused) {
      blockedKeys.push(msg(out.result.refused));
    } else {
      const r = out.result;
      refs.push(...r.refs);
      derivation.push(msg('snow.derivation.pf', {
        pg: round(sn.pg, 2), source: sn.source, ce: r.ce, ct: r.ct, i: r.importance,
        pf: round(r.pfComputed, 3),
      }));
      if (r.pfMinimum !== null) derivation.push(msg('snow.derivation.minimum', { min: round(r.pfMinimum, 3), pf: round(r.pf, 3) }));
      derivation.push(msg('snow.derivation.ps', {
        slope: round(sn.roofSlopeDeg ?? out.geometry.slopeDeg, 1), cs: round(r.cs, 3), ps: round(r.ps, 3),
        w: round(out.geometry.W, 2),
      }));
      if (r.rainOnSnow > 0) derivation.push(msg('snow.derivation.rain', { add: round(r.rainOnSnow, 3) }));
      if (r.unbalanced) {
        derivation.push(msg('snow.derivation.unbalanced', {
          leeward: round(r.unbalanced.leeward, 3), windward: round(r.unbalanced.windward, 3),
        }));
      }
      if ((sn.roofSlopeDeg ?? out.geometry.slopeDeg) < 1.2) unsupportedKeys.push(msg('snow.note.ponding'));
      unsupportedKeys.push(msg('snow.note.notCovered'));
      for (const c of out.cases) {
        const index = cases.length;
        cases.push({ existingId: null, type: 'S', nameKey: c.nameKey, nameParams: c.nameParams });
        for (const d of c.distributed) distributed.push({ elementId: d.elementId, caseType: 'S', caseIndex: index, q: d.q });
        for (const n of c.nodal) nodal.push({ nodeId: n.nodeId, caseType: 'S', caseIndex: index, fx: n.fx, fy: n.fy, fz: n.fz });
        snowPlanned = true;
      }
    }
  }

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
      L: true, Lr: false, S: snowPlanned, R: false,
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
    if (set !== 'service') {
      combinations = generateCombinations(ci);
      const exc = liveLoadFactorInCompanion(ci);
      if (exc.note) derivation.push(exc.note);
      refs.push(R101('2.3.2', 'combinaciones básicas'));
    }
    if (set !== 'ultimate') combinations = [...combinations, ...generateServiceCombinations(ci)];
    derivation.push(msg('loadPlan.derivation.combinationCount', { count: combinations.length }));
  }

  return {
    outcome: 'READY',
    cases, distributed, nodal, combinations,
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

// ─── Delta, for the before/after preview ─────────────────────────

/**
 * How many combinations applying the plan adds: a combination with a wind or seismic term
 * becomes one per direction the plan has a case for (`combination-cases.ts`).
 */
function plannedCombinationCount(plan: LoadPlan): number {
  const per = (sym: string) => plan.cases.filter((c) => c.type === sym).length;
  return plan.combinations.reduce((n, c) => {
    const alt = c.terms.find((t) => t.factor !== 0 && (t.symbol === 'W' || t.symbol === 'E'));
    return n + (alt ? Math.max(1, per(alt.symbol)) : 1);
  }, 0);
}


/**
 * What happens to one load case type when the plan is applied.
 *
 * This type exists because the preview used to lie. It reported `after` as the plan's own
 * counts, which is only true when the user has ticked "replace existing loads"; with the
 * box clear, applying a 28-load plan to a model that already had 28 leaves 56, not 28. And
 * a model carrying W and E cases from an earlier run, re-planned with wind and seismic
 * switched off, silently lost every combination that referenced them — the plan simply
 * stopped mentioning them and nothing said so.
 *
 * So every case type present before or after now gets an explicit disposition, and the
 * preview is a function of the replace flag rather than of wishful thinking.
 */
export type CaseAction =
  /** The plan creates this case; the model had none. */
  | 'created'
  /** The plan regenerates loads into a case that already exists. */
  | 'regenerated'
  /**
   * The model has this case, the plan does not produce it, and replace is OFF — so its
   * loads survive untouched. Combinations that referenced it are still regenerated
   * without it, which is why this is reported rather than passed over.
   */
  | 'retained'
  /** The model has this case, the plan does not produce it, and replace is ON: deleted. */
  | 'cleared';

export interface CaseDisposition {
  caseType: string;
  action: CaseAction;
  /** Why — always present, so no disposition is unexplained. */
  reason: EngineMessage;
  /** True when the user loses data or a case stops participating in combinations. */
  lossy: boolean;
}

export interface PlanDelta {
  /** Loads the model currently has, by case type. */
  before: { distributed: number; nodal: number; combinations: number; cases: string[] };
  /** Loads the model WILL have. Accounts for the replace flag. */
  after: { distributed: number; nodal: number; combinations: number; cases: string[] };
  /** New case types the plan introduces. */
  addedCaseTypes: string[];
  /** Case types the plan no longer produces. */
  removedCaseTypes: string[];
  /** One entry per case type touched, added or left behind. Never elides one. */
  dispositions: CaseDisposition[];
  /** Dispositions a user must see before applying. Rendered as warnings, not notes. */
  warnings: EngineMessage[];
  /** True when the plan changes anything at all. */
  changes: boolean;
  /** Echo of the flag the counts were computed under. */
  replaceExisting: boolean;
}

export interface CurrentLoadState {
  distributed: number;
  nodal: number;
  combinations: number;
  caseTypes: string[];
  /** Existing load counts per case type. Enables an honest `after` when replace is off. */
  perCaseType?: Record<string, { distributed: number; nodal: number }>;
}

/**
 * The before/after the user sees, computed under the flag they actually have set.
 *
 * `replaceExisting` is not optional: getting it wrong is the defect this signature exists
 * to prevent, so a caller has to state it.
 */
export function describePlanDelta(
  plan: LoadPlan,
  current: CurrentLoadState,
  options: { replaceExisting: boolean },
): PlanDelta {
  const replace = options.replaceExisting;
  const afterTypes = [...new Set(plan.cases.map((c) => String(c.type)))].sort();
  const beforeTypes = [...new Set(current.caseTypes)].sort();
  const added = afterTypes.filter((t) => !beforeTypes.includes(t));
  const removed = beforeTypes.filter((t) => !afterTypes.includes(t));

  const dispositions: CaseDisposition[] = [];
  for (const t of afterTypes) {
    const existed = beforeTypes.includes(t);
    dispositions.push({
      caseType: t,
      action: existed ? 'regenerated' : 'created',
      reason: msg(existed
        ? 'loadPlan.disposition.regenerated'
        : 'loadPlan.disposition.created', { caseType: t }),
      // Regenerating into a case that keeps its old loads doubles them up. Say so.
      lossy: existed && !replace,
    });
  }
  for (const t of removed) {
    dispositions.push({
      caseType: t,
      action: replace ? 'cleared' : 'retained',
      reason: msg(replace
        ? 'loadPlan.disposition.cleared'
        : 'loadPlan.disposition.retained', { caseType: t }),
      lossy: true,
    });
  }
  dispositions.sort((a, b) => a.caseType.localeCompare(b.caseType));

  // Counts. With replace ON the plan is the whole model; with it OFF the plan is added to
  // what is there, except combinations, which are always regenerated wholesale.
  const after = replace
    ? {
        distributed: plan.distributed.length, nodal: plan.nodal.length,
        combinations: plannedCombinationCount(plan), cases: afterTypes,
      }
    : {
        distributed: current.distributed + plan.distributed.length,
        nodal: current.nodal + plan.nodal.length,
        combinations: current.combinations + plannedCombinationCount(plan),
        cases: [...new Set([...beforeTypes, ...afterTypes])].sort(),
      };

  const warnings: EngineMessage[] = [];
  for (const t of removed) {
    // The load case is one thing; its participation in the combinations is another, and
    // that participation ends either way. That is the part users were not being told.
    warnings.push(msg(replace
      ? 'loadPlan.warning.caseCleared'
      : 'loadPlan.warning.caseRetainedNotCombined', { caseType: t }));
  }
  if (!replace) {
    const duplicated = afterTypes.filter((t) => beforeTypes.includes(t));
    if (duplicated.length > 0) {
      warnings.push(msg('loadPlan.warning.addedOnTopOfExisting', {
        cases: duplicated.join(', '), count: duplicated.length,
      }));
    }
  }

  return {
    before: {
      distributed: current.distributed, nodal: current.nodal,
      combinations: current.combinations, cases: beforeTypes,
    },
    after, addedCaseTypes: added, removedCaseTypes: removed,
    dispositions, warnings, replaceExisting: replace,
    changes: current.distributed !== after.distributed
      || current.nodal !== after.nodal
      || current.combinations !== after.combinations
      || added.length > 0 || removed.length > 0,
  };
}

/** Symbols a combination references, for mapping onto real case ids at apply time. */
export function combinationSymbols(spec: LoadCombinationSpec): LoadSymbol[] {
  return spec.terms.map((t) => t.symbol);
}
