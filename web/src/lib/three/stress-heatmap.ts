// Continuous stress heatmap for frame elements and shell elements.
// Creates per-vertex colored geometries that show stress/force variation along each member.

import * as THREE from 'three';
import { evaluateDiagramAt } from '../engine/diagrams-3d';
import { computeSectionStress } from '../engine/section-stress-3d';
import type { ElementForces3D } from '../engine/types-3d';
import { heatmapColor } from './selection-helpers';

const HEATMAP_SEGMENTS = 16; // Number of segments along each element
const HEATMAP_RADIUS = 0.07; // Slightly larger than default cylinder (0.06)
const RADIAL_SEGMENTS = 8;

export type HeatmapVariable = 'moment' | 'shear' | 'axial' | 'stressRatio' | 'vonMises';

interface SectionProps {
  A: number;
  Iz: number;
  Iy: number;
  h: number;
  b: number;
  fy: number;
}

/**
 * Compute the heatmap value at a given t ∈ [0,1] along an element.
 * Returns the raw (unsigned) value for normalization.
 */
function sampleValue(ef: ElementForces3D, variable: HeatmapVariable, t: number, sec: SectionProps): number {
  switch (variable) {
    case 'moment': {
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
    case 'stressRatio':
    case 'vonMises': {
      const N = evaluateDiagramAt(ef, 'axial', t);
      const Vy = evaluateDiagramAt(ef, 'shearY', t);
      const Vz = evaluateDiagramAt(ef, 'shearZ', t);
      const Mx = evaluateDiagramAt(ef, 'torsion', t);
      const My = evaluateDiagramAt(ef, 'momentY', t);
      const Mz = evaluateDiagramAt(ef, 'momentZ', t);
      const stress = computeSectionStress(N, Vy, Vz, Mx, My, Mz, sec.A, sec.Iz, sec.Iy, sec.h, sec.b, sec.fy);
      return variable === 'stressRatio' ? stress.ratio : stress.vonMises;
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
  const yAxis = new THREE.Vector3(0, 1, 0);
  mesh.quaternion.setFromUnitVectors(yAxis, dir);
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

  if (!isQuad && nodalValues.length >= 3) {
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
  const mat = mesh.material as THREE.MeshStandardMaterial;
  mat.vertexColors = true;
  mat.color.setHex(0xffffff);
  mat.needsUpdate = true;
}
