/**
 * A straight concrete stair designed as the one-way slab it is (CIRSOC 201-2025 cap. 7): a flight
 * (`model/stair.ts` geometry: risers, treads, waist) between a landing at its foot and one at its
 * head, spanning on plan from the support at the end of one landing to the support at the end of
 * the other, per metre of width.
 *
 * Loads per square metre of plan: the waist (t / cos θ), the steps (riser / 2), the finishes and
 * the live load on the flight; the landing's own thickness, the finishes and the live load on
 * the landings. Factored by the larger of 1,4D and 1,2D + 1,6L. The span is a simply supported
 * beam with piecewise uniform load; a stair cast with the beams it lands on also gets top steel at
 * each support for wu·ln²/24 (Tabla 6.5.2, interior face of an exterior support built
 * integrally with a spandrel beam). The bottom steel keeps the simply supported moment.
 *
 * Rows: thickness (Tabla 7.3.1.1), flexure (22.3) with As,min (7.6.1.1), bar spacing (7.7.2.3),
 * distribution steel (24.4.3.2, 24.4.3.3) and shear without stirrups (22.5.5.1(c)). The bar
 * schedule follows the soffit and crosses the bottom bars at the head of the flight, where a
 * bent bar in tension would pull out of the cover. m, kN, MPa.
 */
import { statusOfRatio, type CheckInput, type CheckRow } from '../../../design-contract';
import { flightGeometry, stepWeightPerInclinedArea, type StairSpec } from '../../../model/stair';
import { deriveDevelopment } from '../../../codes/cirsoc201/anchorage';
import { CONCRETE_WEIGHT, flexuralSteel } from './ribbed';
import { slabVc } from './one-way-shear';

export interface StairDesignSpec extends StairSpec {
  /** Clear width of the flight, m. */
  width: number;
  /** Plan length of the landing at the foot and at the head, m (0: the flight bears directly). */
  landingBottom: number;
  landingTop: number;
  /** Landing slab thickness, m; the waist when absent. */
  landingThickness?: number;
  /** How both ends bear: on a ledge or wall (`simple`), or cast with the beams (`monolithic`). */
  ends: 'simple' | 'monolithic';
  /** Finishes and live load, kN/m² of plan. */
  finishes: number;
  live: number;
}

export interface StairMaterial { fc: number; fy: number; cover: number; barDia: number; distDia: number; density?: number }

export interface StairBar {
  mark: string; role: 'bottom' | 'bottomHead' | 'top' | 'distribution';
  diameterMm: number; spacing: number; count: number;
  /** Legs in order, m, and the angle each makes with the horizontal, degrees. */
  legs: Array<{ length: number; angleDeg: number }>;
  length: number;
}

