import * as THREE from 'three';
import { makeShellFaceMaterial, SHELL_EDGE_COLOR, shellColorForMaterial } from '../three/create-shell-mesh';
import { COLORS, disposeObject } from '../three/selection-helpers';

type Point = { x: number; y: number; z: number };
type Mode = 'wireframe' | 'solid';
export interface DisplayCell {
  key: string;
  nodes: readonly number[];
  points: Point[];
  materialId: number;
}

/** A uniform face needs only corner triangles on a convex, flat cell.
 * Keep each principal plane separate so transparent floors can be depth sorted. */
export function cellPlane(points: Point[]): string | null {
  if (points.length !== 3 && points.length !== 4) return null;
  if (!points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))) return null;
  const axis = (['z', 'y', 'x'] as const).find(k => points.every(p => p[k] === points[0]![k]));
  if (!axis) return null;
  const u = axis === 'x' ? 'y' : 'x';
  const v = axis === 'z' ? 'y' : 'z';
  let sign = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!, c = points[(i + 2) % points.length]!;
    const turn = (b[u] - a[u]) * (c[v] - b[v]) - (b[v] - a[v]) * (c[u] - b[u]);
    if (!Number.isFinite(turn) || turn === 0 || (sign && Math.sign(turn) !== sign)) return null;
    sign = Math.sign(turn);
  }
  return axis + points[0]![axis];
}

function coloredGeometry(positions: number[], hex: number) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const colors = new THREE.BufferAttribute(new Float32Array(positions.length), 3);
  const color = new THREE.Color(hex);
  for (let i = 0; i < colors.count; i++) colors.setXYZ(i, color.r, color.g, color.b);
  colors.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('color', colors);
  return { geometry, colors };
}

const quadCorners = [0, 1, 2, 0, 2, 3];
const triCorners = [0, 1, 2];

function buildBatch(cells: DisplayCell[], mode: Mode) {
  const facePositions: number[] = [], linePositions: number[] = [], faceKeys: string[] = [];
  const edgeIndices = new Map<string, number>();
  const edgeOwners: string[][] = [];
  const ranges = new Map<string, { start: number; count: number; edges: number[] }>();
  for (const cell of cells) {
    const start = facePositions.length / 3;
    const corners = cell.nodes.length === 4 ? quadCorners : triCorners;
    for (const index of corners) {
      const p = cell.points[index]!;
      facePositions.push(p.x, p.y, p.z);
    }
    for (let i = 0; i < corners.length; i += 3) faceKeys.push(cell.key);

    const edges: number[] = [];
    for (let i = 0; i < cell.nodes.length; i++) {
      const j = (i + 1) % cell.nodes.length;
      const a = cell.nodes[i]!, b = cell.nodes[j]!;
      const key = a < b ? a + ',' + b : b + ',' + a;
      let edge = edgeIndices.get(key);
      if (edge === undefined) {
        edge = edgeOwners.length;
        edgeIndices.set(key, edge);
        edgeOwners.push([]);
        const p = cell.points[i]!, q = cell.points[j]!;
        linePositions.push(p.x, p.y, p.z, q.x, q.y, q.z);
      }
      edgeOwners[edge]!.push(cell.key);
      edges.push(edge);
    }
    ranges.set(cell.key, { start, count: corners.length, edges });
  }

  const base = shellColorForMaterial(cells[0]!.materialId);
  const faces = coloredGeometry(facePositions, base);
  faces.geometry.computeVertexNormals();
  const material = makeShellFaceMaterial(0xffffff, mode);
  material.vertexColors = true;
  const face = new THREE.Mesh(faces.geometry, material);
  face.userData = { type: 'shellMember', faceKeys };
  const edges = coloredGeometry(linePositions, SHELL_EDGE_COLOR);
  const lines = new THREE.LineSegments(edges.geometry, new THREE.LineBasicMaterial({ vertexColors: true }));
  lines.raycast = () => {};
  const group = new THREE.Group();
  group.add(face, lines);

  const tints = new Map<string, number>();
  const color = new THREE.Color();
  function paint(attribute: THREE.BufferAttribute, start: number, count: number, hex: number) {
    color.setHex(hex);
    for (let i = start; i < start + count; i++) attribute.setXYZ(i, color.r, color.g, color.b);
    attribute.addUpdateRange(start * attribute.itemSize, count * attribute.itemSize);
    attribute.needsUpdate = true;
  }
  function tint(key: string, value?: number) {
    if (tints.get(key) === value) return;
    if (value === undefined) tints.delete(key);
    else tints.set(key, value);
    const range = ranges.get(key)!;
    paint(faces.colors, range.start, range.count, value ?? base);
    for (const edge of range.edges) {
      let edgeColor = SHELL_EDGE_COLOR;
      for (const owner of edgeOwners[edge]!) {
        edgeColor = tints.get(owner) ?? edgeColor;
        if (edgeColor === COLORS.elementHovered) break;
      }
      paint(edges.colors, edge * 2, 2, edgeColor);
    }
  }
  return { group, tint };
}

