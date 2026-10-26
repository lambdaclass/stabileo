/**
 * A slab panel meshed with its columns' sections in it, not at one node each.
 *
 * Meshed by a plain grid, a slab is held by each column at the column's node only: the share of
 * the slab's load that reaches the columns without passing through the beams is then a property
 * of the mesh (it vanishes as the mesh is refined), not of the building, and the design does not
 * present the members of that floor as verified (`engine/design/analysis-validity.ts`). A column
 * of finite section holds the slab over its whole section.
 *
 * So a rectangular panel is meshed on a grid that has lines on every face of every column that
 * reaches it (at its corners, on its edges or inside it), and every slab node inside a column's
 * section or on its faces is tied to the column's node as a rigid body (a `rigidLink` on all six
 * degrees of freedom, u_s = u_m + θ_m × r). That is the idealisation the indicator reads as the
 * column's section represented (`sectionRepresented`). The beams along the panel's edges are cut
 * at its edge nodes outside the columns' sections only: a beam still runs from column node to
 * column node, as the design reads it (its forces at the faces), and inside a column's section
 * the slab is held by the column, not by the beam.
 *
 * Only an axis-aligned rectangle (a grid panel) is meshed this way; anything else keeps the
 * mesher's own grid, and the indicator still says what it says.
 *
 * Pure geometry in `footprintGrid`; the model edits in `tieFootprints` and `untieNodes`, inside
 * the caller's batch (`deferred-slabs.ts` `meshWithFootprints`).
 */
import { modelStore } from '../../store/model.svelte';
import { planHalf } from './build-on-grid';
import type { MeshOutput } from '../edit/mesher';
import type { Vec3 } from '../edit/affine';

const EPS = 1e-6;

/** A column's section at one floor: its node and its half extents along X and Y, m. */
export interface ColumnFootprint { node: number; x: number; y: number; hx: number; hy: number }

/**
 * The stations of one side: the uniform division at `size`, the forced lines added, and a
 * uniform station too close to a forced one dropped (a sliver is worse than a slightly longer cell).
 */
export function sideStations(a: number, b: number, size: number, forced: readonly number[]): number[] {
  const L = b - a;
  const n = Math.max(1, Math.round(L / Math.max(size, EPS)));
  const h = L / n;
  const inner = forced.filter((f) => f > a + 1e-4 && f < b - 1e-4);
  const uniform: number[] = [];
  for (let k = 1; k < n; k++) {
    const s = a + k * h;
    if (!inner.some((f) => Math.abs(f - s) < 0.3 * h)) uniform.push(s);
  }
  const all = [a, ...uniform, ...inner, b].sort((p, q) => p - q);
  return all.filter((s, i) => i === 0 || s - all[i - 1]! > 1e-4);
}

/**
 * The grid of an axis-aligned rectangular panel at elevation `z`, with lines on the faces of the
 * columns given; null when the corners are not such a rectangle. Cells keep the panel's winding.
 */
export function footprintGrid(corners: ReadonlyArray<{ x: number; y: number; z?: number }>, size: number, columns: readonly ColumnFootprint[]): MeshOutput | null {
  if (corners.length !== 4) return null;
  const z = corners[0]!.z ?? 0;
  if (corners.some((c) => Math.abs((c.z ?? 0) - z) > EPS)) return null;
  const xs0 = [...new Set(corners.map((c) => Math.round(c.x * 1e6) / 1e6))].sort((p, q) => p - q);
  const ys0 = [...new Set(corners.map((c) => Math.round(c.y * 1e6) / 1e6))].sort((p, q) => p - q);
  if (xs0.length !== 2 || ys0.length !== 2) return null;
  const [x0, x1] = xs0 as [number, number], [y0, y1] = ys0 as [number, number];
  const inside = (c: ColumnFootprint) => c.x > x0 - c.hx - EPS && c.x < x1 + c.hx + EPS && c.y > y0 - c.hy - EPS && c.y < y1 + c.hy + EPS;
  const near = columns.filter(inside);
  const xs = sideStations(x0, x1, size, near.flatMap((c) => [c.x - c.hx, c.x + c.hx]));
  const ys = sideStations(y0, y1, size, near.flatMap((c) => [c.y - c.hy, c.y + c.hy]));
  // The panel's winding: positive signed area turns +X to +Y.
  let area = 0;
  for (let i = 0; i < 4; i++) { const p = corners[i]!, q = corners[(i + 1) % 4]!; area += p.x * q.y - q.x * p.y; }
  const points: Vec3[] = [];
  const at = (i: number, j: number) => j * xs.length + i;
  for (const y of ys) for (const x of xs) points.push([x, y, z]);
  const cells: number[][] = [];
  for (let j = 0; j + 1 < ys.length; j++) {
    for (let i = 0; i + 1 < xs.length; i++) {
      const c = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      cells.push(area > 0 ? c : [c[0]!, c[3]!, c[2]!, c[1]!]);
    }
  }
  const boundary = new Set<number>();
  for (let j = 0; j < ys.length; j++) for (let i = 0; i < xs.length; i++) {
    if (i === 0 || j === 0 || i === xs.length - 1 || j === ys.length - 1) boundary.add(at(i, j));
  }
  return { points, cells, structured: true, boundary, plane: { o: [x0, y0, z], u: [1, 0, 0], v: [0, 1, 0] } };
}

