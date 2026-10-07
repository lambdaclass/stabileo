// Batched node rendering via a single THREE.InstancedMesh.
//
// Replaces the per-node Mesh design with one InstancedMesh + per-instance
// color/matrix. Target: 1 draw call for all nodes regardless of model size.
//
// Picking: the InstancedMesh raycasts natively and returns an instanceId on
// each Intersection. Callers resolve it to a node id via nodeIdAt() or via
// findUserData on hit.object, which still returns { type: 'nodeBatch' }.
import * as THREE from 'three';
import { COLORS } from './selection-helpers';

const DEFAULT_RADIUS = 0.07;
const DEFAULT_INITIAL_CAPACITY = 64;

/**
 * Sphere geometry, cached PER RADIUS.
 *
 * The cache used to hold one geometry and ignore the argument, so the first radius ever asked
 * for won for the rest of the session. Nothing noticed while the radius was a constant; it
 * becomes a silent wrong answer the moment it depends on the model, which is what
 * `setRadius` below now does.
 */
const _geoByRadius = new Map<number, THREE.SphereGeometry>();
function getSharedGeo(radius: number): THREE.SphereGeometry {
  const key = Math.round(radius * 1e4) / 1e4;
  let geo = _geoByRadius.get(key);
  if (!geo) {
    geo = new THREE.SphereGeometry(key, 16, 12);
    _geoByRadius.set(key, geo);
  }
  return geo;
}

/**
 * How the markers are drawn.
 *
 * `mesh` is the instanced sphere, sized in metres (PRO). `points` and `spheres` draw a marker of
 * a fixed size on SCREEN (Basic): a dot of a few pixels, or a small shaded ball. A sphere sized
 * in metres has to be kept clickable with a pixel floor measured at the orbit target, and a node
 * much nearer the camera than that target then grew into a ball covering the members. A marker
 * sized in pixels cannot grow. In both screen styles the sphere mesh stays in the scene, not
 * drawn, as the raycast target.
 */
export type NodeMarkerStyle = 'mesh' | 'points' | 'spheres';

/** Diameters in CSS pixels: ordinary, and selected or hovered. */
const MARKER_PX: Record<'points' | 'spheres', [number, number]> = { points: [3, 7], spheres: [8, 11] };

const POINTS_VERTEX = `
attribute vec3 aColor;
attribute float aSize;
uniform float uPixelRatio;
varying vec3 vColor;
void main() {
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // A hair towards the camera, so a marker is not buried in the member lines that meet at it.
  gl_Position.z -= 0.0008 * gl_Position.w;
  gl_PointSize = aSize * uPixelRatio;
}`;

const POINTS_FRAGMENT = `
uniform float uSphere;
varying vec3 vColor;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  vec3 c = vColor;
  if (uSphere > 0.5) {
    vec3 n = vec3(p.x, -p.y, sqrt(1.0 - r2));
    float d = max(dot(n, normalize(vec3(-0.4, 0.5, 0.8))), 0.0);
    c = vColor * (0.45 + 0.6 * d) + vec3(0.22) * pow(d, 24.0);
  }
  gl_FragColor = vec4(c, 1.0);
}`;

export interface NodesInstancedOpts {
  radius?: number;
  initialCapacity?: number;
}

export class NodesInstanced {
  public mesh: THREE.InstancedMesh;

  private radius: number;
  private capacity: number;
  /** Number of live instances (mesh.count mirrors this). */
  public count: number = 0;

  private geo: THREE.SphereGeometry;
  private mat: THREE.MeshStandardMaterial;

  private idToIndex = new Map<number, number>();
  private indexToId: number[] = [];
  /** Last-set base color per id (used to restore after hover). */
  private baseColorById = new Map<number, number>();

  private _mat4 = new THREE.Matrix4();
  private _color = new THREE.Color();

  /** The screen-sized markers (see `NodeMarkerStyle`); not raycast, the mesh is. */
  public points: THREE.Points;
  private pointsMat: THREE.ShaderMaterial;
  private style: NodeMarkerStyle = 'mesh';
  private drawnFlag = true;

