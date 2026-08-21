/**
 * The properties a PRO user asks a catalogue for, and the basis of every one of them.
 *
 * ── What this adds, and what it refuses to add ─────────────────────
 *
 * The tables publish A, Iy, Iz, mass, the outer dimensions, a wall or web thickness, and — for
 * the structural tubes only — a torsion constant. A PRO section card is expected to show more:
 * section moduli and radii of gyration are what a member is actually sized with.
 *
 * Two of those are arithmetic on published numbers and one of them is not:
 *
 *   · **Radius of gyration** is `sqrt(I/A)`. Both terms are tabulated, the identity is exact,
 *     and no geometry is involved. It is always available. (The tube tables' own header uses
 *     `r = sqrt(I/A)` as one of the two identities every row had to satisfy, so this is the
 *     same relation the catalogue was validated against.)
 *
 *   · **Elastic section modulus** is `I / c`, where `c` is the distance from the CENTROID to
 *     the extreme fibre. `c` is not in the tables. For a doubly symmetric shape it is half the
 *     depth by symmetry; for a channel, a tee or an angle it is not, and the difference is
 *     large — a UPN 80's centroid sits 14.5 mm from the back of its web, not 22.5 mm.
 *
 *   · **Torsion constant** is published for the IRAM tubes and for nothing else. It is NOT
 *     derived here. The catalogue's standing prohibition is that no polygon-derived value may
 *     be used as a torsional constant (Routh's approximation is not J for a thin open
 *     section), and PR21 left Bredt for closed built-up cells explicitly out of scope. An
 *     absent J is reported as absent.
 *
 * So `c` is taken from the one place that knows it: `resolveProfile`, which builds the
 * canonical outline through the geometry engine and returns the bounding box measured from the
 * centroid. Where that is unavailable — no WASM build, or the one properties-only family whose
 * outline cannot be fitted — the modulus is available only for the shapes whose centroid is
 * the centre of their box by symmetry, and is reported as unavailable for the rest.
 *
 * ── Every value carries how it was obtained ────────────────────────
 *
 * A card that prints `Wy = 194 cm³` beside `Iy = 1943 cm⁴` implies both came from the same
 * table. One did. `basis` is on every quantity so the card can say which, and
 * `unavailableReasons` exists so "we do not have this" is a row rather than a blank.
 *
 * ── Where this sits ───────────────────────────────────────────────
 *
 * `catalogue.ts` is deliberately geometry-free — it is a source of rows, not an engine. This
 * module is the join between that source and the geometry resolver, and it is the only place
 * the two meet. A component asks for properties; it does not resolve anything itself.
 *
 * Pure: no store, no runes, no i18n. Note KEYS, never prose.
 */

import {
  findProfile, resolveProfile, type ResolvedProfile,
} from '../engine/generators/profile-resolve';
import type { ProfileEntry, ProfileId } from './catalogue';

/**
 * How a quantity came to be.
 *
 * Enumerated as a value as well as a type so the label for each one is expanded from the union
 * by the i18n gate: a basis added here fails that test until it is translated in all three
 * languages, rather than rendering its own key into a card.
 */
export const PROPERTY_BASES = [
  'tabulated', 'derivedFromTable', 'derivedFromGeometry', 'unavailable',
] as const;

/** How a quantity came to be. */
export type PropertyBasis =
  /** Read from the published table, unchanged. */
  | 'tabulated'
  /** Exact arithmetic on tabulated values only — `sqrt(I/A)`, or `I/c` where symmetry fixes `c`. */
  | 'derivedFromTable'
  /** Arithmetic on a tabulated value and the centroid of the verified canonical outline. */
  | 'derivedFromGeometry'
  /** Not published and not derivable from what is. Never a zero, never a guess. */
  | 'unavailable';

// The union and the list must stay the same set; the compiler checks it both ways.
const _basesAreExhaustive: readonly PropertyBasis[] = PROPERTY_BASES;
void _basesAreExhaustive;

