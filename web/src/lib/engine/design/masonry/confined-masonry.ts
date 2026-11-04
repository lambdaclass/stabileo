/**
 * Load-bearing masonry walls by INPRES-CIRSOC 103 Parte III (2018), strength design (1.2):
 * confined masonry «encadenada simple» (cap. 4), «encadenada armada» (cap. 5: cap. 4 plus bed
 * joint reinforcement) and masonry with distributed reinforcement «reforzada» (cap. 7).
 *
 * The strengths of the masonry come from Tablas 2.4 (f'm) and 2.5 (f'v) by unit and mortar, or are
 * stated from tests; Em = 1200·f'm and Gm = 0,20 or 0,10·Em (2.4.1, 2.4.2). The factors φ are those
 * of Tabla 1.1. fo is the mean compression under the least axial load of combination [1-2].
 *
 * Rows: thickness (3.4.2) and length (3.4.3); for confined walls the panel limits (4.1.2, Tabla 4.1,
 * [4-1], [4-2]), the in-plane shear [4-5], and the confining beams and columns: section (4.4.1,
 * 4.5.1, [4-13]), axial force by the approximate procedures [4-6] and [4-14] against φ·As·fy, the
 * minimum steel (4.4.4, 4.5.4, [4-9]/[4-10], [4-17]/[4-18]), the ties in the normal and critical
 * zones ([4-11], [4-12], [4-19]) and the shear at the column ends ([4-20], [4-21]); for confined
 * reinforced walls the bed joint steel of Tabla 5.1; for walls with distributed reinforcement the
 * shear [7-2], the vertical steel [7-3]/[7-4], the minimum ratios [7-6]/[7-7], the spacing 7.3.1(g)
 * and the flexure with axial load of 7.2.2. Out of plane, the panel's flexure [8-4] against the
 * moment the person states (8.4 leaves its calculation to plate theory or yield lines).
 *
 * The code writes its formulas in mm, N and MPa; inputs and rows here are in m, kN and MPa, with
 * steel areas reported in mm².
 */
import { statusOfRatio, type CheckInput, type CheckRow } from '../../../design-contract';

export const MASONRY_CODE = 'inpres-cirsoc-103-iii';
export const MASONRY_EDITION = '2018';

export type MasonryUnit = 'solidBrick' | 'hollowCeramic' | 'hollowConcrete';
export type MortarType = 'E' | 'I' | 'N' | 'NA';
export type MasonryKind = 'simple' | 'armada' | 'reforzada';
export type SeismicZone = 1 | 2 | 3 | 4;

const MORTARS: readonly MortarType[] = ['E', 'I', 'N', 'NA'];
/** Tabla 2.4: f'm, MPa, on the gross area, by unit and mortar (E, I, N, NA). */
export const FM_TABLE_2_4: Record<MasonryUnit, readonly number[]> = {
  solidBrick: [2.75, 2.25, 1.75, 0.65],
  hollowCeramic: [2.25, 1.75, 1.40, 0.52],
  hollowConcrete: [2.25, 1.75, 1.40, 0.52],
};
/** Tabla 2.5: f'v, MPa, on the gross area, by unit and mortar (E, I, N, NA). */
export const FV_TABLE_2_5: Record<MasonryUnit, readonly number[]> = {
  solidBrick: [0.26, 0.22, 0.19, 0.07],
  hollowCeramic: [0.22, 0.19, 0.15, 0.055],
  hollowConcrete: [0.22, 0.19, 0.15, 0.055],
};

/** Tabla 1.1. */
export const PHI = { flexureAxialConfined: 0.9, flexureAxialReinforced: 0.9, shear: 0.8, tieShear: 0.8, tieTension: 0.9, outOfPlane: 0.85 } as const;

/** f'm and f'v of Tablas 2.4 and 2.5. */
export function masonryStrengths(unit: MasonryUnit, mortar: MortarType): { fm: number; fv: number } {
  const i = MORTARS.indexOf(mortar);
  return { fm: FM_TABLE_2_4[unit][i]!, fv: FV_TABLE_2_5[unit][i]! };
}

