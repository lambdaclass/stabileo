// Batched load-arrow rendering — the draw-call fix for load-heavy models.
//
// create-load-arrow.ts builds one THREE.Group per load, and each ArrowHelper is
// a Line + a Mesh with two fresh materials: ~18 draw calls per distributed load,
// ~35 per surface load. With "all the loads" on a real structure (a load per
// member + one per shell quad) that is 15-30k draw calls — every frame that
// renders the full scene (wheel-zoom tick, keyboard nav, orbit damping tail,
// drag end) turns GPU-bound, and each syncLoads rebuild pays the CPU to create
// ~10k material instances.
//
// This module produces the SAME visuals (same lengths, head sizes, colors,
// label positions) from the SAME inputs, but accumulates everything into five
// renderable objects total:
//   - one LineSegments for all arrow shafts          (vertex colors, opaque)
//   - one LineSegments for envelopes / outlines      (vertex colors, 0.5 alpha)
//   - one InstancedMesh for every arrowhead cone     (per-instance color)
//   - one InstancedMesh for curved-moment torus arcs (per-instance color)
//   - one Mesh for all surface-load fill quads       (vertex colors, 0.15 alpha)
// Labels stay sprites (one draw call each) but share cached canvas textures
// (createTextSpriteCached), so repeated "5.0 kN/m²" labels cost one texture.
//
// Loads are never raycast (picking is scoped to nodesParent/elementsParent),
// so dropping the per-load userData is safe. Batched objects are overlay
// visuals: depthTest/depthWrite off, renderOrder 3, frustumCulled off — the
// same flags syncLoads used to stamp onto every child via traverse().
//
// Reactions/constraint forces keep using create-load-arrow.ts (few per model).

import * as THREE from 'three';
import { COLORS, createTextSpriteCached } from './selection-helpers';
import {
  GLOBAL_X, GLOBAL_Y, GLOBAL_Z,
  GRAVITY_VECTOR_3D, UP_VECTOR,
  THREEJS_CYLINDER_AXIS,
} from '../geometry/coordinate-system';

const ARROW_SCALE_MAX = 2.5;
const ARROW_HEAD_LENGTH = 0.12;
const ARROW_HEAD_WIDTH = 0.05;

/** Same scaling rule as create-load-arrow.ts. */
function arrowLength(magnitude: number, maxMag: number): number {
  if (maxMag < 1e-10) return 1.0;
  return (Math.abs(magnitude) / maxMag) * ARROW_SCALE_MAX;
}

interface ConeInstance {
  tipX: number; tipY: number; tipZ: number;       // world position of the cone tip
  qx: number; qy: number; qz: number; qw: number; // orientation (unit +Y → dir)
  sx: number; sy: number; sz: number;             // headWidth, headLength, headWidth
  color: number;
}

interface TorusInstance {
  px: number; py: number; pz: number;
  qx: number; qy: number; qz: number; qw: number;
  color: number;
}

interface LabelInstance {
  text: string; colorHex: string; fontSize: number;
  x: number; y: number; z: number;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);

export class LoadArrowsBatched {
  private shaftPos: number[] = [];
  private shaftCol: number[] = [];
  private envPos: number[] = [];
  private envCol: number[] = [];
  private fillPos: number[] = [];
  private fillCol: number[] = [];
  private cones: ConeInstance[] = [];
  private toruses: TorusInstance[] = [];
  private labels: LabelInstance[] = [];

  // ── Accumulator primitives ─────────────────────────────────

  private segment(a: THREE.Vector3, b: THREE.Vector3, color: number, into: { pos: number[]; col: number[] }): void {
    into.pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    const c = new THREE.Color(color);
    into.col.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }

  private shaft(a: THREE.Vector3, b: THREE.Vector3, color: number): void {
    this.segment(a, b, color, { pos: this.shaftPos, col: this.shaftCol });
  }

  private envelope(a: THREE.Vector3, b: THREE.Vector3, color: number): void {
    this.segment(a, b, color, { pos: this.envPos, col: this.envCol });
  }

