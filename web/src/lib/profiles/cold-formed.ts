/**
 * Cold-formed open sections — lipped channels (C) and zeds (Z).
 *
 * ══ Why this family is PARAMETRIC and the rest of the catalogue is TABULATED ══
 *
 * Every other family in this app is a table. `iram-c.ts`, `iram-angles.ts`, `iram-tubes.ts` and
 * the DIN series each name a dimensional standard, list its rows, and treat the published area
 * and inertias as the authority — the outline is then built to REPRODUCE those numbers, and the
 * deviation is measured and declared. That is the right direction when a mill rolls to a
 * standard: the standard is the fact, and the geometry is inferred from it.
 *
 * Cold-formed C and Z are not like that, and pretending otherwise is what this module refuses
 * to do:
 *
 *   · A cold-formed section is BENT FROM SHEET, so its whole geometry is four numbers — depth,
 *     flange width, lip length, sheet thickness — and one thickness runs through web, flange
 *     and lip alike. There is no independent web/flange thickness to look up.
 *   · Which COMBINATIONS of those four are commercially available varies by mill and by market.
 *     That list is a commercial fact, not a normative one, and this repository does not have a
 *     sourced copy of it. **No dimension rows are shipped here, and none are invented.**
 *   · Given the four numbers, the properties follow from geometry exactly. Nothing has to be
 *     looked up to know the area of a known bend.
 *
 * So the identifier carries the data: `C 100x50x15x2.0` IS its own specification. A lookup does
 * not consult a table, it PARSES — which is why `cold-formed-catalogue.ts` resolves any valid
 * designation and why a saved project keeps working with no catalogue behind it. When a sourced
 * series list arrives it becomes a filter over this space, not a replacement for it.
 *
 * This module is the geometry and the grammar; the catalogue, the query filters and the boundary
 * with the store live next door in `cold-formed-catalogue.ts`.
 *
 * ══ Sharp corners, declared ══
 *
 * A real bend has an inside radius. This module models the corners SQUARE, and says so rather
 * than carrying a radius it cannot source: the bend radius rule belongs to the forming standard,
 * and inventing `r = 2t` would be exactly the guess `steel-profiles.ts` forbids for root radii
 * ("it must never be guessed or back-solved from A or I").
 *
 * The consequence is bounded and computable, not hand-waved. Replacing a square corner of leg
 * thickness `t` with a bend of inside radius `r` removes
 *
 *     ΔA = t² − (π/4)·((r+t)² − r²)   per corner,
 *
 * which at `r = 0` is already `t²(1 − π/4) ≈ 0.215·t²` — the square-corner model counts a little
 * more material at each of the four corners than any real bend has. For a `C 100x50x15x2.0`
 * that is four corners of 0.86 mm² against an area of 452 mm²: **0.76 %**, and always in the
 * same direction (this model is never unconservative about area). `cold-formed-geometry.test.ts`
 * computes both numbers rather than trusting this paragraph — which is how the area quoted here
 * got corrected once already.
 *
 * ══ What this module does NOT do ══
 *
 * No strength, no classification, no effective width, no distortional buckling, no plastic
 * modulus. Not an oversight — CIRSOC 301-2018 excludes these sections **by name**, in the text
 * this app ships (chapter A):
 *
 *   > «Para el proyecto de elementos estructurales resistentes de: (a) chapa de acero doblada o
 *   > conformada en frío de sección abierta y sus uniones se aplicarán las especificaciones del
 *   > Reglamento CIRSOC 303-2009 …»
 *
 * CIRSOC 303-2009 is not in `docs/codes/`. So the geometry is available and the verification is
 * not, which is a `DEMAND_UNAVAILABLE` and never a silence. See `docs/handoffs/m2-cold-formed-limits.md`.
 */

/** The two shapes this module covers. `C` is the lipped channel; `Z` the lipped zed. */
export type ColdFormedShape = 'C' | 'Z';

