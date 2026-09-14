/**
 * The gusset or end plate a bolted joint needs — derived from the layout, never assumed.
 *
 * ── What makes this a derivation and not an invention ───────────────
 *
 * Every dimension here is a consequence of numbers the user already chose:
 *
 *   · the bolt COUNT and ROWS fix how many holes go in each direction;
 *   · the SPACING fixes the distance between them;
 *   · the EDGE DISTANCE fixes the margin around the outermost holes;
 *   · so the plate's length and width are `(n − 1)·s + 2·e` in each direction. Arithmetic on
 *     chosen values, with no free parameter.
 *
 * The thickness is the one dimension that is NOT derived, and it is not guessed either: it is
 * the plate the user supplies, the same `t` §J.3.10 checks bearing against. A plate whose
 * thickness this module chose would be a fabricated dimension with a plausible value, which is
 * the worst kind — it looks checked.
 *
 * ── One entity, not one per surface ─────────────────────────────────
 *
 * `PlateGeometry` is what the detail panel reads, what the 3-D view extrudes, and what a
 * document will list. There is deliberately no second «view model»: two representations of one
 * plate are two things that can disagree, and the one on screen would be the one nobody
 * checked.
 *
 * ── Orientation ─────────────────────────────────────────────────────
 *
 * The plate lies in the plane of the connection, centred on the joint, with its long axis along the
 * force. `originM` is the joint's own position, so a consumer places it without knowing anything
 * about the joint but its node.
 */

import type { BoltLayoutChoice } from './bolted-joint';

export interface PlateGeometry {
  /** Along the force, metres. */
  lengthM: number;
  /** Across it, metres. */
  widthM: number;
  /** Metres. Supplied, never derived — see the header. */
  thicknessM: number;
  /** Joint position, metres, in model coordinates. */
  originM: { x: number; y: number; z: number };
  /**
   * Hole centres in the plate's own frame, metres, origin at the plate centre.
   *
   * The same list the 3-D view draws and a fabrication drawing would dimension. Derived from the
   * layout, so a plate can never show a different number of holes from the design that produced
   * it.
   */
  holesM: ReadonlyArray<{ u: number; v: number }>;
  /** Hole diameter, metres — Tabla J.3.3, supplied by the caller. */
  holeDiameterM: number;
}

/** Why no plate could be produced. */
export interface PlateUnavailable {
  state: 'GEOMETRY_UNAVAILABLE';
  missingKeys: readonly string[];
}

export type PlateResult = { state: 'available'; plate: PlateGeometry } | PlateUnavailable;

export interface PlateInputs {
  layout: BoltLayoutChoice | null;
  /** Plate thickness, mm. The user's, not a default. */
  thicknessMm?: number;
  /** Standard hole diameter, mm — from `bolt-geometry`'s Tabla J.3.3 lookup. */
  holeDiameterMm?: number | null;
  /** Where the joint is, metres. */
  originM?: { x: number; y: number; z: number };
}

/**
 * The plate for a layout, or the reason there is none.
 *
 * `rows` is the count ACROSS the force; `count / rows` gives the bolts per row. A count that is
 * not a whole multiple of the rows describes a layout nobody can fabricate, and it is refused
 * rather than rounded — rounding would silently draw a plate for a different bolt group than the
 * one that was checked.
 */
export function plateForLayout(input: PlateInputs): PlateResult {
  const { layout, thicknessMm, holeDiameterMm, originM } = input;
  const missing: string[] = [];
  if (!layout || !(layout.count > 0) || !(layout.rows > 0)) missing.push('plate.missing.layout');
  if (!(thicknessMm && thicknessMm > 0)) missing.push('plate.missing.thickness');
  if (!(holeDiameterMm && holeDiameterMm > 0)) missing.push('plate.missing.holeDiameter');
  if (!originM) missing.push('plate.missing.origin');
  if (missing.length > 0) return { state: 'GEOMETRY_UNAVAILABLE', missingKeys: missing };

  const l = layout!;
  const perRow = l.count / l.rows;
  if (!Number.isInteger(perRow) || perRow < 1) {
    return {
      state: 'GEOMETRY_UNAVAILABLE',
      missingKeys: ['plate.missing.countNotDivisibleByRows'],
    };
  }

  const s = l.spacingMm / 1000;
  const e = l.edgeDistanceMm / 1000;
  /*
   * The gauge across the force. The layout carries one spacing; using it in both directions is
   * the ordinary square pattern and is what the checks were run against, so drawing anything
   * else would draw a plate that was never checked.
   */
  const g = s;

  const lengthM = (perRow - 1) * s + 2 * e;
  const widthM = (l.rows - 1) * g + 2 * e;

  const holes: Array<{ u: number; v: number }> = [];
  for (let r = 0; r < l.rows; r++) {
    for (let c = 0; c < perRow; c++) {
      holes.push({
        u: -((perRow - 1) * s) / 2 + c * s,
        v: -((l.rows - 1) * g) / 2 + r * g,
      });
    }
  }

  return {
    state: 'available',
    plate: {
      lengthM, widthM,
      thicknessM: thicknessMm! / 1000,
      originM: originM!,
      holesM: holes,
      holeDiameterM: holeDiameterMm! / 1000,
    },
  };
}

/** Plate area, m² — what a take-off lists. Derived, so it cannot disagree with the drawing. */
export function plateAreaM2(p: PlateGeometry): number {
  return p.lengthM * p.widthM;
}

/** Plate mass, kg, at the density of structural steel. */
export function plateMassKg(p: PlateGeometry, densityKgM3 = 7850): number {
  return plateAreaM2(p) * p.thicknessM * densityKgM3;
}
