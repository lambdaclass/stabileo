/**
 * The critical sections of a plane frame for the plastic unit, and its bending
 * moment written from their moments.
 *
 * Where a plastic hinge can form: at a support that holds the rotation, at a
 * joint (one section where two members meet, one per member end where three or
 * more do or a couple is applied), under each point load, and inside a span
 * with a distributed load, where the moment peaks somewhere in the span (its
 * position is an input: the methods move it to where the shear vanishes).
 *
 * Between two consecutive sections of a straight member the moment is the
 * straight line between their values plus the simple-span moment of the loads
 * in between, so the moments at the sections, with λ, give the whole diagram.
 * Moments here are positive when they tension the member's local −y face
 * (sagging on a member drawn left to right); the solver's are the opposite.
 */
import type { SolverInput } from '../types';

export type SectionKind = 'support' | 'joint' | 'point' | 'span' | 'user';

export interface CritSection {
  member: number;
  t: number;
  kind: SectionKind;
  /** The joint, for a section at a member end. */
  node?: number;
  mp: number;
}

/** The moment at a member end: `coef` times the moment of section `section`; null where it is zero. */
export interface EndLink { section: number; coef: number }

interface Pt { x: number; f: number }
interface Dist { a: number; b: number; qa: number; qb: number }

export interface SectionModel {
  input: SolverInput;
  sections: CritSection[];
  ends: Map<string, EndLink | null>;
  mpOf: (member: number) => number;
  /** Length, transverse point loads and transverse span loads of each frame member, in its axes. */
  members: Map<number, { L: number; points: Pt[]; dists: Dist[] }>;
}

export interface SectionOptions {
  /** Interior position (t) of the distributed-load section of each member; absent members take mid-load. Null: no such sections. */
  span?: Map<number, number> | null;
  /** More sections (a hinge chosen by the user), as member and t. */
  extra?: Array<{ member: number; t: number }>;
}

export const endKey = (member: number, end: 'I' | 'J') => `${member}:${end}`;