/** Em = 1200·f'm [2-9]; Gm = 0,20·Em for solid bricks [2-10], 0,10·Em for hollow blocks [2-11]. MPa. */
export function masonryModuli(fm: number, unit: MasonryUnit): { Em: number; Gm: number } {
  const Em = 1200 * fm;
  return { Em, Gm: (unit === 'solidBrick' ? 0.2 : 0.1) * Em };
}

/** Width of the equivalent masonry diagonal of the pin-jointed truss of 4.1.1: a tenth of its length, m. */
export const trussDiagonalWidth = (Lo: number, Ho: number) => Math.hypot(Lo, Ho) / 10;

/** A confining beam or column: section (m), longitudinal bars, ties (m), steel fy (MPa). */
export interface ConfiningElement {
  b: number; h: number;
  bars: number; barDia: number;
  fy: number;
  tieDia: number; tieFy?: number;
  sNormal: number; sCritical: number;
}

export interface ConfinedWallInput {
  kind: MasonryKind;
  unit: MasonryUnit;
  /** Mortar of Tablas 2.4/2.5; or f'm and f'v stated from tests (2.3.1(a), 2.3.2(a)). */
  mortar?: MortarType; fm?: number; fv?: number;
  zone: SeismicZone;
  /** Storeys above the one checked (k of cap. 4). */
  storiesAbove: number;
  /** Wall length, thickness and height between horizontal supports, m. */
  L: number; t: number; H: number;
  /** Two horizontal supports only [3-1], or at least one vertical edge restrained [3-2]. */
  edges: 'twoHorizontal' | 'threeOrMore';
  /** A 120 mm interior wall admitted by 3.4.2(a)/(b) (the person states that the conditions hold). */
  thinWallAdmitted?: boolean;
  /** Confined walls: the panel between tie columns and tie beams (axes), m. Absent: L and H. */
  Lo?: number; Ho?: number;
  /** Least axial compression of combination [1-2] on the wall, kN (fo = N/Ag). */
  nMin: number;
  /** Factored in-plane shear on the wall and on this panel (4.1.3; absent: the wall's), kN. */
  vu: number; vup?: number;
  /** Factored in-plane moment and the axial load acting with it (7.2.2), kN·m and kN. */
  mu?: number; nu?: number;
  column?: ConfiningElement; beam?: ConfiningElement;
  /** Confined reinforced: bed joint bars (count per joint, diameter mm, vertical spacing m). */
  joint?: { bars: number; barDia: number; spacing: number };
  /** Distributed reinforcement: horizontal and vertical steel, m² per metre, fy MPa, total height hn (m), bar spacings (m). */
  distributed?: { ahm: number; avm: number; fy: number; hn: number; sh: number; sv: number };
  /** Factored out-of-plane moment on the panel, kN·m per metre ([8-3]). */
  muOut?: number;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const inp = (symbol: string, value: number, unit?: string): CheckInput => ({ symbol, value: r3(value), ...(unit ? { unit } : {}) });
const row = (key: string, title: string, clause: string, formula: string, demand: number, capacity: number, unit: string, inputs: CheckInput[], extra: Partial<CheckRow> = {}): CheckRow => {
  const ratio = capacity > 0 ? demand / capacity : Number.POSITIVE_INFINITY;
  return { code: MASONRY_CODE, edition: MASONRY_EDITION, clause, title, titleKey: `check.masonry.${key}`, formula, inputs, demand: r3(demand), capacity: r3(capacity), unit, ratio: r3(ratio), status: statusOfRatio(ratio), ...extra };
};
const barArea = (dMm: number) => (Math.PI * dMm * dMm) / 4; // mm²

/** Tabla 4.1: largest panel area (m²) and dimension (m) by zone and thickness. */
export function panelLimits(zone: SeismicZone, t: number): { area: number; dim: number } {
  const thick = t >= 0.18 - 1e-9;
  if (zone === 1) return { area: 30, dim: thick ? 7 : 4.5 };
  if (zone === 2) return { area: 25, dim: thick ? 6 : 4 };
  return { area: 20, dim: thick ? 5 : 4 };
}

/** As,min of a tie beam or column, mm²: [4-9]/[4-17] in zones 1 and 2, [4-10]/[4-18] in 3 and 4 (t in mm). */
export function tieMinSteel(zone: SeismicZone, k: number, tMm: number, fy: number): number {
  return (zone <= 2 ? 250 + 130 * k : 350 + 180 * k) * tMm / fy;
}

/** The tie diameter a spacing asks for, mm: [4-11]/[4-19] normal zones, [4-12] critical zones of beams; at least 6 mm. */
export function tieDiameter(zone: 'normal' | 'critical', k: number, sMm: number): number {
  return Math.max((zone === 'normal' ? 0.02 + 0.01 * k : 0.04 + 0.02 * k) * sMm, 6);
}

/** Nominal flexural strength of a wall with distributed vertical steel under axial load N (7.2.2), kN·m. */
export function reinforcedWallMn(Lm: number, tm: number, fm: number, avm: number, fy: number, N: number, unit: MasonryUnit, Es = 200000): number {
  const eps = unit === 'solidBrick' ? 0.0035 : 0.0025;
  const strips = 100, dx = Lm / strips, As = avm * dx; // m² per strip
  const forces = (c: number) => {
    let C = 0.8 * fm * 1000 * tm * Math.min(0.8 * c, Lm), M = C * (Lm / 2 - Math.min(0.8 * c, Lm) / 2);
    for (let i = 0; i < strips; i++) {
      const x = (i + 0.5) * dx, e = (eps * (c - x)) / c;
      const s = Math.max(-fy, Math.min(fy, Es * e)) * 1000 * As; // kN, compression positive
      C += s; M += s * (Lm / 2 - x);
    }
    return { C, M };
  };
  // Bisection on the neutral axis depth for C = N.
  let lo = 1e-6, hi = 5 * Lm;
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (forces(mid).C > N) hi = mid; else lo = mid; }
  return forces((lo + hi) / 2).M;
}

