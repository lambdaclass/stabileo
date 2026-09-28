/**
 * The meshes for a designed bolted joint — plate with real holes, bolts with head and shank.
 *
 * ── Why this is a module and not more of `Viewport3D` ───────────────
 *
 * The viewport built these inline, and that is where the geometry went wrong. `jointSceneLayout`
 * computed the plate's frame, placed the bolt centres in it, and then the viewport drew the
 * plate as an AXIS-ALIGNED `BoxGeometry` and left every shank on three.js's default cylinder
 * axis — because neither the frame nor the holes crossed the boundary between the two.
 *
 * Measured on the default shed, joint node 9, whose first member runs along global Z: the plate
 * was drawn 190 mm along X, and **four of its six bolts stood outside it**. With the frame
 * exported and applied here: zero of six.
 *
 * So this module exists to keep the two halves in one place. It takes the layout — which is
 * arithmetic on `JointDesign` and therefore testable without a canvas — and does nothing but
 * turn it into meshes. It invents no dimension: every number it reads comes from the layout.
 *
 * ── One entity, still ───────────────────────────────────────────────
 *
 * There is no view model here either. `JointSceneLayout` is derived from `JointDesign` on every
 * read, and `JointDesign` is what the panel lists. A plate 12 mm thick on screen while the
 * bearing check ran on 10 stays impossible by construction.
 *
 * ── Holes are cut, not painted ──────────────────────────────────────
 *
 * `THREE.Shape` carries `holes`, and `ExtrudeGeometry` honours them, so the plate is a real
 * perforated solid without a CSG dependency. That matters beyond looks: the §J.3.10 bearing
 * check is a check ON the hole, and a solid slab with bolts resting on it is a picture of a
 * different connection. A 20 mm shank inside a 22 mm hole — Tabla J.3.3 — is now visible as the
 * clearance it is.
 */

import * as THREE from 'three';
import type { JointFrame, JointSceneLayout, PlacedBolt } from './joint-layout';

/** What the viewport needs back: the meshes, and the count it publishes for the specs. */
export interface JointMeshes {
  meshes: THREE.Mesh[];
  /** Radius of a sphere at the joint centre that contains every part, metres. */
  boundingRadiusM: number;
}

/*
 * Colours, kept as the viewport had them so this refactor changes geometry and not palette.
 *
 * `exceeded` does NOT get its own colour here. The state belongs to the panel's vocabulary
 * (`within / near the limit / over the limit`) and recolouring the steel would be a second
 * verdict system in a third place — the thing M2's decision 2 was about. The geometry of a
 * failing joint is drawn exactly like the geometry of a passing one, because it IS the same
 * geometry: that is the whole reason an `exceeded` joint stays visible.
 */
const PLATE_COLOUR = 0x8899aa;
const BOLT_COLOUR = 0x445566;

/** Radial segments for a shank. Enough to read as round at inspection zoom. */
const SHANK_SEGMENTS = 12;
/** Six, so the head reads as hexagonal — the shape a spanner goes on. */
const HEAD_SEGMENTS = 6;

/**
 * The rotation that takes local `(x, y, z)` to the frame's `(u, v, n)`.
 *
 * Built as a basis matrix rather than from Euler angles or a `lookAt`: the frame is already
 * orthonormal and right-handed — `jointSceneLayout` builds `n` as `u × v` for exactly this —
 * so the matrix IS the rotation, with no order-of-rotation convention to get wrong.
 */
function basisQuaternion(frame: JointFrame): THREE.Quaternion {
  const m = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(frame.u.x, frame.u.y, frame.u.z),
    new THREE.Vector3(frame.v.x, frame.v.y, frame.v.z),
    new THREE.Vector3(frame.n.x, frame.n.y, frame.n.z),
  );
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

/** The plate: a rectangle in `(u, v)` with a circular hole per bolt, extruded along `n`. */
function plateMesh(layout: JointSceneLayout, nodeId: number): THREE.Mesh | null {
  const p = layout.plate;
  const frame = layout.frame;
  if (!p || !frame) return null;

  const halfL = p.lengthM / 2;
  const halfW = p.widthM / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-halfL, -halfW);
  shape.lineTo(halfL, -halfW);
  shape.lineTo(halfL, halfW);
  shape.lineTo(-halfL, halfW);
  shape.closePath();

  /*
   * One `Path` per hole, in the SAME `(u, v)` frame the shape is drawn in — which is why the
   * layout carries `uv` beside the model-space centre. Using the model-space point here would
   * need an inverse transform to get back the number the design already had.
   */
  for (const hole of p.holes) {
    const path = new THREE.Path();
    path.absarc(hole.uv.u, hole.uv.v, hole.diameterM / 2, 0, Math.PI * 2, true);
    shape.holes.push(path);
  }

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: p.thicknessM,
    bevelEnabled: false,
    curveSegments: SHANK_SEGMENTS,
  });
  /*
   * `ExtrudeGeometry` grows from the shape plane towards `+z`, so the solid would sit on one
   * face of the mid-plane the layout's centre describes. Translated by half the thickness so the
   * plate is centred on it — the bolts are centred there too, and a plate offset by 6 mm from
   * its own bolts is the same class of defect this module was written to fix.
   */
  geometry.translate(0, 0, -p.thicknessM / 2);

  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: PLATE_COLOUR, roughness: 0.6, metalness: 0.3,
    transparent: true, opacity: 0.85,
    /*
     * Both faces, because a perforated plate is now something you can see through. With
     * front-face culling the inside of every hole would be missing and the plate would read as
     * painted-on circles rather than as holes.
     */
    side: THREE.DoubleSide,
  }));
  mesh.position.set(p.centreM.x, p.centreM.y, p.centreM.z);
  mesh.quaternion.copy(basisQuaternion(frame));
  mesh.userData = { type: 'jointPlate', nodeId, jointPickable: true };
  return mesh;
}

