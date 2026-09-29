/** Double integration of EI v'' = M(x) on a straight beam, with Macaulay brackets and every reaction as an unknown. */
import type { MethodContext } from './registry';
import type { Applicability, Block, Cell, Step, StepDoc, Txt } from './doc';
import { tx } from './doc';
import { num, numText, par } from './format';
import { beamLine, type BeamLine } from './beam-line';
import { sketchOf } from './sketch';
import { solveSystem } from '../force-method/solve';
import {
  U, TOL, no, OK, p, texCell, mm, intro, compareBlock, readBeam, momentOf, loadTotals, loadTable,
  deformedSketch, beamDiagram, beamCompare, nodeTable, maxDeflection, beamRequirement, maxBlock,
  type BL,
} from './deformation-common';

/** A singularity term c·[U_u]·⟨x − a⟩ⁿ / d. */
interface MT { c: number; u?: number; a: number; n: number; d: number }

function bracket(x: number, a: number, n: number): number {
  if (x <= a + 1e-12) return 0;
  return n === 0 ? 1 : (x - a) ** n;
}

function brTex(a: number, n: number): string {
  if (Math.abs(a) < TOL) return n === 0 ? '' : n === 1 ? 'x' : `x^{${n}}`;
  const b = `\\langle x - ${num(a)} \\rangle`;
  return n === 1 ? b : `${b}^{${n}}`;
}

function termTex(c: number, sym: string | null, a: number, n: number, d: number, first: boolean): string {
  const sign = first ? (c < 0 ? '-' : '') : (c < 0 ? ' - ' : ' + ');
  const mag = Math.abs(c);
  const one = Math.abs(mag - 1) < 1e-12;
  const br = brTex(a, n);
  let k = sym ? `${one ? '' : `${num(mag)}\\,`}${sym}` : (one && (br || d > 1) ? '' : num(mag));
  if (d > 1) return `${sign}${k}${k ? '\\,' : ''}\\frac{${br || '1'}}{${d}}`;
  if (!k && !br) k = '1';
  return `${sign}${k}${k && br ? '\\,' : ''}${br}`;
}

function termsTex(ts: MT[], names: string[], tail = ''): string {
  const parts = ts.map((q, i) => termTex(q.c, q.u !== undefined ? names[q.u] : null, q.a, q.n, q.d, i === 0));
  const s = parts.join('') + tail;
  return s.length ? s : '0';
}

/** The same terms with the unknowns replaced, like brackets gathered. */
function numericTex(ts: MT[], vals: number[], tail: Array<{ c: number; tex: string }>): string {
  const acc: Array<{ a: number; n: number; c: number }> = [];
  for (const q of ts) {
    const c = (q.c * (q.u !== undefined ? vals[q.u] : 1)) / q.d;
    const e = acc.find((z) => Math.abs(z.a - q.a) < TOL && z.n === q.n);
    if (e) e.c += c; else acc.push({ a: q.a, n: q.n, c });
  }
  const parts: string[] = [];
  for (const z of acc) if (Math.abs(z.c) > 1e-12) parts.push(termTex(z.c, null, z.a, z.n, 1, parts.length === 0));
  for (const z of tail) {
    if (Math.abs(z.c) < 1e-12) continue;
    const first = parts.length === 0;
    const sign = first ? (z.c < 0 ? '-' : '') : (z.c < 0 ? ' - ' : ' + ');
    parts.push(`${sign}${num(Math.abs(z.c))}${z.tex ? `\\,${z.tex}` : ''}`);
  }
  return parts.length ? parts.join('') : '0';
}

function evalTerms(ts: MT[], vals: number[], x: number): number {
  let s = 0;
  for (const q of ts) s += (q.c * (q.u !== undefined ? vals[q.u] : 1) * bracket(x, q.a, q.n)) / q.d;
  return s;
}

/** A linear equation Σ cᵢ·Uᵢ = rhs, written. */
function rowTex(coef: number[], names: string[], rhs: number): string {
  const parts: string[] = [];
  coef.forEach((c, i) => {
    if (Math.abs(c) < 1e-12) return;
    const first = parts.length === 0;
    const sign = first ? (c < 0 ? '-' : '') : (c < 0 ? ' - ' : ' + ');
    const mag = Math.abs(c);
    parts.push(`${sign}${Math.abs(mag - 1) < 1e-12 ? '' : `${num(mag)}\\,`}${names[i]}`);
  });
  return `${parts.length ? parts.join('') : '0'} = ${num(rhs)}`;
}

