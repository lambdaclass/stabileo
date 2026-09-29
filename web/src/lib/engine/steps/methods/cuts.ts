/**
 * The "cuts" explained step-by-step method: the internal forces N, V and M of
 * a plane frame or beam, member by member and segment by segment, from the
 * equilibrium of the part of the structure on one side of a section.
 *
 * The order is the hand calculation's: classify the structure; get the
 * reactions (from equilibrium when it is statically determinate, from the
 * matrix solve when it is not, and said so); get every member's forces at its
 * start I by cutting just after I; then, for a section at x from I in each
 * segment between load discontinuities, write N(x), V(x), M(x) as the
 * equilibrium of the piece between I and the section.
 *
 * Signs, stated once in the document and used everywhere: local axes x from
 * I to J and y a quarter turn counter-clockwise; on the piece between I and
 * the section, N acts along +x (tension positive), V along −y, and M is
 * counter-clockwise, which tensions the −y face (the reference's sagging
 * moment). With w and P positive towards −y (fem.ts's convention) this gives
 * M(x) = M_i + V_i x − ΣP(x − a) − ∫w(ξ)(x − ξ)dξ − ΣC, and V = dM/dx.
 *
 * Everything is computed from the solver's own input (plane-model.ts), so the
 * numbers are the loads the matrix solve sees; the closing comparison checks
 * them against it.
 */
import type { ExplainedMethod, MethodContext } from '../registry';
import type { Block, Cell, CompareRow, Step, StepDoc, Tex, Txt } from '../doc';
import { tx } from '../doc';
import { num, numText, par } from '../format';
import type { PlaneModel, PMember } from '../plane-model';
import { hasSpecialSupports, hasThermal } from '../plane-model';
import type { Reference } from '../reference';
import type { Sketch } from '../sketch';
import { sketchOf } from '../sketch';
import { computeStaticDegree } from '../../kinematic-2d';

/** Beyond this the document stops being something a person reads through. */
export const CUTS_MAX_MEMBERS = 30;

const UF = '\\mathrm{kN}';
const UM = '\\mathrm{kN\\,m}';
const UL = '\\mathrm{m}';

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

/** Terms written one after the other: each "+ t" or "- t", the first without its "+". */
/** Long sums are broken into lines; outside an aligned block they get one of their own. */
const wrapA = (s: string) => (s.includes('\\\\') ? `\\begin{aligned} &${s} \\end{aligned}` : s);

function joinTerms(terms: string[], perLine = 0): string {
  if (terms.length === 0) return '0';
  let s = '';
  terms.forEach((t, k) => {
    const x = t.trim();
    const piece = k === 0 ? (x.startsWith('+') ? x.slice(1).trim() : x) : ` ${x}`;
    if (perLine > 0 && k > 0 && k % perLine === 0) s += ' \\\\ &\\quad';
    s += piece;
  });
  return s;
}

/** Gaussian elimination with partial pivoting; null when singular. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  const scale = Math.max(1e-30, ...A.flat().map(Math.abs));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-11 * scale) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}

// ─── The model, read for statics ──────────────────────────────────

/** A member load in the member's axes, numbered per member (k = 1, 2 …): w, P towards −y; H towards J; C counter-clockwise. */
type LocalLoad =
  | { kind: 'dist'; k: number; a: number; b: number; wa: number; wb: number }
  | { kind: 'P' | 'H' | 'C'; k: number; a: number; v: number };

function localLoads(pm: PlaneModel, m: PMember): LocalLoad[] {
  const out: LocalLoad[] = [];
  let k = 0;
  for (const l of pm.memberLoads) {
    if (l.member !== m.id) continue;
    if (l.kind === 'dist') {
      if (l.b - l.a < 1e-12 || (Math.abs(l.qa) < 1e-12 && Math.abs(l.qb) < 1e-12)) continue;
      out.push({ kind: 'dist', k: ++k, a: l.a, b: l.b, wa: -l.qa, wb: -l.qb });
    } else if (l.kind === 'point') {
      if (Math.abs(l.p) > 1e-12) out.push({ kind: 'P', k: ++k, a: l.a, v: -l.p });
      if (Math.abs(l.px) > 1e-12) out.push({ kind: 'H', k: ++k, a: l.a, v: l.px });
      if (Math.abs(l.m) > 1e-12) out.push({ kind: 'C', k: ++k, a: l.a, v: l.m });
    }
  }
  return out;
}

/** Resultant of a distributed load (towards −y), its centroid from I, and ∫w·ξ dξ. */
function distResultant(l: { a: number; b: number; wa: number; wb: number }) {
  const R = ((l.wa + l.wb) / 2) * (l.b - l.a);
  const kk = (l.wb - l.wa) / (l.b - l.a);
  const S1 = (l.wa * (l.b ** 2 - l.a ** 2)) / 2 + kk * ((l.b ** 3 - l.a ** 3) / 3 - (l.a * (l.b ** 2 - l.a ** 2)) / 2);
  const xc = Math.abs(R) > 1e-12 ? S1 / R : (l.a + l.b) / 2;
  return { R, xc, S1 };
}

/** An external action in global axes: a force at a point and a couple (counter-clockwise). */
interface Act { x: number; z: number; fx: number; fz: number; m: number }

/** A member load as a global action (a distributed load by its resultant at its centroid). */
function actOf(pm: PlaneModel, m: PMember, l: LocalLoad): Act {
  const ni = pm.nodes.get(m.i)!;
  const at = (t: number) => ({ x: ni.x + m.c * t, z: ni.z + m.s * t });
  // Local −y in global axes is (s, −c).
  if (l.kind === 'dist') {
    const { R, xc, S1 } = distResultant(l);
    if (Math.abs(R) > 1e-12) return { ...at(xc), fx: R * m.s, fz: -R * m.c, m: 0 };
    // No net force: the load is a couple, its moment about I.
    return { ...at(0), fx: 0, fz: 0, m: -S1 };
  }
  if (l.kind === 'P') return { ...at(l.a), fx: l.v * m.s, fz: -l.v * m.c, m: 0 };
  if (l.kind === 'H') return { ...at(l.a), fx: l.v * m.c, fz: l.v * m.s, m: 0 };
  return { ...at(l.a), fx: 0, fz: 0, m: l.v };
}

