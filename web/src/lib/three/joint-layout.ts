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

/**
 * A right-handed orthonormal basis: `u` along the member, `v` across it, `n` the plate normal.
 *
 * Exported because the VIEWPORT needs it and could not previously have it. The basis was
 * computed here and kept here, so the viewport placed bolt centres correctly — they come from
 * this module — and then drew the plate as an axis-aligned box, because an axis-aligned box was
 * all it could build without the frame. Measured on the default shed, joint node 9, whose first
 * member runs along global Z: **four of its six bolts landed outside the plate**. The plate was
 * drawn 190 mm along X where the member runs along Z.
 *
 * A frame is the smallest thing that fixes it, and it belongs to the layout rather than to the
 * viewport for the same reason the placement does: it is arithmetic on the design.
 */
export interface JointFrame {
  u: { x: number; y: number; z: number };
  v: { x: number; y: number; z: number };
  n: { x: number; y: number; z: number };
}

/** A hole through the plate — position in model coordinates, plus the frame-local pair. */
export interface PlacedHole {
  /** Centre, metres, model coordinates. */
  centreM: { x: number; y: number; z: number };
  /** The same point in the plate's own frame, metres — what a drawing dimensions. */
  uv: { u: number; v: number };
  /** Tabla J.3.3's hole, metres. Carried from the design; never derived from the bolt. */
  diameterM: number;
}

export interface PlacedPlate {
  /** Centre, metres, model coordinates. */
  centreM: { x: number; y: number; z: number };
  lengthM: number;
  widthM: number;
  thicknessM: number;
  /**
   * The holes, in model coordinates and in the plate frame.
   *
   * `PlateGeometry` has carried `holesM` and `holeDiameterM` all along; this layer used them to
   * place bolts and then dropped them, so the viewport had no hole to draw and drew a solid
   * slab. The bolts are what tell you where the holes are, which is backwards: a hole is a
   * feature of the plate, and an `exceeded` bearing check is a check on the hole.
   */
  holes: readonly PlacedHole[];
}

export interface PlacedBolt {
  /** Centre of the shank, metres, model coordinates. */
  centreM: { x: number; y: number; z: number };
  /** Shank diameter, metres — the BOLT, not the hole. */
  diameterM: number;
  /** Length through the plate, metres. */
  lengthM: number;
  /**
   * The shank's axis — the plate normal, as a unit vector.
   *
   * A bolt goes THROUGH the plate, so its axis is the normal and not the member direction. The
   * viewport had no normal to use and left every shank on three.js's default cylinder axis
   * (global Y), so on any plate that was not horizontal the bolts lay in the plate rather than
   * passing through it.
   */
  axis: { x: number; y: number; z: number };
  /**
   * Head diameter and height, metres — **a drawing convention, not a design dimension.**
   *
   * The repository has no head, nut or washer data: nothing in `connection/` or `data/` carries
   * an across-flats table, and CIRSOC 301 §J.3 does not supply one either — it dimensions the
   * bolt by its nominal body area, which is what the shank above uses and what the checks run
   * on. So a head cannot be *derived*; it can only be *drawn*.
   *
   * It is therefore declared here, in one place, as a proportion of the nominal diameter, and it
   * is deliberately NOT presented anywhere as a fabrication dimension. Nothing computes with it:
   * grep for `head` outside the mesh builder and this file and you will find no check, no
   * capacity and no export reading it. If a real table ever lands, this is the one constant that
   * changes and the shank does not move.
   */
  head: { diameterM: number; heightM: number };
}

/**
 * The head proportions, as a drawing convention. See `PlacedBolt.head`.
 *
 * Chosen to read as a hex head at inspection zoom and to stay clear of its neighbour at the
 * §J.3.3 minimum spacing of `3d`: a head of `1.6d` leaves `1.4d` of gap between two adjacent
 * heads, so the group reads as bolts rather than as a merged blob.
 */
const HEAD_DIAMETER_FACTOR = 1.6;
const HEAD_HEIGHT_FACTOR = 0.65;

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
  /**
   * The plate's frame, or null when there is nothing placed.
   *
   * Null rather than an identity basis on an empty layout: an identity would be a frame the
   * caller could orient a mesh by, for a joint that has no mesh.
   */
  frame: JointFrame | null;
  /** Why nothing is drawn, when nothing is. Empty when the layout has content. */
  emptyReasonKeys: readonly string[];
}

const EMPTY: JointSceneLayout = Object.freeze({
  plate: null, bolts: [], battens: [], frame: null, emptyReasonKeys: [],
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

  /*
   * The normal, `u × v`. Right-handed, so `{u, v, n}` is a rotation and not a reflection — a
   * reflected basis would mirror the hole pattern of any asymmetric layout.
   */
  const n = {
    x: u.y * v.z - u.z * v.y,
    y: u.z * v.x - u.x * v.z,
    z: u.x * v.y - u.y * v.x,
  };
  const frame: JointFrame = { u, v, n };

  /** A frame-local `(u, v)` pair as a point in model coordinates, on the plate's mid-plane. */
  const toModel = (hu: number, hv: number) => ({
    x: o.x + u.x * hu + v.x * hv,
    y: o.y + u.y * hu + v.y * hv,
    z: o.z + u.z * hu + v.z * hv,
  });

  /*
   * The bolt's nominal diameter, from the bolt's own nominal area — see below. Hoisted out of
   * the per-hole map because the head is a proportion of it and computing it six times to
   * throw five away reads as if it could differ per bolt.
   */
  const boltDiameterM = design.bolts.boltAreaCm2 !== null
    ? 2 * Math.sqrt(design.bolts.boltAreaCm2 / Math.PI) / 100
    : 0;

  const holes: PlacedHole[] = p.holesM.map((h) => ({
    centreM: toModel(h.u, h.v),
    uv: { u: h.u, v: h.v },
    diameterM: p.holeDiameterM,
  }));

  const bolts: PlacedBolt[] = p.holesM.map((h) => ({
    centreM: toModel(h.u, h.v),
    /*
     * The BOLT diameter, from the bolt's own nominal area — computed once, above.
     *
     * Not the hole's: `holeDiameterM` is Tabla J.3.3's hole, and a shank drawn to fill it would
     * be 2 mm too fat on every bolt. That distinction is now visible on screen rather than only
     * true in the data, because the hole is drawn too: a 20 mm shank in a 22 mm hole.
     * And not `minSpacing / 3` either — that inverts §J.3.3 to recover a number the design
     * already carries directly, which works until someone changes the spacing rule.
     */
    diameterM: boltDiameterM,
    lengthM: p.thicknessM,
    axis: n,
    head: {
      diameterM: boltDiameterM * HEAD_DIAMETER_FACTOR,
      heightM: boltDiameterM * HEAD_HEIGHT_FACTOR,
    },
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
      holes,
    },
    bolts,
    battens,
    frame,
    emptyReasonKeys: [],
  };
}

/** Whether there is anything at all to add to the scene. */
export function hasSceneContent(l: JointSceneLayout): boolean {
  return l.plate !== null || l.bolts.length > 0 || l.battens.length > 0;
}
