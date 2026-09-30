/**
 * drawing.ts — the geometry a detailed-analysis view is allowed to render.
 *
 * # The defect this closes
 *
 * The drawing and the numbers came from two different resolvers. `section-
 * stress.ts` reconstructed an outline from the section's *name* and invented
 * thicknesses when they were missing, while the stress numbers came from Rust.
 * Nothing checked that the two described the same section, so a renamed
 * profile drew one shape and computed another.
 *
 * Here the drawing consumes the exact polygons the numerical path used, and
 * `assertSameGeometry` makes a mismatch stop the visualization instead of
 * rendering contradictory data. A guard that cannot fail proves nothing, so a
 * test deliberately feeds it a different section.
 */

import type { Section } from '../store/model.svelte';
import type { CanonicalSectionState } from './state';
import type { BendingResponse } from '../engine/wasm-solver';

/** Everything a canonical detailed-analysis drawing needs. */
export interface DrawingGeometry {
  /** Solid outlines, centroid-relative, in the numerical path's own discretization. */
  solids: Array<Array<[number, number]>>;
  /** Hole outlines, same frame. */
  holes: Array<Array<[number, number]>>;
  /** Centroid in the section's own coordinates, for labelling. */
  centroid: [number, number];
  /** Principal-axis angle from the geometric y-axis, radians. */
  principalAngle: number;
  /** Section rotation about the member axis, radians. */
  rotation: number;
  /** Bounding box of the solids, centroid-relative: [yMin, zMin, yMax, zMax]. */
  bbox: [number, number, number, number];
  /** Identity of the geometry rendered — must equal the numerical result's. */
  digest: string;
  version: number;
}

/**
 * Build drawing geometry from canonical state.
 *
 * Coordinates are shifted to be centroid-relative so the drawing shares the
 * frame the stress field is expressed in; otherwise an overlay would be offset
 * from the outline it is drawn on.
 */
export function drawingGeometry(state: CanonicalSectionState): DrawingGeometry {
  const [cy, cz] = [state.yc, state.zc];
  const shift = (poly: { vertices: Array<[number, number]> }): Array<[number, number]> =>
    poly.vertices.map((v) => [v[0] - cy, v[1] - cz] as [number, number]);

  const solids = state.geometry.polygons.filter((p) => !p.isVoid).map(shift);
  const holes = state.geometry.polygons.filter((p) => p.isVoid).map(shift);

  let [yMin, zMin, yMax, zMax] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of solids) {
    for (const [y, z] of poly) {
      if (y < yMin) yMin = y;
      if (z < zMin) zMin = z;
      if (y > yMax) yMax = y;
      if (z > zMax) zMax = z;
    }
  }

  return {
    solids,
    holes,
    centroid: [cy, cz],
    principalAngle: state.thetaP,
    rotation: state.geometry.rotation,
    bbox: [yMin, zMin, yMax, zMax],
    digest: state.digest,
    // The geometry WIRE version, not the persisted-state version: this is the
    // number the engine echoes as `geometryVersion` in its responses, and the
    // one assertSameGeometry can meaningfully compare against.
    version: state.geometry.version,
  };
}

/** Why a detailed drawing could not be produced. */
export type DrawingRefusal =
  | { kind: 'propertiesOnly'; reason: string }
  | { kind: 'notResolved' }
  | { kind: 'digestMismatch'; drawing: string; numerical: string }
  | { kind: 'versionMismatch'; drawing: number; numerical: number };

export type DrawingResult =
  | { ok: true; geometry: DrawingGeometry }
  | { ok: false; refusal: DrawingRefusal };

/**
 * Resolve the geometry a section's detailed analysis may draw.
 *
 * A properties-only section is refused rather than drawn from a schematic: a
 * catalogue thumbnail is fine for picking a profile, but feeding it to a
 * stress view would be presenting a guess as the analysed shape.
 */
export function resolveDrawingGeometry(sec: Section): DrawingResult {
  const st = sec.canonical;
  if (!st) return { ok: false, refusal: { kind: 'notResolved' } };
  if (st.kind === 'properties-only') {
    return { ok: false, refusal: { kind: 'propertiesOnly', reason: st.reason.kind } };
  }
  return { ok: true, geometry: drawingGeometry(st) };
}

/**
 * Assert that a drawing and a numerical result describe the same section.
 *
 * Called before rendering any overlay. Returns a refusal rather than throwing
 * so the caller can degrade to "no detailed view" instead of taking down the
 * panel — but it must never be ignored, because rendering past a mismatch is
 * exactly the failure this whole layer exists to prevent.
 */
export function assertSameGeometry(
  geometry: DrawingGeometry,
  numerical: Pick<BendingResponse, 'digest' | 'geometryVersion'>,
): DrawingRefusal | null {
  if (geometry.digest !== numerical.digest) {
    return { kind: 'digestMismatch', drawing: geometry.digest, numerical: numerical.digest };
  }
  // The drawing's version is the geometry wire version (state.geometry.version)
  // and the engine echoes that same number as `geometryVersion`, so this guard
  // fires when the two sides speak different schemas. (It used to compare
  // against CANONICAL_STATE_VERSION, which drawingGeometry always copied from
  // the state — a guard that could never fire.)
  if (geometry.version !== numerical.geometryVersion) {
    return { kind: 'versionMismatch', drawing: geometry.version, numerical: numerical.geometryVersion };
  }
  return null;
}

/**
 * Whether a section may receive detailed geometry-based stress analysis.
 *
 * The single predicate every detailed-analysis consumer should ask, so the
 * properties-only guard cannot be forgotten in one call site and honoured in
 * another.
 */
export function supportsDetailedAnalysis(sec: Section): boolean {
  // A section of several materials has transformed properties; the stress field the panel draws
  // is the homogeneous one, which would be wrong in every part but the reference material's.
  return sec.canonical?.kind === 'geometry-backed' && !sec.canonical.composite;
}
