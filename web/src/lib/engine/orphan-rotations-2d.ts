/**
 * A joint where every member is hinged, made solvable for the eigenvalue
 * analyses — the JS side of the 2D boundary.
 *
 * ── The defect ─────────────────────────────────────────────────────
 *
 * Draw the crown hinge of a three-hinged arch as a hinge at the end of both
 * members that meet there, which is what a hinge "at the node" naturally
 * becomes, and the node keeps a rotation no member resists. The linear solve
 * does not mind: the solver adds a vanishing spring to such a rotation. The
 * eigenvalue analyses do not, and each fails its own way: buckling reports a
 * first mode with a load factor of 2e-5 that is that rotation alone, and the
 * modal analysis fails its decomposition outright. The structure is stable
 * and its real modes are unchanged.
 *
 * ── The fix ────────────────────────────────────────────────────────
 *
 * At such a joint, one member end is made continuous again. The node's
 * rotation then follows that member and is no longer free, and the joint is
 * still a hinge: every other member stays released from it, and nothing else
 * connects to the rotation, so no moment can reach the continuous end. The
 * structure is exactly the same; only the orphan degree of freedom is gone.
 *
 * A joint is left alone when something else acts on its rotation — a fixed or
 * rotational-spring support, a prescribed rotation, a nodal moment, a
 * connector or a constraint — because there the released ends are not the
 * only thing at the node, and making one continuous would change the model.
 */
import type { SolverInput } from './types';

export function mergeAllHingedJoints2D(input: SolverInput): SolverInput {
  const ends = new Map<number, Array<{ id: number; end: 'start' | 'end' }>>();
  const held = new Set<number>();
  for (const el of input.elements.values()) {
    if (el.type !== 'frame') continue;
    for (const [node, end, released] of [[el.nodeI, 'start', el.hingeStart], [el.nodeJ, 'end', el.hingeEnd]] as const) {
      if (!released) held.add(node);
      else {
        const list = ends.get(node) ?? [];
        list.push({ id: el.id, end });
        ends.set(node, list);
      }
    }
  }
  for (const s of input.supports.values()) {
    if (s.type === 'fixed' || (s.type === 'spring' && (s.kz ?? 0) > 0) || s.dry) held.add(s.nodeId);
  }
  for (const l of input.loads) if (l.type === 'nodal' && l.data.my) held.add(l.data.nodeId);
  for (const c of input.connectors?.values() ?? []) { held.add(c.nodeI); held.add(c.nodeJ); }
  for (const c of input.constraints ?? []) {
    for (const v of Object.values(c as unknown as Record<string, unknown>)) {
      if (typeof v === 'number') held.add(v);
      else if (Array.isArray(v)) for (const n of v) if (typeof n === 'number') held.add(n);
    }
  }

  let elements = input.elements;
  for (const [node, list] of ends) {
    if (held.has(node)) continue;
    const pick = list.reduce((a, b) => (b.id < a.id ? b : a));
    if (elements === input.elements) elements = new Map(input.elements);
    const el = { ...elements.get(pick.id)! };
    if (pick.end === 'start') el.hingeStart = false;
    else el.hingeEnd = false;
    elements.set(pick.id, el);
  }
  return elements === input.elements ? input : { ...input, elements };
}
