/**
 * HSS-to-HSS truss connections: T, Y, cross (X) and gapped K joints of round and rectangular
 * hollow sections, under the branches' axial forces.
 *
 * CIRSOC 301-2018 leaves its chapter K undeveloped and sends the reader to CIRSOC 302-05, whose
 * text is not in this repo. The equations here are those of AISC 360-10 chapter K (K2.1 round,
 * K2.2 rectangular), the specification CIRSOC 301-2018 is built on; its text is not in the repo
 * either, so the rows carry `code: 'aisc-360'`, read as experimental. Each joint is first held
 * against its limits of applicability (Tables K2.1A and K2.2A): outside them the equations do not
 * apply and the only row says which limit fails.
 *
 * Limit states, LRFD (Fc = Fy in U):
 *  · round: chord plastification (K2-1 T/Y, K2-2 cross, K2-4 with Qg K2-5 gapped K; φ = 0,90),
 *    punching shear (K2-3, φ = 0,95), Qf (K2-6);
 *  · rectangular T/Y/cross: chord wall plastification for β ≤ 0,85 (φ = 1,00), punching for
 *    0,85 < β ≤ 1 − 1/γ or B/t < 10 (φ = 0,95), sidewall local yielding (φ = 1,00) and local
 *    crippling (T/Y φ = 0,75, cross φ = 0,90) for β = 1, uneven load in the branch for β > 0,85
 *    (φ = 0,95);
 *  · rectangular gapped K: chord wall plastification (φ = 0,90), punching (not for square
 *    branches, φ = 0,95), uneven load in the branch (not for square branches nor B/t ≥ 15,
 *    φ = 0,95) and shear of the chord in the gap by chapter G (G5, φ = 0,90).
 *
 * Units: mm, MPa, kN and kN·m. Branch force positive in tension. The wall thickness is the design
 * thickness the person states.
 */
import { statusOfRatio, type CheckInput, type CheckRow } from '../../../design-contract';

export type HssJoint = 'T' | 'Y' | 'X' | 'K';

