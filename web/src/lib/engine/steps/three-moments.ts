/**
 * The three-moment equation (Clapeyron) on a continuous beam, as an explained
 * step-by-step document: the support moments as unknowns, one compatibility
 * equation per support, the system solved, then the shared closing steps of
 * continuous-common.ts.
 */
import type { MethodContext } from './registry';
import type { Block, Cell, CompareRow, Step, StepDoc, Tex, Txt } from './doc';
import { tx } from './doc';
import { num, numText, par, term } from './format';
import type { SpanLoad } from './beam-line';
import type { Sketch } from './sketch';
import {
  EPS, kNm, kNm2, readBeam, spanSketch, beamSketch, integrate, reactionsStep, refEndMoment, reactionRows,
  diagramsStep, introBlocks, subtitle,
} from './continuous-common';
import type { Beam, Sup } from './continuous-common';

/** The support moments shown on the beam: the straight line each span's end moments define. */
function supportMomentSketch(b: Beam, ends: Array<{ Ma: number; Mb: number }>): Sketch {
  const s = beamSketch(b, { loads: false, dims: false });
  const members: Array<{ member: number; values: Array<[number, number]> }> = [];
  b.spans.forEach((sp, k) => {
    for (const o of b.bl.members) {
      if (!sp.members.includes(o.member.id)) continue;
      const t0 = (o.x0 - sp.x0) / sp.L, t1 = (o.x0 + o.member.L - sp.x0) / sp.L;
      const at = (t: number) => ends[k].Ma + (ends[k].Mb - ends[k].Ma) * t;
      members.push({ member: o.member.id, values: [[0, at(t0)], [1, at(t1)]] });
    }
  });
  s.diagram = { color: 'moment', marks: true, unit: 'kN·m', members };
  return s;
}


/** A span end's bending moment: an unknown plus a constant (a known moment when u is null). */
interface Aff { u: number | null; c: number }

interface AlphaTerm { label: Txt; aL: number; aR: number; formula: Tex; subst: Tex }

/**
 * EI times the end rotations of a simply supported span under its loads,
 * positive the way a downward load turns them (α_ij at the left end, α_ji at
 * the right). The classical cases by their table formula; anything else by
 * integrating the point-load solution over the load.
 */