// Keep an exact snapshot: node IDs determine shared edges, and coordinates can
// change independently of IDs. Compare numerically so a cache hit allocates no signature.
function snapshot(cells: DisplayCell[]) {
  // Each cell stores its corner count followed by (node ID, x, y, z) for each corner.
  const corners = new Float64Array(cells.reduce((n, cell) => n + 1 + 4 * cell.nodes.length, 0));
  let offset = 0;
  for (const cell of cells) {
    corners[offset++] = cell.nodes.length;
    for (let i = 0; i < cell.nodes.length; i++) {
      const p = cell.points[i]!;
      corners[offset++] = cell.nodes[i]!;
      corners[offset++] = p.x;
      corners[offset++] = p.y;
      corners[offset++] = p.z;
    }
  }
  return { keys: cells.map(cell => cell.key), corners };
}

function sameGeometry(previous: ReturnType<typeof snapshot>, cells: DisplayCell[]) {
  if (previous.keys.length !== cells.length) return false;
  const corners = previous.corners;
  let offset = 0;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]!;
    if (previous.keys[i] !== cell.key || corners[offset++] !== cell.nodes.length) return false;
    for (let j = 0; j < cell.nodes.length; j++) {
      const p = cell.points[j]!;
      if (corners[offset] !== cell.nodes[j] || corners[offset + 1] !== p.x ||
          corners[offset + 2] !== p.y || corners[offset + 3] !== p.z) return false;
      offset += 4;
    }
  }
  return true;
}

export class ExplicitShellBatches {
  private batches = new Map<string, ReturnType<typeof buildBatch> & { cells: ReturnType<typeof snapshot>; mode: Mode }>();
  private byCell = new Map<string, ReturnType<typeof buildBatch>>();
  private selected = new Set<string>();
  private hovered?: string;

  sync(parent: THREE.Group, buckets: Map<string, DisplayCell[]>, mode: Mode) {
    this.byCell.clear();
    for (const [key, batch] of this.batches) {
      if (buckets.has(key)) continue;
      batch.group.removeFromParent();
      disposeObject(batch.group);
      this.batches.delete(key);
    }
    for (const [key, cells] of buckets) {
      let batch = this.batches.get(key);
      if (!batch || batch.group.parent !== parent || batch.mode !== mode || !sameGeometry(batch.cells, cells)) {
        if (batch) {
          batch.group.removeFromParent();
          disposeObject(batch.group);
        }
        batch = { ...buildBatch(cells, mode), cells: snapshot(cells), mode };
        parent.add(batch.group);
        this.batches.set(key, batch);
        for (const cell of cells) batch.tint(cell.key, this.color(cell.key));
      }
      for (const cell of cells) this.byCell.set(cell.key, batch);
    }
    if (this.hovered && !this.byCell.has(this.hovered)) this.hovered = undefined;
  }

  has(key: string) { return this.byCell.has(key); }

  private color(key: string) {
    if (key === this.hovered) return COLORS.elementHovered;
    return this.selected.has(key) ? COLORS.elementSelected : undefined;
  }

  selection(keys: ReadonlySet<string>) {
    const previous = this.selected;
    this.selected = new Set(keys);
    for (const key of previous) if (!keys.has(key)) this.byCell.get(key)?.tint(key, this.color(key));
    for (const key of keys) if (!previous.has(key)) this.byCell.get(key)?.tint(key, this.color(key));
  }

  hover(key?: string) {
    const previous = this.hovered;
    this.hovered = key && this.byCell.has(key) ? key : undefined;
    if (previous) this.byCell.get(previous)?.tint(previous, this.color(previous));
    if (this.hovered) this.byCell.get(this.hovered)?.tint(this.hovered, COLORS.elementHovered);
  }
}