export function buildSections(input: SolverInput, mpOf: (member: number) => number, opts: SectionOptions = {}): SectionModel {
  const frames = [...input.elements.values()].filter((e) => e.type === 'frame');
  const members = new Map<number, { L: number; points: Pt[]; dists: Dist[] }>();
  for (const e of frames) {
    const a = input.nodes.get(e.nodeI)!, b = input.nodes.get(e.nodeJ)!;
    members.set(e.id, { L: Math.hypot(b.x - a.x, b.z - a.z), points: [], dists: [] });
  }
  for (const l of input.loads) {
    if (l.type === 'pointOnElement' && members.has(l.data.elementId) && Math.abs(l.data.p) > 1e-12) {
      members.get(l.data.elementId)!.points.push({ x: l.data.a, f: l.data.p });
    } else if (l.type === 'distributed' && members.has(l.data.elementId)) {
      const m = members.get(l.data.elementId)!;
      const a = l.data.a ?? 0, b = l.data.b ?? m.L;
      if (b - a > 1e-12 && (Math.abs(l.data.qI) > 1e-12 || Math.abs(l.data.qJ) > 1e-12)) m.dists.push({ a, b, qa: l.data.qI, qb: l.data.qJ });
    }
  }

  const sections: CritSection[] = [];
  const ends = new Map<string, EndLink | null>();
  const extraEnds = new Set((opts.extra ?? []).filter((s) => s.t <= 1e-9 || s.t >= 1 - 1e-9).map((s) => endKey(s.member, s.t < 0.5 ? 'I' : 'J')));
  const holdsRotation = (node: number) => [...input.supports.values()].some((s) => s.nodeId === node && (s.type === 'fixed' || (s.type === 'spring' && (s.kz ?? 0) > 0)));
  const nodalMoment = (node: number) => input.loads.some((l) => l.type === 'nodal' && l.data.nodeId === node && Math.abs(l.data.my) > 1e-12);

  const rigidEnds = new Map<number, Array<{ member: number; end: 'I' | 'J' }>>();
  for (const e of frames) {
    for (const [end, node, hinge] of [['I', e.nodeI, e.hingeStart], ['J', e.nodeJ, e.hingeEnd]] as const) {
      if (hinge) { ends.set(endKey(e.id, end), null); continue; }
      (rigidEnds.get(node) ?? rigidEnds.set(node, []).get(node)!).push({ member: e.id, end });
    }
  }
  const sign = (end: 'I' | 'J') => (end === 'I' ? -1 : 1);
  for (const [node, list] of [...rigidEnds].sort((x, y) => x[0] - y[0])) {
    const held = holdsRotation(node);
    const own = held || nodalMoment(node) || list.length >= 3;
    if (own) {
      for (const r of list) {
        ends.set(endKey(r.member, r.end), { section: sections.length, coef: 1 });
        sections.push({ member: r.member, t: r.end === 'I' ? 0 : 1, kind: held ? 'support' : 'joint', node, mp: mpOf(r.member) });
      }
    } else if (list.length === 2) {
      const chosen = extraEnds.has(endKey(list[1].member, list[1].end)) && !extraEnds.has(endKey(list[0].member, list[0].end))
        ? 1
        : extraEnds.has(endKey(list[0].member, list[0].end)) ? 0 : (mpOf(list[1].member) < mpOf(list[0].member) - 1e-9 ? 1 : 0);
      const a = list[chosen], b = list[1 - chosen];
      const s = sections.length;
      sections.push({ member: a.member, t: a.end === 'I' ? 0 : 1, kind: 'joint', node, mp: mpOf(a.member) });
      ends.set(endKey(a.member, a.end), { section: s, coef: 1 });
      ends.set(endKey(b.member, b.end), { section: s, coef: -sign(a.end) / sign(b.end) });
    } else {
      for (const r of list) ends.set(endKey(r.member, r.end), null);
    }
  }

  const interior = (member: number, t: number, tol = 1e-7) => sections.some((s) => s.member === member && Math.abs(s.t - t) < tol);
  for (const e of frames) {
    const m = members.get(e.id)!;
    for (const p of [...m.points].sort((x, y) => x.x - y.x)) {
      const t = p.x / m.L;
      if (t > 1e-7 && t < 1 - 1e-7 && !interior(e.id, t)) sections.push({ member: e.id, t, kind: 'point', mp: mpOf(e.id) });
    }
  }
  for (const x of opts.extra ?? []) {
    if (!members.has(x.member) || x.t <= 1e-9 || x.t >= 1 - 1e-9 || interior(x.member, x.t)) continue;
    sections.push({ member: x.member, t: x.t, kind: 'user', mp: mpOf(x.member) });
  }
  if (opts.span !== null) {
    for (const e of frames) {
      const m = members.get(e.id)!;
      if (!m.dists.length) continue;
      const lo = Math.min(...m.dists.map((d) => d.a)), hi = Math.max(...m.dists.map((d) => d.b));
      const t = opts.span?.get(e.id) ?? (lo + hi) / 2 / m.L;
      if (t > 1e-4 && t < 1 - 1e-4 && !interior(e.id, t, 1e-4)) sections.push({ member: e.id, t, kind: 'span', mp: mpOf(e.id) });
    }
  }
  return { input, sections, ends, mpOf, members };
}