  /** Arrow equivalent to ArrowHelper(dir, origin, len, color, headLen, headWid):
   *  shaft from origin toward the tip, cone tip landing at origin + dir·len. */
  private arrow(dir: THREE.Vector3, origin: THREE.Vector3, len: number, color: number, headLen: number, headWid: number): void {
    const shaftLen = Math.max(0.0001, len - headLen);
    this.shaft(origin, origin.clone().addScaledVector(dir, shaftLen), color);
    const tip = origin.clone().addScaledVector(dir, len);
    const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dir);
    this.cones.push({
      tipX: tip.x, tipY: tip.y, tipZ: tip.z,
      qx: q.x, qy: q.y, qz: q.z, qw: q.w,
      sx: headWid, sy: headLen, sz: headWid,
      color,
    });
  }

  private label(text: string, colorHex: string, fontSize: number, at: THREE.Vector3): void {
    this.labels.push({ text, colorHex, fontSize, x: at.x, y: at.y, z: at.z });
  }

  /** Double-chevron moment arrow (>>---) along `axis`, right-hand rule. */
  private doubleMomentArrow(origin: THREE.Vector3, axis: THREE.Vector3, val: number, color: number): void {
    const shaftLen = 0.7;
    const dir = axis.clone();
    if (val < 0) dir.negate();
    const tail = origin.clone().addScaledVector(dir, -shaftLen / 2);
    const tip = origin.clone().addScaledVector(dir, shaftLen / 2);
    this.shaft(tail, tip, color);
    const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dir);
    // Two arrowheads, one at the tip and one a head-length behind (double chevron).
    for (const back of [0, ARROW_HEAD_LENGTH]) {
      this.cones.push({
        tipX: tip.x - dir.x * back, tipY: tip.y - dir.y * back, tipZ: tip.z - dir.z * back,
        qx: q.x, qy: q.y, qz: q.z, qw: q.w,
        sx: ARROW_HEAD_WIDTH, sy: ARROW_HEAD_LENGTH, sz: ARROW_HEAD_WIDTH,
        color,
      });
    }
  }

  /** Curved (270° torus arc) moment indicator with a cone at the arc tip. */
  private curvedMomentArrow(origin: THREE.Vector3, axis: THREE.Vector3, val: number, color: number): void {
    const arcRadius = 0.2;
    const arcAngle = Math.PI * 1.5;

    const quat = new THREE.Quaternion().setFromUnitVectors(GLOBAL_Z, axis);
    this.toruses.push({
      px: origin.x, py: origin.y, pz: origin.z,
      qx: quat.x, qy: quat.y, qz: quat.z, qw: quat.w,
      color,
    });

    // Arrowhead cone at the arc tip (same placement math as create-load-arrow).
    const ccw = val > 0;
    const tipAngle = ccw ? arcAngle : 0;
    const tipLocal = new THREE.Vector3(Math.cos(tipAngle) * arcRadius, Math.sin(tipAngle) * arcRadius, 0);
    const tangentLocal = new THREE.Vector3(-Math.sin(tipAngle), Math.cos(tipAngle), 0);
    if (!ccw) tangentLocal.negate();
    const tipWorld = tipLocal.applyQuaternion(quat).add(origin);
    const tangentWorld = tangentLocal.applyQuaternion(quat).normalize();

    const coneHeight = 0.05;
    const coneRadius = 0.02;
    // The shared cone geometry is tip-anchored; old code centered the cone at
    // tipWorld, so anchor the tip half a cone-height ahead along the tangent.
    const anchor = tipWorld.clone().addScaledVector(tangentWorld, coneHeight / 2);
    const q = new THREE.Quaternion().setFromUnitVectors(THREEJS_CYLINDER_AXIS, tangentWorld);
    this.cones.push({
      tipX: anchor.x, tipY: anchor.y, tipZ: anchor.z,
      qx: q.x, qy: q.y, qz: q.z, qw: q.w,
      sx: coneRadius * 2, sy: coneHeight, sz: coneRadius * 2,
      color,
    });
  }

  // ── Public load API (same inputs as the create-load-arrow functions) ──

  addNodalLoadArrow(
    pos: { x: number; y: number; z: number },
    fx: number, fy: number, fz: number,
    mx: number, my: number, mz: number,
    maxForce: number,
    momentStyle: 'double-arrow' | 'curved' = 'double-arrow',
    caseColor?: number,
  ): void {
    const origin = new THREE.Vector3(pos.x, pos.y, pos.z);
    const forceColor = caseColor ?? COLORS.load;
    const labelHex = '#' + new THREE.Color(forceColor).getHexString();

    const forces = [
      { val: fx, dir: GLOBAL_X.clone() },
      { val: fy, dir: GLOBAL_Y.clone() },
      { val: fz, dir: GLOBAL_Z.clone() },
    ];
    for (const f of forces) {
      if (Math.abs(f.val) < 1e-10) continue;
      const dir = f.dir.clone();
      if (f.val < 0) dir.negate();
      const len = arrowLength(f.val, maxForce);
      const farEnd = origin.clone().addScaledVector(dir, -len);
      this.arrow(dir, farEnd, len, forceColor, ARROW_HEAD_LENGTH, ARROW_HEAD_WIDTH);
      this.label(`${f.val.toFixed(1)} kN`, labelHex, 28,
        farEnd.clone().addScaledVector(dir, -0.15));
    }

    const moments = [
      { val: mx, axis: GLOBAL_X.clone() },
      { val: my, axis: GLOBAL_Y.clone() },
      { val: mz, axis: GLOBAL_Z.clone() },
    ];
    for (const m of moments) {
      if (Math.abs(m.val) < 1e-10) continue;
      if (momentStyle === 'double-arrow') {
        this.doubleMomentArrow(origin, m.axis, m.val, COLORS.moment);
      } else {
        this.curvedMomentArrow(origin, m.axis, m.val, COLORS.moment);
      }
      this.label(`${m.val.toFixed(1)} kN·m`, '#ffaa44', 24,
        origin.clone().addScaledVector(m.axis, 0.35));
    }
  }

  addDistributedLoad(
    nI: { x: number; y: number; z: number },
    nJ: { x: number; y: number; z: number },
    qI: number, qJ: number,
    maxQ: number,
    axis: 'Y' | 'Z' = 'Y',
    localAxisDir?: { x: number; y: number; z: number },
    caseColor?: number,
  ): void {
    const pI = new THREE.Vector3(nI.x, nI.y, nI.z);
    const pJ = new THREE.Vector3(nJ.x, nJ.y, nJ.z);
    const length = pJ.clone().sub(pI).length();
    if (length < 1e-10) return;

    const avgQ = (qI + qJ) / 2;
    const sign = avgQ < 0 ? -1 : 1;
    let loadDir: THREE.Vector3;
    if (localAxisDir) {
      loadDir = new THREE.Vector3(localAxisDir.x, localAxisDir.y, localAxisDir.z)
        .normalize().multiplyScalar(sign);
    } else {
      loadDir = axis === 'Z'
        ? GLOBAL_Z.clone().multiplyScalar(sign)
        : GLOBAL_Y.clone().multiplyScalar(sign);
    }

    const defaultColor = axis === 'Z' ? 0xff8844 : COLORS.load;
    const arrowColor = caseColor ?? defaultColor;
    const labelColor = '#' + new THREE.Color(arrowColor).getHexString();

    const numArrows = 7;
    for (let i = 0; i <= numArrows; i++) {
      const t = i / numArrows;
      const pos = pI.clone().lerp(pJ, t);
      const q = qI + (qJ - qI) * t;
      if (Math.abs(q) < 1e-10) continue;
      const len = arrowLength(q, maxQ) * 0.6;
      const farEnd = pos.clone().addScaledVector(loadDir, -len);
      this.arrow(loadDir, farEnd, len, arrowColor, ARROW_HEAD_LENGTH * 0.8, ARROW_HEAD_WIDTH * 0.8);
    }

    if (Math.abs(qI) > 1e-10) {
      this.label(`${qI.toFixed(1)} kN/m`, labelColor, 24,
        pI.clone().addScaledVector(loadDir, -(arrowLength(qI, maxQ) * 0.6 + 0.2)));
    }
    if (Math.abs(qJ) > 1e-10 && Math.abs(qJ - qI) > 0.01) {
      this.label(`${qJ.toFixed(1)} kN/m`, labelColor, 24,
        pJ.clone().addScaledVector(loadDir, -(arrowLength(qJ, maxQ) * 0.6 + 0.2)));
    }

    // Envelope polyline through the arrow tails.
    let prev: THREE.Vector3 | null = null;
    for (let i = 0; i <= numArrows; i++) {
      const t = i / numArrows;
      const pos = pI.clone().lerp(pJ, t);
      const q = qI + (qJ - qI) * t;
      const len = Math.abs(q) > 1e-10 ? arrowLength(q, maxQ) * 0.6 : 0;
      const tailPt = pos.clone().addScaledVector(loadDir, -len);
      if (prev) this.envelope(prev, tailPt, arrowColor);
      prev = tailPt;
    }
  }

  addSurfaceLoad(
    nodes: Array<{ x: number; y: number; z: number }>,
    q: number,
    maxQ: number,
    caseColor?: number,
  ): void {
    if (Math.abs(q) < 1e-10 || nodes.length < 4) return;

    const p0 = new THREE.Vector3(nodes[0].x, nodes[0].y, nodes[0].z ?? 0);
    const p1 = new THREE.Vector3(nodes[1].x, nodes[1].y, nodes[1].z ?? 0);
    const p2 = new THREE.Vector3(nodes[2].x, nodes[2].y, nodes[2].z ?? 0);
    const p3 = new THREE.Vector3(nodes[3].x, nodes[3].y, nodes[3].z ?? 0);

    const lerpQuad = (u: number, v: number): THREE.Vector3 => {
      const a = p0.clone().lerp(p1, u);
      const b = p3.clone().lerp(p2, u);
      return a.lerp(b, v);
    };

    const loadDir = q > 0 ? GRAVITY_VECTOR_3D.clone() : UP_VECTOR.clone();
    const arrowColor = caseColor ?? COLORS.load;

    const N = 3;
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const pos = lerpQuad(i / N, j / N);
        const len = arrowLength(q, maxQ) * 0.5;
        const farEnd = pos.clone().addScaledVector(loadDir, -len);
        this.arrow(loadDir, farEnd, len, arrowColor, ARROW_HEAD_LENGTH * 0.7, ARROW_HEAD_WIDTH * 0.7);
      }
    }

    // Translucent fill at arrow-tail height (two triangles).
    const offset = arrowLength(q, maxQ) * 0.5;
    const corners = [
      lerpQuad(0, 0).addScaledVector(loadDir, -offset),
      lerpQuad(1, 0).addScaledVector(loadDir, -offset),
      lerpQuad(1, 1).addScaledVector(loadDir, -offset),
      lerpQuad(0, 1).addScaledVector(loadDir, -offset),
    ];
    const c = new THREE.Color(arrowColor);
    for (const tri of [[0, 1, 2], [0, 2, 3]]) {
      for (const k of tri) {
        this.fillPos.push(corners[k].x, corners[k].y, corners[k].z);
        this.fillCol.push(c.r, c.g, c.b);
      }
    }

    // Outline at arrow tails.
    for (let k = 0; k < 4; k++) {
      this.envelope(corners[k], corners[(k + 1) % 4], arrowColor);
    }

    const center = lerpQuad(0.5, 0.5);
    const labelHex = '#' + new THREE.Color(arrowColor).getHexString();
    this.label(`${q.toFixed(1)} kN/m²`, labelHex, 26,
      center.addScaledVector(loadDir, -(offset + 0.2)));
  }

  // ── Build the renderable group ─────────────────────────────

  build(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'loadsBatched';

    const overlay = <T extends THREE.Object3D>(o: T): T => {
      o.renderOrder = 3;
      o.frustumCulled = false; // spans the whole model; always drawn
      return o;
    };

    if (this.shaftPos.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(this.shaftPos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(this.shaftCol, 3));
      const mat = new THREE.LineBasicMaterial({
        vertexColors: true, toneMapped: false, depthTest: false, depthWrite: false,
      });
      group.add(overlay(new THREE.LineSegments(geo, mat)));
    }

    if (this.envPos.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(this.envPos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(this.envCol, 3));
      const mat = new THREE.LineBasicMaterial({
        vertexColors: true, toneMapped: false, transparent: true, opacity: 0.5,
        depthTest: false, depthWrite: false,
      });
      group.add(overlay(new THREE.LineSegments(geo, mat)));
    }

    if (this.cones.length > 0) {
      // Same shape as ArrowHelper's cone: base radius 0.5·(w/0.5), unit height,
      // translated so the tip sits at the local origin.
      const geo = new THREE.ConeGeometry(0.5, 1, 8, 1);
      geo.translate(0, -0.5, 0);
      const mat = new THREE.MeshBasicMaterial({ toneMapped: false, depthTest: false, depthWrite: false });
      const mesh = new THREE.InstancedMesh(geo, mat, this.cones.length);
      const m = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scl = new THREE.Vector3();
      const col = new THREE.Color();
      this.cones.forEach((cn, i) => {
        m.compose(
          pos.set(cn.tipX, cn.tipY, cn.tipZ),
          quat.set(cn.qx, cn.qy, cn.qz, cn.qw),
          scl.set(cn.sx, cn.sy, cn.sz),
        );
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, col.setHex(cn.color));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      group.add(overlay(mesh));
    }

    if (this.toruses.length > 0) {
      const geo = new THREE.TorusGeometry(0.2, 0.007, 8, 24, Math.PI * 1.5);
      const mat = new THREE.MeshBasicMaterial({ toneMapped: false, depthTest: false, depthWrite: false });
      const mesh = new THREE.InstancedMesh(geo, mat, this.toruses.length);
      const m = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const one = new THREE.Vector3(1, 1, 1);
      const col = new THREE.Color();
      this.toruses.forEach((tr, i) => {
        m.compose(pos.set(tr.px, tr.py, tr.pz), quat.set(tr.qx, tr.qy, tr.qz, tr.qw), one);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, col.setHex(tr.color));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      group.add(overlay(mesh));
    }

    if (this.fillPos.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(this.fillPos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(this.fillCol, 3));
      const mat = new THREE.MeshBasicMaterial({
        vertexColors: true, toneMapped: false, transparent: true, opacity: 0.15,
        side: THREE.DoubleSide, depthTest: false, depthWrite: false,
      });
      group.add(overlay(new THREE.Mesh(geo, mat)));
    }

    for (const l of this.labels) {
      const sprite = createTextSpriteCached(l.text, l.colorHex, l.fontSize);
      sprite.position.set(l.x, l.y, l.z);
      sprite.renderOrder = 3;
      group.add(sprite);
    }

    return group;
  }
}

export function createLoadArrowsBatched(): LoadArrowsBatched {
  return new LoadArrowsBatched();
}