function alphaTerms(L: number, loads: SpanLoad[], ij: string, ji: string): AlphaTerm[] {
  const A = (s: string) => `EI\\,\\alpha_{${s}}`;
  const out: AlphaTerm[] = [];
  // The point-load solution: a unit load at x turns the ends by these (times 1/EI).
  const kL = (x: number) => (x * (L - x) * (2 * L - x)) / (6 * L);
  const kR = (x: number) => (x * (L - x) * (L + x)) / (6 * L);
  for (const l of loads) {
    if (l.kind === 'dist') {
      const full = Math.abs(l.a) < 1e-9 && Math.abs(l.b - L) < 1e-9;
      const { wa, wb } = l;
      if (full && Math.abs(wa - wb) < 1e-9) {
        const v = (wa * L ** 3) / 24;
        out.push({
          label: tx('steps.fem.uniform', { w: num(wa) }), aL: v, aR: v,
          formula: `${A(ij)} = ${A(ji)} = \\frac{wL^3}{24}`,
          subst: `${A(ij)} = ${A(ji)} = \\frac{${par(wa)}(${num(L)})^3}{24}`,
        });
        continue;
      }
      if (full && (Math.abs(wa) < 1e-9 || Math.abs(wb) < 1e-9)) {
        const up = Math.abs(wa) < 1e-9; // zero at the left, peak at the right
        const w0 = up ? wb : wa;
        const [cl, cr] = up ? [7, 8] : [8, 7];
        out.push({
          label: tx(up ? 'steps.fem.triangularUp' : 'steps.fem.triangularDown', { w: num(w0) }),
          aL: (cl * w0 * L ** 3) / 360, aR: (cr * w0 * L ** 3) / 360,
          formula: `${A(ij)} = \\frac{${cl}\\,w_0L^3}{360}, \\qquad ${A(ji)} = \\frac{${cr}\\,w_0L^3}{360}`,
          subst: `${A(ij)} = \\frac{${cl}\\cdot ${par(w0)}(${num(L)})^3}{360}, \\qquad ${A(ji)} = \\frac{${cr}\\cdot ${par(w0)}(${num(L)})^3}{360}`,
        });
        continue;
      }
      if (full) {
        // A trapezoid: a uniform part and a triangle over it, each by its own formula.
        const lo = Math.abs(wa) <= Math.abs(wb) ? wa : wb;
        out.push(...alphaTerms(L, [{ kind: 'dist', a: 0, b: L, wa: lo, wb: lo }], ij, ji));
        out.push(...alphaTerms(L, [{ kind: 'dist', a: 0, b: L, wa: wa - lo, wb: wb - lo }], ij, ji));
        continue;
      }
      const w = (x: number) => wa + ((wb - wa) * (x - l.a)) / (l.b - l.a);
      const slope = (wb - wa) / (l.b - l.a);
      const xa = Math.abs(l.a) < 1e-9 ? 'x' : `(x ${term(-l.a)})`;
      const wx = Math.abs(slope) < 1e-9 ? par(wa) : `\\big(${num(wa)} ${term(slope)}\\,${xa}\\big)`;
      out.push({
        label: tx('steps.fem.partial', { wa: num(wa), wb: num(wb), a: num(l.a), b: num(l.b) }),
        aL: integrate(l.a, l.b, (x) => w(x) * kL(x)), aR: integrate(l.a, l.b, (x) => w(x) * kR(x)),
        formula: `${A(ij)} = \\int_a^b w(x)\\,\\frac{x\\,(L-x)(2L-x)}{6L}\\,dx, \\qquad ${A(ji)} = \\int_a^b w(x)\\,\\frac{x\\,(L-x)(L+x)}{6L}\\,dx`,
        subst: `${A(ij)} = \\int_{${num(l.a)}}^{${num(l.b)}} ${wx}\\,\\frac{x\\,(${num(L)}-x)(${num(2 * L)}-x)}{6(${num(L)})}\\,dx, \\qquad ${A(ji)} = \\int_{${num(l.a)}}^{${num(l.b)}} ${wx}\\,\\frac{x\\,(${num(L)}-x)(${num(L)}+x)}{6(${num(L)})}\\,dx`,
      });
      continue;
    }
    const a = l.a, bb = L - a;
    if (l.kind === 'point') {
      const P = l.P;
      out.push({
        label: tx('steps.fem.point', { P: num(P), a: num(a) }),
        aL: (P * a * bb * (L + bb)) / (6 * L), aR: (P * a * bb * (L + a)) / (6 * L),
        formula: `${A(ij)} = \\frac{P\\,a\\,b\\,(L+b)}{6L}, \\qquad ${A(ji)} = \\frac{P\\,a\\,b\\,(L+a)}{6L}`,
        subst: `${A(ij)} = \\frac{${par(P)}(${num(a)})(${num(bb)})(${num(L)}+${num(bb)})}{6(${num(L)})}, \\qquad ${A(ji)} = \\frac{${par(P)}(${num(a)})(${num(bb)})(${num(L)}+${num(a)})}{6(${num(L)})}`,
      });
    } else {
      const M0 = l.M;
      out.push({
        label: tx('steps.fem.couple', { M: num(M0), a: num(a) }),
        aL: (M0 * (L * L - 3 * bb * bb)) / (6 * L), aR: -(M0 * (L * L - 3 * a * a)) / (6 * L),
        formula: `${A(ij)} = \\frac{M_0\\,(L^2-3b^2)}{6L}, \\qquad ${A(ji)} = -\\frac{M_0\\,(L^2-3a^2)}{6L}`,
        subst: `${A(ij)} = \\frac{${par(M0)}\\big((${num(L)})^2-3(${num(bb)})^2\\big)}{6(${num(L)})}, \\qquad ${A(ji)} = -\\frac{${par(M0)}\\big((${num(L)})^2-3(${num(a)})^2\\big)}{6(${num(L)})}`,
      });
    }
  }
  return out;
}

/** Solve A·x = b by Gaussian elimination with partial pivoting (the systems here are small). */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

