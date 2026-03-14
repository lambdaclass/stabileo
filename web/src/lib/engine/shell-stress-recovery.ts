// Post-processing: recover plate/quad membrane stresses from nodal displacements.
// Used when the WASM solver doesn't return plateStresses/quadStresses.
//
// For quads (MITC4): bilinear membrane stress at 2×2 Gauss points,
// extrapolated to corner nodes for smooth heatmap visualization.

import type { AnalysisResults3D, QuadStress, PlateStress } from './types-3d';

interface NodePos { x: number; y: number; z?: number }
interface QuadDef { id: number; nodes: number[]; materialId: number; thickness: number }
interface PlateDef { id: number; nodes: number[]; materialId: number; thickness: number }
interface MatDef { e: number; nu: number }

/**
 * Enrich AnalysisResults3D with quad/plate stresses computed from displacements.
 * Only runs if the results don't already contain stress data.
 */
export function enrichWithShellStresses(
  results: AnalysisResults3D,
  nodes: Map<number, NodePos>,
  quads: Map<number, QuadDef>,
  plates: Map<number, PlateDef>,
  materials: Map<number, MatDef>,
): void {
  // Build displacement lookup: nodeId → [ux, uy, uz, rx, ry, rz]
  const dispMap = new Map<number, number[]>();
  for (const d of results.displacements) {
    dispMap.set(d.nodeId, [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz]);
  }

  // Compute quad stresses if missing
  if ((!results.quadStresses || results.quadStresses.length === 0) && quads.size > 0) {
    results.quadStresses = [];
    for (const quad of quads.values()) {
      const mat = materials.get(quad.materialId);
      if (!mat) continue;
      const qs = computeQuadStress(quad, nodes, dispMap, mat.e, mat.nu);
      if (qs) results.quadStresses.push(qs);
    }
  }

  // Compute plate stresses if missing
  if ((!results.plateStresses || results.plateStresses.length === 0) && plates.size > 0) {
    results.plateStresses = [];
    for (const plate of plates.values()) {
      const mat = materials.get(plate.materialId);
      if (!mat) continue;
      const ps = computePlateStress(plate, nodes, dispMap, mat.e, mat.nu);
      if (ps) results.plateStresses.push(ps);
    }
  }
}

// ─── Quad (bilinear membrane) stress recovery ────────────────

function computeQuadStress(
  quad: QuadDef,
  nodes: Map<number, NodePos>,
  dispMap: Map<number, number[]>,
  E: number, // MPa
  nu: number,
): QuadStress | null {
  const [n0, n1, n2, n3] = quad.nodes.map(id => nodes.get(id));
  if (!n0 || !n1 || !n2 || !n3) return null;

  const coords: [number, number, number][] = [
    [n0.x, n0.y, n0.z ?? 0],
    [n1.x, n1.y, n1.z ?? 0],
    [n2.x, n2.y, n2.z ?? 0],
    [n3.x, n3.y, n3.z ?? 0],
  ];

  // Build local coordinate system
  const { ex, ey } = quadLocalAxes(coords);

  // Project to 2D local coords
  const pts2d = projectTo2D(coords, ex, ey);

  // Extract local displacements (project global ux,uy,uz to local ex,ey)
  const uLocal: number[] = [];
  for (const nid of quad.nodes) {
    const d = dispMap.get(nid) ?? [0, 0, 0, 0, 0, 0];
    // Project displacement onto local axes
    const ulx = d[0] * ex[0] + d[1] * ex[1] + d[2] * ex[2];
    const uly = d[0] * ey[0] + d[1] * ey[1] + d[2] * ey[2];
    uLocal.push(ulx, uly);
  }

  // E in solver is kN/m² (kPa), model E is in MPa → convert: 1 MPa = 1000 kN/m²
  const Ekpa = E * 1000;

  // Constitutive matrix (plane stress)
  const c = Ekpa / (1 - nu * nu);
  const D = [
    c, c * nu, 0,
    c * nu, c, 0,
    0, 0, c * (1 - nu) / 2,
  ];

  // Evaluate at 2×2 Gauss points
  const s3 = 1 / Math.sqrt(3);
  const gaussPts: [number, number][] = [[-s3, -s3], [s3, -s3], [s3, s3], [-s3, s3]];

  const gpStress: { sxx: number; syy: number; txy: number; vm: number }[] = [];

  for (const [xi, eta] of gaussPts) {
    // Shape function derivatives w.r.t. xi, eta
    const dNdxi = [
      -(1 - eta) / 4, (1 - eta) / 4, (1 + eta) / 4, -(1 + eta) / 4,
    ];
    const dNdeta = [
      -(1 - xi) / 4, -(1 + xi) / 4, (1 + xi) / 4, (1 - xi) / 4,
    ];

    // Jacobian
    let j11 = 0, j12 = 0, j21 = 0, j22 = 0;
    for (let i = 0; i < 4; i++) {
      j11 += dNdxi[i] * pts2d[i][0];
      j12 += dNdxi[i] * pts2d[i][1];
      j21 += dNdeta[i] * pts2d[i][0];
      j22 += dNdeta[i] * pts2d[i][1];
    }
    const detJ = j11 * j22 - j12 * j21;
    if (Math.abs(detJ) < 1e-20) continue;
    const invJ = [j22 / detJ, -j12 / detJ, -j21 / detJ, j11 / detJ];

    // dN/dx, dN/dy
    const dNdx: number[] = [];
    const dNdy: number[] = [];
    for (let i = 0; i < 4; i++) {
      dNdx.push(invJ[0] * dNdxi[i] + invJ[1] * dNdeta[i]);
      dNdy.push(invJ[2] * dNdxi[i] + invJ[3] * dNdeta[i]);
    }

    // Strain: eps = B * u
    let epsXx = 0, epsYy = 0, gammaXy = 0;
    for (let i = 0; i < 4; i++) {
      epsXx += dNdx[i] * uLocal[i * 2];
      epsYy += dNdy[i] * uLocal[i * 2 + 1];
      gammaXy += dNdy[i] * uLocal[i * 2] + dNdx[i] * uLocal[i * 2 + 1];
    }

    // Stress: sigma = D * eps
    const sxx = D[0] * epsXx + D[1] * epsYy + D[2] * gammaXy;
    const syy = D[3] * epsXx + D[4] * epsYy + D[5] * gammaXy;
    const txy = D[6] * epsXx + D[7] * epsYy + D[8] * gammaXy;
    const vm = Math.sqrt(sxx * sxx - sxx * syy + syy * syy + 3 * txy * txy);

    gpStress.push({ sxx, syy, txy, vm });
  }

  if (gpStress.length < 4) return null;

  // Centroidal average
  const avg = {
    sxx: gpStress.reduce((s, g) => s + g.sxx, 0) / 4,
    syy: gpStress.reduce((s, g) => s + g.syy, 0) / 4,
    txy: gpStress.reduce((s, g) => s + g.txy, 0) / 4,
    vm: gpStress.reduce((s, g) => s + g.vm, 0) / 4,
  };

  // Extrapolate Von Mises from Gauss points to corner nodes
  const nodalVonMises = extrapolateToNodes(gpStress.map(g => g.vm));

  return {
    elementId: quad.id,
    sigmaXx: avg.sxx,
    sigmaYy: avg.syy,
    tauXy: avg.txy,
    mx: 0, my: 0, mxy: 0, // Bending moments need plate DOFs — omitted in membrane-only recovery
    vonMises: avg.vm,
    nodalVonMises,
  };
}

