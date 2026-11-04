/**
 * Fire resistance by material, for a required resistance R in minutes of the standard fire.
 *
 * CIRSOC 301-2018 Apéndice 4 (4.3) defines the resistance R as the minutes during which the
 * structure keeps the resistance it had when the fire started, says a steel member heats as fast as
 * its «masividad» (exposed surface over volume, Am/V) allows, and leaves the thickness of the
 * protection to the maker's tests. It gives no numbers, so the arithmetic here follows EN 1993-1-2:
 *
 *  · the standard fire, ISO 834: θg = 20 + 345·log10(8t + 1);
 *  · ky,θ and kE,θ of Table 3.1, interpolated linearly (the values of the in-repo reference
 *    `engine/tests/reference/domains/materials/fire_resistance.rs`);
 *  · the critical temperature as the θ at which ky,θ equals the utilization in fire μ0 (the method
 *    of that reference, uniform temperature, no instability);
 *  · the section factor Am/V of Table 4.2, contour or box, three or four sides;
 *  · the steel temperature, unprotected by 4.2.5.1 (αc = 25 W/m²K, εm·εf = 0,7, ca(θ) of 3.4.1.2,
 *    ρa = 7850 kg/m³, steps of 5 s) and protected by 4.2.5.2 eq. (4.27), with the protection's
 *    λp, dp, cp and ρp as its maker states them (steps of 30 s).
 *
 * Concrete: CIRSOC 201 has no fire chapter and the repo carries no fire tables, so a member is
 * checked against the minimum width and axis distance the project states for each R (from the fire
 * code that applies). Timber: the residual section after charring at a rate βn and a zero-strength
 * layer d0 the person states (k0 = t/20 below 20 min), its stresses against strengths × kfi.
 *
 * Temperatures °C, time min, lengths m (mm where named), forces kN, stresses MPa.
 */
import { statusOfRatio, type CheckInput, type CheckRow } from '../../../design-contract';

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const inp = (symbol: string, value: number, unit?: string): CheckInput => ({ symbol, value: r3(value), ...(unit ? { unit } : {}) });
const row = (code: string, key: string, title: string, clause: string, formula: string, demand: number, capacity: number, unit: string, inputs: CheckInput[], extra: Partial<CheckRow> = {}): CheckRow => {
  const ratio = capacity > 0 ? demand / capacity : Number.POSITIVE_INFINITY;
  return { code, clause, title, titleKey: `check.fire.${key}`, formula, inputs, demand: r3(demand), capacity: r3(capacity), unit, ratio: r3(ratio), status: statusOfRatio(ratio), ...extra };
};

// ─── Standard fire ───

/** Gas temperature of the standard fire (ISO 834) after t minutes, °C. */
export const iso834 = (tMin: number): number => 20 + 345 * Math.log10(8 * Math.max(tMin, 0) + 1);

// ─── Steel properties at temperature, EN 1993-1-2 Table 3.1 ───

const KY: ReadonlyArray<readonly [number, number]> = [
  [20, 1], [100, 1], [200, 1], [300, 1], [400, 1], [500, 0.78], [600, 0.47], [700, 0.23], [800, 0.11], [900, 0.06], [1000, 0.04], [1100, 0.02],
];
const KE: ReadonlyArray<readonly [number, number]> = [
  [20, 1], [100, 1], [200, 0.9], [300, 0.8], [400, 0.7], [500, 0.6], [600, 0.31], [700, 0.13], [800, 0.09], [900, 0.0675], [1000, 0.045], [1100, 0.0225],
];

function interp(table: ReadonlyArray<readonly [number, number]>, x: number): number {
  if (x <= table[0]![0]) return table[0]![1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i]!, [x0, y0] = table[i - 1]!;
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return table[table.length - 1]![1];
}

/** Effective yield strength reduction factor ky,θ. */
export const ky = (theta: number): number => interp(KY, theta);
/** Elastic modulus reduction factor kE,θ. */
export const kE = (theta: number): number => interp(KE, theta);

/** The temperature at which ky,θ falls to μ0, °C (400 °C for μ0 ≥ 1, 1100 °C below the table). */
export function criticalTemperature(mu0: number): number {
  if (mu0 >= 1) return 400;
  const last = KY[KY.length - 1]!;
  if (mu0 <= last[1]) return last[0];
  for (let i = 1; i < KY.length; i++) {
    const [t0, k0] = KY[i - 1]!, [t1, k1] = KY[i]!;
    if (mu0 <= k0 && mu0 >= k1 && k0 !== k1) return t0 + ((k0 - mu0) * (t1 - t0)) / (k0 - k1);
  }
  return 400;
}

// ─── Section factor, EN 1993-1-2 Table 4.2 ───

export type FireShape =
  | { kind: 'I'; h: number; b: number; tw: number; tf: number; A: number }
  | { kind: 'rhs'; h: number; b: number; A: number }
  | { kind: 'chs'; D: number; A: number }
  | { kind: 'rect'; h: number; b: number };

/**
 * Am/V, 1/m. `exposure` 3 means the top face is shielded (a slab on it). An I section is measured
 * along its contour or around its box; a hollow or solid section has only its box.
 */
