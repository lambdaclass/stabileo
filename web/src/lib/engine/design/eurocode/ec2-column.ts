/**
 * A rectangular reinforced-concrete column designed to EN 1992-1-1:2004 from simultaneous force
 * tuples: each demand is one combination at one station with its axial force and both moments,
 * and the steel is the least that carries every one of them. m, kN, MPa; areas in m².
 *
 *  · Each plane of bending on its own: width b (parallel to the axis of bending), depth h (in the
 *    plane), l0 and φef of that plane. The caller maps the section to the planes.
 *  · First order with imperfections: ei = l0/400 (5.2(7), the simplified θi of 5.2(9)) added to
 *    both end moments, and never less than NEd·e0, e0 = max(h/30; 20 mm) (6.1(4)). With both
 *    moments the imperfection acts in one plane at a time, the more unfavourable one (5.8.9(2)):
 *    both are tried and the worse governs.
 *  · Slenderness: λ = l0/i against λlim = 20·A·B·C/√n (5.8.3.1(1)), A = 1/(1 + 0,2·φef) with the
 *    same φef the curvature reads, B = 1,1 (ω not known in advance, as the clause allows), C =
 *    1,7 − rm braced, 0,7 unbraced.
 *  · Second order by nominal curvature (5.8.8): e2 = (1/r)·l0²/10 with 1/r = Kr·Kφ·εyd/(0,45·d),
 *    Kr = (nu − n)/(nu − 0,4) ≤ 1 from the steel itself and Kφ = 1 + β·φef ≥ 1. Braced: MEd =
 *    max(M02, M0e + M2, M01 + M2/2), M0e = 0,6·M02 + 0,4·M01 ≥ 0,4·M02 (5.8.8.2(2), (3));
 *    unbraced, M02 + M2. A plane that is slender takes its M2 whatever its first-order moment.
 *  · Both moments: separate checks where λy/λz and λz/λy are at most 2 and one relative
 *    eccentricity is at most 0,2 of the other (5.8.9(3), Eq. 5.38a, b); otherwise Eq. 5.39,
 *    (MEdz/MRdz)^a + (MEdy/MRdy)^a ≤ 1, a = 1 at NEd/NRd ≤ 0,1, 1,5 at 0,7, 2 at 1, straight lines
 *    between, NRd = Ac·fcd + As·fyd.
 *  · Tension: no imperfection and no second order (5.8 is a compression clause); the section by the
 *    same strain compatibility with the axial force in tension.
 *  · Section: strain compatibility with the rectangular block of 3.1.7(3), εcu3 at the compressed
 *    face, and in a section wholly in compression the pivot εc3 at 3h/7 from it (6.1(5)); steel
 *    elastic-perfectly plastic (3.2.7(2) b). Half of As on each face of the plane: bars at the
 *    corners, so either plane reads half the steel on each side. The least As whose resistance
 *    carries every demand, by bisection. Minimum and maximum steel of 9.5.2(2) and (3).
 */
import { statusOfRatio, type CheckInput, type CheckRow } from '../../../design-contract';
import { ec2Material, type Ec2Params } from './ec2-params';

type Mat = ReturnType<typeof ec2Material>;

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const inp = (symbol: string, value: number, unit?: string): CheckInput => ({ symbol, value: r3(value), ...(unit ? { unit } : {}) });

/** Axial force and moment about the centroid the section resists with neutral axis x, kN and kN·m. */
export function sectionResistance(x: number, s: { b: number; h: number; d2: number; as: number }, m: Mat, es: number): { n: number; m: number } {
  const { b, h, d2, as } = s;
  const strain = (y: number) => (x <= h ? (m.ecu3 * (x - y)) / x : (m.ec3 * (x - y)) / (x - (3 * h) / 7));
  const sig = (e: number) => Math.max(-m.fyd, Math.min(m.fyd, es * e)) * 1000; // kPa
  const depth = Math.min(m.lambda * x, h);
  const fc = m.eta * m.fcd * 1000 * b * depth;
  const f1 = (as / 2) * sig(strain(d2)), f2 = (as / 2) * sig(strain(h - d2));
  return { n: fc + f1 + f2, m: fc * (h / 2 - depth / 2) + f1 * (h / 2 - d2) - f2 * (h / 2 - d2) };
}

