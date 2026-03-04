/**
 * Pure spatial query functions for hit-testing and snapping in the 2D viewport.
 *
 * These functions operate on raw model data (nodes, elements, supports, loads)
 * and world coordinates. They have no dependency on stores or UI state.
 */

import type { Node, Element, Support, Load } from '../store/model.svelte';

// ─── Result Types ────────────────────────────────────────────────

export interface NearestNodeResult {
  id: number;
  x: number;
  y: number;
}

export interface NearestElementResult {
  id: number;
  type: string;
  nodeI: number;
  nodeJ: number;
  hingeStart?: boolean;
  hingeEnd?: boolean;
}

export interface NearestSupportResult {
  id: number;
  nodeId: number;
  type: string;
}

export interface NearestMidpointResult {
  x: number;
  y: number;
  elementId: number;
}

export interface NearestLoadResult {
  loadId: number;
  load: Load;
}

// ─── Geometry Utilities ──────────────────────────────────────────

/** Tests whether two line segments (a1-a2) and (b1-b2) intersect. */
export function segmentsIntersect(
  ax1: number, ay1: number, ax2: number, ay2: number,
  bx1: number, by1: number, bx2: number, by2: number
): boolean {
  const dx = ax2 - ax1;
  const dy = ay2 - ay1;
  const ex = bx2 - bx1;
  const ey = by2 - by1;
  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-10) return false;
  const t = ((bx1 - ax1) * ey - (by1 - ay1) * ex) / denom;
  const u = ((bx1 - ax1) * dy - (by1 - ay1) * dx) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/** Tests if a line segment intersects an axis-aligned rectangle (crossing selection). */
export function segmentIntersectsRect(
  px1: number, py1: number, px2: number, py2: number,
  rx1: number, ry1: number, rx2: number, ry2: number
): boolean {
  // Either endpoint inside the rect
  if (px1 >= rx1 && px1 <= rx2 && py1 >= ry1 && py1 <= ry2) return true;
  if (px2 >= rx1 && px2 <= rx2 && py2 >= ry1 && py2 <= ry2) return true;
  // Check segment against the 4 edges
  const edges: [number, number, number, number][] = [
    [rx1, ry1, rx2, ry1], // top
    [rx2, ry1, rx2, ry2], // right
    [rx1, ry2, rx2, ry2], // bottom
    [rx1, ry1, rx1, ry2], // left
  ];
  for (const [ex1, ey1, ex2, ey2] of edges) {
    if (segmentsIntersect(px1, py1, px2, py2, ex1, ey1, ex2, ey2)) return true;
  }
  return false;
}

// ─── Node Queries ────────────────────────────────────────────────

/** Finds the nearest node within maxDist of the given world coordinates. */
export function findNearestNode(
  x: number,
  y: number,
  maxDist: number,
  nodes: Map<number, Node>
): NearestNodeResult | null {
  let nearest: NearestNodeResult | null = null;
  let minDist = maxDist;

  for (const node of nodes.values()) {
    const dist = Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2);
    if (dist < minDist) {
      minDist = dist;
      nearest = node;
    }
  }

  return nearest;
}

// ─── Element Queries ─────────────────────────────────────────────

/**
 * Finds the nearest element within maxDist of the given world coordinates.
 * Uses perpendicular projection onto the element's line segment.
 */
export function findNearestElement(
  x: number,
  y: number,
  maxDist: number,
  elements: Map<number, Element>,
  nodes: Map<number, Node>
): NearestElementResult | null {
  let nearest: NearestElementResult | null = null;
  let minDist = maxDist;

  for (const elem of elements.values()) {
    const ni = nodes.get(elem.nodeI);
    const nj = nodes.get(elem.nodeJ);
    if (!ni || !nj) continue;

    const dx = nj.x - ni.x;
    const dy = nj.y - ni.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-10) continue;

    let t = ((x - ni.x) * dx + (y - ni.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = ni.x + t * dx;
    const projY = ni.y + t * dy;
    const dist = Math.sqrt((x - projX) ** 2 + (y - projY) ** 2);

    if (dist < minDist) {
      minDist = dist;
      nearest = elem;
    }
  }

  return nearest;
}

/** Finds the nearest element midpoint within maxDist of the given world coordinates. */
export function findNearestMidpoint(
  x: number,
  y: number,
  maxDist: number,
  elements: Map<number, Element>,
  nodes: Map<number, Node>
): NearestMidpointResult | null {
  let nearest: NearestMidpointResult | null = null;
  let minDist = maxDist;

  for (const elem of elements.values()) {
    const ni = nodes.get(elem.nodeI);
    const nj = nodes.get(elem.nodeJ);
    if (!ni || !nj) continue;

    const mx = (ni.x + nj.x) / 2;
    const my = (ni.y + nj.y) / 2;
    const dist = Math.sqrt((x - mx) ** 2 + (y - my) ** 2);
    if (dist < minDist) {
      minDist = dist;
      nearest = { x: mx, y: my, elementId: elem.id };
    }
  }

  return nearest;
}

// ─── Support Queries ─────────────────────────────────────────────

/** Finds the nearest support within maxDist of the given world coordinates. */
export function findNearestSupport(
  x: number,
  y: number,
  maxDist: number,
  supports: Map<number, Support>,
  nodes: Map<number, Node>
): NearestSupportResult | null {
  let nearest: NearestSupportResult | null = null;
  let minDist = maxDist;

  for (const sup of supports.values()) {
    const node = nodes.get(sup.nodeId);
    if (!node) continue;
    const dist = Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2);
    if (dist < minDist) {
      minDist = dist;
      nearest = sup;
    }
  }

  return nearest;
}

// ─── Load Queries ────────────────────────────────────────────────

