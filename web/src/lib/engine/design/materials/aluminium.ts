/**
 * Aluminium members by EN 1999-1-1, the code of the EN AW grades the catalogue carries: the
 * cross-section class from the slenderness of its parts (Table 6.2), tension, compression with
 * flexural buckling (6.3.1), bending with lateral-torsional buckling for open sections (6.3.2),
 * shear (6.2.6) and a linear interaction of the three. Heat-treated tempers (T…) buckle as class A,
 * the others as class B. Members without welds: no heat-affected zone. A class 4 section is not
 * evaluated (its effective thickness is not computed here) and says so.
 *
 * Doubly symmetric I and H, rectangular and circular hollow sections and solid rectangles.
 * MPa, kN, m.
 */
import { statusOfRatio, type CheckInput, type CheckRow } from '../../../design-contract';

export const GAMMA_M1 = 1.1;
export const GAMMA_M2 = 1.25;
const E = 70000, G = 27000;

export interface AluSection {
  kind: 'I' | 'RHS' | 'CHS' | 'rect';
  /** m: width, depth, web and flange thickness (wall thickness for hollow). */
  b: number; h: number; tw?: number; tf?: number; t?: number;
  a: number; iy: number; iz: number; j: number;
}

export type AluClass = 1 | 2 | 3 | 4;

/** Buckling class from the temper: heat-treated (T4 and above) A, otherwise B (EN 1999-1-1 Table 3.2). */
export const bucklingClass = (designation: string): 'A' | 'B' => (/-T\d/i.test(designation) ? 'A' : 'B');

/** The slenderness limits β1, β2, β3 of Table 6.2, members without welds, before ε. */
const LIMITS = {
  A: { internal: [11, 16, 22], outstand: [3, 4.5, 6] },
  B: { internal: [13, 16.5, 18], outstand: [3.5, 4.5, 5] },
} as const;

function partClass(beta: number, eps: number, kind: 'internal' | 'outstand', cls: 'A' | 'B'): AluClass {
  const [b1, b2, b3] = LIMITS[cls][kind];
  return beta <= b1! * eps ? 1 : beta <= b2! * eps ? 2 : beta <= b3! * eps ? 3 : 4;
}

/** The section's class in compression and in bending about its strong axis. */
export function sectionClass(s: AluSection, fo: number, cls: 'A' | 'B'): { compression: AluClass; bending: AluClass; parts: string[] } {
  const eps = Math.sqrt(250 / fo);
  const parts: string[] = [];
  let comp: AluClass = 1, bend: AluClass = 1;
  const add = (label: string, beta: number, kind: 'internal' | 'outstand', inBending: boolean) => {
    const c = partClass(beta, eps, kind, cls);
    parts.push(`${label}: β = ${beta.toFixed(1)}, class ${c}`);
    comp = Math.max(comp, c) as AluClass;
    if (inBending) bend = Math.max(bend, c) as AluClass;
  };
  if (s.kind === 'I' && s.tw && s.tf) {
    const outstand = (s.b - s.tw) / 2 / s.tf, web = (s.h - 2 * s.tf) / s.tw;
    add('flange', outstand, 'outstand', true);
    add('web', web, 'internal', false);
    // The web in bending: β = 0.40 b/t (stress gradient ψ = −1, 6.1.4.3).
    bend = Math.max(bend, partClass(0.4 * web, eps, 'internal', cls)) as AluClass;
  } else if (s.kind === 'RHS' && s.t) {
    add('wall', (Math.max(s.b, s.h) - 2 * s.t) / s.t, 'internal', true);
  } else if (s.kind === 'CHS' && s.t) {
    // Tubes: β = 3·√(D/t) (6.1.4.3).
    add('tube', 3 * Math.sqrt(s.h / s.t), 'internal', true);
  }
  return { compression: comp, bending: bend, parts };
}

