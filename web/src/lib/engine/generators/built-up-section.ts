/**
 * Built-up sections: two or four rolled profiles working as one member.
 *
 * ── What this replaces ─────────────────────────────────────────────
 *
 * The industrial-building example in this repository carries its double angles like this:
 *
 *   { "name": "Col cord 2L75", "a": 0.00114, "iz": 4.5e-7, "iy": 4.5e-7,
 *     "shape": "L", "h": 0.075, "b": 0.075, "t": 0.006 }
 *
 * A `shape: "L"` with the area of ONE angle and the name of two. The composition lives in
 * the name and nowhere else, the inertias are a single angle's, and the parallel-axis term
 * — which for a back-to-back pair is most of the weak-axis stiffness — is simply absent.
 * A generator that emits "Doble ][" has to emit real properties, not a naming convention.
 *
 * ── How the properties are obtained ────────────────────────────────
 *
 * By the parallel-axis theorem on the single profile's own centroidal properties. This is
 * EXACT — not an approximation — and it needs nothing the catalogue does not already have
 * once the profile is resolved to canonical geometry:
 *
 *   A   = Σ Aᵢ
 *   Iy  = Σ (Iyᵢ + Aᵢ·(zᵢ − z̄)²)
 *   Iz  = Σ (Izᵢ + Aᵢ·(yᵢ − ȳ)²)
 *   Iyz = Σ (sᵢ·Iyzᵢ + Aᵢ·(yᵢ − ȳ)(zᵢ − z̄))
 *
 * `sᵢ` is −1 for a copy mirrored about exactly one axis and +1 otherwise: a reflection
 * reverses the sign of the product of inertia and leaves the second moments alone. That
 * term is zero for doubly-symmetric profiles and is the whole point for angles, where
 * Iyz ≠ 0 and getting its sign wrong rotates the principal axes the wrong way.
 *
 * The alternative — integrating a composed polygon — was rejected. `buildSectionGeometry`
 * accepts `kind: 'custom'` with one outer ring plus holes, and two profiles separated by a
 * gap are two DISJOINT regions, which that contract cannot express. Parallel axis gives
 * the identical answer without a WASM change, and a round-trip test (compose n = 1, get
 * the single profile back to machine precision) pins that it does.
 *
 * ── Torsion is NOT summed for a closed arrangement ─────────────────
 *
 * For an open built-up member with no continuous connection between the parts — the
 * back-to-back and parallel families below — the standard treatment is J ≈ Σ Jᵢ, and that
 * is what this module reports, as a DECLARED ASSUMPTION rather than as a fact.
 *
 * For a closed arrangement — two channels toe-to-toe, four angles boxed — that sum is
 * wrong by orders of magnitude: the cell carries a Bredt shear flow and its torsional
 * constant is 4·Am²/∮(ds/t), which has nothing to do with the sum of the open parts.
 * Computing Am correctly needs the cell's mid-line, which depends on which walls of which
 * profile bound it, and the catalogue does not carry enough to determine that for every
 * family. So a closed arrangement reports `j: null` with an explicit reason.
 *
 * That is not a dead end. `solverProperties` already returns `j: null` with
 * `jProvenance: 'unavailable'`, and `buildSolverInput3D` substitutes `Iy·0.001` — a
 * fabrication it labels as one — so the model still solves, torsionally soft. Soft is the
 * visible, conservative-for-this-member direction, and the assumption is recorded on the
 * generated model rather than discovered later. Inventing a number instead would not be.
 *
 * Pure: no store, no runes, no i18n, no WASM. Everything arrives in `SingleProfile`.
 */

// ─── The single profile a built-up member is made of ─────────────────

/**
 * One rolled profile's centroidal properties and its extents.
 *
 * Metres and metres⁴ throughout — NOT the catalogue's mm/cm²/cm⁴. Converting at the edge
 * keeps every formula below in one unit system, which is where a units mistake would
 * otherwise hide: a parallel-axis term is A·d², so a factor of ten in `d` is a factor of
 * a hundred in the answer and still looks plausible.
 */
export interface SingleProfile {
  /** Catalogue name, carried through so the built-up section can be named from it. */
  name: string;
  /** Gross area, m². */
  a: number;
  /** Second moment about the horizontal centroidal axis, m⁴. */
  iy: number;
  /** Second moment about the vertical centroidal axis, m⁴. */
  iz: number;
  /** Product of inertia about the centroidal axes, m⁴. Zero for symmetric profiles. */
  iyz: number;
  /**
   * How far the outline reaches from its OWN CENTROID, m.
   *
   * Referenced to the centroid rather than to a corner because that is what the placement
   * arithmetic needs, and because it is the only reference that is unambiguous for a
   * channel or an angle — where the centroid is nowhere near the middle of the bounding
   * box, and "the width" does not say which side of it the material is on.
   */
  extent: { yMin: number; yMax: number; zMin: number; zMax: number };
  /** Saint-Venant torsional constant of ONE profile, m⁴, or null when none is published. */
  j: number | null;
}

