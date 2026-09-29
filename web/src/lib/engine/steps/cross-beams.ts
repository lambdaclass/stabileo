/**
 * Moment distribution (Hardy Cross) on a continuous beam, as an explained
 * step-by-step document: stiffnesses, distribution factors, fixed-end
 * moments, the simple ends released once, the simultaneous and joint-by-joint
 * tables, then the shared closing steps of continuous-common.ts.
 */
import type { MethodContext } from './registry';
import type { Block, Cell, CompareRow, Step, StepDoc, Txt } from './doc';
import { tx } from './doc';
import { num, par } from './format';
import type { PMember, PMemberLoad } from './plane-model';
import { fixedEnd, fixedEndBlocks } from './fem';
import type { FixedEnd } from './fem';
import {
  EPS, kNm, kNm2, readBeam, spanSketch, reactionsStep, refEndMoment, reactionRows, diagramsStep, introBlocks, subtitle,
} from './continuous-common';

/** Stop once a cycle's largest correction is below this fraction of the largest starting moment. */
const CROSS_TOL = 1e-9;
const CROSS_MAX_CYCLES = 60;
/** Cycles written out in the simultaneous table; the rest are added up in one row. */
const CROSS_SHOWN = 8;

type JointKind = 'fixed' | 'simple' | 'free';

