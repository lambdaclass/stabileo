// Create Three.js lines for the 3D deformed shape visualization.
// Uses Hermite cubic interpolation + particular solution in both local bending planes.
// This is the 3D generalization of the 2D computeDeformedShape (diagrams.ts).
//
// For each element, displacements are transformed to local coordinates,
// then:
//   Local Y plane: v(ξ) = Hermite(vI, θzI, vJ, θzJ) + v_particular_Y(x)
//   Local Z plane: w(ξ) = Hermite(wI, -θyI, wJ, -θyJ) + w_particular_Z(x)
//   Axial:                          u(ξ) = uI + ξ·(uJ - uI)
// Note: θy = -dw/dx (sign convention), so we use -θy for the Hermite input.
//
// The particular solution is the fixed-fixed beam deflection from distributed
// and point loads, which has zero displacement and rotation at both ends.

import * as THREE from 'three';
import { COLORS } from './selection-helpers';
import type { Displacement3D, ElementForces3D } from '../engine/types-3d';
import type { Node, Element } from '../store/model.svelte';
import { memberLocalCurve, type ElementEI, type LocalCurve } from '../engine/member-deflection';

const SEGMENTS_PER_ELEMENT = 20;

// The curve itself — Hermite, particular solution, release corrections — is computed in
// `engine/member-deflection.ts`, which the serviceability check reads too.
export type { ElementEI };

/** A local curve back in global coordinates: base points and displaced points (× scale). */
function toGlobal(
  c: LocalCurve, nodeI: { x: number; y: number; z: number }, nodeJ: { x: number; y: number; z: number }, scale: number,
): { p0: THREE.Vector3[]; p1: THREE.Vector3[] } {
  const { ex, ey, ez } = c;
  const p0: THREE.Vector3[] = [];
  const p1: THREE.Vector3[] = [];
  for (let i = 0; i < c.xi.length; i++) {
    const xi = c.xi[i]!, u = c.u[i]!, v = c.v[i]!, w = c.w[i]!;
    const bx = nodeI.x + xi * (nodeJ.x - nodeI.x);
    const by = nodeI.y + xi * (nodeJ.y - nodeI.y);
    const bz = nodeI.z + xi * (nodeJ.z - nodeI.z);
    p0.push(new THREE.Vector3(bx, by, bz));
    p1.push(new THREE.Vector3(
      bx + (ex[0]! * u + ey[0]! * v + ez[0]! * w) * scale,
      by + (ex[1]! * u + ey[1]! * v + ez[1]! * w) * scale,
      bz + (ex[2]! * u + ey[2]! * v + ez[2]! * w) * scale,
    ));
  }
  return { p0, p1 };
}

/**
 * Compute deformed shape for one 3D element.
 *
 * Returns BOTH the base positions (scale=0) and the displaced positions
 * (scale=1) in a single pass, so a rebuild evaluates each element once.
 */
export function computeDeformedShape3DPair(
  nodeI: { id: number; x: number; y: number; z: number },
  nodeJ: { id: number; x: number; y: number; z: number },
  dispI: Displacement3D,
  dispJ: Displacement3D,
  ef: ElementForces3D,
  eiData?: ElementEI,
  localY?: { x: number; y: number; z: number },
  rollAngle?: number,
  _leftHand?: boolean,
): { p0: THREE.Vector3[]; p1: THREE.Vector3[] } {
  // The solver's own right-handed frame: the left-handed triad is how the axes are shown, not
  // how the member bends.
  const c = memberLocalCurve(nodeI, nodeJ, dispI, dispJ, ef, eiData, localY, rollAngle, false, SEGMENTS_PER_ELEMENT);
  return c ? toGlobal(c, nodeI, nodeJ, 1) : { p0: [], p1: [] };
}

/**
 * Compute deformed shape for one 3D element.
 *
 * @returns Array of global XYZ points for the deformed curve
 */
