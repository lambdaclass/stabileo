/**
 * Staged, constructability-first optimization objective.
 *
 * Design: LEXICOGRAPHIC on the properties an engineer will not trade away, with a
 * bounded WEIGHTED scalar only inside the final stage. Pure weighting hides
 * constructability behind steel area; pure lexicographic ordering over-constrains
 * and produces absurd single-diameter results.
 *
 *   Stage 0 (hard filter)   code-legal AND fits AND verifies  — binary, not scored
 *   Stage 1 (lexicographic) 1. fewer layers
 *                           2. fewer distinct diameters
 *                           3. no non-standard steps
 *   Stage 2 (weighted)      0.45·steel + 0.25·congestion
 *                           + 0.20·arrangements + 0.10·spacing practicality
 *   Stage 3 (tie-break)     candidate enumeration index — total and reproducible
 *
 * Results are described as "best found within a bounded search", never "optimal".
 *
 * Pure: no store access, no side effects.
 */

import { REBAR_DB } from '../codes/argentina/cirsoc201';
import type { ProvidedReinforcement, RebarLayer } from '../../store/model.svelte';
import type { CandidateCost } from './outcome';
import { resolveLayers, layersTotalArea, resolveColumnReinf } from '../station-design-forces';

/** Standard longitudinal diameters, ascending. Anything else is a non-standard step. */
export const STANDARD_LONG_DIAS = REBAR_DB.filter(r => r.diameter >= 10).map(r => r.diameter);
/** Standard stirrup/tie diameters, ascending. */
export const STANDARD_STIRRUP_DIAS = REBAR_DB.filter(r => r.diameter <= 12).map(r => r.diameter);
/** Stirrup spacings are placed on a 25 mm grid. */
export const SPACING_GRID = 0.025;
/** Steel density (kg/m³). */
const STEEL_RHO = 7850;

export interface ObjectiveSpec {
  weights: { steel: number; congestion: number; arrangements: number; spacing: number };
  /** Normalisation denominators keep the weighted scalar in a comparable range. */
  norm: { steelKg: number; congestion: number; arrangements: number };
}

export const DEFAULT_OBJECTIVE: ObjectiveSpec = {
  weights: { steel: 0.45, congestion: 0.25, arrangements: 0.20, spacing: 0.10 },
  norm: { steelKg: 400, congestion: 8, arrangements: 6 },
};

function areaOf(dia: number): number {
  return REBAR_DB.find(r => r.diameter === dia)?.area ?? Math.PI * (dia / 20) ** 2 / 4;
}

function layerDias(layers: RebarLayer[]): number[] {
  return layers.map(l => l.diameter);
}

/** Total longitudinal steel area (cm²) across every region of a candidate. */
export function candidateSteelArea(reinf: ProvidedReinforcement): number {
  let total = 0;
  const reg = reinf.regions;
  if (reg) {
    total += layersTotalArea(resolveLayers(reg.bottomSpanLayers, reg.bottomSpan ?? reinf.bottom));
    total += layersTotalArea(resolveLayers(reg.topStartLayers, reg.topStart ?? reinf.top));
    total += layersTotalArea(resolveLayers(reg.topEndLayers, reg.topEnd ?? reinf.top));
  }
  const col = resolveColumnReinf(reinf.column, reinf.longitudinal);
  if (col) total += col.totalCount * areaOf(col.cornerDia);
  return total;
}

/** Approximate steel mass (kg) — longitudinal bars over the member length only.
 *  Transverse steel is intentionally excluded: it is dominated by the spacing term
 *  and including it would double-count the spacing objective. */
export function candidateSteelMass(reinf: ProvidedReinforcement, L: number): number {
  return candidateSteelArea(reinf) * 1e-4 * Math.max(L, 0) * STEEL_RHO;
}

export interface CostInputs {
  /** Member length (m). */
  L: number;
  /** Count of spacing/congestion issues reported by the layout checks. */
  layoutIssues: number;
  /** Number of distinct reinforcement arrangements the member introduces. */
  arrangements: number;
  /** Every stirrup/tie spacing used, in m. */
  spacings: number[];
  objective?: ObjectiveSpec;
}

