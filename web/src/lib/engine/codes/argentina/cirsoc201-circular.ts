/**
 * Circular columns under axial load and bending — computed by the engine.
 *
 * The bars sit on a ring, each at its own depth, and are summed bar by bar; the concrete is the
 * compressed part of the circle. Both are the Rust section engine's
 * (`engine/src/postprocess/cirsoc201_section.rs`), with the circle as the same 360-sided polygon
 * the CIRSOC_FLEX calculator uses (inscribed: its area is 0,005 % short of πR², on the safe
 * side). φ (ties or spiral, Tabla 21.2.2 of the edition) and the axial cap (Tabla 22.4.2.1,
 * 0,85·Po with a spiral) are the engine's too. This module lays out the bars (`barRing`), picks
 * the depths to plot, and searches for the steel (`designCircular`). The TypeScript closed form
 * it replaced (the circular segment) is the oracle in `__tests__/differential/oracle/`.
 *
 * Sign convention: compression positive; the first bar at the top, which is compressed.
 */

import { yieldStrain, EPSILON_CU, COLUMN_STEEL_RATIO, type Cirsoc201EditionLike } from './cirsoc201-basis';
import { prepareSection, withSection, type Bar } from './cirsoc201-section';

export interface CircularParams {
  /** Outside diameter, m. */
  D: number;
  fc: number;
  fy: number;
  /** Clear cover to the centre of a longitudinal bar, m. */
  cover: number;
  /** Total longitudinal steel, cm², spread evenly around the ring. */
  AstCm2: number;
  /** How many bars that steel is divided into. */
  barCount: number;
  /**
   * Closed ties or a spiral. §9.3.2.2 gives a spiral the higher φ and the
   * higher cap on axial load, because a spiral keeps the core together after
   * the shell spalls and a tie does not.
   */
  confinement?: 'ties' | 'spiral';
  /**
   * Subtract the concrete the compression bars displace.
   *
   * DEFAULTS TO ON. A bar in the compression zone occupies concrete the
   * block is already credited with, so leaving it out counts that area
   * twice and overstates the capacity — the opposite of what an earlier
   * version of this comment claimed. Against the workbook's own circular
   * example, off was 5 % light on steel.
   */
  deductDisplacedConcrete?: boolean;
  /** Points on the curve. */
  nPoints?: number;
  /** CIRSOC 201 edition (a spiral's φ is 0,70 in 2005 and 0,75 in 2025). Default 2025. */
  edition?: Cirsoc201EditionLike;
}

export interface CircularPoint {
  phiPn: number;
  phiMn: number;
  /** Neutral axis depth from the extreme compression fibre, m. */
  c: number;
  /** Net tensile strain in the outermost bar on the tension side. */
  epsT: number;
  phi: number;
  label?: string;
}

export interface CircularDiagram {
  points: CircularPoint[];
  balanced: CircularPoint;
  pureCompression: CircularPoint;
  pureTension: CircularPoint;
  D: number;
  fc: number;
  fy: number;
  AstCm2: number;
  barCount: number;
}

/** Where each bar sits: z above the centre, and depth from the top fibre. */
export function barRing(D: number, cover: number, barCount: number): Array<{ z: number; d: number }> {
  const R = D / 2;
  const Rs = R - cover;
  const out: Array<{ z: number; d: number }> = [];
  for (let i = 0; i < barCount; i++) {
    /*
     * The first bar sits at the top. That is the orientation a designer
     * assumes when they draw the section, and for the bar counts that occur
     * in practice it is also the least favourable common case — the two
     * extreme fibres each have a bar, so nothing is credited to steel that
     * happens to have been rotated into a better place.
     */
    const ang = (2 * Math.PI * i) / barCount;
    const z = Rs * Math.cos(ang);
    out.push({ z, d: R - z });
  }
  return out;
}

/** The ring as engine bars, the first one at the top (+y). */
function ringBars(p: CircularParams): Bar[] {
  const AsBar = (p.AstCm2 * 1e-4) / Math.max(p.barCount, 1);
  const R = p.D / 2;
  return barRing(p.D, p.cover, p.barCount).map((b, i) => {
    const ang = (2 * Math.PI * i) / p.barCount;
    return { x: (R - p.cover) * Math.sin(ang), y: b.z, area: AsBar };
  });
}

function materialsOf(p: CircularParams) {
  return {
    fc: p.fc, fy: p.fy, confinement: p.confinement ?? 'ties',
    deductDisplacedConcrete: p.deductDisplacedConcrete ?? true, edition: p.edition ?? '2025',
  } as const;
}

/**
 * The φPn–φMn curve for a circular column, from pure compression to pure tension.
 */