export interface Quantity {
  /** Null exactly when `basis` is `unavailable`. */
  value: number | null;
  /** Written out, because a bare number beside another bare number is how a cm² becomes a mm². */
  unit: 'cm2' | 'cm3' | 'cm4' | 'cm' | 'mm' | 'kg/m';
  basis: PropertyBasis;
  /**
   * i18n key qualifying the value.
   *
   * Required whenever the basis is `unavailable`, and present on a derived value whose
   * derivation the reader has to know about — the minimum modulus of an asymmetric section is
   * the case: it is one of two, and which one matters.
   */
  noteKey?: string;
}

/** Which axes a family's shape is symmetric about, and therefore where its centroid is. */
export interface Symmetry {
  /**
   * Symmetric top to bottom, so the extreme fibre for bending about Y is at half the depth.
   *
   * Note the axis convention this file inherits: `iy` is about the HORIZONTAL axis, so its
   * extreme fibre is measured vertically, i.e. over the depth `h`.
   */
  aboutY: boolean;
  /** Symmetric left to right, so the extreme fibre for bending about Z is at half the width. */
  aboutZ: boolean;
}

export interface ProfileProperties {
  id: ProfileId;
  /** Tabulated, all four. */
  area: Quantity;
  mass: Quantity;
  iy: Quantity;
  iz: Quantity;
  /** Minimum elastic section modulus about each axis. */
  wy: Quantity;
  wz: Quantity;
  /** Radii of gyration. Always derivable. */
  ry: Quantity;
  rz: Quantity;
  /** Tabulated where the source publishes one; unavailable otherwise, never derived. */
  j: Quantity;
  height: Quantity;
  width: Quantity;
  /** Wall or web thickness, where the table has one. */
  thickness: Quantity;
  /** Root radius, where the table has one. Its absence is what keeps a family properties-only. */
  rootRadius: Quantity;
  symmetry: Symmetry;
  /**
   * Note keys for every property this profile does not have.
   *
   * Collected so a card can render a "not available" block instead of leaving the reader to
   * notice which rows are blank.
   */
  unavailableReasons: string[];
}

const q = (value: number, unit: Quantity['unit'], basis: PropertyBasis, noteKey?: string): Quantity =>
  ({ value, unit, basis, ...(noteKey ? { noteKey } : {}) });

const none = (unit: Quantity['unit'], noteKey: string): Quantity =>
  ({ value: null, unit, basis: 'unavailable', noteKey });

/**
 * Which axes each shape family is symmetric about.
 *
 * Keyed on the SERIES rather than the family, for the same reason `isDoublySymmetric` is: a
 * family added to the catalogue is classified by the rule instead of being forgotten in a
 * list. The series is the shape, and the shape is what decides where the centroid sits.
 *
 *   i-beam   both — parallel or tapered flanges, symmetric about both axes
 *   hollow   both — rectangular, square and circular tubes
 *   channel  top to bottom only; the web is on one side, so the centroid is off-centre
 *            horizontally, which is exactly the 14.5 mm a UPN 80 is famous for
 *   tee      left to right only; the flange is at one end of the depth
 *   angle    neither — an equal-leg angle's centroid is off-centre on both axes
 */
const SYMMETRY_BY_SERIES: Record<ProfileEntry['series'], Symmetry> = {
  'i-beam': { aboutY: true, aboutZ: true },
  hollow: { aboutY: true, aboutZ: true },
  channel: { aboutY: true, aboutZ: false },
  tee: { aboutY: false, aboutZ: true },
  angle: { aboutY: false, aboutZ: false },
};

/**
 * The extreme-fibre distances, in mm, or null when they are not knowable.
 *
 * Returned as a pair `[overDepth, overWidth]` matching the two moduli: the first is the
 * distance measured vertically (governing `Wy`), the second horizontally (governing `Wz`).
 *
 * The MAXIMUM of the two sides is taken for an asymmetric shape, which yields the MINIMUM
 * modulus — the governing one, and the one a check has to use. A table for such a section
 * publishes both; this reports the smaller and says so, rather than reporting the larger and
 * being unconservative, or reporting a mean and being neither.
 */
