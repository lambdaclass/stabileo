/**
 * Circular columns under axial load and bending. CIRSOC 201-05 §10.
 *
 * ── Why this cannot reuse the rectangular scan ─────────────────────
 *
 * `interaction-diagram.ts` idealises a rectangular column as two steel layers,
 * one at `d` and one at `d'`. That is exact for a section with bars on two
 * faces and meaningless for a round one: a circular column's bars sit on a
 * ring, every one at its own depth, and the two nearest the neutral axis are
 * doing almost nothing while the two at the extremes decide the answer.
 * Collapsing them into two layers would report a strength the column does not
 * have — and would be worst exactly where columns are checked, near balanced
 * failure.
 *
 * So the steel is summed bar by bar, and the concrete is a circular segment
 * rather than a rectangle. Both have closed forms; neither needs numerical
 * integration, and the two together are about forty lines. What is shared with
 * the rectangular case is the part that should be: β₁, the strain limits, the
 * φ transition, and the shape of the result, so a caller can put a round
 * column and a rectangular one on the same chart.
 *
 * ── The compression block ──────────────────────────────────────────
 *
 * A chord at depth `a` from the extreme fibre cuts off a segment of central
 * angle θ = 2·arccos((R−a)/R), whose area is R²(θ − sin θ)/2 and whose
 * centroid sits (4R·sin³(θ/2)) / (3(θ − sin θ)) from the centre, toward the
 * compressed face. Both degenerate correctly: at a = 0 the segment vanishes,
 * at a = 2R it is the whole circle with its centroid at the centre.
 *
 * ── Sign convention, stated once ───────────────────────────────────
 *
 * Compression is positive, for forces and for strains. `z` is measured from
 * the section centre toward the compressed face, so a bar in tension at the
 * far side has negative force and negative z, and its contribution to the
 * moment is positive — the same sense as the concrete's. `Mn = Σ F·z` needs no
 * special case for the tension side, which is the reason for choosing it.
 */

const EPSILON_CU = 0.003;
const ES_KPA = 200_000 * 1000; // kN/m²

/** β₁ per §10.2.7.3. */
function beta1(fc: number): number {
  if (fc <= 28) return 0.85;
  return Math.max(0.65, 0.85 - (0.05 * (fc - 28)) / 7);
}

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
   * The workbook this module answers to offers it as a switch, and it is a
   * real effect: a bar in the compression zone occupies concrete that is
   * already being counted. It is worth a per cent or two, always on the
   * conservative side when off, and off is what the rectangular path here
   * does — so it defaults to off and the two agree unless asked otherwise.
   */
  deductDisplacedConcrete?: boolean;
  /** Points on the curve. */
  nPoints?: number;
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

