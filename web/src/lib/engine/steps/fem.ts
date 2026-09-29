/**
 * Fixed-end actions of a member under its own span loads, with the formula
 * each one comes from: the table the stiffness method, moment distribution
 * and slope-deflection all start from.
 *
 * Convention, the documents' own:
 * - A load w or P is positive towards the member's local −y, "downward" on a
 *   span traversed left to right (w = −q of the plane model).
 * - End moments are counter-clockwise positive, on the member.
 * - End shears are the forces the fixed ends apply to the member along +y,
 *   positive holding it up.
 *
 * The numbers are computed the same way for every load, by integrating the
 * point-load solution over the load (exact for the polynomial loads here), so
 * a displayed classical formula (wL²/12, Pab²/L²) is checked against the same
 * integral in the tests rather than trusted.
 */
import type { Block, Tex, Txt } from './doc';
import { tx } from './doc';
import { num, par } from './format';
import type { PMember, PMemberLoad } from './plane-model';

export type FemKind = 'uniform' | 'triangularUp' | 'triangularDown' | 'partial' | 'point' | 'couple';

export interface FemTerm {
  kind: FemKind;
  /** What the load is, in words. */
  label: Txt;
  Mi: number; Mj: number; Vi: number; Vj: number;
  /** The transverse resultant, positive towards −y (for the check). */
  resultant: number;
  formula: { M: Tex; V: Tex };
  subst: { M: Tex; V: Tex };
}

export interface FixedEnd { terms: FemTerm[]; Mi: number; Mj: number; Vi: number; Vj: number; resultant: number }

const G5 = [
  [-0.9061798459386640, 0.2369268850561891], [-0.5384693101056831, 0.4786286704993665],
  [0, 0.5688888888888889], [0.5384693101056831, 0.4786286704993665], [0.9061798459386640, 0.2369268850561891],
] as const;

/** ∫_a^b f, exact for polynomials up to degree 9. */
function integrate(a: number, b: number, f: (x: number) => number): number {
  const h = (b - a) / 2, c = (a + b) / 2;
  let s = 0;
  for (const [x, w] of G5) s += w * f(c + h * x);
  return s * h;
}

/** A load P (towards −y) at x on a fixed–fixed span of length L. */
function pointKernel(L: number, x: number) {
  const a = x, b = L - x;
  return {
    Mi: (a * b * b) / (L * L),
    Mj: -(a * a * b) / (L * L),
    Vi: (b * b * (3 * a + b)) / L ** 3,
    Vj: (a * a * (a + 3 * b)) / L ** 3,
  };
}

/** Fixed-end actions of a load distributed over [a, b], linear from wa to wb (towards −y). */
function distributed(L: number, a: number, b: number, wa: number, wb: number) {
  const w = (x: number) => (b > a ? wa + ((wb - wa) * (x - a)) / (b - a) : 0);
  const k = (f: 'Mi' | 'Mj' | 'Vi' | 'Vj') => integrate(a, b, (x) => w(x) * pointKernel(L, x)[f]);
  return { Mi: k('Mi'), Mj: k('Mj'), Vi: k('Vi'), Vj: k('Vj'), resultant: ((wa + wb) / 2) * (b - a) };
}

const unit = { M: '\\mathrm{kN\\,m}', V: '\\mathrm{kN}' };

