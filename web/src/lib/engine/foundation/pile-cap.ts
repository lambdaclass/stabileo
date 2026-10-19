/**
 * A pile cap under a column, checked on its piles' reactions.
 *
 *   Piles      R_i = N/n + My·x_i/Σx² + Mx·y_i/Σy² (rigid cap), service with the cap's weight
 *              against the pile's capacity, none in tension.
 *   Flexure    at each column face, the factored reactions of the piles beyond it times their
 *              lever arm; As = Mu/(φ·0,9·d·fy) on the cap's width, never under 0,0018·b·h.
 *   Shear      one-way at d from each face: a pile whose centre is d_p/2 or more past the section
 *              counts whole, d_p/2 or more before it not at all, linearly between (§13.4.2.5),
 *              against Vc of Tabla 22.5.5.1 row (c), the cap having no stirrups (see `oneWayVc`).
 *   Punching   the column, less the piles inside its critical perimeter; and the most loaded
 *              corner pile on its own perimeter, cut by the cap's two edges.
 *
 * Local axes as `rigid-footing.ts`, piles and column centre about the cap's centroid.
 */
import { checkPunchingShear, type PunchingCheck } from '../detailing/punching-shear';
import { slabVc } from '../design/slabs/one-way-shear';
import { CIRSOC201_DESIGN_EDITION, shearSqrtFc, type Cirsoc201Edition } from '../codes/argentina/cirsoc201-basis';

export interface PileCapInput {
  B: number; L: number; thickness: number; cover: number; fc: number; fy: number;
  piles: ReadonlyArray<{ x: number; y: number }>;
  pileDiameter: number; pileCapacity: number;
  column: { x: number; y: number; cx: number; cy: number };
  service: { N: number; Mx: number; My: number };
  factored: { N: number; Mx: number; My: number };
  /** The CIRSOC 201 edition the one-way shear is read in. Absent: the design edition. */
  edition?: Cirsoc201Edition;
}

/** How the one-way Vc was read: Tabla 22.5.5.1 (c) with its size factor and ρw, or 2005's 0,17. */
export interface PileCapShear {
  vu: number; phiVc: number; utilization: number;
  basis: 'tabla22.5.5.1c' | 'cirsoc2005';
  /** §22.5.5.1.3, 1 for 2005. */
  lambdaS: number;
  /** As/(bw·d) of the cap's flexural steel in this direction (with the minimum). */
  rhoW: number;
  /** §22.5.5.1.1 governed: Vc = 0,42·√f'c·bw·d. */
  capped: boolean;
}

export interface PileCapResult {
  reactions: { service: number[]; factored: number[] };
  piles: { max: number; min: number; capacity: number; utilization: number; tension: boolean };
  x: { mu: number; as: number; shear: PileCapShear };
  y: { mu: number; as: number; shear: PileCapShear };
  punching: { column: number; cornerPile: number; checks: PunchingCheck[] };
  utilization: number;
}

export function pileReactions(piles: ReadonlyArray<{ x: number; y: number }>, N: number, My: number, Mx: number): number[] {
  const n = piles.length;
  const cx = piles.reduce((s, p) => s + p.x, 0) / n, cy = piles.reduce((s, p) => s + p.y, 0) / n;
  const sx = piles.reduce((s, p) => s + (p.x - cx) ** 2, 0), sy = piles.reduce((s, p) => s + (p.y - cy) ** 2, 0);
  return piles.map((p) => N / n + (sx > 0 ? (My * (p.x - cx)) / sx : 0) + (sy > 0 ? (Mx * (p.y - cy)) / sy : 0));
}

/**
 * One-way φVc of the cap across a width W, kN.
 *
 * CIRSOC 201-2025 §13.2.6.2(a) allows Vc = 0,17·λ·√f'c·bw·d only for shallow foundation members
 * «continuamente apoyados sobre el suelo» and designed as rigid; a pile cap rests on its piles,
 * so its one-way shear is §22.5.5.1. With no stirrups Av < Av,min, row (c) of Tabla 22.5.5.1:
 * Vc = 0,66·λs·λ·ρw^⅓·√f'c·bw·d (Nu = 0 here), λs = √(2/(1 + 0,004·d)) ≤ 1 (§22.5.5.1.3, d in mm),
 * Vc ≤ 0,42·λ·√f'c·bw·d (§22.5.5.1.1), √f'c ≤ 8,3 MPa (§22.5.3.1). It used 0,17·√f'c·bw·d,
 * which on a cap 0,9 m deep at the minimum steel is about three times row (c).
 *
 * 2005 (CIRSOC 201-2005 §11.3.1.1) keeps 0,17·√f'c·bw·d: that edition has no size factor.
 */