  /**
   * The one node whose marker is collapsed, or null.
   *
   * See `suppress` — this is the joint being inspected, whose marker would otherwise sit exactly
   * on top of the plate and bolts it belongs to.
   */
  private suppressedId: number | null = null;
  /** Last known position per id, so a suppression can be undone without a model round-trip. */
  private posById = new Map<number, [number, number, number]>();

  constructor(opts: NodesInstancedOpts = {}) {
    this.radius = opts.radius ?? DEFAULT_RADIUS;
    this.capacity = Math.max(1, opts.initialCapacity ?? DEFAULT_INITIAL_CAPACITY);
    this.geo = getSharedGeo(this.radius);
    this.mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.4,
      metalness: 0.1,
    });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, this.capacity);
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.userData = { type: 'nodeBatch', indexToId: this.indexToId };

    this.pointsMat = new THREE.ShaderMaterial({
      uniforms: { uPixelRatio: { value: 1 }, uSphere: { value: 0 } },
      vertexShader: POINTS_VERTEX,
      fragmentShader: POINTS_FRAGMENT,
    });
    this.points = new THREE.Points(this.pointsGeometry(this.capacity), this.pointsMat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    this.points.visible = false;
    // The sphere mesh is the pick target; a hit here would carry no node id.
    this.points.raycast = () => {};
  }

  private pointsGeometry(capacity: number): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, this.count);
    return g;
  }

  /** How the markers are drawn; see `NodeMarkerStyle`. */
  setStyle(style: NodeMarkerStyle): void {
    if (style === this.style) return;
    this.style = style;
    if (style !== 'mesh') this.pointsMat.uniforms.uSphere!.value = style === 'spheres' ? 1 : 0;
    for (let i = 0; i < this.count; i++) this.writePointSize(i);
    this.applyVisibility();
  }

  get markerStyle(): NodeMarkerStyle {
    return this.style;
  }

  /** Device pixels per CSS pixel, so a marker is the same size on a retina screen. */
  setPixelRatio(ratio: number): void {
    this.pointsMat.uniforms.uPixelRatio!.value = ratio;
  }

  private applyVisibility(): void {
    const screen = this.style !== 'mesh';
    this.mat.visible = this.drawnFlag && !screen;
    this.points.visible = this.drawnFlag && screen;
  }

  private writePointSize(idx: number): void {
    if (this.style === 'mesh') return;
    const id = this.indexToId[idx];
    const size = this.size(id);
    (this.points.geometry.getAttribute('aSize') as THREE.BufferAttribute).setX(idx, size);
    this.points.geometry.getAttribute('aSize').needsUpdate = true;
  }

  private size(id: number | undefined): number {
    if (this.style === 'mesh' || id === undefined || id === this.suppressedId) return 0;
    const [base, marked] = MARKER_PX[this.style];
    return (this.shownColor.get(id) ?? COLORS.node) === COLORS.node ? base : marked;
  }

  /** The colour each marker currently shows, so a marked one (selected, hovered) is drawn larger. */
  private shownColor = new Map<number, number>();

  /**
   * Resize the markers.
   *
   * A no-op when the radius is unchanged, because rebuilding the mesh throws away every instance
   * matrix and the caller would have to re-`upsert` the whole model. The geometry is shared and
   * cached, so switching between two sizes — the ordinary view and the section view — costs
   * nothing after the first time.
   *
   * The instance matrices are preserved: the mesh keeps its own `instanceMatrix`, and only the
   * geometry each instance is drawn with changes.
   */
  setRadius(radius: number): void {
    const key = Math.round(radius * 1e4) / 1e4;
    if (key === Math.round(this.radius * 1e4) / 1e4) return;
    this.radius = key;
    this.geo = getSharedGeo(key);
    this.mesh.geometry = this.geo;
    this.invalidateBounds();
  }

  /**
   * Throw away the cached bounds, so the next raycast recomputes them.
   *
   * ── The bug this exists to prevent ─────────────────────────────────
   *
   * `InstancedMesh.raycast` tests the mesh's bounding sphere before it tests
   * anything else, and computes that sphere ONCE — on first use, from
   * whatever instances existed then. Nothing in three invalidates it when
   * instances are added, moved or resized.
   *
   * So on a model built up node by node, the sphere was computed while the
   * mesh was empty or tiny and every later click was rejected before a single
   * instance was tested. Clicking a node — the gesture the entire modelling
   * flow is built on — silently stopped working as the model grew, while a
   * model LOADED from a file was fine because its mesh was populated before
   * anything raycast it. That is as confusing a bug as this codebase has had:
   * the same click works or does not depending on how the model got there.
   */
  private invalidateBounds(): void {
    this.mesh.boundingSphere = null;
    this.mesh.boundingBox = null;
  }

  /** The radius currently drawn, metres. */
  get currentRadius(): number {
    return this.radius;
  }

  /**
   * Whether the markers are DRAWN. They stay pickable either way.
   *
   * ── Why a visibility flag and not a smaller sphere ──────────────────
   *
   * «Modelo con secciones» exists to show the extruded profiles and, now, the plate and bolts of
   * a designed joint. A marker at every panel point sits exactly on top of that geometry: on the
   * shed it is a sphere at each of 300 nodes, and the joint being inspected is 190 mm wide
   * underneath one of them.
   *
   * The previous answer was to halve the radius, and its own comment gave the reason it stopped
   * there: «a node that cannot be clicked in one mode and can in another is worse than a small
   * one». That reason is sound and this method is what removes it — `material.visible = false`
   * takes the mesh out of the RENDER list (`WebGLRenderer.projectObject` skips a mesh whose
   * material is invisible) while leaving the object itself in the scene graph, and
   * `InstancedMesh.raycast` never consults the material. So the marker stops being drawn and
   * does not stop being clickable.
   *
   * That is also why the radius goes back to the ordinary one when hidden: with nothing drawn,
   * the radius is a PICK TARGET, and a halved target would make a node harder to hit in the very
   * mode where it is invisible.
   */
  setDrawn(drawn: boolean): void {
    this.drawnFlag = drawn;
    this.applyVisibility();
  }

  /** Whether the markers are currently drawn. Read by the specs. */
  get drawn(): boolean {
    return this.drawnFlag;
  }

  /** Insert or move a node. Allocates an instance slot if new. */
  upsert(id: number, x: number, y: number, z: number): void {
    let idx = this.idToIndex.get(id);
    if (idx === undefined) {
      if (this.count >= this.capacity) this.grow();
      idx = this.count;
      this.count++;
      this.idToIndex.set(id, idx);
      this.indexToId[idx] = id;
      this.mesh.count = this.count;
      this.points.geometry.setDrawRange(0, this.count);
      // Default base color for new nodes
      if (!this.baseColorById.has(id)) {
        this.setBaseColor(id, COLORS.node);
      }
    }
    this.posById.set(id, [x, y, z]);
    this.writeMatrix(idx, id, x, y, z);
  }

  /**
   * Write one instance's matrix, collapsed to nothing when the node is suppressed.
   *
   * A zero scale rather than a removal: the instance keeps its slot, its colour and its id
   * mapping, so undoing the suppression is one matrix write instead of a rebuild.
   */
  private writeMatrix(idx: number, id: number, x: number, y: number, z: number): void {
    if (id === this.suppressedId) {
      this._mat4.makeScale(0, 0, 0);
      this._mat4.setPosition(x, y, z);
    } else {
      this._mat4.makeTranslation(x, y, z);
    }
    this.mesh.setMatrixAt(idx, this._mat4);
    this.mesh.instanceMatrix.needsUpdate = true;
    const pos = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    pos.setXYZ(idx, x, y, z);
    pos.needsUpdate = true;
    this.writePointSize(idx);
    this.invalidateBounds();
  }

  /**
   * Collapse ONE node's marker — the joint being inspected — or `null` to restore.
   *
   * ── Why the selected node in particular ─────────────────────────────
   *
   * The marker for a joint's node sits at the joint's origin, which is the centre of the plate
   * that joint draws. On the shed it is a sphere wider than the 190 mm plate, so «frame the
   * joint» delivered a close-up of a red ball with a plate behind it. The highlight was hiding
   * the thing it was highlighting.
   *
   * The joint keeps its selection cue: its own plate and bolts are drawn, the panel row is
   * marked, and the status bar names the node. What is removed is the one marker that can only
   * ever be in front of it.
   *
   * ── Picking is not lost, and that is a precondition ─────────────────
   *
   * The caller suppresses only while the joint HAS meshes, and those meshes are pickable and
   * select this same node (`jointPickable` in `joint-meshes.ts`). So the target does not
   * disappear, it changes shape from a sphere to the joint itself. With no joint drawn there is
   * nothing to hide behind and nothing is suppressed.
   */
  suppress(id: number | null): void {
    if (id === this.suppressedId) return;
    const previous = this.suppressedId;
    this.suppressedId = id;
    for (const changed of [previous, id]) {
      if (changed === null) continue;
      const idx = this.idToIndex.get(changed);
      const pos = this.posById.get(changed);
      if (idx === undefined || !pos) continue;
      this.writeMatrix(idx, changed, pos[0], pos[1], pos[2]);
    }
  }

  /** The node whose marker is collapsed, or null. Read by the specs. */
  get suppressed(): number | null {
    return this.suppressedId;
  }

  /** Remove a node. Swap-pops the last instance into the removed slot. */
  remove(id: number): void {
    const idx = this.idToIndex.get(id);
    if (idx === undefined) return;
    const lastIdx = this.count - 1;
    if (idx !== lastIdx) {
      const lastId = this.indexToId[lastIdx];
      // Move last instance matrix and color into idx
      this.mesh.getMatrixAt(lastIdx, this._mat4);
      this.mesh.setMatrixAt(idx, this._mat4);
      if (this.mesh.instanceColor) {
        this.mesh.getColorAt(lastIdx, this._color);
        this.mesh.setColorAt(idx, this._color);
      }
      for (const name of ['position', 'aColor', 'aSize']) {
        const attr = this.points.geometry.getAttribute(name) as THREE.BufferAttribute;
        for (let k = 0; k < attr.itemSize; k++) attr.array[idx * attr.itemSize + k] = attr.array[lastIdx * attr.itemSize + k]!;
        attr.needsUpdate = true;
      }
      this.idToIndex.set(lastId, idx);
      this.indexToId[idx] = lastId;
    }
    this.indexToId.length = lastIdx;
    this.idToIndex.delete(id);
    this.baseColorById.delete(id);
    this.shownColor.delete(id);
    this.count = lastIdx;
    this.mesh.count = this.count;
    this.points.geometry.setDrawRange(0, this.count);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.invalidateBounds();
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  has(id: number): boolean {
    return this.idToIndex.has(id);
  }

  indexOf(id: number): number | null {
    const idx = this.idToIndex.get(id);
    return idx === undefined ? null : idx;
  }

  nodeIdAt(instanceId: number): number | null {
    if (instanceId < 0 || instanceId >= this.count) return null;
    const id = this.indexToId[instanceId];
    return id === undefined ? null : id;
  }

  /** Set current displayed color for an id (hover/selection). */
  setColor(id: number, color: number): void {
    const idx = this.idToIndex.get(id);
    if (idx === undefined) return;
    this._color.setHex(color);
    this.mesh.setColorAt(idx, this._color);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    // The hex as written, not linearised: the point shader writes it straight to the screen.
    const c = this.points.geometry.getAttribute('aColor') as THREE.BufferAttribute;
    c.setXYZ(idx, ((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255);
    c.needsUpdate = true;
    this.shownColor.set(id, color);
    this.writePointSize(idx);
  }

  /** Set base color (tracked for restore) AND push it to the instance. */
  setBaseColor(id: number, color: number): void {
    this.baseColorById.set(id, color);
    this.setColor(id, color);
  }

  getBaseColor(id: number): number {
    return this.baseColorById.get(id) ?? COLORS.node;
  }

  /** Restore the displayed color to the tracked base color. */
  restoreColor(id: number): void {
    this.setColor(id, this.getBaseColor(id));
  }

  clear(): void {
    this.idToIndex.clear();
    this.indexToId.length = 0;
    this.baseColorById.clear();
    this.shownColor.clear();
    this.count = 0;
    this.mesh.count = 0;
    this.points.geometry.setDrawRange(0, 0);
    /*
     * Emptying the mesh is a change of extent like any other.
     *
     * This one is harmless on its own — a stale sphere left behind by `clear` is LARGER than
     * the nothing that remains, so a ray passes the sphere test and then finds zero instances,
     * which is the right answer — and the first `upsert` after it invalidates anyway.
     *
     * It is called because the rule is worth more than the exemption. Four mutators invalidate,
     * and this one relying on `upsert` to cover it is a fact about today's call order, not
     * about this class; the next mutator someone writes will copy whichever pattern it finds.
     * The cost is one recompute that the next raycast was going to pay regardless.
     */
    this.invalidateBounds();
  }

  /**
   * The material is this instance's own; the GEOMETRY is shared and is not disposed here.
   *
   * Disposing it would pull the geometry out from under any other `NodesInstanced` holding the
   * same radius — and the cache hands the same object to all of them.
   */
  dispose(): void {
    this.clear();
    this.mat.dispose();
    this.pointsMat.dispose();
    this.points.geometry.dispose();
    // Shared geometry is not disposed — it may be held by a freshly created
    // replacement instance after hot-reload or context re-init.
  }

  private grow(): void {
    const newCap = this.capacity * 2;
    const newMesh = new THREE.InstancedMesh(this.geo, this.mat, newCap);
    newMesh.count = this.count;
    newMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Copy matrices
    for (let i = 0; i < this.count; i++) {
      this.mesh.getMatrixAt(i, this._mat4);
      newMesh.setMatrixAt(i, this._mat4);
    }
    // Copy colors
    if (this.mesh.instanceColor) {
      for (let i = 0; i < this.count; i++) {
        this.mesh.getColorAt(i, this._color);
        newMesh.setColorAt(i, this._color);
      }
    }
    newMesh.userData = { type: 'nodeBatch', indexToId: this.indexToId };
    // Swap into the scene graph if attached
    const parent = this.mesh.parent;
    if (parent) {
      parent.remove(this.mesh);
      parent.add(newMesh);
    }
    this.mesh.dispose();
    this.mesh = newMesh;
    const oldGeo = this.points.geometry;
    const newGeo = this.pointsGeometry(newCap);
    for (const name of ['position', 'aColor', 'aSize']) {
      (newGeo.getAttribute(name).array as Float32Array).set(oldGeo.getAttribute(name).array as Float32Array);
    }
    newGeo.setDrawRange(0, this.count);
    this.points.geometry = newGeo;
    oldGeo.dispose();
    this.capacity = newCap;
  }
}

/** The reader's choice under Settings › Model, Basic 3D. */
export type NodeStylePref = 'points' | 'spheres' | 'auto';

/** Tools whose click lands on a node: while one is armed, `auto` draws balls to aim at. */
const MODELLING_TOOLS = new Set(['node', 'element', 'support', 'load', 'moveNodes']);

/** The marker style to draw for a preference and the armed tool. */
export function resolveNodeStyle(pref: NodeStylePref, tool: string): 'points' | 'spheres' {
  if (pref === 'auto') return MODELLING_TOOLS.has(tool) ? 'spheres' : 'points';
  return pref;
}
