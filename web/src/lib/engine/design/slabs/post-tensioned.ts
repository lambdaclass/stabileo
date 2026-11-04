/**
 * Post-tensioned slabs with unbonded tendons, CIRSOC 201-2025, by load balancing.
 *
 * A direction of a panel carries `count` tendons across its width on a parabola through its height
 * over the left support, its low point at midspan and its height over the right support (from the
 * soffit). Its drape a gives the upward load wb = 8·P·a/L² per metre of width.
 *
 * The force along a tendon: jacked at fpj (20.3.2.5.1), lost to friction P(x) = Pj·e^−(μα + kx)
 * with α the angle the parabola turns through (20.3.2.6.2: μ and k from the maker's tests), to the
 * wedge set over the length it reaches, to elastic shortening (half of Eps/Eci·fcgp, the tendons
 * stressed one after another), and to a lumped long-term loss the person states (creep, shrinkage,
 * relaxation; 20.3.2.6.1). The force used across the span is its mean.
 *
 * The moments come from the analysis: per metre of width at rows along the span, the dead and the
 * live moments in service. The balancing load moves the slab as the dead load does, scaled by
 * wb / wD (the load the dead moments came from), so the balancing moment M_bal = −wb/wD·M_D carries
 * the continuity the model has; the secondary moment is M2 = M_bal + P·e.
 *
 * Rows: average compression (8.6.2.1), tendon stresses (20.3.2.5.1), concrete stresses at transfer
 * (24.5.3.1, 24.5.3.2) and in service (24.5.4.1; Class U, ft ≤ 0,5√f'c for two-way slabs,
 * 24.5.2.1), bonded minimum steel (8.6.2.3), and flexural strength with fps of 20.3.2.4.1 against
 * Mu + M2 (22.3). m, kN, MPa; moments per metre of width, sagging positive.
 */
import { statusOfRatio, type CheckInput, type CheckRow } from '../../../design-contract';

export interface TendonSystem {
  /** Strand strength and yield, its modulus, MPa; the area of one tendon, mm². */
  fpu: number; fpy: number; eps: number; aps: number;
  /** Jacking stress over fpu. */
  jackRatio: number;
  /** Curvature and wobble friction, 1/rad and 1/m; the wedge set, mm. */
  mu: number; k: number; seating: number;
  /** Lumped long-term loss, MPa. */
  longTermLoss: number;
  /** Concrete strength at transfer, MPa. */
  fci: number;
  liveEnds: 'one' | 'both';
}

export interface TendonLayout {
  count: number;
  /** Heights of the tendon's centroid above the soffit, m. */
  yLeft: number; yLow: number; yRight: number;
  /** Banded over the column lines (the other direction then sets the spacing limit). */
  banded?: boolean;
}

