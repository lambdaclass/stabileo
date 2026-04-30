// Batched picking surface for elements — one InstancedMesh of invisible
// cylinders (one per element). BVH-accelerated via three-mesh-bvh, so hover
// raycasts resolve in O(log N) instead of O(N) per-mesh traversal.
//
// This replaces the per-element invisible cylinder picking helpers that
// Viewport3D previously relied on. Rendering stays zero-cost (not visible),
// but raycast picks return hit.instanceId → element id via indexToId.
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { THREEJS_CYLINDER_AXIS } from '../geometry/coordinate-system';

// Install BVH-accelerated raycast on THREE.Mesh. Safe to call repeatedly.
(THREE.BufferGeometry.prototype as unknown as { computeBoundsTree: typeof computeBoundsTree }).computeBoundsTree = computeBoundsTree;
(THREE.BufferGeometry.prototype as unknown as { disposeBoundsTree: typeof disposeBoundsTree }).disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const DEFAULT_RADIUS = 0.15;
const DEFAULT_INITIAL_CAPACITY = 128;

export interface ElementsPickingOpts {
  radius?: number;
  initialCapacity?: number;
}

export interface Point3 { x: number; y: number; z: number; }

let _sharedGeo: THREE.CylinderGeometry | null = null;
function getSharedGeo(radius: number): THREE.CylinderGeometry {
  if (!_sharedGeo) {
    // Unit-height cylinder; per-instance matrix scales Y by element length.
    _sharedGeo = new THREE.CylinderGeometry(radius, radius, 1, 6);
    // Build BVH once at creation — static topology, so the tree never needs
    // to be rebuilt.
    (_sharedGeo as THREE.BufferGeometry & { computeBoundsTree?: () => void }).computeBoundsTree?.();
  }
  return _sharedGeo;
}

export class ElementsPicking {
  public mesh: THREE.InstancedMesh;

  private radius: number;
  private capacity: number;
  public count: number = 0;

  private geo: THREE.CylinderGeometry;
  private mat: THREE.MeshBasicMaterial;

  private idToIndex = new Map<number, number>();
  private indexToId: number[] = [];

  private _mat4 = new THREE.Matrix4();
  private _pos = new THREE.Vector3();
  private _scale = new THREE.Vector3();
  private _quat = new THREE.Quaternion();
  private _dir = new THREE.Vector3();

  constructor(opts: ElementsPickingOpts = {}) {
    this.radius = opts.radius ?? DEFAULT_RADIUS;
    this.capacity = Math.max(1, opts.initialCapacity ?? DEFAULT_INITIAL_CAPACITY);
    this.geo = getSharedGeo(this.radius);
    this.mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, this.capacity);
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.visible = false; // Raycaster ignores `visible` by default.
    this.mesh.userData = { type: 'elementPick', indexToId: this.indexToId };
  }

  upsert(id: number, pI: Point3, pJ: Point3): void {
    let idx = this.idToIndex.get(id);
    if (idx === undefined) {
      if (this.count >= this.capacity) this.grow();
      idx = this.count;
      this.count++;
      this.idToIndex.set(id, idx);
      this.indexToId[idx] = id;
      this.mesh.count = this.count;
    }
    this.computeMatrix(pI, pJ, this._mat4);
    this.mesh.setMatrixAt(idx, this._mat4);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  remove(id: number): void {
    const idx = this.idToIndex.get(id);
    if (idx === undefined) return;
    const lastIdx = this.count - 1;
    if (idx !== lastIdx) {
      this.mesh.getMatrixAt(lastIdx, this._mat4);
      this.mesh.setMatrixAt(idx, this._mat4);
      const lastId = this.indexToId[lastIdx];
      this.idToIndex.set(lastId, idx);
      this.indexToId[idx] = lastId;
    }
    this.indexToId.length = lastIdx;
    this.idToIndex.delete(id);
    this.count = lastIdx;
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  has(id: number): boolean {
    return this.idToIndex.has(id);
  }

  indexOf(id: number): number | null {
    const idx = this.idToIndex.get(id);
    return idx === undefined ? null : idx;
  }

  elementIdAt(instanceId: number): number | null {
    if (instanceId < 0 || instanceId >= this.count) return null;
    const id = this.indexToId[instanceId];
    return id === undefined ? null : id;
  }

  clear(): void {
    this.idToIndex.clear();
    this.indexToId.length = 0;
    this.count = 0;
    this.mesh.count = 0;
  }

  dispose(): void {
    this.clear();
    this.mat.dispose();
  }

  private computeMatrix(pI: Point3, pJ: Point3, out: THREE.Matrix4): void {
    const dx = pJ.x - pI.x;
    const dy = pJ.y - pI.y;
    const dz = pJ.z - pI.z;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // Degenerate element — zero-length scale would collapse the instance.
    // Use a tiny length so the cylinder still sits at the midpoint.
    const safeLen = length < 1e-10 ? 1e-10 : length;
    this._pos.set((pI.x + pJ.x) / 2, (pI.y + pJ.y) / 2, (pI.z + pJ.z) / 2);
    this._dir.set(dx, dy, dz).normalize();
    this._quat.setFromUnitVectors(THREEJS_CYLINDER_AXIS, this._dir);
    this._scale.set(1, safeLen, 1);
    out.compose(this._pos, this._quat, this._scale);
  }

  private grow(): void {
    const newCap = this.capacity * 2;
    const newMesh = new THREE.InstancedMesh(this.geo, this.mat, newCap);
    newMesh.count = this.count;
    newMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < this.count; i++) {
      this.mesh.getMatrixAt(i, this._mat4);
      newMesh.setMatrixAt(i, this._mat4);
    }
    newMesh.visible = false;
    newMesh.userData = { type: 'elementPick', indexToId: this.indexToId };
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
