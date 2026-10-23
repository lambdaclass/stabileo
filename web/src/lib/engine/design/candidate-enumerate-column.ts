/**
 * Deterministic bounded column candidate enumeration.
 *
 * The previous generator sized column steel from a non-code heuristic
 * (`flexAs + 0.5·axialAs`) evaluated on a hardcoded Mz that was ~6 kN·m while the
 * real moment was ~973 kN·m, then "checked" it with a straight-line interaction
 * whose φMn ignored axial force entirely. 112 of 160 columns in the flagship
 * example received only 4Ø32 (the 1%-Ag minimum) and the authoritative verifier
 * put them at utilization 7.69.
 *
 * This enumerator instead walks symmetric 4-corner + per-face arrangements in a
 * deterministic order and lets the AUTHORITATIVE strain-compatible P-M verifier
 * decide. ρ limits and tie-spacing rules are enforced at generation time on the
 * arrangement that will actually be assigned, not on a pre-rounding count.
 *
 * Pure: no store access, no side effects.
 */

import type { RegulationEdition } from '../../codes/regulation';
import { columnTieSpacing } from '../../codes/cirsoc201/transverse-spacing';
import { minClearSpacingColumn } from '../../codes/cirsoc201/spacing';
import { repeatedCageLapClearance } from '../detailing/column-lap-geometry';
import { REBAR_DB } from '../codes/argentina/cirsoc201';
import type { ProvidedReinforcement, StirrupDef } from '../../store/model.svelte';
import { computeColumnLayout } from '../station-design-forces';
import type { MemberContext } from './member-context';
import { grossAreaOf, minClear, shapedBarPositions, type ColumnShape } from './shaped-column';
import { DESIGN_TARGET_UTILIZATION } from './outcome';
import { STANDARD_LONG_DIAS, STANDARD_STIRRUP_DIAS, SPACING_GRID, computeCandidateCost } from './objective';
import type { Candidate, CandidateFeedback, CandidateGenerator } from './candidate-generator';

export const COLUMN_LIMITS = {
  /** CIRSOC 201 §10.9.1 longitudinal steel ratio bounds. */
  rhoMin: 0.01,
  rhoMax: 0.08,
  maxPerFace: 6,
  maxLongOptions: 60,
  maxTieOptions: 24,
  minSpacing: 0.05,
  maxLegs: 4,
} as const;

function areaOf(dia: number): number {
  return REBAR_DB.find(r => r.diameter === dia)?.area ?? 0;
}

interface ColumnLongOption {
  dia: number;
  perFace: number;
  totalCount: number;
  area: number;
  rho: number;
  /** A repeated cage would crowd this lift's bars after its inward lap cranks. */
  lapTight: boolean;
}

/** Prefer room for lap cranks, then least steel, within the existing search bounds. */
export function buildColumnLongOptions(ctx: MemberContext): ColumnLongOption[] {
  const { b, h } = ctx.section;
  const Ag = b * h;
  if (Ag <= 0) return [];
  const { cover, stirrupDia } = ctx.material;
  const out: ColumnLongOption[] = [];
  for (const dia of ctx.material.longDiametersMm ?? STANDARD_LONG_DIAS) {
    const a = areaOf(dia);
    if (a <= 0) continue;
    for (let perFace = 0; perFace <= COLUMN_LIMITS.maxPerFace; perFace++) {
      const totalCount = 4 + 4 * perFace;
      const area = totalCount * a;
      const rho = area / (Ag * 1e4);
      if (rho < COLUMN_LIMITS.rhoMin - 1e-9) continue;
      if (rho > COLUMN_LIMITS.rhoMax + 1e-9) break; // higher perFace only grows rho
      // Congestion is a generation-time constraint, not an afterthought.
      const layout = computeColumnLayout(totalCount, dia, b, h, cover, stirrupDia, {
        cornerDia: dia, faceDia: dia, nBottom: perFace, nTop: perFace, nLeft: perFace, nRight: perFace,
      });
      if (!layout.constructible) continue;
      // The drawn lap cranks these bars inward. A cage fitting at its nominal perimeter
      // can lose the required spacing there (e.g. 28Ø16 in a 500 mm square). Try a roomier
      // seed first, without declaring the crowded option impossible.
      const lapClear = repeatedCageLapClearance(
        layout.bars.map(bar => ({ x: bar.x - b / 2, y: bar.y - h / 2 })), dia);
      const required = minClearSpacingColumn(ctx.codeEdition, {
        barDiameterMm: dia, maxAggregateSizeMm: ctx.material.maxAggregateSize.value,
      }).minClear;
      out.push({ dia, perFace, totalCount, area, rho, lapTight: lapClear < required - 1e-9 });
    }
  }
  // This orders trials only. Strength and the actual final detail remain authoritative.
  out.sort((x, y) => Number(x.lapTight) - Number(y.lapTight) || x.area - y.area || x.totalCount - y.totalCount || x.dia - y.dia);
  return out.slice(0, COLUMN_LIMITS.maxLongOptions);
}