export interface PtStrip {
  h: number; span: number; width: number; fc: number; fy: number;
  /** Span of the orthogonal direction, m: the strip at the columns for Acf (8.6.2.3). */
  transverse: number;
  /** Service moments per metre at rows along the span: dead, and live as its largest and smallest. */
  service: ReadonlyArray<{ at: number; dead: number; livePos: number; liveNeg: number }>;
  /** Factored moments per metre at the same rows, the envelope of the combinations. */
  factored: ReadonlyArray<{ at: number; pos: number; neg: number }>;
  /** Dead load the dead moments came from, and the slab's own weight, kN/m². */
  wDead: number; wSelf: number;
  /** Bonded steel placed, m² per metre (positive zone) and m² at each column (negative). */
  bonded?: { pos?: number; neg?: number };
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const inp = (symbol: string, value: number, unit?: string): CheckInput => ({ symbol, value: r3(value), ...(unit ? { unit } : {}) });
const row = (key: string, title: string, clause: string, formula: string, demand: number, capacity: number, unit: string, inputs: CheckInput[], extra: Partial<CheckRow> = {}): CheckRow => {
  const ratio = capacity > 0 ? demand / capacity : Number.POSITIVE_INFINITY;
  return { code: 'cirsoc-201', edition: '2025', clause, title, titleKey: `check.pt.${key}`, formula, inputs, demand: r3(demand), capacity: r3(capacity), unit, ratio: r3(ratio), status: statusOfRatio(ratio), ...extra };
};

/** The parabola through the three heights: y(x), its slope, the curvature and the drape. */
export function tendonProfile(l: TendonLayout, L: number) {
  const A = (2 * (l.yLeft + l.yRight - 2 * l.yLow)) / (L * L);
  const B = (l.yRight - l.yLeft) / L - A * L;
  return {
    y: (x: number) => A * x * x + B * x + l.yLeft,
    slope: (x: number) => 2 * A * x + B,
    curvature: 2 * A,
    drape: (l.yLeft + l.yRight) / 2 - l.yLow,
  };
}

/** Heights of the tendon at the tenths of the span, for the chairs. */
export function controlPoints(l: TendonLayout, L: number, n = 10): Array<{ x: number; y: number }> {
  const p = tendonProfile(l, L);
  return Array.from({ length: n + 1 }, (_, i) => ({ x: r3((L * i) / n), y: r3(p.y((L * i) / n)) }));
}

/** Ec = 4700·√f'c, MPa (19.2.2.1). */
export const ecOf = (fc: number) => 4700 * Math.sqrt(fc);

export interface TendonForces {
  /** Per tendon, kN: at the jack, at the anchor after the wedges seat, the mean after friction and set. */
  pj: number; pAnchor: number; pInitial: number;
  /** Length the wedge set reaches, m; the friction and set loss along x, kN. */
  xSet: number; at: (x: number) => number;
  /** Elastic shortening and the stress the tendon keeps, MPa; the effective force per tendon, kN. */
  esLoss: number; fse: number; pe: number;
}

export function tendonForces(sys: TendonSystem, l: TendonLayout, L: number, h: number, width: number): TendonForces {
  const pj = (sys.jackRatio * sys.fpu * sys.aps) / 1000;
  const prof = tendonProfile(l, L);
  const reach = sys.liveEnds === 'both' ? L / 2 : L;
  // Angle turned from the live end: the parabola's slope changes at a constant rate.
  const friction = (x: number) => pj * Math.exp(-(sys.mu * Math.abs(prof.curvature) * x + sys.k * x));
  // Wedge set: the loss mirrors the friction slope back from the anchor over xSet (E·A·Δ = area between).
  const p = reach > 0 ? (pj - friction(reach)) / reach : 0;
  const eaDelta = (sys.eps * sys.aps * sys.seating) / 1e6; // kN·m
  let xSet: number, at: (x: number) => number;
  if (p > 0 && Math.sqrt(eaDelta / p) <= reach) {
    xSet = Math.sqrt(eaDelta / p);
    at = (x) => (x < xSet ? friction(x) - 2 * p * (xSet - x) : friction(x));
  } else {
    xSet = reach;
    const drop = reach > 0 ? (eaDelta - p * reach * reach) / reach : 0;
    at = (x) => friction(x) - drop - 2 * p * (reach - x);
  }
  const n = 50;
  let sum = 0;
  for (let i = 0; i <= n; i++) sum += (i === 0 || i === n ? 0.5 : 1) * at((reach * i) / n);
  const pInitial = sum / n;
  const fcgp = (l.count * pInitial) / (h * width) / 1000;
  const esLoss = 0.5 * (sys.eps / ecOf(sys.fci)) * fcgp;
  const fse = (pInitial * 1000) / sys.aps - esLoss - sys.longTermLoss;
  const along = (x: number) => (sys.liveEnds === 'both' && x > L / 2 ? at(L - x) : at(x));
  return { pj, pAnchor: at(0), pInitial, xSet, at: along, esLoss, fse, pe: (fse * sys.aps) / 1000 };
}

/** fps of an unbonded tendon, Tabla 20.3.2.4.1; null when fse < 0,5·fpu. */
export function unbondedFps(fse: number, fpu: number, fpy: number, fc: number, rhoP: number, spanOverH: number): number | null {
  if (fse < 0.5 * fpu) return null;
  return spanOverH <= 35
    ? Math.min(fse + 70 + fc / (100 * rhoP), fse + 420, fpy)
    : Math.min(fse + 70 + fc / (300 * rhoP), fse + 210, fpy);
}

const beta1 = (fc: number) => Math.min(0.85, Math.max(0.65, 0.85 - (0.05 * (fc - 28)) / 7));

/** The rows of one direction of a post-tensioned panel. */
export function ptStripRows(sys: TendonSystem, l: TendonLayout, s: PtStrip): { rows: CheckRow[]; forces: TendonForces; wb: number; pe: number } {
  const f = tendonForces(sys, l, s.span, s.h, s.width);
  const prof = tendonProfile(l, s.span);
  const pe = (l.count * f.pe) / s.width, pi = (l.count * (f.pInitial - (f.esLoss * sys.aps) / 1000)) / s.width;
  const A = s.h, S = (s.h * s.h) / 6;
  const wb = (8 * pe * prof.drape) / (s.span * s.span), wbi = (8 * pi * prof.drape) / (s.span * s.span);
  const ratio = (w: number) => (s.wDead > 0 ? w / s.wDead : 0);
  const fmtAt = (x: number) => `at ${x.toFixed(2)} m`;
  // Fibre stresses, MPa, tension positive.
  const fibres = (p: number, m: number) => ({ top: (-p / A - m / S) / 1000, bot: (-p / A + m / S) / 1000 });
  type Worst = { v: number; at: number };
  const worst = (pick: (r: (typeof s.service)[number]) => number[]): Worst => {
    let w: Worst = { v: -Infinity, at: 0 };
    for (const r of s.service) for (const v of pick(r)) if (v > w.v) w = { v, at: r.at };
    return w;
  };
  const mBal = (r: { dead: number }) => -ratio(wb) * r.dead;
  const transfer = worst((r) => { const m = ratio(s.wSelf) * r.dead - ratio(wbi) * r.dead, st = fibres(pi, m); return [st.top, st.bot]; });
  const transferC = worst((r) => { const m = ratio(s.wSelf) * r.dead - ratio(wbi) * r.dead, st = fibres(pi, m); return [-st.top, -st.bot]; });
  const sustainedC = worst((r) => { const st = fibres(pe, r.dead + mBal(r)); return [-st.top, -st.bot]; });
  const totalC = worst((r) => [r.livePos, r.liveNeg].flatMap((lv) => { const st = fibres(pe, r.dead + lv + mBal(r)); return [-st.top, -st.bot]; }));
  const totalT = worst((r) => [r.livePos, r.liveNeg].flatMap((lv) => { const st = fibres(pe, r.dead + lv + mBal(r)); return [st.top, st.bot]; }));
  const sq = Math.sqrt(s.fc), sqi = Math.sqrt(sys.fci);
  const fpjMax = Math.min(0.94 * sys.fpy, 0.8 * sys.fpu);
  const fAnchor = (f.pAnchor * 1000) / sys.aps;

  const rows: CheckRow[] = [
    row('jacking', 'Tendon stress at the jack', '20.3.2.5.1', 'fpj ≤ min(0,94·fpy; 0,80·fpu)', sys.jackRatio * sys.fpu, fpjMax, 'MPa', [inp('fpu', sys.fpu, 'MPa'), inp('fpy', sys.fpy, 'MPa')]),
    row('anchor', 'Tendon stress at the anchor after transfer', '20.3.2.5.1', 'fp ≤ 0,70·fpu', fAnchor, 0.7 * sys.fpu, 'MPa', [inp('μ', sys.mu), inp('k', sys.k, '1/m'), inp('Δset', sys.seating, 'mm'), inp('x,set', f.xSet, 'm')]),
    row('precompression', 'Average precompression', '8.6.2.1', 'P/A ≥ 0,9 MPa', 0.9, pe / A / 1000, 'MPa',
      [inp('Pe', pe, 'kN/m'), inp('fse', f.fse, 'MPa'), inp('Δf,ES', f.esLoss, 'MPa'), inp('Δf,LT', sys.longTermLoss, 'MPa')]),
    row('transferC', 'Compression at transfer', '24.5.3.1', 'σc ≤ 0,60·f\'ci', Math.max(0, transferC.v), 0.6 * sys.fci, 'MPa', [inp('Pi', pi, 'kN/m'), inp('wb,i', wbi, 'kN/m²')], { location: fmtAt(transferC.at) }),
    row('transferT', 'Tension at transfer', '24.5.3.2', 'σt ≤ 0,25·√f\'ci', Math.max(0, transfer.v), 0.25 * sqi, 'MPa', [inp('f\'ci', sys.fci, 'MPa')], { location: fmtAt(transfer.at) }),
    row('sustained', 'Compression, prestress and permanent loads', '24.5.4.1', 'σc ≤ 0,45·f\'c', Math.max(0, sustainedC.v), 0.45 * s.fc, 'MPa', [inp('wb', wb, 'kN/m²'), inp('wD', s.wDead, 'kN/m²')], { location: fmtAt(sustainedC.at) }),
    row('totalC', 'Compression, prestress and all loads', '24.5.4.1', 'σc ≤ 0,60·f\'c', Math.max(0, totalC.v), 0.6 * s.fc, 'MPa', [], { location: fmtAt(totalC.at) }),
    row('classU', 'Tension in service, Class U', '24.5.2.1', 'ft ≤ 0,5·√f\'c', Math.max(0, totalT.v), 0.5 * sq, 'MPa', [], { location: fmtAt(totalT.at) }),
  ];

  // Bonded minimum steel, Tabla 8.6.2.3: positive zone from the tension block, at the columns 0,00075·Acf.
  const ftPos = Math.max(0, ...s.service.map((r) => Math.max(fibres(pe, r.dead + r.livePos + mBal(r)).bot, 0)));
  const fy = Math.min(s.fy, 420);
  let asPos = 0, posNote = 'ft ≤ 0,17·√f\'c: not required';
  if (ftPos > 0.17 * sq) {
    const fcomp = ftPos + (2 * pe) / A / 1000; // the other fibre, from the linear profile
    const yt = (s.h * ftPos) / (ftPos + Math.max(fcomp, 1e-9));
    const nc = 0.5 * ftPos * 1000 * yt; // kN per metre
    asPos = nc / (0.5 * fy * 1000);
    posNote = `Nc = ${nc.toFixed(1)} kN/m`;
  }
  const acf = s.h * Math.max(s.span, s.transverse), asNeg = 0.00075 * acf;
  const bondedRow = (key: string, title: string, need: number, have: number | undefined, unit: string, formula: string, note: string): CheckRow => (need <= 0
    ? { code: 'cirsoc-201', edition: '2025', clause: '8.6.2.3', title, titleKey: `check.pt.${key}`, formula, inputs: [], demand: 0, unit, ratio: 0, status: 'ok', derivation: [note] }
    : have === undefined
      ? { code: 'cirsoc-201', edition: '2025', clause: '8.6.2.3', title, titleKey: `check.pt.${key}`, formula, inputs: [], demand: r3(need * 1e4), unit, ratio: null, status: 'notVerified', derivation: [note, 'bonded steel to place not stated'] }
      : row(key, title, '8.6.2.3', formula, need * 1e4, have * 1e4, unit, [], { derivation: [note] }));
  rows.push(
    bondedRow('bondedPos', 'Bonded steel, positive moment', asPos, s.bonded?.pos, 'cm²/m', 'As,min = Nc / (0,5·fy)', posNote),
    bondedRow('bondedNeg', 'Bonded steel at the columns', asNeg, s.bonded?.neg, 'cm²', 'As,min = 0,00075·Acf', `Acf = ${acf.toFixed(3)} m²`),
  );

  // Strength at the worst positive and negative factored rows, with the secondary moment.
  const apsPerM = (l.count * sys.aps) / 1e6 / s.width;
  const strength = (sign: 1 | -1) => {
    const pick = s.factored.reduce((b, r) => ((sign > 0 ? r.pos : -r.neg) > (sign > 0 ? b.pos : -b.neg) ? r : b), s.factored[0]!);
    const svc = s.service.reduce((b, r) => (Math.abs(r.at - pick.at) < Math.abs(b.at - pick.at) ? r : b), s.service[0]!);
    const y = prof.y(pick.at), e = s.h / 2 - y;
    const m2 = mBal(svc) + pe * e;
    const mu = sign > 0 ? pick.pos + m2 : -(pick.neg + m2);
    const dp = sign > 0 ? s.h - y : y;
    const rhoP = apsPerM / dp;
    const fps = unbondedFps(f.fse, sys.fpu, sys.fpy, s.fc, rhoP, s.span / s.h);
    const key = sign > 0 ? 'strengthPos' : 'strengthNeg', title = sign > 0 ? 'Flexural strength, positive' : 'Flexural strength over the support';
    if (fps === null) return { code: 'cirsoc-201', edition: '2025', clause: '20.3.2.4.1', title, titleKey: `check.pt.${key}`, formula: 'fse ≥ 0,5·fpu', inputs: [inp('fse', f.fse, 'MPa')], ratio: null, status: 'unsupported', location: fmtAt(pick.at) } as CheckRow;
    const bonded = (sign > 0 ? s.bonded?.pos : undefined) ?? 0;
    const T = apsPerM * fps * 1000 + bonded * fy * 1000;
    const a = T / (0.85 * s.fc * 1000), c = a / beta1(s.fc);
    const et = (0.003 * (dp - c)) / c;
    const phi = Math.min(0.9, Math.max(0.65, 0.65 + (0.25 * (et - 0.002)) / 0.003));
    const mn = T * (dp - a / 2);
    return row(key, title, '22.3', 'Mu + M2 ≤ φ·Mn; fps by Tabla 20.3.2.4.1', Math.max(0, mu), phi * mn, 'kN·m/m',
      [inp('Mu', sign > 0 ? pick.pos : pick.neg, 'kN·m/m'), inp('M2', m2, 'kN·m/m'), inp('dp', dp * 1000, 'mm'), inp('fps', fps, 'MPa'), inp('φ', phi)], { location: fmtAt(pick.at) });
  };
  if (s.factored.length && s.service.length) rows.push(strength(1), strength(-1));
  return { rows, forces: f, wb, pe };
}

/** 8.7.2.3: in at least one direction the tendons are no farther apart than 8h and 1,5 m. */
export function ptSpacingRow(h: number, dirs: ReadonlyArray<{ dir: string; layout: TendonLayout; width: number }>): CheckRow {
  const limit = Math.min(8 * h, 1.5);
  const spaced = dirs.filter((d) => !d.layout.banded && d.layout.count > 0).map((d) => ({ dir: d.dir, s: d.width / d.layout.count }));
  const best = spaced.sort((a, b) => a.s - b.s)[0];
  if (!best) return { code: 'cirsoc-201', edition: '2025', clause: '8.7.2.3', title: 'Tendon spacing', titleKey: 'check.pt.spacing', formula: 's ≤ min(8h; 1,5 m)', inputs: [], ratio: null, status: 'fail', derivation: ['no direction has distributed tendons'] };
  return row('spacing', 'Tendon spacing', '8.7.2.3', 's ≤ min(8h; 1,5 m)', best.s, limit, 'm', [inp('h', h * 1000, 'mm')], { location: best.dir });
}

/**
 * An order to stress the tendons of a direction: from the middle of the width outwards, one side
 * and then the other, so the slab is never compressed on one edge only.
 */
export function stressingOrder(count: number): number[] {
  const mid = (count - 1) / 2, idx = Array.from({ length: count }, (_, i) => i);
  return idx.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b).map((i) => i + 1);
}