/**
 * Computes the distance from a world point (wx, wy) to a load.
 * Returns Infinity if the load's parent entity is missing.
 */
function distanceToLoad(
  wx: number,
  wy: number,
  load: Load,
  elements: Map<number, Element>,
  nodes: Map<number, Node>
): number {
  if (load.type === 'nodal') {
    const d = load.data as { id: number; nodeId: number };
    const node = nodes.get(d.nodeId);
    if (!node) return Infinity;
    return Math.sqrt((wx - node.x) ** 2 + (wy - node.y) ** 2);
  }

  if (load.type === 'distributed' || load.type === 'thermal') {
    const d = load.data as { id: number; elementId: number };
    const elem = elements.get(d.elementId);
    if (!elem) return Infinity;
    const ni = nodes.get(elem.nodeI);
    const nj = nodes.get(elem.nodeJ);
    if (!ni || !nj) return Infinity;
    const edx = nj.x - ni.x, edy = nj.y - ni.y;
    const lenSq = edx * edx + edy * edy;
    if (lenSq < 1e-10) return Infinity;
    let t = ((wx - ni.x) * edx + (wy - ni.y) * edy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const px = ni.x + t * edx, py = ni.y + t * edy;
    return Math.sqrt((wx - px) ** 2 + (wy - py) ** 2);
  }

  if (load.type === 'pointOnElement') {
    const d = load.data as { id: number; elementId: number; a: number; p: number };
    const elem = elements.get(d.elementId);
    if (!elem) return Infinity;
    const ni = nodes.get(elem.nodeI);
    const nj = nodes.get(elem.nodeJ);
    if (!ni || !nj) return Infinity;
    const edx = nj.x - ni.x, edy = nj.y - ni.y;
    const L = Math.sqrt(edx * edx + edy * edy);
    if (L < 1e-10) return Infinity;
    const t = d.a / L;
    const px = ni.x + t * edx, py = ni.y + t * edy;
    return Math.sqrt((wx - px) ** 2 + (wy - py) ** 2);
  }

  return Infinity;
}

/**
 * Returns all load IDs within maxDist, ordered by distance (closest first).
 * Point-like loads (nodal, pointOnElement) get priority over distributed loads
 * by reducing their effective distance for sorting purposes.
 */
export function findAllLoadsNear(
  wx: number,
  wy: number,
  maxDist: number,
  loads: Load[],
  elements: Map<number, Element>,
  nodes: Map<number, Node>
): number[] {
  const candidates: Array<{ loadId: number; dist: number; effectiveDist: number }> = [];

  for (const load of loads) {
    const dist = distanceToLoad(wx, wy, load, elements, nodes);
    // Point-like loads (nodal, pointOnElement) get priority over distributed loads
    // by reducing their effective distance for sorting purposes
    const isPointLike = load.type === 'nodal' || load.type === 'pointOnElement';
    const effectiveDist = isPointLike ? dist * 0.4 : dist;
    if (dist <= maxDist) {
      candidates.push({ loadId: load.data.id, dist, effectiveDist });
    }
  }

  candidates.sort((a, b) => a.effectiveDist - b.effectiveDist);
  return candidates.map(c => c.loadId);
}

/**
 * Finds the single nearest load within maxDist.
 * When click is close to a node, nodal/point loads win over distributed loads
 * whose distance-to-line approaches zero at endpoints (via a 0.4x bonus).
 */
export function findNearestLoad(
  wx: number,
  wy: number,
  maxDist: number,
  loads: Load[],
  elements: Map<number, Element>,
  nodes: Map<number, Node>,
  excludeIds?: Set<number>
): NearestLoadResult | null {
  let nearest: NearestLoadResult | null = null;
  let minDist = maxDist;

  for (const load of loads) {
    if (excludeIds && excludeIds.has(load.data.id)) continue;
    const dist = distanceToLoad(wx, wy, load, elements, nodes);

    // When click is close to a node, nodal/point loads should win over
    // distributed loads whose distance-to-line approaches zero at endpoints.
    // Apply a small bonus (reduce effective distance) for point-like loads.
    const isPointLike = load.type === 'nodal' || load.type === 'pointOnElement';
    const effective = isPointLike ? dist * 0.4 : dist;

    if (effective < minDist) {
      minDist = effective;
      nearest = { loadId: load.data.id, load };
    }
  }

  return nearest;
}

// ─── Snap Helpers ────────────────────────────────────────────────

/**
 * Returns world coords snapped with priority: existing node > element midpoint > grid.
 *
 * @param worldX - Raw (unsnapped) world X coordinate
 * @param worldY - Raw (unsnapped) world Y coordinate
 * @param snapToGrid - Function that snaps world coords to grid (e.g., uiStore.snapWorld)
 * @param nodes - All nodes in the model
 * @param elements - All elements in the model
 * @param nodeThreshold - Max world distance to snap to existing node (default 0.5)
 * @param midpointThreshold - Max world distance to snap to midpoint (default 0.4)
 */
export function snapWithMidpoint(
  worldX: number,
  worldY: number,
  snapToGrid: (x: number, y: number) => { x: number; y: number },
  nodes: Map<number, Node>,
  elements: Map<number, Element>,
  nodeThreshold: number = 0.5,
  midpointThreshold: number = 0.4
): { x: number; y: number } {
  const gridSnapped = snapToGrid(worldX, worldY);
  const nearNode = findNearestNode(gridSnapped.x, gridSnapped.y, nodeThreshold, nodes);
  if (nearNode) return { x: nearNode.x, y: nearNode.y };
  const midSnap = findNearestMidpoint(worldX, worldY, midpointThreshold, elements, nodes);
  if (midSnap) return { x: midSnap.x, y: midSnap.y };
  return gridSnapped;
}