/**
 * A cold-formed section, fully specified. All lengths in **mm**, the unit designations use.
 *
 * One thickness, deliberately. A cold-formed profile bent from a single coil cannot have a web
 * thicker than its flange, so offering three thicknesses (as the generic `C-custom` template
 * does, with `tw`, `tf` and `tl` free) would let a user describe a section that no mill can
 * make. Here that is not expressible.
 */
export interface ColdFormedSpec {
  shape: ColdFormedShape;
  /** Overall depth, outside to outside of the flanges. */
  hMm: number;
  /** Flange width, outside of the web to the flange tip. */
  bMm: number;
  /** Lip length, measured from the outside of the flange. */
  cMm: number;
  /** Sheet thickness — web, flange and lip alike. */
  tMm: number;
}

/** Steel mass density, kg/m³. Same value `engine/bar-marks.ts` uses. */
const STEEL_DENSITY = 7850;

/**
 * Why a spec was rejected, so a caller can say which number is wrong instead of "invalid".
 *
 * Every one of these describes a section that cannot be bent, not one that is merely unusual.
 */
export type ColdFormedRejection =
  /** A dimension is zero, negative or not finite. */
  | 'nonPositive'
  /** `2t ≥ h`: the two flanges meet or cross, so there is no web left. */
  | 'flangesMeet'
  /** `t ≥ b`: the flange is not wider than the sheet is thick, so there is no flange. */
  | 'noFlange'
  /** `c + t > h/2`: the lips reach past mid-depth and would collide. */
  | 'lipsCollide';

export type ColdFormedValidation =
  | { ok: true }
  | { ok: false; reason: ColdFormedRejection };

/**
 * Whether a spec describes a section that can exist.
 *
 * The three geometric bounds are the same ones `computeSectionProperties`' `C-custom` case
 * enforces (`2*tf >= h`, `tw >= b`, `c + tf > h/2`), restated for a single thickness. Kept as a
 * separate, named result rather than folded into a null return so that a picker can tell a user
 * WHICH number to change.
 */
export function validateColdFormed(spec: ColdFormedSpec): ColdFormedValidation {
  const { hMm: h, bMm: b, cMm: c, tMm: t } = spec;
  for (const v of [h, b, c, t]) {
    if (!Number.isFinite(v) || v <= 0) return { ok: false, reason: 'nonPositive' };
  }
  if (2 * t >= h) return { ok: false, reason: 'flangesMeet' };
  if (t >= b) return { ok: false, reason: 'noFlange' };
  if (c + t > h / 2) return { ok: false, reason: 'lipsCollide' };
  return { ok: true };
}

/**
 * Section properties derived from the geometry. Lengths mm, so areas mm² and inertias mm⁴.
 *
 * `iy` is about the horizontal axis and `iz` about the vertical one — the convention the rest of
 * this codebase uses (`iz = about Z vertical`, `iy = about Y horizontal`).
 */
export interface ColdFormedGeometry {
  areaMm2: number;
  /** About the horizontal centroidal axis. */
  iyMm4: number;
  /** About the vertical centroidal axis. */
  izMm4: number;
  /**
   * Product of inertia about the centroidal axes, mm⁴.
   *
   * **Zero for a C, nonzero for a Z**, and that difference is the whole reason this field
   * exists. A C is symmetric about its horizontal axis, so its geometric axes are principal. A
   * Z is only POINT-symmetric: its principal axes are rotated, and analysing it about the
   * geometric axes is wrong by however much this number says.
   *
   * `Section` in the store has nowhere to put it — there is no `ixy` field anywhere in the app.
   * That is a stated limitation, not something this module works around. See
   * `principalAngleDeg` and the limits handoff.
   */
  ixyMm4: number;
  /**
   * The larger and smaller principal second moments, mm⁴, and the rotation that reaches them.
   *
   * Reported because for a Z they are the only values bending may legitimately be computed
   * about, and a consumer that cannot rotate needs to be able to SEE the discrepancy rather
   * than infer it. For a C, `principalAngleDeg` is 0 and the principal pair equals (iy, iz).
   */
  iMaxMm4: number;
  iMinMm4: number;
  /**
   * Degrees, in (−45, 45]. Zero for a C.
   *
   * The rotation to the NEARER of the two principal axes. Principal directions come in
   * perpendicular pairs, so an angle and that angle ± 90° name the same pair; `atan2` alone
   * returns anything in (−90, 90], which reports a shallow wide Z as «46°» where «−44°» is the
   * same answer about the same section. Normalising picks the representative a reader means, and
   * costs nothing: the product of inertia vanishes at both.
   */
  principalAngleDeg: number;
  /** Saint-Venant torsional constant, mm⁴ — an OPEN thin-walled sum, `⅓Σsᵢtᵢ³`. */
  jMm4: number;
  /** Derived from area and `STEEL_DENSITY`; not a published mass. */
  massKgPerM: number;
}

