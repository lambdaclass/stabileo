/**
 * Where a joint's parts go in the scene — pure, so the placement is testable without a canvas.
 *
 * ── Why this is not in the viewport ─────────────────────────────────
 *
 * The viewport builds meshes. Deciding WHERE a plate sits and where its bolts go is arithmetic
 * on the design, and arithmetic hidden inside a `THREE.Mesh` constructor is arithmetic nobody
 * can test. So the placement lives here and the viewport consumes it.
 *
 * It reads `JointDesign` — the same object the panel lists and a document will tabulate. There
 * is deliberately no view model: two representations of one plate are two things that can
 * disagree, and the one on screen would be the one nobody checked.
 *
 * ── What it will not place ──────────────────────────────────────────
 *
 * A joint whose state is `notDesigned` or whose plate is `GEOMETRY_UNAVAILABLE` produces an
 * EMPTY layout. Not a placeholder, not a ghost outline — nothing. Drawing a plate for a joint
 * that has none is the fiction this whole scope refuses, and it is worse in 3-D than in a table
 * because a rendered plate looks finished.
 */

import type { JointDesign } from '../connection/joint-design';

export interface PlacedPlate {
  /** Centre, metres, model coordinates. */
  centreM: { x: number; y: number; z: number };
  lengthM: number;
  widthM: number;
  thicknessM: number;
}

export interface PlacedBolt {
  /** Centre of the shank, metres, model coordinates. */
  centreM: { x: number; y: number; z: number };
  /** Shank diameter, metres — the BOLT, not the hole. */
  diameterM: number;
  /** Length through the plate, metres. */
  lengthM: number;
}

export interface PlacedBatten {
  /** Centre, metres, model coordinates. */
  centreM: { x: number; y: number; z: number };
  /** Distance from the member's I end, metres — so a drawing can dimension it. */
  atM: number;
  kind: 'end' | 'intermediate';
}

export interface JointSceneLayout {
  plate: PlacedPlate | null;
  bolts: readonly PlacedBolt[];
  /** Only where §E.6 determined a position. The plate itself is still unavailable. */
  battens: readonly PlacedBatten[];
  /** Why nothing is drawn, when nothing is. Empty when the layout has content. */
  emptyReasonKeys: readonly string[];
}

const EMPTY: JointSceneLayout = Object.freeze({
  plate: null, bolts: [], battens: [], emptyReasonKeys: [],
});

/**
 * The scene layout for a design.
 *
 * `axis` is the member direction the plate lies along, as a unit vector. Supplied by the caller
 * because the viewport knows the members and this module deliberately does not — asking it to
 * derive the direction would give it a second opinion about the model's geometry.
 */
export function jointSceneLayout(
  design: JointDesign,
  axis: { x: number; y: number; z: number } = { x: 1, y: 0, z: 0 },
): JointSceneLayout {
  /*
   * Nothing is drawn for a joint that is not designed, and nothing is drawn for one whose
   * checks failed either — an `exceeded` joint HAS geometry, and hiding it would hide the thing
   * the user needs to look at. So only the absence of geometry stops the drawing, not the
   * verdict about it.
   */
  if (design.plate.state !== 'available') {
    return { ...EMPTY, emptyReasonKeys: design.plate.missingKeys };
  }
  if (design.state === 'notDesigned') {
    return { ...EMPTY, emptyReasonKeys: ['joint.scene.notDesigned'] };
  }

  const p = design.plate.plate;
  const o = p.originM;

  /*
   * The plate's own frame, from the member axis.
   *
   * `u` runs along the force, `v` across it in the horizontal plane, and the normal is their
   * cross product. A vertical member would make the horizontal `v` degenerate, so it falls back
   * to the global Y axis — a column's gusset lies in a vertical plane, and picking a degenerate
   * basis would collapse the plate to a line.
   */
  const len = Math.hypot(axis.x, axis.y, axis.z) || 1;
  const u = { x: axis.x / len, y: axis.y / len, z: axis.z / len };
  const horizontal = Math.hypot(u.x, u.y);
  const v = horizontal > 1e-6
    ? { x: -u.y / horizontal, y: u.x / horizontal, z: 0 }
    : { x: 0, y: 1, z: 0 };

  const bolts: PlacedBolt[] = p.holesM.map((h) => ({
    centreM: {
      x: o.x + u.x * h.u + v.x * h.v,
      y: o.y + u.y * h.u + v.y * h.v,
      z: o.z + u.z * h.u + v.z * h.v,
    },
    /*
     * The BOLT diameter, from the bolt's own nominal area.
     *
     * Not the hole's: `holeDiameterM` is Tabla J.3.3's hole, and a shank drawn to fill it would
     * be 2 mm too fat on every bolt. And not `minSpacing / 3` either — that inverts §J.3.3 to
     * recover a number the design already carries directly, which works until someone changes
     * the spacing rule.
     */
    diameterM: design.bolts.boltAreaCm2 !== null
      ? 2 * Math.sqrt(design.bolts.boltAreaCm2 / Math.PI) / 100
      : 0,
    lengthM: p.thicknessM,
  }));

  const battens: PlacedBatten[] =
    design.battens?.state === 'available'
      ? design.battens.layout.stations.map((s) => ({
          centreM: { x: o.x + u.x * s.atM, y: o.y + u.y * s.atM, z: o.z + u.z * s.atM },
          atM: s.atM,
          kind: s.kind,
        }))
      : [];

  return {
    plate: {
      centreM: o,
      lengthM: p.lengthM,
      widthM: p.widthM,
      thicknessM: p.thicknessM,
    },
    bolts,
    battens,
    emptyReasonKeys: [],
  };
}

/** Whether there is anything at all to add to the scene. */
export function hasSceneContent(l: JointSceneLayout): boolean {
  return l.plate !== null || l.bolts.length > 0 || l.battens.length > 0;
}