function extremeFibreMm(
  entry: ProfileEntry,
  resolved: ResolvedProfile | null,
  symmetry: Symmetry,
): { overDepthMm: number | null; overWidthMm: number | null; fromGeometry: boolean } {
  if (resolved && resolved.basis === 'canonicalGeometry') {
    const e = resolved.profile.extent;
    // The extent arrives in metres, referred to the centroid. Both signs are taken because an
    // asymmetric outline reaches further on one side, and that side governs.
    return {
      overDepthMm: Math.max(Math.abs(e.zMax), Math.abs(e.zMin)) * 1e3,
      overWidthMm: Math.max(Math.abs(e.yMax), Math.abs(e.yMin)) * 1e3,
      fromGeometry: true,
    };
  }
  /*
   * No verified outline. Half the bounding box is the right answer only where symmetry puts
   * the centroid at its centre; anywhere else it is the assumption that produces a modulus
   * 50 % too large for a channel's weak axis, which is precisely the kind of number that
   * looks plausible and is not.
   */
  return {
    overDepthMm: symmetry.aboutY ? entry.heightMm / 2 : null,
    overWidthMm: symmetry.aboutZ ? entry.widthMm / 2 : null,
    fromGeometry: false,
  };
}

/**
 * The root radius, and the four different things its absence can mean.
 *
 * This is the property where the tables disagree with each other most, and flattening that
 * into "present or missing" would misreport three of the four cases.
 *
 *   · **A value, from a table.** IPE, HEA, HEB carry the tabulated EN radii; the angles and
 *     tees carry both radii per profile. Tabulated.
 *
 *   · **A value, solved from published data.** W, HP, M and C have no usable radius column —
 *     the one they print grows with the flange thickness and so cannot be the fillet — so it
 *     was inverted out of the published clear web depth via `hw = d - 2(tf + r)`. That is an
 *     inversion of published data rather than a transcription, and it is corroborated by
 *     coming out near-constant within each rolling group. Derived, and it says so.
 *
 *   · **No column, because the standard fixes it as a RULE.** IPN and UPN take their radii
 *     from DIN's rules on the profile's own dimensions, and the tubes from `R = 2t`. Nothing
 *     is missing: the outline is exact. Reporting "not published" without saying that would
 *     read as a gap in a family that has none.
 *
 *   · **A zero.** The three C9 profiles publish a clear web depth that would leave a 49.5 mm
 *     fillet inside a 61.8 mm flange, so `iram-c.ts` gives them no radius and draws them
 *     sharp-cornered. The table encodes that as `r: 0`, and a zero rendered as a tabulated
 *     value claims the standard published a sharp corner. It did not; the value is absent and
 *     a decision was taken about how to draw it.
 *
 * The case is decided from the family's geometry fidelity, which is data, rather than from a
 * list of family names kept in step by hand.
 */
function rootRadiusOf(entry: ProfileEntry, r: number | undefined): Quantity {
  if (r === undefined) {
    return entry.fidelity === 'exact'
      ? none('mm', 'steel.props.unavailable.rootRadiusByRule')
      : none('mm', 'steel.props.unavailable.rootRadiusNotPublished');
  }
  if (!(r > 0)) return none('mm', 'steel.props.unavailable.rootRadiusSharp');
  return entry.fidelity === 'nominalDimensions'
    ? q(r, 'mm', 'derivedFromTable', 'steel.props.note.rootRadiusInverted')
    : q(r, 'mm', 'tabulated');
}

/**
 * The full property set for one catalogue row.
 *
 * Never throws and never returns a number it cannot defend: every field is either a published
 * value, exact arithmetic on published values, or an explicit absence with a reason.
 */
