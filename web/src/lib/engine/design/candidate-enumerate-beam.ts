/**
 * Deterministic bounded beam candidate enumeration.
 *
 * Each of the three flexural regions (start support / span / end support) is
 * designed INDEPENDENTLY — the previous generator sized one moment for the whole
 * member and wrote top steel only when the section happened to need compression
 * steel, leaving 152 of 248 beams in the flagship example with no steel at all at
 * their supports. Stirrups are likewise designed per region: the old code invented
 * the span spacing as `support × 1.5` and never checked it.
 *
 * Bar FIT is enforced at generation time (bars-per-row from the real clear width),
 * not discovered afterwards by the verifier. The effective depth is recomputed from
 * the ACTUAL layer centroid for every candidate rather than an assumed Ø16.
 *
 * Continuity scope: bar groups carry the default (fully continuous) curtailment.
 * Coordinated multi-span cutoff/lap optimization is explicitly the NEXT PR.
 *
 * Pure: no store access, no side effects.
 */

import { REBAR_DB } from '../codes/argentina/cirsoc201';
import type { ProvidedReinforcement, RebarLayer, StirrupDef } from '../../store/model.svelte';
import { layerCentroid, transverseSpacingFor } from '../station-design-forces';
import type { MemberContext } from './member-context';
import { STANDARD_LONG_DIAS, STANDARD_STIRRUP_DIAS, SPACING_GRID, computeCandidateCost } from './objective';
import type { Candidate, CandidateFeedback, CandidateGenerator } from './candidate-generator';
import { DESIGN_TARGET_UTILIZATION } from './outcome';
import { tupleMoment, tupleShear } from './design-axes';

/** Hard bounds — these define the "code-permitted envelope" for exhaustion claims. */
export const BEAM_LIMITS = {
  maxRows: 3,
  minBarsPerRow: 2,
  maxBarsPerRow: 12,
  /** Options retained per region after ordering (keeps the search bounded). */
  maxRegionOptions: 40,
  maxStirrupOptions: 30,
  /** CIRSOC 201 §7.6.1 minimum clear spacing between bars. */
  minClearSpacing: 0.025,
  minSpacing: 0.05,
  maxLegs: 4,
} as const;

function areaOf(dia: number): number {
  return REBAR_DB.find(r => r.diameter === dia)?.area ?? 0;
}

/** Bars that physically fit in one row of a given width. */
export function maxBarsPerRow(b: number, cover: number, stirrupDia: number, dia: number): number {
  const avail = b - 2 * cover - 2 * (stirrupDia / 1000);
  const barD = dia / 1000;
  const gap = Math.max(barD, BEAM_LIMITS.minClearSpacing);
  if (avail <= barD) return 0;
  return Math.max(0, Math.min(BEAM_LIMITS.maxBarsPerRow, Math.floor((avail + gap) / (barD + gap))));
}

interface LongOption {
  layers: RebarLayer[];
  area: number;
  dia: number;
  rows: number;
}

/** Build the ordered longitudinal option list for one region. */
export function buildRegionOptions(ctx: MemberContext, AsSeed: number): LongOption[] {
  const { bFlex: b, hFlex: h } = ctx.axes;
  const { cover, stirrupDia } = ctx.material;
  const out: LongOption[] = [];
  for (const dia of STANDARD_LONG_DIAS) {
    const perRow = maxBarsPerRow(b, cover, stirrupDia, dia);
    if (perRow < BEAM_LIMITS.minBarsPerRow) continue;
    const a = areaOf(dia);
    if (a <= 0) continue;
    for (let rows = 1; rows <= BEAM_LIMITS.maxRows; rows++) {
      const maxTotal = perRow * rows;
      const minTotal = Math.max(BEAM_LIMITS.minBarsPerRow, rows * BEAM_LIMITS.minBarsPerRow);
      // Seed only ORDERS the search (approved decision O1): start at the smallest
      // count that could plausibly work, then walk up to the physical maximum.
      const seedCount = AsSeed > 0 ? Math.ceil(AsSeed / a) : minTotal;
      const from = Math.max(minTotal, Math.min(seedCount, maxTotal));
      for (let n = from; n <= maxTotal; n++) {
        // Reject arrangements that would leave a row below the 2-bar minimum.
        const layers = distributeRows(n, rows, perRow, dia);
        if (!layers) continue;
        // Vertical fit: the layer centroid must stay inside the section.
        const centroid = layerCentroid(layers, cover, stirrupDia);
        if (centroid >= h * 0.5) continue;
        out.push({ layers, area: n * a, dia, rows });
      }
    }
  }
  // Order by preference: fewer rows, then less steel, then smaller diameter.
  out.sort((x, y) => x.rows - y.rows || x.area - y.area || x.dia - y.dia);
  return out.slice(0, BEAM_LIMITS.maxRegionOptions);
}