/** Moment the section resists at axial force N (compression positive), kN·m; null when N is beyond it. */
export function momentAt(N: number, s: { b: number; h: number; d2: number; as: number }, m: Mat, es: number): number | null {
  let lo = 1e-6 * s.h, hi = 1e3 * s.h;
  if (sectionResistance(hi, s, m, es).n < N || sectionResistance(lo, s, m, es).n > N) return null;
  for (let k = 0; k < 64; k++) { const mid = (lo + hi) / 2; if (sectionResistance(mid, s, m, es).n < N) lo = mid; else hi = mid; }
  return sectionResistance((lo + hi) / 2, s, m, es).m;
}

/** One plane of bending. */
export interface Ec2ColumnPlane {
  /** Width (parallel to the axis of bending) and depth (in the plane of bending), m. */
  b: number; h: number;
  /** Effective length in this plane, m. */
  l0: number;
  /** Effective creep ratio for this plane, 5.8.4. */
  phiEf: number;
  /** Steel resisting this plane's moment, total with half on each face, m²; absent: the column's As. */
  as?: number;
}

/** One simultaneous force tuple: compression positive, kN; per plane the moment at the station and the end moments of the same combination (signs of the diagram), kN·m. */
export interface Ec2ColumnDemand {
  N: number;
  planes: Array<{ M: number; ends?: [number, number] }>;
  combination?: string; location?: string;
}

export interface Ec2ColumnInput {
  /** One plane (uniaxial) or two (the planes of My and of Mz). */
  planes: Ec2ColumnPlane[];
  cover: number; linkDia: number; barDia: number;
  fck: number; fyk: number;
  params: Ec2Params;
  braced: boolean;
  demands: Ec2ColumnDemand[];
  /** Check this steel instead of designing: total area, m², and its d2, m. */
  provided?: { asTotal: number; d2: number };
}

export interface Ec2PlaneReading {
  M01: number; M02: number; rm: number; ei: number; e0: number;
  n: number; lambda: number; lambdaLim: number; slender: boolean;
  M2: number; MEd: number; MRd: number | null; imperfect: boolean;
}

export interface Ec2DemandReading {
  /** Utilisation: the larger MEd/MRd, or Eq. 5.39. */
  u: number;
  planes: Ec2PlaneReading[];
  /** Eq. 5.39 applied, with its exponent and NEd/NRd. */
  biaxial: boolean; a?: number; nRatio?: number;
  demand: Ec2ColumnDemand;
}

export interface Ec2ColumnResult {
  /** Total steel, m² (null: not even As,max carries it). */
  as: number | null; asMin: number; asMax: number; d2: number;
  /** Each demand read at the steel found (at As,max when nothing carries it). */
  readings: Ec2DemandReading[];
  governing: Ec2DemandReading;
}

/**
 * The first-order end moments a plane is read with, the smaller first: those of the demand's own
 * combination, or the station's moment at both ends when it passes them (load along the column).
 */
function endPair(f: { M: number; ends?: [number, number] }): [number, number] {
  if (!f.ends) return [f.M, f.M];
  const [e1, e2] = f.ends;
  const [a1, a2] = Math.abs(e1) > Math.abs(e2) ? [e2, e1] : [e1, e2];
  return Math.abs(f.M) > Math.abs(a2) + 1e-9 ? [f.M, f.M] : [a1, a2];
}

/**
 * The demands that read differently: a demand is its N and each plane's end pair, so two stations
 * of one combination with the same axial force (a column loaded at its ends) are one reading.
 */
