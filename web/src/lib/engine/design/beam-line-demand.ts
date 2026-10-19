/**
 * What a beam line asks of its bars along it: at each station of each member, the largest sagging
 * and hogging moment of all combinations on the member's governing axis, and the area of bottom
 * and top steel that carries it on the web (the rectangle's capacity, found by bisection). Read
 * beside the area the line's bars give there, it is the editor's «needed against provided».
 */
import { computeFlexureCapacity } from '../station-design-forces';
import type { MemberContext } from './member-context';
import { tupleMoment } from './design-axes';

export interface DemandPoint {
  /** Metres along the line. */
  x: number;
  /** kN·m, both positive. */
  mPos: number; mNeg: number;
  /** cm². */
  asBottom: number; asTop: number;
}

/** The area that carries Mu on a b × d rectangle, cm²; Infinity past the section's capacity. */
export function requiredArea(Mu: number, b: number, d: number, fc: number, fy: number): number {
  if (!(Mu > 1e-6) || !(d > 0)) return 0;
  let lo = 0, hi = 0.04 * b * d * 1e4;
  const cap = (As: number) => computeFlexureCapacity(As, b, d, fc, fy)?.phiMn ?? 0;
  if (cap(hi) < Mu) return Number.POSITIVE_INFINITY;
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (cap(mid) >= Mu) hi = mid; else lo = mid; }
  return hi;
}

/** The demand along a line: each member's stations placed at their x, in the line's sense. */
export function lineDemand(
  members: ReadonlyArray<{ ctx: MemberContext | undefined; offset: number; L: number; forward: boolean }>,
): DemandPoint[] {
  const out: DemandPoint[] = [];
  for (const m of members) {
    const ctx = m.ctx;
    const st = ctx?.stations;
    if (!ctx || !st) continue;
    const b = ctx.axes.bFlex, h = ctx.axes.hFlex;
    const d = h - ctx.material.cover - ctx.material.stirrupDia / 1000 - 0.01;
    const ts = st.stationTs;
    ts.forEach((t, i) => {
      let mPos = 0, mNeg = 0;
      for (const c of st.comboResults) {
        const s = c.stations[i];
        // The verifier's convention: a positive moment on the governing axis sags.
        const sag = s ? tupleMoment(s, ctx.axes.flexure) : 0;
        if (sag > mPos) mPos = sag;
        if (-sag > mNeg) mNeg = -sag;
      }
      const x = m.offset + (m.forward ? t : 1 - t) * m.L;
      out.push({ x, mPos, mNeg, asBottom: requiredArea(mPos, b, d, ctx.material.fc, ctx.material.fy), asTop: requiredArea(mNeg, b, d, ctx.material.fc, ctx.material.fy) });
    });
  }
  return out.sort((p, q) => p.x - q.x);
}