/**
 * Rectangle decomposition of a lipped section: web between the flanges, full-width flanges,
 * lips beyond them. Coordinates: `u` horizontal, `v` vertical, origin at the CENTROID.
 *
 * Same decomposition `computeSectionProperties`' `C-custom` case uses — web contributes only
 * `hw = h − 2t` so nothing is counted twice — which is what lets
 * `cold-formed-geometry.test.ts` check this module's C against code it did not write.
 */
interface Part {
  /** Horizontal extent. */
  w: number;
  /** Vertical extent. */
  ht: number;
  /** Centre, relative to the centroid. */
  uc: number;
  vc: number;
}

/**
 * The five parts of a C, centroid at the origin.
 *
 * Both flanges point the same way, so the section is symmetric about the horizontal axis
 * (`vc` pairs cancel) and NOT about the vertical one: the horizontal centroid `uBar` has to be
 * computed, exactly as the `C-custom` case computes its `zBar`.
 */
function partsC(spec: ColdFormedSpec): Part[] {
  const { hMm: h, bMm: b, cMm: c, tMm: t } = spec;
  const hw = h - 2 * t;
  // Measured from the OUTSIDE of the web at u = 0, then shifted to the centroid.
  const raw: Part[] = [
    { w: t, ht: hw, uc: t / 2, vc: 0 },                       // web
    { w: b, ht: t, uc: b / 2, vc: (h - t) / 2 },              // top flange
    { w: b, ht: t, uc: b / 2, vc: -(h - t) / 2 },             // bottom flange
    { w: t, ht: c, uc: b - t / 2, vc: (h - t) / 2 - c / 2 },  // top lip, pointing in
    { w: t, ht: c, uc: b - t / 2, vc: -((h - t) / 2 - c / 2) },// bottom lip
  ];
  const area = raw.reduce((s, p) => s + p.w * p.ht, 0);
  const uBar = raw.reduce((s, p) => s + p.w * p.ht * p.uc, 0) / area;
  return raw.map((p) => ({ ...p, uc: p.uc - uBar }));
}

/**
 * The five parts of a Z, centroid at the origin.
 *
 * The flanges point OPPOSITE ways, which makes the section point-symmetric about the centre of
 * the web — so the centroid is known in closed form (no `uBar` to solve) and every part has a
 * partner at `(−uc, −vc)`. That symmetry is also why the product of inertia does not cancel:
 * each pair contributes `+A·uc·vc` twice instead of once with each sign.
 */
