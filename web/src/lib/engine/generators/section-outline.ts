/**
 * The outline of a built-up section, ready to draw beside the row that defines it.
 *
 * ── Why the real outline and not an icon ────────────────────────────
 *
 * Because the thing a user needs to see is exactly what a generic icon cannot show: whether
 * the two channels are back to back or toe to toe, which way round the profile is after a
 * 90° rotation, and how big 8 mm of gap actually looks against a 100 mm web. A picture of
 * "a channel" answers none of those, and the arrangement names — `][` against `[]` — are
 * precisely the kind of distinction that is obvious in a drawing and easy to get wrong from
 * a label.
 *
 * So the polygons are the canonical ones the geometry engine produced for that profile,
 * replicated through the SAME placement table `composeBuiltUp` uses for its arithmetic. The
 * drawing and the properties are therefore two projections of one description: if the
 * picture shows the parts further apart than the numbers assumed, one of them is a bug and
 * the tests can find it.
 *
 * ── When there is nothing to draw ───────────────────────────────────
 *
 * A properties-only family has no outline, and this returns none with a reason rather than a
 * plausible rectangle. Inventing an outline for a profile whose geometry the app has just
 * finished refusing to claim would be the same over-claim in a smaller box.
 *
 * Pure: no store, no runes, no i18n, no DOM.
 */

import { ARRANGEMENTS, type BuiltUpArrangement } from './built-up-section';
import { resolveProfile, canCompose } from './profile-resolve';

export interface OutlinePolygon {
  /** `[y, z]` in metres, referred to the assembly centroid. */
  vertices: Array<[number, number]>;
  isVoid: boolean;
}

/**
 * Why there is no outline to draw.
 *
 *   `unknownProfile`      the name is not in the catalogue
 *   `noGeometry`          the family is properties-only: no outline exists
 *   `arrangementRefused`  the arrangement cannot be built from this profile — `canCompose`
 *
 * An array with the type derived from it, for the same reason as `BUILT_UP_TORSION_BASES`:
 * each becomes an i18n key through `outlineUnavailableKey`, and the locale test enumerates
 * the list so a value added here fails until it is translated.
 */
export const OUTLINE_UNAVAILABLE_REASONS = [
  'unknownProfile', 'noGeometry', 'arrangementRefused',
] as const;

export type OutlineUnavailable = (typeof OUTLINE_UNAVAILABLE_REASONS)[number];

export interface SectionOutline {
  polygons: OutlinePolygon[];
  /** Bounding box of the polygons, padded. Zero-sized never. */
  viewBox: { x: number; y: number; w: number; h: number };
  /** How many copies of the profile are drawn. */
  count: number;
  unavailable?: OutlineUnavailable;
}

const EMPTY = (unavailable: OutlineUnavailable): SectionOutline => ({
  polygons: [], viewBox: { x: -1, y: -1, w: 2, h: 2 }, count: 0, unavailable,
});

export interface OutlineOptions {
  profileName: string;
  arrangement: BuiltUpArrangement;
  gapMm: number;
  /** Rotation of the whole assembly about the member axis, degrees. `'auto'` draws unrotated. */
  rotationDeg: number | 'auto';
  /** Padding as a fraction of the larger dimension. */
  marginFraction?: number;
}

/**
 * Memoised, because the 3-D viewport asks per ELEMENT.
 *
 * Switching a 625-member shed into extruded-section mode calls this once per member, and
 * every miss reaches the WASM geometry engine through `resolveProfile`. The answer depends
 * only on the four inputs and the engine is deterministic, so a plain map is the whole
 * cache-invalidation story: there is no state that can go stale.
 */
const cache = new Map<string, SectionOutline>();

/** Test hook. Never called by app code. */
export function _clearOutlineCache(): void {
  cache.clear();
}

