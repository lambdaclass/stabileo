/**
 * A straight beam as the classical methods see it: members in a horizontal
 * line, read left to right, cut into spans between supports, with the
 * overhangs past the end supports, and every load as a position along the
 * beam and a downward value, whichever way each member was drawn.
 *
 * Several members between two supports are one span (their shared nodes only
 * carry loads); a node load there becomes a point load or couple on the span.
 * A load at a support node goes straight into that support (a vertical force)
 * or into the joint (a couple), and is kept apart as a joint load.
 */
import type { Applicability } from './doc';
import { tx } from './doc';
import type { PlaneModel, PMember } from './plane-model';

/** A load along the beam: x from the span's (or overhang's) left end, downward positive, couples counter-clockwise. */
export type SpanLoad =
  | { kind: 'dist'; a: number; b: number; wa: number; wb: number }
  | { kind: 'point'; a: number; P: number }
  | { kind: 'couple'; a: number; M: number };

export type EndKind = 'fixed' | 'pinned' | 'roller';

export interface Span {
  /** Left and right support nodes. */
  left: number;
  right: number;
  /** Beam coordinate of the left end (m, from the beam's left end). */
  x0: number;
  L: number;
  /** EI of the span, when constant along it (null when its members differ). */
  EI: number | null;
  E: number;
  I: number;
  members: number[];
  /** The unsupported nodes inside the span, with their positions from its left end. */
  inner: Array<{ node: number; x: number }>;
  loads: SpanLoad[];
}

export interface Overhang {
  /** Which end of the beam it is: a left overhang has its support at its right end. */
  side: 'left' | 'right';
  /** The support it hangs from, and its free end. */
  support: number;
  tip: number;
  /** Beam coordinate of its left end. */
  x0: number;
  L: number;
  EI: number | null;
  members: number[];
  /** Like a span's: x from its LEFT end, downward positive, couples counter-clockwise. */
  loads: SpanLoad[];
}

export interface BeamLine {
  /** Nodes left to right, with their beam coordinate. */
  nodes: Array<{ id: number; x: number }>;
  /** Members left to right; `flipped` when drawn right to left. */
  members: Array<{ member: PMember; flipped: boolean; x0: number }>;
  /** Supported nodes left to right with what they are. */
  supports: Array<{ node: number; x: number; kind: EndKind }>;
  spans: Span[];
  overhangs: Overhang[];
  /** Loads applied at support nodes: a vertical force (goes into the reaction) and a couple (into the joint). */
  jointLoads: Array<{ node: number; P: number; M: number }>;
  /** A horizontal node load or axial span load: no bending, left out of these methods and said so. */
  hasAxialLoads: boolean;
}

const TOL = 1e-6;

/**
 * Read the model as a straight horizontal beam, or say why it is not one:
 * every member a frame member, horizontal, on one level, joined end to end
 * without branching; no hinges; supports only pinned, rollers or fixed.
 */