const momentAbout = (a: Act, x0: number, z0: number) => (a.x - x0) * a.fz - (a.z - z0) * a.fx + a.m;

/** The moment of an action about a point, as "+ (dx)·(Fz) - (dz)·(Fx) + C" terms. */
function momentTerms(a: Act, x0: number, z0: number): string[] {
  const dx = a.x - x0, dz = a.z - z0;
  const t: string[] = [];
  if (Math.abs(dx) > 1e-12 && Math.abs(a.fz) > 1e-12) t.push(`+ ${par(dx)} \\cdot ${par(a.fz)}`);
  if (Math.abs(dz) > 1e-12 && Math.abs(a.fx) > 1e-12) t.push(`- ${par(dz)} \\cdot ${par(a.fx)}`);
  if (Math.abs(a.m) > 1e-12) t.push(`+ ${par(a.m)}`);
  return t;
}

/** A reaction component, an unknown of step 2. */
interface Unknown { node: number; comp: 'x' | 'z' | 'm'; tex: Tex; text: string }

const nm = (name: string) => `\\mathrm{${name}}`;
const memTex = (pm: PlaneModel, m: PMember) => {
  const a = pm.nodes.get(m.i)!.name, b = pm.nodes.get(m.j)!.name;
  return a.length === 1 && b.length === 1 ? `\\mathrm{${a}${b}}` : `\\mathrm{${a}{,}${b}}`;
};

function unknownsOf(pm: PlaneModel): Unknown[] {
  const out: Unknown[] = [];
  for (const id of pm.nodeOrder) {
    const s = pm.supports.get(id);
    if (!s) continue;
    const n = pm.nodes.get(id)!.name;
    if (s.ux) out.push({ node: id, comp: 'x', tex: `R_{${nm(n)}x}`, text: `R${n}x` });
    if (s.uz) out.push({ node: id, comp: 'z', tex: `R_{${nm(n)}z}`, text: `R${n}z` });
    if (s.ry) out.push({ node: id, comp: 'm', tex: `M_{${nm(n)}}`, text: `M${n}` });
  }
  return out;
}

/** The node set reachable from `start` without crossing member `skip`. */
function component(pm: PlaneModel, start: number, skip: number): Set<number> {
  const seen = new Set<number>([start]);
  const stack = [start];
  while (stack.length) {
    const n = stack.pop()!;
    for (const m of pm.members.values()) {
      if (m.id === skip) continue;
      const o = m.i === n ? m.j : m.j === n ? m.i : null;
      if (o !== null && !seen.has(o)) { seen.add(o); stack.push(o); }
    }
  }
  return seen;
}

/** Is the member graph a tree (connected, no closed ring)? Then every cut through a member splits it in two. */
function isTree(pm: PlaneModel): boolean {
  const used = new Set<number>();
  for (const m of pm.members.values()) { used.add(m.i); used.add(m.j); }
  if (used.size === 0 || pm.members.size !== used.size - 1) return false;
  const first = pm.members.values().next().value!;
  return component(pm, first.i, -1).size === used.size;
}

/** The external actions on a part: loads and (known or unknown) reactions of its nodes, loads of its members. */
interface Part { nodes: Set<number>; members: Set<number> }

function partLoads(pm: PlaneModel, part: Part, loadsBy: Map<number, LocalLoad[]>): Act[] {
  const acts: Act[] = [];
  for (const l of pm.nodalLoads) {
    if (!part.nodes.has(l.node)) continue;
    const n = pm.nodes.get(l.node)!;
    if (Math.abs(l.fx) > 1e-12 || Math.abs(l.fz) > 1e-12 || Math.abs(l.my) > 1e-12) acts.push({ x: n.x, z: n.z, fx: l.fx, fz: l.fz, m: l.my });
  }
  for (const mid of part.members) {
    const m = pm.members.get(mid)!;
    for (const l of loadsBy.get(mid) ?? []) acts.push(actOf(pm, m, l));
  }
  return acts;
}

// ─── Segments of a member ─────────────────────────────────────────

interface Segment {
  x0: number; x1: number;
  N: Poly; V: Poly; M: Poly;
  /** Symbolic and numeric terms after the end values, for the three calcs. */
  tex: { N: [string[], string[]]; V: [string[], string[]]; M: [string[], string[]] };
  extremes: Array<{ x: number; M: number; eq: Tex; how: Tex }>;
}

interface MemberCut {
  m: PMember;
  loads: LocalLoad[];
  Ni: number; Vi: number; Mi: number;
  segs: Segment[];
  /** Values just before J (the last segment's end). */
  Nj: number; Vj: number; Mj: number;
}

const xm = (a: number, sym?: string) => (Math.abs(a) < 1e-12 ? 'x' : `(x - ${sym ?? num(a)})`);