function systemTex(A: number[][], names: string[], b: number[]): string {
  const mat = A.map((r) => r.map((v) => num(v)).join(' & ')).join(' \\\\ ');
  return `\\begin{bmatrix} ${mat} \\end{bmatrix} \\begin{Bmatrix} ${names.join(' \\\\ ')} \\end{Bmatrix} = \\begin{Bmatrix} ${b.map((v) => num(v)).join(' \\\\ ')} \\end{Bmatrix}`;
}

export function doubleIntegrationApplies(ctx: MethodContext): Applicability {
  const r = beamRequirement(ctx);
  if (!r.ok) return r.reason;
  const ms = [...ctx.pm.members.values()];
  const EI = ms[0].EI;
  if (ms.some((m) => Math.abs(m.EI - EI) > 1e-9 * Math.max(1, Math.abs(EI)))) return no('steps.m.doubleIntegration.req.ei');
  return OK;
}

export function buildDoubleIntegration(ctx: MethodContext): StepDoc {
  const { pm } = ctx;
  const ref = ctx.ref!;
  const line = (beamLine(pm) as { ok: true; beam: BeamLine }).beam;
  const bm = readBeam(pm, line);
  const EI = [...pm.members.values()][0].EI;
  const L = bm.L;

  // Unknowns: every vertical reaction, every fixed-end moment, then C1 and C2.
  const names: string[] = [];
  const rIdx = bm.supports.map((s) => names.push(`R_{${s.name}}`) - 1);
  const mIdx = bm.supports.map((s) => (s.kind === 'fixed' ? names.push(`M_{${s.name}}`) - 1 : -1));
  const iC1 = names.push('C_1') - 1;
  const iC2 = names.push('C_2') - 1;
  const n = names.length;

  // M(x) in brackets: reactions (unknown) and loads, left to right.
  const Mt: MT[] = [];
  bm.supports.forEach((s, k) => {
    if (s.x > L - TOL) return;
    Mt.push({ c: 1, u: rIdx[k], a: s.x, n: 1, d: 1 });
    if (mIdx[k] >= 0) Mt.push({ c: -1, u: mIdx[k], a: s.x, n: 0, d: 1 });
  });
  for (const l of bm.loads) {
    // A force at the right end acts at x = L: it never enters M(x) inside the beam, only the equilibrium equations.
    if (l.kind !== 'dist' && l.a > L - TOL) continue;
    if (l.kind === 'point') Mt.push({ c: -l.P, a: l.a, n: 1, d: 1 });
    else if (l.kind === 'couple') Mt.push({ c: -l.M, a: l.a, n: 0, d: 1 });
    else {
      const k = (l.wb - l.wa) / (l.b - l.a);
      if (Math.abs(l.wa) > 1e-12) Mt.push({ c: -l.wa, a: l.a, n: 2, d: 2 });
      if (Math.abs(k) > 1e-12) Mt.push({ c: -k, a: l.a, n: 3, d: 6 });
      if (l.b < L - TOL) {
        if (Math.abs(l.wb) > 1e-12) Mt.push({ c: l.wb, a: l.b, n: 2, d: 2 });
        if (Math.abs(k) > 1e-12) Mt.push({ c: k, a: l.b, n: 3, d: 6 });
      }
    }
  }
  Mt.sort((a, b) => a.a - b.a);
  const up = (ts: MT[]) => ts.map((q) => ({ ...q, n: q.n + 1, d: q.d * (q.n + 1) }));
  const Tt = up(Mt), Vt = up(Tt);

  // The equations: two of equilibrium and one per restrained displacement.
  const { W, Mw, Mc } = loadTotals(bm.loads);
  const eqs: Array<{ label: Txt; coef: number[]; rhs: number }> = [];
  const rowF = new Array(n).fill(0);
  rIdx.forEach((i) => { rowF[i] = 1; });
  eqs.push({ label: tx('steps.m.doubleIntegration.eqF'), coef: rowF, rhs: W });
  const rowM = new Array(n).fill(0);
  bm.supports.forEach((s, k) => { rowM[rIdx[k]] = s.x; if (mIdx[k] >= 0) rowM[mIdx[k]] = 1; });
  eqs.push({ label: tx('steps.m.doubleIntegration.eqM'), coef: rowM, rhs: Mw - Mc });
  const bcRow = (ts: MT[], x: number, c1: number, c2: number) => {
    const coef = new Array(n).fill(0);
    let known = 0;
    for (const q of ts) {
      const v = (q.c * bracket(x, q.a, q.n)) / q.d;
      if (q.u !== undefined) coef[q.u] += v; else known += v;
    }
    coef[iC1] = c1; coef[iC2] = c2;
    return { coef, rhs: -known };
  };
  for (const s of bm.supports) {
    eqs.push({ label: tx('steps.m.doubleIntegration.bcV', { n: s.name, x: numText(s.x) }), ...bcRow(Vt, s.x, s.x, 1) });
    if (s.kind === 'fixed') eqs.push({ label: tx('steps.m.doubleIntegration.bcT', { n: s.name, x: numText(s.x) }), ...bcRow(Tt, s.x, 1, 0) });
  }
  const A = eqs.map((e) => e.coef), b = eqs.map((e) => e.rhs);
  const X = solveSystem(A, b);

  const Rmap = new Map<number, { R: number; M: number }>();
  bm.supports.forEach((s, k) => Rmap.set(s.node, { R: X[rIdx[k]], M: mIdx[k] >= 0 ? X[mIdx[k]] : 0 }));
  const EIth = (x: number) => evalTerms(Tt, X, x) + X[iC1];
  const EIv = (x: number) => evalTerms(Vt, X, x) + X[iC1] * x + X[iC2];
  const th = (x: number) => EIth(x) / EI;
  const v = (x: number) => EIv(x) / EI;

  // The reactions and loads as one list of forces, for the diagram.
  const items: BL[] = [...bm.loads];
  bm.supports.forEach((s, k) => {
    items.push({ kind: 'point', a: s.x, P: -X[rIdx[k]] });
    if (mIdx[k] >= 0) items.push({ kind: 'couple', a: s.x, M: X[mIdx[k]] });
  });

  const unkList = bm.supports.map((_, k) => `${names[rIdx[k]]}${mIdx[k] >= 0 ? `,\\ ${names[mIdx[k]]}` : ''}`).join(',\\ ');
  const steps: Step[] = [];

  steps.push({
    title: tx('steps.m.doubleIntegration.s1'),
    blocks: [
      loadTable(bm),
      p('steps.m.doubleIntegration.unknowns', { n: n - 2, count: n }),
      { kind: 'eq', tex: `${unkList},\\ C_1,\\ C_2` },
      p('steps.m.doubleIntegration.unknownsWhy', undefined, true),
      ...(line.hasAxialLoads ? [{ kind: 'note', tone: 'info', text: tx('steps.deformation.axialIgnored') } as Block] : []),
    ],
  });

  steps.push({
    title: tx('steps.m.doubleIntegration.s2'),
    blocks: [
      p('steps.m.doubleIntegration.brackets'),
      { kind: 'eq', tex: `\\langle x - a \\rangle^{n} = \\begin{cases} (x-a)^{n} & x > a \\\\ 0 & x \\le a \\end{cases}, \\qquad \\int \\langle x - a \\rangle^{n} dx = \\frac{\\langle x - a \\rangle^{n+1}}{n+1}` },
      p('steps.m.doubleIntegration.bracketsWhy', undefined, true),
      p('steps.m.doubleIntegration.mLead'),
      { kind: 'eq', tex: `EI\\,v''(x) = M(x) = ${termsTex(Mt, names)}` },
      ...(bm.supports.some((s) => s.x > L - TOL) || bm.loads.some((l) => l.kind !== 'dist' && l.a > L - TOL) ? [p('steps.m.doubleIntegration.rightEnd', undefined, true)] : []),
      p('steps.m.doubleIntegration.distWhy', undefined, true),
    ],
  });

  steps.push({
    title: tx('steps.m.doubleIntegration.s3'),
    blocks: [
      p('steps.m.doubleIntegration.int1'),
      { kind: 'eq', tex: `EI\\,\\theta(x) = EI\\,v'(x) = ${termsTex(Tt, names, ' + C_1')}` },
      p('steps.m.doubleIntegration.int2'),
      { kind: 'eq', tex: `EI\\,v(x) = ${termsTex(Vt, names, ' + C_1\\,x + C_2')}` },
      p('steps.m.doubleIntegration.intWhy', undefined, true),
    ],
  });

  steps.push({
    title: tx('steps.m.doubleIntegration.s4'),
    blocks: [
      p('steps.m.doubleIntegration.eqLead'),
      { kind: 'table', head: [tx('steps.deformation.condition'), tx('steps.deformation.equation')], rows: eqs.map((e) => [e.label, texCell(rowTex(e.coef, names, e.rhs))]) },
      p('steps.m.doubleIntegration.eqWhy', undefined, true),
      p('steps.m.doubleIntegration.matrixLead'),
      { kind: 'eq', tex: systemTex(A, names, b) },
    ],
  });

  const boxed = names.map((nm, i) => {
    const unit = i === iC1 ? U.kNm2 : i === iC2 ? U.kNm3 : mIdx.includes(i) ? U.kNm : U.kN;
    return `\\boxed{${nm} = ${num(X[i])}\\ ${unit}}`;
  });
  const sumR = rIdx.reduce((s, i) => s + X[i], 0);
  steps.push({
    title: tx('steps.m.doubleIntegration.s5'),
    blocks: [
      { kind: 'calc', label: tx('steps.m.doubleIntegration.solve'), formula: '\\mathbf{A}\\,\\mathbf{u} = \\mathbf{b} \\;\\Rightarrow\\; \\mathbf{u} = \\mathbf{A}^{-1}\\mathbf{b}', result: boxed.join(',\\quad '),
        check: `\\textstyle\\sum R = ${rIdx.map((i) => par(X[i])).join(' + ')} = ${num(sumR)}\\ ${U.kN} = \\sum P = ${num(W)}\\ ${U.kN}\\ \\checkmark` },
      p('steps.m.doubleIntegration.constantsWhy', undefined, true),
      { kind: 'fig', sketch: { ...sketchOf(pm), dims: 'auto', diagram: beamDiagram(pm, bm, (x, r) => momentOf(items, x, r), 'moment', 'kN·m') }, caption: tx('steps.deformation.mCaption') },
    ],
  });

  const mx = maxDeflection(bm, v, th);
  const stat = mx.roots.map((r) => [texCell(`x = ${num(r)}\\ ${U.m}`), mm(v(r))] as Cell[]);
  steps.push({
    title: tx('steps.m.doubleIntegration.s6'),
    blocks: [
      p('steps.m.doubleIntegration.final', { EI: numText(EI) }),
      { kind: 'eq', tex: `\\theta(x) = \\frac{1}{${num(EI)}}\\Big[${numericTex(Tt, X, [{ c: X[iC1], tex: '' }])}\\Big]\\ ${U.rad}` },
      { kind: 'eq', tex: `v(x) = \\frac{1}{${num(EI)}}\\Big[${numericTex(Vt, X, [{ c: X[iC1], tex: 'x' }, { c: X[iC2], tex: '' }])}\\Big]\\ ${U.m}` },
      ...bm.nodes.filter((nd) => !bm.supports.some((s) => s.node === nd.id && s.kind === 'fixed')).slice(0, 12).map((nd): Block => ({
        kind: 'calc', label: tx('steps.deformation.atNode', { n: nd.name }),
        formula: `v_{${nd.name}} = \\frac{EI\\,v(${num(nd.x)})}{EI}, \\qquad \\theta_{${nd.name}} = \\frac{EI\\,\\theta(${num(nd.x)})}{EI}`,
        subst: `v_{${nd.name}} = \\frac{${num(EIv(nd.x))}}{${num(EI)}}, \\qquad \\theta_{${nd.name}} = \\frac{${num(EIth(nd.x))}}{${num(EI)}}`,
        result: `\\boxed{v_{${nd.name}} = ${num(mm(v(nd.x)))}\\ ${U.mm}}, \\qquad \\boxed{\\theta_{${nd.name}} = ${num(th(nd.x))}\\ ${U.rad}}`,
      })),
      nodeTable(bm, v, th),
      ...(stat.length ? [{ kind: 'table', head: [tx('steps.deformation.stationary'), texCell('v\\ [\\mathrm{mm}]')], rows: stat, caption: tx('steps.deformation.stationaryCaption') } as Block] : []),
      maxBlock(mx),
      deformedSketch(pm, bm, v, 'steps.deformation.deformedCaption'),
    ],
  });

  steps.push({
    title: tx('steps.common.compare'),
    blocks: compareBlock(beamCompare(bm, ref, v, th, Rmap), tx('steps.deformation.shearNote')),
  });

  return {
    method: 'doubleIntegration',
    title: tx('steps.m.doubleIntegration.title'),
    subtitle: tx('steps.deformation.subtitle.beam'),
    intro: intro(ctx, tx('steps.m.doubleIntegration.what'), 'steps.deformation.signs.beam', [
      { kind: 'eq', tex: 'EI\\,\\frac{d^2 v}{dx^2} = M(x), \\qquad \\theta = \\frac{dv}{dx}', note: tx('steps.m.doubleIntegration.eqNote') },
    ]),
    steps,
  };
}