/** Simple-span moment at x of the loads strictly inside [xa, xb], per unit λ (sagging positive). */
function simpleSpan(m: { points: Pt[]; dists: Dist[] }, xa: number, xb: number, x: number): number {
  const span = xb - xa;
  if (span < 1e-12) return 0;
  let atB = 0, atX = 0;
  for (const p of m.points) {
    if (p.x <= xa + 1e-9 || p.x >= xb - 1e-9) continue;
    atB += p.f * (xb - p.x);
    if (p.x < x) atX += p.f * (x - p.x);
  }
  const G = [-Math.sqrt(3 / 5), 0, Math.sqrt(3 / 5)], W = [5 / 9, 8 / 9, 5 / 9];
  const integral = (d: Dist, lo: number, hi: number, arm: number) => {
    if (hi - lo < 1e-14) return 0;
    const h = (hi - lo) / 2, c = (hi + lo) / 2;
    return G.reduce((s, g, i) => {
      const xi = c + g * h;
      const q = d.qa + ((d.qb - d.qa) * (xi - d.a)) / (d.b - d.a);
      return s + W[i] * h * q * (arm - xi);
    }, 0);
  };
  for (const d of m.dists) {
    const lo = Math.max(d.a, xa), hi = Math.min(d.b, xb);
    if (hi <= lo) continue;
    atB += integral(d, lo, hi, xb);
    atX += integral(d, lo, Math.min(hi, x), x);
  }
  const va = -atB / span;
  return va * (x - xa) + atX;
}

/** The member's stations: its ends and its interior sections, with the moment of each as a link. */
export function stationsOf(sm: SectionModel, member: number): Array<{ t: number; link: EndLink | null }> {
  const out: Array<{ t: number; link: EndLink | null }> = [{ t: 0, link: sm.ends.get(endKey(member, 'I')) ?? null }];
  sm.sections.forEach((s, k) => { if (s.member === member && s.t > 1e-9 && s.t < 1 - 1e-9) out.push({ t: s.t, link: { section: k, coef: 1 } }); });
  out.push({ t: 1, link: sm.ends.get(endKey(member, 'J')) ?? null });
  return out.sort((a, b) => a.t - b.t);
}

/**
 * The moment at t along a frame member as a linear form: `coef` over the
 * section moments plus `load` times λ.
 */
export function momentForm(sm: SectionModel, member: number, t: number): { coef: Map<number, number>; load: number } {
  const st = stationsOf(sm, member);
  const m = sm.members.get(member)!;
  let k = 0;
  while (k + 2 < st.length && t > st[k + 1].t) k++;
  const a = st[k], b = st[k + 1];
  const xi = b.t - a.t < 1e-12 ? 0 : (t - a.t) / (b.t - a.t);
  const coef = new Map<number, number>();
  const add = (l: EndLink | null, w: number) => { if (l && w !== 0) coef.set(l.section, (coef.get(l.section) ?? 0) + l.coef * w); };
  add(a.link, 1 - xi);
  add(b.link, xi);
  return { coef, load: simpleSpan(m, a.t * m.L, b.t * m.L, t * m.L) };
}

export function momentAt(sm: SectionModel, member: number, t: number, M: number[], lambda: number): number {
  const f = momentForm(sm, member, t);
  let v = lambda * f.load;
  for (const [s, c] of f.coef) v += c * M[s];
  return v;
}

/** Positions along a member where its moment is checked: every station, and inside every span that carries a distributed load. */
export function checkPoints(sm: SectionModel, member: number, inside = 8): number[] {
  const st = stationsOf(sm, member);
  const m = sm.members.get(member)!;
  const out: number[] = [];
  for (let k = 0; k + 1 < st.length; k++) {
    const a = st[k].t, b = st[k + 1].t;
    out.push(a, b);
    const loaded = m.dists.some((d) => d.b > a * m.L + 1e-9 && d.a < b * m.L - 1e-9) || m.points.some((p) => p.x > a * m.L + 1e-9 && p.x < b * m.L - 1e-9);
    if (!loaded) continue;
    for (const p of m.points) if (p.x > a * m.L + 1e-9 && p.x < b * m.L - 1e-9) out.push(p.x / m.L);
    for (let i = 1; i < inside; i++) out.push(a + ((b - a) * i) / inside);
  }
  return [...new Set(out)].sort((x, y) => x - y);
}