function cutMember(m: PMember, loads: LocalLoad[], Ni: number, Vi: number, Mi: number): MemberCut {
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

// ─── Figures ──────────────────────────────────────────────────────

/** The structure with its loads, as the documents draw it. */
function structureSketch(pm: PlaneModel, loadsBy: Map<number, LocalLoad[]>): Sketch {
  const sk = sketchOf(pm);
  sk.spanLoads = [];
  sk.forces = [];
  sk.couples = [];
  for (const id of pm.memberOrder) {
    const m = pm.members.get(id)!;
    const ni = pm.nodes.get(m.i)!;
    for (const l of loadsBy.get(id) ?? []) {
      if (l.kind === 'dist') { sk.spanLoads.push({ member: id, a: l.a, b: l.b, wa: l.wa, wb: l.wb }); continue; }
      const x = ni.x + m.c * l.a, z = ni.z + m.s * l.a;
      if (l.kind === 'P') sk.forces.push({ x, z, fx: l.v * m.s, fz: -l.v * m.c, label: numText(Math.abs(l.v)), color: 'load' });
      else if (l.kind === 'H') sk.forces.push({ x, z, fx: l.v * m.c, fz: l.v * m.s, label: numText(Math.abs(l.v)), color: 'load' });
      else sk.couples.push({ x, z, m: l.v, label: numText(Math.abs(l.v)), color: 'moment' });
    }
  }
  for (const l of pm.nodalLoads) {
    const n = pm.nodes.get(l.node);
    if (!n) continue;
    if (Math.abs(l.fx) > 1e-12) sk.forces.push({ x: n.x, z: n.z, fx: l.fx, fz: 0, label: numText(Math.abs(l.fx)), color: 'load' });
    if (Math.abs(l.fz) > 1e-12) sk.forces.push({ x: n.x, z: n.z, fx: 0, fz: l.fz, label: numText(Math.abs(l.fz)), color: 'load' });
    if (Math.abs(l.my) > 1e-12) sk.couples.push({ x: n.x, z: n.z, m: l.my, label: numText(Math.abs(l.my)), color: 'moment' });
  }
  return sk;
}

/**
 * The positive internal forces on the two faces of a cut, drawn in the
 * member's axes (x to the right): on the piece left of the section N points
 * away, V down, M counter-clockwise; on the piece right of it, the opposite.
 */
function triadSketch(): Sketch {
  const g = 0.55, a = 2, b = a + g, L = b + 2;
  const off = 0.4; // about 40 px at this width: the tension arrows sit clear of the faces
  return {
    nodes: [{ id: 1, x: 0, z: 0, label: 'I' }, { id: 2, x: a, z: 0 }, { id: 3, x: b, z: 0 }, { id: 4, x: L, z: 0, label: 'J' }],
    members: [{ id: 1, i: 1, j: 2 }, { id: 2, i: 3, j: 4 }],
    forces: [
      { x: a + off, z: 0, fx: 1, fz: 0, label: 'N', color: 'unknown' },
      { x: a, z: 0, fx: 0, fz: -1, label: 'V', color: 'unknown' },
      { x: b - off, z: 0, fx: -1, fz: 0, label: 'N', color: 'unknown' },
      { x: b, z: 0, fx: 0, fz: 1, label: 'V', color: 'unknown' },
    ],
    couples: [
      { x: a, z: 0, m: 1, label: 'M', color: 'unknown' },
      { x: b, z: 0, m: -1, label: 'M', color: 'unknown' },
    ],
    labels: [{ x: (a + b) / 2, z: 0, text: 'x', anchor: 'n' }],
    height: 170,
  };
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

// ─── Applicability ────────────────────────────────────────────────

function applies(ctx: MethodContext) {
  const { pm, input, ref } = ctx;
  if (pm.members.size === 0) return { ok: false as const, reason: tx('steps.req.noMembers') };
  if (pm.members.size > CUTS_MAX_MEMBERS) return { ok: false as const, reason: tx('steps.cuts.req.tooMany', { n: pm.members.size, max: CUTS_MAX_MEMBERS }) };
  for (const id of pm.memberOrder) {
    const m = pm.members.get(id)!;
    if (m.truss) return { ok: false as const, reason: tx('steps.cuts.req.truss', { m: m.name }) };
  }
  if (hasSpecialSupports(pm)) return { ok: false as const, reason: tx('steps.req.special') };
  for (const s of pm.supports.values()) {
    if (!['fixed', 'pinned', 'rollerX', 'rollerZ'].includes(s.type)) return { ok: false as const, reason: tx('steps.req.special') };
  }
  // A support with its own list of held components is not what the plane model reads from its type.
  for (const s of input.supports.values()) if ((s as { restrainedDofs?: unknown }).restrainedDofs) return { ok: false as const, reason: tx('steps.req.special') };
  if ((input.constraints?.length ?? 0) > 0 || (input.connectors?.size ?? 0) > 0) return { ok: false as const, reason: tx('steps.cuts.req.connectors') };
  if (hasThermal(pm)) return { ok: false as const, reason: tx('steps.req.thermal') };
  if (!ref) return { ok: false as const, reason: tx('steps.req.unstable') };
  if (computeStaticDegree(input).degree < 0) return { ok: false as const, reason: tx('steps.req.unstable') };
  return { ok: true as const };
}

// ─── The document ─────────────────────────────────────────────────

interface Built {
  doc: StepDoc;
  /** What the method found, for the tests. */
  reactions: Map<number, { rx: number; rz: number; my: number }>;
  reactionsFromStatics: boolean;
  cuts: Map<number, MemberCut>;
}

export function buildCuts(ctx: MethodContext): Built {
  const { pm, input } = ctx;
  const ref = ctx.ref as Reference;
  const loadsBy = new Map(pm.memberOrder.map((id) => [id, localLoads(pm, pm.members.get(id)!)]));
  const nameOf = (n: number) => pm.nodes.get(n)!.name;
  const tree = isTree(pm);

  // Scales, so rounding noise prints as 0.
  let Fs = 0, Lmax = 0;
  for (const m of pm.members.values()) Lmax = Math.max(Lmax, m.L);
  for (const r of ref.reactions.values()) Fs = Math.max(Fs, Math.abs(r.rx), Math.abs(r.rz), Math.abs(r.my) / Math.max(1, Lmax));
  for (const l of pm.nodalLoads) Fs = Math.max(Fs, Math.abs(l.fx), Math.abs(l.fz));
  for (const ls of loadsBy.values()) for (const l of ls) Fs = Math.max(Fs, l.kind === 'dist' ? Math.max(Math.abs(l.wa), Math.abs(l.wb)) * Math.max(1, Lmax) : Math.abs(l.v));
  Fs = Math.max(Fs, 1e-9);
  const Ms = Fs * Math.max(1, Lmax);
  const snapF = (v: number) => (Math.abs(v) < 1e-9 * Fs ? 0 : v);
  const snapM = (v: number) => (Math.abs(v) < 1e-9 * Ms ? 0 : v);
  const nF = (v: number) => num(snapF(v));
  const nM = (v: number) => num(snapM(v));
  const pF = (v: number) => par(snapF(v));
  const pM = (v: number) => par(snapM(v));

  const intro: Block[] = [];
  const steps: Step[] = [];

  // ── Introduction ──
  intro.push({ kind: 'p', text: tx('steps.cuts.intro.what') });
  intro.push({ kind: 'p', text: tx('steps.cuts.intro.why'), detail: true });
  intro.push({ kind: 'p', text: tx('steps.cuts.intro.axes') });
  intro.push({ kind: 'p', text: tx('steps.cuts.intro.signs') });
  intro.push({ kind: 'fig', sketch: triadSketch(), caption: tx('steps.cuts.intro.triadCaption') });
  intro.push({ kind: 'p', text: tx('steps.cuts.intro.loads') });
  intro.push({ kind: 'fig', sketch: { ...structureSketch(pm, loadsBy), dims: 'auto' }, caption: tx('steps.common.structureCaption') });
  intro.push({
    kind: 'table',
    head: [tx('steps.common.member'), 'I', 'J', { tex: `L\\ [${UL}]` }, { tex: '\\cos\\alpha' }, { tex: '\\sin\\alpha' }],
    rows: pm.memberOrder.map((id) => { const m = pm.members.get(id)!; return [m.name, nameOf(m.i), nameOf(m.j), m.L, Math.abs(m.c) < 1e-12 ? 0 : m.c, Math.abs(m.s) < 1e-12 ? 0 : m.s]; }),
    caption: tx('steps.cuts.intro.membersCaption'),
  });
  intro.push({ kind: 'p', text: tx('steps.common.units') });

  // ── Step 1: classification ──
  const sd = computeStaticDegree(input);
  const nMembers = pm.members.size, nNodes = input.nodes.size;
  let r = 0;
  for (const s of pm.supports.values()) r += (s.ux ? 1 : 0) + (s.uz ? 1 : 0) + (s.ry ? 1 : 0);
  const c = [...sd.nodeConditions.values()].reduce((a, b) => a + b, 0);
  const gh = sd.degree;
  {
    const blocks: Block[] = [
      { kind: 'p', text: tx('steps.cuts.class.count', { m: nMembers, n: nNodes, r, c }) },
      { kind: 'calc', formula: 'GH = 3m + r - 3n - c', subst: `GH = 3 \\cdot ${nMembers} + ${r} - 3 \\cdot ${nNodes} - ${c}`, result: `\\boxed{GH = ${gh}}` },
    ];
    if (c > 0) {
      blocks.push({ kind: 'p', text: tx('steps.cuts.class.hinges'), detail: true });
      blocks.push({
        kind: 'table',
        head: [tx('steps.common.node'), tx('steps.cuts.class.kCol'), tx('steps.cuts.class.jCol'), { tex: 'c_i' }],
        rows: [...sd.nodeConditions.entries()].sort((a, b) => a[0] - b[0]).map(([n, ci]) => {
          let k = 0, j = 0;
          for (const m of pm.members.values()) {
            if (m.i === n) { k++; if (m.hingeI) j++; }
            if (m.j === n) { k++; if (m.hingeJ) j++; }
          }
          return [nameOf(n), k, j, ci];
        }),
      });
    }
    blocks.push({ kind: 'note', tone: gh === 0 ? 'ok' : 'info', text: gh === 0 ? tx('steps.cuts.class.determinate') : tx('steps.cuts.class.indeterminate', { g: gh }) });
    steps.push({ title: tx('steps.common.classification'), blocks });
  }

  // ── Step 2: reactions ──
  const unknowns = unknownsOf(pm);
  let solved: number[] | null = null;
  const reacBlocks: Block[] = [];
  const allNodes = new Set(pm.nodeOrder);
  const allMembers = new Set(pm.memberOrder);
  const loadActs = partLoads(pm, { nodes: allNodes, members: allMembers }, loadsBy);
  // The support with the most unknown forces is the moment centre: its forces drop out.
  const supportIds = pm.nodeOrder.filter((n) => pm.supports.has(n));
  const forceCount = (n: number) => { const s = pm.supports.get(n)!; return (s.ux ? 1 : 0) + (s.uz ? 1 : 0); };
  const O = [...supportIds].sort((a, b) => forceCount(b) - forceCount(a))[0];
  const oNode = pm.nodes.get(O)!;

  interface LinEq { label: Txt; name: Tex; coef: number[]; c: number; subst: Tex }
  const unkPos = (u: Unknown) => pm.nodes.get(u.node)!;
  /** Σ about (x0, z0) of a part's unknown reactions and loads. */
  const momentEq = (label: Txt, name: Tex, x0: number, z0: number, nodes: Set<number>, acts: Act[]): LinEq => {
    const coef = unknowns.map((u) => {
      if (!nodes.has(u.node)) return 0;
      const p = unkPos(u);
      return u.comp === 'x' ? -(p.z - z0) : u.comp === 'z' ? p.x - x0 : 1;
    });
    const cst = acts.reduce((s, a) => s + momentAbout(a, x0, z0), 0);
    const rt = unknowns.map((u, k) => (Math.abs(coef[k]) < 1e-12 ? '' : `${coef[k] < 0 ? '-' : '+'} ${Math.abs(Math.abs(coef[k]) - 1) < 1e-12 ? '' : `${num(Math.abs(coef[k]))}\\,`}${u.tex}`)).filter(Boolean);
    const lt = acts.flatMap((a) => momentTerms(a, x0, z0));
    return { label, name, coef, c: cst, subst: wrapA(`${joinTerms([...rt, ...lt], 8)} = 0`) };
  };
  const forceEq = (dir: 'x' | 'z'): LinEq => {
    const coef = unknowns.map((u) => (u.comp === dir ? 1 : 0));
    const vals = loadActs.map((a) => (dir === 'x' ? a.fx : a.fz)).filter((v) => Math.abs(v) > 1e-12);
    const rt = unknowns.filter((u) => u.comp === dir).map((u) => `+ ${u.tex}`);
    return {
      label: tx(dir === 'x' ? 'steps.cuts.reac.eqFx' : 'steps.cuts.reac.eqFz'), name: dir === 'x' ? '\\sum F_X = 0' : '\\sum F_Z = 0',
      coef, c: vals.reduce((s, v) => s + v, 0), subst: wrapA(`${joinTerms([...rt, ...vals.map((v) => `+ ${par(v)}`)], 10)} = 0`),
    };
  };
  const linTex = (coef: number[], cst: number) => {
    const t = unknowns.map((u, k) => (Math.abs(coef[k]) < 1e-12 ? '' : `${coef[k] < 0 ? '-' : '+'} ${Math.abs(Math.abs(coef[k]) - 1) < 1e-12 ? '' : `${num(Math.abs(coef[k]))}\\,`}${u.tex}`)).filter(Boolean);
    if (Math.abs(cst) > 1e-12 * Ms || t.length === 0) t.push(`${cst < 0 ? '-' : '+'} ${num(Math.abs(cst))}`);
    return `${joinTerms(t)} = 0`;
  };
  const unitOf = (u: Unknown) => (u.comp === 'm' ? UM : UF);

  let reacMode: 'statics' | 'indeterminate' | 'loop' = gh > 0 ? 'indeterminate' : 'statics';
  if (reacMode === 'statics') {
    const eqs: LinEq[] = [forceEq('x'), forceEq('z'),
      momentEq(tx('steps.cuts.reac.eqM', { n: oNode.name }), `\\sum M_{${nm(oNode.name)}} = 0`, oNode.x, oNode.z, allNodes, loadActs)];
    // One equation per internal hinge condition: M = 0 at the hinge, from the part on one side.
    for (const [n, ci] of [...sd.nodeConditions.entries()].sort((a, b) => a[0] - b[0])) {
      const ends = pm.memberOrder.map((id) => pm.members.get(id)!).filter((m) => (m.i === n && m.hingeI) || (m.j === n && m.hingeJ)).slice(0, ci);
      const hn = pm.nodes.get(n)!;
      for (const m of ends) {
        const far = m.i === n ? m.j : m.i;
        const beyond = component(pm, far, m.id);
        // Inside a closed ring the cut does not split the structure: that condition is internal to the ring.
        if (beyond.has(n)) continue;
        const sideA: Part = { nodes: beyond, members: new Set([m.id, ...pm.memberOrder.filter((id) => { const mm = pm.members.get(id)!; return id !== m.id && beyond.has(mm.i) && beyond.has(mm.j); })]) };
        const near = component(pm, n, m.id);
        const sideB: Part = { nodes: near, members: new Set(pm.memberOrder.filter((id) => { const mm = pm.members.get(id)!; return id !== m.id && near.has(mm.i) && near.has(mm.j); })) };
        const unk = (p: Part) => unknowns.filter((u) => p.nodes.has(u.node)).length;
        const side = unk(sideB) < unk(sideA) ? sideB : sideA;
        const bars = pm.memberOrder.filter((q) => side.members.has(q)).map((q) => pm.members.get(q)!.name);
        const label = bars.length ? tx('steps.cuts.reac.eqHinge', { n: hn.name, m: m.name, list: bars.join(', ') }) : tx('steps.cuts.reac.eqHingeNode', { n: hn.name, m: m.name });
        eqs.push(momentEq(label, `M_{${nm(hn.name)}} = 0`, hn.x, hn.z, side.nodes, partLoads(pm, side, loadsBy)));
      }
    }
    if (eqs.length !== unknowns.length) reacMode = 'loop';
    else {
      solved = solveLinear(eqs.map((e) => e.coef), eqs.map((e) => -e.c));
      if (!solved) reacMode = 'loop';
    }
    if (solved) {
      const sol = solved;
      reacBlocks.push({ kind: 'p', text: tx(eqs.length > 3 ? 'steps.cuts.reac.determinateHinges' : 'steps.cuts.reac.determinate', { r: unknowns.length, c: eqs.length - 3 }) });
      const unkSk = structureSketch(pm, loadsBy);
      for (const u of unknowns) {
        const p = unkPos(u);
        if (u.comp === 'm') unkSk.couples!.push({ x: p.x, z: p.z, m: 1, label: u.text, color: 'unknown', dashed: true });
        else unkSk.forces!.push({ x: p.x, z: p.z, fx: u.comp === 'x' ? 1 : 0, fz: u.comp === 'z' ? 1 : 0, label: u.text, color: 'unknown', dashed: true });
      }
      reacBlocks.push({ kind: 'fig', sketch: unkSk, caption: tx('steps.cuts.reac.unknownsCaption') });
      reacBlocks.push(...loadTable(pm, loadsBy));
      reacBlocks.push({ kind: 'p', text: tx('steps.cuts.reac.eqIntro') });
      eqs.forEach((e, k) => {
        reacBlocks.push({ kind: 'calc', label: e.label, formula: `(${k + 1})\\quad ${e.name}`, subst: e.subst, result: linTex(e.coef, e.c) });
      });
      // Solve one unknown at a time while an equation has only one left; the rest together.
      const known = new Map<number, number>();
      const used = new Set<number>();
      const solveBlocks: Block[] = [];
      for (;;) {
        const k = eqs.findIndex((e, q) => !used.has(q) && e.coef.filter((v, u) => Math.abs(v) > 1e-12 && !known.has(u)).length === 1);
        if (k < 0) break;
        used.add(k);
        const e = eqs[k];
        const u = e.coef.findIndex((v, q) => Math.abs(v) > 1e-12 && !known.has(q));
        const cst = e.c + e.coef.reduce((s, v, q) => s + (known.has(q) ? v * known.get(q)! : 0), 0);
        const coef = e.coef.map((v, q) => (q === u ? v : 0));
        const val = -cst / e.coef[u];
        known.set(u, val);
        const withKnown = e.coef.some((v, q) => q !== u && Math.abs(v) > 1e-12);
        solveBlocks.push({
          kind: 'calc', label: tx(withKnown ? 'steps.cuts.reac.fromEqKnown' : 'steps.cuts.reac.fromEq', { k: k + 1 }),
          formula: linTex(coef, cst), result: `\\boxed{${unknowns[u].tex} = ${num(val)}\\ ${unitOf(unknowns[u])}}`,
        });
      }
      if (known.size < unknowns.length) {
        const rest = eqs.map((_, q) => q).filter((q) => !used.has(q));
        const lines = rest.map((q) => {
          const e = eqs[q];
          const cst = e.c + e.coef.reduce((s, v, u) => s + (known.has(u) ? v * known.get(u)! : 0), 0);
          return linTex(e.coef.map((v, u) => (known.has(u) ? 0 : v)), cst);
        });
        const free = unknowns.map((_, u) => u).filter((u) => !known.has(u));
        solveBlocks.push({ kind: 'p', text: tx('steps.cuts.reac.coupled', { n: free.length }) });
        solveBlocks.push({
          kind: 'calc', formula: `\\begin{cases} ${lines.join(' \\\\ ')} \\end{cases}`,
          result: free.map((u) => `\\boxed{${unknowns[u].tex} = ${num(sol[u])}\\ ${unitOf(unknowns[u])}}`).join(',\\quad '),
        });
        for (const u of free) known.set(u, sol[u]);
      }
      // A check: the moment about another point, with every reaction in.
      const other = supportIds.find((n) => n !== O) ?? pm.nodeOrder.reduce((best, n) => {
        const p = pm.nodes.get(n)!, b = pm.nodes.get(best)!;
        return Math.hypot(p.x - oNode.x, p.z - oNode.z) > Math.hypot(b.x - oNode.x, b.z - oNode.z) ? n : best;
      }, O);
      if (other !== O) {
        const on = pm.nodes.get(other)!;
        const acts = [...loadActs, ...unknowns.map((u, q): Act => {
          const p = unkPos(u); const v = known.get(q)!;
          return { x: p.x, z: p.z, fx: u.comp === 'x' ? v : 0, fz: u.comp === 'z' ? v : 0, m: u.comp === 'm' ? v : 0 };
        })];
        const total = acts.reduce((s, a) => s + momentAbout(a, on.x, on.z), 0);
        solveBlocks.push({
          kind: 'calc', label: tx('steps.cuts.reac.check', { n: on.name }), formula: `\\sum M_{${nm(on.name)}} = 0`,
          subst: wrapA(joinTerms(acts.flatMap((a) => momentTerms(a, on.x, on.z)), 8)), result: `\\sum M_{${nm(on.name)}} = ${nM(total)}`, check: `${nM(total)} = 0\\ \\checkmark`,
        });
      }
      reacBlocks.push({ kind: 'sub', title: tx('steps.cuts.reac.solve'), blocks: solveBlocks });
    }
  }

  const reactions = new Map<number, { rx: number; rz: number; my: number }>();
  if (solved) {
    for (const n of supportIds) reactions.set(n, { rx: 0, rz: 0, my: 0 });
    unknowns.forEach((u, q) => { const rr = reactions.get(u.node)!; if (u.comp === 'x') rr.rx = solved![q]; else if (u.comp === 'z') rr.rz = solved![q]; else rr.my = solved![q]; });
  } else {
    for (const n of supportIds) { const rr = ref.reactions.get(n) ?? { rx: 0, rz: 0, my: 0 }; reactions.set(n, { rx: rr.rx, rz: rr.rz, my: rr.my }); }
    reacBlocks.push({ kind: 'p', text: reacMode === 'indeterminate' ? tx('steps.cuts.reac.indeterminate', { g: gh }) : tx('steps.cuts.reac.loop') });
    reacBlocks.push({ kind: 'p', text: tx('steps.cuts.reac.pointer'), detail: true });
    reacBlocks.push(...loadTable(pm, loadsBy));
  }
  reacBlocks.push({
    kind: 'table',
    head: [tx('steps.common.support'), { tex: `R_x\\ [${UF}]` }, { tex: `R_z\\ [${UF}]` }, { tex: `M\\ [${UM}]` }],
    rows: supportIds.map((n) => { const s = pm.supports.get(n)!; const rr = reactions.get(n)!; return [nameOf(n), s.ux ? snapF(rr.rx) : '—', s.uz ? snapF(rr.rz) : '—', s.ry ? snapM(rr.my) : '—']; }),
    caption: tx(solved ? 'steps.cuts.reac.tableCaption' : 'steps.cuts.reac.tableCaptionRef'),
  });
  if (!solved) {
    // The matrix reactions still have to balance the loads: shown as a check.
    const acts = [...loadActs, ...supportIds.map((n): Act => { const p = pm.nodes.get(n)!; const rr = reactions.get(n)!; return { x: p.x, z: p.z, fx: rr.rx, fz: rr.rz, m: rr.my }; })];
    const sx = acts.reduce((s, a) => s + a.fx, 0), sz = acts.reduce((s, a) => s + a.fz, 0), sm = acts.reduce((s, a) => s + momentAbout(a, oNode.x, oNode.z), 0);
    reacBlocks.push({
      kind: 'calc', label: tx('steps.cuts.reac.globalCheck', { n: oNode.name }),
      formula: `\\sum F_X = 0,\\quad \\sum F_Z = 0,\\quad \\sum M_{${nm(oNode.name)}} = 0`,
      subst: `\\begin{aligned} \\textstyle\\sum F_X &= ${joinTerms(acts.filter((a) => Math.abs(a.fx) > 1e-12).map((a) => `+ ${par(a.fx)}`), 10)} \\\\ \\textstyle\\sum F_Z &= ${joinTerms(acts.filter((a) => Math.abs(a.fz) > 1e-12).map((a) => `+ ${par(a.fz)}`), 10)} \\\\ \\textstyle\\sum M_{${nm(oNode.name)}} &= ${joinTerms(acts.flatMap((a) => momentTerms(a, oNode.x, oNode.z)), 6)} \\end{aligned}`,
      result: `\\sum F_X = ${nF(sx)},\\quad \\sum F_Z = ${nF(sz)},\\quad \\sum M_{${nm(oNode.name)}} = ${nM(sm)}`,
      check: '0 = 0\\ \\checkmark',
    });
  }
  steps.push({ title: tx('steps.common.reactions'), blocks: reacBlocks });

  // ── Step 3: member end forces at I ──
  const endBlocks: Block[] = [];
  const ends = new Map<number, { Ni: number; Vi: number; Mi: number }>();
  const reactionAct = (n: number): Act | null => {
    const rr = reactions.get(n);
    if (!rr) return null;
    const p = pm.nodes.get(n)!;
    return { x: p.x, z: p.z, fx: rr.rx, fz: rr.rz, m: rr.my };
  };
  if (tree) {
    endBlocks.push({ kind: 'p', text: tx('steps.cuts.end.intro') });
    endBlocks.push({ kind: 'p', text: tx('steps.cuts.end.why'), detail: true });
    for (const id of pm.memberOrder) {
      const m = pm.members.get(id)!;
      const ni = pm.nodes.get(m.i)!;
      const sI = component(pm, m.i, m.id), sJ = component(pm, m.j, m.id);
      const inner = (s: Set<number>) => new Set(pm.memberOrder.filter((q) => q !== m.id && s.has(pm.members.get(q)!.i) && s.has(pm.members.get(q)!.j)));
      const partI: Part = { nodes: sI, members: inner(sI) };
      const partJ: Part = { nodes: sJ, members: new Set([m.id, ...inner(sJ)]) };
      const actsOf = (p: Part) => [...partLoads(pm, p, loadsBy), ...[...p.nodes].map(reactionAct).filter((a): a is Act => a !== null)];
      const aI = actsOf(partI), aJ = actsOf(partJ);
      const useI = aI.length <= aJ.length;
      const acts = useI ? aI : aJ;
      const FX = acts.reduce((s, a) => s + a.fx, 0), FZ = acts.reduce((s, a) => s + a.fz, 0), MI = acts.reduce((s, a) => s + momentAbout(a, ni.x, ni.z), 0);
      const fxl = m.c * FX + m.s * FZ, fyl = -m.s * FX + m.c * FZ;
      const Ni = useI ? -fxl : fxl, Vi = useI ? fyl : -fyl, Mi = useI ? -MI : MI;
      ends.set(id, { Ni, Vi, Mi });
      const list = [...(useI ? sI : sJ)].sort((a, b) => a - b).map(nameOf).join(', ');
      const I = nm(ni.name);
      const fxT = acts.filter((a) => Math.abs(a.fx) > 1e-12).map((a) => `+ ${pF(a.fx)}`);
      const fzT = acts.filter((a) => Math.abs(a.fz) > 1e-12).map((a) => `+ ${pF(a.fz)}`);
      const mT = acts.flatMap((a) => momentTerms(a, ni.x, ni.z));
      const blocks: Block[] = [
        { kind: 'p', text: tx(useI ? 'steps.cuts.end.partI' : 'steps.cuts.end.partJ', { m: m.name, i: ni.name, j: nameOf(m.j), list }) },
        {
          kind: 'calc', label: tx('steps.cuts.end.resultant', { i: ni.name }),
          formula: `F_X = \\sum F_{X},\\quad F_Z = \\sum F_{Z},\\quad M_{${I}} = \\sum \\big[(x - x_{${I}})\\,F_Z - (z - z_{${I}})\\,F_X\\big] + \\sum C`,
          subst: `\\begin{aligned} F_X &= ${joinTerms(fxT, 8)} \\\\ F_Z &= ${joinTerms(fzT, 8)} \\\\ M_{${I}} &= ${joinTerms(mT, 6)} \\end{aligned}`,
          result: `F_X = ${nF(FX)}\\ ${UF},\\quad F_Z = ${nF(FZ)}\\ ${UF},\\quad M_{${I}} = ${nM(MI)}\\ ${UM}`,
        },
        {
          kind: 'calc', label: tx('steps.cuts.end.local'),
          formula: useI
            ? `N_i = -(F_X\\cos\\alpha + F_Z\\sin\\alpha),\\quad V_i = -F_X\\sin\\alpha + F_Z\\cos\\alpha,\\quad M_i = -M_{${I}}`
            : `N_i = F_X\\cos\\alpha + F_Z\\sin\\alpha,\\quad V_i = F_X\\sin\\alpha - F_Z\\cos\\alpha,\\quad M_i = M_{${I}}`,
          subst: useI
            ? `N_i = -\\big(${pF(FX)}\\cdot${par(m.c)} + ${pF(FZ)}\\cdot${par(m.s)}\\big),\\quad V_i = -${pF(FX)}\\cdot${par(m.s)} + ${pF(FZ)}\\cdot${par(m.c)},\\quad M_i = -${pM(MI)}`
            : `N_i = ${pF(FX)}\\cdot${par(m.c)} + ${pF(FZ)}\\cdot${par(m.s)},\\quad V_i = ${pF(FX)}\\cdot${par(m.s)} - ${pF(FZ)}\\cdot${par(m.c)},\\quad M_i = ${pM(MI)}`,
          result: `\\boxed{N_i = ${nF(Ni)}\\ ${UF}},\\quad \\boxed{V_i = ${nF(Vi)}\\ ${UF}},\\quad \\boxed{M_i = ${nM(Mi)}\\ ${UM}}`,
        },
      ];
      endBlocks.push({ kind: 'sub', title: tx('steps.cuts.member', { m: m.name }), blocks });
    }
  } else {
    endBlocks.push({ kind: 'p', text: tx('steps.cuts.end.fromRef') });
    for (const id of pm.memberOrder) {
      const sh = ref.endShears.get(id), mo = ref.endMoments.get(id);
      ends.set(id, { Ni: ref.axial.get(id) ?? 0, Vi: sh?.Vi ?? 0, Mi: -(mo?.Mi ?? 0) });
    }
  }
  endBlocks.push({
    kind: 'table',
    head: [tx('steps.common.member'), { tex: `N_i\\ [${UF}]` }, { tex: `V_i\\ [${UF}]` }, { tex: `M_i\\ [${UM}]` }],
    rows: pm.memberOrder.map((id) => { const e = ends.get(id)!; return [pm.members.get(id)!.name, snapF(e.Ni), snapF(e.Vi), snapM(e.Mi)]; }),
    caption: tx('steps.cuts.end.tableCaption'),
  });

  // Every member's segments.
  const cuts = new Map<number, MemberCut>();
  for (const id of pm.memberOrder) {
    const e = ends.get(id)!;
    cuts.set(id, cutMember(pm.members.get(id)!, loadsBy.get(id)!, e.Ni, e.Vi, e.Mi));
  }

  // Joint equilibrium: members' end forces on each joint, loads and reactions add up to zero.
  {
    const rows: Cell[][] = [];
    for (const n of pm.nodeOrder) {
      const p = pm.nodes.get(n)!;
      let fx = 0, fz = 0, mm = 0, k = 0;
      for (const id of pm.memberOrder) {
        const m = pm.members.get(id)!;
        if (m.i !== n && m.j !== n) continue;
        k++;
        const cu = cuts.get(id)!;
        // What the joint applies to the member at I, global.
        const gI = { fx: -cu.Ni * m.c - cu.Vi * m.s, fz: -cu.Ni * m.s + cu.Vi * m.c, m: -cu.Mi };
        const ni = pm.nodes.get(m.i)!, nj = pm.nodes.get(m.j)!;
        let g = gI;
        if (m.j === n) {
          // At J, from the member's own equilibrium: minus the I end and every load on it.
          const acts = [{ x: ni.x, z: ni.z, ...gI }, ...cu.loads.map((l) => actOf(pm, m, l))];
          g = { fx: -acts.reduce((s, a) => s + a.fx, 0), fz: -acts.reduce((s, a) => s + a.fz, 0), m: -acts.reduce((s, a) => s + momentAbout(a, nj.x, nj.z), 0) };
        }
        // The member pushes on the joint with the opposite of what the joint applies to it.
        fx -= g.fx; fz -= g.fz; mm -= g.m;
      }
      const nl = pm.nodalLoads.filter((l) => l.node === n);
      for (const l of nl) { fx += l.fx; fz += l.fz; mm += l.my; }
      const rr = reactions.get(n);
      if (rr) { fx += rr.rx; fz += rr.rz; mm += rr.my; }
      if (k === 0) continue;
      rows.push([p.name, k, { tex: nF(fx) }, { tex: nF(fz) }, { tex: nM(mm) }]);
    }
    endBlocks.push({ kind: 'p', text: tx(tree ? 'steps.cuts.joint.check' : 'steps.cuts.joint.checkRef') });
    endBlocks.push({
      kind: 'table',
      head: [tx('steps.common.joint'), tx('steps.cuts.joint.members'), { tex: `\\sum F_X\\ [${UF}]` }, { tex: `\\sum F_Z\\ [${UF}]` }, { tex: `\\sum M\\ [${UM}]` }],
      rows, caption: tx('steps.cuts.joint.caption'),
    });
  }
  steps.push({ title: tx('steps.cuts.end.title'), blocks: endBlocks });

  // ── Step 4: N, V, M by segment ──
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
  steps.push({ title: tx('steps.cuts.seg.stepTitle'), blocks: segBlocks });

  // ── Step 5: the values and the comparison ──
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
  steps.push({
    title: tx('steps.cuts.tab.title'),
    blocks: [
      { kind: 'table', head: [tx('steps.common.member'), { tex: `x\\ [${UL}]` }, { tex: `N\\ [${UF}]` }, { tex: `V\\ [${UF}]` }, { tex: `M\\ [${UM}]` }, tx('steps.cuts.tab.where')], rows: tableRows, caption: tx('steps.cuts.tab.caption') },
      { kind: 'p', text: tx(solved && tree ? 'steps.cuts.tab.compareStatics' : 'steps.cuts.tab.compareRef') },
      { kind: 'compare', rows: cmp, caption: tx('steps.common.compare') },
      { kind: 'p', text: tx('steps.common.compareNote'), detail: true },
    ],
  });

  // ── Step 6: diagrams ──
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
  steps.push({
    title: tx('steps.common.diagrams'),
    blocks: [
      { kind: 'p', text: tx('steps.cuts.dia.intro') },
      { kind: 'fig', sketch: { ...base, diagram: { color: 'diagram', marks: true, unit: 'kN', members: sample('N') } }, caption: tx('steps.cuts.dia.N') },
      { kind: 'fig', sketch: { ...base, diagram: { color: 'diagram', marks: true, unit: 'kN', members: sample('V') } }, caption: tx('steps.cuts.dia.V') },
      { kind: 'fig', sketch: { ...base, diagram: { color: 'moment', marks: true, unit: 'kN·m', members: sample('M') } }, caption: tx('steps.cuts.dia.M') },
    ],
  });

  const doc: StepDoc = { method: 'cuts', title: tx('steps.m.cuts.title'), subtitle: tx(tree ? 'steps.cuts.subtitle' : 'steps.cuts.subtitleRing'), intro, steps };
  return { doc, reactions, reactionsFromStatics: !!solved, cuts };
}

const derivTex = (p: Poly): Poly => (p.length > 1 ? p.slice(1).map((c, k) => c * (k + 1)) : [0]);

/** The loads as resultants in global axes: what the equilibrium equations add up. */
function loadTable(pm: PlaneModel, loadsBy: Map<number, LocalLoad[]>): Block[] {
  const rows: Cell[][] = [];
  const clean = (v: number) => (Math.abs(v) < 1e-12 ? 0 : v);
  for (const l of pm.nodalLoads) {
    const n = pm.nodes.get(l.node);
    if (!n || (Math.abs(l.fx) < 1e-12 && Math.abs(l.fz) < 1e-12 && Math.abs(l.my) < 1e-12)) continue;
    rows.push([tx('steps.cuts.load.nodal', { n: n.name }), clean(n.x), clean(n.z), clean(l.fx), clean(l.fz), clean(l.my)]);
  }
  for (const id of pm.memberOrder) {
    const m = pm.members.get(id)!;
    for (const l of loadsBy.get(id) ?? []) {
      const a = actOf(pm, m, l);
      const key = l.kind === 'dist' ? 'steps.cuts.load.dist' : l.kind === 'C' ? 'steps.cuts.load.couple' : 'steps.cuts.load.point';
      rows.push([tx(key, { m: m.name, k: l.k }), clean(a.x), clean(a.z), clean(a.fx), clean(a.fz), clean(a.m)]);
    }
  }
  if (rows.length === 0) return [{ kind: 'p', text: tx('steps.cuts.load.none') }];
  return [{
    kind: 'table',
    head: [tx('steps.common.loads'), { tex: `x\\ [${UL}]` }, { tex: `z\\ [${UL}]` }, { tex: `F_X\\ [${UF}]` }, { tex: `F_Z\\ [${UF}]` }, { tex: `C\\ [${UM}]` }],
    rows, caption: tx('steps.cuts.load.caption'),
  }];
}

export const methods: ExplainedMethod[] = [
  {
    id: 'cuts', group: 'deformation', example: 'portal-frame',
    applies,
    build: (ctx) => buildCuts(ctx).doc,
  },
];