export interface StairDesign {
  geometry: ReturnType<typeof flightGeometry> & { span: number; developed: number };
  /** Plan loads, kN/m²: dead on the flight and on the landings, live. */
  loads: { deadFlight: number; deadLanding: number; live: number; wuFlight: number; wuLanding: number };
  /** Per metre of width: service reactions (dead, live) at the foot and the head, kN/m. */
  reactions: { foot: { dead: number; live: number }; head: { dead: number; live: number } };
  mu: number; muNeg: number; vu: number; xMax: number;
  asBottom: number | null; asTop: number; asDist: number;
  rows: CheckRow[];
  bars: StairBar[];
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const inp = (symbol: string, value: number, unit?: string): CheckInput => ({ symbol, value: r3(value), ...(unit ? { unit } : {}) });
const row = (key: string, title: string, clause: string, formula: string, demand: number, capacity: number, unit: string, inputs: CheckInput[], derivation?: string[]): CheckRow => {
  const ratio = capacity > 0 ? demand / capacity : Number.POSITIVE_INFINITY;
  return { code: 'cirsoc-201', edition: '2025', clause, title, titleKey: `check.stair.${key}`, formula, inputs, demand: r3(demand), capacity: r3(capacity), unit, ratio: r3(ratio), status: statusOfRatio(ratio), ...(derivation ? { derivation } : {}) };
};

/** The largest spacing, in 25 mm steps, that gives at least `as` per metre with bars of `dia` mm, within `max`. */
export function barSpacing(as: number, diaMm: number, max: number): number {
  const ab = (Math.PI * (diaMm / 1000) ** 2) / 4;
  const s = as > 0 ? Math.min(ab / as, max) : max;
  return Math.max(0.05, Math.floor(s / 0.025 + 1e-9) * 0.025);
}

/** Simply supported span of plan length L under piecewise uniform load; reactions and the moment along it. */
export function piecewiseBeam(segments: ReadonlyArray<{ length: number; w: number }>) {
  const L = segments.reduce((a, s) => a + s.length, 0);
  let W = 0, Mo = 0, x = 0;
  for (const s of segments) { W += s.w * s.length; Mo += s.w * s.length * (x + s.length / 2); x += s.length; }
  const rB = L > 0 ? Mo / L : 0, rA = W - rB;
  const moment = (at: number) => {
    let m = rA * at, x0 = 0;
    for (const s of segments) {
      const a = Math.min(Math.max(at - x0, 0), s.length);
      m -= s.w * a * (at - x0 - a / 2);
      x0 += s.length;
    }
    return m;
  };
  let mMax = 0, xMax = 0;
  const n = 400;
  for (let i = 0; i <= n; i++) { const at = (L * i) / n, m = moment(at); if (m > mMax) { mMax = m; xMax = at; } }
  return { L, rA, rB, mMax, xMax, moment };
}

export function stairDesign(spec: StairDesignSpec, mat: StairMaterial): StairDesign {
  const g = flightGeometry(spec);
  const gamma = mat.density ?? CONCRETE_WEIGHT;
  const cos = Math.cos(g.angleRad);
  const tl = spec.landingThickness ?? spec.waist;
  // Per m² of plan. The steps' weight is per inclined area in `model/stair.ts`; over plan it is γ·riser/2.
  const deadFlight = gamma * spec.waist / cos + stepWeightPerInclinedArea(spec, gamma) / cos + spec.finishes;
  const deadLanding = gamma * tl + spec.finishes;
  const fac = (d: number, l: number) => Math.max(1.4 * d, 1.2 * d + 1.6 * l);
  const wuFlight = fac(deadFlight, spec.live), wuLanding = fac(deadLanding, spec.live);
  const segs = (wf: number, wl: number) => [
    ...(spec.landingBottom > 0 ? [{ length: spec.landingBottom, w: wl }] : []),
    { length: g.run, w: wf },
    ...(spec.landingTop > 0 ? [{ length: spec.landingTop, w: wl }] : []),
  ];
  const u = piecewiseBeam(segs(wuFlight, wuLanding));
  const dead = piecewiseBeam(segs(deadFlight, deadLanding)), live = piecewiseBeam(segs(spec.live, spec.live));
  const span = u.L, developed = spec.landingBottom + g.slope + spec.landingTop;
  const W = segs(wuFlight, wuLanding).reduce((a, s) => a + s.w * s.length, 0);
  const muNeg = spec.ends === 'monolithic' ? (W / span) * span * span / 24 : 0;

  const h = Math.min(spec.waist, tl), db = mat.barDia / 1000, d = h - mat.cover - db / 2;
  const asReq = flexuralSteel(u.mMax, 1, d, mat.fc, mat.fy);
  const asMin = 0.0018 * h;
  const asBottom = asReq === null ? null : Math.max(asReq, asMin);
  const asTopReq = muNeg > 0 ? flexuralSteel(muNeg, 1, d, mat.fc, mat.fy) : 0;
  const asTop = muNeg > 0 ? Math.max(asTopReq ?? Number.POSITIVE_INFINITY, asMin) : 0;
  const sMax = Math.min(3 * h, 0.3);
  const s = barSpacing(asBottom ?? asMin, mat.barDia, sMax);
  const sTop = muNeg > 0 ? barSpacing(asTop, mat.barDia, sMax) : 0;
  const asDist = 0.0018 * h, sDistMax = Math.min(5 * h, 0.45), sDist = barSpacing(asDist, mat.distDia, sDistMax);
  const abar = (dia: number) => (Math.PI * (dia / 1000) ** 2) / 4;
  const provided = abar(mat.barDia) / s;

  // Shear at the supports, without stirrups.
  const vu = Math.max(u.rA, u.rB);
  const { vc, lambdaS } = slabVc(mat.fc, 1, d, provided / d);
  const phiVc = 0.75 * vc;

  // Thickness, Tabla 7.3.1.1 on the developed length: L/20 simply supported, L/24 with one end continuous.
  const hMin = (developed / (spec.ends === 'simple' ? 20 : 24)) * (0.4 + mat.fy / 700);

  const rows: CheckRow[] = [
    row('thickness', 'Thickness for deflection', '7.3.1.1', spec.ends === 'simple' ? 'h ≥ ℓ/20·(0,4 + fy/700)' : 'h ≥ ℓ/24·(0,4 + fy/700)', hMin, h, 'm',
      [inp('ℓ', developed, 'm'), inp('h', h * 1000, 'mm')], ['ℓ: the developed length of landings and flight, along the slab']),
    asReq === null
      ? { code: 'cirsoc-201', edition: '2025', clause: '22.3', title: 'Flexure, bottom steel', titleKey: 'check.stair.flexure', formula: 'Mu ≤ φ·Mn', inputs: [inp('Mu', u.mMax, 'kN·m/m'), inp('d', d * 1000, 'mm')], ratio: null, status: 'fail', derivation: ['the compression block does not fit the waist'] }
      : row('flexure', 'Flexure, bottom steel', '22.3', 'As,req ≤ As,prov', asBottom! * 1e4, provided * 1e4, 'cm²/m',
        [inp('Mu', u.mMax, 'kN·m/m'), inp('d', d * 1000, 'mm'), inp('As,min', asMin * 1e4, 'cm²/m'), inp('s', s * 1000, 'mm')],
        [`As,req = ${(asBottom! * 1e4).toFixed(2)} cm²/m (As,min = 0,0018·Ag, 7.6.1.1)`, `Ø${mat.barDia} @ ${Math.round(s * 1000)} mm = ${(provided * 1e4).toFixed(2)} cm²/m`]),
    row('spacing', 'Bar spacing', '7.7.2.3', 's ≤ min(3h; 300 mm)', s, sMax, 'm', [inp('s', s * 1000, 'mm'), inp('h', h * 1000, 'mm')]),
    row('distribution', 'Distribution steel', '24.4.3.2', 'ρ ≥ 0,0018; s ≤ min(5h; 450 mm)', asDist * 1e4, (abar(mat.distDia) / sDist) * 1e4, 'cm²/m',
      [inp('As,min', asDist * 1e4, 'cm²/m'), inp('s', sDist * 1000, 'mm')], [`Ø${mat.distDia} @ ${Math.round(sDist * 1000)} mm (24.4.3.3)`]),
    row('shear', 'Shear without stirrups', '22.5.5.1(c)', 'Vu ≤ φ·Vc', vu, phiVc, 'kN/m', [inp('λs', lambdaS), inp('ρw', provided / d), inp('d', d * 1000, 'mm')]),
  ];
  if (muNeg > 0) {
    const pTop = abar(mat.barDia) / sTop;
    rows.splice(2, 0, asTopReq === null
      ? { code: 'cirsoc-201', edition: '2025', clause: '6.5.2', title: 'Top steel at the supports', titleKey: 'check.stair.top', formula: 'Mu = wu·ℓn²/24', inputs: [inp('Mu', muNeg, 'kN·m/m')], ratio: null, status: 'fail', derivation: ['the compression block does not fit the waist'] }
      : row('top', 'Top steel at the supports', '6.5.2', 'Mu = wu·ℓn²/24; As,req ≤ As,prov', asTop * 1e4, pTop * 1e4, 'cm²/m', [inp('Mu', muNeg, 'kN·m/m'), inp('s', sTop * 1000, 'mm')]));
  }

  // The bars, along the soffit. Development length for a bottom bar in a slab (ψt = 1).
  const clear = s - db;
  const ld = deriveDevelopment({ diameterMm: mat.barDia, fy: mat.fy, fc: mat.fc, favourableSpacing: mat.cover >= db && clear >= 2 * db, edition: '2025' }).ldM;
  const c = mat.cover, ang = g.angleDeg, w = spec.width;
  const count = (sp: number) => Math.floor((w - 2 * c) / sp + 1e-9) + 1;
  const len = (legs: StairBar['legs']) => r3(legs.reduce((a, l) => a + l.length, 0));
  const bars: StairBar[] = [];
  // Past the head of the flight the bottom bar keeps its slope up to the landing's top cover, then
  // runs level for the rest of ld.
  const tlh = spec.landingThickness ?? spec.waist;
  const rising = spec.landingTop > 0 ? Math.min(ld, Math.max(0, tlh - 2 * c) / Math.sin(g.angleRad)) : 0;
  const mainLegs = [
    ...(spec.landingBottom > 0 ? [{ length: spec.landingBottom - c, angleDeg: 0 }] : []),
    { length: g.slope - (spec.landingBottom > 0 ? 0 : c) + (spec.landingTop > 0 ? rising : -c), angleDeg: ang },
    ...(spec.landingTop > 0 && ld - rising > 1e-6 ? [{ length: ld - rising, angleDeg: 0 }] : []),
  ];
  bars.push({ mark: '1', role: 'bottom', diameterMm: mat.barDia, spacing: s, count: count(s), legs: mainLegs.map((l) => ({ ...l, length: r3(l.length) })), length: len(mainLegs) });
  if (spec.landingTop > 0) {
    const headLegs = [{ length: ld, angleDeg: ang }, { length: spec.landingTop - c, angleDeg: 0 }];
    bars.push({ mark: '2', role: 'bottomHead', diameterMm: mat.barDia, spacing: s, count: count(s), legs: headLegs.map((l) => ({ ...l, length: r3(l.length) })), length: len(headLegs) });
  }
  if (muNeg > 0) {
    // Over each support, out to a quarter of the span and anchored by ld past it.
    const top = Math.max(span / 4 + ld, ld);
    const legs = [{ length: r3(top), angleDeg: 0 }];
    bars.push({ mark: String(bars.length + 1), role: 'top', diameterMm: mat.barDia, spacing: sTop, count: 2 * count(sTop), legs, length: len(legs) });
  }
  const distLegs = [{ length: r3(w - 2 * c), angleDeg: 0 }];
  bars.push({ mark: String(bars.length + 1), role: 'distribution', diameterMm: mat.distDia, spacing: sDist, count: Math.floor((developed - 2 * c) / sDist + 1e-9) + 1, legs: distLegs, length: len(distLegs) });

  return {
    geometry: { ...g, span, developed },
    loads: { deadFlight: r3(deadFlight), deadLanding: r3(deadLanding), live: spec.live, wuFlight: r3(wuFlight), wuLanding: r3(wuLanding) },
    reactions: { foot: { dead: r3(dead.rA), live: r3(live.rA) }, head: { dead: r3(dead.rB), live: r3(live.rB) } },
    mu: r3(u.mMax), muNeg: r3(muNeg), vu: r3(vu), xMax: r3(u.xMax),
    asBottom, asTop, asDist, rows, bars,
  };
}