/** Area and centroid of the compression segment cut at depth `a`. */
export function circularSegment(D: number, a: number): { area: number; zc: number } {
  const R = D / 2;
  if (a <= 0) return { area: 0, zc: 0 };
  if (a >= D) return { area: Math.PI * R * R, zc: 0 };

  const theta = 2 * Math.acos((R - a) / R); // central angle, rad
  const area = (R * R * (theta - Math.sin(theta))) / 2;
  /*
   * Guarded because the closed form is 0/0 as the segment vanishes. The limit
   * is the extreme fibre itself, R, which is what a vanishing sliver's
   * centroid tends to.
   */
  const denom = 3 * (theta - Math.sin(theta));
  const zc = denom > 1e-12 ? (4 * R * Math.sin(theta / 2) ** 3) / denom : R;
  return { area, zc };
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

/** One point of the curve, for a given neutral-axis depth. */
function pointAt(p: CircularParams, c: number): CircularPoint {
  const { D, fc, fy, cover, AstCm2, barCount } = p;
  const spiral = p.confinement === 'spiral';
  const fc_kPa = fc * 1000;
  const fy_kPa = fy * 1000;
  const R = D / 2;
  const b1 = beta1(fc);
  const ey = fy / 200_000;

  const a = Math.min(b1 * c, D);
  const seg = circularSegment(D, a);
  const Cc = 0.85 * fc_kPa * seg.area; // kN

  const AsBar = (AstCm2 * 1e-4) / Math.max(barCount, 1); // m² per bar
  const bars = barRing(D, cover, barCount);

  let Ps = 0;
  let Ms = 0;
  let epsMostTensile = 0;
  for (const bar of bars) {
    const eps = c > 1e-6 ? (EPSILON_CU * (c - bar.d)) / c : -10 * ey;
    const fs = Math.max(-fy_kPa, Math.min(fy_kPa, eps * ES_KPA)); // kN/m²
    let F = AsBar * fs; // + compression
    if (p.deductDisplacedConcrete && eps > 0 && bar.d <= a) {
      F -= AsBar * 0.85 * fc_kPa;
    }
    Ps += F;
    Ms += F * bar.z;
    if (eps < epsMostTensile) epsMostTensile = eps;
  }

  const Pn = Cc + Ps;
  const Mn = Cc * seg.zc + Ms;

  /* φ from the net tensile strain in the outermost tension bar (§9.3.2). */
  const epsT = Math.abs(Math.min(epsMostTensile, 0));
  const phiC = spiral ? 0.75 : 0.65;
  let phi: number;
  if (epsT >= 0.005) phi = 0.90;
  else if (epsT <= ey) phi = phiC;
  else phi = phiC + (0.90 - phiC) * ((epsT - ey) / (0.005 - ey));

  /*
   * §10.3.6's cap on axial load, applied to the DESIGN value.
   *
   * It exists because no column is loaded at a truly zero eccentricity, so
   * the code refuses to credit the pure-compression ordinate. 0.85 for a
   * spiral against 0.80 for ties, for the same reason the φ differs.
   */
  const Ag = Math.PI * R * R;
  const Ast = AstCm2 * 1e-4;
  const Pn0 = 0.85 * fc_kPa * (Ag - Ast) + fy_kPa * Ast;
  const phiPnMax = phiC * (spiral ? 0.85 : 0.80) * Pn0;

  const phiPn = Math.min(phi * Pn, phiPnMax);
  return { phiPn, phiMn: phi * Mn, c, epsT, phi };
}

/**
 * The φPn–φMn curve for a circular column, from pure compression to pure
 * tension.
 */
export function generateCircularInteraction(p: CircularParams): CircularDiagram {
  const { D, fy, cover } = p;
  const nPts = p.nPoints ?? 40;
  const R = D / 2;
  const dt = R + (R - cover); // depth to the outermost bar on the tension side
  const ey = fy / 200_000;

  const cs: number[] = [10 * D];
  for (let i = 0; i <= nPts; i++) {
    const c = 2 * D * (1 - i / nPts);
    if (c > 1e-4) cs.push(c);
  }
  /* The balanced depth, added explicitly so the curve has the point by name. */
  const cb = (dt * EPSILON_CU) / (EPSILON_CU + ey);
  cs.push(cb);
  cs.push(1e-4);
  cs.sort((x, y) => y - x);

  const points = cs.map((c) => pointAt(p, c));
  const balanced = pointAt(p, cb);
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
  steps: string[];
}

/**
 * Is (Pu, Mu) inside the curve?
 *
 * Measured along the ray from the origin through the demand point, which is
 * the comparison an engineer draws by hand: it holds the eccentricity fixed
 * and asks how much further the column could be pushed at that eccentricity.
 * Comparing moments at constant axial load instead would report an infinite
 * reserve for a point above the nose of the curve, where there is none.
 */
export function checkColumnCircular(p: CircularParams, Pu: number, Mu: number): CircularCheck {
  const diag = generateCircularInteraction(p);
  const MuAbs = Math.abs(Mu);
  const steps: string[] = [
    `Columna circular D = ${(p.D * 100).toFixed(0)} cm, ${p.barCount} barras, Ast = ${p.AstCm2.toFixed(2)} cm²`,
    `Pu = ${Pu.toFixed(2)} kN, Mu = ${MuAbs.toFixed(2)} kN·m`,
  ];

  /*
   * Pure bending is the ray straight along the moment axis, and the search
   * below cannot represent it — every segment crossing would need Pu ≠ 0. It
   * is also the case a beam-column reduces to, so it is answered directly.
   */
  if (Math.abs(Pu) < 1e-9) {
    let best = 0;
    let at = diag.points[0];
    for (const pt of diag.points) {
      if (pt.phiPn >= 0 && pt.phiMn > best) { best = pt.phiMn; at = pt; }
    }
    const ratio = best > 0 ? MuAbs / best : Infinity;
    steps.push(`Flexión pura: φMn,máx = ${best.toFixed(2)} kN·m`);
    return {
      Pu, Mu: MuAbs, phiPn: 0, phiMn: best, ratio,
      status: ratio <= 1 ? 'ok' : 'fail', epsT: at.epsT, phi: at.phi, steps,
    };
  }

  /*
   * Walk the curve and find where it crosses the ray. The curve is ordered by
   * neutral-axis depth, so consecutive points bracket the crossing exactly
   * once for a demand in the first quadrant.
   */
  const slope = MuAbs / Pu; // M per unit P along the ray
  let capP = 0;
  let capM = 0;
  let at = diag.points[0];
  for (let i = 0; i < diag.points.length - 1; i++) {
    const A = diag.points[i];
    const B = diag.points[i + 1];
    const fA = A.phiMn - slope * A.phiPn;
    const fB = B.phiMn - slope * B.phiPn;
    if (fA === 0 || fA * fB < 0) {
      const t = fA / (fA - fB);
      capP = A.phiPn + t * (B.phiPn - A.phiPn);
      capM = A.phiMn + t * (B.phiMn - A.phiMn);
      at = Math.abs(t) < 0.5 ? A : B;
      break;
    }
  }

  const demand = Math.hypot(MuAbs, Pu);
  const capacity = Math.hypot(capM, capP);
  const ratio = capacity > 1e-9 ? demand / capacity : Infinity;
  steps.push(`Capacidad sobre la recta de excentricidad: φPn = ${capP.toFixed(2)} kN, φMn = ${capM.toFixed(2)} kN·m`);
  steps.push(`Relación demanda/capacidad = ${ratio.toFixed(3)}`);

  return {
    Pu, Mu: MuAbs, phiPn: capP, phiMn: capM, ratio,
    status: ratio <= 1 ? 'ok' : 'fail', epsT: at.epsT, phi: at.phi, steps,
  };
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
  const lo0 = 0.01 * Ag * 1e4; // cm², §10.9.1 minimum
  const hi0 = 0.08 * Ag * 1e4; // cm², §10.9.1 maximum

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
