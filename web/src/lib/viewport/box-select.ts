/**
 * box-select.ts — what a dragged rectangle selects.
 *
 * # The two gestures
 *
 * Dragging a rectangle over a model means two different things depending on
 * which way it was drawn, and every CAD package agrees on which is which:
 *
 *   * **Window** (left → right): take only what is entirely INSIDE. The
 *     rectangle is a frame you put around things.
 *   * **Crossing** (right → left): take anything the rectangle TOUCHES. The
 *     rectangle is a net you sweep through them.
 *
 * The distinction only shows up for things with extent — a member, a
 * distributed load. A node is a point: inside or not, and the two gestures give
 * the same answer for it.
 *
 * # Why the select mode decides what is collected
 *
 * The viewports have a filter above the canvas — Nodes, Elements, Supports,
 * Loads — and what a drag gathers follows it: the drag itself starts in every
 * mode, only the gathering is filtered by kind. (That was not always so. 2D
 * box select used to gather nodes and elements in the Elements branch alone,
 * and in the other three modes dragging did nothing at all: no rectangle
 * appeared, because the drag was never started.)
 *
 * The gathering is filtered by mode rather than done wholesale for a specific
 * reason: what is highlighted has to be what gets deleted. A marquee in
 * Supports mode that quietly filled `selectedElements` would delete members the
 * user never targeted, and the highlight would not have shown it.
 *
 * # Why this is a module
 *
 * It is pure geometry over screen coordinates, and it is exactly the kind of
 * thing that is tedious to check by hand in a browser and trivial to check
 * here: eight combinations of gesture and entity, each with an inside, an
 * outside and a straddling case.
 */

import { segmentIntersectsRect } from './spatial-queries';

/** A rectangle in screen pixels, already normalised so x1 ≤ x2 and y1 ≤ y2. */
export interface ScreenRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Which selection filter is active above the canvas. */
export type BoxSelectMode = 'elements' | 'nodes' | 'supports' | 'loads';

export interface BoxSelectResult {
  nodes: Set<number>;
  elements: Set<number>;
  supports: Set<number>;
  loads: Set<number>;
}

/**
 * A point in the model's world, which may or may not have a third dimension.
 *
 * `z` is optional rather than a separate 2D and 3D type: the geometry here —
 * is this point inside the rectangle, does this segment cross it — is identical
 * either way once the point has been projected, and the only thing that differs
 * is the projection. Two copies of that geometry is how the two viewports would
 * start disagreeing about what a marquee selects.
 */
export interface WorldPoint { x: number; y: number; z?: number }

/** The minimum this needs to know about the model, in world coordinates. */
export interface BoxSelectModel {
  nodes: Iterable<{ id: number } & WorldPoint>;
  elements: Iterable<{ id: number; nodeI: number; nodeJ: number }>;
  supports: Iterable<{ id: number; nodeId: number }>;
  loads: Iterable<{ type: string; data: Record<string, number | undefined> & { id: number } }>;
  getNode(id: number): WorldPoint | undefined;
  getElement(id: number): { nodeI: number; nodeJ: number } | undefined;
}

export interface BoxSelectInput {
  rect: ScreenRect;
  /** True when the drag went left → right. See the header. */
  isWindow: boolean;
  /**
   * Every kind the drag picks up.
   *
   * A set rather than one value because a user can turn on multi-kind
   * selection and ask for nodes AND supports in a single sweep. With that off
   * it is a set of one, which is the same code path — the alternative, a
   * single-kind branch beside a multi-kind branch, is two behaviours to keep
   * in step and one of them would drift.
   */
  kinds: ReadonlySet<BoxSelectMode> | BoxSelectMode[];
  model: BoxSelectModel;
  /**
   * World → screen, the same transform the viewport draws with.
   *
   * Takes the point rather than a pair of numbers so a 3D caller can pass the
   * camera projection without the third coordinate being quietly dropped.
   */
  toScreen(p: WorldPoint): { x: number; y: number };
}

const inside = (x: number, y: number, r: ScreenRect): boolean =>
  x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2;

/**
 * Whether a segment is taken, by gesture.
 *
 * Window wants both ends in. Crossing wants any contact at all, which includes
 * the case where BOTH ends are outside and the segment passes straight through
 * — a long beam swept by a small net.
 */
function segmentTaken(
  ax: number, ay: number, bx: number, by: number, r: ScreenRect, isWindow: boolean,
): boolean {
  const aIn = inside(ax, ay, r);
  const bIn = inside(bx, by, r);
  if (isWindow) return aIn && bIn;
  return aIn || bIn || segmentIntersectsRect(ax, ay, bx, by, r.x1, r.y1, r.x2, r.y2);
}

/** Both ends of a member, in screen coordinates. */
function memberEnds(
  m: { nodeI: number; nodeJ: number },
  model: BoxSelectModel,
  toScreen: BoxSelectInput['toScreen'],
) {
  const ni = model.getNode(m.nodeI);
  const nj = model.getNode(m.nodeJ);
  if (!ni || !nj) return null;
  return { a: toScreen(ni), b: toScreen(nj) };
}

/**
 * Where a load lives, geometrically.
 *
 * A load is not one kind of thing: a nodal load is a point at a node, a point
 * load is a point along a member, and a distributed or thermal load is a
 * stretch of one. Treating them all as their member's midpoint — the cheap
 * option — would make a window around one end of a long beam take a load that
 * is nowhere near it.
 */
