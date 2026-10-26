/**
 * The model viewer's physical mode: the physical frame's vertical prisms as one geometry
 * (`engine/physical/physical-frame.ts`). A member's layers and the joints it owns are swept here
 * exactly as the quantities measure them, holes and concave outlines included.
 */
import * as THREE from 'three';
import type { PrismLayer } from '../engine/physical/physical-frame';

/** Every polygon of every layer extruded from its `z0` up to its `z1`, merged. Null when empty. */
export function prismLayersGeometry(layers: readonly PrismLayer[]): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  for (const l of layers) {
    const depth = l.z1 - l.z0;
    if (!(depth > 1e-9)) continue;
    for (const p of l.polygons) {
      const shape = new THREE.Shape(p.outer.map(([x, y]) => new THREE.Vector2(x, y)));
      for (const h of p.holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
      const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
      g.translate(0, 0, l.z0);
      parts.push(g.index ? g.toNonIndexed() : g);
    }
  }
  if (parts.length === 0) return null;
  const total = parts.reduce((t, g) => t + g.getAttribute('position').count, 0);
  const pos = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.getAttribute('position').array as Float32Array, o);
    o += g.getAttribute('position').count * 3;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}
