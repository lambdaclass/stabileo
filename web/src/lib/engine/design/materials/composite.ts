/**
 * Composite steel-concrete members by AISC 360-10 Chapter I, which CIRSOC 301-2018 refers to for
 * its own Chapter I (left undeveloped there). Two kinds of member:
 *
 *  · columns, filled (a rectangular or round tube full of concrete, I2.2) or encased (a steel
 *    shape inside a reinforced concrete section, I2.1): compressive strength with the effective
 *    stiffness of the composite section, tension, flexure and shear of the steel section, and the
 *    interaction of I5 (Chapter H's equations);
 *  · beams, an I section under a solid slab with headed studs (I3.2): positive flexure by the
 *    plastic stress distribution with the slab force limited by the steel, the concrete and the
 *    studs; negative flexure and shear by the steel section alone.
 *
 * Decisions stated here: a filled tube must be compact for axial load (Table I1.1A; noncompact and
 * slender walls are not evaluated); the flexural strength of a column is the steel section's
 * plastic moment, the lower bound I3.3 and I3.4 allow; the slab has no deck (Rg = 1, Rp = 0.75).
 * MPa, kN, m.
 */
import { statusOfRatio, type CheckInput, type CheckRow } from '../../../design-contract';

export const ES = 200000;
/** Concrete modulus, AISC 360-10 I2.1b with wc = 2320 kg/m³: 0,043·wc^1,5·√f'c. */
export const ecOf = (fc: number) => 0.043 * 2320 ** 1.5 * Math.sqrt(fc);

export interface SteelShape {
  kind: 'I' | 'RHS' | 'CHS';
  b: number; h: number; tw?: number; tf?: number; t?: number;
  a: number; iy: number; iz: number; fy: number; fu?: number;
}

export type CompositeSpec =
  | { kind: 'filled'; fc: number }
  | { kind: 'encased'; fc: number; b: number; h: number; rebar?: { as: number; fy: number; i?: number } }
  | { kind: 'beam'; fc: number; bEff: number; tc: number; studs?: { count: number; d: number; fu: number } };

export interface CompositeDemand { n: number; v: number; mStrong: number; mWeak: number; comboName: string; x: number }

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const inp = (symbol: string, value: number, unit?: string): CheckInput => ({ symbol, value: r3(value), ...(unit ? { unit } : {}) });

function zPlastic(s: SteelShape): { zy: number; zz: number } {
  if (s.kind === 'I' && s.tw && s.tf) {
    const hw = s.h - 2 * s.tf;
    return { zy: s.b * s.tf * (s.h - s.tf) + (s.tw * hw * hw) / 4, zz: (s.tf * s.b * s.b) / 2 + (hw * s.tw * s.tw) / 4 };
  }
  if (s.kind === 'RHS' && s.t) {
    const z = (b: number, h: number) => (b * h * h) / 4 - ((b - 2 * s.t!) * (h - 2 * s.t!) ** 2) / 4;
    return { zy: z(s.b, s.h), zz: z(s.h, s.b) };
  }
  if (s.kind === 'CHS' && s.t) { const z = (s.h ** 3 - (s.h - 2 * s.t) ** 3) / 6; return { zy: z, zz: z }; }
  return { zy: (s.b * s.h * s.h) / 4, zz: (s.h * s.b * s.b) / 4 };
}

/** Pn from Pno and Pe, I2-2 and I2-3. */
export function columnCurve(pno: number, pe: number): number {
  return pno / pe <= 2.25 ? pno * 0.658 ** (pno / pe) : 0.877 * pe;
}

export interface ColumnStrength { pno: number; pe: number; pn: number; eiEff: number; compact: boolean; steps: string[] }

