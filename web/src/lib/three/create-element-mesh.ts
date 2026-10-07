// Create Three.js mesh group for a structural element. In solid/sections render
// modes both frames and trusses draw as cylinders / extruded section profiles;
// wireframe is rendered by the shared batched LineSegments2.
import * as THREE from 'three';
import { COLORS } from './selection-helpers';
import { createSectionShapes, canonicalShapes } from './section-profiles';
import { drawingGeometry } from '../section/drawing';
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
  /**
   * A member of variable section: its section at each point (0 at I, 1 at J), and how many pieces
   * the solve cuts it into. Drawn as a loft between its stations (`addVariableSection`).
   */
  sectionAt?: (t: number) => Section;
  variableSegments?: number;
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
    const secRotV = opts.localAxes ? (opts.sectionRotation ?? 0) : (opts.elementRollAngle ?? 0) + (opts.sectionRotation ?? 0);
    if (mode === 'sections' && opts.sectionAt && addVariableSection(group, opts.sectionAt, opts.variableSegments ?? 12, nI, dx, dy, dz, length, baseColor, secRotV, opts.localAxes)) {
      // drawn as a loft
    } else if (sectionShapes.length > 0) {
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

/** The profile mesh's placement and orientation: shape X → local y, shape Y → local z, +Z along the member. */
function orientProfile(
  mesh: THREE.Object3D, nI: { x: number; y: number; z: number }, dx: number, dy: number, dz: number, secRot: number,
  localAxes?: { ex: [number, number, number]; ey: [number, number, number]; ez: [number, number, number] },
): void {
  mesh.position.set(nI.x, nI.y, nI.z);
  if (localAxes) {
    const ex = new THREE.Vector3(...localAxes.ex), ey = new THREE.Vector3(...localAxes.ey), ez = new THREE.Vector3(...localAxes.ez);
    const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(ey, ez, ex));
    if (Math.abs(secRot) > 1e-10) quat.premultiply(new THREE.Quaternion().setFromAxisAngle(ex, secRot * Math.PI / 180));
    mesh.quaternion.copy(quat);
  } else {
    const quat = new THREE.Quaternion().setFromUnitVectors(GLOBAL_Z, new THREE.Vector3(dx, dy, dz).normalize());
    if (Math.abs(secRot) > 1e-10) quat.multiply(new THREE.Quaternion().setFromAxisAngle(GLOBAL_Z, secRot * Math.PI / 180));
    mesh.quaternion.copy(quat);
  }
}

/**
 * A member of variable section, drawn from its sections along it.
 *
 * When every station's outline has the same make-up (as many outlines, each with as many
 * vertices: the blends `section/variable.ts` makes from one family or one drawing), the stations
 * are joined vertex to vertex into one smooth loft with a cap at each end. Otherwise each piece is
 * extruded with its own mid-piece section, the steps the solve itself sees. Returns false when no
 * station has an outline, for the caller's fallback.
 */
function addVariableSection(
  group: THREE.Group, sectionAt: (t: number) => Section, segments: number,
  nI: { x: number; y: number; z: number }, dx: number, dy: number, dz: number, length: number,
  baseColor: number, secRot: number,
  localAxes?: { ex: [number, number, number]; ey: [number, number, number]; ez: [number, number, number] },
): boolean {
  const n = Math.max(2, Math.min(50, Math.round(segments)));
  const geos = Array.from({ length: n + 1 }, (_, k) => {
    const st = sectionAt(k / n).canonical;
    return st?.kind === 'geometry-backed' ? drawingGeometry(st) : null;
  });
  const mat = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.38, metalness: 0.4, side: THREE.DoubleSide });
  const shape = (rings: Array<Array<[number, number]>>) => rings.map((r) => r.length);
  const matches = geos.every((g) => g && JSON.stringify([shape(g.solids), shape(g.holes)]) === JSON.stringify([shape(geos[0]!.solids), shape(geos[0]!.holes)]));
  let geo: THREE.BufferGeometry;
  if (matches && geos[0]) {
    const pos: number[] = [];
    const idx: number[] = [];
    const rings = (g: NonNullable<(typeof geos)[number]>) => [...g.solids, ...g.holes];
    const ringCount = rings(geos[0]!).length;
    // Side walls: each ring, station to station.
    for (let r = 0; r < ringCount; r++) {
      const m = rings(geos[0]!)[r]!.length;
      const base = pos.length / 3;
      for (let k = 0; k <= n; k++) for (const [y, z] of rings(geos[k]!)[r]!) pos.push(y, z, (k / n) * length);
      for (let k = 0; k < n; k++) for (let i = 0; i < m; i++) {
        const a = base + k * m + i, b = base + k * m + ((i + 1) % m), c = a + m, d = b + m;
        idx.push(a, b, d, a, d, c);
      }
    }
    // Caps: each solid with the holes inside it.
    const inside = (pt: [number, number], poly: Array<[number, number]>) => {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [yi, zi] = poly[i]!, [yj, zj] = poly[j]!;
        if ((zi > pt[1]) !== (zj > pt[1]) && pt[0] < ((yj - yi) * (pt[1] - zi)) / (zj - zi) + yi) c = !c;
      }
      return c;
    };
    for (const k of [0, n]) {
      const g = geos[k]!;
      for (const solid of g.solids) {
        const holes = g.holes.filter((h) => h.length && inside(h[0]!, solid));
        const v2 = (r: Array<[number, number]>) => r.map(([y, z]) => new THREE.Vector2(y, z));
        const tris = THREE.ShapeUtils.triangulateShape(v2(solid), holes.map(v2));
        const base = pos.length / 3;
        for (const [y, z] of [...solid, ...holes.flat()]) pos.push(y, z, (k / n) * length);
        for (const t of tris) idx.push(base + t[0]!, base + t[1]!, base + t[2]!);
      }
    }
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
  } else {
    // Steps: one extrusion per piece, its mid-piece section.
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < n; k++) {
      const shapes = canonicalShapes(sectionAt((k + 0.5) / n));
      if (!shapes.length) continue;
      const g = new THREE.ExtrudeGeometry(shapes, { depth: length / n, bevelEnabled: false, steps: 1 });
      g.translate(0, 0, (k / n) * length);
      parts.push(g.index ? g.toNonIndexed() : g);
    }
    if (parts.length === 0) return false;
    const total = parts.reduce((t, g) => t + g.getAttribute('position').count, 0);
    const pos = new Float32Array(total * 3);
    let o = 0;
    for (const g of parts) { pos.set(g.getAttribute('position').array as Float32Array, o); o += g.getAttribute('position').count * 3; g.dispose(); }
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.computeVertexNormals();
  }
  const mesh = new THREE.Mesh(geo, mat);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 15), new THREE.LineBasicMaterial({ color: 0x12202e, transparent: true, opacity: 0.55 }));
  edges.userData.sectionEdge = true;
  edges.raycast = () => {};
  mesh.add(edges);
  orientProfile(mesh, nI, dx, dy, dz, secRot, localAxes);
  mesh.userData.variableSection = true;
  group.add(mesh);
  return true;
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
