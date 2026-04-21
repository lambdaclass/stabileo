// Create Three.js mesh group for a structural element (frame=cylinder/extruded, truss=line)
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { COLORS } from './selection-helpers';
import { createSectionShape } from './section-profiles';
import { GLOBAL_Z, THREEJS_CYLINDER_AXIS } from '../geometry/coordinate-system';
import type { Section } from '../store/model.svelte';

/** Shared resolution vector for LineMaterial (screen-space line widths). */
export const fatLineResolution = new THREE.Vector2(1, 1);

/** Update the shared resolution — call from Viewport3D on resize. */
export function setLineResolution(w: number, h: number): void {
  fatLineResolution.set(w, h);
}

export interface CreateElementOpts {
  elementId: number;
  elementType: 'frame' | 'truss';
  hingeStart?: boolean;
  hingeEnd?: boolean;
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
    baseColor = opts.elementType === 'frame' ? 0x6cb4ff : 0xf0b848;
  }

  if (mode === 'wireframe') {
    // Wireframe visual: rendered by the shared ElementsBatched LineSegments2
    // — one draw call for every element. This group only carries the picking
    // helper (added below) and hinges.
  } else if (opts.elementType === 'frame') {
    if (mode === 'sections') {
      // Try extruded section profile
      const sectionShape = opts.section ? createSectionShape(opts.section) : null;

      if (sectionShape) {
        // ExtrudeGeometry: extrudes the 2D shape along Z by default.
        // We create it at origin extruded along +Z, then orient I→J.
        const extrudeSettings: THREE.ExtrudeGeometryOptions = {
          depth: length,
          bevelEnabled: false,
          steps: 1,
        };
        const geo = new THREE.ExtrudeGeometry(sectionShape, extrudeSettings);

        const mat = new THREE.MeshStandardMaterial({
          color: baseColor,
          roughness: 0.5,
          metalness: 0.15,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geo, mat);

        // Position at nI
        mesh.position.set(nI.x, nI.y, nI.z);

        // Orient: Three.js ExtrudeGeometry extrudes along +Z by default.
        // We need +Z to point from nI to nJ.
        const dir = new THREE.Vector3(dx, dy, dz).normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(GLOBAL_Z, dir);
        // Apply combined rotation (element β + section θ) around the beam axis
        const secRot = (opts.elementRollAngle ?? 0) + (opts.sectionRotation ?? 0);
        if (Math.abs(secRot) > 1e-10) {
          const rollQuat = new THREE.Quaternion().setFromAxisAngle(GLOBAL_Z, secRot * Math.PI / 180);
          quat.multiply(rollQuat);
        }
        mesh.quaternion.copy(quat);

        group.add(mesh);
      } else {
        // Fallback to cylinder when no section shape available
        addCylinder(group, nI, nJ, mx, my, mz, length, baseColor);
      }
    } else {
      // 'solid' mode — always cylinder for frames
      addCylinder(group, nI, nJ, mx, my, mz, length, baseColor);
    }
  } else {
    // Truss: always fat line (Line2 — real screen-space width)
    const geo = new LineGeometry();
    geo.setPositions([nI.x, nI.y, nI.z, nJ.x, nJ.y, nJ.z]);
    const mat = new LineMaterial({
      color: baseColor,
      linewidth: 3,
      worldUnits: false,
      resolution: fatLineResolution,
    });
    const line = new Line2(geo, mat);
    line.computeLineDistances();
    line.raycast = () => {};
    group.add(line);
  }

  // Invisible picking helper for wireframe/truss lines (Line2 raycast is unreliable)
  if (mode === 'wireframe' || opts.elementType === 'truss') {
    addPickingHelper(group, nI, nJ, mx, my, mz, length);
  }

  // Hinges: small wireframe circles at the ends
  if (opts.hingeStart) {
    group.add(createHingeMarker(nI.x, nI.y, nI.z));
  }
  if (opts.hingeEnd) {
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

/** Add a transparent cylinder for raycast picking (Line2 raycast is unreliable in wireframe mode) */
function addPickingHelper(
  group: THREE.Group,
  nI: { x: number; y: number; z: number },
  nJ: { x: number; y: number; z: number },
  mx: number, my: number, mz: number,
  length: number,
): void {
  const radius = 0.15; // generous picking radius
  const geo = new THREE.CylinderGeometry(radius, radius, length, 6);
  const mat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const cyl = new THREE.Mesh(geo, mat);
  cyl.position.set(mx, my, mz);
  orientCylinder(cyl, nI, nJ);
  cyl.renderOrder = -1; // render behind everything
  cyl.userData.pickingHelper = true;
  // Hide from render pipeline entirely — one less draw call per wireframe/truss
  // element. Raycaster ignores `visible` by default, so picking still works.
  cyl.visible = false;
  group.add(cyl);
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
