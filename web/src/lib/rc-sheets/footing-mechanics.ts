import { pressureField, type PressureField } from '../engine/foundation/pressure-field';
import { criticalGeometry, eccentricShear } from '../engine/detailing/punching-moment';
import { ALPHA_S, PHI_SHEAR, sqrtFcCapped, type ColumnPosition } from '../engine/detailing/punching-shear';
import type { FootingAction } from './footing-types';

export const CONCRETE_WEIGHT = 25;
export const ASSUMED_FILL_WEIGHT = 18;
/** The share of the base that must stay in contact under service loads: the resultant inside the middle third along one axis. */
export const MIN_CONTACT = 0.5;

/** A footing's plan and where its column stands, m: the column centre at (xc, yc) from the centroid, b along X, h along Y. */
export interface FootingPlan { B: number; L: number; xc: number; yc: number; b: number; h: number; /** What bears on the footing where it is less than b × h (a pier's section), m². */ area?: number }

/**
 * The resultant on the base of an action given at the support node, `lever` above the base, as
 * pressure-field moments: `my` moves the resultant along +X and `mx` along +Y.
 */
export function atBase(a: Pick<FootingAction, 'N' | 'Mx' | 'My' | 'Vx' | 'Vy'>, p: Pick<FootingPlan, 'xc' | 'yc'>, lever: number, extra = 0): { N: number; my: number; mx: number } {
  const MyBase = a.My + lever * a.Vx + a.N * p.xc;
  const MxBase = a.Mx - lever * a.Vy - a.N * p.yc;
  return { N: a.N + extra, my: MyBase, mx: -MxBase };
}

export function fieldOf(p: FootingPlan, a: FootingAction, lever: number, extra = 0): PressureField {
  const r = atBase(a, p, lever, extra);
  return pressureField(p.B, p.L, r.N, r.my, r.mx);
}

const GRID = 48;

export interface Strips { lo: number; du: number; centres: number[]; force: number[] }

/** The field summed in strips across `dir`, each strip's resultant at its centre. */
export function strips(f: PressureField, p: Pick<FootingPlan, 'B' | 'L'>, dir: 'x' | 'y'): Strips {
  const [S, W] = dir === 'x' ? [p.B, p.L] : [p.L, p.B];
  const du = S / GRID, dw = W / GRID;
  const centres = Array.from({ length: GRID }, (_, i) => -S / 2 + (i + 0.5) * du);
  const ws = Array.from({ length: GRID }, (_, j) => -W / 2 + (j + 0.5) * dw);
  const force = centres.map((u) => ws.reduce((s, w) => s + (dir === 'x' ? f.at(u, w) : f.at(w, u)) * du * dw, 0));
  return { lo: -S / 2, du, centres, force };
}

/** The soil's resultant on one side of the section at `s` (toward +u when `side` is 1) and its moment about it. */
export function beyond(st: Strips, s: number, side: 1 | -1): { V: number; M: number } {
  let V = 0, M = 0;
  st.centres.forEach((u, i) => {
    const a = u - st.du / 2, b = u + st.du / 2;
    const [x0, x1] = side === 1 ? [Math.max(a, s), b] : [a, Math.min(b, s)];
    if (x1 <= x0) return;
    const F = (st.force[i]! * (x1 - x0)) / st.du;
    V += F;
    M += F * Math.abs((x0 + x1) / 2 - s);
  });
  return { V, M };
}

export interface FaceReading { mu: number; vu: number; atFace: 1 | -1 | 0; cantilevers: [number, number] }

/** §13.2.6.6 and §13.2.7: the moment at each column face and the one-way shear at d beyond it, the larger of the two sides. */
export function faceReading(f: PressureField, p: FootingPlan, dir: 'x' | 'y', d: number): FaceReading {
  const st = strips(f, p, dir);
  const S = dir === 'x' ? p.B : p.L, c = dir === 'x' ? p.xc : p.yc, half = (dir === 'x' ? p.b : p.h) / 2;
  const faces: Array<[1 | -1, number]> = [[1, c + half], [-1, c - half]];
  let mu = 0, vu = 0, atFace: 1 | -1 | 0 = 0;
  for (const [side, s] of faces) {
    if (side * s >= S / 2 - 1e-6) continue;
    const m = beyond(st, s, side).M;
    if (m > mu) { mu = m; atFace = side; }
    const sv = s + side * d;
    if (side * sv < S / 2 - 1e-6) vu = Math.max(vu, beyond(st, sv, side).V);
  }
  return { mu, vu, atFace, cantilevers: [Math.max(0, S / 2 - (c + half)), Math.max(0, c - half + S / 2)] };
}

