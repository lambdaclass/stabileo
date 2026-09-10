/**
 * A catalogue profile, in the shape the built-up composer needs.
 *
 * ── The one number the catalogue does not publish ──────────────────
 *
 * `composeBuiltUp` places copies of a profile relative to each other, and every placement
 * is measured from the profile's CENTROID. For a channel or an angle the centroid is
 * nowhere near the middle of the bounding box — a UPN 80 sits 14.5 mm from the back of its
 * web and 30.5 mm from the flange tips — and the catalogue publishes neither figure.
 *
 * The canonical geometry engine does. `resolveCanonicalSection` returns `yc`, `zc` and the
 * bounding box in one frame, and the difference between them is exactly the extent this
 * module needs. So the resolution goes through canonical geometry, and the catalogue's own
 * A and I are used only to cross-check it.
 *
 * ── When the centroid is NOT known ─────────────────────────────────
 *
 * One family in the catalogue is properties-only: MC, whose published flange slope
 * contradicts its published properties, so no outline can be fitted (see `iram-mc.ts`).
 * For a DOUBLY SYMMETRIC family that would not matter — the centroid is the middle of the
 * box by symmetry — but MC is a channel, and putting two of them back to back on the
 * assumption that their centroids are centred would place them wrong and quietly return a
 * weak-axis inertia that is too small.
 *
 * So `centroidKnown` is reported, `canCompose` refuses the arrangements that depend on it,
 * and the caller shows the reason instead of a number. That is a real refusal today, for a
 * real family, which is what keeps it from rotting.
 *
 * Pure of stores and runes. Reads the catalogue and, through it, the WASM geometry engine.
 */

import { ALL_PROFILES, type ProfileFamily, type SteelProfile } from '../../data/steel-profiles';
import { FAMILY_CLASSIFICATION } from '../../data/section-catalog';
import { resolveCanonicalSection } from '../../section/canonical';
import type { Section } from '../../store/model.svelte';
import { ARRANGEMENTS, type BuiltUpArrangement, type SingleProfile } from './built-up-section';

/** Catalogue units are cm², cm⁴ and mm. Everything below this line is SI. */
const CM2 = 1e-4;
const CM4 = 1e-8;
const MM = 1e-3;

/**
 * Families whose centroid is at the centre of their bounding box by symmetry.
 *
 * Read off `FAMILY_CLASSIFICATION.series` rather than listed by name, so a family added to
 * the catalogue is classified by the same rule instead of being forgotten here.
 */
function isDoublySymmetric(family: ProfileFamily): boolean {
  const s = FAMILY_CLASSIFICATION[family]?.series;
  return s === 'i-beam' || s === 'hollow';
}

export interface ResolvedProfile {
  name: string;
  family: ProfileFamily;
  profile: SingleProfile;
  /** Where the properties came from. */
  basis: 'canonicalGeometry' | 'catalogueDeclared';
  /**
   * Whether the centroid's position inside the outline is known.
   *
   * False only for a properties-only family that is not doubly symmetric. Compound
   * arrangements are refused in that case — see `canCompose`.
   */
  centroidKnown: boolean;
  /**
   * Where the centroid sits inside the outline, metres from the section's own origin.
   *
   * Computed here already — every polygon and the extent are shifted by it — and it used to be
   * consumed and thrown away, so the data sheet had no centroid to show for ANY profile and
   * said «no canonical geometry resolved» even for an IPE, whose geometry the app had just
   * resolved. Null for a properties-only family, where there is genuinely nothing to state.
   */
  centroid: { yM: number; zM: number } | null;
  /**
   * How far the canonical area sits from the published one, as a fraction.
   *
   * Not an error: for the W, HP and M families the source itself is inconsistent — it
   * marks its dimensions nominal and derives the area from nominal mass — and the deviation
   * is documented per family. Carried so a generated section can state it rather than
   * leave a user to discover a 0.4 % difference against their own tables.
   */
  areaDeviation: number | null;
  /**
   * The profile's real outline, referred to its own CENTROID, in metres.
   *
   * Carried on the same resolution that produced the properties rather than fetched again,
   * because a second call would be a second answer: the geometry engine is deterministic,
   * but nothing would guarantee the drawing and the numbers came from the same request.
   * `[y, z]` pairs, `isVoid` marking a hole.
   *
   * Empty for a properties-only family — there is no outline to draw, and drawing a
   * plausible box instead would be inventing geometry the app has said it does not have.
   */
  polygons: Array<{ vertices: Array<[number, number]>; isVoid: boolean }>;
}