export interface ConfinedWallResult {
  fm: number; fv: number; Em: number; Gm: number; fo: number;
  rows: CheckRow[];
  /** Approximate axial forces in the ties, kN ([4-6], [4-14]); the critical zone of the columns, m. */
  nuv?: number; nuc?: number; lc?: number;
}

export function confinedWallRows(i: ConfinedWallInput): ConfinedWallResult {
  const tab = i.mortar ? masonryStrengths(i.unit, i.mortar) : null;
  const fm = i.fm ?? tab?.fm ?? 0, fv = i.fv ?? tab?.fv ?? 0;
  const { Em, Gm } = masonryModuli(fm, i.unit);
  const Ag = i.L * i.t, fo = Math.max(0, i.nMin) / Ag / 1000;
  const k = Math.max(0, Math.round(i.storiesAbove));
  const confined = i.kind !== 'reforzada';
  const rows: CheckRow[] = [];

  // 3.4.2 and 3.4.3.
  const tMin = i.thinWallAdmitted ? 0.12 : 0.18;
  rows.push(row('thickness', 'Wall thickness', '3.4.2', i.thinWallAdmitted ? 't ≥ 120 mm (3.4.2(a)/(b))' : 't ≥ 180 mm', tMin, i.t, 'm', [inp('t', i.t * 1000, 'mm')]));
  const two = i.edges === 'twoHorizontal';
  const lAbs = two ? (confined ? 1.5 : 1.2) : (confined ? 0.9 : 0.8);
  const lMin = Math.max(i.H / (two ? 2.2 : 2.6), lAbs);
  rows.push(row('length', 'Wall length', '3.4.3', two ? `L ≥ max(H/2,2; ${lAbs} m) [3-1]` : `L ≥ max(H/2,6; ${lAbs} m) [3-2]`, lMin, i.L, 'm', [inp('H', i.H, 'm'), inp('L', i.L, 'm')]));

  const out: ConfinedWallResult = { fm, fv, Em, Gm, fo, rows };
  if (confined) {
    const Lo = i.Lo ?? i.L, Ho = i.Ho ?? i.H, lim = panelLimits(i.zone, i.t);
    rows.push(row('panelArea', 'Panel area', '4.1.2(a)', 'Lo·Ho ≤ area of Tabla 4.1', Lo * Ho, lim.area, 'm²', [inp('Lo', Lo, 'm'), inp('Ho', Ho, 'm')]));
    rows.push(row('panelDim', 'Panel dimension', '4.1.2(a)', 'max(Lo; Ho) ≤ dimension of Tabla 4.1', Math.max(Lo, Ho), lim.dim, 'm', [inp('zone', i.zone)]));
    rows.push(row('columnSpacing', 'Tie column spacing', '4.1.2(b)', 'Lo ≤ 2·H [4-1]', Lo, 2 * i.H, 'm', [inp('H', i.H, 'm')]));
    rows.push(row('midBeam', 'Panel height', '4.1.2(c)', 'Ho ≤ 1,5·Lo, else a tie beam or reinforced joint at mid-height [4-2]', Ho, 1.5 * Lo, 'm', [inp('Lo', Lo, 'm')]));

    // In-plane shear [4-4], [4-5].
    const vn = Math.min(fv + 0.4 * fo, 2 * fv) * 1000 * Ag;
    rows.push(row('shear', 'In-plane shear', '4.3.1', 'Vu ≤ φ·(f\'v + 0,40·fo)·Ag ≤ φ·2,00·f\'v·Ag [4-5]', i.vu, PHI.shear * vn, 'kN',
      [inp('f\'v', fv, 'MPa'), inp('fo', fo, 'MPa'), inp('Ag', Ag, 'm²'), inp('φ', PHI.shear)]));

    const vup = i.vup ?? i.vu;
    const tMm = i.t * 1000;
    if (i.beam) {
      const b = i.beam, nuv = vup;
      out.nuv = nuv;
      const bMin = i.t >= 0.2 ? (2 / 3) * i.t : i.t, aMin = i.t * Math.max(i.t / 2, 0.15);
      rows.push(row('beamSection', 'Tie beam section', '4.4.1', 'bv ≥ t (2/3·t if t ≥ 200 mm); bv·hv ≥ t·max(t/2; 150 mm)', Math.max(bMin / b.b, aMin / (b.b * b.h)), 1, '—',
        [inp('bv', b.b * 1000, 'mm'), inp('hv', b.h * 1000, 'mm')]));
      tieRows(rows, 'beam', b, i.zone, k, tMm, nuv, '4.4.3', '[4-6]', '4.4.4', i.zone <= 2 ? '[4-9]' : '[4-10]', '4.4.5');
      rows.push(stirrupRow('beamTiesCritical', 'Tie beam stirrups, critical zone', '4.4.5.3', `dbe ≥ (0,04 + 0,02·k)·s ≥ 6 mm [4-12]; s ≤ min(b/2; 100 mm)`, b, 'critical', k, Math.min(Math.min(b.b, b.h) / 2, 0.1)));
    }
    if (i.column) {
      const c = i.column, nuc = (1 + 0.25 * k) * vup * Ho / Lo;
      out.nuc = nuc;
      const bMin = i.t >= 0.2 ? (2 / 3) * i.t : i.t;
      const Bc = c.b * c.h * 1e6, need = 0.25 * vup * 1000; // mm² against 0,25·Vup in N
      rows.push(row('columnSection', 'Tie column section', '4.5.1', 'bc ≥ t (2/3·t if t ≥ 200 mm); hc ≥ max(2/3·bc; 150 mm); Bc ≥ 0,25·Vup [4-13]',
        Math.max(bMin / c.b, Math.max((2 / 3) * c.b, 0.15) / c.h, need / Bc), 1, '—', [inp('bc', c.b * 1000, 'mm'), inp('hc', c.h * 1000, 'mm'), inp('Bc', Bc, 'mm²'), inp('Vup', vup, 'kN')]));
      tieRows(rows, 'column', c, i.zone, k, tMm, nuc, '4.5.3', '[4-14]', '4.5.4', i.zone <= 2 ? '[4-17]' : '[4-18]', '4.5.5');
      // Critical zones: shear Vup/2 against φ·Ate·fy·hc/s, and at least twice the normal-zone ties.
      const fyt = c.tieFy ?? c.fy, ate = 2 * barArea(c.tieDia), sMm = c.sCritical * 1000;
      const vnc = (ate * fyt * c.h * 1000) / sMm / 1000; // kN
      const lc = Math.max(Ho / 5, 2 * c.h, 0.6);
      out.lc = lc;
      rows.push(row('columnShear', 'Tie column shear, critical zone', '4.5.5.3', 'Vup/2 ≤ φ·Ate·fy·hc/s [4-20], [4-21]', vup / 2, PHI.tieShear * vnc, 'kN',
        [inp('Ate', ate, 'mm²'), inp('s', sMm, 'mm'), inp('hc', c.h * 1000, 'mm'), inp('lc', lc, 'm')], { derivation: [`lc = max(Ho/5; 2·hc; 600 mm) = ${(lc * 1000).toFixed(0)} mm`] }));
      const normalNeed = barArea(tieDiameter('normal', k, sMm)) * 2;
      rows.push(row('columnTiesCritical', 'Tie column stirrups, critical zone', '4.5.5.3', 'Ate ≥ 2·(normal zone); s ≤ min(hc/2; 100 mm)', Math.max((2 * normalNeed) / ate, sMm / Math.min(c.h * 500, 100)), 1, '—',
        [inp('dbe', c.tieDia, 'mm'), inp('s', sMm, 'mm')]));
    }

    if (i.kind === 'armada') {
      const hollow = i.unit !== 'solidBrick';
      const sMax = i.zone <= 2 ? (hollow ? 0.6 : 0.7) : (hollow ? 0.4 : 0.5);
      const scale = Math.max(1, i.t / 0.27);
      const need = (2 * barArea(6) * scale) / sMax; // mm² per m of height
      const have = i.joint ? (i.joint.bars * barArea(i.joint.barDia)) / i.joint.spacing : 0;
      rows.push(row('jointSteel', 'Bed joint reinforcement', '5.2', `2 Ø6 every ${Math.round(sMax * 1000)} mm (Tabla 5.1)${scale > 1 ? ', × t/270 mm' : ''}`, need, have, 'mm²/m',
        i.joint ? [inp('bars', i.joint.bars), inp('db', i.joint.barDia, 'mm'), inp('s', i.joint.spacing * 1000, 'mm')] : []));
    }
  } else if (i.distributed) {
    const d = i.distributed;
    const ahmMm = d.ahm * 1e6, avmMm = d.avm * 1e6; // mm²/m
    const vn = Math.min((ahmMm * i.L * 1000 / 1000) * d.fy / 1000, 3 * fv * 1000 * Ag);
    rows.push(row('shear', 'In-plane shear', '7.2.1', 'Vu ≤ φ·Ahm·L/1000·fy ≤ φ·3,0·f\'v·Ag [7-2]', i.vu, PHI.shear * vn, 'kN', [inp('Ahm', ahmMm, 'mm²/m'), inp('L', i.L, 'm'), inp('fy', d.fy, 'MPa')]));
    const avNeed = Math.max((1.45 - (0.45 * d.hn) / i.L) * ahmMm, ahmMm / 3);
    rows.push(row('verticalSteel', 'Vertical steel', '7.2.1', 'Avm ≥ max((1,45 − 0,45·hn/L)·Ahm; Ahm/3) [7-3], [7-4]', avNeed, avmMm, 'mm²/m', [inp('hn', d.hn, 'm')]));
    if (avmMm > ahmMm + 1e-9) rows.push(row('verticalSteelMax', 'Vertical steel, upper limit', '7.2.1', 'Avm ≤ Ahm [7-4]', avmMm, ahmMm, 'mm²/m', []));
    rows.push(row('rhoH', 'Horizontal steel ratio', '7.3.2(a)', 'ρhm = Ahm/(1000·t) ≥ 0,0013 [7-6]', 0.0013, ahmMm / (1000 * i.t * 1000), '—', []));
    rows.push(row('rhoV', 'Vertical steel ratio', '7.3.2(b)', 'ρvm = Avm/(1000·t) ≥ 0,0007 [7-7]', 0.0007, avmMm / (1000 * i.t * 1000), '—', []));
    rows.push(row('barSpacing', 'Bar spacing', '7.3.1(g)', 's ≤ min(6·t; 1200 mm)', Math.max(d.sh, d.sv), Math.min(6 * i.t, 1.2), 'm', []));
    if (i.mu !== undefined) {
      const N = i.nu ?? i.nMin, mn = reinforcedWallMn(i.L, i.t, fm, d.avm, d.fy, N, i.unit);
      rows.push(row('flexure', 'In-plane flexure with axial load', '7.2.2', 'Mu ≤ φ·Mn (block 0,80·f\'m over 0,80·c)', Math.abs(i.mu), PHI.flexureAxialReinforced * mn, 'kN·m',
        [inp('N', N, 'kN'), inp('f\'m', fm, 'MPa'), inp('εmu', i.unit === 'solidBrick' ? 0.0035 : 0.0025)]));
    }
  } else {
    rows.push({ code: MASONRY_CODE, edition: MASONRY_EDITION, clause: '7.2', title: 'Distributed reinforcement', titleKey: 'check.masonry.distributedMissing', formula: 'state Ahm and Avm', inputs: [], ratio: null, status: 'notVerified' });
  }

  // Out of plane, cap. 8.
  if (i.muOut !== undefined) {
    const mn = (3 / 32) * fm * 1000 * i.t * i.t; // kN·m/m
    /*
     * A reinforced wall is exempt only when its distributed reinforcement meets cap. 7: every
     * cap. 7 row stated and passing. Otherwise the exemption is not established and the row is
     * not verified. It read ok with a ratio of 0 even with the reinforcement missing; an
     * exemption has no ratio.
     */
    const cap7 = rows.filter((r) => r.clause?.startsWith('7.'));
    const meetsCap7 = !!i.distributed && cap7.length > 0 && cap7.every((r) => r.status === 'ok' || r.status === 'nearLimit');
    rows.push(confined
      ? row('outOfPlane', 'Out-of-plane flexure of the panel', '8.4', 'mu ≤ φ·3/32·f\'m·t² [8-3], [8-4]', Math.abs(i.muOut), PHI.outOfPlane * mn, 'kN·m/m', [inp('f\'m', fm, 'MPa'), inp('t', i.t * 1000, 'mm')])
      : { code: MASONRY_CODE, edition: MASONRY_EDITION, clause: '8.4', title: 'Out-of-plane flexure of the panel', titleKey: 'check.masonry.outOfPlane', formula: 'exempt: distributed reinforcement meeting cap. 7', inputs: [], demand: r3(Math.abs(i.muOut)), ratio: null, status: meetsCap7 ? 'ok' : 'notVerified' });
  }
  return out;
}