/**
 * One bolt: shank through the plate, plus a head on the near face.
 *
 * Two meshes rather than a merged one, so a click resolves to `jointBolt` either way and the
 * head can be told from the shank in a trace.
 */
function boltMeshes(bolt: PlacedBolt, thicknessM: number, nodeId: number): THREE.Mesh[] {
  const axis = new THREE.Vector3(bolt.axis.x, bolt.axis.y, bolt.axis.z).normalize();
  // A cylinder is born along +Y; this is the turn that puts it on the plate normal.
  const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  const centre = new THREE.Vector3(bolt.centreM.x, bolt.centreM.y, bolt.centreM.z);
  const material = () => new THREE.MeshStandardMaterial({
    color: BOLT_COLOUR, roughness: 0.4, metalness: 0.7,
  });

  /*
   * The shank spans the plate and stands slightly proud on both faces.
   *
   * `bolt.lengthM` is the grip — the thickness it passes through — and a shank cut exactly to it
   * would be coplanar with the plate faces, which z-fights along every hole edge. The
   * protrusion is a rendering margin, not a bolt length: nothing reads it, and the grip stays
   * `lengthM`.
   */
  const proud = thicknessM * 0.15;
  const shank = new THREE.Mesh(
    new THREE.CylinderGeometry(bolt.diameterM / 2, bolt.diameterM / 2,
      bolt.lengthM + 2 * proud, SHANK_SEGMENTS),
    material(),
  );
  shank.position.copy(centre);
  shank.quaternion.copy(turn);
  shank.userData = { type: 'jointBolt', nodeId, part: 'shank', jointPickable: true };

  const head = new THREE.Mesh(
    new THREE.CylinderGeometry(bolt.head.diameterM / 2, bolt.head.diameterM / 2,
      bolt.head.heightM, HEAD_SEGMENTS),
    material(),
  );
  // On the +n face, clear of the plate: half the plate plus half the head.
  head.position.copy(centre).addScaledVector(axis, bolt.lengthM / 2 + bolt.head.heightM / 2);
  head.quaternion.copy(turn);
  head.userData = { type: 'jointBolt', nodeId, part: 'head', jointPickable: true };

  return [shank, head];
}

/**
 * Every mesh for a joint, or none.
 *
 * None is a legitimate answer and the caller must treat it as one: a layout with no plate is a
 * joint whose geometry is unavailable, and `layout.emptyReasonKeys` is what says why. Drawing a
 * placeholder here would be the fiction the layout module refuses one level up.
 */
export function buildJointMeshes(layout: JointSceneLayout, nodeId: number): JointMeshes {
  const meshes: THREE.Mesh[] = [];
  const plate = plateMesh(layout, nodeId);
  if (plate) meshes.push(plate);

  const thicknessM = layout.plate?.thicknessM ?? 0;
  for (const bolt of layout.bolts) meshes.push(...boltMeshes(bolt, thicknessM, nodeId));

  /*
   * The bounding radius, for framing the camera. Measured from the parts rather than from the
   * plate alone: a head stands proud of the plate, so a radius taken from the plate would frame
   * a joint with its bolt heads cropped.
   */
  let boundingRadiusM = 0;
  const centre = layout.plate?.centreM;
  if (centre) {
    const half = Math.hypot(
      (layout.plate?.lengthM ?? 0) / 2,
      (layout.plate?.widthM ?? 0) / 2,
      (layout.plate?.thicknessM ?? 0) / 2,
    );
    let boltReach = 0;
    for (const bolt of layout.bolts) {
      const d = Math.hypot(
        bolt.centreM.x - centre.x, bolt.centreM.y - centre.y, bolt.centreM.z - centre.z,
      );
      boltReach = Math.max(boltReach, d + bolt.head.diameterM / 2 + bolt.head.heightM);
    }
    boundingRadiusM = Math.max(half, boltReach);
  }

  return { meshes, boundingRadiusM };
}