export function beamLine(pm: PlaneModel, opts: { allowHinges?: boolean } = {}): { ok: true; beam: BeamLine } | { ok: false; reason: Applicability & { ok: false } } {
  const fail = (key: string, params?: Record<string, string | number>) => ({ ok: false as const, reason: { ok: false as const, reason: tx(key, params) } });
  const members = [...pm.members.values()];
  if (members.length === 0) return fail('steps.req.noMembers');
  for (const m of members) {
    if (m.truss) return fail('steps.req.beam.truss', { m: m.name });
    if (Math.abs(m.s) > TOL) return fail('steps.req.beam.horizontal', { m: m.name });
    if (!opts.allowHinges && (m.hingeI || m.hingeJ)) return fail('steps.req.beam.hinges', { m: m.name });
  }
  const z0 = pm.nodes.get(members[0].i)!.z;
  for (const m of members) {
    if (Math.abs(pm.nodes.get(m.i)!.z - z0) > TOL || Math.abs(pm.nodes.get(m.j)!.z - z0) > TOL) return fail('steps.req.beam.oneLevel');
  }
  // Every node at most two members, in one chain.
  const degree = new Map<number, number>();
  for (const m of members) { degree.set(m.i, (degree.get(m.i) ?? 0) + 1); degree.set(m.j, (degree.get(m.j) ?? 0) + 1); }
  for (const [n, d] of degree) if (d > 2) return fail('steps.req.beam.branch', { n: pm.nodes.get(n)!.name });
  const used = [...degree.keys()];
  const xs = used.map((n) => pm.nodes.get(n)!.x);
  const xMin = Math.min(...xs);
  const nodes = used.map((id) => ({ id, x: pm.nodes.get(id)!.x - xMin })).sort((a, b) => a.x - b.x);
  // A chain: consecutive nodes joined by exactly one member.
  const ordered: BeamLine['members'] = [];
  for (let k = 0; k + 1 < nodes.length; k++) {
    const a = nodes[k].id, b = nodes[k + 1].id;
    const m = members.find((mm) => (mm.i === a && mm.j === b) || (mm.i === b && mm.j === a));
    if (!m) return fail('steps.req.beam.chain');
    ordered.push({ member: m, flipped: m.i === b, x0: nodes[k].x });
  }
  if (ordered.length !== members.length) return fail('steps.req.beam.chain');

  const supports: BeamLine['supports'] = [];
  for (const n of nodes) {
    const s = pm.supports.get(n.id);
    if (!s) continue;
    if (s.type === 'fixed') supports.push({ node: n.id, x: n.x, kind: 'fixed' });
    else if (s.type === 'pinned') supports.push({ node: n.id, x: n.x, kind: 'pinned' });
    else if (s.type === 'rollerX') supports.push({ node: n.id, x: n.x, kind: 'roller' });
    else return fail('steps.req.beam.supportType', { n: pm.nodes.get(n.id)!.name });
  }
  if (supports.length === 0) return fail('steps.req.beam.noSupports');

  // Loads along the beam, downward positive.
  const at = new Map(nodes.map((n) => [n.id, n.x]));
  type Global = SpanLoad & { x0: number };
  const all: Global[] = [];
  let hasAxialLoads = false;
  for (const { member: m, flipped, x0 } of ordered) {
    const c = flipped ? -1 : 1; // local y is up when drawn left to right, down when flipped
    for (const l of pm.memberLoads) {
      if (l.member !== m.id) continue;
      if (l.kind === 'dist') {
        const pa = flipped ? m.L - l.b : l.a, pb = flipped ? m.L - l.a : l.b;
        const wa = -(flipped ? l.qb : l.qa) * c, wb = -(flipped ? l.qa : l.qb) * c;
        all.push({ kind: 'dist', a: x0 + pa, b: x0 + pb, wa, wb, x0: 0 });
      } else if (l.kind === 'point') {
        const pa = x0 + (flipped ? m.L - l.a : l.a);
        if (Math.abs(l.p) > 1e-12) all.push({ kind: 'point', a: pa, P: -l.p * c, x0: 0 });
        if (Math.abs(l.m) > 1e-12) all.push({ kind: 'couple', a: pa, M: l.m, x0: 0 });
        if (Math.abs(l.px) > 1e-12) hasAxialLoads = true;
      }
    }
  }
  const jointLoads: BeamLine['jointLoads'] = [];
  for (const l of pm.nodalLoads) {
    const x = at.get(l.node);
    if (x === undefined) continue;
    if (Math.abs(l.fx) > 1e-12) hasAxialLoads = true;
    if (pm.supports.has(l.node)) {
      if (Math.abs(l.fz) > 1e-12 || Math.abs(l.my) > 1e-12) jointLoads.push({ node: l.node, P: -l.fz, M: l.my });
    } else {
      if (Math.abs(l.fz) > 1e-12) all.push({ kind: 'point', a: x, P: -l.fz, x0: 0 });
      if (Math.abs(l.my) > 1e-12) all.push({ kind: 'couple', a: x, M: l.my, x0: 0 });
    }
  }

  // A point load or couple exactly at a support acts on that support's joint.
  for (let k = all.length - 1; k >= 0; k--) {
    const l = all[k];
    if (l.kind === 'dist') continue;
    const sup = supports.find((s) => Math.abs(s.x - l.a) < 1e-9);
    if (!sup) continue;
    let jl = jointLoads.find((j) => j.node === sup.node);
    if (!jl) { jl = { node: sup.node, P: 0, M: 0 }; jointLoads.push(jl); }
    if (l.kind === 'point') jl.P += l.P; else jl.M += l.M;
    all.splice(k, 1);
  }

  // Cut the loads into [from, to], shifted to start at `from`.
  const piece = (from: number, to: number): SpanLoad[] => {
    const out: SpanLoad[] = [];
    for (const l of all) {
      if (l.kind === 'dist') {
        const a = Math.max(l.a, from), b = Math.min(l.b, to);
        if (b - a < 1e-9) continue;
        const w = (x: number) => l.wa + ((l.wb - l.wa) * (x - l.a)) / (l.b - l.a);
        const [wa, wb] = [w(a), w(b)];
        out.push({ kind: 'dist', a: a - from, b: b - from, wa, wb });
      } else if (l.a > from - 1e-9 && l.a < to + 1e-9) {
        const a = l.a - from;
        out.push(l.kind === 'point' ? { kind: 'point', a, P: l.P } : { kind: 'couple', a, M: l.M });
      }
    }
    return out;
  };
  const membersIn = (from: number, to: number) => ordered.filter((o) => o.x0 >= from - 1e-9 && o.x0 + o.member.L <= to + 1e-9).map((o) => o.member);
  const eiOf = (ms: PMember[]) => (ms.every((m) => Math.abs(m.EI - ms[0].EI) <= 1e-9 * Math.max(1, ms[0].EI)) ? ms[0].EI : null);

  const spans: Span[] = [];
  for (let k = 0; k + 1 < supports.length; k++) {
    const l = supports[k], r = supports[k + 1];
    const ms = membersIn(l.x, r.x);
    spans.push({
      left: l.node, right: r.node, x0: l.x, L: r.x - l.x, EI: eiOf(ms), E: ms[0].E, I: ms[0].I,
      members: ms.map((m) => m.id),
      inner: nodes.filter((n) => n.x > l.x + 1e-9 && n.x < r.x - 1e-9).map((n) => ({ node: n.id, x: n.x - l.x })),
      loads: piece(l.x, r.x),
    });
  }
  const overhangs: Overhang[] = [];
  const first = supports[0], last = supports[supports.length - 1];
  const x0 = nodes[0].x, x1 = nodes[nodes.length - 1].x;
  if (first.x > x0 + 1e-9) {
    const ms = membersIn(x0, first.x);
    overhangs.push({ side: 'left', support: first.node, tip: nodes[0].id, x0, L: first.x - x0, EI: eiOf(ms), members: ms.map((m) => m.id), loads: piece(x0, first.x) });
  }
  if (last.x < x1 - 1e-9) {
    const ms = membersIn(last.x, x1);
    overhangs.push({ side: 'right', support: last.node, tip: nodes[nodes.length - 1].id, x0: last.x, L: x1 - last.x, EI: eiOf(ms), members: ms.map((m) => m.id), loads: piece(last.x, x1) });
  }
  return { ok: true, beam: { nodes, members: ordered, supports, spans, overhangs, jointLoads, hasAxialLoads } };
}

/** The resultant (downward) and its moment about the left end x = 0 (counter-clockwise positive) of loads on a piece. */
export function resultantOf(loads: SpanLoad[]): { R: number; Mleft: number } {
  let R = 0, Mleft = 0;
  for (const l of loads) {
    if (l.kind === 'dist') {
      const r = ((l.wa + l.wb) / 2) * (l.b - l.a);
      const xc = Math.abs(l.wa + l.wb) < 1e-12 ? (l.a + l.b) / 2 : l.a + ((l.b - l.a) * (l.wa + 2 * l.wb)) / (3 * (l.wa + l.wb));
      R += r; Mleft -= r * xc;
    } else if (l.kind === 'point') { R += l.P; Mleft -= l.P * l.a; }
    else Mleft += l.M;
  }
  return { R, Mleft };
}
