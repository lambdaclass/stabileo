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
import {
  findOccupancy, reduceLiveLoad,
  type ElementKind, type OccupancyEntry,
} from '../../codes/cirsoc101/live-loads';
import {
  applyMinimumWindLoad, computeWindPressures, netAlongWindPressureAt,
  type Enclosure, type Exposure, type WindProject,
} from '../../codes/cirsoc102/wind';
import {
  assumed, clause, fromProject, type ClauseRef, type ProvenancedValue,
} from '../../codes/regulation';
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
  /** i18n key naming the component, e.g. 'autoLoad.dead.screed'. */
  labelKey: string;
  /** Area load, kPa. */
  q: number;
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
  };
  seismic?: {
    enabled: boolean;
    /** Design seismic coefficient C, dimensionless — from the seismic role. */
    coefficient: number;
    /** Fraction of the imposed load in the seismic weight; null → recorded assumption. */
    liveParticipation: number | null;
    directions: { x: boolean; y: boolean };
  };
  generateCombinations: boolean;
}

// ─── Plan ────────────────────────────────────────────────────────

export interface PlannedCase {
  /** Existing case id when one matches, else null → a new case is needed. */
  existingId: number | null;
  type: 'D' | 'L' | 'Lr' | 'W' | 'E';
  /** i18n key for the case name. */
  nameKey: string;
  nameParams?: Record<string, string | number>;
}

export interface PlannedDistributed {
  elementId: number;
  caseType: PlannedCase['type'];
  /** Local-z line load, kN/m, negative downward. */
  q: number;
}

export interface PlannedNodal {
  nodeId: number;
  caseType: PlannedCase['type'];
  fx: number;
  fy: number;
  fz: number;
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

  const participation: ProvenancedValue<number> = input.seismic?.liveParticipation !== null
    && input.seismic?.liveParticipation !== undefined
    ? fromProject(input.seismic.liveParticipation)
    : assumed(0.25, msg('loadPlan.assumption.liveParticipation', { fraction: 0.25 }),
        [clause('inpres-cirsoc-103-i', '2018', '6.2', 'peso sísmico efectivo')]);
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
  let windQh: ProvenancedValue<number> | undefined;
  if (input.wind?.enabled) {
    const elevations = levels.map((l) => l.elevation);
    const h = Math.max(...elevations, 0);
    const xs = [...input.model.nodes.values()].map((n) => n.x);
    const ys = [...input.model.nodes.values()].map((n) => n.y);
    const bx = Math.max(...xs) - Math.min(...xs);
    const by = Math.max(...ys) - Math.min(...ys);

    for (const [dir, enabled, along, across] of [
      ['x', input.wind.directions.x, bx, by],
      ['y', input.wind.directions.y, by, bx],
    ] as const) {
      if (!enabled) continue;
      const project: WindProject = {
        basicSpeed: input.wind.basicSpeed, exposure: input.wind.exposure,
        siteAltitudeM: input.wind.siteAltitudeM, kzt: input.wind.kzt,
        kztSurveyed: input.wind.kztSurveyed, structureKind: 'building',
        enclosure: input.wind.enclosure, meanRoofHeight: Math.max(h, 1),
        L: Math.max(along, 1), B: Math.max(across, 1),
        roofSlopeDeg: input.wind.roofSlopeDeg, rigid: input.wind.rigid,
      };
      const res = computeWindPressures(project);
      refs.push(...res.factors.kd.refs, ...res.factors.kh.refs);
      assumptions.push(...res.assumptions);
      unsupportedKeys.push(...res.unsupported);

      if (res.pressures.length === 0) continue;
      windQh = fromProject(res.qhNm2, 'N/m²');

      // Windward + leeward on each level, distributed over that level's nodes.
      //
      // Sampled PER LEVEL: the windward velocity pressure grows with height, so taking one
      // sample and reusing it for every storey under-predicts wind everywhere above it. The
      // net pressure is asked of the code layer rather than assembled from the surface list
      // here, so the height rule has exactly one implementation.
      const elevated = levels.filter((l) => l.elevation > 0);
      for (let i = 0; i < elevated.length; i++) {
        const lv = elevated[i];
        const below = i === 0 ? 0 : elevated[i - 1].elevation;
        const above = i === elevated.length - 1 ? lv.elevation : elevated[i + 1].elevation;
        const tribH = (lv.elevation - below) / 2 + (above - lv.elevation) / 2;
        const net = netAlongWindPressureAt(lv.elevation, project) / 1000;   // kPa
        const force = net * across * tribH;
        const min = applyMinimumWindLoad(force * 1000, across * tribH, 0);
        const applied = min.totalN / 1000;
        if (min.governedByMinimum) {
          unsupportedKeys.push(msg('loadPlan.note.windMinimumGoverns', {
            level: round(lv.elevation, 2),
          }));
          refs.push(...min.refs);
        }
        const per = applied / Math.max(1, lv.nodeIds.length);
        for (const id of lv.nodeIds) {
          nodal.push({
            nodeId: id, caseType: 'W',
            fx: dir === 'x' ? per : 0, fy: dir === 'y' ? per : 0, fz: 0,
          });
        }
      }
      cases.push({
        existingId: findCase(input.model, 'W', dir.toUpperCase()),
        type: 'W', nameKey: 'autoLoad.windCaseDir',
        nameParams: { dir: dir.toUpperCase(), v: input.wind.basicSpeed },
      });
      // The reported net is the one at the mean roof height — the largest of the profile,
      // and the one that pairs with the q_h printed beside it. Levels below it received
      // less, which is the point of sampling per level.
      derivation.push(msg('loadPlan.derivation.wind', {
        dir: dir.toUpperCase(), qh: round(res.qhNm2, 0),
        net: round(netAlongWindPressureAt(project.meanRoofHeight, project) / 1000, 3),
        front: round(across, 1),
      }));
    }
  }

