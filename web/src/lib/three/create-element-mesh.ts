// Create Three.js mesh group for a structural element. In solid/sections render
// modes both frames and trusses draw as cylinders / extruded section profiles;
// wireframe is rendered by the shared batched LineSegments2.
import * as THREE from 'three';
import { COLORS } from './selection-helpers';
import { createSectionShapes } from './section-profiles';
import { GLOBAL_Z, THREEJS_CYLINDER_AXIS } from '../geometry/coordinate-system';
import type { Section } from '../store/model.svelte';

/** Shared resolution vector for LineMaterial (screen-space line widths). */
export const fatLineResolution = new THREE.Vector2(1, 1);

/** Update the shared resolution — call from Viewport3D on resize. */
export function setLineResolution(w: number, h: number): void {
  fatLineResolution.set(w, h);
}

/** Per-axis end release, matching the model's typed `Release` (my/mz/t). Only
 *  these three flags drive the 3D end-marker visual — `slide`/`slideAxis` are
 *  not glyphed here. */
export interface ReleaseFlags {
  my: boolean;
  mz: boolean;
  t: boolean;
}

export interface CreateElementOpts {
  elementId: number;
  elementType: 'frame' | 'truss';
  /** Typed release at the I end (nI). A released end draws the end marker when
   *  ANY of my/mz/t is true — not just mz (the old hingeStart boolean leaked
   *  only strong-axis releases, hiding My-only or torsion-only releases). */
  releaseI?: ReleaseFlags;
  /** Typed release at the J end (nJ). See releaseI. */
  releaseJ?: ReleaseFlags;
  selected?: boolean;
  hovered?: boolean;
  /** Optional section for extruded profile visualization */
  section?: Section;
  /** Section rotation in degrees (rotation around bar axis) */
  sectionRotation?: number;
  /** Element roll angle β in degrees (rotation around bar axis) */
  elementRollAngle?: number;
  /** Render mode: wireframe=simple lines, solid=cylinders, sections=extruded profiles */
  renderMode?: 'wireframe' | 'solid' | 'sections';
  /** Element local axes (from computeLocalAxes3D) used to orient extruded sections. */
  localAxes?: { ex: [number, number, number]; ey: [number, number, number]; ez: [number, number, number] };
}

/**
 * Create a Group for a structural element between two nodes.
 * renderMode controls visualization:
 *   'wireframe' → simple lines for all elements
 *   'solid' → cylinders for frames, lines for trusses (default)
 *   'sections' → extruded profiles for frames (fallback to cylinder), lines for trusses
 */
export function createElementGroup(
  nI: { x: number; y: number; z: number },
  nJ: { x: number; y: number; z: number },
  opts: CreateElementOpts,
): THREE.Group {
  const group = new THREE.Group();
  group.userData = { type: 'element', id: opts.elementId };

  const dx = nJ.x - nI.x;
  const dy = nJ.y - nI.y;
  const dz = nJ.z - nI.z;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (length < 1e-10) return group;

  // Midpoint
  const mx = (nI.x + nJ.x) / 2;
  const my = (nI.y + nJ.y) / 2;
  const mz = (nI.z + nJ.z) / 2;

  let baseColor = opts.elementType === 'frame' ? COLORS.frame : COLORS.truss;
  if (opts.selected) baseColor = COLORS.elementSelected;
  else if (opts.hovered) baseColor = COLORS.elementHovered;

  const mode = opts.renderMode ?? 'solid';

  // In wireframe mode, brighten the base colors to distinguish from the grid
  if (mode === 'wireframe' && !opts.selected && !opts.hovered) {
    baseColor = opts.elementType === 'frame' ? COLORS.frameWire : COLORS.truss;
  }

  if (mode === 'wireframe') {
    // Wireframe visual: rendered by the shared ElementsBatched LineSegments2
    // — one draw call for every element (frames AND trusses). This group only
    // carries the picking helper (added below) and hinges.
  } else {
    // 'solid' / 'sections' — for BOTH frame and truss. In sections mode draw the
    // real extruded profile when the assigned section has enough geometry;
    // otherwise fall back to a cylinder (more visible than a naked line). This
    // is purely visual — element type still drives the solver (truss = axial).
    // A list, because a built-up member is several profiles at a spacing. See
    // `createSectionShapes`.
    const sectionShapes = (mode === 'sections' && opts.section) ? createSectionShapes(opts.section) : [];
    if (sectionShapes.length > 0) {
      // With local axes, rollAngle is already baked into ey/ez → only the section's
      // own rotation rolls further; without, fall back to combined roll about global Z.
      const secRot = opts.localAxes
        ? (opts.sectionRotation ?? 0)
        : (opts.elementRollAngle ?? 0) + (opts.sectionRotation ?? 0);
      addExtrudedSection(group, sectionShapes, nI, dx, dy, dz, length, baseColor, secRot, opts.localAxes);
    } else {
      addCylinder(group, nI, nJ, mx, my, mz, length, baseColor);
    }
  }

  // Picking: a single BVH-accelerated InstancedMesh (ElementsPicking) now
  // serves raycasts for all elements, so no per-group picking helper needed.

  // Hinges: small wireframe circles at the ends — drawn when ANY of the three
  // per-axis release flags (my/mz/t) is set, so a My-only or torsion-only
  // release is visible too, not just the classic strong-axis (mz) hinge.
  // Axis-specific glyph styling is later polish; the honesty fix here is
  // "a released end is visible at all".
  if (opts.releaseI && (opts.releaseI.my || opts.releaseI.mz || opts.releaseI.t)) {
    group.add(createHingeMarker(nI.x, nI.y, nI.z));
  }
  if (opts.releaseJ && (opts.releaseJ.my || opts.releaseJ.mz || opts.releaseJ.t)) {
    group.add(createHingeMarker(nJ.x, nJ.y, nJ.z));
  }

  // Elements render above grid (renderOrder 0) and axes (renderOrder 1)
  group.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh || (obj as THREE.Line).isLine) {
      obj.renderOrder = 2;
    }
  });

  return group;
}

