/**
 * What a shell contour writes over the shells: the principal direction of the component on each
 * element (σ1, σ2, Mmax, Mmin), in red where it pulls and blue where it pushes, and the largest and
 * smallest values painted, with their element.
 */
import * as THREE from 'three';
import type { ContourField } from '../engine/shell-contour-field';
import type { ShellContourComponent, ShellFace } from '../engine/shell-stress';
import { shellComponentAngle, shellComponentValue, shellComponentMeta } from '../engine/shell-stress';
import { shellLocalAxes } from '../engine/shell-results';
import { createTextSprite, disposeObject } from '../three/selection-helpers';
import type { ShellStressEntry } from '../engine/shell-contour-field';

type P3 = { x: number; y: number; z: number };

export interface ShellOverlayInput {
  field: ContourField;
  stresses: { plates: readonly ShellStressEntry[]; quads: readonly ShellStressEntry[] };
  component: ShellContourComponent;
  face: ShellFace;
  directions: boolean;
  values: boolean;
  /** A shell's corners where the scene draws them. */
  corners: (key: string) => P3[] | null;
  /** A value as the legend writes it, with its unit. */
  format: (v: number) => string;
  /** Whether a shell is drawn; a hidden one gets no mark and governs no extreme. */
  shown?: (key: string) => boolean;
}

export function buildShellOverlay(o: ShellOverlayInput): THREE.Group | null {
  const shown = o.shown ?? (() => true);
  const group = new THREE.Group();
  group.name = 'shellOverlay';
  if (o.directions) {
    const pos: number[] = [], col: number[] = [];
    const red = new THREE.Color(0xd04a3a), blue = new THREE.Color(0x3a6fd0);
    for (const [prefix, list] of [['p', o.stresses.plates], ['q', o.stresses.quads]] as const) {
      for (const s of list) {
        const key = `${prefix}${s.elementId}`;
        if (!shown(key)) continue;
        const pts = o.corners(key);
        const angle = shellComponentAngle(s, o.component, o.face);
        if (!pts || angle === null) continue;
        const axes = shellLocalAxes(prefix === 'p' ? 'plate' : 'quad', pts);
        if (!axes) continue;
        const c = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length, z: a.z + p.z / pts.length }), { x: 0, y: 0, z: 0 });
        const size = Math.min(...pts.map((p, i) => { const q = pts[(i + 1) % pts.length]!; return Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z); }));
        const r = (angle * Math.PI) / 180, h = 0.35 * size;
        const d = [0, 1, 2].map((k) => Math.cos(r) * axes.ex[k]! + Math.sin(r) * axes.ey[k]!);
        pos.push(c.x - d[0]! * h, c.y - d[1]! * h, c.z - d[2]! * h, c.x + d[0]! * h, c.y + d[1]! * h, c.z + d[2]! * h);
        const tone = shellComponentValue(s, o.component, o.face) >= 0 ? red : blue;
        col.push(tone.r, tone.g, tone.b, tone.r, tone.g, tone.b);
      }
    }
    if (pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }));
      lines.renderOrder = 10;
      lines.userData.shellDirections = true;
      group.add(lines);
    }
  }
  if (o.values) {
    type At = { key: string; i: number; v: number };
    const ext: { hi: At | null; lo: At | null } = { hi: null, lo: null };
    for (const [key, vs] of o.field.corners) if (shown(key)) vs.forEach((v, i) => {
      if (!ext.hi || v > ext.hi.v) ext.hi = { key, i, v };
      if (!ext.lo || v < ext.lo.v) ext.lo = { key, i, v };
    });
    const { hi, lo } = ext;
    for (const m of hi && lo && hi.v === lo.v ? [hi] : [hi, lo]) {
      if (!m) continue;
      const p = o.corners(m.key)?.[m.i];
      if (!p) continue;
      const sprite = createTextSprite(o.format(m.v), m === hi ? '#ffb4a8' : '#a8c4ff', 30);
      sprite.position.set(p.x, p.y, p.z);
      sprite.userData.shellValue = m.v;
      group.add(sprite);
    }
  }
  return group.children.length ? group : null;
}

export function replaceShellOverlay(parent: THREE.Group, prev: THREE.Group | null | undefined, next: THREE.Group | null): THREE.Group | null {
  if (prev) { parent.remove(prev); disposeObject(prev); }
  if (next) parent.add(next);
  return next;
}

/** The unit a component's values are written in. */
export const overlayUnit = (c: ShellContourComponent) => shellComponentMeta(c).unit;
