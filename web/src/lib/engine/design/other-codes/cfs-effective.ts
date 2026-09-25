/**
 * Effective section of a lipped cold-formed channel at the yield stress, AISI S100-16 Appendix 1
 * (the effective width method): the effective area under uniform compression and the effective
 * section modulus about the strong axis with the compression flange at Fy.
 *
 * The engine's AISI S100 checker takes both as inputs, so they are computed here, from the four
 * numbers that define the bend (`profiles/cold-formed.ts`) and on that module's model: square
 * corners, one sheet thickness, flat widths w = outer dimension − 2t (lip: C − t). Corners are
 * fully effective.
 *
 *   · webs: 1.1 (uniform) and 1.1.1.2 (stress gradient, with the h₀/b₀ split of b₁ and b₂);
 *   · flanges: 1.3, the uniformly compressed element with an edge stiffener, θ = 90°;
 *   · lips: 1.2.1 at the flange's stress, reduced by Is/Ia. Taking the lip at the flange stress
 *     rather than its own (lower) one is the conservative side of 1.3.
 *
 * Both values are at Fy, where the code allows the area and modulus at the buckling stress Fn:
 * the effective width only grows as the stress falls, so this is on the safe side.
 *
 * Lips deeper than 0,8 of the flange flat width are outside 1.3, and the section is refused.
 */

export interface LippedChannel {
  /** Out-to-out depth, flange width, lip length (from the outside of the flange), thickness; m. */
  H: number; B: number; C: number; t: number;
}

export interface CfsEffective {
  /** Effective area at Fy, uniform compression, m². */
  ae: number;
  /** Effective section modulus about the strong axis at Fy, m³, and the full one. */
  seX: number; sfX: number;
  /** Gross area and strong-axis second moment of this model, m², m⁴. */
  ag: number; ix: number;
  /** Warping constant, m⁶, of the centreline channel with lips. */
  cw: number;
}

/** 1.1 — effective width of a stiffened (or, with k = 0,43, unstiffened) element. */
export function effectiveWidth(w: number, t: number, k: number, f: number, E: number): number {
  if (!(w > 0) || !(f > 0)) return Math.max(w, 0);
  const lambda = (1.052 / Math.sqrt(k)) * (w / t) * Math.sqrt(f / E);
  if (lambda <= 0.673) return w;
  const rho = (1 - 0.22 / lambda) / lambda;
  return rho * w;
}

/** 1.3 — a flange of flat width `w` stiffened by a lip of flat width `d` and overall depth `D`. */
export function edgeStiffenedFlange(
  w: number, d: number, D: number, t: number, f: number, E: number,
): { b: number; ds: number } | null {
  const S = 1.28 * Math.sqrt(E / f);
  const lipEff = effectiveWidth(d, t, 0.43, f, E);
  if (w / t <= 0.328 * S) return { b: w, ds: lipEff };
  if (D / w > 0.8) return null;
  const Ia = Math.min(399 * t ** 4 * ((w / t) / S - 0.328) ** 3, t ** 4 * (115 * (w / t) / S + 5));
  const Is = (d ** 3 * t) / 12;
  const RI = Math.min(Is / Ia, 1);
  const n = Math.max(0.582 - (w / t) / (4 * S), 1 / 3);
  const k = Math.min(
    D / w <= 0.25 ? 3.57 * RI ** n + 0.43 : (4.82 - (5 * D) / w) * RI ** n + 0.43,
    4,
  );
  return { b: effectiveWidth(w, t, k, f, E), ds: lipEff * RI };
}

/** A straight strip: area and centroid depth from the compression face, and its own I. */
interface Strip { a: number; y: number; i0: number }

const vertical = (t: number, from: number, len: number): Strip => ({ a: t * len, y: from + len / 2, i0: (t * len ** 3) / 12 });
const horizontal = (t: number, y: number, len: number): Strip => ({ a: t * len, y, i0: (len * t ** 3) / 12 });

