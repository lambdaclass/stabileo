/**
 * The laws along each member for the "cuts" method (methods/cuts.ts): the
 * member cut into segments between load discontinuities, N(x), V(x), M(x) on
 * each one as polynomials written from the equilibrium of the piece between
 * I and the section, the maxima and minima of M where V(x) = 0, the table of
 * values with the comparison against the matrix solve, and the diagrams.
 *
 * With w and P positive towards −y and C counter-clockwise:
 * M(x) = M_i + V_i x − ΣP(x − a) − ∫w(ξ)(x − ξ)dξ − ΣC, V = dM/dx,
 * N(x) = N_i − ΣH; M tensions the −y face (the reference's sagging moment).
 */
import type { Block, Cell, CompareRow, Step, Tex } from './doc';
import { tx } from './doc';
import { num, numText, par } from './format';
import type { PMember } from './plane-model';
import type { Sketch } from './sketch';
import { sketchOf } from './sketch';
import type { CutsCtx, LocalLoad, Reactions, Unknown } from './cuts-statics';
import { UF, UL, UM, distResultant, joinTerms, memTex } from './cuts-statics';

// ─── Small algebra ────────────────────────────────────────────────

/** A polynomial in x, c0 + c1·x + c2·x² + c3·x³. */
type Poly = number[];

const padd = (a: Poly, b: Poly): Poly => Array.from({ length: Math.max(a.length, b.length) }, (_, k) => (a[k] ?? 0) + (b[k] ?? 0));
const pscale = (a: Poly, s: number): Poly => a.map((c) => c * s);
const binom = (n: number, k: number) => { let r = 1; for (let q = 1; q <= k; q++) r = (r * (n - q + 1)) / q; return r; };
/** (x − a)^n expanded. */
const pshift = (a: number, n: number): Poly => Array.from({ length: n + 1 }, (_, k) => binom(n, k) * (-a) ** (n - k));
const peval = (p: Poly, x: number) => p.reduceRight((s, c) => s * x + c, 0);

/** The polynomial with the coefficients that are rounding noise on [0, xMax] dropped. */
function ptrim(p: Poly, xMax: number): Poly {
  const X = Math.max(1, xMax);
  const scale = Math.max(0, ...p.map((c, k) => Math.abs(c) * X ** k));
  const out = p.map((c, k) => (Math.abs(c) * X ** k <= 1e-10 * scale || Math.abs(c) < 1e-12 ? 0 : c));
  while (out.length > 1 && out[out.length - 1] === 0) out.pop();
  return out.length ? out : [0];
}

/** A polynomial in KaTeX, highest power first: "-7.5\,x^{2} + 45\,x - 20". */
function polyTex(p: Poly): Tex {
  const parts: string[] = [];
  for (let k = p.length - 1; k >= 0; k--) {
    const c = p[k];
    if (c === 0) continue;
    const a = Math.abs(c);
    const mag = k === 0 ? num(a) : Math.abs(a - 1) < 1e-12 ? '' : `${num(a)}\\,`;
    const pw = k === 0 ? '' : k === 1 ? 'x' : `x^{${k}}`;
    parts.push(`${parts.length === 0 ? (c < 0 ? '-' : '') : c < 0 ? ' - ' : ' + '}${mag}${pw}`);
  }
  return parts.length ? parts.join('') : '0';
}

/** A polynomial with its unit: in parentheses when it has more than one term. */
const withUnit = (p: Poly, unit: string) => (p.filter((c) => c !== 0).length > 1 ? `\\big(${polyTex(p)}\\big)\\ ${unit}` : `${polyTex(p)}\\ ${unit}`);

const derivTex = (p: Poly): Poly => (p.length > 1 ? p.slice(1).map((c, k) => c * (k + 1)) : [0]);

// ─── Segments of a member ─────────────────────────────────────────

export interface Segment {
  x0: number; x1: number;
  N: Poly; V: Poly; M: Poly;
  /** Symbolic and numeric terms after the end values, for the three calcs. */
  tex: { N: [string[], string[]]; V: [string[], string[]]; M: [string[], string[]] };
  extremes: Array<{ x: number; M: number; eq: Tex; how: Tex }>;
}