function loadExtent(
  load: BoxSelectModel['loads'] extends Iterable<infer L> ? L : never,
  model: BoxSelectModel,
  toScreen: BoxSelectInput['toScreen'],
): { kind: 'point'; x: number; y: number } | { kind: 'segment'; ax: number; ay: number; bx: number; by: number } | null {
  const d = load.data;

  if (load.type === 'nodal') {
    const n = model.getNode(d.nodeId as number);
    if (!n) return null;
    const s = toScreen(n);
    return { kind: 'point', x: s.x, y: s.y };
  }

  const elem = model.getElement(d.elementId as number);
  if (!elem) return null;
  const ni = model.getNode(elem.nodeI);
  const nj = model.getNode(elem.nodeJ);
  if (!ni || !nj) return null;

  const dx = nj.x - ni.x;
  const dy = nj.y - ni.y;
  const dz = (nj.z ?? 0) - (ni.z ?? 0);
  // The member's true length, so a position along it means the same thing in
  // both viewports — using the projected length would put a 3D load at the
  // wrong station whenever the member ran towards the camera.
  const L = Math.hypot(dx, dy, dz);
  if (L < 1e-10) return null;

  const along = (t: number): WorldPoint => ({
    x: ni.x + t * dx, y: ni.y + t * dy, z: (ni.z ?? 0) + t * dz,
  });

  if (load.type === 'pointOnElement') {
    const t = Math.max(0, Math.min(1, (d.a ?? 0) / L));
    const s = toScreen(along(t));
    return { kind: 'point', x: s.x, y: s.y };
  }

  // Distributed and thermal: the LOADED stretch, which for a partial load is
  // not the whole member.
  const t0 = Math.max(0, Math.min(1, (d.a ?? 0) / L));
  const t1 = Math.max(0, Math.min(1, (d.b ?? L) / L));
  const a = toScreen(along(t0));
  const b = toScreen(along(t1));
  return { kind: 'segment', ax: a.x, ay: a.y, bx: b.x, by: b.y };
}

/**
 * Everything the rectangle takes, filtered by the active mode.
 *
 * Returns all four sets every time; the ones the mode does not collect come
 * back empty rather than absent, so a caller can merge unconditionally.
 */
export function boxSelect(input: BoxSelectInput): BoxSelectResult {
  const { rect, isWindow, model, toScreen } = input;
  const kinds = new Set<BoxSelectMode>(input.kinds as Iterable<BoxSelectMode>);
  const out: BoxSelectResult = {
    nodes: new Set(), elements: new Set(), supports: new Set(), loads: new Set(),
  };

  /*
   * Members do NOT drag their end nodes in with them.
   *
   * They used to, on the reasoning that a highlighted member with unlit ends
   * looks unfinished. But a selection is not only a highlight — it is what
   * Delete removes, and the two have to be the same set. Sweeping the members
   * of a frame and pressing Delete took the nodes with them, and with the
   * nodes went the supports and the nodal loads sitting on them: a gesture
   * that reads as "remove these bars" wiped the model.
   *
   * Wanting both is a real case, and it has a control of its own — the
   * multi-kind switch, with Nodes and Members both armed. That is the
   * difference between asking for them and being given them.
   */
  if (kinds.has('nodes')) {
    for (const n of model.nodes) {
      const s = toScreen(n);
      if (inside(s.x, s.y, rect)) out.nodes.add(n.id);
    }
  }

  if (kinds.has('elements')) {
    for (const el of model.elements) {
      const ends = memberEnds(el, model, toScreen);
      if (!ends) continue;
      if (segmentTaken(ends.a.x, ends.a.y, ends.b.x, ends.b.y, rect, isWindow)) {
        out.elements.add(el.id);
      }
    }
  }

  if (kinds.has('supports')) {
    // A support sits at its node, so it is a point like the node is. The
    // symbol drawn under it is decoration; selecting by where the symbol
    // happens to be rendered would depend on the zoom.
    for (const sup of model.supports) {
      const n = model.getNode(sup.nodeId);
      if (!n) continue;
      const s = toScreen(n);
      if (inside(s.x, s.y, rect)) out.supports.add(sup.id);
    }
  }

  if (kinds.has('loads')) {
    for (const load of model.loads) {
      const ext = loadExtent(load, model, toScreen);
      if (!ext) continue;
      const taken = ext.kind === 'point'
        ? inside(ext.x, ext.y, rect)
        : segmentTaken(ext.ax, ext.ay, ext.bx, ext.by, rect, isWindow);
      if (taken) out.loads.add(load.data.id);
    }
  }

  return out;
}

/**
 * Normalise a drag into a rectangle plus its gesture.
 *
 * The gesture is decided by the drag's HORIZONTAL direction alone — dragging
 * up-and-left is still a crossing — which is the convention everywhere and the
 * reason this is derived from the raw start/end rather than from the sorted
 * rectangle, where the information is gone.
 */
export function normaliseDrag(
  startX: number, startY: number, endX: number, endY: number,
): { rect: ScreenRect; isWindow: boolean } {
  return {
    rect: {
      x1: Math.min(startX, endX),
      y1: Math.min(startY, endY),
      x2: Math.max(startX, endX),
      y2: Math.max(startY, endY),
    },
    isWindow: endX >= startX,
  };
}