import type { BuiltUpArrangement } from '../../section/profile-spec';

// ─── Arrangements ────────────────────────────────────────────────────

/*
 * The list itself now lives in `lib/section/profile-spec.ts`, and is re-exported here.
 *
 * A section picked in the sections tab has an arrangement and no generator anywhere near it,
 * so the vocabulary belongs below the generators rather than inside them. The placement table
 * stays here, where it has always been, because THAT is generator geometry. Re-exporting means
 * every existing `from './built-up-section'` import keeps resolving unchanged.
 */
export { BUILT_UP_ARRANGEMENTS, isBuiltUpArrangement } from '../../section/profile-spec';
export type { BuiltUpArrangement } from '../../section/profile-spec';

/**
 * One copy of the profile inside the assembly.
 *
 * `mirrorY` reflects the outline about the vertical axis (y → −y); `mirrorZ` about the
 * horizontal one. `dy`/`dz` then place that copy's CENTROID in the assembly frame.
 */
interface Placement {
  dy: number;
  dz: number;
  mirrorY: boolean;
  mirrorZ: boolean;
}

export interface ArrangementSpec {
  id: BuiltUpArrangement;
  /** How many profiles the assembly contains. */
  count: 1 | 2 | 4;
  /**
   * Whether the parts enclose a cell that carries a Bredt shear flow.
   *
   * The single fact that decides whether the torsional constant may be summed. See the
   * module header — a closed arrangement reports no J rather than a wrong one.
   */
  closed: boolean;
  /** Short glyph the profile editor shows beside the label, e.g. `][`. */
  glyph: string;
  /** Where each copy goes, given the single profile's extents and the gap. */
  place(e: SingleProfile['extent'], gap: number): Placement[];
}

/**
 * The arrangement table.
 *
 * A table rather than seven functions because every entry is the same computation over a
 * different set of offsets, and because adding the eighth is then a data edit that cannot
 * forget to declare whether it is closed.
 *
 * Every `place` is symmetric about the assembly centroid by construction, which the tests
 * check rather than assume: an asymmetric placement would put the centroid off the origin
 * and silently bias every parallel-axis term.
 */