export function buildThreeMoments(ctx: MethodContext): StepDoc {
  const b = readBeam(ctx)!;
  const { spans, sups } = b;
  const EIc = spans[0].EIk;
  const Lr = spans.map((s) => (s.L * EIc) / s.EIk);
  const sameEI = spans.every((s) => Math.abs(s.EIk - EIc) <= 1e-9 * Math.abs(EIc));

  // Symbols: a support shows two moments (just left, just right) when they can differ.
  const hasL = (u: Sup) => u.left !== null || !!u.ohL;
  const hasR = (u: Sup) => u.right !== null || !!u.ohR;
  const two = (u: Sup) => hasL(u) && hasR(u) && (u.kind === 'fixed' || Math.abs(u.C) > EPS);
  const symL = (u: Sup) => (two(u) ? `M_{${u.name}}^{-}` : `M_{${u.name}}`);
  const symR = (u: Sup) => (two(u) ? `M_{${u.name}}^{+}` : `M_{${u.name}}`);

  // Unknowns and each span end's moment in terms of them.
  const unknowns: Array<{ sym: Tex; text: string }> = [];
  const newU = (sym: Tex) => { unknowns.push({ sym, text: sym.replace(/[{}\\]/g, '') }); return unknowns.length - 1; };
  const endL: Aff[] = [], endR: Aff[] = []; // endL[k]: left end of span k; endR[k]: right end
  const knownSteps: Block[] = [];
  for (const u of sups) {
    const blocks: Block[] = [];
    if (u.kind === 'fixed') {
      if (u.left !== null) endR[u.left] = { u: newU(symL(u)), c: 0 };
      if (u.right !== null) endL[u.right] = { u: newU(symR(u)), c: 0 };
      blocks.push({ kind: 'p', text: tx('steps.m.threeMoments.fixed', { n: u.name }) });
      if (u.ohL || u.ohR || Math.abs(u.C) > EPS) blocks.push({ kind: 'p', text: tx('steps.m.threeMoments.fixedTakes', { n: u.name }) });
    } else if (u.left !== null && u.right !== null) {
      const x = newU(symL(u));
      endR[u.left] = { u: x, c: 0 };
      endL[u.right] = { u: x, c: -u.C };
      if (Math.abs(u.C) > EPS) {
        blocks.push({ kind: 'p', text: tx('steps.m.threeMoments.couple', { n: u.name, C: numText(u.C) }) });
        blocks.push({ kind: 'eq', tex: `${symR(u)} = ${symL(u)} - C_{${u.name}} = ${symL(u)} ${term(-u.C)}` });
      }
    } else {
      // An end support: the moment on the span side is known.
      const leftEnd = u.left === null;
      const oh = leftEnd ? u.ohL : u.ohR;
      const outside = oh ? oh.M : 0;
      const Mspan = leftEnd ? outside - u.C : outside + u.C;
      if (leftEnd) endL[u.right!] = { u: null, c: Mspan }; else endR[u.left!] = { u: null, c: Mspan };
      if (oh) {
        const side = leftEnd ? '-' : '+';
        const s = two(u) ? `M_{${u.name}}^{${side}}` : `M_{${u.name}}`;
        const label = leftEnd ? `${oh.tip}–${u.name}` : `${u.name}–${oh.tip}`;
        blocks.push({ kind: 'p', text: tx('steps.m.threeMoments.overhang', { s: label, n: u.name }) });
        blocks.push({
          kind: 'calc', label: tx('steps.m.threeMoments.ohMoment', { n: u.name }),
          formula: leftEnd ? `${s} = -M_{q,${u.name}} = -\\Big(\\sum F_k\\,(x_{${u.name}} - x_k) + \\sum C_k\\Big)` : `${s} = M_{q,${u.name}} = \\sum F_k\\,(x_{${u.name}} - x_k) + \\sum C_k`,
          subst: leftEnd ? `${s} = -\\big(${oh.mqTex}\\big)` : `${s} = ${oh.mqTex}`,
          result: `\\boxed{${s} = ${num(oh.M)}\\ ${kNm}}`,
        });
      } else if (Math.abs(u.C) < EPS) {
        blocks.push({ kind: 'p', text: tx('steps.m.threeMoments.endZero', { n: u.name }) });
        blocks.push({ kind: 'eq', tex: `M_{${u.name}} = 0` });
      }
      if (Math.abs(u.C) > EPS) {
        blocks.push({ kind: 'p', text: tx('steps.m.threeMoments.coupleEnd', { n: u.name, C: numText(u.C) }) });
        const sSpan = leftEnd ? symR(u) : symL(u);
        const f = leftEnd
          ? (oh ? `${sSpan} = ${symL(u)} - C_{${u.name}}` : `${sSpan} = -C_{${u.name}}`)
          : (oh ? `${sSpan} = ${symR(u)} + C_{${u.name}}` : `${sSpan} = +C_{${u.name}}`);
        const sv = leftEnd ? (oh ? `${par(outside)} - ${par(u.C)}` : `-${par(u.C)}`) : (oh ? `${par(outside)} + ${par(u.C)}` : `+${par(u.C)}`);
        blocks.push({ kind: 'calc', label: tx('steps.m.threeMoments.coupleMoment', { n: u.name }), formula: f, subst: `${sSpan} = ${sv}`, result: `\\boxed{${sSpan} = ${num(Mspan)}\\ ${kNm}}` });
      }
    }
    if (blocks.length) knownSteps.push({ kind: 'sub', title: tx('steps.continuous.supportName', { n: u.name }), blocks });
  }

  // Load terms, span by span.
  const betaL: number[] = [], betaR: number[] = [];
  const loadBlocks: Block[] = [];
  spans.forEach((s, k) => {
    const terms = alphaTerms(s.L, s.loads, s.ij, s.ji);
    const aL = terms.reduce((a, t) => a + t.aL, 0), aR = terms.reduce((a, t) => a + t.aR, 0);
    betaL[k] = (aL * EIc) / s.EIk; betaR[k] = (aR * EIc) / s.EIk;
    const sub: Block[] = [{ kind: 'fig', sketch: spanSketch(b, s, { supports: 'simple' }), caption: tx('steps.continuous.spanLoadsCaption', { s: s.label }) }];
    if (terms.length === 0) sub.push({ kind: 'p', text: tx('steps.m.threeMoments.noLoads') });
    const many = terms.length > 1;
    terms.forEach((t, n) => {
      const sup = many ? `^{(${n + 1})}` : '';
      const calc: Block = { kind: 'calc', label: tx('steps.m.threeMoments.alpha'), formula: t.formula, subst: t.subst, result: `\\boxed{EI\\,\\alpha_{${s.ij}}${sup} = ${num(t.aL)}\\ ${kNm2}}, \\qquad \\boxed{EI\\,\\alpha_{${s.ji}}${sup} = ${num(t.aR)}\\ ${kNm2}}` };
      if (many) sub.push({ kind: 'sub', title: tx('steps.fem.action', { n: n + 1 }), blocks: [{ kind: 'p', text: t.label }, calc] });
      else sub.push({ kind: 'p', text: t.label }, calc);
    });
    if (many) {
      sub.push({ kind: 'eq', tex: `EI\\,\\alpha_{${s.ij}} = ${terms.map((t) => par(t.aL)).join(' + ')} = ${num(aL)}, \\qquad EI\\,\\alpha_{${s.ji}} = ${terms.map((t) => par(t.aR)).join(' + ')} = ${num(aR)}\\ ${kNm2}`, note: tx('steps.fem.superpose') });
    }
    if (Math.abs(s.EIk - EIc) > 1e-9 * Math.abs(EIc)) {
      sub.push({
        kind: 'calc', label: tx('steps.m.threeMoments.scaled'),
        formula: `EI_c\\,\\alpha = \\frac{EI_c}{EI_{${s.ij}}}\\;EI\\,\\alpha`,
        subst: `EI_c\\,\\alpha_{${s.ij}} = \\frac{${num(EIc)}}{${num(s.EIk)}}(${num(aL)}), \\qquad EI_c\\,\\alpha_{${s.ji}} = \\frac{${num(EIc)}}{${num(s.EIk)}}(${num(aR)})`,
        result: `\\boxed{EI_c\\,\\alpha_{${s.ij}} = ${num(betaL[k])}\\ ${kNm2}}, \\qquad \\boxed{EI_c\\,\\alpha_{${s.ji}} = ${num(betaR[k])}\\ ${kNm2}}`,
      });
    }
    loadBlocks.push({ kind: 'sub', title: tx('steps.continuous.spanName', { s: s.label }), blocks: sub });
  });

  // One equation per unknown.
  const nU = unknowns.length;
  const A: number[][] = [], rhs: number[] = [], rowNames: string[] = [];
  const eqBlocks: Block[] = [];
  const affTex = (m: Aff): Tex => {
    if (m.u === null) return par(m.c);
    const s = unknowns[m.u].sym;
    return Math.abs(m.c) < EPS ? s : `(${s} ${term(m.c)})`;
  };
  const collect = (terms: Array<[Aff, number]>, r0: number): { row: number[]; r: number; tex: Tex } => {
    const row = new Array<number>(nU).fill(0);
    let r = r0;
    for (const [m, c] of terms) { if (m.u !== null) row[m.u] += c; r -= c * m.c; }
    let tex = '';
    row.forEach((c, i) => {
      if (Math.abs(c) < EPS) return;
      tex += tex ? ` ${term(c)}\\,${unknowns[i].sym}` : `${num(c)}\\,${unknowns[i].sym}`;
    });
    return { row, r, tex: tex || '0' };
  };
  for (const u of sups) {
    const blocks: Block[] = [];
    const push = (label: Txt, formula: Tex, subst: Tex, terms: Array<[Aff, number]>, r0: number) => {
      const c = collect(terms, r0);
      A.push(c.row); rhs.push(c.r); rowNames.push(u.name);
      blocks.push({ kind: 'calc', label, formula, subst, result: `\\boxed{${c.tex} = ${num(c.r)}}` });
    };
    if (u.kind === 'fixed') {
      if (u.left !== null) {
        const k = u.left, s = spans[k];
        const ma = sups[k], lf = Lr[k];
        push(tx('steps.m.threeMoments.fixedEq', { n: u.name }),
          `${symR(ma)}\\,L'_{${s.ij}} + 2\\,${symL(u)}\\,L'_{${s.ij}} = -6\\,EI_c\\,\\alpha_{${s.ji}}`,
          `${affTex(endL[k])}(${num(lf)}) + 2\\,${affTex(endR[k])}(${num(lf)}) = -6\\,(${num(betaR[k])})`,
          [[endL[k], lf], [endR[k], 2 * lf]], -6 * betaR[k]);
      }
      if (u.right !== null) {
        const k = u.right, s = spans[k];
        const mb = sups[k + 1], lf = Lr[k];
        push(tx('steps.m.threeMoments.fixedEq', { n: u.name }),
          `2\\,${symR(u)}\\,L'_{${s.ij}} + ${symL(mb)}\\,L'_{${s.ij}} = -6\\,EI_c\\,\\alpha_{${s.ij}}`,
          `2\\,${affTex(endL[k])}(${num(lf)}) + ${affTex(endR[k])}(${num(lf)}) = -6\\,(${num(betaL[k])})`,
          [[endL[k], 2 * lf], [endR[k], lf]], -6 * betaL[k]);
      }
    } else if (u.left !== null && u.right !== null) {
      const kl = u.left, kr = u.right, sl = spans[kl], sr = spans[kr];
      const w = sups[kl], y = sups[kr + 1];
      const f = two(u)
        ? `${symR(w)}\\,L'_{${sl.ij}} + 2\\,${symL(u)}\\,L'_{${sl.ij}} + 2\\,${symR(u)}\\,L'_{${sr.ij}} + ${symL(y)}\\,L'_{${sr.ij}} = -6\\,EI_c\\,\\big(\\alpha_{${sl.ji}} + \\alpha_{${sr.ij}}\\big)`
        : `${symR(w)}\\,L'_{${sl.ij}} + 2\\,${symL(u)}\\,\\big(L'_{${sl.ij}} + L'_{${sr.ij}}\\big) + ${symL(y)}\\,L'_{${sr.ij}} = -6\\,EI_c\\,\\big(\\alpha_{${sl.ji}} + \\alpha_{${sr.ij}}\\big)`;
      const sv = two(u)
        ? `${affTex(endL[kl])}(${num(Lr[kl])}) + 2\\,${affTex(endR[kl])}(${num(Lr[kl])}) + 2\\,${affTex(endL[kr])}(${num(Lr[kr])}) + ${affTex(endR[kr])}(${num(Lr[kr])}) = -6\\big(${par(betaR[kl])} + ${par(betaL[kr])}\\big)`
        : `${affTex(endL[kl])}(${num(Lr[kl])}) + 2\\,${affTex(endR[kl])}(${num(Lr[kl])} + ${num(Lr[kr])}) + ${affTex(endR[kr])}(${num(Lr[kr])}) = -6\\big(${par(betaR[kl])} + ${par(betaL[kr])}\\big)`;
      push(tx('steps.m.threeMoments.continuity', { n: u.name }), f, sv,
        [[endL[kl], Lr[kl]], [endR[kl], 2 * Lr[kl]], [endL[kr], 2 * Lr[kr]], [endR[kr], Lr[kr]]], -6 * (betaR[kl] + betaL[kr]));
    }
    if (blocks.length) eqBlocks.push({ kind: 'sub', title: tx('steps.continuous.supportName', { n: u.name }), blocks });
  }

  const x = nU ? solveLinear(A, rhs) : [];
  const val = (m: Aff) => (m.u === null ? m.c : x[m.u] + m.c);
  const Ma = spans.map((_, k) => val(endL[k])), Mb = spans.map((_, k) => val(endR[k]));
  let resid = 0;
  A.forEach((row, i) => { resid = Math.max(resid, Math.abs(row.reduce((a, c, j) => a + c * x[j], 0) - rhs[i])); });
  const rscale = Math.max(1, ...rhs.map(Math.abs));

  // The support moments on both sides.
  const Mleft = (u: Sup) => (u.left !== null ? Mb[u.left] : u.ohL ? u.ohL.M : null);
  const Mright = (u: Sup) => (u.right !== null ? Ma[u.right] : u.ohR ? u.ohR.M : null);

  const steps: Step[] = [];
  // 1. Spans and the comparison stiffness.
  {
    const blocks: Block[] = [
      { kind: 'table', head: [tx('steps.common.span'), { tex: 'L\\ [\\mathrm{m}]' }, { tex: `EI\\ [${kNm2}]` }, { tex: "L'\\ [\\mathrm{m}]" }], rows: spans.map((s, k) => [s.label, { tex: num(s.L) }, { tex: num(s.EIk) }, { tex: num(Lr[k]) }]), caption: tx('steps.m.threeMoments.spansCaption') },
      { kind: 'p', text: tx('steps.m.threeMoments.reducedWhy'), detail: true },
      { kind: 'eq', tex: `EI_c = EI_{${spans[0].ij}} = ${num(EIc)}\\ ${kNm2}`, note: tx('steps.m.threeMoments.eiRef') },
    ];
    if (sameEI) blocks.push({ kind: 'note', tone: 'ok', text: tx('steps.m.threeMoments.sameEI') });
    else {
      spans.forEach((s, k) => {
        if (Math.abs(s.EIk - EIc) <= 1e-9 * Math.abs(EIc)) return;
        blocks.push({ kind: 'calc', label: tx('steps.m.threeMoments.reduced', { s: s.label }), formula: `L'_{${s.ij}} = L_{${s.ij}}\\,\\frac{EI_c}{EI_{${s.ij}}}`, subst: `L'_{${s.ij}} = ${num(s.L)}\\,\\frac{${num(EIc)}}{${num(s.EIk)}}`, result: `\\boxed{L'_{${s.ij}} = ${num(Lr[k])}\\ \\mathrm{m}}` });
      });
    }
    steps.push({ title: tx('steps.m.threeMoments.s.spans'), blocks });
  }
  // 2. Known moments and unknowns.
  steps.push({
    title: tx('steps.m.threeMoments.s.known'),
    blocks: [
      { kind: 'p', text: tx('steps.m.threeMoments.knownWhy'), detail: true },
      ...knownSteps,
      { kind: 'eq', tex: unknowns.map((u) => u.sym).join(',\\quad '), note: tx('steps.m.threeMoments.unknowns', { n: nU }) },
    ],
  });
  // 3. Load terms.
  steps.push({
    title: tx('steps.m.threeMoments.s.load'),
    blocks: [
      { kind: 'p', text: tx('steps.m.threeMoments.loadP') },
      { kind: 'p', text: tx('steps.m.threeMoments.loadWhy'), detail: true },
      ...loadBlocks,
      { kind: 'table', head: [tx('steps.common.span'), tx('steps.m.threeMoments.colLeft'), tx('steps.m.threeMoments.colRight')], rows: spans.map((s, k) => [s.label, { tex: `EI_c\\,\\alpha_{${s.ij}} = ${num(betaL[k])}` }, { tex: `EI_c\\,\\alpha_{${s.ji}} = ${num(betaR[k])}` }]), caption: tx('steps.m.threeMoments.loadTable') },
    ],
  });
  // 4. The equations.
  steps.push({
    title: tx('steps.m.threeMoments.s.equations'),
    blocks: [
      { kind: 'eq', tex: `M_{i-1}\\,L'_{i} + 2\\,M_i\\,\\big(L'_{i} + L'_{i+1}\\big) + M_{i+1}\\,L'_{i+1} = -6\\,EI_c\\,\\big(\\alpha_{i,i-1} + \\alpha_{i,i+1}\\big)`, note: tx('steps.m.threeMoments.general') },
      { kind: 'p', text: tx('steps.m.threeMoments.eqWhy'), detail: true },
      ...(sups.some((u) => u.kind === 'fixed') ? [{ kind: 'p', text: tx('steps.m.threeMoments.fictitious'), detail: true } as Block] : []),
      ...eqBlocks,
    ],
  });
  // 5. The system and its solution.
  steps.push({
    title: tx('steps.m.threeMoments.s.system'),
    blocks: [
      { kind: 'p', text: tx('steps.m.threeMoments.systemP') },
      { kind: 'matrix', name: '\\mathbf{A}', rows: A, rowLabels: rowNames, colLabels: unknowns.map((u) => u.text), caption: tx('steps.m.threeMoments.matrixCaption') },
      { kind: 'matrix', name: '\\mathbf{b}', rows: rhs.map((v) => [v]), rowLabels: rowNames, caption: tx('steps.m.threeMoments.rhsCaption') },
      {
        kind: 'calc', label: tx('steps.m.threeMoments.solve'), formula: '\\mathbf{A}\\,\\mathbf{M} = \\mathbf{b}',
        result: unknowns.map((u, i) => `\\boxed{${u.sym} = ${num(x[i])}\\ ${kNm}}`).join(', \\quad '),
        check: `\\max_i \\big|(\\mathbf{A}\\,\\mathbf{M} - \\mathbf{b})_i\\big| = ${resid <= 1e-9 * rscale ? '0' : num(resid)}\\ \\checkmark`,
      },
    ],
  });
  // 6. Support moments.
  {
    const cell = (v: number | null): Cell => (v === null ? '—' : { tex: num(v) });
    steps.push({
      title: tx('steps.m.threeMoments.s.moments'),
      blocks: [
        { kind: 'table', head: [tx('steps.common.support'), { tex: `M^{-}\\ [${kNm}]` }, { tex: `M^{+}\\ [${kNm}]` }], rows: sups.map((u) => [u.name, cell(Mleft(u)), cell(Mright(u))]), caption: tx('steps.m.threeMoments.momentsCaption') },
        { kind: 'fig', sketch: supportMomentSketch(b, spans.map((_, k) => ({ Ma: Ma[k], Mb: Mb[k] }))), caption: tx('steps.m.threeMoments.momentsFig') },
        { kind: 'p', text: tx('steps.m.threeMoments.momentsWhy'), detail: true },
      ],
    });
  }
  // 7. Reactions.
  const ends = spans.map((_, k) => ({ Mij: -Ma[k], Mji: Mb[k] }));
  const { step: rStep, sol } = reactionsStep(b, ends, spans.map((_, k) => ({ Ma: Ma[k], Mb: Mb[k], sa: symR(sups[k]), sb: symL(sups[k + 1]) })));
  steps.push(rStep);
  // 8. Against the matrix solve.
  if (ctx.ref) {
    const ref = ctx.ref;
    const rows: CompareRow[] = [];
    spans.forEach((s, k) => {
      // Sagging moment at a span end from the counter-clockwise end moment: minus at the left, plus at the right.
      rows.push({ label: symR(sups[k]), method: Ma[k], matrix: -refEndMoment(b, ref, s, 'L'), unit: 'kN·m' });
      if (k === spans.length - 1 || two(sups[k + 1])) rows.push({ label: symL(sups[k + 1]), method: Mb[k], matrix: refEndMoment(b, ref, s, 'R'), unit: 'kN·m' });
    });
    rows.push(...reactionRows(b, ref, sol));
    steps.push({ title: tx('steps.common.compare'), blocks: [{ kind: 'compare', rows, caption: tx('steps.m.threeMoments.compareCaption') }, { kind: 'p', text: tx('steps.common.compareNote') }] });
  }
  // 9. Diagrams.
  steps.push(diagramsStep(b, sol.pieces));

  return {
    method: 'threeMoments', title: tx('steps.m.threeMoments.title'), subtitle: subtitle(b),
    intro: introBlocks(b, tx('steps.m.threeMoments.intro'), tx('steps.m.threeMoments.introWhy')),
    steps,
  };
}