/** Add a cylinder mesh to represent a frame element */
/**
 * Add an extruded section-profile mesh (with edge outline) spanning nI→J,
 * oriented along the member axis and rolled by `secRot` degrees. Shared by
 * frame and truss elements in 'sections' render mode.
 */
function addExtrudedSection(
  group: THREE.Group,
  /** One outline for a rolled profile; several for a built-up assembly. */
  sectionShapes: THREE.Shape[],
  nI: { x: number; y: number; z: number },
  dx: number, dy: number, dz: number,
  length: number,
  baseColor: number,
  secRot: number,
  localAxes?: { ex: [number, number, number]; ey: [number, number, number]; ez: [number, number, number] },
): void {
  // `ExtrudeGeometry` takes an array, so the parts of a built-up section become one mesh —
  // one draw call and one material, which matters on a 600-member shed.
  const geo = new THREE.ExtrudeGeometry(sectionShapes, { depth: length, bevelEnabled: false, steps: 1 });
  // More metallic steel look; renders better under the existing scene lights.
  const mat = new THREE.MeshStandardMaterial({
    color: baseColor,
    roughness: 0.38,
    metalness: 0.4,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);

  // Crisp profile edges: a subtle constant-dark outline so the section shape
  // reads clearly. Tagged sectionEdge so selection recolor skips it.
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo, 15),
    new THREE.LineBasicMaterial({ color: 0x12202e, transparent: true, opacity: 0.55 }),
  );
  edges.userData.sectionEdge = true;
  edges.raycast = () => {};
  mesh.add(edges); // child → inherits the mesh transform

  mesh.position.set(nI.x, nI.y, nI.z);

  if (localAxes) {
    // Orient the profile by the element's LOCAL frame so the section sits the
    // way the solver sees it (e.g. an I-beam web stays vertical on a horizontal
    // member instead of flipping sideways). ExtrudeGeometry extrudes the XY
    // shape along +Z, so map: shape-X → ey, shape-Y → ez, extrude +Z → ex.
    // (Consumes computeLocalAxes3D; does not change the convention.)
    const ex = new THREE.Vector3(localAxes.ex[0], localAxes.ex[1], localAxes.ex[2]);
    const ey = new THREE.Vector3(localAxes.ey[0], localAxes.ey[1], localAxes.ey[2]);
    const ez = new THREE.Vector3(localAxes.ez[0], localAxes.ez[1], localAxes.ez[2]);
    const basis = new THREE.Matrix4().makeBasis(ey, ez, ex);
    const quat = new THREE.Quaternion().setFromRotationMatrix(basis);
    // Additional section rotation rolls around the member axis ex. (Element
    // rollAngle is already baked into ey/ez by computeLocalAxes3D.)
    if (Math.abs(secRot) > 1e-10) {
      quat.premultiply(new THREE.Quaternion().setFromAxisAngle(ex, secRot * Math.PI / 180));
    }
    mesh.quaternion.copy(quat);
  } else {
    // Fallback (no local axes supplied): minimal +Z→dir orientation + global-Z roll.
    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(GLOBAL_Z, dir);
    if (Math.abs(secRot) > 1e-10) {
      quat.multiply(new THREE.Quaternion().setFromAxisAngle(GLOBAL_Z, secRot * Math.PI / 180));
    }
    mesh.quaternion.copy(quat);
  }

  group.add(mesh);
}

function addCylinder(
  group: THREE.Group,
  nI: { x: number; y: number; z: number },
  nJ: { x: number; y: number; z: number },
  mx: number, my: number, mz: number,
  length: number,
  color: number,
): void {
  const radius = 0.06;
  const geo = new THREE.CylinderGeometry(radius, radius, length, 8);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.5,
    metalness: 0.15,
  });
  const cyl = new THREE.Mesh(geo, mat);
  cyl.position.set(mx, my, mz);
  orientCylinder(cyl, nI, nJ);
  group.add(cyl);
}

/** Orient a cylinder (Three.js Y-aligned by default) to span from pI to pJ */
function orientCylinder(
  cyl: THREE.Mesh,
  pI: { x: number; y: number; z: number },
  pJ: { x: number; y: number; z: number },
): void {
  const dir = new THREE.Vector3(pJ.x - pI.x, pJ.y - pI.y, pJ.z - pI.z).normalize();
  const quat = new THREE.Quaternion();
  quat.setFromUnitVectors(THREEJS_CYLINDER_AXIS, dir);
  cyl.quaternion.copy(quat);
}

/** Create a small wireframe sphere to indicate a hinge */
function createHingeMarker(x: number, y: number, z: number): THREE.Mesh {
  const geo = new THREE.SphereGeometry(0.08, 8, 6);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    wireframe: true,
    transparent: true,
    opacity: 0.7,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  return mesh;
}