export function pileCapOneWayVc(fc: number, W: number, d: number, as: number, edition: Cirsoc201Edition): Omit<PileCapShear, 'vu' | 'utilization'> {
  const rhoW = W > 0 && d > 0 ? as / (W * d) : 0;
  if (edition === '2005') {
    return { phiVc: 0.75 * 0.17 * Math.sqrt(Math.min(fc, 70)) * W * d * 1000, basis: 'cirsoc2005', lambdaS: 1, rhoW, capped: false };
  }
  const { vc, lambdaS } = slabVc(fc, W, d, rhoW);
  const vcMax = 0.42 * shearSqrtFc(fc) * W * d * 1000;
  return { phiVc: 0.75 * Math.min(vc, vcMax), basis: 'tabla22.5.5.1c', lambdaS, rhoW, capped: vc > vcMax };
}

/** Share of a pile's reaction past a section at s (toward +), by §13.4.2.5. */
const share = (pos: number, s: number, dp: number) => Math.max(0, Math.min(1, (pos - s) / dp + 0.5));

export function checkPileCap(c: PileCapInput): PileCapResult {
  const d = c.thickness - c.cover - 0.016;
  const weight = 25 * c.B * c.L * c.thickness;
  const Mcol = (a: { N: number; Mx: number; My: number }) => ({ My: a.My + a.N * c.column.x, Mx: a.Mx + a.N * c.column.y });
  const sm = Mcol(c.service), fm = Mcol(c.factored);
  const service = pileReactions(c.piles, c.service.N + weight, sm.My, sm.Mx);
  const factored = pileReactions(c.piles, c.factored.N, fm.My, fm.Mx);
  const max = Math.max(...service), min = Math.min(...service);
  const piles = { max, min, capacity: c.pileCapacity, utilization: max / c.pileCapacity, tension: min < -1e-9 };

  const dir = (axis: 'x' | 'y') => {
    const u = (p: { x: number; y: number }) => (axis === 'x' ? p.x : p.y);
    const half = (axis === 'x' ? c.column.cx : c.column.cy) / 2, at = u(c.column), W = axis === 'x' ? c.L : c.B;
    let mu = 0, vu = 0;
    for (const sign of [1, -1]) {
      const face = at + sign * half;
      let m = 0, v = 0;
      c.piles.forEach((p, i) => {
        const beyond = sign * (u(p) - face);
        if (beyond > 0) m += factored[i]! * beyond;
        v += factored[i]! * share(sign * u(p), sign * (face + sign * d), c.pileDiameter);
      });
      mu = Math.max(mu, m); vu = Math.max(vu, v);
    }
    const as = Math.max((mu * 1000) / (0.9 * 0.9 * d * c.fy * 1e6), 0.0018 * W * c.thickness);
    // ρw from the steel this direction gets: the flexural As, never under the minimum.
    const vc = pileCapOneWayVc(c.fc, W, d, as, c.edition ?? CIRSOC201_DESIGN_EDITION);
    return { mu, as, shear: { vu, ...vc, utilization: vu / vc.phiVc } };
  };
  const x = dir('x'), y = dir('y');

  // Column punching: the piles whose centres fall inside its critical perimeter carry their load there.
  const hx = (c.column.cx + d) / 2, hy = (c.column.cy + d) / 2;
  const inside = c.piles.reduce((s, p, i) => s + (Math.abs(p.x - c.column.x) <= hx && Math.abs(p.y - c.column.y) <= hy ? factored[i]! : 0), 0);
  const col = checkPunchingShear({
    fc: c.fc, columnB: c.column.cx, columnH: c.column.cy, d, position: 'interior',
    demand: { supportReaction: c.factored.N, loadInsidePerimeter: inside / ((c.column.cx + d) * (c.column.cy + d)), unbalancedMomentX: c.factored.Mx, unbalancedMomentY: c.factored.My },
  });
  // The most loaded pile nearest a corner, on a perimeter cut by the cap's two edges.
  const k = factored.indexOf(Math.max(...factored));
  const corner = checkPunchingShear({ fc: c.fc, columnB: c.pileDiameter, columnH: c.pileDiameter, d, position: 'corner', shape: 'circular', demand: { supportReaction: Math.max(0, factored[k]!), loadInsidePerimeter: 0 } });

  const utilization = Math.max(piles.tension ? Infinity : 0, piles.utilization, x.shear.utilization, y.shear.utilization, col.utilization, corner.utilization);
  return { reactions: { service, factored }, piles, x, y, punching: { column: col.utilization, cornerPile: corner.utilization, checks: [col, corner] }, utilization };
}
