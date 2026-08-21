// Continuous stress heatmap for frame elements and shell elements.
// Creates per-vertex colored geometries that show stress/force variation along each member.

import * as THREE from 'three';
import { evaluateDiagramAt } from '../engine/diagrams-3d';
import { computeSectionStress } from '../engine/section-stress-3d';
import type { ElementForces3D } from '../engine/types-3d';
import { heatmapColor } from './selection-helpers';
import { ensureOwnShellMaterial } from './create-shell-mesh';
import { THREEJS_CYLINDER_AXIS } from '../geometry/coordinate-system';

const HEATMAP_SEGMENTS = 16; // Number of segments along each element
const HEATMAP_RADIUS = 0.07; // Slightly larger than default cylinder (0.06)
const RADIAL_SEGMENTS = 8;

/**
 * What a heat map can paint.
 *
 * `moment` and `shear` are ENVELOPE metrics kept for the 2D viewport, where a
 * frame has one bending axis and one shear: there, "the moment" is unambiguous.
 * In 3D they would hide which axis a peak is about, so 3D names the axis —
 * `momentY`, `shearZ` — and each is sampled on its own.
 */
export type HeatmapVariable =
  | 'moment' | 'shear' | 'axial'
  | 'momentY' | 'momentZ' | 'shearY' | 'shearZ' | 'torsion'
  | 'stressRatio' | 'vonMises' | 'sigmaMax' | 'tauMax';

interface SectionProps {
  A: number;
  Iz: number;
  Iy: number;
  h: number;
  b: number;
  /**
   * Yield strength in kPa (the solver's stress unit), or null when the
   * material has none. The model store carries fy in MPa; the conversion is
   * the caller's job. Null means "utilisation cannot be computed for this
   * member" — the painters skip it rather than assume a steel strength.
   */
  fy: number | null;
  /**
   * τ_max/(V/A) for this section — see `shearPeakFactor` in `section-stress`.
   *
   * Resolved once per section by the caller, because deriving it needs the
   * profile catalogue and this is read 17 times per member per load case.
   */
  shearFactor?: number;
}

/**
 * Compute the heatmap value at a given t ∈ [0,1] along an element.
 * Returns the raw (unsigned) value for normalization.
 */
function sampleValue(ef: ElementForces3D, variable: HeatmapVariable, t: number, sec: SectionProps): number {
  switch (variable) {
    case 'moment': {
      // Intentional: max of both axes for color intensity, NOT axis assignment.
      // This is an envelope metric for visualization, not a design check.
      const my = Math.abs(evaluateDiagramAt(ef, 'momentY', t));
      const mz = Math.abs(evaluateDiagramAt(ef, 'momentZ', t));
      return Math.max(my, mz);
    }
    case 'shear': {
      const vy = Math.abs(evaluateDiagramAt(ef, 'shearY', t));
      const vz = Math.abs(evaluateDiagramAt(ef, 'shearZ', t));
      return Math.sqrt(vy * vy + vz * vz);
    }
    case 'axial':
      return Math.abs(evaluateDiagramAt(ef, 'axial', t));
    // One axis at a time: the magnitude of that component, not an envelope of
    // several. A peak is only useful if you know which axis it is about.
    case 'momentY':
    case 'momentZ':
    case 'shearY':
    case 'shearZ':
    case 'torsion':
      return Math.abs(evaluateDiagramAt(ef, variable, t));
    /*
     * The four measures come from one section-stress evaluation, so offering
     * them costs nothing beyond naming them. Normal and shear separately are
     * what answer "is this member governed by bending or by shear" — a
     * question the combined Von Mises deliberately blurs.
     */
    case 'stressRatio':
    case 'vonMises':
    case 'sigmaMax':
    case 'tauMax': {
      const N = evaluateDiagramAt(ef, 'axial', t);
      const Vy = evaluateDiagramAt(ef, 'shearY', t);
      const Vz = evaluateDiagramAt(ef, 'shearZ', t);
      const Mx = evaluateDiagramAt(ef, 'torsion', t);
      const My = evaluateDiagramAt(ef, 'momentY', t);
      const Mz = evaluateDiagramAt(ef, 'momentZ', t);
      /*
       * A null fy reaches the evaluation as the default only so the ABSOLUTE
       * stresses still compute — they do not divide by anything. The ratio it
       * then produces is fictitious, which is why the stressRatio painter
       * skips a null-fy member upstream instead of sampling it.
       */
      const stress = computeSectionStress(
        N, Vy, Vz, Mx, My, Mz, sec.A, sec.Iz, sec.Iy, sec.h, sec.b,
        sec.fy ?? 355_000, sec.shearFactor,
      );
      return variable === 'stressRatio' ? stress.ratio
        : variable === 'vonMises' ? stress.vonMises
        : variable === 'sigmaMax' ? stress.sigmaMax
        : stress.tauMax;
    }
  }
}

/**
 * Sample values at all segment positions for an element.
 * Returns array of (HEATMAP_SEGMENTS + 1) values.
 */
export function sampleElementValues(
  ef: ElementForces3D,
  variable: HeatmapVariable,
  sec: SectionProps,
): number[] {
  const values: number[] = [];
  for (let i = 0; i <= HEATMAP_SEGMENTS; i++) {
    const t = i / HEATMAP_SEGMENTS;
    values.push(sampleValue(ef, variable, t, sec));
  }
  return values;
}

/**
 * Create a CylinderGeometry with per-vertex colors based on sampled stress values.
 * The cylinder is Y-aligned (matching Three.js default) and centered at origin.
 */