export function computeDeformedShape3D(
  nodeI: { x: number; y: number; z: number },
  nodeJ: { x: number; y: number; z: number },
  dispI: Displacement3D,
  dispJ: Displacement3D,
  ef: ElementForces3D,
  scale: number,
  eiData?: ElementEI,
  localY?: { x: number; y: number; z: number },
  rollAngle?: number,
  _leftHand?: boolean,
): THREE.Vector3[] {
  // The solver's own right-handed frame: the left-handed triad is how the axes are shown, not
  // how the member bends.
  const c = memberLocalCurve(nodeI, nodeJ, dispI, dispJ, ef, eiData, localY, rollAngle, false, SEGMENTS_PER_ELEMENT);
  return c ? toGlobal(c, nodeI, nodeJ, scale).p1 : [];
}

/**
 * Create a THREE.Group containing deformed shape lines for all elements.
 * Uses Hermite cubic interpolation + particular solution in both Y and Z planes.
 *
 * The group carries ONE LineSegments with preallocated base/displacement
 * buffers and a `userData.setScale(scale)` that rewrites positions in place —
 * animation callers update the scale without rebuilding geometry, materials
 * and lines for every element on every frame (the old behavior allocated a
 * BufferGeometry + LineBasicMaterial + Line per element per rebuild, and the
 * sync layer disposed and recreated the whole group per animation frame).
 */
export function createDeformedLines(
  elements: Map<number, Element>,
  nodes: Map<number, Node>,
  displacements: Displacement3D[],
  elementForces: ElementForces3D[],
  scale: number,
  _eiMap?: Map<number, ElementEI>,
  _leftHand?: boolean,
  sections?: Map<number, { rotation?: number }>,
): THREE.Group {
  const group = new THREE.Group();
  group.userData = { type: 'deformed' };

  // Build displacement lookup
  const dispMap = new Map<number, Displacement3D>();
  for (const d of displacements) {
    dispMap.set(d.nodeId, d);
  }

  // Build element forces lookup
  const forcesMap = new Map<number, ElementForces3D>();
  for (const ef of elementForces) {
    forcesMap.set(ef.elementId, ef);
  }

  // Per-point base positions and displacement vectors (scale-independent).
  // points(scale=0) IS the base; points(scale=1) − base IS the displacement.
  const bases: number[] = [];
  const disps: number[] = [];
  for (const [, elem] of elements) {
    const nI = nodes.get(elem.nodeI);
    const nJ = nodes.get(elem.nodeJ);
    if (!nI || !nJ) continue;

    const dI = dispMap.get(elem.nodeI);
    const dJ = dispMap.get(elem.nodeJ);
    if (!dI || !dJ) continue;

    let p0: THREE.Vector3[] = [];
    let p1: THREE.Vector3[] = [];
    const ef = forcesMap.get(elem.id);
    const eiEntry = _eiMap?.get(elem.id);

    // Use full Hermite + particular solution when element forces and EI are
    // available — this shows mid-span bending for single-span beams where
    // both ends have zero displacement (e.g. simply supported beam).
    // Fall back to linear interpolation when forces are missing.
    if (ef && eiEntry) {
      const localY = (elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined)
        ? { x: elem.localYx, y: elem.localYy, z: elem.localYz } : undefined;
      // Effective roll = element rollAngle + section rotation, matching the
      // solver convention (solver-service.ts). Without the section term the
      // deformed curve lies in the wrong plane for rotated sections.
      const secRot = sections?.get(elem.sectionId)?.rotation ?? 0;
      const rollAngle = (elem.rollAngle ?? 0) + secRot;
      try {
        const pair = computeDeformedShape3DPair(
          { id: elem.nodeI, x: nI.x, y: nI.y, z: nI.z ?? 0 },
          { id: elem.nodeJ, x: nJ.x, y: nJ.y, z: nJ.z ?? 0 },
          dI, dJ, ef, eiEntry,
          localY, rollAngle, false,
        );
        p0 = pair.p0;
        p1 = pair.p1;
      } catch {
        p0 = []; p1 = [];
      }
    } else {
      for (let i = 0; i <= SEGMENTS_PER_ELEMENT; i++) {
        const t = i / SEGMENTS_PER_ELEMENT;
        const ox = nI.x + (nJ.x - nI.x) * t;
        const oy = nI.y + (nJ.y - nI.y) * t;
        const oz = (nI.z ?? 0) + ((nJ.z ?? 0) - (nI.z ?? 0)) * t;
        const ux = dI.ux + (dJ.ux - dI.ux) * t;
        const uy = dI.uy + (dJ.uy - dI.uy) * t;
        const uz = dI.uz + (dJ.uz - dI.uz) * t;
        p0.push(new THREE.Vector3(ox, oy, oz));
        p1.push(new THREE.Vector3(ox + ux, oy + uy, oz + uz));
      }
    }

    if (p0.length < 2 || p0.length !== p1.length) continue;

    // LineSegments takes point PAIRS: p[i] → p[i+1] per segment.
    for (let i = 0; i < p0.length - 1; i++) {
      const a0 = p0[i], b0 = p0[i + 1];
      const a1 = p1[i], b1 = p1[i + 1];
      bases.push(a0.x, a0.y, a0.z, b0.x, b0.y, b0.z);
      disps.push(a1.x - a0.x, a1.y - a0.y, a1.z - a0.z, b1.x - b0.x, b1.y - b0.y, b1.z - b0.z);
    }
  }

  const base = new Float32Array(bases);
  const disp = new Float32Array(disps);
  const positions = new Float32Array(base.length);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color: COLORS.deformed,
    linewidth: 2,
  });
  const setScale = (s: number) => {
    for (let i = 0; i < positions.length; i++) positions[i] = base[i] + s * disp[i];
    geo.attributes.position.needsUpdate = true;
  };
  setScale(scale);
  group.add(new THREE.LineSegments(geo, mat));
  group.userData.setScale = setScale;
  group.userData.material = mat;

  return group;
}