export interface HssMember {
  /** Round: outside diameter. Rectangular: width B (across the plane of the truss) and depth H. */
  D?: number; B?: number; H?: number;
  t: number; Fy: number; Fu: number;
}
export interface HssBranch extends HssMember {
  /** Angle between branch and chord, degrees. */
  theta: number;
  /** Required axial force, kN, positive in tension. */
  P: number;
}
export interface HssTrussInput {
  joint: HssJoint;
  shape: 'round' | 'rect';
  chord: HssMember & {
    /** Area and section modulus, mm² and mm³; from the outline when absent. */
    A?: number; S?: number;
    /** Outside corner radius of a rectangular chord, mm; 1,5·t when absent. */
    k?: number;
  };
  /** One branch for T, Y and X (both sides of an X carry it); two for K, one in compression and one in tension. */
  branches: readonly HssBranch[];
  /** Gap between the K branches' toes on the chord, mm, and the joint eccentricity (positive away from the branches). */
  gap?: number; e?: number;
  /** Chord force on the side of the joint with the lower compression: axial kN (+ tension) and the moment kN·m that tensions the connecting face. */
  chordForce?: { P: number; M?: number };
  /** Modulus, MPa. */
  E?: number;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const inp = (symbol: string, value: number, unit?: string): CheckInput => ({ symbol, value: r3(value), ...(unit ? { unit } : {}) });
const base = { code: 'aisc-360', edition: '2010' } as const;
const deg = (a: number) => (a * Math.PI) / 180;

function row(key: string, title: string, clause: string, formula: string, demand: number, capacity: number, inputs: CheckInput[], derivation?: string[]): CheckRow {
  const ratio = capacity > 0 ? demand / capacity : Number.POSITIVE_INFINITY;
  return { ...base, clause, title, titleKey: `check.hss.${key}`, formula, inputs, demand: r3(demand), capacity: r3(capacity), unit: 'kN', ratio: r3(ratio), status: statusOfRatio(ratio), ...(derivation ? { derivation } : {}) };
}

/** Area and elastic section modulus of the chord, from its outline when not given. */
export function chordProperties(c: HssTrussInput['chord'], shape: 'round' | 'rect'): { A: number; S: number } {
  if (shape === 'round') {
    const D = c.D!, t = c.t;
    return { A: c.A ?? Math.PI * (D - t) * t, S: c.S ?? (Math.PI * (D ** 4 - (D - 2 * t) ** 4)) / (32 * D) };
  }
  const B = c.B!, H = c.H!, t = c.t;
  return { A: c.A ?? B * H - (B - 2 * t) * (H - 2 * t), S: c.S ?? (B * H ** 3 - (B - 2 * t) * (H - 2 * t) ** 3) / (6 * H) };
}

/**
 * U, the chord's utilization at the connecting face, and whether that face is in tension
 * (U = |Pro/(Fc·Ag) + Mro/(Fc·S)|, Fc = Fy).
 */
export function chordUtilization(i: HssTrussInput): { U: number; tension: boolean } {
  const { A, S } = chordProperties(i.chord, i.shape);
  const P = (i.chordForce?.P ?? 0) * 1000, M = (i.chordForce?.M ?? 0) * 1e6;
  const sigma = P / A + M / S;
  return { U: Math.abs(sigma) / i.chord.Fy, tension: sigma >= 0 };
}

/** The limits of applicability of Table K2.1A or K2.2A that the joint fails, as readable statements. */
export function hssLimits(i: HssTrussInput): { failed: string[]; checked: string[] } {
  const E = i.E ?? 200000, c = i.chord, failed: string[] = [], checked: string[] = [];
  const test = (ok: boolean, text: string) => { (ok ? checked : failed).push(text); };
  const k = i.joint === 'K';
  for (const b of i.branches) {
    test(b.theta >= 30, `θ = ${r3(b.theta)}° ≥ 30°`);
    test(b.Fy <= 360, `Fyb = ${b.Fy} MPa ≤ 360 MPa`);
    test(b.Fy / b.Fu <= 0.8, `Fyb/Fub = ${r3(b.Fy / b.Fu)} ≤ 0,8`);
  }
  test(c.Fy <= 360, `Fy = ${c.Fy} MPa ≤ 360 MPa`);
  test(c.Fy / c.Fu <= 0.8, `Fy/Fu = ${r3(c.Fy / c.Fu)} ≤ 0,8`);
  if (k) {
    if (i.branches.length !== 2 || !(i.branches.some((b) => b.P < 0) && i.branches.some((b) => b.P >= 0))) failed.push('K joint: one branch in compression and one in tension');
    const g = i.gap ?? 0, sumT = i.branches.reduce((s, b) => s + b.t, 0);
    test(g >= sumT, `g = ${r3(g)} mm ≥ tb,comp + tb,tens = ${r3(sumT)} mm`);
    const depth = i.shape === 'round' ? c.D! : c.H!, e = i.e ?? 0;
    test(e / depth >= -0.55 && e / depth <= 0.25, `−0,55 ≤ e/${i.shape === 'round' ? 'D' : 'H'} = ${r3(e / depth)} ≤ 0,25`);
  }
  if (i.shape === 'round') {
    const Dt = c.D! / c.t;
    test(i.joint === 'X' ? Dt <= 40 : Dt <= 50, `D/t = ${r3(Dt)} ≤ ${i.joint === 'X' ? 40 : 50}`);
    for (const b of i.branches) {
      const beta = b.D! / c.D!;
      test(b.D! / b.t <= 50 && b.D! / b.t <= (0.05 * E) / b.Fy, `Db/tb = ${r3(b.D! / b.t)} ≤ min(50; 0,05·E/Fyb)`);
      if (k) test(beta >= 0.4 && beta <= 1, `0,4 ≤ Db/D = ${r3(beta)} ≤ 1,0`);
      else test(beta > 0.2 && beta <= 1, `0,2 < Db/D = ${r3(beta)} ≤ 1,0`);
    }
  } else {
    const B = c.B!, H = c.H!, gamma = B / (2 * c.t);
    test(B / c.t <= 35 && H / c.t <= 35, `B/t = ${r3(B / c.t)} and H/t = ${r3(H / c.t)} ≤ 35`);
    test(H / B >= 0.5 && H / B <= 2, `0,5 ≤ H/B = ${r3(H / B)} ≤ 2,0`);
    for (const b of i.branches) {
      const lim = b.P < 0 ? Math.min(1.25 * Math.sqrt(E / b.Fy), 35) : 35;
      test(b.B! / b.t <= lim && b.H! / b.t <= lim, `Bb/tb and Hb/tb ≤ ${r3(lim)} (${b.P < 0 ? 'compression' : 'tension'} branch)`);
      test(b.H! / b.B! >= 0.5 && b.H! / b.B! <= 2, `0,5 ≤ Hb/Bb = ${r3(b.H! / b.B!)} ≤ 2,0`);
      if (k) test(b.B! / B >= 0.1 + gamma / 50, `Bb/B = ${r3(b.B! / B)} ≥ 0,1 + γ/50 = ${r3(0.1 + gamma / 50)}`);
      else test(b.B! / B >= 0.25 && b.B! / B <= 1, `0,25 ≤ Bb/B = ${r3(b.B! / B)} ≤ 1,0`);
    }
    if (k && i.branches.length === 2) {
      const beff = betaEff(i);
      test(beff >= 0.35, `βeff = ${r3(beff)} ≥ 0,35`);
      test((i.gap ?? 0) / B >= 0.5 * (1 - beff), `ζ = g/B = ${r3((i.gap ?? 0) / B)} ≥ 0,5·(1 − βeff) = ${r3(0.5 * (1 - beff))}`);
    }
  }
  return { failed, checked };
}

const betaEff = (i: HssTrussInput) => i.branches.reduce((s, b) => s + b.B! + b.H!, 0) / (4 * i.chord.B!);

/** The rows of the joint: its limits of applicability, then each limit state for each branch. */
export function hssTrussRows(i: HssTrussInput): CheckRow[] {
  const table = i.shape === 'round' ? 'K2.1A' : 'K2.2A';
  const lim = hssLimits(i);
  if (lim.failed.length) {
    return [{ ...base, clause: `Table ${table}`, title: 'Limits of applicability', titleKey: 'check.hss.limits', formula: 'joint within the limits of the table', inputs: [], ratio: null, status: 'unsupported', derivation: lim.failed.map((f) => `outside: ${f}`) }];
  }
  const rows: CheckRow[] = [{ ...base, clause: `Table ${table}`, title: 'Limits of applicability', titleKey: 'check.hss.limits', formula: 'joint within the limits of the table', inputs: [], ratio: null, status: 'ok', derivation: lim.checked }];
  return [...rows, ...(i.shape === 'round' ? roundRows(i) : rectRows(i))];
}

function roundRows(i: HssTrussInput): CheckRow[] {
  const c = i.chord, D = c.D!, t = c.t, Fy = c.Fy, gamma = D / (2 * t);
  const { U, tension } = chordUtilization(i);
  const Qf = tension ? 1 : 1 - 0.3 * U * (1 + U);
  const qfNote = `Qf = ${tension ? '1 (chord face in tension)' : `1 − 0,3·U·(1 + U) = ${r3(Qf)}`} (K2-6), U = ${r3(U)}`;
  const out: CheckRow[] = [];
  const name = (b: HssBranch, n: number) => (i.branches.length > 1 ? (b.P < 0 ? ', compression branch' : ', tension branch') : n > 0 ? ` ${n + 1}` : '');
  // Gapped K: one Pn·sinθ for both branches, from the compression branch (K2-4, K2-5).
  let kPnSin = 0;
  if (i.joint === 'K') {
    const comp = i.branches.find((b) => b.P < 0)!;
    const g = i.gap ?? 0;
    const Qg = gamma ** 0.2 * (1 + (0.024 * gamma ** 1.2) / (Math.exp((0.5 * g) / t - 1.33) + 1));
    kPnSin = Fy * t * t * (2.0 + (11.33 * comp.D!) / D) * Qg * Qf;
  }
  i.branches.forEach((b, n) => {
    const s = Math.sin(deg(b.theta)), beta = b.D! / D, P = Math.abs(b.P);
    let pnSin: number, clause: string, formula: string;
    if (i.joint === 'K') { pnSin = kPnSin; clause = 'K2.1 (K2-4)'; formula = 'Pn·sinθ = Fy·t²·(2,0 + 11,33·Db/D)·Qg·Qf'; }
    else if (i.joint === 'X') { pnSin = Fy * t * t * (5.7 / (1 - 0.81 * beta)) * Qf; clause = 'K2.1 (K2-2)'; formula = 'Pn·sinθ = Fy·t²·[5,7/(1 − 0,81·β)]·Qf'; }
    else { pnSin = Fy * t * t * (3.1 + 15.6 * beta * beta) * gamma ** 0.2 * Qf; clause = 'K2.1 (K2-1)'; formula = 'Pn·sinθ = Fy·t²·(3,1 + 15,6·β²)·γ^0,2·Qf'; }
    out.push(row('plastification', `Chord plastification${name(b, n)}`, clause, `${formula}; φ = 0,90`, P, (0.9 * pnSin) / s / 1000,
      [inp('β', beta), inp('γ', gamma), inp('Qf', Qf), inp('θ', b.theta, '°')], [qfNote]));
    if (b.D! < D - 2 * t) {
      const pn = (0.6 * Fy * t * Math.PI * b.D! * (1 + s)) / (2 * s * s);
      out.push(row('punching', `Punching shear${name(b, n)}`, 'K2.1 (K2-3)', 'Pn = 0,6·Fy·t·π·Db·(1 + sinθ)/(2·sin²θ); φ = 0,95', P, (0.95 * pn) / 1000, [inp('Db', b.D!, 'mm'), inp('t', t, 'mm')]));
    }
  });
  return out;
}

function rectRows(i: HssTrussInput): CheckRow[] {
  const c = i.chord, B = c.B!, H = c.H!, t = c.t, Fy = c.Fy, E = i.E ?? 200000, gamma = B / (2 * t);
  const { U, tension } = chordUtilization(i);
  const out: CheckRow[] = [];
  const name = (b: HssBranch) => (i.branches.length > 1 ? (b.P < 0 ? ', compression branch' : ', tension branch') : '');
  if (i.joint === 'K') {
    const beff = betaEff(i);
    const Qf = tension ? 1 : Math.min(1, 1.3 - (0.4 * U) / beff);
    const qfNote = `Qf = ${tension ? '1 (chord face in tension)' : `1,3 − 0,4·U/βeff = ${r3(Qf)} ≤ 1`}, U = ${r3(U)}`;
    const pnSin = Fy * t * t * 9.8 * beff * Math.sqrt(gamma) * Qf;
    for (const b of i.branches) {
      const s = Math.sin(deg(b.theta)), P = Math.abs(b.P), beta = b.B! / B, eta = b.H! / s / B, square = Math.abs(b.B! - b.H!) < 1e-9;
      out.push(row('plastification', `Chord wall plastification${name(b)}`, 'K2.2', 'Pn·sinθ = Fy·t²·9,8·βeff·γ^0,5·Qf; φ = 0,90', P, (0.9 * pnSin) / s / 1000,
        [inp('βeff', beff), inp('γ', gamma), inp('Qf', Qf)], [qfNote]));
      if (!square && b.B! < B - 2 * t) {
        const beop = Math.min((5 * beta) / gamma, beta);
        const pn = (0.6 * Fy * t * B * (2 * eta + beta + beop)) / s;
        out.push(row('punching', `Punching shear${name(b)}`, 'K2.2', 'Pn·sinθ = 0,6·Fy·t·B·(2η + β + βeop); φ = 0,95', P, (0.95 * pn) / 1000, [inp('η', eta), inp('βeop', beop)]));
      }
      if (!square && B / t < 15) {
        const beoi = Math.min((10 / (B / t)) * ((Fy * t) / (b.Fy * b.t)) * b.B!, b.B!);
        const pn = b.Fy * b.t * (2 * b.H! + b.B! + beoi - 4 * b.t);
        out.push(row('branchYield', `Branch yielding, uneven load${name(b)}`, 'K2.2', 'Pn = Fyb·tb·(2Hb + Bb + beoi − 4tb); φ = 0,95', P, (0.95 * pn) / 1000, [inp('beoi', beoi, 'mm')]));
      }
    }
    // Shear of the chord in the gap, chapter G (G5 with G2.1(b), kv = 5).
    const h = H - 3 * t, ht = h / t, kv = 5, l1 = 1.1 * Math.sqrt((kv * E) / Fy), l2 = 1.37 * Math.sqrt((kv * E) / Fy);
    const Cv = ht <= l1 ? 1 : ht <= l2 ? l1 / ht : (1.51 * kv * E) / (ht * ht * Fy);
    const vn = 0.6 * Fy * 2 * h * t * Cv;
    const v = Math.max(...i.branches.map((b) => Math.abs(b.P) * Math.sin(deg(b.theta))));
    out.push(row('gapShear', 'Chord shear in the gap', 'K2.2, G5', 'Vu = max(P·sinθ) ≤ φ·0,6·Fy·Aw·Cv, Aw = 2·(H − 3t)·t; φ = 0,90', v, (0.9 * vn) / 1000, [inp('Aw', 2 * h * t, 'mm²'), inp('Cv', Cv)]));
    return out;
  }
  const b = i.branches[0]!, s = Math.sin(deg(b.theta)), P = Math.abs(b.P), beta = b.B! / B, lb = b.H! / s, eta = lb / B;
  const Qf = tension ? 1 : Math.min(1, 1.3 - (0.4 * U) / beta);
  const qfNote = `Qf = ${tension ? '1 (chord face in tension)' : `1,3 − 0,4·U/β = ${r3(Qf)} ≤ 1`}, U = ${r3(U)}`;
  const full = beta >= 1 - 1e-9;
  if (beta <= 0.85) {
    const pnSin = Fy * t * t * ((2 * eta) / (1 - beta) + 4 / Math.sqrt(1 - beta)) * Qf;
    out.push(row('plastification', 'Chord wall plastification', 'K2.2', 'Pn·sinθ = Fy·t²·[2η/(1 − β) + 4/√(1 − β)]·Qf; φ = 1,00', P, pnSin / s / 1000, [inp('β', beta), inp('η', eta), inp('Qf', Qf)], [qfNote]));
  }
  if ((beta > 0.85 && beta <= 1 - 1 / gamma) || B / t < 10) {
    const beop = Math.min((5 * beta) / gamma, beta);
    const pn = (0.6 * Fy * t * B * (2 * eta + 2 * beop)) / s;
    out.push(row('punching', 'Punching shear', 'K2.2', 'Pn·sinθ = 0,6·Fy·t·B·(2η + 2βeop); φ = 0,95', P, (0.95 * pn) / 1000, [inp('η', eta), inp('βeop', beop)]));
  }
  if (full) {
    const kr = c.k ?? 1.5 * t;
    if (b.P >= 0) {
      const pn = (2 * Fy * t * (5 * kr + lb)) / s;
      out.push(row('sidewallYield', 'Chord sidewall local yielding', 'K2.2', 'Pn·sinθ = 2·Fy·t·(5k + N); φ = 1,00', P, pn / 1000, [inp('k', kr, 'mm'), inp('N', lb, 'mm')], c.k === undefined ? ['k = 1,5·t (corner radius not stated)'] : undefined));
    } else if (i.joint === 'X') {
      const pn = (((48 * t ** 3) / (H - 3 * t)) * Math.sqrt(E * Fy) * Qf) / s;
      out.push(row('sidewallCrippling', 'Chord sidewall local crippling', 'K2.2', 'Pn·sinθ = [48·t³/(H − 3t)]·√(E·Fy)·Qf; φ = 0,90', P, (0.9 * pn) / 1000, [inp('H', H, 'mm'), inp('Qf', Qf)], [qfNote]));
    } else {
      const pn = (1.6 * t * t * (1 + (3 * lb) / (H - 3 * t)) * Math.sqrt(E * Fy) * Qf) / s;
      out.push(row('sidewallCrippling', 'Chord sidewall local crippling', 'K2.2', 'Pn·sinθ = 1,6·t²·[1 + 3N/(H − 3t)]·√(E·Fy)·Qf; φ = 0,75', P, (0.75 * pn) / 1000, [inp('N', lb, 'mm'), inp('Qf', Qf)], [qfNote]));
    }
  }
  if (beta > 0.85) {
    const beoi = Math.min((10 / (B / t)) * ((Fy * t) / (b.Fy * b.t)) * b.B!, b.B!);
    const pn = b.Fy * b.t * (2 * b.H! + 2 * beoi - 4 * b.t);
    out.push(row('branchYield', 'Branch yielding, uneven load', 'K2.2', 'Pn = Fyb·tb·(2Hb + 2beoi − 4tb); φ = 0,95', P, (0.95 * pn) / 1000, [inp('beoi', beoi, 'mm')]));
  }
  if (beta > 0.85 && !full) out.push({ ...base, clause: 'K2.2', title: 'Chord sidewalls', titleKey: 'check.hss.sidewallRange', formula: 'sidewall limit states apply at β = 1', inputs: [inp('β', beta)], ratio: null, status: 'notVerified', derivation: ['0,85 < β < 1: chord plastification and the sidewall limit states are outside their β ranges; punching and the branch govern'] });
  return out;
}