export interface MemberCut {
  m: PMember;
  loads: LocalLoad[];
  Ni: number; Vi: number; Mi: number;
  segs: Segment[];
  /** Values just before J (the last segment's end). */
  Nj: number; Vj: number; Mj: number;
}

const xm = (a: number, sym?: string) => (Math.abs(a) < 1e-12 ? 'x' : `(x - ${sym ?? num(a)})`);

export function cutMember(m: PMember, loads: LocalLoad[], Ni: number, Vi: number, Mi: number): MemberCut {
  const L = m.L;
  const tol = 1e-9 * Math.max(1, L);
  const bps = [0, L];
  for (const l of loads) {
    if (l.kind === 'dist') bps.push(l.a, l.b); else bps.push(l.a);
  }
  const xs = [...new Set(bps.filter((x) => x > tol && x < L - tol).map((x) => Math.round(x / tol) * tol))].sort((a, b) => a - b);
  const pts = [0, ...xs, L];
  const segs: Segment[] = [];
  for (let s = 0; s + 1 < pts.length; s++) {
    const x0 = pts[s], x1 = pts[s + 1];
    let N: Poly = [Ni], V: Poly = [Vi], M: Poly = [Mi, Vi];
    const tex: Segment['tex'] = { N: [[], []], V: [[], []], M: [[], []] };
    for (const l of loads) {
      const k = l.k;
      if (l.kind === 'dist') {
        if (l.b <= x0 + tol) {
          const { R, xc, S1 } = distResultant(l);
          V = padd(V, [-R]);
          M = padd(M, [S1, -R]);
          tex.V[0].push(`- R_{${k}}`); tex.V[1].push(`- ${par(R)}`);
          if (Math.abs(R) > 1e-12) {
            tex.M[0].push(`- R_{${k}}\\,(x - \\bar{x}_{${k}})`); tex.M[1].push(`- ${par(R)}\\,${xm(xc)}`);
          } else {
            tex.M[0].push(`+ \\int_{a_{${k}}}^{b_{${k}}} w_{${k}}(\\xi)\\,\\xi\\,d\\xi`); tex.M[1].push(`+ ${par(S1)}`);
          }
        } else if (l.a <= x0 + tol) {
          const kk = (l.wb - l.wa) / (l.b - l.a);
          V = padd(V, padd(pscale(pshift(l.a, 1), -l.wa), pscale(pshift(l.a, 2), -kk / 2)));
          M = padd(M, padd(pscale(pshift(l.a, 2), -l.wa / 2), pscale(pshift(l.a, 3), -kk / 6)));
          const A = l.a;
          if (Math.abs(kk) < 1e-12) {
            tex.V[0].push(`- w_{${k}}\\,${xm(A, `a_{${k}}`)}`); tex.V[1].push(`- ${par(l.wa)}\\,${xm(A)}`);
            tex.M[0].push(`- \\frac{w_{${k}}\\,${xm(A, `a_{${k}}`)}^2}{2}`); tex.M[1].push(`- \\frac{${par(l.wa)}\\,${xm(A)}^2}{2}`);
          } else {
            const kt = `\\frac{w_{${k},b} - w_{${k},a}}{b_{${k}} - a_{${k}}}`;
            tex.V[0].push(`- w_{${k},a}\\,${xm(A, `a_{${k}}`)} - ${kt}\\,\\frac{${xm(A, `a_{${k}}`)}^2}{2}`);
            tex.V[1].push(`- ${par(l.wa)}\\,${xm(A)} - ${par(kk)}\\,\\frac{${xm(A)}^2}{2}`);
            tex.M[0].push(`- \\frac{w_{${k},a}\\,${xm(A, `a_{${k}}`)}^2}{2} - ${kt}\\,\\frac{${xm(A, `a_{${k}}`)}^3}{6}`);
            tex.M[1].push(`- \\frac{${par(l.wa)}\\,${xm(A)}^2}{2} - ${par(kk)}\\,\\frac{${xm(A)}^3}{6}`);
          }
        }
        continue;
      }
      if (l.a > x0 + tol) continue;
      if (l.kind === 'P') {
        V = padd(V, [-l.v]); M = padd(M, pscale(pshift(l.a, 1), -l.v));
        tex.V[0].push(`- P_{${k}}`); tex.V[1].push(`- ${par(l.v)}`);
        tex.M[0].push(`- P_{${k}}\\,${xm(l.a, `a_{${k}}`)}`); tex.M[1].push(`- ${par(l.v)}\\,${xm(l.a)}`);
      } else if (l.kind === 'H') {
        N = padd(N, [-l.v]);
        tex.N[0].push(`- H_{${k}}`); tex.N[1].push(`- ${par(l.v)}`);
      } else {
        M = padd(M, [-l.v]);
        tex.M[0].push(`- C_{${k}}`); tex.M[1].push(`- ${par(l.v)}`);
      }
    }
    N = ptrim(N, x1); V = ptrim(V, x1); M = ptrim(M, x1);
    segs.push({ x0, x1, N, V, M, tex, extremes: extremesOf(V, M, x0, x1) });
  }
  const last = segs[segs.length - 1];
  return { m, loads, Ni, Vi, Mi, segs, Nj: peval(last.N, L), Vj: peval(last.V, L), Mj: peval(last.M, L) };
}

