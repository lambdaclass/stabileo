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

import { REBAR_DB } from '../codes/argentina/cirsoc201';
import type { ProvidedReinforcement, StirrupDef } from '../../store/model.svelte';
import { computeColumnLayout } from '../station-design-forces';
import type { MemberContext } from './member-context';
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
}

/** Ordered longitudinal options: least steel first, symmetric by construction. */
export function buildColumnLongOptions(ctx: MemberContext): ColumnLongOption[] {
  const { b, h } = ctx.section;
  const Ag = b * h;
  if (Ag <= 0) return [];
  const { cover, stirrupDia } = ctx.material;
  const out: ColumnLongOption[] = [];
  for (const dia of STANDARD_LONG_DIAS) {
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
      out.push({ dia, perFace, totalCount, area, rho });
    }
  }
  // Preference: least steel, then fewer bars, then smaller diameter.
  out.sort((x, y) => x.area - y.area || x.totalCount - y.totalCount || x.dia - y.dia);
  return out.slice(0, COLUMN_LIMITS.maxLongOptions);
}

/** Maximum tie spacing per CIRSOC 201 §7.10.5: min(12 dB, 48 de, min(b,h)). */
export function maxTieSpacing(cornerDia: number, tieDia: number, b: number, h: number): number {
  return Math.min(12 * cornerDia / 1000, 48 * tieDia / 1000, Math.min(b, h));
}

/** Ordered tie options for a given longitudinal diameter. */
export function buildTieOptions(ctx: MemberContext, cornerDia: number): StirrupDef[] {
  const { b, h } = ctx.section;
  const out: StirrupDef[] = [];
  for (const dia of STANDARD_STIRRUP_DIAS) {
    const sMax = maxTieSpacing(cornerDia, dia, b, h);
    if (sMax < COLUMN_LIMITS.minSpacing) continue;
    for (let legs = 2; legs <= COLUMN_LIMITS.maxLegs; legs += 2) {
      const top = Math.floor(sMax / SPACING_GRID) * SPACING_GRID;
      for (let s = top; s >= COLUMN_LIMITS.minSpacing - 1e-9; s -= SPACING_GRID) {
        out.push({ diameter: dia, legs, spacing: +s.toFixed(4) });
      }
    }
  }
  out.sort((x, y) => x.legs - y.legs || x.diameter - y.diameter || y.spacing - x.spacing);
  return out.slice(0, COLUMN_LIMITS.maxTieOptions);
}

type Knob = 'long' | 'tie';

export function createColumnCandidateGenerator(ctx: MemberContext): CandidateGenerator {
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