export function buildCross(ctx: MethodContext): StepDoc {
  const b = readBeam(ctx)!;
  const { spans, sups } = b;
  const nE = spans.length * 2;
  // End e: 2k is span k's left end, 2k + 1 its right end.
  const jointOf = (e: number) => (e % 2 === 0 ? e / 2 : (e - 1) / 2 + 1);
  const far = (e: number) => (e % 2 === 0 ? e + 1 : e - 1);
  const endSym = (e: number) => { const s = spans[Math.floor(e / 2)]; return e % 2 === 0 ? s.ij : s.ji; };
  const jkind: JointKind[] = sups.map((u) => (u.kind === 'fixed' ? 'fixed' : u.left === null || u.right === null ? 'simple' : 'free'));
  const endsAt = (i: number) => { const r: number[] = []; if (sups[i].left !== null) r.push(2 * sups[i].left! + 1); if (sups[i].right !== null) r.push(2 * sups[i].right!); return r; };

  // What the spans must balance at each joint: its couple, less the overhang's end moment.
  const Cstar = sups.map((u) => u.C - (u.ohL?.Mhat ?? 0) - (u.ohR?.Mhat ?? 0));

  // Stiffness: 3EI/L towards a simple end, 4EI/L otherwise.
  const kSpan = spans.map((s, k) => {
    const simpleAt = jkind[k] === 'simple' ? 'L' : jkind[k + 1] === 'simple' ? 'R' : null;
    const c = simpleAt ? 3 : 4;
    return { c, simpleAt, value: (c * s.EIk) / s.L };
  });
  const DF = new Array<number>(nE).fill(0);
  for (let i = 0; i < sups.length; i++) {
    const es = endsAt(i);
    if (jkind[i] === 'simple') es.forEach((e) => { DF[e] = 1; });
    if (jkind[i] !== 'free') continue;
    const tot = es.reduce((a, e) => a + kSpan[Math.floor(e / 2)].value, 0);
    es.forEach((e) => { DF[e] = kSpan[Math.floor(e / 2)].value / tot; });
  }

  // Fixed-end moments of every span, as a member drawn left to right.
  const fes: FixedEnd[] = spans.map((s, k) => {
    const m: PMember = { id: -(k + 1), i: s.left, j: s.right, name: s.label, L: s.L, c: 1, s: 0, E: s.E, A: 0, I: s.I, EI: s.EIk, EA: 0, truss: false, hingeI: false, hingeJ: false };
    const loads = s.loads.map((l): PMemberLoad =>
      l.kind === 'dist' ? { kind: 'dist', member: m.id, a: l.a, b: l.b, qa: -l.wa, qb: -l.wb }
        : l.kind === 'point' ? { kind: 'point', member: m.id, a: l.a, p: -l.P, px: 0, m: 0 }
          : { kind: 'point', member: m.id, a: l.a, p: 0, px: 0, m: l.M });
    return fixedEnd(m, loads, { i: s.li, j: s.lj });
  });
  const FEM = new Array<number>(nE).fill(0);
  fes.forEach((fe, k) => { FEM[2 * k] = fe.Mi; FEM[2 * k + 1] = fe.Mj; });

  // Release the simple ends once: each takes the moment it must end with, and half the change crosses the span.
  const FEMs = [...FEM];
  const releases: Array<{ joint: number; e: number; f: number; rel: number; co: number }> = [];
  for (let i = 0; i < sups.length; i++) {
    if (jkind[i] !== 'simple') continue;
    const e = endsAt(i)[0], f = far(e);
    const rel = Cstar[i] - FEM[e];
    releases.push({ joint: i, e, f, rel, co: rel / 2 });
    FEMs[e] = Cstar[i];
    FEMs[f] += rel / 2;
  }

  // Simultaneous distribution: every free joint balanced at once, then the carry-overs.
  const free = sups.map((_, i) => i).filter((i) => jkind[i] === 'free');
  const scale = Math.max(...FEMs.map(Math.abs), ...free.map((i) => Math.abs(Cstar[i])), 0);
  const cur = [...FEMs];
  const cycles: Array<{ D: number[]; CO: number[] }> = [];
  const distTot = new Map<number, number[]>(), coTot = new Map<number, number[]>();
  for (const i of free) { distTot.set(i, new Array<number>(nE).fill(0)); coTot.set(i, new Array<number>(nE).fill(0)); }
  if (free.length && scale > 0) {
    for (let n = 0; n < CROSS_MAX_CYCLES; n++) {
      const D = new Array<number>(nE).fill(0), CO = new Array<number>(nE).fill(0);
      let maxD = 0;
      for (const i of free) {
        const es = endsAt(i);
        const U = es.reduce((a, e) => a + cur[e], 0) - Cstar[i];
        for (const e of es) { D[e] = -DF[e] * U; maxD = Math.max(maxD, Math.abs(D[e])); }
      }
      // What is left to distribute is negligible: the previous cycle was the last one.
      if (maxD < CROSS_TOL * scale) break;
      for (const i of free) {
        for (const e of endsAt(i)) {
          distTot.get(i)![e] += D[e];
          // Nothing crosses to a released simple end: it stays at the moment it was released to.
          const f = far(e);
          if (jkind[jointOf(f)] !== 'simple') { CO[f] += D[e] / 2; coTot.get(i)![f] += D[e] / 2; }
        }
      }
      for (let e = 0; e < nE; e++) cur[e] += D[e] + CO[e];
      cycles.push({ D, CO });
    }
  }
  const final = cur;

  const steps: Step[] = [];
  const colHead: Cell[] = [''];
  for (let e = 0; e < nE; e++) colHead.push({ tex: `\\hat M_{${endSym(e)}}` });
  const numRow = (label: Txt, v: number[], blankZero = true): Cell[] => [label, ...v.map((x): Cell => (blankZero && Math.abs(x) < EPS ? '' : { tex: num(x) }))];

  // 1. Stiffness.
  {
    const blocks: Block[] = [
      { kind: 'p', text: tx('steps.m.crossBeams.stiffnessWhy'), detail: true },
      {
        kind: 'table',
        head: [tx('steps.common.span'), { tex: 'L\\ [\\mathrm{m}]' }, { tex: `EI\\ [${kNm2}]` }, tx('steps.m.crossBeams.colEnds'), { tex: `k\\ [${kNm}]` }],
        rows: spans.map((s, k) => [s.label, { tex: num(s.L) }, { tex: num(s.EIk) }, kSpan[k].simpleAt ? tx('steps.m.crossBeams.oneSimple', { n: kSpan[k].simpleAt === 'L' ? s.li : s.lj }) : tx('steps.m.crossBeams.bothHeld'), { tex: num(kSpan[k].value) }]),
        caption: tx('steps.m.crossBeams.stiffnessCaption'),
      },
    ];
    spans.forEach((s, k) => {
      const { c, simpleAt, value } = kSpan[k];
      const sym = simpleAt === 'L' ? `k_{${s.ji}}` : simpleAt === 'R' ? `k_{${s.ij}}` : `k_{${s.ij}} = k_{${s.ji}}`;
      blocks.push({ kind: 'calc', label: tx('steps.m.crossBeams.k', { s: s.label }), formula: `${sym} = \\frac{${c}\\,EI}{L}`, subst: `${sym} = \\frac{${c}(${num(s.EIk)})}{${num(s.L)}}`, result: `\\boxed{${sym} = ${num(value)}\\ ${kNm}}` });
    });
    steps.push({ title: tx('steps.m.crossBeams.s.stiffness'), blocks });
  }
  // 2. Distribution factors.
  {
    const blocks: Block[] = [{ kind: 'p', text: tx('steps.m.crossBeams.dfWhy'), detail: true }];
    sups.forEach((u, i) => {
      const es = endsAt(i);
      const sub: Block[] = [];
      if (jkind[i] === 'fixed') sub.push({ kind: 'p', text: tx('steps.m.crossBeams.dfFixed', { n: u.name }) }, { kind: 'eq', tex: es.map((e) => `\\mathrm{DF}_{${endSym(e)}} = 0`).join(', \\qquad ') });
      else if (jkind[i] === 'simple') sub.push({ kind: 'p', text: tx('steps.m.crossBeams.dfSimple', { n: u.name }) }, { kind: 'eq', tex: `\\mathrm{DF}_{${endSym(es[0])}} = 1` });
      else {
        const ks = es.map((e) => `k_{${endSym(e)}}`);
        const kv = es.map((e) => num(kSpan[Math.floor(e / 2)].value));
        sub.push({
          kind: 'calc', label: tx('steps.m.crossBeams.df', { n: u.name }),
          formula: es.map((e) => `\\mathrm{DF}_{${endSym(e)}} = \\frac{k_{${endSym(e)}}}{${ks.join(' + ')}}`).join(', \\qquad '),
          subst: es.map((e, n) => `\\mathrm{DF}_{${endSym(e)}} = \\frac{${kv[n]}}{${kv.join(' + ')}}`).join(', \\qquad '),
          result: es.map((e) => `\\boxed{\\mathrm{DF}_{${endSym(e)}} = ${num(DF[e])}}`).join(', \\qquad '),
          check: `${es.map((e) => `\\mathrm{DF}_{${endSym(e)}}`).join(' + ')} = ${es.map((e) => num(DF[e])).join(' + ')} = 1\\ \\checkmark`,
        });
      }
      blocks.push({ kind: 'sub', title: tx('steps.continuous.supportName', { n: u.name }), blocks: sub });
    });
    steps.push({ title: tx('steps.m.crossBeams.s.df'), blocks });
  }
  // 3. Fixed-end moments.
  steps.push({
    title: tx('steps.m.crossBeams.s.fem'),
    blocks: [
      { kind: 'p', text: tx('steps.m.crossBeams.femWhy'), detail: true },
      ...spans.map((s, k): Block => ({
        kind: 'sub', title: tx('steps.continuous.spanName', { s: s.label }),
        blocks: [{ kind: 'fig', sketch: spanSketch(b, s, { supports: 'fixed' }), caption: tx('steps.continuous.spanLoadsCaption', { s: s.label }) }, ...fixedEndBlocks(fes[k], { i: s.li, j: s.lj }, { shears: false })],
      })),
    ],
  });
  // 4. Overhangs and joint couples.
  {
    const blocks: Block[] = [];
    sups.forEach((u, i) => {
      if (!u.ohL && !u.ohR && Math.abs(u.C) < EPS) return;
      const sub: Block[] = [];
      for (const oh of [u.ohL, u.ohR]) {
        if (!oh) continue;
        const left = oh === u.ohL;
        const label = left ? `${oh.tip}–${u.name}` : `${u.name}–${oh.tip}`;
        const s = `\\hat M_{${u.name}${oh.tip}}`;
        sub.push({ kind: 'p', text: tx('steps.m.crossBeams.ohP', { s: label, n: u.name }) });
        sub.push({ kind: 'calc', label: tx('steps.m.crossBeams.ohMoment', { n: u.name }), formula: `\\sum M_{${u.name}} = 0:\\quad ${s} + M_{q,${u.name}} = 0 \\;\\Rightarrow\\; ${s} = -\\Big(\\sum F_k\\,(x_{${u.name}} - x_k) + \\sum C_k\\Big)`, subst: `${s} = -\\big(${oh.mqTex}\\big)`, result: `\\boxed{${s} = ${num(oh.Mhat)}\\ ${kNm}}` });
      }
      if (jkind[i] === 'fixed') sub.push({ kind: 'p', text: tx('steps.m.crossBeams.fixedTakes', { n: u.name }) });
      else {
        const parts = [`C_{${u.name}}`], vals = [par(u.C)];
        for (const oh of [u.ohL, u.ohR]) if (oh) { parts.push(`\\hat M_{${u.name}${oh.tip}}`); vals.push(par(oh.Mhat)); }
        sub.push({ kind: 'calc', label: tx('steps.m.crossBeams.ceff', { n: u.name }), formula: `C^{*}_{${u.name}} = ${parts.join(' - ')}`, subst: `C^{*}_{${u.name}} = ${vals.join(' - ')}`, result: `\\boxed{C^{*}_{${u.name}} = ${num(Cstar[i])}\\ ${kNm}}` });
      }
      blocks.push({ kind: 'sub', title: tx('steps.continuous.supportName', { n: u.name }), blocks: sub });
    });
    if (blocks.length) steps.push({ title: tx('steps.m.crossBeams.s.external'), blocks: [{ kind: 'p', text: tx('steps.m.crossBeams.externalWhy'), detail: true }, ...blocks] });
  }
  // 5. Releasing the simple ends.
  if (releases.length) {
    const blocks: Block[] = [{ kind: 'p', text: tx('steps.m.crossBeams.releaseWhy'), detail: true }];
    for (const r of releases) {
      const u = sups[r.joint], s = spans[Math.floor(r.e / 2)];
      const es = endSym(r.e), fs = endSym(r.f);
      const zero = Math.abs(Cstar[r.joint]) < EPS;
      const cs = zero ? '0' : `C^{*}_{${u.name}}`;
      blocks.push({
        kind: 'calc', label: tx('steps.m.crossBeams.release', { n: u.name, s: s.label }),
        formula: zero
          ? `\\mathrm{FEM}^{*}_{${es}} = 0, \\qquad \\mathrm{FEM}^{*}_{${fs}} = \\mathrm{FEM}_{${fs}} - \\tfrac12\\,\\mathrm{FEM}_{${es}}`
          : `\\mathrm{FEM}^{*}_{${es}} = ${cs}, \\qquad \\mathrm{FEM}^{*}_{${fs}} = \\mathrm{FEM}_{${fs}} + \\tfrac12\\big(${cs} - \\mathrm{FEM}_{${es}}\\big)`,
        subst: zero
          ? `\\mathrm{FEM}^{*}_{${fs}} = ${par(FEM[r.f])} - \\tfrac12\\,(${num(FEM[r.e])})`
          : `\\mathrm{FEM}^{*}_{${es}} = ${num(Cstar[r.joint])}, \\qquad \\mathrm{FEM}^{*}_{${fs}} = ${par(FEM[r.f])} + \\tfrac12\\big(${par(Cstar[r.joint])} - ${par(FEM[r.e])}\\big)`,
        result: `\\boxed{\\mathrm{FEM}^{*}_{${es}} = ${num(FEMs[r.e])}\\ ${kNm}}, \\qquad \\boxed{\\mathrm{FEM}^{*}_{${fs}} = ${num(FEMs[r.f])}\\ ${kNm}}`,
      });
    }
    blocks.push({ kind: 'table', head: colHead, rows: [numRow(tx('steps.m.crossBeams.rowFEM'), FEM, false), numRow(tx('steps.m.crossBeams.rowFEMs'), FEMs, false)], caption: tx('steps.m.crossBeams.femsCaption') });
    steps.push({ title: tx('steps.m.crossBeams.s.release'), blocks });
  }
  // 6. The simultaneous distribution.
  {
    const rows: Cell[][] = [numRow(tx('steps.m.crossBeams.rowDF'), DF, false), numRow(tx('steps.m.crossBeams.rowFEMs'), FEMs, false)];
    const nC = cycles.length;
    const shown = nC > CROSS_SHOWN ? CROSS_SHOWN - 1 : nC;
    for (let n = 0; n < shown; n++) {
      rows.push(numRow(tx('steps.m.crossBeams.rowDist', { n: n + 1 }), cycles[n].D));
      // A cycle whose shares all went to released simple ends carries nothing over.
      if (cycles[n].CO.some((v) => Math.abs(v) > EPS)) rows.push(numRow(tx('steps.m.crossBeams.rowCO', { n: n + 1 }), cycles[n].CO));
    }
    if (nC > shown) {
      const rest = new Array<number>(nE).fill(0);
      for (let n = shown; n < nC; n++) for (let e = 0; e < nE; e++) rest[e] += cycles[n].D[e] + cycles[n].CO[e];
      rows.push(numRow(tx('steps.m.crossBeams.rowRest', { a: shown + 1, b: nC }), rest));
    }
    rows.push(numRow(tx('steps.m.crossBeams.rowSum'), final, false));
    const blocks: Block[] = [{ kind: 'p', text: tx('steps.m.crossBeams.simWhy'), detail: true }];
    if (!releases.length) blocks.push({ kind: 'p', text: tx('steps.m.crossBeams.noRelease') });
    if (free.some((i) => Math.abs(Cstar[i]) > EPS)) blocks.push({ kind: 'p', text: tx('steps.m.crossBeams.coupleInUnbalance') });
    blocks.push({ kind: 'table', head: colHead, rows, caption: tx('steps.m.crossBeams.simCaption') });
    if (!free.length) blocks.push({ kind: 'note', tone: 'info', text: tx('steps.m.crossBeams.noFree') });
    else if (!nC) blocks.push({ kind: 'note', tone: 'info', text: tx('steps.m.crossBeams.balanced') });
    else {
      blocks.push({ kind: 'note', tone: 'ok', text: tx('steps.m.crossBeams.converged', { n: nC }) });
      if (nC > shown) blocks.push({ kind: 'p', text: tx('steps.m.crossBeams.shown', { k: shown }) });
    }
    steps.push({ title: tx('steps.m.crossBeams.s.simultaneous'), blocks });
  }
  // 7. The same, joint by joint.
  if (free.length && cycles.length) {
    const rows: Cell[][] = [numRow(tx('steps.m.crossBeams.rowFEM'), FEM, false)];
    for (const r of releases) {
      const v = new Array<number>(nE).fill(0);
      v[r.e] = r.rel; v[r.f] = r.co;
      rows.push(numRow(tx('steps.m.crossBeams.rowRelease', { n: sups[r.joint].name }), v));
    }
    for (const i of free) {
      rows.push(numRow(tx('steps.m.crossBeams.rowJoint', { n: sups[i].name }), distTot.get(i)!.map((d, e) => d + coTot.get(i)![e])));
    }
    // The same numbers as the simultaneous table, regrouped: the column sums are its final moments.
    rows.push(numRow(tx('steps.m.crossBeams.rowSum'), final, false));
    steps.push({
      title: tx('steps.m.crossBeams.s.condensed'),
      blocks: [
        { kind: 'p', text: tx('steps.m.crossBeams.condWhy'), detail: true },
        { kind: 'table', head: colHead, rows, caption: tx('steps.m.crossBeams.condCaption') },
      ],
    });
  }
  // 8. Final end moments and the joint checks.
  {
    const blocks: Block[] = [];
    const Dsum = new Array<number>(nE).fill(0), COsum = new Array<number>(nE).fill(0);
    for (const c of cycles) for (let e = 0; e < nE; e++) { Dsum[e] += c.D[e]; COsum[e] += c.CO[e]; }
    spans.forEach((s, k) => {
      const e0 = 2 * k, e1 = 2 * k + 1;
      const f = (e: number) => `\\hat M_{${endSym(e)}} = \\mathrm{FEM}^{*}_{${endSym(e)}} + \\sum \\mathrm{D}_{${endSym(e)}} + \\sum \\mathrm{CO}_{${endSym(e)}}`;
      const sv = (e: number) => `\\hat M_{${endSym(e)}} = ${par(FEMs[e])} + ${par(Dsum[e])} + ${par(COsum[e])}`;
      blocks.push({
        kind: 'calc', label: tx('steps.m.crossBeams.final', { s: s.label }),
        formula: `${f(e0)}, \\qquad ${f(e1)}`, subst: `${sv(e0)}, \\qquad ${sv(e1)}`,
        result: `\\boxed{\\hat M_{${s.ij}} = ${num(final[e0])}\\ ${kNm}}, \\qquad \\boxed{\\hat M_{${s.ji}} = ${num(final[e1])}\\ ${kNm}}`,
      });
    });
    for (let i = 0; i < sups.length; i++) {
      if (jkind[i] === 'fixed') continue;
      const es = endsAt(i);
      const tot = es.reduce((a, e) => a + final[e], 0);
      const ok = Math.abs(tot - Cstar[i]) <= 1e-6 * Math.max(1, scale);
      blocks.push({ kind: 'eq', tex: `${es.map((e) => `\\hat M_{${endSym(e)}}`).join(' + ')} = ${es.map((e) => par(final[e])).join(' + ')} = ${num(tot)} \\;=\\; C^{*}_{${sups[i].name}} = ${num(Cstar[i])}${ok ? '\\ \\checkmark' : ''}`, note: tx('steps.m.crossBeams.jointCheck', { n: sups[i].name }) });
    }
    steps.push({ title: tx('steps.m.crossBeams.s.final'), blocks });
  }
  // 9. Reactions.
  const ends = spans.map((_, k) => ({ Mij: final[2 * k], Mji: final[2 * k + 1] }));
  const { step: rStep, sol } = reactionsStep(b, ends, null);
  steps.push(rStep);
  // 10. Against the matrix solve.
  if (ctx.ref) {
    const ref = ctx.ref;
    const rows: CompareRow[] = [];
    spans.forEach((s, k) => {
      rows.push({ label: `\\hat M_{${s.ij}}`, method: final[2 * k], matrix: refEndMoment(b, ref, s, 'L'), unit: 'kN·m' });
      rows.push({ label: `\\hat M_{${s.ji}}`, method: final[2 * k + 1], matrix: refEndMoment(b, ref, s, 'R'), unit: 'kN·m' });
    });
    rows.push(...reactionRows(b, ref, sol));
    steps.push({ title: tx('steps.common.compare'), blocks: [{ kind: 'compare', rows, caption: tx('steps.m.crossBeams.compareCaption') }, { kind: 'p', text: tx('steps.common.compareNote') }] });
  }
  // 11. Diagrams.
  steps.push(diagramsStep(b, sol.pieces));

  return {
    method: 'crossBeams', title: tx('steps.m.crossBeams.title'), subtitle: subtitle(b),
    intro: introBlocks(b, tx('steps.m.crossBeams.intro'), tx('steps.m.crossBeams.introWhy')),
    steps,
  };
}