/** Look a catalogue profile up by its exact name. */
export function findProfile(name: string): SteelProfile | undefined {
  const target = name.trim().toUpperCase();
  return ALL_PROFILES.find((p) => p.name.trim().toUpperCase() === target);
}

/**
 * Resolve a profile to centroidal properties and extents.
 *
 * Returns null only when the name is not in the catalogue — every catalogued profile
 * resolves to something usable, and what varies is whether compound arrangements of it are
 * available.
 */
export function resolveProfile(name: string): ResolvedProfile | null {
  const p = findProfile(name);
  if (!p) return null;

  const declaredA = p.a * CM2;
  const declaredIy = p.iy * CM4;
  const declaredIz = p.iz * CM4;
  const j = p.j != null ? p.j * CM4 : null;

  // The section shape the canonical resolver expects. Only the name matters for the
  // lookup; the declared values are the properties-only fallback it returns unchanged.
  const probe: Section = {
    id: -1, name: p.name, a: declaredA, iz: declaredIz, iy: declaredIy,
    ...(j !== null ? { j } : {}),
  } as Section;

  let resolved;
  try {
    resolved = resolveCanonicalSection(probe);
  } catch {
    // A checkout with no WASM build cannot produce canonical geometry. Falling back keeps
    // the generators usable for doubly-symmetric profiles rather than failing outright.
    resolved = null;
  }

  if (resolved && resolved.state === 'geometry-backed') {
    const q = resolved.properties;
    const [yMin, zMin, yMax, zMax] = q.bbox;
    return {
      name: p.name,
      family: p.family,
      basis: 'canonicalGeometry',
      centroidKnown: true,
      centroid: { yM: q.yc, zM: q.zc },
      areaDeviation: declaredA > 0 ? (q.a - declaredA) / declaredA : null,
      // Shifted onto the centroid, so every consumer works in the one frame the placement
      // arithmetic already uses.
      polygons: resolved.geometry.polygons.map((poly) => ({
        isVoid: poly.isVoid,
        vertices: poly.vertices.map(([y, z]) => [y - q.yc, z - q.zc] as [number, number]),
      })),
      profile: {
        name: p.name,
        a: q.a,
        iy: q.iy,
        iz: q.iz,
        iyz: q.iyz,
        // The bounding box and the centroid arrive in the same frame, so the difference
        // is the extent measured from the centroid — which is what a placement needs.
        extent: { yMin: yMin - q.yc, yMax: yMax - q.yc, zMin: zMin - q.zc, zMax: zMax - q.zc },
        j,
      },
    };
  }

  // Properties-only. The extent can only be stated for a shape whose centroid is at the
  // centre of its box; for anything else it is reported as unknown and guarded below.
  const halfB = (p.b * MM) / 2;
  const halfH = (p.h * MM) / 2;
  return {
    name: p.name,
    family: p.family,
    basis: 'catalogueDeclared',
    centroidKnown: isDoublySymmetric(p.family),
    centroid: null,
    areaDeviation: null,
    // No geometry means no drawing. A plausible rectangle here would be inventing an outline
    // the app has just finished saying it does not have.
    polygons: [],
    profile: {
      name: p.name,
      a: declaredA,
      iy: declaredIy,
      iz: declaredIz,
      // No geometry, so no product of inertia is available. Zero is correct for the
      // doubly-symmetric case and is the only defensible value for the other, where the
      // arrangement is refused anyway.
      iyz: 0,
      extent: { yMin: -halfB, yMax: halfB, zMin: -halfH, zMax: halfH },
      j,
    },
  };
}

export interface ComposeRefusal {
  /** i18n key explaining why. Never absent when composition is refused. */
  key: string;
  params?: Record<string, string | number>;
}

/**
 * Whether this profile may be used in this arrangement.
 *
 * A single profile is always available. Anything else needs the centroid, because every
 * placement in the table is measured from it.
 */
export function canCompose(
  r: ResolvedProfile,
  arrangement: BuiltUpArrangement,
): ComposeRefusal | null {
  if (ARRANGEMENTS[arrangement].count === 1) return null;
  if (r.centroidKnown) return null;
  return {
    key: 'generator.problem.centroidUnknown',
    params: { profile: r.name, family: r.family },
  };
}

/** Every arrangement this profile can actually be built into. */
export function availableArrangements(r: ResolvedProfile): BuiltUpArrangement[] {
  return (Object.keys(ARRANGEMENTS) as BuiltUpArrangement[])
    .filter((a) => canCompose(r, a) === null);
}