/** The reduction factor χ of 6.3.1.2 for a relative slenderness. */
export function chi(lambda: number, cls: 'A' | 'B'): number {
  const [alpha, l0] = cls === 'A' ? [0.2, 0.1] : [0.32, 0];
  const phi = 0.5 * (1 + alpha! * (lambda - l0!) + lambda * lambda);
  return Math.min(1, 1 / (phi + Math.sqrt(Math.max(phi * phi - lambda * lambda, 0))));
}

/** The plastic modulus about the strong axis, m³. */
function wpl(s: AluSection): number {
  if (s.kind === 'I' && s.tw && s.tf) return s.b * s.tf * (s.h - s.tf) + (s.tw * (s.h - 2 * s.tf) ** 2) / 4;
  if (s.kind === 'RHS' && s.t) return (s.b * s.h * s.h) / 4 - ((s.b - 2 * s.t) * (s.h - 2 * s.t) ** 2) / 4;
  if (s.kind === 'CHS' && s.t) return (s.h ** 3 - (s.h - 2 * s.t) ** 3) / 6;
  return (s.b * s.h * s.h) / 4;
}

export interface AluDemand { n: number; vStrong: number; vWeak: number; mStrong: number; mWeak: number; comboName: string; x: number }

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const inp = (symbol: string, value: number, unit?: string): CheckInput => ({ symbol, value: r3(value), ...(unit ? { unit } : {}) });