export function sectionFactor(shape: FireShape, exposure: 3 | 4, method: 'contour' | 'box' = 'contour'): number {
  switch (shape.kind) {
    case 'I': {
      const am = method === 'box'
        ? (exposure === 4 ? 2 * (shape.h + shape.b) : 2 * shape.h + shape.b)
        : (exposure === 4 ? 2 * shape.h + 4 * shape.b - 2 * shape.tw : 2 * shape.h + 3 * shape.b - 2 * shape.tw);
      return am / shape.A;
    }
    case 'rhs': return (exposure === 4 ? 2 * (shape.h + shape.b) : 2 * shape.h + shape.b) / shape.A;
    case 'chs': return (Math.PI * shape.D * (exposure === 4 ? 1 : 0.75)) / shape.A;
    case 'rect': return (exposure === 4 ? 2 * (shape.h + shape.b) : 2 * shape.h + shape.b) / (shape.h * shape.b);
  }
}

// ─── Steel temperature ───

/** Specific heat of carbon steel, J/kgK (EN 1993-1-2 3.4.1.2). */
export function steelSpecificHeat(theta: number): number {
  if (theta < 600) return 425 + 0.773 * theta - 1.69e-3 * theta ** 2 + 2.22e-6 * theta ** 3;
  if (theta < 735) return 666 + 13002 / (738 - theta);
  if (theta < 900) return 545 + 17820 / (theta - 731);
  return 650;
}

const RHO_A = 7850, SIGMA = 5.67e-8, ALPHA_C = 25, EPS = 0.7;

/** Unprotected steel after t minutes of standard fire, °C (4.2.5.1, ksh the shadow factor). */
export function unprotectedTemperature(amv: number, tMin: number, ksh = 1): number {
  const dt = 5, n = Math.ceil((tMin * 60) / dt);
  let th = 20;
  for (let i = 0; i < n; i++) {
    const tg = iso834(((i + 0.5) * dt) / 60);
    const hnet = ALPHA_C * (tg - th) + EPS * SIGMA * ((tg + 273) ** 4 - (th + 273) ** 4);
    th += ((ksh * amv) / (steelSpecificHeat(th) * RHO_A)) * hnet * dt;
  }
  return th;
}

/** A fire protection as its maker states it: conductivity W/mK, thickness m, specific heat J/kgK, density kg/m³. */
export interface FireProtection { lambdaP: number; dp: number; cp: number; rhoP: number }

/** Protected steel after t minutes of standard fire, °C (4.2.5.2 eq. 4.27, Ap/V of the protection's inner face). */
export function protectedTemperature(apv: number, tMin: number, p: FireProtection): number {
  const dt = 30, n = Math.ceil((tMin * 60) / dt);
  let th = 20;
  for (let i = 0; i < n; i++) {
    const t0 = (i * dt) / 60, t1 = ((i + 1) * dt) / 60;
    const tg = iso834(t1), dtg = tg - iso834(t0);
    const ca = steelSpecificHeat(th);
    const phi = ((p.cp * p.rhoP) / (ca * RHO_A)) * p.dp * apv;
    let d = ((p.lambdaP * apv * (tg - th)) / (p.dp * ca * RHO_A * (1 + phi / 3))) * dt - (Math.exp(phi / 10) - 1) * dtg;
    if (dtg > 0 && d < 0) d = 0;
    th += d;
  }
  return th;
}

/**
 * Steel member in fire: its temperature after R minutes against the critical temperature of its
 * utilization in fire μ0 (the fire combination's effect over the cold resistance, from the caller).
 */
export function steelFireRows(o: { amv: number; mu0: number; rMinutes: number; protection?: FireProtection; ksh?: number }): CheckRow[] {
  const thCr = criticalTemperature(o.mu0);
  const thA = o.protection ? protectedTemperature(o.amv, o.rMinutes, o.protection) : unprotectedTemperature(o.amv, o.rMinutes, o.ksh ?? 1);
  const code = 'en-1993-1-2';
  const heat: CheckInput[] = o.protection
    ? [inp('Ap/V', o.amv, '1/m'), inp('λp', o.protection.lambdaP, 'W/mK'), inp('dp', o.protection.dp * 1000, 'mm'), inp('cp', o.protection.cp, 'J/kgK'), inp('ρp', o.protection.rhoP, 'kg/m³')]
    : [inp('Am/V', o.amv, '1/m'), inp('ksh', o.ksh ?? 1)];
  return [
    { ...row(code, 'utilization', 'Utilization in fire', '4.2.4', 'μ0 = Efi,d / Rfi,d,0', o.mu0, 1, '', [inp('μ0', o.mu0)]), demand: r3(o.mu0) },
    row(code, 'steelTemperature', 'Steel temperature after R', o.protection ? '4.2.5.2' : '4.2.5.1', 'θa(R) ≤ θcr', thA, thCr, '°C',
      [inp('R', o.rMinutes, 'min'), inp('θg(R)', iso834(o.rMinutes), '°C'), inp('θcr', thCr, '°C'), ...heat],
      { derivation: ['θcr: ky,θ = μ0 (Table 3.1)', 'CIRSOC 301 Apéndice 4: R in minutes; protection thickness from the maker\'s tests'] }),
  ];
}

