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
  }

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
    this.mat.visible = drawn;
  }

  /** Whether the markers are currently drawn. Read by the specs. */
  get drawn(): boolean {
    return this.mat.visible;
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
      this.idToIndex.set(lastId, idx);
      this.indexToId[idx] = lastId;
    }
    this.indexToId.length = lastIdx;
    this.idToIndex.delete(id);
    this.baseColorById.delete(id);
    this.count = lastIdx;
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
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
    this.count = 0;
    this.mesh.count = 0;
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
    this.capacity = newCap;
  }
}
