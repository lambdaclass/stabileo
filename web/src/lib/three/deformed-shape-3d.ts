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
import { computeLocalAxes3D } from '../engine/local-axes-3d';

const SEGMENTS_PER_ELEMENT = 20;

/** EI data for both bending planes */
export interface ElementEI {
  EIy: number;  // kN·m² — E·Iy for local-Z-plane bending
  EIz: number;  // kN·m² — E·Iz for local-Y-plane bending
}

/**
 * Compute v''_p(0) and v''_p(L) for a point load P at distance aP from node I.
 * Fixed-fixed beam particular solution curvature at endpoints.
 */
function pointVpp(P: number, aP: number, L: number, EI: number): { vpp0: number; vppL: number } {
  const bP = L - aP;
  const L2 = L * L;
  return {
    vpp0: P * aP * bP * bP / (EI * L2),
    vppL: P * aP * aP * bP / (EI * L2),
  };
}

/**
 * Compute the particular solution endpoints' curvature (v''_p at 0 and L)
 * for all loads in one bending plane.
 */
function computeParticularvpp(
  distLoads: Array<{ qI: number; qJ: number; a: number; b: number }>,
  pointLoads: Array<{ a: number; p: number }>,
  L: number,
  EI: number,
): { vpp0: number; vppL: number } {
  let vpp0 = 0;
  let vppL = 0;
  const L2 = L * L;

  for (const dl of distLoads) {
    const isFullLength = dl.a < 1e-10 && Math.abs(dl.b - L) < 1e-10;
    if (isFullLength) {
      // Exact analytical for full-length trapezoidal load
      vpp0 += L2 * (4 * dl.qI + dl.qJ) / (60 * EI);
      vppL += L2 * (dl.qI + 4 * dl.qJ) / (60 * EI);
    } else {
      // Partial load: discretize via Simpson's rule
      const N = 20;
      const span = dl.b - dl.a;
      if (span < 1e-12) continue;
      const h = span / N;
      for (let j = 0; j <= N; j++) {
        const t = j / N;
        const xLoad = dl.a + t * span;
        const qAt = dl.qI + (dl.qJ - dl.qI) * t;
        let w: number;
        if (j === 0 || j === N) w = h / 3;
        else if (j % 2 === 1) w = 4 * h / 3;
        else w = 2 * h / 3;
        const dP = qAt * w;
        if (Math.abs(dP) < 1e-15) continue;
        const r = pointVpp(dP, xLoad, L, EI);
        vpp0 += r.vpp0;
        vppL += r.vppL;
      }
    }
  }

  for (const pl of pointLoads) {
    const r = pointVpp(pl.p, pl.a, L, EI);
    vpp0 += r.vpp0;
    vppL += r.vppL;
  }

  return { vpp0, vppL };
}

/**
 * Compute the particular solution deflection at position x for one bending plane.
 * This is the fixed-fixed beam deflection with zero displacement and rotation at ends.
 */