/** The available compressive strength of a composite column about its weaker axis, kN. */
export function compositeColumnStrength(s: SteelShape, spec: Extract<CompositeSpec, { kind: 'filled' | 'encased' }>, kl: { y: number; z: number }): ColumnStrength {
  const ec = ecOf(spec.fc), steps: string[] = [`Ec = ${ec.toFixed(0)} MPa`];
  let pno: number, eiY: number, eiZ: number, compact = true;
  if (spec.kind === 'filled') {
    const t = s.t ?? 0;
    const ac = s.kind === 'CHS' ? (Math.PI * (s.h - 2 * t) ** 2) / 4 : (s.b - 2 * t) * (s.h - 2 * t);
    const icY = s.kind === 'CHS' ? (Math.PI * (s.h - 2 * t) ** 4) / 64 : ((s.b - 2 * t) * (s.h - 2 * t) ** 3) / 12;
    const icZ = s.kind === 'CHS' ? icY : ((s.h - 2 * t) * (s.b - 2 * t) ** 3) / 12;
    const ratio = s.kind === 'CHS' ? s.h / t : Math.max(s.b, s.h) / t;
    const limit = s.kind === 'CHS' ? (0.15 * ES) / s.fy : 2.26 * Math.sqrt(ES / s.fy);
    compact = ratio <= limit;
    steps.push(`${s.kind === 'CHS' ? 'D/t' : 'b/t'} = ${ratio.toFixed(1)} ≤ λp = ${limit.toFixed(1)} (Table I1.1A): ${compact ? 'compact' : 'not compact'}`);
    const c2 = s.kind === 'CHS' ? 0.95 : 0.85;
    pno = s.fy * s.a + c2 * spec.fc * ac;
    const c3 = Math.min(0.9, 0.6 + 2 * (s.a / (ac + s.a)));
    eiY = ES * s.iy + c3 * ec * icY; eiZ = ES * s.iz + c3 * ec * icZ;
    steps.push(`Pno = Fy·As + C2·f'c·Ac, C2 = ${c2} (I2-9b)`, `EIeff = Es·Is + C3·Ec·Ic, C3 = ${c3.toFixed(3)} (I2-12)`);
  } else {
    const ag = spec.b * spec.h, asr = spec.rebar?.as ?? 0, ac = ag - s.a - asr;
    pno = s.fy * s.a + (spec.rebar?.fy ?? 0) * asr + 0.85 * spec.fc * ac;
    const c1 = Math.min(0.3, 0.1 + 2 * (s.a / (ac + s.a)));
    const icY = (spec.b * spec.h ** 3) / 12, icZ = (spec.h * spec.b ** 3) / 12, isr = spec.rebar?.i ?? 0;
    eiY = ES * s.iy + 0.5 * ES * isr + c1 * ec * icY; eiZ = ES * s.iz + 0.5 * ES * isr + c1 * ec * icZ;
    steps.push(`Pno = Fy·As + Fysr·Asr + 0,85·f'c·Ac (I2-4)`, `EIeff = Es·Is + 0,5·Es·Isr + C1·Ec·Ic, C1 = ${c1.toFixed(3)} (I2-6)`);
  }
  pno *= 1000;
  const pe = Math.min((Math.PI ** 2 * eiY) / kl.y ** 2, (Math.PI ** 2 * eiZ) / kl.z ** 2) * 1000;
  return { pno, pe, pn: columnCurve(pno, pe), eiEff: Math.min(eiY, eiZ), compact, steps };
}

/**
 * The plastic moment of an I section under a slab carrying the compression C (≤ As·Fy), kN·m:
 * the slab block at a = C/(0,85·f'c·beff) below its top, the steel split at the depth where its
 * compression is (As·Fy − C)/2.
 */
export function compositeBeamMoment(s: SteelShape, spec: Extract<CompositeSpec, { kind: 'beam' }>, cMax: number): { mn: number; pnaInSlab: boolean; a: number } {
  const fy = s.fy, tf = s.tf!, tw = s.tw!, h = s.h;
  const asfy = s.a * fy * 1000;
  const C = Math.min(cMax, asfy);
  const a = C / (0.85 * spec.fc * 1000 * spec.bEff);
  const ySlab = h + spec.tc - a / 2; // from the steel's underside
  if (C >= asfy - 1e-6) return { mn: C * (ySlab - h / 2), pnaInSlab: true, a };
  // PNA in the steel: the steel above it carries (As·Fy − C)/2 in compression.
  const above = (asfy - C) / 2 / (fy * 1000);
  const yPna = above <= s.b * tf ? h - above / s.b
    : above <= s.b * tf + tw * (h - 2 * tf) ? h - tf - (above - s.b * tf) / tw
      : tf - (above - s.b * tf - tw * (h - 2 * tf)) / s.b;
  // First moment about the underside of the steel below y.
  const below = (y: number) => {
    const yb = Math.min(y, tf), yw = Math.min(Math.max(y, tf), h - tf), yt = Math.max(y, h - tf);
    return (s.b * yb * yb) / 2 + (tw * (yw - tf) * (yw + tf)) / 2 + (s.b * (yt - (h - tf)) * (yt + h - tf)) / 2;
  };
  // The resisting couple: compression (slab and steel above) minus tension (steel below), each by its height.
  const mn = C * ySlab + fy * 1000 * (below(h) - 2 * below(yPna));
  return { mn, pnaInSlab: false, a };
}

