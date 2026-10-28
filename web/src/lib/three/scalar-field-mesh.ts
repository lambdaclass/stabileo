/**
 * A scalar field on a mesh of quads and triangles in the XY plane, painted with the plate/shell
 * contour colours (`shellContourColor`, `bandValue`), as one indexed geometry: thousands of cells
 * cost one draw call, and a new load step only rewrites the colour and position arrays.
 *
 * Values may be given per node (interpolated across each cell) or per cell (flat). An optional
 * nodal displacement field draws the deformed shape at a chosen scale.
 */
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { bandValue } from '../engine/contour-scale';
import { colourFor, type ColourMap } from './colour-maps';

export type ScalarFieldMesh = {
  group: THREE.Group;
  /** `values` per node, or per cell when `perCell`; colours are clamped to `range`. */
  setField(values: ArrayLike<number>, range: { min: number; max: number }, opts?: { perCell?: boolean; bands?: number; colourMap?: ColourMap }): void;
  /** Nodal displacements [ux0, uy0, ux1, ...] times `scale`, or null for the undeformed mesh. */
  setDisplacement(u: ArrayLike<number> | null, scale: number): void;
  /** Leave out the cells for which `hide(cell)` is true (for instance a fully broken element). */
  setHidden(hide: ((cell: number) => boolean) | null): void;
  setEdgesVisible(visible: boolean): void;
  /** The canvas size in pixels; line cells are drawn in screen-space width and need it. */
  setResolution(width: number, height: number): void;
  dispose(): void;
};

/**
 * `xy` holds node coordinates [x0, y0, x1, y1, ...]; `cells` the node indices of each cell, with
 * `cellSize` 4 (quads, counter-clockwise), 3 (triangles) or 2 (line elements such as bars and
 * springs, drawn `lineWidth` pixels wide and coloured per cell or per node).
 */
export function createScalarFieldMesh(xy: ArrayLike<number>, cells: ArrayLike<number>, cellSize: 2 | 3 | 4 = 4, lineWidth = 3): ScalarFieldMesh {
  if (cellSize === 2) return createLineField(xy, cells, lineWidth);
  const nCells = cells.length / cellSize;
  // Per-cell vertices (not shared), so a per-cell value or a hidden cell does not bleed into its
  // neighbours; nodal values are copied to every vertex of the node.
  const nv = nCells * cellSize;
  const position = new Float32Array(nv * 3);
  const color = new Float32Array(nv * 3);
  const vertexNode = new Uint32Array(nv);
  for (let c = 0; c < nCells; c++) for (let k = 0; k < cellSize; k++) vertexNode[c * cellSize + k] = cells[c * cellSize + k];
  const triPerCell = cellSize === 4 ? 2 : 1;
  const index = new Uint32Array(nCells * triPerCell * 3);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material);

  const edgeIndex = new Uint32Array(nCells * cellSize * 2);
  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  edgeGeometry.setIndex(new THREE.BufferAttribute(edgeIndex, 1));
  const edges = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({ color: 0x8fa3b3, transparent: true, opacity: 0.13 }));
  edges.position.z = 1e-6;

  const group = new THREE.Group();
  group.name = 'scalar-field';
  group.add(mesh, edges);

  let hidden: ((cell: number) => boolean) | null = null;
  function rebuildIndex() {
    let t = 0;
    let e = 0;
    for (let c = 0; c < nCells; c++) {
      if (hidden?.(c)) continue;
      const v = c * cellSize;
      index[t++] = v; index[t++] = v + 1; index[t++] = v + 2;
      if (cellSize === 4) { index[t++] = v; index[t++] = v + 2; index[t++] = v + 3; }
      for (let k = 0; k < cellSize; k++) { edgeIndex[e++] = v + k; edgeIndex[e++] = v + ((k + 1) % cellSize); }
    }
    geometry.setDrawRange(0, t);
    edgeGeometry.setDrawRange(0, e);
    geometry.index!.needsUpdate = true;
    edgeGeometry.index!.needsUpdate = true;
  }

  rebuildIndex();
  const tmp = new THREE.Color();
  return {
    group,
    setField(values, range, opts = {}) {
      const { perCell = false, bands = 0, colourMap = 'shell' } = opts;
      for (let i = 0; i < nv; i++) {
        const raw = perCell ? values[Math.floor(i / cellSize)] : values[vertexNode[i]];
        const v = Math.min(range.max, Math.max(range.min, raw));
        tmp.setHex(colourFor(colourMap, bands > 0 ? bandValue(v, range.min, range.max, bands) : v, range.min, range.max));
        color[3 * i] = tmp.r; color[3 * i + 1] = tmp.g; color[3 * i + 2] = tmp.b;
      }
      geometry.getAttribute('color').needsUpdate = true;
    },
    setDisplacement(u, scale) {
      for (let i = 0; i < nv; i++) {
        const n = vertexNode[i];
        position[3 * i] = xy[2 * n] + (u ? scale * u[2 * n] : 0);
        position[3 * i + 1] = xy[2 * n + 1] + (u ? scale * u[2 * n + 1] : 0);
        position[3 * i + 2] = 0;
      }
      geometry.getAttribute('position').needsUpdate = true;
      edgeGeometry.getAttribute('position').needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
    },
    setHidden(hide) {
      hidden = hide;
      rebuildIndex();
    },
    setEdgesVisible(visible) {
      edges.visible = visible;
    },
    setResolution() {},
    dispose() {
      geometry.dispose();
      edgeGeometry.dispose();
      material.dispose();
      (edges.material as THREE.Material).dispose();
    },
  };
}