export function profileProperties(entry: ProfileEntry): ProfileProperties {
  const symmetry = SYMMETRY_BY_SERIES[entry.series];
  const resolved = resolveProfile(entry.id);
  const raw = findProfile(entry.id);
  const fibre = extremeFibreMm(entry, resolved, symmetry);

  const modulus = (
    inertiaCm4: number,
    cMm: number | null,
    axisSymmetric: boolean,
  ): Quantity => {
    if (cMm === null || !(cMm > 0)) {
      return none('cm3', 'steel.props.unavailable.centroidUnknown');
    }
    // cm⁴ / mm → cm³ needs the arm in cm.
    const value = inertiaCm4 / (cMm / 10);
    const basis: PropertyBasis = fibre.fromGeometry ? 'derivedFromGeometry' : 'derivedFromTable';
    // The note is about the SHAPE, not about the source: an asymmetric section has two moduli
    // whatever the arm came from, and the reader is being shown one of them.
    return q(value, 'cm3', basis, axisSymmetric ? undefined : 'steel.props.note.minimumModulus');
  };

  const area = entry.areaCm2;
  const props: ProfileProperties = {
    id: entry.id,
    area: q(area, 'cm2', 'tabulated'),
    mass: q(entry.massKgPerM, 'kg/m', 'tabulated'),
    iy: q(entry.iyCm4, 'cm4', 'tabulated'),
    iz: q(entry.izCm4, 'cm4', 'tabulated'),
    wy: modulus(entry.iyCm4, fibre.overDepthMm, symmetry.aboutY),
    wz: modulus(entry.izCm4, fibre.overWidthMm, symmetry.aboutZ),
    // sqrt(I/A): cm⁴ over cm² is cm², so the root is a length in cm. Exact, and independent of
    // any outline — which is why this is the one derived property with no refusal case.
    ry: area > 0
      ? q(Math.sqrt(entry.iyCm4 / area), 'cm', 'derivedFromTable')
      : none('cm', 'steel.props.unavailable.noArea'),
    rz: area > 0
      ? q(Math.sqrt(entry.izCm4 / area), 'cm', 'derivedFromTable')
      : none('cm', 'steel.props.unavailable.noArea'),
    j: raw?.j != null
      ? q(raw.j, 'cm4', 'tabulated')
      : none('cm4', 'steel.props.unavailable.torsionNotPublished'),
    height: q(entry.heightMm, 'mm', 'tabulated'),
    width: q(entry.widthMm, 'mm', 'tabulated'),
    thickness: entry.thicknessMm != null
      ? q(entry.thicknessMm, 'mm', 'tabulated')
      : none('mm', 'steel.props.unavailable.thicknessNotPublished'),
    rootRadius: rootRadiusOf(entry, raw?.r),
    symmetry,
    unavailableReasons: [],
  };

  props.unavailableReasons = [...new Set(
    PROPERTY_ORDER
      .map((k) => props[k])
      .filter((v) => v.basis === 'unavailable' && v.noteKey)
      .map((v) => v.noteKey!),
  )];

  return props;
}

/**
 * The order a card lists them in: what the section IS, then how stiff, then how strong.
 *
 * Exported so the card cannot drift from the tests, and so a property added here appears in
 * the UI and in the i18n gate at once.
 */
export const PROPERTY_ORDER = [
  'height', 'width', 'thickness', 'rootRadius',
  'area', 'mass',
  'iy', 'iz', 'wy', 'wz', 'ry', 'rz', 'j',
] as const;

export type PropertyKey = (typeof PROPERTY_ORDER)[number];

export interface PropertyRow {
  key: PropertyKey;
  /** i18n key for the label. */
  labelKey: string;
  quantity: Quantity;
}

/** The card's rows, in order, labels included. */
export function propertyRows(props: ProfileProperties): PropertyRow[] {
  return PROPERTY_ORDER.map((key) => ({
    key,
    labelKey: `steel.props.label.${key}`,
    quantity: props[key],
  }));
}