  // ── Seismic, from the real level masses ──
  let seismicWeight: ProvenancedValue<number> | undefined;
  let baseShear: ProvenancedValue<number> | undefined;
  if (input.seismic?.enabled) {
    const elevated = levels.filter((l) => l.elevation > 0 && l.weightKN > 0);
    const W = elevated.reduce((s, l) => s + l.weightKN, 0);
    if (W <= 0) {
      unsupportedKeys.push(msg('loadPlan.unsupported.noSeismicMass'));
    } else {
      const C = input.seismic.coefficient;
      const V0 = C * W;
      seismicWeight = fromProject(W, 'kN');
      baseShear = fromProject(V0, 'kN');
      const sumWh = elevated.reduce((s, l) => s + l.weightKN * l.elevation, 0);
      refs.push(clause('inpres-cirsoc-103-i', '2018', '6.2.4.1', 'distribución en altura'));
      for (const lv of elevated) {
        const Fk = sumWh > 0 ? (lv.weightKN * lv.elevation * V0) / sumWh : 0;
        const per = Fk / Math.max(1, lv.nodeIds.length);
        for (const id of lv.nodeIds) {
          if (input.seismic.directions.x) {
            nodal.push({ nodeId: id, caseType: 'E', fx: per, fy: 0, fz: 0 });
          }
          if (input.seismic.directions.y) {
            nodal.push({ nodeId: id, caseType: 'E', fx: 0, fy: per, fz: 0 });
          }
        }
      }
      if (input.seismic.directions.x) {
        cases.push({ existingId: findCase(input.model, 'E', 'X'), type: 'E',
          nameKey: 'autoLoad.seismicCaseDir', nameParams: { dir: 'X' } });
      }
      if (input.seismic.directions.y) {
        cases.push({ existingId: findCase(input.model, 'E', 'Y'), type: 'E',
          nameKey: 'autoLoad.seismicCaseDir', nameParams: { dir: 'Y' } });
      }
      derivation.push(msg('loadPlan.derivation.seismic', {
        weight: round(W, 1), coefficient: round(C, 4), baseShear: round(V0, 1),
      }));
    }
  }

  // ── Combinations from the basis role ──
  let combinations: LoadCombinationSpec[] = [];
  if (input.generateCombinations) {
    const present: CombinationInputs['present'] = {
      L: true, Lr: false, S: false, R: false,
      W: !!input.wind?.enabled && nodal.some((n) => n.caseType === 'W'),
      E: !!input.seismic?.enabled && nodal.some((n) => n.caseType === 'E'),
      F: false, H: false,
    };
    const ci: CombinationInputs = {
      present, maxLoKNm2: lo,
      hasGarageOrPublicAssembly: occ.garageOrPublicAssembly === true,
    };
    combinations = generateCombinations(ci);
    const exc = liveLoadFactorInCompanion(ci);
    if (exc.note) derivation.push(exc.note);
    refs.push(R101('2.3.2', 'combinaciones básicas'));
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
    assumptions: dedupeMessages(assumptions),
    unsupportedKeys, refs, derivation, blockedKeys: [],
  };
}

// ─── Delta, for the before/after preview ─────────────────────────

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
        combinations: plan.combinations.length, cases: afterTypes,
      }
    : {
        distributed: current.distributed + plan.distributed.length,
        nodal: current.nodal + plan.nodal.length,
        combinations: current.combinations + plan.combinations.length,
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
