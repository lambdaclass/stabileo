/**
 * The placement ghost: the fragment's members and shell outlines as light lines, moved by a
 * matrix while the pointer moves, with a ring on every node that will weld onto the model and a
 * cross at the anchor.
 *
 * Built once per placement; each move only sets the group's matrix and rewrites the weld rings,
 * so a building's worth of members follows the pointer without rebuilding geometry. Nothing here
 * is pickable (`raycast` is a no-op), so the pointer keeps finding the model's nodes under it.
 */
import * as THREE from 'three';
import type { Affine, Vec3 } from '../model/edit/affine';
import type { Fragment } from '../model/edit/fragment';
import { disposeObject } from './selection-helpers';

const GHOST_COLOR = 0x39b3ff;
const WELD_COLOR = 0xffb020;
const MAX_WELDS = 2048;

const noRaycast = () => {};

export class PlacementGhost {
  readonly group = new THREE.Group();
  private body = new THREE.Group();
  private welds: THREE.Points;
  private anchor: THREE.LineSegments;

  private copies = new THREE.Group();
  private marks: THREE.Points | null = null;

  constructor(private scene: THREE.Scene, private color = GHOST_COLOR) {
    this.group.name = 'placementGhost';
    this.group.renderOrder = 10;
    this.body.matrixAutoUpdate = false;
    this.group.add(this.body);

    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(MAX_WELDS * 3), 3));
    wg.setDrawRange(0, 0);
    this.welds = new THREE.Points(wg, new THREE.PointsMaterial({ color: WELD_COLOR, size: 12, sizeAttenuation: false, depthTest: false, transparent: true }));
    this.welds.raycast = noRaycast;
    this.welds.frustumCulled = false;
    this.group.add(this.welds);

    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(18), 3));
    this.anchor = new THREE.LineSegments(ag, new THREE.LineBasicMaterial({ color: this.color, depthTest: false }));
    this.anchor.raycast = noRaycast;
    this.anchor.frustumCulled = false;
    this.group.add(this.anchor);
    this.group.add(this.copies);
    scene.add(this.group);
  }

  /** Draw `frag` in its own coordinates; `update` moves it. */
  setFragment(frag: Fragment): void {
    for (const c of [...this.body.children]) { this.body.remove(c); disposeObject(c); }
    const at = new Map(frag.nodes.map((n) => [n.id, n]));
    const seg: number[] = [];
    for (const e of frag.elements) {
      const a = at.get(e.nodeI), b = at.get(e.nodeJ);
      if (a && b) seg.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    for (const s of [...frag.quads, ...frag.plates]) {
      const ns = s.nodes.map((id) => at.get(id)).filter(Boolean) as Array<{ x: number; y: number; z: number }>;
      for (let i = 0; i < ns.length; i++) { const p = ns[i]!, q = ns[(i + 1) % ns.length]!; seg.push(p.x, p.y, p.z, q.x, q.y, q.z); }
    }
    if (seg.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
      const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: this.color, transparent: true, opacity: 0.85, depthTest: false }));
      lines.raycast = noRaycast;
      lines.frustumCulled = false;
      this.body.add(lines);
    }
    const pts = frag.nodes.flatMap((n) => [n.x, n.y, n.z]);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const points = new THREE.Points(pg, new THREE.PointsMaterial({ color: this.color, size: 5, sizeAttenuation: false, depthTest: false, transparent: true, opacity: 0.9 }));
    points.raycast = noRaycast;
    points.frustumCulled = false;
    this.body.add(points);
    this.group.visible = true;
  }

  /** Move the ghost under T, mark the welds, and put the anchor cross at `target`. */
  update(T: Affine, target: Vec3, welds: Vec3[], size: number): void {
    const [a, b, c, d, e, f, g, h, i] = T.A;
    this.body.matrix.set(a, b, c, T.t[0], d, e, f, T.t[1], g, h, i, T.t[2], 0, 0, 0, 1);
    this.body.matrixWorldNeedsUpdate = true;

    const wp = this.welds.geometry.getAttribute('position') as THREE.BufferAttribute;
    const n = Math.min(welds.length, MAX_WELDS);
    for (let k = 0; k < n; k++) wp.setXYZ(k, welds[k]![0], welds[k]![1], welds[k]![2]);
    wp.needsUpdate = true;
    this.welds.geometry.setDrawRange(0, n);

    const s = size;
    const ap = this.anchor.geometry.getAttribute('position') as THREE.BufferAttribute;
    const [x, y, z] = target;
    const cross = [x - s, y, z, x + s, y, z, x, y - s, z, x, y + s, z, x, y, z - s, x, y, z + s];
    for (let k = 0; k < 6; k++) ap.setXYZ(k, cross[3 * k]!, cross[3 * k + 1]!, cross[3 * k + 2]!);
    ap.needsUpdate = true;
  }

  /**
   * A preview rather than a placement: the fragment drawn once per transform, and marked points,
   * with no anchor cross and no weld rings. The copies share the fragment's geometry.
   */
  showCopies(transforms: Affine[], points: Vec3[]): void {
    for (const c of [...this.copies.children]) this.copies.remove(c);
    this.body.visible = false;
    this.anchor.visible = false;
    this.welds.visible = false;
    for (const T of transforms) {
      const g = new THREE.Group();
      g.matrixAutoUpdate = false;
      const [a, b, c, d, e, f, gg, h, i] = T.A;
      g.matrix.set(a, b, c, T.t[0], d, e, f, T.t[1], gg, h, i, T.t[2], 0, 0, 0, 1);
      for (const child of this.body.children) g.add(child.clone(false));
      this.copies.add(g);
    }
    if (this.marks) { this.group.remove(this.marks); this.marks.geometry.dispose(); this.marks = null; }
    if (points.length) {
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
      this.marks = new THREE.Points(pg, new THREE.PointsMaterial({ color: WELD_COLOR, size: 9, sizeAttenuation: false, depthTest: false, transparent: true }));
      this.marks.raycast = noRaycast;
      this.marks.frustumCulled = false;
      this.group.add(this.marks);
    }
    this.group.visible = true;
  }

  /** Back to placement drawing (one body, anchor, welds). */
  showPlacement(): void {
    for (const c of [...this.copies.children]) this.copies.remove(c);
    this.body.visible = true;
    this.anchor.visible = true;
    this.welds.visible = true;
  }

  hide(): void { this.group.visible = false; }

  dispose(): void {
    this.scene.remove(this.group);
    disposeObject(this.group);
  }
}