/** Where V(x) = 0 strictly inside the segment, and M there, with how the root was found. */
function extremesOf(V: Poly, M: Poly, x0: number, x1: number): Segment['extremes'] {
  const tol = 1e-7 * Math.max(1, x1 - x0);
  const inside = (x: number) => x > x0 + tol && x < x1 - tol;
  const out: Segment['extremes'] = [];
  const eq = `${polyTex(V)} = 0`;
  if (V.length === 2) {
    const x = -V[0] / V[1];
    if (inside(x)) out.push({ x, M: peval(M, x), eq, how: `x^* = -\\frac{${par(V[0])}}{${par(V[1])}}` });
  } else if (V.length === 3) {
    const [c, b, a] = V;
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const r = Math.sqrt(disc);
      const how = `x^* = \\frac{-${par(b)} \\pm \\sqrt{${par(b)}^2 - 4\\,${par(a)}\\,${par(c)}}}{2\\,${par(a)}}`;
      for (const x of [(-b - r) / (2 * a), (-b + r) / (2 * a)].sort((p, q) => p - q)) {
        if (inside(x) && !out.some((e) => Math.abs(e.x - x) < tol)) out.push({ x, M: peval(M, x), eq, how });
      }
    }
  }
  return out;
}

/** Subscript digits for the figure labels (plain text), "P₂". */
const subd = (k: number) => String(k).replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]);

/** The piece between I and a section in the first segment, in the member's axes, with the positive end and section forces. */
function pieceSketch(cut: MemberCut): Sketch {
  const seg = cut.segs[0];
  const xs = (seg.x0 + seg.x1) / 2;
  const off = (0.4 / 4.55) * xs; // the same 40 px as the triad
  const sk: Sketch = {
    nodes: [{ id: 1, x: 0, z: 0, label: 'I' }, { id: 2, x: xs, z: 0, label: 'x' }],
    members: [{ id: 1, i: 1, j: 2 }],
    spanLoads: [], forces: [], couples: [],
    height: 170,
  };
  for (const l of cut.loads) {
    if (l.kind === 'dist') {
      if (l.a >= xs) continue;
      const b = Math.min(l.b, xs);
      const w = (x: number) => l.wa + ((l.wb - l.wa) * (x - l.a)) / (l.b - l.a);
      sk.spanLoads!.push({ member: 1, a: l.a, b, wa: w(l.a), wb: w(b), label: `w${subd(l.k)}` });
    } else if (l.a < xs) {
      if (l.kind === 'P') sk.forces!.push({ x: l.a, z: 0, fx: 0, fz: -Math.sign(l.v), label: `P${subd(l.k)}`, color: 'load' });
      else if (l.kind === 'H') sk.forces!.push({ x: l.a + Math.sign(l.v) * off, z: 0, fx: Math.sign(l.v), fz: 0, label: `H${subd(l.k)}`, color: 'load' });
      else sk.couples!.push({ x: l.a, z: 0, m: l.v, label: `C${subd(l.k)}`, color: 'moment' });
    }
  }
  sk.forces!.push(
    { x: -off, z: 0, fx: -1, fz: 0, label: 'Nᵢ', color: 'unknown' },
    { x: 0, z: 0, fx: 0, fz: 1, label: 'Vᵢ', color: 'unknown' },
    { x: xs + off, z: 0, fx: 1, fz: 0, label: 'N(x)', color: 'unknown' },
    { x: xs, z: 0, fx: 0, fz: -1, label: 'V(x)', color: 'unknown' },
  );
  sk.couples!.push(
    { x: 0, z: 0, m: -1, label: 'Mᵢ', color: 'unknown' },
    { x: xs, z: 0, m: 1, label: 'M(x)', color: 'unknown' },
  );
  return sk;
}