// ─── Concrete: against the project's table ───

export type ConcreteFireKind = 'beam' | 'column' | 'slab' | 'wall';
export interface ConcreteFireEntry { kind: ConcreteFireKind; r: number; bMin: number; aMin: number }

/** Axis distance of the main bars from the exposed face, m: cover, stirrup and half the bar (mm). */
export const axisDistance = (cover: number, stirrupDiaMm: number, barDiaMm: number): number => cover + (stirrupDiaMm + barDiaMm / 2) / 1000;

/** A member's width and axis distance against the minimums the project states for R. */
export function concreteFireRows(member: { kind: ConcreteFireKind; b: number; a: number }, table: readonly ConcreteFireEntry[], rMinutes: number): CheckRow[] {
  const code = 'project-fire-table';
  const entry = table.filter((e) => e.kind === member.kind && e.r >= rMinutes).sort((p, q) => p.r - q.r)[0];
  if (!entry) {
    return [{ code, clause: `R${rMinutes}`, title: 'Minimum dimensions in fire', titleKey: 'check.fire.concreteTable', formula: 'b ≥ bmin; a ≥ amin',
      inputs: [inp('b', member.b * 1000, 'mm'), inp('a', member.a * 1000, 'mm')], ratio: null, status: 'notVerified', derivation: ['no minimums stated for this kind of member and R'] }];
  }
  const ins = [inp('R', entry.r, 'min')];
  return [
    row(code, 'concreteWidth', 'Minimum width in fire', `R${entry.r}`, 'b ≥ bmin', entry.bMin, member.b, 'm', [...ins, inp('b', member.b * 1000, 'mm'), inp('bmin', entry.bMin * 1000, 'mm')]),
    row(code, 'concreteAxis', 'Axis distance in fire', `R${entry.r}`, 'a ≥ amin', entry.aMin, member.a, 'm', [...ins, inp('a', member.a * 1000, 'mm'), inp('amin', entry.aMin * 1000, 'mm')]),
  ];
}

// ─── Timber: charring ───

export interface ExposedSides { top: boolean; bottom: boolean; left: boolean; right: boolean }

/**
 * The residual rectangle after t minutes, m: each exposed face loses βn·t of char plus k0·d0 of
 * zero-strength layer (k0 = t/20 below 20 min, 1 after). βn in mm/min and d0 in mm, as stated.
 */
export function residualSection(b: number, h: number, sides: ExposedSides, betaN: number, d0: number, tMin: number): { b: number; h: number; dEf: number } {
  const k0 = Math.min(1, tMin / 20);
  const dEf = (betaN * tMin + k0 * d0) / 1000;
  return {
    b: Math.max(0, b - (Number(sides.left) + Number(sides.right)) * dEf),
    h: Math.max(0, h - (Number(sides.top) + Number(sides.bottom)) * dEf),
    dEf,
  };
}

/** A timber member's residual section in bending, compression and shear, strengths × kfi. */
export function timberFireRows(o: {
  b: number; h: number; sides: ExposedSides; betaN: number; d0: number; rMinutes: number;
  demand: { m: number; n: number; v: number }; strengths: { fm: number; fc: number; fv: number }; kfi: number;
}): CheckRow[] {
  const code = 'timber-fire';
  const s = residualSection(o.b, o.h, o.sides, o.betaN, o.d0, o.rMinutes);
  const ins = [inp('βn', o.betaN, 'mm/min'), inp('d0', o.d0, 'mm'), inp('def', s.dEf * 1000, 'mm'), inp('bfi', s.b * 1000, 'mm'), inp('hfi', s.h * 1000, 'mm'), inp('kfi', o.kfi)];
  const A = s.b * s.h, W = (s.b * s.h * s.h) / 6;
  if (A <= 0) {
    return [{ code, title: 'Residual section', titleKey: 'check.fire.timberResidual', formula: 'bfi > 0; hfi > 0', inputs: ins, ratio: null, status: 'fail', derivation: ['the section chars through before R'] }];
  }
  const rows: CheckRow[] = [
    row(code, 'timberBending', 'Bending of the residual section', 'R', 'M/Wfi ≤ kfi·fm', Math.abs(o.demand.m) / W / 1000, o.kfi * o.strengths.fm, 'MPa', [inp('M', o.demand.m, 'kN·m'), ...ins]),
    row(code, 'timberShear', 'Shear of the residual section', 'R', '1,5·V/Afi ≤ kfi·fv', (1.5 * Math.abs(o.demand.v)) / A / 1000, o.kfi * o.strengths.fv, 'MPa', [inp('V', o.demand.v, 'kN'), ...ins]),
  ];
  if (o.demand.n > 0) rows.splice(1, 0, row(code, 'timberCompression', 'Compression of the residual section', 'R', 'N/Afi ≤ kfi·fc', o.demand.n / A / 1000, o.kfi * o.strengths.fc, 'MPa', [inp('N', o.demand.n, 'kN'), ...ins]));
  return rows;
}