export function aluminiumCheckRows(
  s: AluSection, grade: { fo: number; fu: number; designation: string },
  geo: { L: number; Lb: number; kStrong?: number; kWeak?: number }, demands: readonly AluDemand[],
): CheckRow[] {
  const cls = bucklingClass(grade.designation);
  const c = sectionClass(s, grade.fo, cls);
  const base = { code: 'en-1999-1-1', edition: '2007' };
  if (c.compression === 4 || c.bending === 4) {
    return [{ ...base, clause: '6.1.4', title: 'Cross-section class', titleKey: 'check.alu.class', formula: 'β ≤ β3·ε', inputs: [], ratio: null, status: 'unsupported', derivation: c.parts }];
  }
  const fo = grade.fo, A = s.a;
  const wy = c.bending <= 2 ? wpl(s) : s.iy / (s.h / 2);
  const wz = s.iz / (s.b / 2);
  const NcRd = (A * fo / GAMMA_M1) * 1000;
  const NtRd = Math.min(A * fo / GAMMA_M1, (0.9 * A * grade.fu) / GAMMA_M2) * 1000;
  const MyRd = (wy * fo / GAMMA_M1) * 1000, MzRd = (wz * fo / GAMMA_M1) * 1000;
  const av = s.kind === 'I' && s.tw && s.tf ? s.tw * (s.h - 2 * s.tf) : s.kind === 'RHS' && s.t ? 2 * s.t * (s.h - 2 * s.t) : s.kind === 'CHS' ? (2 * A) / Math.PI : A * 2 / 3;
  const VRd = ((av * fo) / (Math.sqrt(3) * GAMMA_M1)) * 1000;
  // Flexural buckling about each axis.
  const ncr = (I: number, k = 1) => (Math.PI ** 2 * E * I) / (k * geo.L) ** 2 * 1000;
  const lamY = Math.sqrt((A * fo * 1000) / ncr(s.iy, geo.kStrong)), lamZ = Math.sqrt((A * fo * 1000) / ncr(s.iz, geo.kWeak));
  const chiMin = Math.min(chi(lamY, cls), chi(lamZ, cls));
  // Lateral-torsional buckling, open sections only (C1 = 1).
  let chiLT = 1, mcr = Infinity;
  if (s.kind === 'I' && s.tf && geo.Lb > 0) {
    const iw = (s.iz * (s.h - s.tf) ** 2) / 4;
    mcr = ((Math.PI ** 2 * E * s.iz) / geo.Lb ** 2) * Math.sqrt(iw / s.iz + (geo.Lb ** 2 * G * s.j) / (Math.PI ** 2 * E * s.iz)) * 1000;
    const lamLT = Math.sqrt((wy * fo * 1000) / mcr);
    const [aLT, l0LT] = c.bending <= 2 ? [0.1, 0.6] : [0.2, 0.4];
    const phi = 0.5 * (1 + aLT! * (lamLT - l0LT!) + lamLT * lamLT);
    chiLT = Math.min(1, 1 / (phi + Math.sqrt(Math.max(phi * phi - lamLT * lamLT, 0))));
  }
  const NbRd = chiMin * NcRd, MbRd = chiLT * MyRd;
  const worst = new Map<string, CheckRow>();
  const keep = (r: CheckRow) => { const w = worst.get(r.title); if (!w || (r.ratio ?? 0) > (w.ratio ?? 0)) worst.set(r.title, r); };
  const steps = [`buckling class ${cls}`, ...c.parts, `γM1 = ${GAMMA_M1}`];
  const row = (key: string, title: string, clause: string, formula: string, demand: number, capacity: number, unit: string, inputs: CheckInput[], dm: AluDemand, extra: string[] = []): CheckRow => {
    const ratio = capacity > 0 ? demand / capacity : Number.POSITIVE_INFINITY;
    return { ...base, clause, title, titleKey: `check.alu.${key}`, formula, inputs, demand: r3(demand), capacity: r3(capacity), unit, ratio: r3(ratio), status: statusOfRatio(ratio), combination: dm.comboName, location: `x = ${dm.x.toFixed(2)} m`, derivation: [...steps, ...extra] };
  };
  for (const dm of demands) {
    const Nc = Math.max(0, -dm.n), Nt = Math.max(0, dm.n), My = Math.abs(dm.mStrong), Mz = Math.abs(dm.mWeak);
    if (Nt > 0) keep(row('tension', 'Tension', '6.2.3', 'NEd ≤ min(A·fo/γM1; 0,9·Anet·fu/γM2)', Nt, NtRd, 'kN', [inp('fo', fo, 'MPa'), inp('fu', grade.fu, 'MPa'), inp('A', A * 1e4, 'cm²')], dm));
    if (Nc > 0) keep(row('buckling', 'Flexural buckling', '6.3.1', 'NEd ≤ χ·A·fo/γM1', Nc, NbRd, 'kN', [inp('λ̄y', lamY), inp('λ̄z', lamZ), inp('χ', chiMin), inp('NRd', NcRd, 'kN')], dm));
    if (My > 0) keep(row('bendingStrong', 'Bending, strong axis', '6.3.2', 'MEd ≤ χLT·α·W·fo/γM1', My, MbRd, 'kN·m', [inp('W', wy * 1e6, 'cm³'), inp('χLT', chiLT), ...(Number.isFinite(mcr) ? [inp('Mcr', mcr, 'kN·m')] : [])], dm));
    if (Mz > 0) keep(row('bendingWeak', 'Bending, weak axis', '6.2.5', 'MEd ≤ W·fo/γM1', Mz, MzRd, 'kN·m', [inp('W', wz * 1e6, 'cm³')], dm));
    const V = Math.abs(dm.vStrong);
    if (V > 0) keep(row('shear', 'Shear', '6.2.6', 'VEd ≤ Av·fo/(√3·γM1)', V, VRd, 'kN', [inp('Av', av * 1e4, 'cm²')], dm));
    if ((Nc > 0 || Nt > 0) && (My > 0 || Mz > 0)) {
      const u = (Nc > 0 ? Nc / NbRd : Nt / NtRd) + My / MbRd + Mz / MzRd;
      keep(row('interaction', 'Axial force and bending', '6.3.3', 'NEd/NRd + My,Ed/My,Rd + Mz,Ed/Mz,Rd ≤ 1', u, 1, '', [inp('NEd', Nc || Nt, 'kN'), inp('My,Ed', My, 'kN·m'), inp('Mz,Ed', Mz, 'kN·m')], dm, ['linear interaction (conservative)']));
    }
  }
  return [...worst.values()];
}