// ─── Step 4: N, V, M by segment ───────────────────────────────────

export function segmentsStep(S: CutsCtx, cuts: Map<number, MemberCut>): Step {
  const { pm, nF, nM, pF } = S;
  const segBlocks: Block[] = [
    { kind: 'p', text: tx('steps.cuts.seg.intro') },
    { kind: 'eq', tex: 'N(x) = N_i - \\sum H_k,\\qquad V(x) = V_i - \\sum P_k - \\int_0^x w\\,d\\xi,\\qquad M(x) = M_i + V_i\\,x - \\sum P_k\\,(x - a_k) - \\int_0^x w(\\xi)\\,(x - \\xi)\\,d\\xi - \\sum C_k', note: tx('steps.cuts.seg.general') },
    { kind: 'p', text: tx('steps.cuts.seg.why'), detail: true },
  ];
  for (const id of pm.memberOrder) {
    const cu = cuts.get(id)!;
    const m = cu.m;
    const blocks: Block[] = [];
    if (cu.loads.length) {
      blocks.push({
        kind: 'table',
        head: [{ tex: 'k' }, tx('steps.cuts.ml.kind'), tx('steps.cuts.ml.where'), tx('steps.cuts.ml.value'), tx('steps.cuts.ml.resultant')],
        rows: cu.loads.map((l): Cell[] => {
          if (l.kind === 'dist') {
            const { R, xc } = distResultant(l);
            const uni = Math.abs(l.wa - l.wb) < 1e-12;
            return [l.k, tx('steps.cuts.ml.dist'), { tex: `a_{${l.k}} = ${num(l.a)},\\ b_{${l.k}} = ${num(l.b)}` },
              { tex: uni ? `w_{${l.k}} = ${num(l.wa)}` : `w_{${l.k},a} = ${num(l.wa)},\\ w_{${l.k},b} = ${num(l.wb)}` },
              { tex: `R_{${l.k}} = ${num(R)},\\ \\bar{x}_{${l.k}} = ${num(xc)}` }];
          }
          const sym = l.kind;
          return [l.k, tx(`steps.cuts.ml.${sym}`), { tex: `a_{${l.k}} = ${num(l.a)}` }, { tex: `${sym}_{${l.k}} = ${num(l.v)}` }, '—'];
        }),
        caption: tx('steps.cuts.ml.caption'),
      });
    } else {
      blocks.push({ kind: 'p', text: tx('steps.cuts.seg.unloaded') });
    }
    blocks.push({ kind: 'eq', tex: `N_i = ${nF(cu.Ni)}\\ ${UF},\\quad V_i = ${nF(cu.Vi)}\\ ${UF},\\quad M_i = ${nM(cu.Mi)}\\ ${UM},\\quad L = ${num(m.L)}\\ ${UL}`, note: tx('steps.cuts.seg.endValues') });
    blocks.push({ kind: 'fig', sketch: pieceSketch(cu), caption: tx('steps.cuts.seg.pieceCaption', { m: m.name }) });
    cu.segs.forEach((s) => {
      const range = `\\quad (${num(s.x0)} \\le x \\le ${num(s.x1)})`;
      const sb: Block[] = [];
      const q = (base: string, t: [string[], string[]], baseNum: string) => ({
        f: joinTerms([base, ...t[0]], 6), s: joinTerms([baseNum, ...t[1]], 6),
      });
      const nq = q('N_i', s.tex.N, nF(cu.Ni));
      const vq = q('V_i', s.tex.V, nF(cu.Vi));
      const mq = q(`M_i + V_i\\,x`, s.tex.M, `${nM(cu.Mi)} + ${pF(cu.Vi)}\\,x`);
      sb.push({ kind: 'calc', label: tx('steps.cuts.seg.N'), formula: `N(x) = ${nq.f}`, subst: `N(x) = ${nq.s}`, result: `\\boxed{N(x) = ${withUnit(s.N, UF)}}${range}` });
      sb.push({ kind: 'calc', label: tx('steps.cuts.seg.V'), formula: `V(x) = ${vq.f}`, subst: `V(x) = ${vq.s}`, result: `\\boxed{V(x) = ${withUnit(s.V, UF)}}${range}` });
      sb.push({ kind: 'calc', label: tx('steps.cuts.seg.M'), formula: `M(x) = ${mq.f}`, subst: `M(x) = ${mq.s}`, result: `\\boxed{M(x) = ${withUnit(s.M, UM)}}${range}`, check: s.V.length > 0 ? `\\frac{dM}{dx} = ${polyTex(derivTex(s.M))} = V(x)\\ \\checkmark` : undefined });
      const at = (x: number) => `x = ${num(x)}:\\; N = ${nF(peval(s.N, x))},\\; V = ${nF(peval(s.V, x))},\\; M = ${nM(peval(s.M, x))}`;
      sb.push({ kind: 'eq', tex: `${at(s.x0)} \\qquad ${at(s.x1)}`, note: tx('steps.cuts.seg.atEnds') });
      if (s.V.length === 1 && s.V[0] === 0) sb.push({ kind: 'p', text: tx('steps.cuts.seg.noShear') });
      for (const e of s.extremes) {
        sb.push({
          kind: 'calc', label: tx('steps.cuts.seg.extreme'), formula: 'V(x) = 0', subst: `${e.eq} \\;\\Rightarrow\\; ${e.how}`,
          result: `x^* = ${num(e.x)}\\ ${UL} \\;\\Rightarrow\\; \\boxed{M(x^*) = ${nM(e.M)}\\ ${UM}}`,
        });
      }
      if (s.extremes.length === 0 && s.V.length > 1) sb.push({ kind: 'p', text: tx('steps.cuts.seg.noExtreme'), detail: true });
      blocks.push({ kind: 'sub', title: tx('steps.cuts.seg.title', { a: numText(s.x0), b: numText(s.x1) }), blocks: sb });
    });
    segBlocks.push({ kind: 'sub', title: tx('steps.cuts.member', { m: m.name }), blocks });
  }
  return { title: tx('steps.cuts.seg.stepTitle'), blocks: segBlocks };
}

