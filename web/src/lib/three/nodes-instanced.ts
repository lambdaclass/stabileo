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

let _sharedGeo: THREE.SphereGeometry | null = null;
function getSharedGeo(radius: number): THREE.SphereGeometry {
  if (!_sharedGeo) {
    _sharedGeo = new THREE.SphereGeometry(radius, 16, 12);
  }
  return _sharedGeo;
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
    this._mat4.makeTranslation(x, y, z);
    this.mesh.setMatrixAt(idx, this._mat4);
    this.mesh.instanceMatrix.needsUpdate = true;
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