/** The fixed-end actions of `loads` (all on member `m`), term by term. */
export function fixedEnd(m: PMember, loads: PMemberLoad[], names: { i: string; j: string }): FixedEnd {
  const L = m.L;
  const ij = `${names.i}${names.j}`, ji = `${names.j}${names.i}`;
  const FEM = (s: string) => `\\mathrm{FEM}_{${s}}`;
  const terms: FemTerm[] = [];

  for (const l of loads) {
    if (l.member !== m.id) continue;
    if (l.kind === 'dist') {
      const wa = -l.qa, wb = -l.qb;
      const full = Math.abs(l.a) < 1e-9 && Math.abs(l.b - L) < 1e-9;
      if (full && Math.abs(wa - wb) < 1e-9) {
        const r = distributed(L, 0, L, wa, wa);
        terms.push({
          kind: 'uniform', label: tx('steps.fem.uniform', { w: num(wa) }), ...r,
          formula: { M: `${FEM(ij)} = +\\frac{wL^2}{12}, \\qquad ${FEM(ji)} = -\\frac{wL^2}{12}`, V: `V_{${ij}} = V_{${ji}} = \\frac{wL}{2}` },
          subst: { M: `${FEM(ij)} = +\\frac{${par(wa)}(${num(L)})^2}{12}, \\qquad ${FEM(ji)} = -\\frac{${par(wa)}(${num(L)})^2}{12}`, V: `V_{${ij}} = V_{${ji}} = \\frac{${par(wa)}(${num(L)})}{2}` },
        });
        continue;
      }
      if (full && (Math.abs(wa) < 1e-9 || Math.abs(wb) < 1e-9)) {
        const up = Math.abs(wa) < 1e-9; // zero at I, peak at J
        const w0 = up ? wb : wa;
        const r = distributed(L, 0, L, wa, wb);
        const [mi, mj, vi, vj] = up ? ['30', '20', '3', '7'] : ['20', '30', '7', '3'];
        terms.push({
          kind: up ? 'triangularUp' : 'triangularDown', label: tx(up ? 'steps.fem.triangularUp' : 'steps.fem.triangularDown', { w: num(w0) }), ...r,
          formula: {
            M: `${FEM(ij)} = +\\frac{w_0L^2}{${mi}}, \\qquad ${FEM(ji)} = -\\frac{w_0L^2}{${mj}}`,
            V: `V_{${ij}} = \\frac{${vi}\\,w_0L}{20}, \\qquad V_{${ji}} = \\frac{${vj}\\,w_0L}{20}`,
          },
          subst: {
            M: `${FEM(ij)} = +\\frac{${par(w0)}(${num(L)})^2}{${mi}}, \\qquad ${FEM(ji)} = -\\frac{${par(w0)}(${num(L)})^2}{${mj}}`,
            V: `V_{${ij}} = \\frac{${vi}${par(w0)}(${num(L)})}{20}, \\qquad V_{${ji}} = \\frac{${vj}${par(w0)}(${num(L)})}{20}`,
          },
        });
        continue;
      }
      if (full) {
        // A trapezoid: a uniform part and a triangle over it, each by its own formula.
        const lo = Math.abs(wa) <= Math.abs(wb) ? wa : wb;
        terms.push(...fixedEnd(m, [{ ...l, qa: -lo, qb: -lo }], names).terms);
        terms.push(...fixedEnd(m, [{ ...l, qa: -(wa - lo), qb: -(wb - lo) }], names).terms);
        continue;
      }
      // Over part of the span: the point-load solution integrated over the load.
      const r = distributed(L, l.a, l.b, wa, wb);
      const wx = Math.abs(wa - wb) < 1e-9 ? num(wa) : `w(x)`;
      terms.push({
        kind: 'partial', label: tx('steps.fem.partial', { wa: num(wa), wb: num(wb), a: num(l.a), b: num(l.b) }), ...r,
        formula: {
          M: `${FEM(ij)} = \\int_{a}^{b} w(x)\\,\\frac{x\\,(L-x)^2}{L^2}\\,dx, \\qquad ${FEM(ji)} = -\\int_{a}^{b} w(x)\\,\\frac{x^2\\,(L-x)}{L^2}\\,dx`,
          V: `V_{${ij}} = \\int_{a}^{b} w(x)\\,\\frac{(L-x)^2(L+2x)}{L^3}\\,dx, \\qquad V_{${ji}} = \\int_{a}^{b} w(x)\\,\\frac{x^2(3L-2x)}{L^3}\\,dx`,
        },
        subst: {
          M: `${FEM(ij)} = \\int_{${num(l.a)}}^{${num(l.b)}} ${wx}\\,\\frac{x\\,(${num(L)}-x)^2}{${num(L)}^2}\\,dx, \\qquad ${FEM(ji)} = -\\int_{${num(l.a)}}^{${num(l.b)}} ${wx}\\,\\frac{x^2\\,(${num(L)}-x)}{${num(L)}^2}\\,dx`,
          V: `V_{${ij}} = \\int_{${num(l.a)}}^{${num(l.b)}} ${wx}\\,\\frac{(${num(L)}-x)^2(${num(L)}+2x)}{${num(L)}^3}\\,dx`,
        },
      });
      continue;
    }
    if (l.kind === 'point') {
      const a = l.a, b = L - a;
      if (Math.abs(l.p) > 1e-12) {
        const P = -l.p;
        const k = pointKernel(L, a);
        terms.push({
          kind: 'point', label: tx('steps.fem.point', { P: num(P), a: num(a) }),
          Mi: P * k.Mi, Mj: P * k.Mj, Vi: P * k.Vi, Vj: P * k.Vj, resultant: P,
          formula: {
            M: `${FEM(ij)} = +\\frac{P\\,a\\,b^2}{L^2}, \\qquad ${FEM(ji)} = -\\frac{P\\,a^2 b}{L^2}`,
            V: `V_{${ij}} = \\frac{P\\,b^2(3a+b)}{L^3}, \\qquad V_{${ji}} = \\frac{P\\,a^2(a+3b)}{L^3}`,
          },
          subst: {
            M: `${FEM(ij)} = +\\frac{${par(P)}(${num(a)})(${num(b)})^2}{(${num(L)})^2}, \\qquad ${FEM(ji)} = -\\frac{${par(P)}(${num(a)})^2(${num(b)})}{(${num(L)})^2}`,
            V: `V_{${ij}} = \\frac{${par(P)}(${num(b)})^2\\big(3(${num(a)})+${num(b)}\\big)}{(${num(L)})^3}, \\qquad V_{${ji}} = \\frac{${par(P)}(${num(a)})^2\\big(${num(a)}+3(${num(b)})\\big)}{(${num(L)})^3}`,
          },
        });
      }
      if (Math.abs(l.m) > 1e-12) {
        const M0 = l.m;
        const Mi = (M0 * b * (2 * a - b)) / (L * L);
        const Mj = (M0 * a * (2 * b - a)) / (L * L);
        const Vi = (6 * M0 * a * b) / L ** 3;
        terms.push({
          kind: 'couple', label: tx('steps.fem.couple', { M: num(M0), a: num(a) }),
          Mi, Mj, Vi, Vj: -Vi, resultant: 0,
          formula: {
            M: `${FEM(ij)} = \\frac{M_0\\,b\\,(2a-b)}{L^2}, \\qquad ${FEM(ji)} = \\frac{M_0\\,a\\,(2b-a)}{L^2}`,
            V: `V_{${ij}} = \\frac{6M_0\\,a\\,b}{L^3}, \\qquad V_{${ji}} = -V_{${ij}}`,
          },
          subst: {
            M: `${FEM(ij)} = \\frac{${par(M0)}(${num(b)})\\big(2(${num(a)})-${num(b)}\\big)}{(${num(L)})^2}, \\qquad ${FEM(ji)} = \\frac{${par(M0)}(${num(a)})\\big(2(${num(b)})-${num(a)}\\big)}{(${num(L)})^2}`,
            V: `V_{${ij}} = \\frac{6${par(M0)}(${num(a)})(${num(b)})}{(${num(L)})^3}`,
          },
        });
      }
    }
  }

  const sum = (f: 'Mi' | 'Mj' | 'Vi' | 'Vj' | 'resultant') => terms.reduce((s, t) => s + t[f], 0);
  return { terms, Mi: sum('Mi'), Mj: sum('Mj'), Vi: sum('Vi'), Vj: sum('Vj'), resultant: sum('resultant') };
}