// ─── Step 5: the values and the comparison ────────────────────────

export function valuesStep(S: CutsCtx, cuts: Map<number, MemberCut>, reactions: Reactions, solved: number[] | null, unknowns: Unknown[]): Step {
  const { pm, ref, nameOf, tree, snapF, snapM } = S;
  const tableRows: Cell[][] = [];
  const cmp: CompareRow[] = [];
  if (solved) {
    for (const u of unknowns) {
      const rr = reactions.get(u.node)!, rf = ref.reactions.get(u.node) ?? { rx: 0, rz: 0, my: 0 };
      const k = u.comp === 'x' ? 'rx' : u.comp === 'z' ? 'rz' : 'my';
      cmp.push({ label: u.tex, method: rr[k], matrix: rf[k], unit: u.comp === 'm' ? 'kN·m' : 'kN' });
    }
  }
  for (const id of pm.memberOrder) {
    const cu = cuts.get(id)!;
    const m = cu.m;
    const mt = memTex(pm, m);
    const ref0 = { N: ref.axial.get(id) ?? 0, V: ref.shearAt(id, 0), M: ref.momentAt(id, 0) };
    const ref1 = { V: ref.shearAt(id, 1), M: ref.momentAt(id, 1) };
    tableRows.push([m.name, { tex: '0' }, snapF(cu.Ni), snapF(cu.Vi), snapM(cu.Mi), tx('steps.cuts.tab.endI', { n: nameOf(m.i) })]);
    cmp.push({ label: `N_{${mt}}(0)`, method: cu.Ni, matrix: ref0.N, unit: 'kN' });
    cmp.push({ label: `V_{${mt}}(0)`, method: cu.Vi, matrix: ref0.V, unit: 'kN' });
    cmp.push({ label: `M_{${mt}}(0)`, method: cu.Mi, matrix: ref0.M, unit: 'kN·m' });
    for (const s of cu.segs) for (const e of s.extremes) {
      tableRows.push([m.name, { tex: num(e.x) }, snapF(peval(s.N, e.x)), 0, snapM(e.M), tx('steps.cuts.tab.extreme')]);
      cmp.push({ label: `M_{${mt}}(${num(e.x)})`, method: e.M, matrix: ref.momentAt(id, e.x / m.L), unit: 'kN·m' });
    }
    tableRows.push([m.name, { tex: num(m.L) }, snapF(cu.Nj), snapF(cu.Vj), snapM(cu.Mj), tx('steps.cuts.tab.endJ', { n: nameOf(m.j) })]);
    // The reference carries the axial force at I; it is the one at J too when no axial load sits in between.
    if (!cu.loads.some((l) => l.kind === 'H')) cmp.push({ label: `N_{${mt}}(${num(m.L)})`, method: cu.Nj, matrix: ref0.N, unit: 'kN' });
    cmp.push({ label: `V_{${mt}}(${num(m.L)})`, method: cu.Vj, matrix: ref1.V, unit: 'kN' });
    cmp.push({ label: `M_{${mt}}(${num(m.L)})`, method: cu.Mj, matrix: ref1.M, unit: 'kN·m' });
  }
  return {
    title: tx('steps.cuts.tab.title'),
    blocks: [
      { kind: 'table', head: [tx('steps.common.member'), { tex: `x\\ [${UL}]` }, { tex: `N\\ [${UF}]` }, { tex: `V\\ [${UF}]` }, { tex: `M\\ [${UM}]` }, tx('steps.cuts.tab.where')], rows: tableRows, caption: tx('steps.cuts.tab.caption') },
      { kind: 'p', text: tx(solved && tree ? 'steps.cuts.tab.compareStatics' : 'steps.cuts.tab.compareRef') },
      { kind: 'compare', rows: cmp, caption: tx('steps.common.compare') },
      { kind: 'p', text: tx('steps.common.compareNote'), detail: true },
    ],
  };
}

