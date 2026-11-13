import { EPS_CU, ES, type Ts500Mat } from './basis';

/** Depth from the compression face and area, m and m². */
export interface Layer { depth: number; area: number }

export interface Strip { b: number; h: number; flange?: { bf: number; hf: number }; layers: Layer[] }

export interface StripState { c: number; n: number; m: number; epsT: number; cc: number; a: number }

const KN = 1000;

function block(s: Strip, a: number): { area: number; centroid: number } {
  const x = Math.min(Math.max(a, 0), s.h);
  if (!s.flange || s.flange.bf <= s.b) return { area: s.b * x, centroid: x / 2 };
  const hf = Math.min(s.flange.hf, s.h);
  const top = Math.min(x, hf), web = Math.max(0, x - hf);
  const a1 = s.flange.bf * top, a2 = s.b * web;
  const area = a1 + a2;
  return { area, centroid: area > 0 ? (a1 * top / 2 + a2 * (hf + web / 2)) / area : 0 };
}

/** Forces at a neutral axis depth c: N (kN, + compression) and M about mid-depth (kN·m, + compressing the face). */
export function stripState(s: Strip, t: Ts500Mat, c: number): StripState {
  const a = t.k1 * c;
  const blk = block(s, a);
  const cc = 0.85 * t.fcd * blk.area * KN;
  let n = cc, m = cc * (s.h / 2 - blk.centroid);
  let deepest = 0;
  for (const l of s.layers) {
    if (l.area <= 0) continue;
    const eps = EPS_CU * (c - l.depth) / c;
    let sigma = Math.max(-t.fyd, Math.min(t.fyd, ES * eps));
    if (sigma > 0 && l.depth < Math.min(a, s.h)) sigma -= 0.85 * t.fcd;
    const f = sigma * l.area * KN;
    n += f; m += f * (s.h / 2 - l.depth);
    deepest = Math.max(deepest, l.depth);
  }
  return { c, n, m, epsT: EPS_CU * (deepest - c) / c, cc, a: Math.min(a, s.h) };
}

export function stripAtAxial(s: Strip, t: Ts500Mat, n: number): StripState | null {
  let lo = 1e-6 * s.h, hi = 200 * s.h;
  if (stripState(s, t, hi).n < n || stripState(s, t, lo).n > n) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (stripState(s, t, mid).n > n) hi = mid; else lo = mid;
  }
  return stripState(s, t, (lo + hi) / 2);
}

export const stripCapacity = (s: Strip, t: Ts500Mat, n = 0): number => Math.max(0, stripAtAxial(s, t, n)?.m ?? 0);

export function balancedArea(s: Strip, t: Ts500Mat, d: number): number {
  const cb = d * EPS_CU / (EPS_CU + t.eyd);
  return block(s, t.k1 * cb).area * 0.85 * t.fcd / t.fyd;
}

export function limitStrain(s: Strip, t: Ts500Mat, d: number): number {
  const st = stripAtAxial({ ...s, layers: [{ depth: d, area: 0.85 * balancedArea(s, t, d) }] }, t, 0);
  return st ? st.epsT : 0;
}

export interface FlexureDesign {
  /** cm². */
  as: number; asComp: number; asLim: number; asb: number;
  c: number; epsT: number; z: number;
  impossible: boolean;
}

/** Tension steel for Md (kN·m) at axial force nd (kN, + compression); compression steel where As would pass min(0.85·Asb; 0.02·bw·d). */
export function designFlexure(geom: Omit<Strip, 'layers'>, t: Ts500Mat, md: number, nd: number, d: number, dPrime: number): FlexureDesign {
  const s = (as: number): Strip => ({ ...geom, layers: [{ depth: d, area: as }] });
  const asb = balancedArea(s(0), t, d);
  const asLim = Math.min(0.85 * asb, 0.02 * geom.b * d);
  const none = { as: 0, asComp: 0, asLim: asLim * 1e4, asb: asb * 1e4, c: 0, epsT: 0, z: 0, impossible: false };
  if (!(md > 1e-9)) return none;
  const mr = (as: number) => stripCapacity(s(as), t, nd);
  const singly = (cap: number): number | null => {
    if (mr(cap) < md) return null;
    let lo = 0, hi = cap;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (mr(mid) >= md) hi = mid; else lo = mid; }
    return hi;
  };
  const as1 = singly(asLim);
  if (as1 !== null) {
    const st = stripAtAxial(s(as1), t, nd)!;
    return { ...none, as: as1 * 1e4, c: st.c, epsT: st.epsT, z: d - st.a / 2 };
  }
  const st = stripAtAxial(s(asLim), t, nd);
  if (!st) return { ...none, impossible: true };
  const dm = md - st.m;
  const lever = d - dPrime;
  const epsC = EPS_CU * (st.c - dPrime) / st.c;
  const sigmaC = Math.min(t.fyd, ES * Math.max(0, epsC)) - 0.85 * t.fcd;
  if (lever <= 0 || sigmaC <= 0) return { ...none, as: asLim * 1e4, impossible: true, c: st.c, epsT: st.epsT };
  const asComp = dm / (lever * sigmaC * KN);
  return { ...none, as: (asLim + dm / (lever * t.fyd * KN)) * 1e4, asComp: asComp * 1e4, c: st.c, epsT: st.epsT, z: d - st.a / 2 };
}