export function computeCandidateCost(reinf: ProvidedReinforcement, inp: CostInputs): CandidateCost {
  const spec = inp.objective ?? DEFAULT_OBJECTIVE;
  const reg = reinf.regions;

  const allLayerSets: RebarLayer[][] = [];
  if (reg) {
    allLayerSets.push(resolveLayers(reg.bottomSpanLayers, reg.bottomSpan ?? reinf.bottom));
    allLayerSets.push(resolveLayers(reg.topStartLayers, reg.topStart ?? reinf.top));
    allLayerSets.push(resolveLayers(reg.topEndLayers, reg.topEnd ?? reinf.top));
  }
  const layers = allLayerSets.reduce((m, s) => Math.max(m, s.length), 0);

  const dias = new Set<number>();
  for (const s of allLayerSets) for (const d of layerDias(s)) dias.add(d);
  const col = resolveColumnReinf(reinf.column, reinf.longitudinal);
  if (col) { dias.add(col.cornerDia); if (reinf.column) dias.add(reinf.column.faceDia); }

  let nonStandardSteps = 0;
  for (const d of dias) if (!STANDARD_LONG_DIAS.includes(d)) nonStandardSteps++;
  for (const s of inp.spacings) {
    if (Math.abs(Math.round(s / SPACING_GRID) * SPACING_GRID - s) > 1e-6) nonStandardSteps++;
  }
  const stirDias = [
    reg?.stirrupsSupport?.diameter, reg?.stirrupsSpan?.diameter, reinf.stirrups?.diameter,
  ].filter((d): d is number => d !== undefined);
  for (const d of stirDias) if (!STANDARD_STIRRUP_DIAS.includes(d)) nonStandardSteps++;

  const steelMassKg = candidateSteelMass(reinf, inp.L);
  // Practicality: tight spacings are harder to place; reward >= 100 mm.
  const spacingPracticality = inp.spacings.length === 0
    ? 0
    : inp.spacings.reduce((acc, s) => acc + Math.max(0, (0.10 - s) / 0.10), 0) / inp.spacings.length;

  const weighted =
    spec.weights.steel * clamp01(steelMassKg / spec.norm.steelKg) +
    spec.weights.congestion * clamp01(inp.layoutIssues / spec.norm.congestion) +
    spec.weights.arrangements * clamp01(inp.arrangements / spec.norm.arrangements) +
    spec.weights.spacing * clamp01(spacingPracticality);

  return {
    layers,
    distinctDiameters: dias.size,
    nonStandardSteps,
    steelMassKg: +steelMassKg.toFixed(3),
    congestion: inp.layoutIssues,
    arrangementCount: inp.arrangements,
    spacingPracticality: +spacingPracticality.toFixed(4),
    weighted: +weighted.toFixed(6),
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Total ordering over passing candidates. Returns < 0 when `a` is preferred.
 * Deterministic: every comparison bottoms out in the enumeration index.
 */
export function compareCandidates(
  a: { cost: CandidateCost; index: number },
  b: { cost: CandidateCost; index: number },
): number {
  // Stage 1 — lexicographic constructability
  if (a.cost.layers !== b.cost.layers) return a.cost.layers - b.cost.layers;
  if (a.cost.distinctDiameters !== b.cost.distinctDiameters) return a.cost.distinctDiameters - b.cost.distinctDiameters;
  if (a.cost.nonStandardSteps !== b.cost.nonStandardSteps) return a.cost.nonStandardSteps - b.cost.nonStandardSteps;
  // Stage 2 — weighted scalar
  if (Math.abs(a.cost.weighted - b.cost.weighted) > 1e-9) return a.cost.weighted - b.cost.weighted;
  // Stage 3 — enumeration index (total, reproducible)
  return a.index - b.index;
}

/**
 * Ordering over FAILING candidates, to choose the provisional one retained for
 * review (O3): fewest failing checks, then lowest utilization, then cost.
 */
export function compareFailures(
  a: { failingCheckCount: number; worstUtilization: number; cost: CandidateCost; index: number },
  b: { failingCheckCount: number; worstUtilization: number; cost: CandidateCost; index: number },
): number {
  if (a.failingCheckCount !== b.failingCheckCount) return a.failingCheckCount - b.failingCheckCount;
  const au = Number.isFinite(a.worstUtilization) ? a.worstUtilization : Number.MAX_VALUE;
  const bu = Number.isFinite(b.worstUtilization) ? b.worstUtilization : Number.MAX_VALUE;
  if (Math.abs(au - bu) > 1e-9) return au - bu;
  return compareCandidates(a, b);
}