// ─── Step 6: diagrams ─────────────────────────────────────────────

export function diagramsStep(S: CutsCtx, cuts: Map<number, MemberCut>): Step {
  const { pm, snapF, snapM } = S;
  const sample = (f: 'N' | 'V' | 'M') => pm.memberOrder.map((id) => {
    const cu = cuts.get(id)!;
    const L = cu.m.L;
    const values: Array<[number, number]> = [];
    for (const s of cu.segs) {
      const p = s[f];
      const xs = new Set<number>([s.x0, s.x1, ...(f === 'M' ? s.extremes.map((e) => e.x) : [])]);
      if (p.length > 2) for (let k = 1; k < 16; k++) xs.add(s.x0 + ((s.x1 - s.x0) * k) / 16);
      for (const x of [...xs].sort((a, b) => a - b)) values.push([x / L, f === 'M' ? snapM(peval(p, x)) : snapF(peval(p, x))]);
    }
    return { member: id, values };
  });
  const base = sketchOf(pm);
  return {
    title: tx('steps.common.diagrams'),
    blocks: [
      { kind: 'p', text: tx('steps.cuts.dia.intro') },
      { kind: 'fig', sketch: { ...base, diagram: { color: 'diagram', marks: true, unit: 'kN', members: sample('N') } }, caption: tx('steps.cuts.dia.N') },
      { kind: 'fig', sketch: { ...base, diagram: { color: 'diagram', marks: true, unit: 'kN', members: sample('V') } }, caption: tx('steps.cuts.dia.V') },
      { kind: 'fig', sketch: { ...base, diagram: { color: 'moment', marks: true, unit: 'kN·m', members: sample('M') } }, caption: tx('steps.cuts.dia.M') },
    ],
  };
}