/** Split n bars over `rows` rows, filling from the outermost row inward. */
function distributeRows(n: number, rows: number, perRow: number, dia: number): RebarLayer[] | null {
  if (n < rows * BEAM_LIMITS.minBarsPerRow) return null;
  if (n > rows * perRow) return null;
  const layers: RebarLayer[] = [];
  let remaining = n;
  for (let r = 0; r < rows; r++) {
    const rowsLeft = rows - r;
    // Keep every later row >= minBarsPerRow.
    const take = Math.min(perRow, remaining - (rowsLeft - 1) * BEAM_LIMITS.minBarsPerRow);
    if (take < BEAM_LIMITS.minBarsPerRow) return null;
    layers.push({ count: take, diameter: dia, row: r });
    remaining -= take;
  }
  return remaining === 0 ? layers : null;
}

/**
 * Ordered stirrup options: least steel first, escalating to tighter/heavier.
 *
 * Both columns of Table 9.7.6.2.2 are honoured HERE, at generation time. The along-length
 * limit bounds the widest spacing enumerated; the across-width limit bounds the SMALLEST
 * leg count enumerated. Generating 2-leg options for a member the table requires 3 legs on
 * would hand the verifier a set of candidates it must reject wholesale, and the search
 * would report SEARCH_EXHAUSTED on a member that is perfectly buildable with a crosstie.
 * That class of generator/verifier disagreement is what the shared evaluator prevents.
 */
export function buildStirrupOptions(ctx: MemberContext, Vu: number): StirrupDef[] {
  const { bFlex: b, hFlex: h } = ctx.axes;
  const { cover, stirrupDia } = ctx.material;
  const d = h - cover - stirrupDia / 1000 - 0.008;
  const out: StirrupDef[] = [];
  for (const dia of STANDARD_STIRRUP_DIAS) {
    // The table's across-width limit depends on the stirrup diameter (it sets the leg
    // centre), so the limits are evaluated per diameter rather than once per member.
    const table = transverseSpacingFor(Vu, b, d, ctx.material.fc, cover, dia, ctx.codeEdition);
    const top = Math.floor(table.alongMax / SPACING_GRID) * SPACING_GRID;
    for (let legs = table.requiredLegs; legs <= BEAM_LIMITS.maxLegs; legs += 1) {
      // A wide member needs more legs; a narrow one cannot host them.
      const perRow = maxBarsPerRow(b, cover, dia, dia);
      if (legs > 2 && perRow < legs) continue;
      for (let s = top; s >= BEAM_LIMITS.minSpacing - 1e-9; s -= SPACING_GRID) {
        out.push({ diameter: dia, legs, spacing: +s.toFixed(4) });
      }
    }
  }
  // Preference: fewer legs, smaller diameter, wider spacing (least steel).
  out.sort((x, y) => x.legs - y.legs || x.diameter - y.diameter || y.spacing - x.spacing);
  return out.slice(0, BEAM_LIMITS.maxStirrupOptions);
}

/** Region-wise seed demands, computed on the GOVERNING axis. */
export interface BeamSeed {
  MuSpan: number; MuStart: number; MuEnd: number;
  VuSupport: number; VuSpan: number;
  /** Opposite-sign demands — hogging in the span (cantilever/pattern load)
   *  and sagging at the supports. The verifier checks these against continuing
   *  steel; seeding them lets the search place steel that continuity carries. */
  MuSpanHog: number; MuStartSag: number; MuEndSag: number;
}