/**
 * The deformed shape of the SHELLS.
 *
 * ── Why this exists ────────────────────────────────────────────────
 *
 * `createDeformedLines` walks `elements`, which are members. A raft modelled
 * the correct way — plates with a thickness and no bars — therefore produced
 * an empty deformed shape: the slider moved and nothing on screen answered,
 * on a structure whose whole behaviour IS its deflection.
 *
 * Each face is drawn as its outline through the displaced corners, which is
 * the deformed mesh every post-processor draws and is what makes a dishing
 * raft read as a dish. Corner displacements only: the field inside a shell is
 * the element's own shape functions, and interpolating between four corners
 * is the honest approximation — the same one the stress contour makes, and
 * for the same reason.
 */
export function createDeformedShells(
  plates: Map<number, { nodes: readonly number[] }>,
  quads: Map<number, { nodes: readonly number[] }>,
  nodes: Map<number, Node>,
  displacements: Displacement3D[],
  scale: number,
  color = 0x22d3a5,
): THREE.Group {
  const group = new THREE.Group();
  group.userData = { type: 'deformedShells' };

  const byNode = new Map<number, Displacement3D>();
  for (const d of displacements) byNode.set(d.nodeId, d);

  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });

  const outline = (ids: readonly number[]) => {
    const pts: THREE.Vector3[] = [];
    for (const id of ids) {
      const n = nodes.get(id);
      if (!n) return;
      const d = byNode.get(id);
      pts.push(new THREE.Vector3(
        n.x + (d?.ux ?? 0) * scale,
        (n.y ?? 0) + (d?.uy ?? 0) * scale,
        ((n as { z?: number }).z ?? 0) + (d?.uz ?? 0) * scale,
      ));
    }
    if (pts.length < 3) return;
    pts.push(pts[0].clone());
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  };

  for (const [, p] of plates) outline(p.nodes);
  for (const [, q] of quads) outline(q.nodes);
  return group;
}