export function createHeatmapCylinder(
  length: number,
  values: number[],
  globalMax: number,
): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(
    HEATMAP_RADIUS, HEATMAP_RADIUS,
    length,
    RADIAL_SEGMENTS,
    HEATMAP_SEGMENTS,
    true, // open ended — no caps needed
  );

  const posAttr = geo.getAttribute('position');
  const vertexCount = posAttr.count;
  const colors = new Float32Array(vertexCount * 3);
  const tmpColor = new THREE.Color();

  // CylinderGeometry (open) has (heightSegments+1) rings of (radialSegments+1) vertices.
  // Rings go from bottom (-length/2) to top (+length/2), i.e. ring 0 = bottom = t=0
  const ringsCount = HEATMAP_SEGMENTS + 1;
  const vertsPerRing = RADIAL_SEGMENTS + 1;

  for (let ring = 0; ring < ringsCount; ring++) {
    const norm = globalMax > 1e-10 ? values[ring] / globalMax : 0;
    tmpColor.setHex(heatmapColor(norm));

    for (let v = 0; v < vertsPerRing; v++) {
      const idx = ring * vertsPerRing + v;
      colors[idx * 3] = tmpColor.r;
      colors[idx * 3 + 1] = tmpColor.g;
      colors[idx * 3 + 2] = tmpColor.b;
    }
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.5,
    metalness: 0.15,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.heatmapMesh = true;
  return mesh;
}

/**
 * Orient and position a heatmap cylinder between two nodes.
 * CylinderGeometry is Y-aligned by default, centered at origin.
 */
export function orientHeatmapMesh(
  mesh: THREE.Mesh,
  nI: { x: number; y: number; z: number },
  nJ: { x: number; y: number; z: number },
): void {
  const mx = (nI.x + nJ.x) / 2;
  const my = (nI.y + nJ.y) / 2;
  const mz = (nI.z + nJ.z) / 2;
  mesh.position.set(mx, my, mz);

  const dir = new THREE.Vector3(nJ.x - nI.x, nJ.y - nI.y, nJ.z - nI.z).normalize();
  mesh.quaternion.setFromUnitVectors(THREEJS_CYLINDER_AXIS, dir);
}

/**
 * Apply per-vertex colors to a shell mesh (plate=3 nodes, quad=4 nodes).
 * nodalValues: stress value at each node (3 for plates, 4 for quads).
 * globalMax: global maximum for normalization.
 */
export function applyShellVertexColors(
  mesh: THREE.Mesh,
  nodalValues: number[],
  globalMax: number,
  isQuad: boolean,
): void {
  const geo = mesh.geometry;
  const posCount = geo.getAttribute('position').count;
  const colors = new Float32Array(posCount * 3);
  const tmpColor = new THREE.Color();

  // Preferred path: the shell mesh tags every position vertex with its source
  // corner-node index (works for flat faces AND extruded slabs in 'sections').
  const vertexNodeIndex = geo.userData?.vertexNodeIndex as number[] | undefined;
  if (vertexNodeIndex && vertexNodeIndex.length === posCount) {
    for (let i = 0; i < posCount; i++) {
      const node = vertexNodeIndex[i];
      const v = nodalValues[node] ?? 0;
      const norm = globalMax > 1e-10 ? v / globalMax : 0;
      tmpColor.setHex(heatmapColor(norm));
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }
  } else if (!isQuad && nodalValues.length >= 3) {
    // Triangle: 3 vertices
    for (let i = 0; i < Math.min(posCount, 3); i++) {
      const norm = globalMax > 1e-10 ? nodalValues[i] / globalMax : 0;
      tmpColor.setHex(heatmapColor(norm));
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }
  } else if (isQuad && nodalValues.length >= 4) {
    // Quad: 6 vertices (triangles 0-1-2, 0-2-3)
    const vertexToNode = [0, 1, 2, 0, 2, 3];
    for (let i = 0; i < Math.min(posCount, 6); i++) {
      const norm = globalMax > 1e-10 ? nodalValues[vertexToNode[i]] / globalMax : 0;
      tmpColor.setHex(heatmapColor(norm));
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = ensureOwnShellMaterial(mesh);
  mat.vertexColors = true;
  mat.color.setHex(0xffffff);
  // Make the contour visible regardless of render mode (wireframe faces are
  // nearly transparent at rest).
  mat.opacity = 0.95; mat.transparent = false; mat.depthWrite = true;
  mat.needsUpdate = true;
}

/** Diverging blue→white→red colour for a signed, symmetric-normalised value
 *  `tn ∈ [-1, 1]`. Used for signed shell contour components (σ, moments). */
export function divergingColor(tn: number): number {
  const t = Math.max(-1, Math.min(1, tn));
  const c = new THREE.Color();
  if (t >= 0) {
    // white (0) → red (+1)
    c.setRGB(1, 1 - t, 1 - t);
  } else {
    // blue (-1) → white (0)
    const a = 1 + t; // 0..1
    c.setRGB(a, a, 1);
  }
  return c.getHex();
}

/** Flat-colour a shell face mesh by a single hex (per-element contour for
 *  quantities the solver reports only at the element level). Clears any
 *  per-vertex colour so the flat colour shows. */
export function applyShellFlatColor(mesh: THREE.Mesh, hex: number): void {
  const geo = mesh.geometry;
  if (geo.getAttribute('color')) geo.deleteAttribute('color');
  const mat = ensureOwnShellMaterial(mesh);
  mat.vertexColors = false;
  mat.color.setHex(hex);
  mat.opacity = 0.95; mat.transparent = false; mat.depthWrite = true;
  mat.needsUpdate = true;
}
