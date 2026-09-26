/**
 * The length a steel member is checked over, and its unbraced length for lateral-torsional
 * buckling.
 *
 * ── What was wrong ────────────────────────────────────────────────
 *
 * The checker received `L = Lb =` the ELEMENT's length. A beam drawn as one element that is fine.
 * A beam split into several elements — to carry a point load, by a subdivide command, by a copy
 * that welded onto a node — was checked as several short beams, each with its own short `Lb`:
 * a 12 m beam split in four at nodes where nothing else arrives was verified against lateral
 * buckling over 3 m. That is unconservative, and by a factor that grows with every split.
 *
 * ── What is deduced, and what is not ──────────────────────────────
 *
 * A node where exactly two collinear members meet, and nothing else — no other member, no
 * support, no shell, no connector, no constraint — cannot brace anything: there is nothing there
 * to brace it with. Such nodes are passed through, and the elements on either side are one
 * unbraced length (`chain`). That is geometry, and it can only lengthen `L` and `Lb`, never
 * shorten them.
 *
 * The converse is NOT deduced. A member that frames in may or may not brace — it depends on its
 * stiffness and connection, and saying when it does is the code's provision, not geometry's
 * (`docs/handoffs/m2-lb-assumption.md`). So wherever something does arrive, the chain simply
 * stops there, which is what the checker always assumed. A shorter lateral-torsional length is
 * the user's to state: an element's `unbracedLength` replaces `Lb` (never `L`) and is reported
 * as declared.
 */

type P = { x: number; y: number; z?: number };

export interface LengthModel {
  nodes: ReadonlyMap<number, P>;
  elements: ReadonlyMap<number, { id: number; nodeI: number; nodeJ: number; type: string; unbracedLength?: number }>;
  supports: ReadonlyMap<number, { nodeId: number }>;
  quads?: ReadonlyMap<number, { nodes: readonly number[] }>;
  plates?: ReadonlyMap<number, { nodes: readonly number[] }>;
  connectors?: ReadonlyMap<number, { nodeI: number; nodeJ: number }>;
  constraints?: readonly unknown[];
}

export type LengthSource = 'element' | 'chain' | 'declared';

export interface MemberLengths {
  /** Length for flexural buckling and the checker's `L`, m. */
  L: number;
  /** Unbraced length for lateral-torsional buckling, m. */
  Lb: number;
  /** Where `Lb` came from. `chain` also lengthens `L`. */
  source: LengthSource;
  /** The elements that make up the unbraced length, in order; one for a single element. */
  chain: number[];
}

/** Two directions this close to parallel are one straight member (|cos| ≥ 1 − 1e-6). */
export const COLLINEAR_COS = 1 - 1e-6;

/** Every node a constraint names, however the constraint spells it. */
export function constraintNodes(constraints: readonly unknown[] | undefined): Set<number> {
  const out = new Set<number>();
  const visit = (v: unknown, key: string) => {
    if (typeof v === 'number' && /node|master|slave|retained|constrained|primary|secondary/i.test(key)) out.add(v);
    else if (Array.isArray(v)) v.forEach((x) => visit(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(x, k);
  };
  for (const c of constraints ?? []) visit(c, '');
  return out;
}

const dir = (a: P, b: P) => {
  const dx = b.x - a.x, dy = b.y - a.y, dz = (b.z ?? 0) - (a.z ?? 0);
  const L = Math.hypot(dx, dy, dz);
  return { L, u: L > 0 ? [dx / L, dy / L, dz / L] : [0, 0, 0] };
};

/** `L`, `Lb` and their source for every frame or truss element. */
export function memberLengths(model: LengthModel): Map<number, MemberLengths> {
  // What arrives at each node.
  const incident = new Map<number, number[]>();
  for (const e of model.elements.values()) {
    for (const n of [e.nodeI, e.nodeJ]) {
      const list = incident.get(n) ?? [];
      list.push(e.id);
      incident.set(n, list);
    }
  }
  const held = constraintNodes(model.constraints);
  for (const s of model.supports.values()) held.add(s.nodeId);
  for (const q of model.quads?.values() ?? []) q.nodes.forEach((n) => held.add(n));
  for (const p of model.plates?.values() ?? []) p.nodes.forEach((n) => held.add(n));
  for (const c of model.connectors?.values() ?? []) { held.add(c.nodeI); held.add(c.nodeJ); }

  const lengthOf = new Map<number, number>();
  const dirOf = new Map<number, number[]>();
  for (const e of model.elements.values()) {
    const a = model.nodes.get(e.nodeI), b = model.nodes.get(e.nodeJ);
    if (!a || !b) continue;
    const d = dir(a, b);
    lengthOf.set(e.id, d.L);
    dirOf.set(e.id, d.u);
  }

  /** The element on the other side of a pass-through node, or null if the node stops the chain. */
  const across = (node: number, from: number): number | null => {
    if (held.has(node)) return null;
    const list = incident.get(node) ?? [];
    if (list.length !== 2) return null;
    const other = list[0] === from ? list[1]! : list[0]!;
    const a = dirOf.get(from), b = dirOf.get(other);
    if (!a || !b) return null;
    const cos = Math.abs(a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!);
    return cos >= COLLINEAR_COS ? other : null;
  };

  const out = new Map<number, MemberLengths>();
  const seen = new Set<number>();
  for (const e of model.elements.values()) {
    if (seen.has(e.id) || !lengthOf.has(e.id)) continue;
    // Walk both ways from this element through pass-through nodes.
    const walk = (startNode: number, first: number): number[] => {
      const got: number[] = [];
      let node = startNode, cur = first;
      for (let guard = 0; guard < model.elements.size; guard++) {
        const next = across(node, cur);
        if (next === null || got.includes(next) || next === e.id) break;
        got.push(next);
        const ne = model.elements.get(next)!;
        node = ne.nodeI === node ? ne.nodeJ : ne.nodeI;
        cur = next;
      }
      return got;
    };
    const chain = [...walk(e.nodeI, e.id).reverse(), e.id, ...walk(e.nodeJ, e.id)];
    const total = chain.reduce((s, id) => s + (lengthOf.get(id) ?? 0), 0);
    for (const id of chain) {
      seen.add(id);
      const own = model.elements.get(id)!;
      const declared = own.unbracedLength !== undefined && own.unbracedLength > 0 ? own.unbracedLength : undefined;
      out.set(id, {
        L: total,
        Lb: declared ?? total,
        source: declared !== undefined ? 'declared' : chain.length > 1 ? 'chain' : 'element',
        chain,
      });
    }
  }
  return out;
}