export interface FootingPunching { vu: number; Vu: number; phiVc: number; vc: number; utilization: number; bo: number; beta: number; position: ColumnPosition }

/**
 * Two-way shear at d/2 from the column (§22.6.4.1): the column load less the soil inside the
 * perimeter, its moments by eccentric shear (§8.4.4.2), vc of Table 22.6.5.2 with λs = 1
 * (§13.2.6.2(b)). A face within d/2 of an edge cuts the perimeter there.
 */
export function footingPunching(f: PressureField, p: FootingPlan, d: number, a: FootingAction, stub: number, fc: number): FootingPunching {
  const nearX = Math.min(p.B / 2 - (p.xc + p.b / 2), p.xc - p.b / 2 + p.B / 2) <= d / 2 + 1e-6;
  const nearY = Math.min(p.L / 2 - (p.yc + p.h / 2), p.yc - p.h / 2 + p.L / 2) <= d / 2 + 1e-6;
  const position: ColumnPosition = nearX && nearY ? 'corner' : nearX || nearY ? 'edge' : 'interior';
  const edgeAxis = nearX ? 'x' as const : 'y' as const;
  const g = criticalGeometry(p.b, p.h, d, position, edgeAxis);
  const x0 = Math.max(-p.B / 2, p.xc - (p.b + d) / 2), x1 = Math.min(p.B / 2, p.xc + (p.b + d) / 2);
  const y0 = Math.max(-p.L / 2, p.yc - (p.h + d) / 2), y1 = Math.min(p.L / 2, p.yc + (p.h + d) / 2);
  const n = 12;
  let q = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) q += f.at(x0 + ((i + 0.5) * (x1 - x0)) / n, y0 + ((j + 0.5) * (y1 - y0)) / n);
  const inside = (q / (n * n)) * Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const Vu = Math.max(0, a.N - inside);
  const ecc = eccentricShear({ b: p.b, h: p.h, d, position, edgeAxis, Vu, Mx: a.Mx - stub * a.Vy, My: a.My + stub * a.Vx });
  const beta = Math.max(p.b, p.h) / Math.max(1e-9, Math.min(p.b, p.h));
  const root = sqrtFcCapped(fc);
  const vc = Math.min(0.33, 0.17 * (1 + 2 / beta), 0.083 * (2 + (ALPHA_S[position] * d) / g.bo)) * root;
  const phiVc = PHI_SHEAR * vc;
  return { vu: ecc.vu, Vu, phiVc, vc, utilization: ecc.vu / phiVc, bo: g.bo, beta, position };
}

/** §22.8.3: φ·0,85·f'c·A1, times √(A2/A1) ≤ 2 on the footing, A2 the largest area like the column's and concentric with it that the top holds. */
export function bearingStrength(p: FootingPlan, fcColumn: number, fcFooting: number): { column: number; footing: number; root: number } {
  const A1 = p.area ?? p.b * p.h;
  const k = Math.max(1, Math.min((p.B / 2 - Math.abs(p.xc)) / (p.b / 2), (p.L / 2 - Math.abs(p.yc)) / (p.h / 2)));
  const root = Math.min(2, k);
  return { column: 0.65 * 0.85 * fcColumn * A1 * 1000, footing: 0.65 * 0.85 * fcFooting * A1 * root * 1000, root };
}

export interface ServiceBearing { qMax: number; qMin: number; qMean: number; contact: number; ex: number; ey: number; overturns: boolean; weight: number }

/** The service pressure under the base, kPa: the column's gravity loads and the weight of the footing and of the fill over it. */
export function serviceBearing(p: FootingPlan, a: FootingAction, h: number, lever: number, fillWeight: number): ServiceBearing {
  const fill = Math.max(0, lever - h);
  const weight = (CONCRETE_WEIGHT * h + fillWeight * fill) * p.B * p.L;
  const f = fieldOf(p, a, lever, weight);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => f.plane.a + f.plane.b * (u! * p.B) / 2 + f.plane.c * (v! * p.L) / 2);
  return { qMax: f.qMax, qMin: Math.max(0, Math.min(...corners)), qMean: (a.N + weight) / (p.B * p.L), contact: f.contact, ex: f.eB, ey: f.eL, overturns: f.overturns, weight };
}

export const bearingUse = (s: ServiceBearing, allowable: number, edgeFactor: number): number =>
  s.overturns ? Infinity : Math.max(s.qMean / allowable, s.qMax / (edgeFactor * allowable));

export const bearingHolds = (s: ServiceBearing, allowable: number, edgeFactor: number): boolean =>
  !s.overturns && s.contact >= MIN_CONTACT - 1e-9 && bearingUse(s, allowable, edgeFactor) <= 1 + 1e-9;