// ─── Plate (CST membrane) stress recovery ────────────────────

function computePlateStress(
  plate: PlateDef,
  nodes: Map<number, NodePos>,
  dispMap: Map<number, number[]>,
  E: number,
  nu: number,
): PlateStress | null {
  const [n0, n1, n2] = plate.nodes.map(id => nodes.get(id));
  if (!n0 || !n1 || !n2) return null;

  const coords: [number, number, number][] = [
    [n0.x, n0.y, n0.z ?? 0],
    [n1.x, n1.y, n1.z ?? 0],
    [n2.x, n2.y, n2.z ?? 0],
  ];

  const { ex, ey } = triLocalAxes(coords);

  // Project to 2D
  const o = coords[0];
  const pts2d: [number, number][] = coords.map(c => {
    const dx = c[0] - o[0], dy = c[1] - o[1], dz = c[2] - o[2];
    return [dx * ex[0] + dy * ex[1] + dz * ex[2], dx * ey[0] + dy * ey[1] + dz * ey[2]];
  });

  // Local displacements
  const uLocal: number[] = [];
  for (const nid of plate.nodes) {
    const d = dispMap.get(nid) ?? [0, 0, 0, 0, 0, 0];
    uLocal.push(
      d[0] * ex[0] + d[1] * ex[1] + d[2] * ex[2],
      d[0] * ey[0] + d[1] * ey[1] + d[2] * ey[2],
    );
  }

  const Ekpa = E * 1000;
  const c = Ekpa / (1 - nu * nu);

  // CST B-matrix (constant strain triangle)
  const x0 = pts2d[0][0], y0 = pts2d[0][1];
  const x1 = pts2d[1][0], y1 = pts2d[1][1];
  const x2 = pts2d[2][0], y2 = pts2d[2][1];
  const area2 = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(area2) < 1e-20) return null;

  // dN/dx, dN/dy for CST
  const dNdx = [(y1 - y2) / area2, (y2 - y0) / area2, (y0 - y1) / area2];
  const dNdy = [(x2 - x1) / area2, (x0 - x2) / area2, (x1 - x0) / area2];

  let epsXx = 0, epsYy = 0, gammaXy = 0;
  for (let i = 0; i < 3; i++) {
    epsXx += dNdx[i] * uLocal[i * 2];
    epsYy += dNdy[i] * uLocal[i * 2 + 1];
    gammaXy += dNdy[i] * uLocal[i * 2] + dNdx[i] * uLocal[i * 2 + 1];
  }

  const sxx = c * (epsXx + nu * epsYy);
  const syy = c * (nu * epsXx + epsYy);
  const txy = c * (1 - nu) / 2 * gammaXy;
  const vm = Math.sqrt(sxx * sxx - sxx * syy + syy * syy + 3 * txy * txy);

  // Principal stresses
  const savg = (sxx + syy) / 2;
  const sdiff = Math.sqrt(((sxx - syy) / 2) ** 2 + txy * txy);
  const s1 = savg + sdiff;
  const s2 = savg - sdiff;

  return {
    elementId: plate.id,
    sigmaXx: sxx,
    sigmaYy: syy,
    tauXy: txy,
    mx: 0, my: 0, mxy: 0,
    sigma1: s1,
    sigma2: s2,
    vonMises: vm,
    nodalVonMises: [vm, vm, vm], // CST = constant stress → same at all nodes
  };
}