function inertia(strips: Strip[]): { a: number; ycg: number; i: number } {
  const a = strips.reduce((s, p) => s + p.a, 0);
  const ycg = strips.reduce((s, p) => s + p.a * p.y, 0) / a;
  const i = strips.reduce((s, p) => s + p.i0 + p.a * (p.y - ycg) ** 2, 0);
  return { a, ycg, i };
}

/** Warping constant of a lipped channel, centreline dimensions (Yu, Cold-Formed Steel Design). */
export function lippedChannelCw(g: LippedChannel): number {
  const { t } = g;
  const a = g.H - t, b = g.B - t, c = g.C - t / 2;
  const num = 2 * a ** 3 * b + 3 * a ** 2 * b ** 2 + 48 * c ** 4 + 112 * b * c ** 3 + 8 * a * c ** 3
    + 48 * a * b * c ** 2 + 12 * a ** 2 * c ** 2 + 12 * a ** 2 * b * c + 6 * a ** 3 * c;
  const den = 6 * a ** 2 * b + (a + 2 * c) ** 3 - 24 * a * c ** 2;
  return ((a ** 2 * b ** 2 * t) / 12) * (num / den);
}

/** The effective section at Fy, or null when the lips are outside 1.3. */
export function cfsEffective(g: LippedChannel, fy: number, E: number): CfsEffective | null {
  const { H, B, C, t } = g;
  const wWeb = H - 2 * t, wFl = B - 2 * t, wLip = C - t;
  if (!(wWeb > 0 && wFl > 0 && wLip > 0)) return null;

  // ── Uniform compression at Fy ──
  const flU = edgeStiffenedFlange(wFl, wLip, C, t, fy, E);
  if (!flU) return null;
  const webU = effectiveWidth(wWeb, t, 4, fy, E);
  const corners = 4 * t * t;
  const ae = t * (webU + 2 * flU.b + 2 * flU.ds) + corners;

  // ── Gross strong-axis section, depth y from the compression (top) face ──
  const cornerStrips = (): Strip[] => [
    horizontal(t, t / 2, t), horizontal(t, t / 2, t),
    horizontal(t, H - t / 2, t), horizontal(t, H - t / 2, t),
  ];
  const gross = inertia([
    ...cornerStrips(),
    horizontal(t, t / 2, wFl), horizontal(t, H - t / 2, wFl),
    vertical(t, t, wLip), vertical(t, H - t - wLip, wLip),
    vertical(t, t, wWeb),
  ]);

  // ── Bending, compression flange at Fy: iterate on the neutral axis ──
  const flB = edgeStiffenedFlange(wFl, wLip, C, t, fy, E)!;
  let ycg = H / 2;
  let eff = gross;
  for (let it = 0; it < 60; it++) {
    const f1 = (fy * (ycg - t)) / ycg;                 // top of the web flat, compression
    const f2 = (-fy * (H - t - ycg)) / ycg;            // bottom of the web flat, tension
    const psi = Math.abs(f2 / f1);
    const k = 4 + 2 * (1 + psi) ** 3 + 2 * (1 + psi);
    const be = effectiveWidth(wWeb, t, k, f1, E);
    const b1 = be / (3 + psi);
    const b2 = H / B <= 4 ? (psi > 0.236 ? be / 2 : be - b1) : be / (1 + psi) - b1;
    const wc = ycg - t;                                // compressed part of the web flat
    const webStrips: Strip[] = b1 + b2 >= wc
      ? [vertical(t, t, wWeb)]
      : [vertical(t, t, b1), vertical(t, ycg - b2, b2 + (H - t - ycg))];
    eff = inertia([
      ...cornerStrips(),
      horizontal(t, t / 2, flB.b), horizontal(t, H - t / 2, wFl),
      vertical(t, t, flB.ds), vertical(t, H - t - wLip, wLip),
      ...webStrips,
    ]);
    if (Math.abs(eff.ycg - ycg) < 1e-9 * H) { ycg = eff.ycg; break; }
    ycg = eff.ycg;
  }

  return {
    ae, ag: gross.a, ix: gross.i,
    seX: eff.i / ycg, sfX: gross.i / (H / 2),
    cw: lippedChannelCw(g),
  };
}