/** Maximum tie spacing for the edition designed to (`columnTieSpacing`). */
export function maxTieSpacing(cornerDia: number, tieDia: number, b: number, h: number, edition: RegulationEdition): number {
  return columnTieSpacing(edition, cornerDia, tieDia, Math.min(b, h)).spacing;
}

/** Ordered tie options for a given longitudinal diameter. */
export function buildTieOptions(ctx: MemberContext, cornerDia: number): StirrupDef[] {
  const { b, h } = ctx.section;
  const out: StirrupDef[] = [];
  for (const dia of ctx.material.stirrupDiametersMm ?? STANDARD_STIRRUP_DIAS) {
    const sMax = maxTieSpacing(cornerDia, dia, b, h, ctx.codeEdition);
    if (sMax < COLUMN_LIMITS.minSpacing) continue;
    for (let legs = 2; legs <= COLUMN_LIMITS.maxLegs; legs += 2) {
      // The design target (O5) applies to the tie spacing too: c/25 against a 25,6 cm maximum
      // reads 0,977, near the limit, so the widest option offered is the one at or below 0,95.
      const atTarget = Math.floor((sMax * DESIGN_TARGET_UTILIZATION + 1e-9) / SPACING_GRID) * SPACING_GRID;
      const top = atTarget >= COLUMN_LIMITS.minSpacing - 1e-9 ? atTarget : Math.floor(sMax / SPACING_GRID) * SPACING_GRID;
      for (let s = top; s >= COLUMN_LIMITS.minSpacing - 1e-9; s -= SPACING_GRID) {
        out.push({ diameter: dia, legs, spacing: +s.toFixed(4) });
      }
    }
  }
  out.sort((x, y) => x.legs - y.legs || x.diameter - y.diameter || y.spacing - x.spacing);
  return out.slice(0, COLUMN_LIMITS.maxTieOptions);
}

type Knob = 'long' | 'tie';

/**
 * The project's denser end zones (`columnEndZones`): lo = max(largest side, clear height/6,
 * 450 mm), the clear height read as the member length, at half the spacing on the 25 mm grid and
 * not under 50 mm. Absent where the project does not ask for them.
 */
export function endZoneFor(ctx: MemberContext, spacing: number): ProvidedReinforcement['tieZones'] {
  if (!ctx.material.columnEndZones) return undefined;
  const endLength = +Math.max(Math.max(ctx.section.b, ctx.section.h), ctx.L / 6, 0.45).toFixed(3);
  const endSpacing = Math.max(COLUMN_LIMITS.minSpacing, Math.floor((spacing / 2) / SPACING_GRID + 1e-9) * SPACING_GRID);
  return { endLength, endSpacing: +endSpacing.toFixed(4) };
}

