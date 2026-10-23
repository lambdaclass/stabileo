/**
 * The longitudinal groups a beam is detailed from, read once for every reader: the generator,
 * the layout coordination (`run-detailing`) and the design's joint-threading check
 * (`design/joint-threading.ts`). Pure.
 */
import { STANDARD_LONG_DIAS } from '../design/objective';
import {
  reconcileAcrossTheMember, resolveTopSteel,
  type TopSteelProvision, type TopSteelPurpose,
} from './beam-top-steel';
import type { MemberContext } from '../design/member-context';
import type { MemberDesignOutcome } from '../design/outcome';
import type { RegulationEdition } from '../../codes/regulation';
import type { MomentStation } from './generate-beam';

/**
 * Envelope stations for a beam, from the per-combo station forces.
 *
 * The generators need sagging, hogging and shear envelopes at each x. Taking the max over
 * combos at each station is exactly what "envelope" means, and it is what the curtailment
 * rules in §9.7.3 are written against.
 */
export function envelopeStations(ctx: MemberContext): MomentStation[] {
  const sr = ctx.stations;
  if (!sr || sr.comboResults.length === 0) return [];
  const byX = new Map<number, MomentStation>();
  for (const combo of sr.comboResults) {
    for (const st of combo.stations) {
      const key = Math.round(st.x * 1e6) / 1e6;
      const cur = byX.get(key) ?? { x: key, mPos: 0, mNeg: 0, v: 0 };
      // Local-y bending is the strong axis for a horizontal member under gravity.
      const m = st.my;
      cur.mPos = Math.max(cur.mPos, m > 0 ? m : 0);
      cur.mNeg = Math.max(cur.mNeg, m < 0 ? -m : 0);
      cur.v = Math.max(cur.v, Math.abs(st.vz), Math.abs(st.vy));
      byX.set(key, cur);
    }
  }
  return [...byX.values()].sort((a, b) => a.x - b.x);
}

/**
 * Peak hogging moment at each end of a member, kN·m, from its own envelope.
 *
 * The FIRST and LAST station rather than a region sweep, matching what `generateBeamBars`
 * already calls `peakNegI` / `peakNegJ`. Two readings of "does this support hog" that disagree
 * would put a hanger pair on a face the generator then curtails hogging steel into.
 */
export function hoggingAtSupports(ctx: MemberContext): { start: number; end: number } {
  const st = envelopeStations(ctx);
  if (st.length === 0) return { start: 0, end: 0 };
  return {
    start: Math.max(st[0].mNeg, 0),
    end: Math.max(st[st.length - 1].mNeg, 0),
  };
}

export interface BeamGroupOptions {
  ctx: MemberContext;
  edition: RegulationEdition;
  maxAggregateSizeMm: number;
  hogging: { start: number; end: number };
}

/** The top-steel provision at each support. One derivation, two readers. */
export function resolveTopSteelFor(
  accepted: NonNullable<MemberDesignOutcome['accepted']>,
  opts: BeamGroupOptions,
): { start: TopSteelProvision; end: TopSteelProvision } {
  const g = (x?: { count: number; diameter: number }) =>
    x && x.count > 0 ? { count: x.count, diameterMm: x.diameter } : undefined;
  const r = accepted.regions;
  const common = {
    b: opts.ctx.section.b,
    cover: opts.ctx.material.cover,
    stirrupDiaMm: opts.ctx.material.stirrupDia,
    maxAggregateSizeMm: opts.maxAggregateSizeMm,
    availableDiametersMm: opts.ctx.material.longDiametersMm ?? STANDARD_LONG_DIAS,
    edition: opts.edition,
  };
  const start = resolveTopSteel({
    ...common,
    designed: g(r?.topStart) ?? g(accepted.top),
    hoggingMoment: opts.hogging.start,
  });
  const end = resolveTopSteel({
    ...common,
    designed: g(r?.topEnd) ?? g(accepted.top),
    hoggingMoment: opts.hogging.end,
  });
  return reconcileAcrossTheMember(start, end);
}


/**
 * The three longitudinal groups a beam is detailed from, and what each top group IS.
 *
 * ── The line this replaces, and why it was wrong ───────────────────
 *
 *     if (!bottom || !topStart || !topEnd) return null;
 *
 * All three or nothing. A beam whose envelope never hogs is designed with bottom steel and no
 * top groups — `bottomSpan=2Ø20`, `topStart=—`, `topEnd=—` in the design's own candidate — and
 * that gate discarded the bottom bars the design DID produce, along with the entire stirrup
 * cage, which is generated in the same call. Sixty-three of the 7-storey building's 119 beams
 * reached the viewport with no steel of their own at all; the transverse bars they appeared to
 * have were the JOINT ties of the columns they frame into, which claim the beam ids too.
 *
 * The missing group is now RESOLVED rather than demanded — see `./beam-top-steel.ts`
 * for the clauses and, more importantly, for the one number none of them fixes. The bottom group
 * is still demanded: a beam with no bottom steel has nothing this function can build a beam from.
 */
export function beamGroups(
  accepted: NonNullable<MemberDesignOutcome['accepted']>,
  opts: BeamGroupOptions,
): {
  bottom: { count: number; diameterMm: number; rowCounts?: readonly number[] };
  topStart: { count: number; diameterMm: number };
  topEnd: { count: number; diameterMm: number };
  topPurpose: { start: TopSteelPurpose; end: TopSteelPurpose };
  /** The full provisions, for the trace, the refs and the blocked reasons. */
  provisions: { start: TopSteelProvision; end: TopSteelProvision };
} | null {
  const g = (x?: { count: number; diameter: number }) =>
    x && x.count > 0 ? { count: x.count, diameterMm: x.diameter } : null;
  const r = accepted.regions;
  const bottom = g(r?.bottomSpan) ?? g(accepted.bottom);
  if (!bottom) return null;
  const layers = r?.bottomGroups?.length === 1 ? r.bottomGroups[0].layers
    : r?.bottomGroups?.length ? undefined : r?.bottomSpanLayers;
  const ordered = layers && [...layers].sort((a, b) => a.row - b.row);
  const rowCounts = r?.preserveBottomRows && ordered && ordered.length > 0
    && ordered.every((l, i) => l.diameter === bottom.diameterMm && l.row === i)
    && ordered.reduce((n, l) => n + l.count, 0) === bottom.count
    ? ordered.map(l => l.count) : undefined;
  // Do not silently discard a prescribed layout that this uniform-diameter path cannot build.
  if (r?.preserveBottomRows && !rowCounts) return null;

  const { start, end } = resolveTopSteelFor(accepted, opts);
  if (!start.group || !end.group) return null;
  return {
    bottom: { ...bottom, ...(rowCounts ? { rowCounts } : {}) }, topStart: start.group, topEnd: end.group,
    topPurpose: { start: start.purpose, end: end.purpose },
    provisions: { start, end },
  };
}