/**
 * Build the outline.
 *
 * Never throws. Every refusal comes back as `unavailable` with a reason the caller can show,
 * because this runs on every keystroke in a profile row and on every element of a render, and
 * an exception in either place would take the surface down.
 */
export function buildSectionOutline(opts: OutlineOptions): SectionOutline {
  const key = `${opts.profileName}|${opts.arrangement}|${Math.max(0, opts.gapMm)}|${opts.rotationDeg}|${opts.marginFraction ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const built = compute(opts);
  cache.set(key, built);
  return built;
}

function compute(opts: OutlineOptions): SectionOutline {
  const resolved = resolveProfile(opts.profileName);
  if (!resolved) return EMPTY('unknownProfile');
  if (resolved.polygons.length === 0) return EMPTY('noGeometry');
  if (canCompose(resolved, opts.arrangement)) return EMPTY('arrangementRefused');

  const spec = ARRANGEMENTS[opts.arrangement];
  const gap = Math.max(0, opts.gapMm) / 1000;
  const places = spec.place(resolved.profile.extent, gap);

  // The assembly centroid, computed the same way `composeBuiltUp` computes it — equal areas,
  // so it is the mean of the placements. Subtracted so the drawing is centred on the axis
  // the properties are referred to, which is what makes the two comparable.
  const yBar = places.reduce((s, p) => s + p.dy, 0) / places.length;
  const zBar = places.reduce((s, p) => s + p.dz, 0) / places.length;

  const theta = opts.rotationDeg === 'auto' ? 0 : (opts.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  const polygons: OutlinePolygon[] = [];
  for (const place of places) {
    for (const poly of resolved.polygons) {
      polygons.push({
        isVoid: poly.isVoid,
        vertices: poly.vertices.map(([y, z]) => {
          // Mirror in the copy's own frame, then place, then rotate the assembly.
          const my = place.mirrorY ? -y : y;
          const mz = place.mirrorZ ? -z : z;
          const py = my + place.dy - yBar;
          const pz = mz + place.dz - zBar;
          return [py * cos - pz * sin, py * sin + pz * cos] as [number, number];
        }),
      });
    }
  }

  return {
    polygons,
    count: places.length,
    viewBox: fit(polygons, opts.marginFraction ?? 0.12),
  };
}

function fit(polygons: readonly OutlinePolygon[], marginFraction: number): SectionOutline['viewBox'] {
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of polygons) {
    for (const [y, z] of p.vertices) {
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
  }
  if (!Number.isFinite(minY)) return { x: -1, y: -1, w: 2, h: 2 };
  // Never zero: a plate-thin profile would otherwise get a box of no height and draw nothing.
  const w = Math.max(maxY - minY, 1e-6);
  const h = Math.max(maxZ - minZ, 1e-6);
  const margin = Math.max(w, h) * marginFraction;
  return { x: minY - margin, y: minZ - margin, w: w + margin * 2, h: h + margin * 2 };
}

/**
 * The overall width and depth of the drawn assembly, mm — for the row's caption.
 *
 * Measured from the POLYGONS, not from the viewBox: the box carries a margin whose size the
 * caller chooses, and dividing it back out would make the caption depend on how much padding
 * somebody asked for.
 *
 * Read off the drawing rather than off `BuiltUpSection`, on purpose. If the two ever
 * disagree it means the picture and the properties came from different placements, and this
 * is the number that shows it.
 */
export function outlineExtentMm(o: SectionOutline): { widthMm: number; heightMm: number } {
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of o.polygons) {
    for (const [y, z] of p.vertices) {
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
  }
  if (!Number.isFinite(minY)) return { widthMm: 0, heightMm: 0 };
  return {
    widthMm: Math.round((maxY - minY) * 1000),
    heightMm: Math.round((maxZ - minZ) * 1000),
  };
}

/** i18n key explaining why a row shows no figure. */
export function outlineUnavailableKey(u: OutlineUnavailable): string {
  return `generator.outline.${u}`;
}
