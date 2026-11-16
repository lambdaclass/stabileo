import { deriveHookedDevelopment } from '../codes/cirsoc201/anchorage';
import { barArea, roundDown } from './bars';
import { cirsocSlabDevelopment } from './slab-row';
import type { FootingAdopted, FootingMesh } from './footing-types';
import type { Materials } from './types';

/** §13.3.3.3: the share of the short direction's steel in the central band, β the long side over the short. */
export const bandShare = (B: number, L: number): number => {
  const beta = Math.max(B, L) / Math.max(1e-9, Math.min(B, L));
  return 2 / (beta + 1);
};

/** Whether the bars along `dir` are the short direction of a rectangular footing, so a central band holds part of them. */
export const isBanded = (dir: 'x' | 'y', B: number, L: number): boolean =>
  Math.abs(B - L) > 1e-6 && (dir === 'x' ? B < L : L < B);

export interface MeshSpan {
  /** Where the bars of the layer lie across it, m from the footing's centroid. */
  positions: number[];
  /** The bars inside the central band, when there is one. */
  inBand: number;
  band?: { lo: number; hi: number };
}

const evenly = (lo: number, hi: number, s: number): number[] => {
  if (hi - lo < 1e-9) return [lo];
  const n = Math.ceil((hi - lo) / s - 1e-9) + 1;
  return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
};

/** The bars of a layer laid across its footing: every bar within the cover, at most `spacing` apart, or `outer` apart outside the band. */
export function meshSpan(dir: 'x' | 'y', a: Pick<FootingAdopted, 'B' | 'L' | 'ex' | 'ey'>, m: FootingMesh, cover: number): MeshSpan {
  if (!(m.dia > 0) || !(m.spacing > 0)) return { positions: [], inBand: 0 };
  const across = dir === 'x' ? a.L : a.B;
  const lo = -across / 2 + cover + m.dia / 2000, hi = -lo;
  if (!isBanded(dir, a.B, a.L) || !(m.outer && m.outer > 0)) return { positions: evenly(lo, hi, m.spacing), inBand: 0 };
  const width = Math.min(a.B, a.L), centre = dir === 'x' ? -a.ey : -a.ex;
  const b0 = Math.max(lo, centre - width / 2), b1 = Math.min(hi, centre + width / 2);
  const band = evenly(b0, b1, m.spacing);
  const below = b0 - lo > 1e-6 ? evenly(lo, b0, m.outer).slice(0, -1) : [];
  const above = hi - b1 > 1e-6 ? evenly(b1, hi, m.outer).slice(1) : [];
  return { positions: [...below, ...band, ...above], inBand: band.length, band: { lo: b0, hi: b1 } };
}

/** Bars in a layer and their area, cm², with the band's. */
export function meshArea(dir: 'x' | 'y', a: Pick<FootingAdopted, 'B' | 'L' | 'ex' | 'ey'>, m: FootingMesh, cover: number): { count: number; area: number; band: number } {
  const s = meshSpan(dir, a, m, cover), one = m.dia > 0 ? barArea(m.dia) : 0;
  return { count: s.positions.length, area: s.positions.length * one, band: s.inBand * one };
}

const cmText = (s: number) => String(Math.round(s * 1000) / 10);

export const meshText = (m: FootingMesh): string => (m.dia > 0
  ? `Ø${m.dia} c/${cmText(m.spacing)}${m.outer ? ` (${cmText(m.outer)})` : ''}`
  : '—');

/**
 * The bars a direction needs, cm² over the footing's width: the lightest of the diameters
 * offered, the preferred one first, no closer than 10 cm (7,5 cm when none fits) and no farther
 * than `sMax`; a short direction split into its band and the rest (§13.3.3.3).
 */
export function proposeLayer(dir: 'x' | 'y', a: Pick<FootingAdopted, 'B' | 'L' | 'ex' | 'ey'>, asReq: number, sMax: number, diameters: readonly number[], cover: number): FootingMesh {
  const across = dir === 'x' ? a.L : a.B;
  const banded = isBanded(dir, a.B, a.L);
  const share = banded ? bandShare(a.B, a.L) : 1, width = Math.min(a.B, a.L);
  const fits = (m: FootingMesh) => {
    const p = meshArea(dir, a, m, cover);
    return p.area >= asReq - 1e-9 && (!banded || p.band >= share * asReq - 1e-9);
  };
  const mm = (v: number) => Math.round(roundDown(v) * 1000) / 1000;
  const shape = (dia: number): FootingMesh => {
    const one = barArea(dia);
    if (!banded) return { dia, spacing: mm(Math.min(sMax, (one * across) / Math.max(asReq, 1e-9))) };
    return {
      dia,
      spacing: mm(Math.min(sMax, (one * width) / Math.max(share * asReq, 1e-9))),
      outer: mm(Math.min(sMax, (one * Math.max(across - width, 1e-9)) / Math.max((1 - share) * asReq, 1e-9))),
    };
  };
  const tighten = (m: FootingMesh): FootingMesh => {
    let x = m;
    for (let k = 0; k < 20 && !fits(x) && x.spacing > 0.05 + 1e-9; k++) x = { ...x, spacing: mm(x.spacing - 0.025), ...(x.outer ? { outer: mm(Math.max(0.05, x.outer - 0.025)) } : {}) };
    return x;
  };
  for (const floor of [0.1, 0.075]) for (const dia of diameters) {
    const m = tighten(shape(dia));
    if (m.spacing >= floor - 1e-9 && fits(m)) return m;
  }
  return tighten(shape(diameters[diameters.length - 1] ?? 16));
}

/**
 * The anchorage of a layer past the face where its moment is largest (§13.2.8.3): straight when
 * ld (§25.4.2.4) fits between the face and the bar's end, else with a standard hook when ldh does
 * (§25.4.3).
 */
export function layerAnchorage(mat: Materials, m: FootingMesh, h: number, cover: number, cantilever: number): { ld: number; available: number; hooked: boolean; ok: boolean } {
  const available = Math.max(0, cantilever - cover);
  if (!(m.dia > 0)) return { ld: 0, available, hooked: false, ok: true };
  const ld = cirsocSlabDevelopment(mat, m.dia, false, h, { cover, spacing: m.spacing }).ldM;
  if (ld <= available + 1e-9) return { ld, available, hooked: false, ok: true };
  const ldh = deriveHookedDevelopment({ diameterMm: m.dia, fy: mat.fy, fc: mat.fc, edition: '2025' }).ldhM;
  return { ld: ldh, available, hooked: true, ok: ldh <= available + 1e-9 };
}
