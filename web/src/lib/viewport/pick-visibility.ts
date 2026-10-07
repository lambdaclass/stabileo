/**
 * What the pointer can reach in the 2D view: what the view draws.
 *
 * Hiding a member, isolating a storey, turning supports or loads off took
 * them off the drawing, and only the click on a node or member asked about
 * it. A marquee still took every node, member, support and load; a load on a
 * hidden member was still clicked; the double-click editor, the hover card,
 * the context menu, the support and load tools and the node tool's drag all
 * reached hidden things, and Delete then removed what nobody could see.
 * Every 2D picking path takes its candidates from here instead.
 *
 * The rule is the drawing's: a node or member the view hides, a support on a
 * hidden node or with supports turned off, a load on a hidden node, member or
 * shell, or with the loads layer off.
 */

type LoadTarget = { nodeId?: number; elementId?: number; quadId?: number };

export interface PickView2D {
  /** Whether anything is hidden at all; when not, the model's own collections come back. */
  anyHidden: boolean;
  isNodeHidden(id: number): boolean;
  isElementHidden(id: number): boolean;
  isLoadHidden(d: LoadTarget): boolean;
  /** The supports layer. */
  showSupports: boolean;
  /** Whether loads are drawn: the layer, and not hidden behind a diagram. */
  loadsDrawn: boolean;
}

export interface PickModel2D<N, E, S extends { nodeId: number }, L extends { data: object }> {
  nodes: Map<number, N>;
  elements: Map<number, E>;
  supports: Map<number, S>;
  loads: readonly L[];
}

/** Whether the 2D view draws loads: the layer on, and no diagram hiding them. */
export function loadsDrawn2D(showLoads: boolean, hideLoadsWithDiagram: boolean, diagramShown: boolean): boolean {
  return showLoads && !(hideLoadsWithDiagram && diagramShown);
}

const EMPTY_MAP = new Map<number, never>();

function keep<T>(src: Map<number, T>, hidden: (id: number, v: T) => boolean): Map<number, T> {
  const out = new Map<number, T>();
  for (const [id, v] of src) if (!hidden(id, v)) out.set(id, v);
  return out;
}

/**
 * The pickable part of the model. The model's own collections when nothing is
 * hidden and both layers are on; otherwise filtered on each call, which costs
 * what the nearest-node search after it costs, and cannot go stale while a
 * node is dragged or a load spliced out in place.
 */
export function pickable2D<N, E, S extends { nodeId: number }, L extends { data: object }>(
  model: PickModel2D<N, E, S, L>, v: PickView2D,
): PickModel2D<N, E, S, L> {
  const supports = !v.showSupports ? EMPTY_MAP as Map<number, S>
    : v.anyHidden ? keep(model.supports, (_, s) => v.isNodeHidden(s.nodeId)) : model.supports;
  const loads = !v.loadsDrawn ? []
    : v.anyHidden ? model.loads.filter((l) => !v.isLoadHidden(l.data as LoadTarget)) : model.loads;
  if (!v.anyHidden) return { nodes: model.nodes, elements: model.elements, supports, loads };
  return {
    nodes: keep(model.nodes, (id) => v.isNodeHidden(id)),
    elements: keep(model.elements, (id) => v.isElementHidden(id)),
    supports,
    loads,
  };
}