export const ARRANGEMENTS: Record<BuiltUpArrangement, ArrangementSpec> = {
  single: {
    id: 'single', count: 1, closed: false, glyph: '',
    place: () => [{ dy: 0, dz: 0, mirrorY: false, mirrorZ: false }],
  },

  /**
   * Back to back: the two `yMin` faces meet, separated by the gap.
   *
   * For a channel that is web against web; for an angle, the two vertical legs. The
   * classic double-angle strut, and the arrangement whose weak-axis stiffness is almost
   * entirely the parallel-axis term the old hand-written sections omitted.
   */
  doubleBack: {
    id: 'doubleBack', count: 2, closed: false, glyph: '][',
    place: (e, gap) => {
      const d = gap / 2 - e.yMin;
      return [
        { dy: d, dz: 0, mirrorY: false, mirrorZ: false },
        { dy: -d, dz: 0, mirrorY: true, mirrorZ: false },
      ];
    },
  },

  /**
   * Toe to toe: the two `yMax` faces meet, enclosing a cell.
   *
   * Two channels facing each other make a box. CLOSED — see the module header on why that
   * means no torsional constant rather than a summed one.
   */
  doubleFacing: {
    id: 'doubleFacing', count: 2, closed: true, glyph: '[]',
    place: (e, gap) => {
      const d = gap / 2 + e.yMax;
      return [
        { dy: -d, dz: 0, mirrorY: false, mirrorZ: false },
        { dy: d, dz: 0, mirrorY: true, mirrorZ: false },
      ];
    },
  },

  /**
   * Side by side, both the same way round, with the gap between them.
   *
   * Neither mirrored, so a pair of angles keeps its product of inertia — the assembly's
   * principal axes stay rotated, which is exactly the behaviour that makes this different
   * from `doubleBack` and is the reason the two are separate entries.
   */
  doubleParallel: {
    id: 'doubleParallel', count: 2, closed: false, glyph: '||',
    place: (e, gap) => {
      const d = (gap + (e.yMax - e.yMin)) / 2;
      return [
        { dy: -d, dz: 0, mirrorY: false, mirrorZ: false },
        { dy: d, dz: 0, mirrorY: false, mirrorZ: false },
      ];
    },
  },

  /**
   * Crossed: the second copy is the first turned through 180° about the member axis.
   *
   * A rotation, not a reflection, so both mirror flags are set and the product of inertia
   * keeps its sign — `(−1)·(−1) = +1`. Getting that wrong would cancel Iyz instead of
   * doubling it and hand back a section whose principal axes are level when they are not.
   */
  doubleX: {
    id: 'doubleX', count: 2, closed: false, glyph: '/\\',
    place: (e, gap) => {
      const dy = (gap + (e.yMax - e.yMin)) / 2;
      const dz = (gap + (e.zMax - e.zMin)) / 2;
      return [
        { dy: -dy, dz: -dz, mirrorY: false, mirrorZ: false },
        { dy, dz, mirrorY: true, mirrorZ: true },
      ];
    },
  },

  /** Two back-to-back pairs, stacked with the gap between them. Open. */
  quadBack: {
    id: 'quadBack', count: 4, closed: false, glyph: '][][',
    place: (e, gap) => {
      const dy = gap / 2 - e.yMin;
      const dz = (gap + (e.zMax - e.zMin)) / 2;
      return [
        { dy, dz: -dz, mirrorY: false, mirrorZ: false },
        { dy: -dy, dz: -dz, mirrorY: true, mirrorZ: false },
        { dy, dz, mirrorY: false, mirrorZ: true },
        { dy: -dy, dz, mirrorY: true, mirrorZ: true },
      ];
    },
  },

  /**
   * Four copies at the corners of a square, backs outward, enclosing a cell.
   *
   * The battened box column. CLOSED.
   */
  quadBox: {
    id: 'quadBox', count: 4, closed: true, glyph: '[][]',
    place: (e, gap) => {
      const dy = gap / 2 + e.yMax;
      const dz = gap / 2 + e.zMax;
      return [
        { dy: -dy, dz: -dz, mirrorY: false, mirrorZ: false },
        { dy, dz: -dz, mirrorY: true, mirrorZ: false },
        { dy: -dy, dz, mirrorY: false, mirrorZ: true },
        { dy, dz, mirrorY: true, mirrorZ: true },
      ];
    },
  },
};

// ─── The result ──────────────────────────────────────────────────────

/**
 * Why a built-up assembly has the torsional constant it has — or none. Never an empty
 * explanation.
 *
 *   `singleProfile`         one profile: the catalogue value, unchanged
 *   `sumOfOpenParts`        open assembly, no continuous connection: Σ Jᵢ. An assumption
 *   `closedCellNotComputed` closed cell: Bredt governs, mid-line not in the catalogue
 *   `partHasNoJ`            the profile publishes no J, so no assembly of it can have one
 *
 * An ARRAY with the type derived from it, not a bare union: every one of these becomes an
 * i18n key through `torsionBasisKey`, and the locale test enumerates this list so a value
 * added here fails until it is translated. A union cannot be enumerated at runtime, and the
 * key would silently render as itself.
 */
export const BUILT_UP_TORSION_BASES = [
  'singleProfile', 'sumOfOpenParts', 'closedCellNotComputed', 'partHasNoJ',
] as const;

export type BuiltUpTorsionBasis = (typeof BUILT_UP_TORSION_BASES)[number];

export interface BuiltUpSection {
  arrangement: BuiltUpArrangement;
  /** How many profiles. */
  count: number;
  /** Gap between the parts, m. */
  gap: number;
  /** Assembly gross area, m². */
  a: number;
  /** Assembly second moment about the horizontal centroidal axis, m⁴. */
  iy: number;
  /** Assembly second moment about the vertical centroidal axis, m⁴. */
  iz: number;
  /** Assembly product of inertia about the centroidal axes, m⁴. */
  iyz: number;
  /** Torsional constant, m⁴, or null. Read `jBasis` for which and why. */
  j: number | null;
  jBasis: BuiltUpTorsionBasis;
  /** Overall outline extents from the assembly centroid, m. */
  extent: SingleProfile['extent'];
  /** Assembly depth (z) and width (y), m — the bounding box the member occupies. */
  h: number;
  b: number;
  /** Display name, e.g. `2x L 75x75x6 ][ (h=8mm)`. */
  name: string;
}

/**
 * Compose the assembly.
 *
 * Refuses nothing and invents nothing: every arrangement of every profile produces a
 * result, and the only thing that can be absent is `j`, which says why in `jBasis`.
 */
