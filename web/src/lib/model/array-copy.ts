/**
 * Repeat a selection, N times, along an offset — the storey tool.
 *
 * ── Why copy-and-paste is not enough ───────────────────────────────
 *
 * There is a clipboard, and it pastes one copy at a fixed offset: a metre
 * across in 2D, three metres up in 3D. That is the right shape for "I want
 * another one of these". It is the wrong shape for the job people actually
 * do with it — six identical storeys, a row of twenty purlins, a bay
 * repeated down a shed — where the copy is not one thing but a count and a
 * spacing, and doing it by hand means pasting six times and dragging each
 * result into place, accumulating a placement error at every step.
 *
 * ── What the columns between floors are for ────────────────────────
 *
 * Repeating a floor plan gives you floors and no building. The members that
 * join storey to storey do not exist in the thing being copied — they span
 * BETWEEN a copy and the one before it — so `link` creates them: one member
 * from each node to its own image in the next copy. That is the difference
 * between an array tool and six pastes.
 *
 * ── What this does not do ──────────────────────────────────────────
 *
 * It does not weld. A copy whose node lands exactly where an existing node
 * already is produces two coincident nodes, not one, because merging them
 * is a decision with consequences for everything attached and it is not this
 * function's to make. The caller that wants it can say so afterwards.
 */

export interface RepeatSpec {
  /** How many COPIES to make. One means a single duplicate, as paste does. */
  count: number;
  /** Offset applied per copy, in metres. The n-th copy sits at n × this. */
  dx: number;
  dy: number;
  dz: number;
  /** Join each node to its image in the next copy — storey columns. */
  link: boolean;
  /** Carry the supports on the copied nodes into every copy. */
  withSupports: boolean;
}

export interface RepeatSource {
  nodes: Array<{ id: number; x: number; y: number; z?: number }>;
  elements: Array<{
    id: number; nodeI: number; nodeJ: number;
    type: 'frame' | 'truss'; materialId: number; sectionId: number;
  }>;
  supports: Array<{ nodeId: number; type: string }>;
}

/** What the caller has to be able to do to the model. */
export interface RepeatTarget {
  addNode(x: number, y: number, z?: number): number;
  addElement(i: number, j: number, type: 'frame' | 'truss'): number;
  setElementMaterial(id: number, materialId: number): void;
  setElementSection(id: number, sectionId: number): void;
  addSupport(nodeId: number, type: string): void;
}

export interface RepeatOutcome {
  nodes: number[];
  elements: number[];
  /** The members created BETWEEN copies, when `link` was asked for. */
  links: number[];
}

/**
 * Whether a spec would do anything at all.
 *
 * A zero offset with `link` off makes every copy land on the original, which
 * is a way of silently doubling a model. Refused rather than performed.
 */
export function repeatIsMeaningful(spec: RepeatSpec): boolean {
  if (!Number.isFinite(spec.count) || spec.count < 1) return false;
  const moved = Math.hypot(spec.dx, spec.dy, spec.dz) > 1e-9;
  return moved;
}

export function repeatSelection(
  src: RepeatSource,
  spec: RepeatSpec,
  model: RepeatTarget,
): RepeatOutcome {
  const out: RepeatOutcome = { nodes: [], elements: [], links: [] };
  if (!repeatIsMeaningful(spec) || src.nodes.length === 0) return out;

  /*
   * The image of each original node in each copy. Indexed by copy, so the
   * link pass can reach "the same node, one copy earlier" — which for the
   * first copy is the original itself.
   */
  const images: Array<Map<number, number>> = [];
  const original = new Map<number, number>(src.nodes.map((n) => [n.id, n.id]));

  for (let k = 1; k <= spec.count; k++) {
    const map = new Map<number, number>();
    for (const n of src.nodes) {
      const id = model.addNode(
        n.x + spec.dx * k,
        n.y + spec.dy * k,
        (n.z ?? 0) + spec.dz * k,
      );
      map.set(n.id, id);
      out.nodes.push(id);
    }
    images.push(map);

    for (const e of src.elements) {
      const i = map.get(e.nodeI);
      const j = map.get(e.nodeJ);
      /* A member with an end outside the selection has nothing to copy to. */
      if (i === undefined || j === undefined) continue;
      const id = model.addElement(i, j, e.type);
      model.setElementMaterial(id, e.materialId);
      model.setElementSection(id, e.sectionId);
      out.elements.push(id);
    }

    if (spec.withSupports) {
      for (const s of src.supports) {
        const n = map.get(s.nodeId);
        if (n !== undefined) model.addSupport(n, s.type);
      }
    }

    if (spec.link) {
      const previous = k === 1 ? original : images[k - 2];
      for (const n of src.nodes) {
        const from = previous.get(n.id);
        const to = map.get(n.id);
        if (from === undefined || to === undefined) continue;
        /*
         * A frame, not a truss. A column between storeys carries moment, and
         * a reader who wanted pin-ended can release it — whereas a truss
         * silently thrown in cannot be un-released without noticing it.
         *
         * Material and section come from the first member of the selection,
         * because a link with no properties would default to whatever id 1
         * happens to be — and there is no better guess available here.
         */
        const id = model.addElement(from, to, 'frame');
        const proto = src.elements[0];
        if (proto) {
          model.setElementMaterial(id, proto.materialId);
          model.setElementSection(id, proto.sectionId);
        }
        out.links.push(id);
      }
    }
  }

  return out;
}