function tieRows(rows: CheckRow[], el: 'beam' | 'column', e: ConfiningElement, zone: SeismicZone, k: number, tMm: number, nu: number,
  axialClause: string, axialEq: string, steelClause: string, minEq: string, tiesClause: string): void {
  const As = e.bars * barArea(e.barDia), cap = PHI.tieTension * As * e.fy / 1000;
  const name = el === 'beam' ? 'Tie beam' : 'Tie column';
  rows.push(row(`${el}Axial`, `${name} axial force`, axialClause, `Nu ${axialEq} ≤ φ·As·fy`, nu, cap, 'kN', [inp('As', As, 'mm²'), inp('fy', e.fy, 'MPa'), inp('φ', PHI.tieTension)]));
  const minBars = zone <= 2 ? 6 : 8;
  const asMin = Math.max(tieMinSteel(zone, k, tMm, e.fy), 4 * barArea(minBars));
  rows.push(row(`${el}Steel`, `${name} minimum steel`, steelClause, `As ≥ max(${minEq}; 4 Ø${minBars}); 4 bars or more`, Math.max(asMin / As, 4 / e.bars), 1, '—',
    [inp('As', As, 'mm²'), inp('As,min', asMin, 'mm²'), inp('k', k)]));
  rows.push(stirrupRow(`${el}TiesNormal`, `${name} stirrups, normal zone`, `${tiesClause}.2`, `dbe ≥ (0,02 + 0,01·k)·s ≥ 6 mm ${el === 'beam' ? '[4-11]' : '[4-19]'}; s ≤ min(b; 200 mm)`, e, 'normal', k, Math.min(Math.min(e.b, e.h), 0.2)));
}

function stirrupRow(key: string, title: string, clause: string, formula: string, e: ConfiningElement, zone: 'normal' | 'critical', k: number, sMax: number): CheckRow {
  const s = zone === 'normal' ? e.sNormal : e.sCritical;
  const need = tieDiameter(zone, k, s * 1000);
  return row(key, title, clause, formula, Math.max(need / e.tieDia, s / sMax), 1, '—', [inp('dbe', e.tieDia, 'mm'), inp('dbe,req', need, 'mm'), inp('s', s * 1000, 'mm'), inp('s,max', sMax * 1000, 'mm')]);
}