export function composeBuiltUp(
  profile: SingleProfile,
  arrangement: BuiltUpArrangement,
  gapM = 0,
): BuiltUpSection {
  const spec = ARRANGEMENTS[arrangement];
  const gap = Math.max(0, gapM);
  const places = spec.place(profile.extent, gap);

  const a = profile.a * places.length;

  // The assembly centroid. Every arrangement above is symmetric, so this comes out at the
  // origin — but it is COMPUTED rather than assumed, because an arrangement added later
  // that is not symmetric would otherwise get silently wrong parallel-axis terms rather
  // than a correct answer about a centroid that is not at zero.
  let sy = 0;
  let sz = 0;
  for (const p of places) { sy += profile.a * p.dy; sz += profile.a * p.dz; }
  const yBar = sy / a;
  const zBar = sz / a;

  let iy = 0;
  let iz = 0;
  let iyz = 0;
  for (const p of places) {
    const dy = p.dy - yBar;
    const dz = p.dz - zBar;
    // A reflection about ONE axis reverses the product of inertia; about both, it is a
    // rotation and the sign is unchanged.
    const sign = (p.mirrorY !== p.mirrorZ) ? -1 : 1;
    iy += profile.iy + profile.a * dz * dz;
    iz += profile.iz + profile.a * dy * dy;
    iyz += sign * profile.iyz + profile.a * dy * dz;
  }

  const extent = assemblyExtent(profile.extent, places, yBar, zBar);

  return {
    arrangement,
    count: places.length,
    gap,
    a, iy, iz, iyz,
    ...torsion(profile, spec, places.length),
    extent,
    h: extent.zMax - extent.zMin,
    b: extent.yMax - extent.yMin,
    name: builtUpName(profile.name, spec, gap),
  };
}

/** Outline extents of the whole assembly, referred to the assembly centroid. */
function assemblyExtent(
  e: SingleProfile['extent'],
  places: readonly Placement[],
  yBar: number,
  zBar: number,
): SingleProfile['extent'] {
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  let zMin = Number.POSITIVE_INFINITY;
  let zMax = Number.NEGATIVE_INFINITY;
  for (const p of places) {
    // Mirroring swaps which side of the centroid each extreme sits on.
    const y0 = p.mirrorY ? -e.yMax : e.yMin;
    const y1 = p.mirrorY ? -e.yMin : e.yMax;
    const z0 = p.mirrorZ ? -e.zMax : e.zMin;
    const z1 = p.mirrorZ ? -e.zMin : e.zMax;
    yMin = Math.min(yMin, p.dy + y0 - yBar);
    yMax = Math.max(yMax, p.dy + y1 - yBar);
    zMin = Math.min(zMin, p.dz + z0 - zBar);
    zMax = Math.max(zMax, p.dz + z1 - zBar);
  }
  return { yMin, yMax, zMin, zMax };
}

function torsion(
  profile: SingleProfile,
  spec: ArrangementSpec,
  n: number,
): { j: number | null; jBasis: BuiltUpTorsionBasis } {
  if (spec.count === 1) {
    return profile.j === null
      ? { j: null, jBasis: 'partHasNoJ' }
      : { j: profile.j, jBasis: 'singleProfile' };
  }
  if (spec.closed) return { j: null, jBasis: 'closedCellNotComputed' };
  if (profile.j === null) return { j: null, jBasis: 'partHasNoJ' };
  return { j: profile.j * n, jBasis: 'sumOfOpenParts' };
}

/** `2x U 100x40x2 ][ (h=8mm)` — the composition is in the name AND in the numbers. */
function builtUpName(profileName: string, spec: ArrangementSpec, gap: number): string {
  if (spec.count === 1) return profileName;
  const gapMm = Math.round(gap * 1000);
  const gapPart = gapMm > 0 ? ` (h=${gapMm}mm)` : '';
  return `${spec.count}x ${profileName} ${spec.glyph}${gapPart}`;
}

/**
 * The i18n key stating what a torsional basis means, for the assumption list.
 *
 * Every basis has one, including the two that produce a usable number: an assembly whose
 * J is a sum of open parts has made an assumption a reviewer is entitled to see, and
 * saying so only when the answer is missing would report the absence and hide the guess.
 */
export function torsionBasisKey(b: BuiltUpTorsionBasis): string {
  return `generator.builtUp.torsion.${b}`;
}

/** True when the arrangement encloses a cell — the UI shows this beside the gap field. */
export function isClosedArrangement(a: BuiltUpArrangement): boolean {
  return ARRANGEMENTS[a].closed;
}