/**
 * The fixed-end actions written out: per load, formula, substitution and
 * boxed result for the moments and (unless `shears: false`) the shears; the
 * superposition when there is more than one load; and the check that the two
 * shears carry the span's resultant.
 */
export function fixedEndBlocks(fe: FixedEnd, names: { i: string; j: string }, opts: { shears?: boolean } = {}): Block[] {
  const ij = `${names.i}${names.j}`, ji = `${names.j}${names.i}`;
  const FEM = (s: string) => `\\mathrm{FEM}_{${s}}`;
  const shears = opts.shears !== false;
  if (fe.terms.length === 0) return [{ kind: 'p', text: tx('steps.fem.none') }];
  const out: Block[] = [];
  const many = fe.terms.length > 1;
  fe.terms.forEach((t, k) => {
    const blocks: Block[] = [
      { kind: 'calc', label: tx('steps.fem.moments'), formula: t.formula.M, subst: t.subst.M,
        result: `\\boxed{${FEM(ij)}${many ? `^{(${k + 1})}` : ''} = ${num(t.Mi)}\\ ${unit.M}}, \\qquad \\boxed{${FEM(ji)}${many ? `^{(${k + 1})}` : ''} = ${num(t.Mj)}\\ ${unit.M}}` },
    ];
    if (shears) blocks.push({ kind: 'calc', label: tx('steps.fem.shears'), formula: t.formula.V, subst: t.subst.V,
      result: `\\boxed{V_{${ij}}${many ? `^{(${k + 1})}` : ''} = ${num(t.Vi)}\\ ${unit.V}}, \\qquad \\boxed{V_{${ji}}${many ? `^{(${k + 1})}` : ''} = ${num(t.Vj)}\\ ${unit.V}}` });
    out.push(many ? { kind: 'sub', title: tx('steps.fem.action', { n: k + 1 }), blocks: [{ kind: 'p', text: t.label }, ...blocks] } : { kind: 'p', text: t.label }, ...(many ? [] : blocks));
  });
  if (many) {
    const sumOf = (f: 'Mi' | 'Mj' | 'Vi' | 'Vj') => fe.terms.map((t) => par(t[f])).join(' + ');
    out.push({ kind: 'eq', tex: `${FEM(ij)} = ${sumOf('Mi')} = \\boxed{${num(fe.Mi)}\\ ${unit.M}}`, note: tx('steps.fem.superpose') });
    out.push({ kind: 'eq', tex: `${FEM(ji)} = ${sumOf('Mj')} = \\boxed{${num(fe.Mj)}\\ ${unit.M}}` });
    if (shears) {
      out.push({ kind: 'eq', tex: `V_{${ij}} = ${sumOf('Vi')} = ${num(fe.Vi)}\\ ${unit.V}, \\qquad V_{${ji}} = ${sumOf('Vj')} = ${num(fe.Vj)}\\ ${unit.V}` });
    }
  }
  if (shears) {
    out.push({ kind: 'eq', tex: `V_{${ij}} + V_{${ji}} = ${par(fe.Vi)} + ${par(fe.Vj)} = ${num(fe.Vi + fe.Vj)}\\ ${unit.V} \\;=\\; R = ${num(fe.resultant)}\\ ${unit.V}\\ \\checkmark`, note: tx('steps.fem.check') });
  }
  return out;
}