function computeParticular(
  x: number,
  distLoads: Array<{ qI: number; qJ: number; a: number; b: number }>,
  pointLoads: Array<{ a: number; p: number }>,
  L: number,
  EI: number,
): number {
  let vp = 0;
  const L3 = L * L * L;

  for (const dl of distLoads) {
    const isFullLength = dl.a < 1e-10 && Math.abs(dl.b - L) < 1e-10;
    if (isFullLength) {
      // Exact: Fixed-fixed beam under trapezoidal q(x) = qI + (qJ-qI)·x/L
      const Lmx = L - x;
      const x2Lmx2 = x * x * Lmx * Lmx;
      vp += x2Lmx2 * (dl.qI / 24 + (dl.qJ - dl.qI) * (L + x) / (120 * L)) / EI;
    } else {
      // Partial load: discretize via Simpson's rule
      const N = 20;
      const span = dl.b - dl.a;
      if (span < 1e-12) continue;
      const h = span / N;
      for (let j = 0; j <= N; j++) {
        const t = j / N;
        const xLoad = dl.a + t * span;
        const qAt = dl.qI + (dl.qJ - dl.qI) * t;
        let w: number;
        if (j === 0 || j === N) w = h / 3;
        else if (j % 2 === 1) w = 4 * h / 3;
        else w = 2 * h / 3;
        const dP = qAt * w;
        if (Math.abs(dP) < 1e-15) continue;
        const aP = xLoad, bP = L - xLoad;
        if (x <= xLoad) {
          vp += dP * bP * bP * x * x * (3 * aP * L - x * (3 * aP + bP)) / (6 * EI * L3);
        } else {
          const Lmx = L - x;
          vp += dP * aP * aP * Lmx * Lmx * (3 * bP * L - Lmx * (3 * bP + aP)) / (6 * EI * L3);
        }
      }
    }
  }

  for (const pl of pointLoads) {
    const a = pl.a, P = pl.p, b = L - a;
    if (x <= a) {
      vp += P * b * b * x * x * (3 * a * L - x * (3 * a + b)) / (6 * EI * L3);
    } else {
      const Lmx = L - x;
      vp += P * a * a * Lmx * Lmx * (3 * b * L - Lmx * (3 * b + a)) / (6 * EI * L3);
    }
  }

  return vp;
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
  leftHand?: boolean,
): THREE.Vector3[] {
  const solverNodeI = { id: 0, x: nodeI.x, y: nodeI.y, z: nodeI.z };
  const solverNodeJ = { id: 1, x: nodeJ.x, y: nodeJ.y, z: nodeJ.z };

  let axes;
  try {
    axes = computeLocalAxes3D(solverNodeI, solverNodeJ, localY, rollAngle, leftHand);
  } catch {
    return []; // zero-length element
  }

  const L = axes.L;
  const { ex, ey, ez } = axes;

  // Build rotation matrix R = [ex; ey; ez] (rows)
  // Global-to-local: uLocal = R · uGlobal
  // Local-to-global: uGlobal = R^T · uLocal

  // Transform displacements global → local
  const uI_local = ex[0] * dispI.ux + ex[1] * dispI.uy + ex[2] * dispI.uz;
  const vI_local = ey[0] * dispI.ux + ey[1] * dispI.uy + ey[2] * dispI.uz;
  const wI_local = ez[0] * dispI.ux + ez[1] * dispI.uy + ez[2] * dispI.uz;

  const uJ_local = ex[0] * dispJ.ux + ex[1] * dispJ.uy + ex[2] * dispJ.uz;
  const vJ_local = ey[0] * dispJ.ux + ey[1] * dispJ.uy + ey[2] * dispJ.uz;
  const wJ_local = ez[0] * dispJ.ux + ez[1] * dispJ.uy + ez[2] * dispJ.uz;

  // Transform rotations global → local: θ_local = R · θ_global
  // Local DOF definitions:
  //   θx_local = torsion about local X (unused for deformed shape)
  //   θy_local = rotation about local Y: θy = -dw/dx (RHR convention)
  //   θz_local = rotation about local Z: θz = +dv/dx
  //
  // For Hermite interpolation:
  //   v(ξ) in local Y plane uses θz (= dv/dx)
  //   w(ξ) in local Z plane: since θy = -dw/dx, the Hermite slope input is -θy
  const thetaYI = ey[0] * dispI.rx + ey[1] * dispI.ry + ey[2] * dispI.rz; // θy I
  const thetaZI = ez[0] * dispI.rx + ez[1] * dispI.ry + ez[2] * dispI.rz; // θz I

  const thetaYJ = ey[0] * dispJ.rx + ey[1] * dispJ.ry + ey[2] * dispJ.rz;
  const thetaZJ = ez[0] * dispJ.rx + ez[1] * dispJ.ry + ez[2] * dispJ.rz;

  // ── Local Y plane ──
  // v(ξ) uses Hermite with θz as the slope dv/dx
  const EIz = eiData?.EIz;
  const hasYLoads = EIz && EIz > 0 && (
    ef.distributedLoadsY.length > 0 || ef.pointLoadsY.length > 0
  );

  let vpp_Y0 = 0, vpp_YL = 0;
  if (hasYLoads) {
    const r = computeParticularvpp(ef.distributedLoadsY, ef.pointLoadsY, L, EIz!);
    vpp_Y0 = r.vpp0;
    vpp_YL = r.vppL;
  }

  // Hinge corrections for Y plane
  let thetaZI_adj = thetaZI;
  let thetaZJ_adj = thetaZJ;
  const dvY = vJ_local - vI_local;

  if (ef.hingeStart && ef.hingeEnd) {
    thetaZI_adj = dvY / L + L * vpp_Y0 / 3 + L * vpp_YL / 6;
    thetaZJ_adj = dvY / L - L * vpp_Y0 / 6 - L * vpp_YL / 3;
  } else if (ef.hingeStart) {
    thetaZI_adj = 3 * dvY / (2 * L) - thetaZJ / 2 + L * vpp_Y0 / 4;
  } else if (ef.hingeEnd) {
    thetaZJ_adj = 3 * dvY / (2 * L) - thetaZI / 2 - L * vpp_YL / 4;
  }

  // ── Z-plane (weak axis: My, Vz) ──
  // w(ξ) uses Hermite. Since θy = -dw/dx, the "slope" input for Hermite is -θy.
  const EIy = eiData?.EIy;
  const hasZLoads = EIy && EIy > 0 && (
    ef.distributedLoadsZ.length > 0 || ef.pointLoadsZ.length > 0
  );

  let vpp_Z0 = 0, vpp_ZL = 0;
  if (hasZLoads) {
    const r = computeParticularvpp(ef.distributedLoadsZ, ef.pointLoadsZ, L, EIy!);
    vpp_Z0 = r.vpp0;
    vpp_ZL = r.vppL;
  }

  // For w-plane: the "rotation" (dw/dx) = -θy
  let slopeZI = -thetaYI;
  let slopeZJ = -thetaYJ;
  const dvZ = wJ_local - wI_local;

  if (ef.hingeStart && ef.hingeEnd) {
    slopeZI = dvZ / L + L * vpp_Z0 / 3 + L * vpp_ZL / 6;
    slopeZJ = dvZ / L - L * vpp_Z0 / 6 - L * vpp_ZL / 3;
  } else if (ef.hingeStart) {
    slopeZI = 3 * dvZ / (2 * L) - (-thetaYJ) / 2 + L * vpp_Z0 / 4;
  } else if (ef.hingeEnd) {
    slopeZJ = 3 * dvZ / (2 * L) - (-thetaYI) / 2 - L * vpp_ZL / 4;
  }

  // ── Sample points along element ──
  const points: THREE.Vector3[] = [];
  const nPts = SEGMENTS_PER_ELEMENT + 1;

  for (let i = 0; i < nPts; i++) {
    const xi = i / (nPts - 1);
    const x = xi * L;
    const xi2 = xi * xi;
    const xi3 = xi2 * xi;

    // Hermite shape functions
    const N1 = 1 - 3 * xi2 + 2 * xi3;
    const N2 = (xi - 2 * xi2 + xi3) * L;
    const N3 = 3 * xi2 - 2 * xi3;
    const N4 = (-xi2 + xi3) * L;

    // Axial (linear)
    const uLocal = uI_local + xi * (uJ_local - uI_local);

    // Y-plane: transverse v (local Y direction)
    let vLocal = N1 * vI_local + N2 * thetaZI_adj + N3 * vJ_local + N4 * thetaZJ_adj;
    if (hasYLoads) {
      vLocal += computeParticular(x, ef.distributedLoadsY, ef.pointLoadsY, L, EIz!);
    }

    // Z-plane: transverse w (local Z direction)
    let wLocal = N1 * wI_local + N2 * slopeZI + N3 * wJ_local + N4 * slopeZJ;
    if (hasZLoads) {
      wLocal += computeParticular(x, ef.distributedLoadsZ, ef.pointLoadsZ, L, EIy!);
    }

    // Transform local displacement [uLocal, vLocal, wLocal] to global
    // δ_global = R^T · [u, v, w]  where R = [ex; ey; ez] rows
    const dxGlobal = ex[0] * uLocal + ey[0] * vLocal + ez[0] * wLocal;
    const dyGlobal = ex[1] * uLocal + ey[1] * vLocal + ez[1] * wLocal;
    const dzGlobal = ex[2] * uLocal + ey[2] * vLocal + ez[2] * wLocal;

    // Original position (linear interpolation along element axis)
    const baseX = nodeI.x + xi * (nodeJ.x - nodeI.x);
    const baseY = nodeI.y + xi * (nodeJ.y - nodeI.y);
    const baseZ = nodeI.z + xi * (nodeJ.z - nodeI.z);

    points.push(new THREE.Vector3(
      baseX + dxGlobal * scale,
      baseY + dyGlobal * scale,
      baseZ + dzGlobal * scale,
    ));
  }

  return points;
}