function partsZ(spec: ColdFormedSpec): Part[] {
  const { hMm: h, bMm: b, cMm: c, tMm: t } = spec;
  const hw = h - 2 * t;
  // Origin at the centre of the web: u = 0 is the web's mid-thickness, v = 0 its mid-height.
  const uFlange = (b - t) / 2;         // flange centre, offset from the web centre
  const vFlange = (h - t) / 2;         // flange centre height
  const uLip = b - t;                  // lip centre, offset from the web centre
  /*
   * Lip centre height, measured the way `partsC` measures it — from the flange's MID-thickness,
   * not its outer face.
   *
   * Which convention is used matters less than using ONE. The app already carries both: the
   * `C-custom` properties case puts the lip centre at `(h − tf)/2 − c/2` (mid-thickness) while
   * `createCShape` draws it from the outer face. `partsC` follows the properties case, because
   * that is what this module is checked against — so `partsZ` has to follow it too, or a Z and a
   * C of the same four dimensions would disagree about a lip position by `t/2` for no reason.
   * That disagreement is exactly what the Z-against-C test caught.
   */
  const vLip = (h - t) / 2 - c / 2;
  return [
    { w: t, ht: hw, uc: 0, vc: 0 },                    // web
    { w: b, ht: t, uc: uFlange, vc: vFlange },         // top flange, +u
    { w: b, ht: t, uc: -uFlange, vc: -vFlange },       // bottom flange, −u
    { w: t, ht: c, uc: uLip, vc: vLip },               // top lip, hanging down
    { w: t, ht: c, uc: -uLip, vc: -vLip },             // bottom lip, rising
  ];
}

/**
 * Second moments and product of a rectangle decomposition about the centroidal axes.
 *
 * An axis-aligned rectangle has zero product of inertia about its OWN centroid, so the whole
 * product comes from the transfer terms `A·uc·vc` — which is the algebraic reason a symmetric
 * section has none and a Z does.
 */
function inertia(parts: readonly Part[]) {
  let area = 0, iy = 0, iz = 0, ixy = 0;
  for (const p of parts) {
    const a = p.w * p.ht;
    area += a;
    iy += (p.w * p.ht ** 3) / 12 + a * p.vc ** 2;
    iz += (p.ht * p.w ** 3) / 12 + a * p.uc ** 2;
    ixy += a * p.uc * p.vc;
  }
  return { area, iy, iz, ixy };
}

/**
 * The rotation, in degrees, from the geometric axes to the nearer principal axis.
 *
 * `I_uv(θ) = ((iy − iz)/2)·sin2θ + ixy·cos2θ` vanishes at `2θ = atan2(−2·ixy, iy − iz)`, which
 * puts θ anywhere in (−90, 90]. Since `I_uv(θ ± 90°) = −I_uv(θ)`, shifting by a quarter turn
 * keeps the product zero and swaps which principal value the axis carries — so the shift is free
 * and the smaller magnitude is the one worth reporting.
 */
function nearerPrincipalAngleDeg(iy: number, iz: number, ixy: number): number {
  let deg = (Math.atan2(-2 * ixy, iy - iz) * 90) / Math.PI;
  if (deg > 45) deg -= 90;
  else if (deg <= -45) deg += 90;
  return deg;
}

/**
 * Geometry of a cold-formed C or Z. Returns `null` for a spec that cannot be bent.
 *
 * Everything here is derived. Nothing is looked up, because there is nothing to look up: see the
 * module header on why this family is parametric.
 */