export function distinctDemands(demands: readonly Ec2ColumnDemand[]): Ec2ColumnDemand[] {
  const seen = new Set<string>();
  const key = (v: number) => (Math.abs(v) < 1e-9 ? '0' : v.toPrecision(12));
  return demands.filter((d) => {
    const k = [key(d.N), ...d.planes.flatMap((pl) => endPair(pl).map(key))].join('|');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function planeReading(
  pl: Ec2ColumnPlane, f: { M: number; ends?: [number, number] }, N: number, imperfect: boolean,
  i: Ec2ColumnInput, m: Mat, d2: number, asTotal: number, asPlane: number,
): Ec2PlaneReading {
  const p = i.params, ac = i.planes[0]!.b * i.planes[0]!.h, comp = N > 0;
  const [a1, a2] = endPair(f);
  const ei = comp && imperfect ? pl.l0 / 400 : 0, e0 = Math.max(pl.h / 30, 0.02);
  const sgn = a2 < 0 ? -1 : 1;
  const M02 = Math.abs(a2) + N * ei, M01 = sgn * a1 + N * ei;
  const rm = i.braced && M02 > 0 ? M01 / M02 : 1;
  const n = N / (ac * m.fcd * 1000);
  const lambda = pl.l0 / (pl.h / Math.sqrt(12));
  const A = 1 / (1 + 0.2 * pl.phiEf), C = i.braced ? 1.7 - rm : 0.7;
  const lambdaLim = n > 0 ? (p.lambdaLimCoeff * A * 1.1 * C) / Math.sqrt(n) : Number.POSITIVE_INFINITY;
  const slender = comp && lambda > lambdaLim;
  let M2 = 0;
  if (slender) {
    const omega = (asTotal * m.fyd) / (ac * m.fcd), nu = 1 + omega;
    const kr = Math.min(1, Math.max(0, (nu - n) / (nu - 0.4)));
    const beta = 0.35 + i.fck / 200 - lambda / 150, kphi = Math.max(1, 1 + beta * pl.phiEf);
    const e2 = (kr * kphi * (m.eyd / (0.45 * (pl.h - d2))) * pl.l0 * pl.l0) / 10;
    M2 = N * e2;
  }
  const floor = comp && imperfect ? N * e0 : 0;
  const MEd = !slender ? Math.max(M02, floor)
    : !i.braced ? Math.max(M02 + M2, floor)
    : Math.max(M02, Math.max(0.6 * M02 + 0.4 * M01, 0.4 * M02) + M2, M01 + M2 / 2, floor);
  const MRd = momentAt(N, { b: pl.b, h: pl.h, d2, as: asPlane }, m, p.es);
  return { M01, M02, rm, ei, e0, n, lambda, lambdaLim, slender, M2, MEd, MRd, imperfect };
}

const ratioOf = (r: Ec2PlaneReading) => (r.MRd === null ? Number.POSITIVE_INFINITY : r.MEd <= 1e-9 ? 0 : r.MRd <= 0 ? Number.POSITIVE_INFINITY : r.MEd / r.MRd);

/** Eq. 5.39's exponent for a rectangular section. */
export function biaxialExponent(nRatio: number): number {
  if (nRatio <= 0.1) return 1;
  if (nRatio <= 0.7) return 1 + ((nRatio - 0.1) / 0.6) * 0.5;
  if (nRatio <= 1) return 1.5 + ((nRatio - 0.7) / 0.3) * 0.5;
  return 2;
}

function demandReading(i: Ec2ColumnInput, dem: Ec2ColumnDemand, m: Mat, d2: number, asTotal: number, asPlanes: number[]): Ec2DemandReading {
  let worst: Ec2DemandReading | null = null;
  const variants = i.planes.length === 1 ? [0] : [0, 1];
  for (const v of variants) {
    const planes = i.planes.map((pl, k) => planeReading(pl, dem.planes[k] ?? { M: 0 }, dem.N, k === v, i, m, d2, asTotal, asPlanes[k]!));
    const ratios = planes.map(ratioOf);
    let r: Ec2DemandReading = { u: Math.max(...ratios), planes, biaxial: false, demand: dem };
    if (planes.length === 2 && ratios.every(Number.isFinite)) {
      const [y, z] = planes as [Ec2PlaneReading, Ec2PlaneReading];
      const lr = z.lambda > 0 ? y.lambda / z.lambda : Number.POSITIVE_INFINITY;
      // Relative eccentricities e/h of 5.38b; NEd is common to both and cancels.
      const ey = y.MEd / i.planes[0]!.h, ez = z.MEd / i.planes[1]!.h;
      const oneSmall = ey <= 1e-12 || ez <= 1e-12 || ey / ez <= 0.2 || ez / ey <= 0.2;
      if (!(lr <= 2 && lr >= 0.5 && oneSmall)) {
        const ac = i.planes[0]!.b * i.planes[0]!.h;
        const nRatio = dem.N / (ac * m.fcd * 1000 + asTotal * m.fyd * 1000);
        const a = biaxialExponent(nRatio);
        r = { u: ratios[1]! ** a + ratios[0]! ** a, planes, biaxial: true, a, nRatio, demand: dem };
      }
    }
    if (!worst || r.u > worst.u) worst = r;
  }
  return worst!;
}

/** The least steel that carries every demand, or the reading of the steel provided. */
export function ec2ColumnSolve(i: Ec2ColumnInput): Ec2ColumnResult {
  const p = i.params, m = ec2Material(i.fck, i.fyk, p);
  const ac = i.planes[0]!.b * i.planes[0]!.h;
  const d2 = i.provided?.d2 ?? i.cover + (i.linkDia + i.barDia / 2) / 1000;
  const nMax = Math.max(0, ...i.demands.map((d) => d.N));
  const asMin = Math.max((p.colMinN * nMax) / (m.fyd * 1000), p.colMinAbs * ac), asMax = p.colMaxRatio * ac;
  const demands = distinctDemands(i.demands);
  const readAt = (as: number, planes?: number[]) => demands.map((d) => demandReading(i, d, m, d2, as, planes ?? i.planes.map((pl) => pl.as ?? as)));
  const worst = (rs: Ec2DemandReading[]) => rs.reduce((a, b) => (b.u > a.u ? b : a));
  if (i.provided) {
    const readings = readAt(i.provided.asTotal, i.planes.map((pl) => pl.as ?? i.provided!.asTotal));
    return { as: i.provided.asTotal, asMin, asMax, d2, readings, governing: worst(readings) };
  }
  // Every demand must hold; the one that failed last is tried first, so a short steel is told at once.
  let lead = 0;
  const ok = (as: number) => {
    const planes = i.planes.map((pl) => pl.as ?? as);
    const fails = (k: number) => demandReading(i, demands[k]!, m, d2, as, planes).u > 1 + 1e-9;
    if (fails(lead)) return false;
    for (let k = 0; k < demands.length; k++) if (k !== lead && fails(k)) { lead = k; return false; }
    return true;
  };
  let as: number | null;
  if (!ok(asMax)) as = null;
  else if (ok(asMin)) as = asMin;
  else {
    let lo = asMin, hi = asMax;
    for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
    as = hi;
  }
  const readings = readAt(as ?? asMax);
  return { as, asMin, asMax, d2, readings, governing: worst(readings) };
}

/** What the rows name besides the forces: the planes, the assumptions the caller made, φ(∞,t0). */
export interface Ec2ColumnRowContext { names: string[]; assumptions?: string[]; phiInf?: number }

const sym = (s: string, name: string) => (name ? `${s},${name}` : s);

/** The design row of the column. */
export function ec2ColumnRows(i: Ec2ColumnInput, res: Ec2ColumnResult, c: Ec2ColumnRowContext): CheckRow[] {
  const base = { code: i.params.code, edition: '2004' };
  const g = res.governing, at = { ...(g.demand.combination ? { combination: g.demand.combination } : {}), ...(g.demand.location ? { location: g.demand.location } : {}) };
  const inputs: CheckInput[] = [
    inp('NEd', g.demand.N, 'kN'),
    ...g.planes.flatMap((r, k) => [inp(sym('MEd', c.names[k]!), r.MEd, 'kN·m'), inp(sym('λ', c.names[k]!), r.lambda), inp(sym('λlim', c.names[k]!), Number.isFinite(r.lambdaLim) ? r.lambdaLim : 0)]),
    ...i.planes.map((pl, k) => inp(sym('φef', c.names[k]!), pl.phiEf)),
    ...(c.phiInf !== undefined ? [inp('φ(∞,t0)', c.phiInf)] : []),
    ...(g.biaxial ? [inp('NEd/NRd', g.nRatio!), inp('a', g.a!), ...g.planes.map((r, k) => inp(sym('MRd', c.names[k]!), r.MRd ?? 0, 'kN·m'))] : []),
    inp('As,min', res.asMin * 1e4, 'cm²'),
  ];
  const lines = [
    ...g.planes.map((r, k) => {
      const name = c.names[k] ? `plane ${c.names[k]}: ` : '';
      if (g.demand.N <= 0) return `${name}axial tension: no imperfection nor second order; MEd = ${r.MEd.toFixed(1)} kN·m`;
      return `${name}λ = ${r.lambda.toFixed(1)} ${r.slender ? `> λlim = ${r.lambdaLim.toFixed(1)}: second order by nominal curvature (5.8.8), M2 = ${r.M2.toFixed(1)} kN·m` : `≤ λlim = ${Number.isFinite(r.lambdaLim) ? r.lambdaLim.toFixed(1) : '∞'}: first order (5.8.3.1)`}${r.imperfect ? `; ei = l0/400 = ${(r.ei * 1000).toFixed(1)} mm (5.2(7)), e0 = ${(r.e0 * 1000).toFixed(0)} mm (6.1(4))` : ''}`;
    }),
    ...(i.planes.length === 2 ? [g.biaxial ? `both moments: Eq. 5.39 with a = ${g.a!.toFixed(3)} (NEd/NRd = ${g.nRatio!.toFixed(3)})` : 'both moments: separate checks in each plane (5.8.9(3))', 'the imperfection in one plane at a time, the more unfavourable (5.8.9(2))'] : []),
    ...(c.assumptions ?? []),
  ];
  const row: CheckRow = res.as === null
    ? { ...base, clause: '6.1; 5.8', title: 'Axial force and moments', titleKey: 'check.ec2.columnSection', formula: 'NEd, MEd within the section with As ≤ As,max (9.5.2(3))', inputs, ratio: null, status: 'fail', ...at,
      derivation: ['the section does not carry them with the largest steel of 9.5.2(3)', ...lines] }
    : { ...base, clause: '6.1; 5.8', title: 'Axial force and moments', titleKey: 'check.ec2.columnSection', formula: 'NEd, MEd within the section (6.1); As,min ≤ As ≤ As,max (9.5.2)', inputs,
      demand: r3(res.as * 1e4), capacity: r3(res.asMax * 1e4), unit: 'cm²', ratio: r3(res.as / res.asMax), status: statusOfRatio(res.as / res.asMax), ...at,
      derivation: [`As = ${(res.as * 1e4).toFixed(2)} cm² in all, half on each face of either plane (bars at the corners)`, ...lines] };
  // Eq. 5.39 at the steel found reads 1 by construction where it governs: it is part of this design
  // row (inputs a, NEd/NRd, MRd), not a row of its own. The bars placed get one (`ec2-member.ts`).
  return [row];
}

/** Eq. 5.39 at one demand, as a row: for steel that was not sized by it. */
export function biaxialRow(base: { code: string; edition: string }, r: Ec2DemandReading, c: Ec2ColumnRowContext, titleKey: string, title: string): CheckRow {
  return {
    ...base, clause: '5.8.9(4)', title, titleKey, formula: '(MEd,z/MRd,z)^a + (MEd,y/MRd,y)^a ≤ 1 (Eq. 5.39)',
    inputs: [inp('NEd/NRd', r.nRatio ?? 0), inp('a', r.a ?? 1), ...r.planes.flatMap((p, k) => [inp(sym('MEd', c.names[k]!), p.MEd, 'kN·m'), inp(sym('MRd', c.names[k]!), p.MRd ?? 0, 'kN·m')])],
    demand: r3(r.u), capacity: 1, ratio: r3(r.u), status: statusOfRatio(r.u),
    ...(r.demand.combination ? { combination: r.demand.combination } : {}), ...(r.demand.location ? { location: r.demand.location } : {}),
  };
}

/** The uniaxial design of one plane: an axial force and its two first-order end moments. */
export interface Ec2UniaxialInput {
  /** Width (parallel to the axis of bending) and depth (in the plane of bending), cover to the links, m; diameters, mm. */
  b: number; h: number; cover: number; linkDia: number; barDia: number;
  fck: number; fyk: number;
  /** Design axial force, compression positive, kN; first-order end moments, kN·m (|M02| ≥ |M01|, same sign in single curvature). */
  NEd: number; M01: number; M02: number;
  /** Effective length in the plane of bending, m. */
  l0: number;
  params: Ec2Params;
  /** Braced against sway (default), or not. */
  braced?: boolean;
  /** Effective creep ratio, 5.8.4: read by both λlim's A and the curvature's Kφ. */
  phiEf: number;
}

export interface Ec2ColumnDesign { as: number | null; MEd: number; M2: number; eTot: number; lambda: number; lambdaLim: number; rows: CheckRow[] }

export function ec2ColumnDesign(i: Ec2UniaxialInput): Ec2ColumnDesign {
  const input: Ec2ColumnInput = {
    planes: [{ b: i.b, h: i.h, l0: i.l0, phiEf: i.phiEf }], cover: i.cover, linkDia: i.linkDia, barDia: i.barDia,
    fck: i.fck, fyk: i.fyk, params: i.params, braced: i.braced !== false,
    demands: [{ N: i.NEd, planes: [{ M: i.M02, ends: [i.M01, i.M02] }] }],
  };
  const res = ec2ColumnSolve(input), g = res.governing.planes[0]!;
  return { as: res.as, MEd: g.MEd, M2: g.M2, eTot: i.NEd > 0 ? g.MEd / i.NEd : 0, lambda: g.lambda, lambdaLim: g.lambdaLim, rows: ec2ColumnRows(input, res, { names: [''] }) };
}