/** The least dimension a tie spacing reads on a shaped column: D, or the thinnest web. */
function shapedMinDim(shape: ColumnShape): number {
  return shape.kind === 'circle' ? shape.D : shape.kind === 'tee' ? Math.min(shape.bw, shape.hf) : Math.min(shape.tw, shape.tf);
}

/** Ordered bar options around a shaped outline: least steel first, the bars clear of each other. */
export function buildShapedLongOptions(ctx: MemberContext, shape: ColumnShape): Array<{ count: number; dia: number; area: number }> {
  const Ag = grossAreaOf(shape);
  const corners = shape.kind === 'circle' ? 6 : shape.kind === 'tee' ? 8 : 6;
  const out: Array<{ count: number; dia: number; area: number }> = [];
  for (const dia of ctx.material.longDiametersMm ?? STANDARD_LONG_DIAS) {
    const a = areaOf(dia);
    if (a <= 0) continue;
    for (let count = corners; count <= corners + 24; count++) {
      const area = count * a;
      const rho = area / (Ag * 1e4);
      if (rho < COLUMN_LIMITS.rhoMin - 1e-9) continue;
      if (rho > COLUMN_LIMITS.rhoMax + 1e-9) break;
      const pts = shapedBarPositions(shape, count, dia, ctx.material.cover, ctx.material.stirrupDia);
      if (minClear(pts, dia) < Math.max(0.04, 1.5 * dia / 1000) - 1e-9) break;
      out.push({ count, dia, area });
    }
  }
  out.sort((x, y) => x.area - y.area || x.count - y.count || x.dia - y.dia);
  return out.slice(0, COLUMN_LIMITS.maxLongOptions);
}

function createShapedColumnGenerator(ctx: MemberContext, shape: ColumnShape): CandidateGenerator {
  const longOpts = buildShapedLongOptions(ctx, shape);
  const dim = shapedMinDim(shape);
  const tiesFor = (dia: number) => buildTieOptions({ ...ctx, section: { ...ctx.section, b: dim, h: dim } }, dia);
  const idx = { long: 0, tie: 0 };
  let tieOpts = longOpts.length ? tiesFor(longOpts[0]!.dia) : [];
  let produced = 0, exhausted = false, started = false;
  const build = (): Candidate | null => {
    const lo = longOpts[Math.min(idx.long, longOpts.length - 1)];
    const tie = tieOpts[Math.min(idx.tie, tieOpts.length - 1)];
    if (!lo || !tie) return null;
    const zones = endZoneFor(ctx, tie.spacing);
    const reinforcement: ProvidedReinforcement = { shaped: { count: lo.count, diameter: lo.dia }, longitudinal: { count: lo.count, diameter: lo.dia }, stirrups: { ...tie }, ...(zones ? { tieZones: zones } : {}) };
    const cost = computeCandidateCost(reinforcement, { L: ctx.L, layoutIssues: 0, arrangements: 2, spacings: [tie.spacing] });
    return { reinforcement, meta: { index: produced, cost, label: `shaped#${idx.long}(${lo.count}Ø${lo.dia}) tie#${idx.tie}` } };
  };
  const escalate = (fb: CandidateFeedback): boolean => {
    let tie = false, long = false;
    for (const c of fb.verdict.checks) {
      if (c.status === 'ok') continue;
      if (c.category.startsWith('Ties') || c.category === 'Tie spacing') tie = true; else long = true;
    }
    if (!tie && !long) { tie = true; long = true; }
    let moved = false;
    if (tie && idx.tie < tieOpts.length - 1) { idx.tie++; moved = true; }
    if (long && idx.long < longOpts.length - 1) { idx.long++; tieOpts = tiesFor(longOpts[idx.long]!.dia); idx.tie = Math.min(idx.tie, tieOpts.length - 1); moved = true; }
    return moved;
  };
  return {
    next(feedback: CandidateFeedback | null): Candidate | null {
      if (started && feedback && !escalate(feedback)) { exhausted = true; return null; }
      started = true;
      const c = build();
      if (!c) { exhausted = true; return null; }
      produced++;
      return c;
    },
    get envelopeExhausted() { return exhausted; },
    get produced() { return produced; },
  };
}