export function coldFormedGeometry(spec: ColdFormedSpec): ColdFormedGeometry | null {
  if (!validateColdFormed(spec).ok) return null;

  const parts = spec.shape === 'C' ? partsC(spec) : partsZ(spec);
  const { area, iy, iz, ixy } = inertia(parts);

  // Principal values from the invariants of the second-moment tensor. Written this way rather
  // than as a rotation formula because the trace and determinant are checkable:
  //   iMax + iMin = iy + iz  and  iMax·iMin = iy·iz − ixy²  (the test asserts both).
  const mean = (iy + iz) / 2;
  const half = Math.hypot((iy - iz) / 2, ixy);
  const iMax = mean + half;
  const iMin = mean - half;
  // The angle that ZEROES the product of inertia. Rotating the axes by θ gives
  //   I_uv(θ) = ((iy − iz)/2)·sin2θ + ixy·cos2θ,
  // so I_uv = 0 at 2θ = atan2(−2·ixy, iy − iz). The negated first argument is the whole content
  // of the sign convention, and `cold-formed-geometry.test.ts` checks it by rotating the tensor
  // by this angle and asserting the product actually vanishes — not by re-deriving the formula.
  //
  // atan2 rather than atan keeps the quadrant right and stays defined when iy === iz, where
  // dividing by (iy − iz) would not be.
  const principalAngleDeg = ixy === 0 ? 0 : nearerPrincipalAngleDeg(iy, iz, ixy);

  const { hMm: h, bMm: b, cMm: c, tMm: t } = spec;
  const hw = h - 2 * t;
  // Open thin-walled torsion: ⅓ Σ sᵢ tᵢ³ over web, two flanges and two lips. Identical in form
  // to the `C-custom` case's `j`, with one thickness throughout.
  const jMm4 = (1 / 3) * t ** 3 * (hw + 2 * b + 2 * c);

  return {
    areaMm2: area,
    iyMm4: iy,
    izMm4: iz,
    ixyMm4: ixy,
    iMaxMm4: iMax,
    iMinMm4: iMin,
    principalAngleDeg,
    jMm4,
    // mm² → m², times kg/m³.
    massKgPerM: (area / 1e6) * STEEL_DENSITY,
  };
}

// ─────────────────────────── designation grammar ───────────────────────────

/**
 * The designation format, and the fact that it is a CONVENTION and not a standard.
 *
 * `C 100x50x15x2.0` — shape, then depth × flange × lip × thickness, all mm. The order is the one
 * mill catalogues and the cold-formed literature use, deepest dimension first, and it is written
 * down here because this module is the only thing that defines it: no shipped standard in
 * `docs/codes/` specifies a designation for these sections, so claiming one would be inventing
 * authority. If a sourced series later names them differently, the parser gains an alias table
 * and the stored ids keep resolving.
 *
 * `x` and `×` are both accepted on input; output always uses `x`, so an id is ASCII and safe in a
 * filename, a URL and a `.ded`.
 */
const DESIGNATION = /^([CZ])\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)$/i;

/** Trailing zeros dropped, comma accepted on input: `2,00` and `2.0` are the same thickness. */
const num = (s: string) => Number.parseFloat(s.replace(',', '.'));

/**
 * Parse a designation into a spec. Returns `null` for anything that is not one.
 *
 * Deliberately strict about the SHAPE of the string and permissive about spacing and decimal
 * separator, because the strictness is what makes a stored id unambiguous while the permissiveness
 * is what lets a person type one.
 */
export function parseColdFormedDesignation(id: string): ColdFormedSpec | null {
  const m = DESIGNATION.exec(id.trim());
  if (!m) return null;
  const spec: ColdFormedSpec = {
    shape: m[1].toUpperCase() as ColdFormedShape,
    hMm: num(m[2]),
    bMm: num(m[3]),
    cMm: num(m[4]),
    tMm: num(m[5]),
  };
  return validateColdFormed(spec).ok ? spec : null;
}

/**
 * The canonical designation of a spec — the id everything else stores.
 *
 * Round-trips with `parseColdFormedDesignation` by construction, which
 * `cold-formed-resolution.test.ts` checks over a grid: a stored id has to survive a save, and a
 * parametric family has no table to fall back on if it does not.
 *
 * Thicknesses print with one decimal (`2.0`), the others as integers when they are whole, because
 * `C 100x50x15x2` and `C 100x50x15x2.0` must not be two different sections.
 */
export function formatColdFormedDesignation(spec: ColdFormedSpec): string {
  const dim = (v: number) => (Number.isInteger(v) ? String(v) : String(v));
  return `${spec.shape} ${dim(spec.hMm)}x${dim(spec.bMm)}x${dim(spec.cMm)}x${spec.tMm.toFixed(1)}`;
}
