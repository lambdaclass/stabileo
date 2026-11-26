// Continuous stress heatmap for frame elements and shell elements.
// Creates per-vertex colored geometries that show stress/force variation along each member.

import * as THREE from 'three';
import { prepareDiagramEvaluator3D, sampleMemberComponentMagnitudes3D, sampleMemberResultant3D } from '../engine/diagrams-3d';
import { memberForceExtrema } from '../engine/member-force-extrema';
import { boundMemberEnvelopeDiagram, boundSpatialEnvelope, memberEnvelopeOrdinates, memberSectionStation, requireConcurrentSectionForces, unavailableDiagramExtrema } from '../engine/member-diagram';
import { envelopeSourcesByMember } from '../engine/result-query';
import { computeSectionStress } from '../engine/section-stress-3d';
import type { ElementForces3D } from '../engine/types-3d';
import { heatmapColor } from './selection-helpers';
import { ensureOwnShellMaterial } from './create-shell-mesh';
import { bandValue } from '../engine/contour-scale';
import { THREEJS_CYLINDER_AXIS } from '../geometry/coordinate-system';
import { shellContourColor } from './shell-contour-colour';

export { shellContourColor };

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
}

type HeatmapStation = { t: number; value: number };

const heatmapStations = Array.from({ length: HEATMAP_SEGMENTS + 1 }, (_, index) => index / HEATMAP_SEGMENTS);

function resultantSources(ef: ElementForces3D): readonly ElementForces3D[] {
  const envelope = boundSpatialEnvelope(ef);
  if (!envelope) return [ef];
  const members = envelopeSourcesByMember(envelope);
  if (!members) throw unavailableDiagramExtrema();
  return members.map(source => {
    const member = source.get(ef.elementId);
    if (!member || member.length !== ef.length) throw unavailableDiagramExtrema();
    return member;
  });
}

export function sampleElementValues(ef: ElementForces3D, variable: HeatmapVariable, sec: SectionProps) {
  if (variable === 'stressRatio' || variable === 'vonMises' || variable === 'sigmaMax' || variable === 'tauMax') {
    requireConcurrentSectionForces(ef);
    const evaluate = (kind: Parameters<typeof prepareDiagramEvaluator3D>[1]) => prepareDiagramEvaluator3D(ef, kind);
    const n = evaluate('axial'), vy = evaluate('shearY'), vz = evaluate('shearZ');
    const mx = evaluate('torsion'), my = evaluate('momentY'), mz = evaluate('momentZ');
    const stations = heatmapStations.map(t => {
      const at = memberSectionStation({ t });
      const stress = computeSectionStress(n(at), vy(at), vz(at), mx(at), my(at), mz(at), sec.A, sec.Iz, sec.Iy, sec.h, sec.b, sec.fy ?? 355_000);
      const value = variable === 'stressRatio' ? stress.ratio : stress[variable];
      return { t, value };
    });
    return { stations, peak: Math.max(...stations.map(p => p.value)) };
  }

  if (variable === 'moment') {
    return sampleMemberComponentMagnitudes3D(resultantSources(ef), ['momentY', 'momentZ'], heatmapStations);
  }

  if (variable === 'shear') {
    const kinds = ['shearY', 'shearZ'] as const;
    return sampleMemberResultant3D(resultantSources(ef), kinds, heatmapStations);
  }

  const extrema = memberForceExtrema(ef, variable);
  if (extrema.kind === 'bounded') throw unavailableDiagramExtrema();
  const peak = Math.abs(extrema.absolute.value);
  const envelope = boundMemberEnvelopeDiagram(ef, variable);
  if (envelope) {
    const stations = memberEnvelopeOrdinates(envelope, ef.length).map(({ t, value }) => ({ t, value: Math.abs(value) }));
    return { stations, peak };
  }

  const points = [extrema.min, extrema.max];
  const read = prepareDiagramEvaluator3D(ef, variable);
  const stations = [...new Set([...heatmapStations, ...points.map(p => p.t)])].sort((a, b) => a - b).flatMap(t => {
    const value = (right: boolean) => {
      const exact = points.find(p => p.t === t && (p.side === 'right' || !!p.right) === right);
      return Math.abs(exact?.value ?? read({ t, right }));
    };
    if (t === 0 || t === 1) return [{ t, value: value(t === 0) }];
    const before = value(false), after = value(true);
    return before === after ? [{ t, value: before }] : [{ t, value: before }, { t, value: after }];
  });
  return { stations, peak };
}

/**
 * Create a CylinderGeometry with per-vertex colors based on sampled stress values.
 * The cylinder is Y-aligned (matching Three.js default) and centered at origin.
 */