export function createColumnCandidateGenerator(ctx: MemberContext): CandidateGenerator {
  if (ctx.shape) return createShapedColumnGenerator(ctx, ctx.shape);
  const longOpts = buildColumnLongOptions(ctx);
  const idx: Record<Knob, number> = { long: 0, tie: 0 };
  let tieOpts: StirrupDef[] = longOpts.length > 0 ? buildTieOptions(ctx, longOpts[0].dia) : [];
  let produced = 0;
  let exhausted = false;
  let started = false;

  const rebuildTies = () => {
    const cur = longOpts[Math.min(idx.long, longOpts.length - 1)];
    const next = buildTieOptions(ctx, cur.dia);
    // Preserve escalation depth when the option list changes shape.
    tieOpts = next;
    if (idx.tie > tieOpts.length - 1) idx.tie = Math.max(0, tieOpts.length - 1);
  };

  const build = (): Candidate | null => {
    if (longOpts.length === 0 || tieOpts.length === 0) return null;
    const lo = longOpts[Math.min(idx.long, longOpts.length - 1)];
    const tie = tieOpts[Math.min(idx.tie, tieOpts.length - 1)];
    const reinforcement: ProvidedReinforcement = {
      column: {
        cornerDia: lo.dia, faceDia: lo.dia,
        nBottom: lo.perFace, nTop: lo.perFace, nLeft: lo.perFace, nRight: lo.perFace,
      },
      // Legacy mirror kept in sync so older consumers stay consistent.
      longitudinal: { count: lo.totalCount, diameter: lo.dia },
      stirrups: { ...tie },
      ...(endZoneFor(ctx, tie.spacing) ? { tieZones: endZoneFor(ctx, tie.spacing) } : {}),
    };
    const cost = computeCandidateCost(reinforcement, {
      L: ctx.L, layoutIssues: 0, arrangements: 2, spacings: [tie.spacing],
    });
    return {
      reinforcement,
      meta: { index: produced, cost, label: `long#${idx.long}(${lo.totalCount}Ø${lo.dia}) tie#${idx.tie}` },
    };
  };

  const escalate = (fb: CandidateFeedback): boolean => {
    const want = new Set<Knob>();
    for (const c of fb.verdict.checks) {
      if (c.status === 'ok') continue;
      const cat = c.category;
      if (cat.startsWith('Ties') || cat === 'Tie spacing') want.add('tie');
      else if (cat.startsWith('Uniaxial') || cat.startsWith('Biaxial')
        || cat.startsWith('Longitudinal') || cat.includes('steel ratio')
        || cat.startsWith('Layout:')) want.add('long');
    }
    if (want.size === 0) { want.add('long'); want.add('tie'); }
    let moved = false;
    if (want.has('tie') && idx.tie < tieOpts.length - 1) { idx.tie++; moved = true; }
    if (want.has('long') && idx.long < longOpts.length - 1) { idx.long++; rebuildTies(); moved = true; }
    if (moved) return true;
    if (idx.long < longOpts.length - 1) { idx.long++; rebuildTies(); return true; }
    if (idx.tie < tieOpts.length - 1) { idx.tie++; return true; }
    return false;
  };

  return {
    next(feedback: CandidateFeedback | null): Candidate | null {
      if (started && feedback) {
        if (!escalate(feedback)) { exhausted = true; return null; }
      }
      started = true;
      const c = build();
      if (!c) { exhausted = true; return null; }
      produced++;
      return c;
    },
    get envelopeExhausted() { return exhausted; },
    get produced() { return produced; },
  };
}