export function computeBeamSeed(ctx: MemberContext): BeamSeed {
  const seed: BeamSeed = {
    MuSpan: 0, MuStart: 0, MuEnd: 0, VuSupport: 0, VuSpan: 0,
    MuSpanHog: 0, MuStartSag: 0, MuEndSag: 0,
  };
  const st = ctx.stations;
  if (!st) return seed;
  const cs = ctx.criticalSections;
  const tStart = cs ? cs.start.tCritShear : 0.25;
  const tEnd = cs ? 1 - cs.end.tCritShear : 0.75;
  for (const cr of st.comboResults) {
    for (const s of cr.stations) {
      const m = tupleMoment(s, ctx.axes.flexure);
      const v = Math.abs(tupleShear(s, ctx.axes.shear));
      if (s.t <= tStart) {
        if (m < 0) seed.MuStart = Math.max(seed.MuStart, -m);
        else seed.MuStartSag = Math.max(seed.MuStartSag, m);
        seed.VuSupport = Math.max(seed.VuSupport, v);
      } else if (s.t >= tEnd) {
        if (m < 0) seed.MuEnd = Math.max(seed.MuEnd, -m);
        else seed.MuEndSag = Math.max(seed.MuEndSag, m);
        seed.VuSupport = Math.max(seed.VuSupport, v);
      } else {
        if (m > 0) seed.MuSpan = Math.max(seed.MuSpan, m);
        else seed.MuSpanHog = Math.max(seed.MuSpanHog, -m);
        seed.VuSpan = Math.max(seed.VuSpan, v);
      }
    }
  }
  return seed;
}

/** Closed-form required-steel seed (ORDERS the search; never decides adequacy). */
export function seedAreaFor(Mu: number, ctx: MemberContext): number {
  if (Mu <= 0) return 0;
  const { bFlex: b, hFlex: h } = ctx.axes;
  const { cover, stirrupDia, fc, fy } = ctx.material;
  const d = h - cover - stirrupDia / 1000 - 0.010;
  if (d <= 0 || b <= 0) return 0;
  // As ≈ Mu / (φ · fy · 0.9d), then aim at the design target so the first candidate
  // tried already has margin (approved decision O5).
  const As = (Mu / (0.9 * fy * 1000 * 0.9 * d)) * 1e4 / DESIGN_TARGET_UTILIZATION;
  const rhoMin = Math.max(0.25 * Math.sqrt(fc) / fy, 1.4 / fy);
  return Math.max(As, rhoMin * b * d * 1e4);
}

type Knob = 'span' | 'start' | 'end' | 'stirSup' | 'stirSpan';