export function createHeatmapCylinder(
  length: number,
  stations: readonly HeatmapStation[],
  globalMax: number,
): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(
    HEATMAP_RADIUS, HEATMAP_RADIUS,
    length,
    RADIAL_SEGMENTS,
    stations.length - 1,
    true, // open ended — no caps needed
  );

  const posAttr = geo.getAttribute('position');
  const vertexCount = posAttr.count;
  const colors = new Float32Array(vertexCount * 3);
  const tmpColor = new THREE.Color();

  const vertsPerRing = RADIAL_SEGMENTS + 1;
  for (let ring = 0; ring < stations.length; ring++) {
    const { t, value } = stations[stations.length - 1 - ring]!;
    const norm = globalMax > 1e-10 ? value / globalMax : 0;
    tmpColor.setHex(heatmapColor(norm));
    for (let v = 0; v < vertsPerRing; v++) {
      const idx = ring * vertsPerRing + v;
      posAttr.setY(idx, (t - 0.5) * length);
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


/**
 * Paint a shell face from values AT ITS CORNERS, so the colour varies across it.
 *
 * ── Why a plate should not be one colour ───────────────────────────
 *
 * The solver reports most components per ELEMENT, and painting each element
 * its own flat colour is the honest minimum — it says exactly what was
 * computed. It also looks like a mosaic: a field that is smooth in the
 * structure arrives on screen as a patchwork whose edges are mesh artefacts,
 * and a reader cannot tell a real discontinuity from a change of element.
 *
 * Averaging the element values at each shared NODE and interpolating across
 * the face is what every post-processor does with element-level results, for
 * exactly that reason. The averaging is the approximation — stated here
 * rather than implied — and it is the one that makes the picture readable.
 *
 * `amplitude` normalises: the largest magnitude for a signed component, the
 * largest value for an unsigned one.
 */
export function applyShellNodalColors(
  mesh: THREE.Mesh,
  cornerValues: readonly number[],
  range: { min: number; max: number },
  isQuad: boolean,
  /** 0: a smooth ramp; otherwise each vertex takes its band's colour (`contour-scale.ts`). */
  bands = 0,
): void {
  const geo = mesh.geometry;
  const pos = geo.getAttribute('position');
  if (!pos) return;
  const posCount = pos.count;
  const colors = new Float32Array(posCount * 3);

  /*
   * Preferred: the WEIGHT each corner has at this vertex.
   *
   * The face is subdivided for display (see `FACE_SUBDIVISIONS`), so a vertex
   * is generally not a corner — it is a point inside the face, and its value
   * is the corners' interpolated one. That is what makes the map smooth
   * instead of two flat triangles with a seam down the diagonal.
   *
   * The fallback is the old corner table, for geometry built before this
   * existed: the extruded `sections` solid, whose faces have no field to
   * interpolate across.
   */
  const weights = geo.userData?.vertexNodeWeights as number[][] | undefined;
  // The extruded solid tags each vertex with the corner it came from.
  const nodeIndex = geo.userData?.vertexNodeIndex as number[] | undefined;
  const vertexToCorner = isQuad ? [0, 1, 2, 0, 2, 3] : [0, 1, 2];
  const colour = new THREE.Color();

  for (let i = 0; i < posCount; i++) {
    let v: number;
    const w = weights?.[i];
    if (w) {
      v = 0;
      for (let k = 0; k < w.length; k++) v += w[k] * (cornerValues[k] ?? 0);
    } else if (nodeIndex && nodeIndex.length === posCount) {
      v = cornerValues[nodeIndex[i]!] ?? 0;
    } else {
      v = cornerValues[vertexToCorner[i % vertexToCorner.length] ?? 0] ?? 0;
    }
    colour.setHex(shellContourColor(bandValue(v, range.min, range.max, bands), range.min, range.max));
    colors[i * 3] = colour.r;
    colors[i * 3 + 1] = colour.g;
    colors[i * 3 + 2] = colour.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = ensureOwnShellMaterial(mesh);
  mat.vertexColors = true;
  mat.color.setHex(0xffffff);
  /* Visible whatever the render mode: wireframe faces are nearly clear at rest. */
  mat.opacity = 0.95; mat.transparent = false; mat.depthWrite = true;
  mat.needsUpdate = true;
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

/**
 * Move a shell face's vertices by its corners' displacements, `scale` times, interpolated with the
 * same weights the colours use; or, with `disp` null, put them back. The undeformed positions are
 * kept on the geometry the first time.
 */
export function displaceShellFace(mesh: THREE.Mesh, disp: ReadonlyArray<readonly [number, number, number]> | null, scale: number, isQuad: boolean): void {
  const geo = mesh.geometry;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!pos) return;
  let base = geo.userData.basePositions as Float32Array | undefined;
  if (!disp) {
    if (base) { (pos.array as Float32Array).set(base); pos.needsUpdate = true; geo.computeBoundingSphere(); }
    return;
  }
  if (!base) { base = new Float32Array(pos.array as Float32Array); geo.userData.basePositions = base; }
  const weights = geo.userData?.vertexNodeWeights as number[][] | undefined;
  const nodeIndex = geo.userData?.vertexNodeIndex as number[] | undefined;
  const vertexToCorner = isQuad ? [0, 1, 2, 0, 2, 3] : [0, 1, 2];
  const arr = pos.array as Float32Array;
  for (let i = 0; i < pos.count; i++) {
    let dx = 0, dy = 0, dz = 0;
    const w = weights?.[i];
    if (w) {
      for (let k = 0; k < w.length; k++) { const d = disp[k]; if (d) { dx += w[k]! * d[0]; dy += w[k]! * d[1]; dz += w[k]! * d[2]; } }
    } else {
      const d = disp[nodeIndex && nodeIndex.length === pos.count ? nodeIndex[i]! : vertexToCorner[i % vertexToCorner.length]!];
      if (d) { dx = d[0]; dy = d[1]; dz = d[2]; }
    }
    arr[i * 3] = base[i * 3]! + scale * dx;
    arr[i * 3 + 1] = base[i * 3 + 1]! + scale * dy;
    arr[i * 3 + 2] = base[i * 3 + 2]! + scale * dz;
  }
  pos.needsUpdate = true;
  geo.computeBoundingSphere();
}