export function generateCircularInteraction(p: CircularParams): CircularDiagram {
  const { D, fy, cover } = p;
  const nPts = p.nPoints ?? 40;
  const R = D / 2;
  const dt = R + (R - cover); // depth to the outermost bar on the tension side
  const cs: number[] = [10 * D];
  for (let i = 0; i <= nPts; i++) {
    const c = 2 * D * (1 - i / nPts);
    if (c > 1e-4) cs.push(c);
  }
  /* The balanced depth, added explicitly so the curve has the point by name. */
  const cb = (dt * EPSILON_CU) / (EPSILON_CU + yieldStrain(fy));
  cs.push(cb);
  cs.push(1e-4);
  cs.sort((x, y) => y - x);
  const states = withSection({ kind: 'circle', D }, ringBars(p), materialsOf(p), (s) => s.points(Math.PI / 2, [...cs, cb]));
  const toPoint = (st: (typeof states)[number]): CircularPoint =>
    ({ phiPn: st.phiPn, phiMn: -st.phiMnx, c: st.c, epsT: st.epsilonT, phi: st.phi });
  const points = states.slice(0, cs.length).map(toPoint);
  const balanced = toPoint(states[cs.length]);
  balanced.label = 'Balanceado';
  return {
    points,
    balanced,
    pureCompression: points[0],
    pureTension: points[points.length - 1],
    D, fc: p.fc, fy: p.fy, AstCm2: p.AstCm2, barCount: p.barCount,
  };
}

export interface CircularCheck {
  /** The demand, as given. */
  Pu: number;
  Mu: number;
  /** Capacity on the ray from the origin through (Mu, Pu). */
  phiPn: number;
  phiMn: number;
  /** Demand over capacity along that ray. ≤ 1 passes. */
  ratio: number;
  status: 'ok' | 'fail';
  epsT: number;
  phi: number;
  /**
   * Neutral axis depth at the point on the curve the demand lands on, m.
   *
   * Reported because the panel draws the section: without it the column is
   * the one case that shows bars and no compression block, which reads as
   * the drawing having failed rather than as an omission.
   */
  c: number;
  steps: string[];
}

/**
 * Is (Pu, Mu) inside the curve? Measured by the engine along the ray from the origin through the
 * demand (`Section::ray`): it holds the eccentricity fixed and asks how much further the column
 * could be pushed. A pure moment is read where the curve crosses φPn = 0 (not at its nose).
 */
export function checkColumnCircular(p: CircularParams, Pu: number, Mu: number): CircularCheck {
  const MuAbs = Math.abs(Mu);
  const section = prepareSection({ kind: 'circle', D: p.D }, ringBars(p), materialsOf(p));
  try {
    const u = section.ray(Pu, MuAbs);
    const steps: string[] = [
      `Columna circular D = ${(p.D * 100).toFixed(0)} cm, ${p.barCount} barras, Ast = ${p.AstCm2.toFixed(2)} cm²`,
      `Pu = ${Pu.toFixed(2)} kN, Mu = ${MuAbs.toFixed(2)} kN·m`,
      Math.abs(Pu) < 1e-9
        ? `Flexión pura: φMn = ${u.phiMn.toFixed(2)} kN·m`
        : `Capacidad sobre la recta de excentricidad: φPn = ${u.phiPn.toFixed(2)} kN, φMn = ${u.phiMn.toFixed(2)} kN·m`,
      `Relación demanda/capacidad = ${u.ratio.toFixed(3)}`,
    ];
    return {
      Pu, Mu: MuAbs, phiPn: u.phiPn, phiMn: u.phiMn, ratio: u.ratio,
      status: u.ratio <= 1 ? 'ok' : 'fail', epsT: u.epsilonT ?? 0, phi: u.phi, c: u.c ?? 0, steps,
    };
  } finally {
    section.free();
  }
}

/**
 * The steel a circular column needs for a given demand.
 *
 * Bisection on the total area rather than a closed form, because there is no
 * closed form: the capacity depends on where every bar sits, and the bars move
 * when the count changes. Forty halvings over a range bounded by the code's
 * own limits — §10.9.1's 1 % and 8 % of the gross area — land far inside a
 * tenth of a square centimetre, which is finer than any bar schedule.
 *
 * Returns `null` when 8 % is not enough. That is a section too small for the
 * load, and answering with the maximum would be a design that does not work.
 */
export function designCircular(
  p: Omit<CircularParams, 'AstCm2'>,
  Pu: number,
  Mu: number,
): { AstCm2: number; ratio: number; check: CircularCheck } | null {
  const Ag = Math.PI * (p.D / 2) ** 2;
  const lo0 = COLUMN_STEEL_RATIO.min * Ag * 1e4; // cm², §10.9.1
  const hi0 = COLUMN_STEEL_RATIO.max * Ag * 1e4; // cm², §10.9.1

  const at = (AstCm2: number) => checkColumnCircular({ ...p, AstCm2 }, Pu, Mu);

  if (at(lo0).ratio <= 1) {
    const c = at(lo0);
    return { AstCm2: lo0, ratio: c.ratio, check: c };
  }
  if (at(hi0).ratio > 1) return null;

  let lo = lo0;
  let hi = hi0;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid).ratio > 1) lo = mid; else hi = mid;
  }
  const c = at(hi);
  return { AstCm2: hi, ratio: c.ratio, check: c };
}
