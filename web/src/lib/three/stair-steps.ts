/**
 * The steps of a stair flight, drawn over its inclined slab: the analysis takes the slab and the
 * steps' weight as a load, and the reader sees a stair. A step sits on the slab's top face, its
 * riser a share of the rise and its tread a share of the run, the last tread level with the
 * landing.
 */
import * as THREE from 'three';
import { makeFaceMaterial, type ShellRenderMode } from './create-shell-mesh';

type Vec3 = { x: number; y: number; z: number };

export interface FlightSteps {
  /** Triangles, nine numbers each. */
  triangles: number[];
  /** Segments, six numbers each: each step's riser and tread on both sides, and its nosing across. */
  edges: number[];
  riser: number;
  tread: number;
}

const FLAT_COS = Math.cos((5 * Math.PI) / 180);
const STEEP_COS = Math.cos((70 * Math.PI) / 180);

/** The steps of a flight whose slab has `outline` and `thickness`, in `steps` risers; null for a slab too flat or too steep to be one. */
export function flightSteps(outline: readonly Vec3[], thickness: number, steps: number): FlightSteps | null {
  const n = Math.round(steps);
  if (outline.length < 3 || !(n >= 1)) return null;
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!, b = outline[(i + 1) % outline.length]!;
    nx += (a.y - b.y) * (a.z + b.z); ny += (a.z - b.z) * (a.x + b.x); nz += (a.x - b.x) * (a.y + b.y);
  }
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-12) return null;
  const s = nz < 0 ? -1 / len : 1 / len;
  nx *= s; ny *= s; nz *= s;
  if (nz > FLAT_COS || nz < STEEP_COS) return null;
  const h = Math.hypot(nx, ny), dir = { x: -nx / h, y: -ny / h }, across = { x: -dir.y, y: dir.x };
  const su = outline.map((p) => p.x * dir.x + p.y * dir.y), wu = outline.map((p) => p.x * across.x + p.y * across.y);
  const s0 = Math.min(...su), s1 = Math.max(...su), w0 = Math.min(...wu), w1 = Math.max(...wu);
  const footZ = outline[su.indexOf(s0)]!.z;
  const top = (sv: number) => footZ + (sv - s0) * (h / nz) + thickness / 2 / nz;
  const at = (sv: number, w: number, z: number): [number, number, number] => [sv * dir.x + w * across.x, sv * dir.y + w * across.y, z];
  const run = s1 - s0, tread = run / n, riser = (top(s1) - top(s0)) / n;
  const triangles: number[] = [], edges: number[] = [];
  const tri = (...ps: Array<[number, number, number]>) => { for (const p of ps) triangles.push(...p); };
  const quad = (a: [number, number, number], b: [number, number, number], c: [number, number, number], d: [number, number, number]) => tri(a, b, c, a, c, d);
  for (let j = 0; j < n; j++) {
    const sa = s0 + j * tread, sb = sa + tread, za = top(sa), zb = top(sb);
    const A0 = at(sa, w0, za), B0 = at(sa, w0, zb), C0 = at(sb, w0, zb);
    const A1 = at(sa, w1, za), B1 = at(sa, w1, zb), C1 = at(sb, w1, zb);
    tri(A0, B0, C0, A1, C1, B1);
    quad(A0, A1, B1, B0);
    quad(B0, B1, C1, C0);
    for (const [p, q] of [[A0, B0], [B0, C0], [A1, B1], [B1, C1], [B0, B1]] as const) edges.push(...p, ...q);
  }
  return { triangles, edges, riser, tread };
}

/** The steps of a flight as a group the viewport draws and never picks. */
export function createFlightStepsMesh(steps: FlightSteps, color: number, renderMode: ShellRenderMode): THREE.Group {
  const group = new THREE.Group();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(steps.triangles), 3));
  geo.computeVertexNormals();
  const faces = new THREE.Mesh(geo, makeFaceMaterial(color, renderMode));
  faces.raycast = () => {};
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(steps.edges), 3));
  const lines = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color }));
  lines.raycast = () => {};
  group.add(faces, lines);
  return group;
}