/** Feedback-driven coordinate-descent generator for a beam. */
export function createBeamCandidateGenerator(ctx: MemberContext): CandidateGenerator {
  const seed = computeBeamSeed(ctx);
  const spanOpts = buildRegionOptions(ctx, seedAreaFor(seed.MuSpan, ctx));
  // Top-steel knobs exist when EITHER the support hogs OR the span hogs
  // (continuity carries support top steel into the span — the only face the
  // data model can place there). Seed for the worst of both.
  const startSeed = Math.max(seed.MuStart, seed.MuSpanHog);
  const endSeed = Math.max(seed.MuEnd, seed.MuSpanHog);
  const startOpts = startSeed > 0 ? buildRegionOptions(ctx, seedAreaFor(startSeed, ctx)) : [];
  const endOpts = endSeed > 0 ? buildRegionOptions(ctx, seedAreaFor(endSeed, ctx)) : [];
  const stirSupOpts = buildStirrupOptions(ctx, seed.VuSupport);
  const stirSpanOpts = buildStirrupOptions(ctx, seed.VuSpan);

  const idx: Record<Knob, number> = { span: 0, start: 0, end: 0, stirSup: 0, stirSpan: 0 };
  const len: Record<Knob, number> = {
    span: spanOpts.length, start: startOpts.length, end: endOpts.length,
    stirSup: stirSupOpts.length, stirSpan: stirSpanOpts.length,
  };
  let produced = 0;
  let exhausted = false;
  let lastCandidate: Candidate | null = null;

  const build = (): Candidate | null => {
    if (len.span === 0) return null;
    const span = spanOpts[Math.min(idx.span, len.span - 1)];
    const start = len.start > 0 ? startOpts[Math.min(idx.start, len.start - 1)] : undefined;
    const end = len.end > 0 ? endOpts[Math.min(idx.end, len.end - 1)] : undefined;
    const ssup = len.stirSup > 0 ? stirSupOpts[Math.min(idx.stirSup, len.stirSup - 1)] : undefined;
    const sspan = len.stirSpan > 0 ? stirSpanOpts[Math.min(idx.stirSpan, len.stirSpan - 1)] : undefined;

    const reinforcement: ProvidedReinforcement = {
      regions: {
        bottomSpanLayers: span.layers.map(l => ({ ...l })),
        bottomSpan: { count: span.layers.reduce((s, l) => s + l.count, 0), diameter: span.dia },
        ...(start ? {
          topStartLayers: start.layers.map(l => ({ ...l })),
          topStart: { count: start.layers.reduce((s, l) => s + l.count, 0), diameter: start.dia },
        } : {}),
        ...(end ? {
          topEndLayers: end.layers.map(l => ({ ...l })),
          topEnd: { count: end.layers.reduce((s, l) => s + l.count, 0), diameter: end.dia },
        } : {}),
        ...(ssup ? { stirrupsSupport: { ...ssup } } : {}),
        ...(sspan ? { stirrupsSpan: { ...sspan } } : {}),
      },
    };
    const spacings = [ssup?.spacing, sspan?.spacing].filter((s): s is number => s !== undefined);
    const arrangements = new Set([span.dia, start?.dia, end?.dia].filter(d => d !== undefined)).size
      + new Set([ssup?.diameter, sspan?.diameter].filter(d => d !== undefined)).size;
    const cost = computeCandidateCost(reinforcement, {
      L: ctx.L, layoutIssues: 0, arrangements, spacings,
    });
    return {
      reinforcement,
      meta: {
        index: produced,
        cost,
        label: `span#${idx.span} start#${idx.start} end#${idx.end} sSup#${idx.stirSup} sSpan#${idx.stirSpan}`,
      },
    };
  };

  /** Advance the knobs implicated by the feedback. Returns false when stuck. */
  const escalate = (fb: CandidateFeedback): boolean => {
    const want = new Set<Knob>();
    for (const c of fb.verdict.checks) {
      if (c.status === 'ok') continue;
      const cat = c.category;
      if (cat.startsWith('Bottom Span') || cat.startsWith('Min steel')) want.add('span');
      else if (cat.startsWith('Top Start')) want.add('start');
      else if (cat.startsWith('Top End')) want.add('end');
      // Opposite-sign sweep failures: span hogging is resisted by support top
      // steel continuing into the span; support sagging by span bottom steel
      // continuing into the supports.
      else if (cat.startsWith('Top Span')) { want.add('start'); want.add('end'); }
      else if (cat.startsWith('Bottom Start') || cat.startsWith('Bottom End')) want.add('span');
      else if (cat.startsWith('Shear Support')) want.add('stirSup');
      else if (cat.startsWith('Shear Span')) want.add('stirSpan');
      else if (cat.startsWith('Fit: Bottom') || cat.startsWith('Max steel')) want.add('span');
      else if (cat.startsWith('Fit: Top Start')) want.add('start');
      else if (cat.startsWith('Fit: Top End')) want.add('end');
      else if (cat.startsWith('Layout:')) { want.add('span'); want.add('start'); want.add('end'); }
      else if (cat === 'Anchorage') { want.add('span'); want.add('start'); want.add('end'); }
    }
    // Nothing attributable → widen everything so the search still progresses.
    if (want.size === 0) { want.add('span'); want.add('start'); want.add('end'); want.add('stirSup'); want.add('stirSpan'); }
    let moved = false;
    for (const k of want) {
      if (len[k] === 0) continue;
      if (idx[k] < len[k] - 1) { idx[k]++; moved = true; }
    }
    if (moved) return true;
    // The implicated knobs are maxed out. Try advancing anything still movable —
    // coupling (compression steel, fit) can make an unrelated knob help.
    for (const k of ['span', 'start', 'end', 'stirSup', 'stirSpan'] as Knob[]) {
      if (len[k] > 0 && idx[k] < len[k] - 1) { idx[k]++; return true; }
    }
    return false;
  };

  return {
    next(feedback: CandidateFeedback | null): Candidate | null {
      if (feedback && lastCandidate) {
        if (!escalate(feedback)) { exhausted = true; return null; }
      }
      const c = build();
      if (!c) { exhausted = true; return null; }
      produced++;
      lastCandidate = c;
      return c;
    },
    get envelopeExhausted() { return exhausted; },
    get produced() { return produced; },
  };
}