/**
 * Create a THREE.Group containing deformed shape lines for all elements.
 * Uses Hermite cubic interpolation + particular solution in both Y and Z planes.
 */
export function createDeformedLines(
  elements: Map<number, Element>,
  nodes: Map<number, Node>,
  displacements: Displacement3D[],
  elementForces: ElementForces3D[],
  scale: number,
  _eiMap?: Map<number, ElementEI>,
  _leftHand?: boolean,
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

  for (const [, elem] of elements) {
    const nI = nodes.get(elem.nodeI);
    const nJ = nodes.get(elem.nodeJ);
    if (!nI || !nJ) continue;

    const dI = dispMap.get(elem.nodeI);
    const dJ = dispMap.get(elem.nodeJ);
    if (!dI || !dJ) continue;

    let points: THREE.Vector3[];
    // In 3D whole-structure views, exact beam-curvature rendering makes tall
    // building deformed shapes unreadable because every loaded floor beam
    // becomes a visible cubic curve. Use straight nodal interpolation here so
    // the viewport emphasizes global drift/torsion. The exact per-member 3D
    // curve routine remains available via computeDeformedShape3D() for focused
    // element-level tools/tests.
    points = [];
    for (let i = 0; i <= SEGMENTS_PER_ELEMENT; i++) {
      const t = i / SEGMENTS_PER_ELEMENT;
      const ox = nI.x + (nJ.x - nI.x) * t;
      const oy = nI.y + (nJ.y - nI.y) * t;
      const oz = (nI.z ?? 0) + ((nJ.z ?? 0) - (nI.z ?? 0)) * t;
      const ux = dI.ux + (dJ.ux - dI.ux) * t;
      const uy = dI.uy + (dJ.uy - dI.uy) * t;
      const uz = dI.uz + (dJ.uz - dI.uz) * t;
      points.push(new THREE.Vector3(ox + ux * scale, oy + uy * scale, oz + uz * scale));
    }

    if (points.length < 2) continue;

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: COLORS.deformed,
      linewidth: 2,
    });
    const line = new THREE.Line(geo, mat);
    group.add(line);
  }

  return group;
}
