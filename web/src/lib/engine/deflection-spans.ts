/**
 * The span a member's deflection is measured over: the physical member, not the element.
 *
 * Deflection relative to the chord is only meaningful over the length the limit is written for.
 * Measured per element, a beam cut into pieces reads as several short beams, each measured from
 * the chord of its own displaced ends — and the chord of a piece already carries most of the
 * deflection. The mesher cuts every beam under a slab at each slab node, so for a floor the
 * per-element number was a fraction of the real one: unconservative.
 *
 * ── Where a span passes through, and where it stops ───────────────
 *
 * It passes through a node where it continues straight into exactly one other element, and
 * nothing there can hold it up:
 *
 *   · a support, a constraint or a connector stops it — they are what holds it up;
 *   · a shell does NOT stop it. A slab node on a beam is where the mesh cut it, not a support;
 *   · another bar stops it when that bar can carry it: for a level span, a bar that rises or
 *     falls steeply enough to bear vertically (a column, a hanger, a brace, |cos| to the vertical
 *     ≥ 0.5). A level bar framing in — a secondary beam into a girder — rides on the span and
 *     does not stop it, which is what makes the girder's deflection its full span's. For a span
 *     that is not level every other bar stops it: what braces a column laterally is not a
 *     question geometry answers, and stopping is the shorter, established reading.
 *
 * A `physicalMember` group is deliberately NOT read as the span. The engineer's "V1" commonly runs
 * continuous over several columns; measured from the chord of its far ends, its L/δ would read
 * several times better than any of its spans. When that kind gets its rules, a span may be cut
 * at its boundaries, never stretched across a support.
 *
 * Vertical is the solver's Z (a flat model is solved embedded in XZ, so its Y is Z here).
 */
import { COLLINEAR_COS } from './steel/unbraced-length';

type P = { x: number; y: number; z: number };

export interface SpanModel {
  /** Node positions in the solver's frame (Z up). */
  nodes: ReadonlyMap<number, P>;
  elements: ReadonlyMap<number, { id: number; nodeI: number; nodeJ: number; type: string }>;
  supports: ReadonlyMap<number, { nodeId: number }>;
  connectors?: ReadonlyMap<number, { nodeI: number; nodeJ: number }>;
  constraintNodes?: ReadonlySet<number>;
}

export interface Span {
  /** Elements in order from one end to the other. */
  elements: number[];
  /** For each element, whether it runs against the span's direction (its J end comes first). */
  reversed: boolean[];
  /** The span's end nodes. */
  start: number;
  end: number;
  length: number;
}

/** A level span: its axis within ~6° of horizontal. */
const LEVEL_SIN = 0.1;
/** A bar this steep can bear on a level span. */
const BEARING_COS = 0.5;

const unit = (a: P, b: P) => {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const L = Math.hypot(dx, dy, dz);
  return { L, u: L > 0 ? [dx / L, dy / L, dz / L] : [0, 0, 0] };
};

/** The span of every frame element: elements sharing a span map to the same object. */
export function deflectionSpans(model: SpanModel): Map<number, Span> {
  const bars = [...model.elements.values()].filter((e) => e.type === 'frame' || e.type === 'truss');
  const incident = new Map<number, number[]>();
  const dirOf = new Map<number, number[]>();
  const lenOf = new Map<number, number>();
  for (const e of bars) {
    const a = model.nodes.get(e.nodeI), b = model.nodes.get(e.nodeJ);
    if (!a || !b) continue;
    const d = unit(a, b);
    if (d.L === 0) continue;
    dirOf.set(e.id, d.u);
    lenOf.set(e.id, d.L);
    for (const n of [e.nodeI, e.nodeJ]) incident.set(n, [...(incident.get(n) ?? []), e.id]);
  }
  const held = new Set<number>(model.constraintNodes ?? []);
  for (const s of model.supports.values()) held.add(s.nodeId);
  for (const c of model.connectors?.values() ?? []) { held.add(c.nodeI); held.add(c.nodeJ); }

  const cos = (a: number[], b: number[]) => Math.abs(a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!);

  /** The element the span continues into across `node`, or null if the span stops there. */
  const across = (node: number, from: number): number | null => {
    if (held.has(node)) return null;
    const u = dirOf.get(from)!;
    const others = (incident.get(node) ?? []).filter((id) => id !== from);
    const straight = others.filter((id) => cos(u, dirOf.get(id)!) >= COLLINEAR_COS);
    if (straight.length !== 1) return null;
    const level = Math.abs(u[2]!) < LEVEL_SIN;
    for (const id of others) {
      if (id === straight[0]) continue;
      if (!level || Math.abs(dirOf.get(id)![2]!) >= BEARING_COS) return null;
    }
    return straight[0]!;
  };

  const out = new Map<number, Span>();
  const build = (ids: number[]): Span | null => {
    // Order the walked elements end to end.
    const first = model.elements.get(ids[0]!);
    if (!first) return null;
    const nI = model.nodes.get(first.nodeI)!, u = dirOf.get(first.id)!;
    const along = (n: number) => { const p = model.nodes.get(n)!; return (p.x - nI.x) * u[0]! + (p.y - nI.y) * u[1]! + (p.z - nI.z) * u[2]!; };
    const rows = ids.flatMap((id) => {
      const e = model.elements.get(id);
      if (!e || !dirOf.has(id)) return [];
      const sI = along(e.nodeI), sJ = along(e.nodeJ);
      return [{ id, reversed: sJ < sI, s0: Math.min(sI, sJ), s1: Math.max(sI, sJ), e }];
    }).sort((a, b) => a.s0 - b.s0);
    if (rows.length === 0) return null;
    const head = rows[0]!, tail = rows[rows.length - 1]!;
    return {
      elements: rows.map((r) => r.id),
      reversed: rows.map((r) => r.reversed),
      start: head.reversed ? head.e.nodeJ : head.e.nodeI,
      end: tail.reversed ? tail.e.nodeI : tail.e.nodeJ,
      length: rows.reduce((s, r) => s + (lenOf.get(r.id) ?? 0), 0),
    };
  };

  for (const e of bars) {
    if (out.has(e.id) || !dirOf.has(e.id)) continue;
    const walk = (startNode: number): number[] => {
      const got: number[] = [];
      let node = startNode, cur = e.id;
      for (let guard = 0; guard < bars.length; guard++) {
        const next = across(node, cur);
        if (next === null || next === e.id || got.includes(next) || out.has(next)) break;
        got.push(next);
        const ne = model.elements.get(next)!;
        node = ne.nodeI === node ? ne.nodeJ : ne.nodeI;
        cur = next;
      }
      return got;
    };
    const span = build([...walk(e.nodeI).reverse(), e.id, ...walk(e.nodeJ)]);
    if (span) for (const id of span.elements) out.set(id, span);
  }
  return out;
}