export function compositeCheckRows(s: SteelShape, spec: CompositeSpec, geo: { L: number; kStrong?: number; kWeak?: number }, demands: readonly CompositeDemand[]): CheckRow[] {
  const base = { code: 'aisc-360', edition: '2010' };
  const worst = new Map<string, CheckRow>();
  const keep = (r: CheckRow) => { const w = worst.get(r.title); if (!w || (r.ratio ?? 0) > (w.ratio ?? 0)) worst.set(r.title, r); };
  const row = (key: string, title: string, clause: string, formula: string, demand: number, capacity: number, unit: string, inputs: CheckInput[], dm: CompositeDemand | null, steps: string[] = []): CheckRow => {
    const ratio = capacity > 0 ? demand / capacity : Number.POSITIVE_INFINITY;
    return { ...base, clause, title, titleKey: `check.composite.${key}`, formula, inputs, demand: r3(demand), capacity: r3(capacity), unit, ratio: r3(ratio), status: statusOfRatio(ratio), ...(dm ? { combination: dm.comboName, location: `x = ${dm.x.toFixed(2)} m` } : {}), ...(steps.length ? { derivation: steps } : {}) };
  };
  const z = zPlastic(s);
  const phiMpY = 0.9 * z.zy * s.fy * 1000, phiMpZ = 0.9 * z.zz * s.fy * 1000;
  const aw = s.kind === 'I' && s.tw ? s.h * s.tw : s.kind === 'RHS' && s.t ? 2 * s.h * s.t : s.a / 2;
  const phiV = s.kind === 'I' && s.tw && s.tf && (s.h - 2 * s.tf) / s.tw <= 2.24 * Math.sqrt(ES / s.fy) ? 1.0 : 0.9;
  const phiVn = phiV * 0.6 * s.fy * aw * 1000;

  if (spec.kind === 'beam') {
    if (s.kind !== 'I' || !s.tf || !s.tw) return [{ ...base, clause: 'I3', title: 'Composite beam', titleKey: 'check.composite.beamShape', formula: 'I section under the slab', inputs: [], ratio: null, status: 'unsupported' }];
    const ec = ecOf(spec.fc);
    const asa = spec.studs ? (Math.PI * spec.studs.d ** 2) / 4 : 0;
    const qn = spec.studs ? Math.min(0.5 * asa * Math.sqrt(spec.fc * ec), 1.0 * 0.75 * asa * spec.studs.fu) * 1000 : 0;
    const sumQn = spec.studs ? qn * spec.studs.count : Infinity;
    const cConc = 0.85 * spec.fc * spec.bEff * spec.tc * 1000, cSteel = s.a * s.fy * 1000;
    const cMax = Math.min(cConc, sumQn);
    const { mn, pnaInSlab, a } = compositeBeamMoment(s, spec, cMax);
    const degree = Math.min(1, sumQn / Math.min(cConc, cSteel));
    const steps = [`C = min(As·Fy; 0,85·f'c·Ac; ΣQn) = ${Math.min(cMax, cSteel).toFixed(0)} kN (I3-1a…c)`, `a = ${(a * 100).toFixed(1)} cm, PNA ${pnaInSlab ? 'in the slab' : 'in the steel'}`, ...(spec.studs ? [`Qn = ${qn.toFixed(1)} kN per stud (I8-1), Rg = 1, Rp = 0,75`] : [])];
    for (const dm of demands) {
      if (dm.mStrong > 0) keep(row('beamPositive', 'Positive flexure, composite', 'I3.2a', 'Mu ≤ φb·Mn (plastic, φb = 0,90)', dm.mStrong, 0.9 * mn, 'kN·m', [inp('beff', spec.bEff, 'm'), inp('tc', spec.tc * 100, 'cm'), inp("f'c", spec.fc, 'MPa'), inp('Mn', mn, 'kN·m')], dm, steps));
      if (dm.mStrong < 0) keep(row('beamNegative', 'Negative flexure, steel section', 'I3.2b', 'Mu ≤ φb·Mp', -dm.mStrong, phiMpY, 'kN·m', [inp('Z', z.zy * 1e6, 'cm³')], dm));
      if (dm.v > 0) keep(row('shear', 'Shear', 'I4.2', 'Vu ≤ φv·0,6·Fy·Aw', dm.v, phiVn, 'kN', [inp('Aw', aw * 1e4, 'cm²'), inp('φv', phiV)], dm));
    }
    if (spec.studs) keep(row('degree', 'Composite action', 'I3.2d', 'ΣQn / min(0,85·f\'c·Ac; As·Fy) ≥ 0,25', 0.25, degree, '', [inp('ΣQn', sumQn, 'kN'), inp('n', spec.studs.count)], null, ['degree of composite action, the commentary\'s lower bound']));
    return [...worst.values()];
  }

  const kl = { y: (geo.kStrong ?? 1) * geo.L, z: (geo.kWeak ?? 1) * geo.L };
  const st = compositeColumnStrength(s, spec, kl);
  if (spec.kind === 'filled' && !st.compact) {
    return [{ ...base, clause: 'I1.4', title: 'Wall slenderness', titleKey: 'check.composite.compactness', formula: 'b/t ≤ λp', inputs: [], ratio: null, status: 'unsupported', derivation: st.steps }];
  }
  const phiPn = 0.75 * st.pn;
  const phiTn = 0.9 * (s.a * s.fy + (spec.kind === 'encased' ? (spec.rebar?.as ?? 0) * (spec.rebar?.fy ?? 0) : 0)) * 1000;
  if (spec.kind === 'encased') {
    const ag = spec.b * spec.h, rho = s.a / ag;
    keep(row('steelRatio', 'Minimum steel core', 'I2.1a', 'As ≥ 0,01·Ag', 0.01, rho, '', [inp('As/Ag', rho)], null));
  }
  for (const dm of demands) {
    const pc = Math.max(0, -dm.n), pt = Math.max(0, dm.n), mx = Math.abs(dm.mStrong), my = Math.abs(dm.mWeak);
    if (pc > 0) keep(row('compression', 'Compression', spec.kind === 'filled' ? 'I2.2' : 'I2.1', 'Pu ≤ φc·Pn, φc = 0,75', pc, phiPn, 'kN', [inp('Pno', st.pno, 'kN'), inp('Pe', st.pe, 'kN'), inp('Pn', st.pn, 'kN')], dm, st.steps));
    if (pt > 0) keep(row('tension', 'Tension', 'I2.1c', 'Tu ≤ φt·(Fy·As + Fysr·Asr)', pt, phiTn, 'kN', [], dm));
    if (dm.v > 0) keep(row('shear', 'Shear', 'I4.1', 'Vu ≤ φv·0,6·Fy·Aw (steel)', dm.v, phiVn, 'kN', [inp('Aw', aw * 1e4, 'cm²')], dm));
    if (mx > 0 || my > 0) {
      const p = pc > 0 ? pc / phiPn : pt / phiTn, m = mx / phiMpY + my / phiMpZ;
      const u = p >= 0.2 ? p + (8 / 9) * m : p / 2 + m;
      keep(row('interaction', 'Axial force and flexure', 'I5', p >= 0.2 ? 'Pr/Pc + 8/9·(Mrx/Mcx + Mry/Mcy) ≤ 1' : 'Pr/2Pc + (Mrx/Mcx + Mry/Mcy) ≤ 1', u, 1, '',
        [inp('Pr/Pc', p), inp('Mcx', phiMpY, 'kN·m'), inp('Mcy', phiMpZ, 'kN·m')], dm, ['Mc = φb·Mp of the steel section (lower bound, I3.3c / I3.4)']));
    }
  }
  return [...worst.values()];
}