function createLineField(xy: ArrayLike<number>, cells: ArrayLike<number>, lineWidth: number): ScalarFieldMesh {
  const n = cells.length / 2;
  const position = new Float32Array(n * 6);
  const colour = new Float32Array(n * 6).fill(0.6);
  const material = new LineMaterial({ vertexColors: true, linewidth: lineWidth, worldUnits: false });
  const geometry = new LineSegmentsGeometry();
  const lines = new LineSegments2(geometry, material);
  const group = new THREE.Group();
  group.name = 'scalar-field';
  group.add(lines);
  let hidden: ((cell: number) => boolean) | null = null;

  function upload() {
    const keep: number[] = [];
    for (let c = 0; c < n; c++) if (!hidden?.(c)) keep.push(c);
    const p = new Float32Array(keep.length * 6);
    const k = new Float32Array(keep.length * 6);
    keep.forEach((c, i) => {
      p.set(position.subarray(6 * c, 6 * c + 6), 6 * i);
      k.set(colour.subarray(6 * c, 6 * c + 6), 6 * i);
    });
    geometry.setPositions(p);
    geometry.setColors(k);
    lines.computeLineDistances();
  }

  const tmp = new THREE.Color();
  const api: ScalarFieldMesh = {
    group,
    setField(values, range, opts = {}) {
      const { perCell = false, bands = 0, colourMap = 'shell' } = opts;
      for (let c = 0; c < n; c++) {
        for (let end = 0; end < 2; end++) {
          const raw = perCell ? values[c] : values[cells[2 * c + end]];
          const v = Math.min(range.max, Math.max(range.min, raw));
          tmp.setHex(colourFor(colourMap, bands > 0 ? bandValue(v, range.min, range.max, bands) : v, range.min, range.max));
          colour.set([tmp.r, tmp.g, tmp.b], 6 * c + 3 * end);
        }
      }
      upload();
    },
    setDisplacement(u, scale) {
      for (let c = 0; c < n; c++) {
        for (let end = 0; end < 2; end++) {
          const node = cells[2 * c + end];
          position[6 * c + 3 * end] = xy[2 * node] + (u ? scale * u[2 * node] : 0);
          position[6 * c + 3 * end + 1] = xy[2 * node + 1] + (u ? scale * u[2 * node + 1] : 0);
          position[6 * c + 3 * end + 2] = 0;
        }
      }
      upload();
    },
    setHidden(hide) {
      hidden = hide;
      upload();
    },
    setEdgesVisible() {},
    setResolution(width, height) {
      material.resolution.set(width, height);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
  api.setDisplacement(null, 0);
  return api;
}
