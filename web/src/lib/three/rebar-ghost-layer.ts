import * as THREE from 'three';
import { ghostCorners, type Ghost3d } from '../rc-sheets/rebar-3d-ghost';
import { createSoloLayer, tokenColour, type Host } from './rebar-3d-layer';

export const GHOST_FILL_OPACITY = 0.08;
export const GHOST_EDGE_OPACITY = 0.2;

const FACES = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]] as const;
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]] as const;

const luminance = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

export function ghostColour(background: unknown): THREE.Color {
  const bg = background instanceof THREE.Color ? background : new THREE.Color('#0c1620');
  const dark = luminance(bg) < 0.5;
  const c = tokenColour('--st-text', dark ? '#d6dde3' : '#26303a');
  return Math.abs(luminance(c) - luminance(bg)) > 0.35 ? c : new THREE.Color(dark ? '#d6dde3' : '#26303a');
}

const handed = (g: Ghost3d) => {
  const { x, y, z } = g.frame;
  return (x[1] * y[2] - x[2] * y[1]) * z[0] + (x[2] * y[0] - x[0] * y[2]) * z[1] + (x[0] * y[1] - x[1] * y[0]) * z[2] >= 0;
};

export function buildGhostGroup(ghosts: readonly Ghost3d[], background: unknown = null): THREE.Group {
  const group = new THREE.Group();
  group.name = 'sheetRebarGhost';
  const fill = new Float32Array(ghosts.length * 36 * 3), edges = new Float32Array(ghosts.length * 24 * 3);
  let fi = 0, ei = 0;
  for (const g of ghosts) {
    const c = ghostCorners(g), right = handed(g);
    for (const f of FACES) {
      const q = right ? f : [f[0], f[3], f[2], f[1]];
      for (const k of [q[0], q[1], q[2], q[0], q[2], q[3]]) { fill.set(c[k]!, fi); fi += 3; }
    }
    for (const [a, b] of EDGES) { edges.set(c[a]!, ei); edges.set(c[b]!, ei + 3); ei += 6; }
  }
  const colour = ghostColour(background);
  const fillGeo = new THREE.BufferGeometry();
  fillGeo.setAttribute('position', new THREE.BufferAttribute(fill, 3));
  fillGeo.computeVertexNormals();
  const solid = new THREE.Mesh(fillGeo, new THREE.MeshLambertMaterial({ color: colour, transparent: true, opacity: GHOST_FILL_OPACITY, depthWrite: false }));
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.BufferAttribute(edges, 3));
  const lines = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: GHOST_EDGE_OPACITY, depthWrite: false }));
  for (const o of [solid, lines]) {
    o.renderOrder = 1;
    o.userData.noPick = true;
    o.raycast = () => {};
    group.add(o);
  }
  return group;
}

export const createGhostLayer = () => createSoloLayer<Ghost3d>((ghosts, host: Host) => buildGhostGroup(ghosts, host.scene.background));