// ─── Geometry helpers ────────────────────────────────────────

function quadLocalAxes(coords: [number, number, number][]) {
  // ex = (n1 - n0) normalized, ey = ez × ex, ez = ex × (n3 - n0)
  const dx = coords[1][0] - coords[0][0];
  const dy = coords[1][1] - coords[0][1];
  const dz = coords[1][2] - coords[0][2];
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const ex = [dx / len, dy / len, dz / len];

  const v2x = coords[3][0] - coords[0][0];
  const v2y = coords[3][1] - coords[0][1];
  const v2z = coords[3][2] - coords[0][2];

  // ez = ex × v2
  const ezx = ex[1] * v2z - ex[2] * v2y;
  const ezy = ex[2] * v2x - ex[0] * v2z;
  const ezz = ex[0] * v2y - ex[1] * v2x;
  const ezLen = Math.sqrt(ezx * ezx + ezy * ezy + ezz * ezz);
  const ez = ezLen > 1e-12 ? [ezx / ezLen, ezy / ezLen, ezz / ezLen] : [0, 0, 1];

  // ey = ez × ex
  const ey = [
    ez[1] * ex[2] - ez[2] * ex[1],
    ez[2] * ex[0] - ez[0] * ex[2],
    ez[0] * ex[1] - ez[1] * ex[0],
  ];

  return { ex, ey, ez };
}

function triLocalAxes(coords: [number, number, number][]) {
  const dx = coords[1][0] - coords[0][0];
  const dy = coords[1][1] - coords[0][1];
  const dz = coords[1][2] - coords[0][2];
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const ex = [dx / len, dy / len, dz / len];

  const v2x = coords[2][0] - coords[0][0];
  const v2y = coords[2][1] - coords[0][1];
  const v2z = coords[2][2] - coords[0][2];

  const ezx = ex[1] * v2z - ex[2] * v2y;
  const ezy = ex[2] * v2x - ex[0] * v2z;
  const ezz = ex[0] * v2y - ex[1] * v2x;
  const ezLen = Math.sqrt(ezx * ezx + ezy * ezy + ezz * ezz);
  const ez = ezLen > 1e-12 ? [ezx / ezLen, ezy / ezLen, ezz / ezLen] : [0, 0, 1];

  const ey = [
    ez[1] * ex[2] - ez[2] * ex[1],
    ez[2] * ex[0] - ez[0] * ex[2],
    ez[0] * ex[1] - ez[1] * ex[0],
  ];

  return { ex, ey, ez };
}

function projectTo2D(
  coords: [number, number, number][],
  ex: number[],
  ey: number[],
): [number, number][] {
  const o = coords[0];
  return coords.map(c => {
    const dx = c[0] - o[0], dy = c[1] - o[1], dz = c[2] - o[2];
    return [dx * ex[0] + dy * ex[1] + dz * ex[2], dx * ey[0] + dy * ey[1] + dz * ey[2]] as [number, number];
  });
}

/**
 * Bilinear extrapolation from 2×2 Gauss points to 4 corner nodes.
 * Gauss points at ±1/√3, corners at ±1.
 */
function extrapolateToNodes(gpValues: number[]): number[] {
  if (gpValues.length !== 4) return gpValues;
  const s = Math.sqrt(3);
  // Corner nodes in order: (-1,-1), (1,-1), (1,1), (-1,1)
  // Gauss points in order: (-1/√3,-1/√3), (1/√3,-1/√3), (1/√3,1/√3), (-1/√3,1/√3)
  const cornerXi: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const nodal: number[] = [];

  for (const [xiN, etaN] of cornerXi) {
    const xiS = xiN * s;
    const etaS = etaN * s;
    // Bilinear shape functions evaluated at scaled point
    const N0 = (1 - xiS) * (1 - etaS) / 4;
    const N1 = (1 + xiS) * (1 - etaS) / 4;
    const N2 = (1 + xiS) * (1 + etaS) / 4;
    const N3 = (1 - xiS) * (1 + etaS) / 4;
    const val = N0 * gpValues[0] + N1 * gpValues[1] + N2 * gpValues[2] + N3 * gpValues[3];
    nodal.push(Math.max(0, val)); // Clamp non-negative
  }

  return nodal;
}