/** The columns that reach the floor at elevation `z`: every vertical bar with a node there, by its plan section. */
export function columnFootprintsAt(z: number): ColumnFootprint[] {
  const out = new Map<number, ColumnFootprint>();
  for (const e of modelStore.elements.values()) {
    const a = modelStore.nodes.get(e.nodeI), b = modelStore.nodes.get(e.nodeJ);
    if (!a || !b) continue;
    if (Math.abs(a.x - b.x) > EPS || Math.abs(a.y - b.y) > EPS || Math.abs((a.z ?? 0) - (b.z ?? 0)) < EPS) continue;
    // An offset column's section is not centred on its node: not represented here.
    if ((e as { offset?: unknown }).offset) continue;
    const n = Math.abs((a.z ?? 0) - z) < EPS ? a : Math.abs((b.z ?? 0) - z) < EPS ? b : null;
    if (!n) continue;
    const h = planHalf(e.id);
    if (!h) continue;
    const prev = out.get(n.id);
    // The widest column at the node holds the slab.
    if (!prev || h[0] * h[1] > prev.hx * prev.hy) out.set(n.id, { node: n.id, x: n.x, y: n.y, hx: h[0], hy: h[1] });
  }
  return [...out.values()];
}

/**
 * Tie the slab nodes inside each column's section (or on its faces) to the column's node, as a
 * rigid body. A node already tied, held by a support, or the column's own node is left alone.
 * Returns how many ties were added.
 */
export function tieFootprints(slabNodes: Iterable<number>, columns: readonly ColumnFootprint[]): number {
  const tied = new Set((modelStore.model.constraints ?? []).flatMap((k) => ('slaveNode' in k ? [k.slaveNode as number] : [])));
  const supported = new Set([...modelStore.supports.values()].map((s) => s.nodeId));
  let made = 0;
  for (const id of slabNodes) {
    if (tied.has(id) || supported.has(id)) continue;
    const n = modelStore.nodes.get(id);
    if (!n) continue;
    const c = columns.find((k) => k.node !== id && Math.abs((modelStore.nodes.get(k.node)?.z ?? 0) - (n.z ?? 0)) < EPS
      && Math.abs(n.x - k.x) <= k.hx + EPS && Math.abs(n.y - k.y) <= k.hy + EPS);
    if (!c) continue;
    modelStore.addConstraint({ type: 'rigidLink', masterNode: c.node, slaveNode: id, dofs: [0, 1, 2, 3, 4, 5] } as never);
    tied.add(id);
    made++;
  }
  return made;
}

/** Whether a point may cut a member: not inside (or on the faces of) a column's section at its floor. */
export function outsideFootprints(columns: readonly ColumnFootprint[], z: number): (p: Vec3) => boolean {
  return (p) => !columns.some((c) => Math.abs(p[2] - z) < EPS && Math.abs(p[0] - c.x) <= c.hx + EPS && Math.abs(p[1] - c.y) <= c.hy + EPS
    && (Math.abs(p[0] - c.x) > EPS || Math.abs(p[1] - c.y) > EPS));
}

/** The rigid ties whose slave is one of the nodes given, removed (before those nodes go). */
export function untieNodes(nodes: ReadonlySet<number>): number {
  const list = modelStore.model.constraints ?? [];
  let removed = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const k = list[i] as { type: string; slaveNode?: number };
    if (k.type === 'rigidLink' && k.slaveNode !== undefined && nodes.has(k.slaveNode)) { modelStore.removeConstraint(i); removed++; }
  }
  return removed;
}
