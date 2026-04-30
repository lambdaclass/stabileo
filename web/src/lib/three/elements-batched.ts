// Batched element rendering for wireframe mode — one LineSegments2 for all
// elements regardless of count. Replaces the per-element Line2 design that
// produced one draw call per element (2476 for la-bombonera).
//
// Per-segment color is held in an interleaved color buffer (6 floats per
// segment: RGB_start, RGB_end). setColor/setBaseColor update the segment's
// two vertices so hover/selection still reflect on the batched mesh.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { fatLineResolution } from './create-element-mesh';
import { COLORS } from './selection-helpers';

const DEFAULT_INITIAL_CAPACITY = 128;

export interface ElementsBatchedOpts {
  initialCapacity?: number;
  linewidth?: number;
}

export class ElementsBatched {
  public mesh: LineSegments2;

  private geo: LineSegmentsGeometry;
  private mat: LineMaterial;

  private capacity: number;
  public count: number = 0;

  private positions: Float32Array;     // 6 floats per segment
  private colors: Float32Array;         // 6 floats per segment (RGB per vertex)

  private idToIndex = new Map<number, number>();
  private indexToId: number[] = [];
  private baseColorById = new Map<number, number>();

  private _colorTmp = new THREE.Color();
  private dirty: boolean = false;
  private colorDirty: boolean = false;

  constructor(opts: ElementsBatchedOpts = {}) {
    this.capacity = Math.max(1, opts.initialCapacity ?? DEFAULT_INITIAL_CAPACITY);
    this.positions = new Float32Array(this.capacity * 6);
    this.colors = new Float32Array(this.capacity * 6);

    this.geo = new LineSegmentsGeometry();
    this.mat = new LineMaterial({
      color: 0xffffff,
      linewidth: opts.linewidth ?? 3,
      worldUnits: false,
      resolution: fatLineResolution,
      vertexColors: true,
    });

    this.mesh = new LineSegments2(this.geo, this.mat);
    this.mesh.raycast = () => {};
    this.mesh.userData = { type: 'elementBatch', indexToId: this.indexToId };
  }

  upsert(
    id: number,
    xI: number, yI: number, zI: number,
    xJ: number, yJ: number, zJ: number,
  ): void {
    let idx = this.idToIndex.get(id);
    if (idx === undefined) {
      if (this.count >= this.capacity) this.grow();
      idx = this.count;
      this.count++;
      this.idToIndex.set(id, idx);
      this.indexToId[idx] = id;
      if (!this.baseColorById.has(id)) {
        this.baseColorById.set(id, COLORS.frame);
        this.writeColor(idx, COLORS.frame);
      }
    }
    const off = idx * 6;
    this.positions[off] = xI;
    this.positions[off + 1] = yI;
    this.positions[off + 2] = zI;
    this.positions[off + 3] = xJ;
    this.positions[off + 4] = yJ;
    this.positions[off + 5] = zJ;
    this.dirty = true;
  }

  remove(id: number): void {
    const idx = this.idToIndex.get(id);
    if (idx === undefined) return;
    const lastIdx = this.count - 1;
    if (idx !== lastIdx) {
      const offIdx = idx * 6;
      const offLast = lastIdx * 6;
      for (let i = 0; i < 6; i++) {
        this.positions[offIdx + i] = this.positions[offLast + i];
        this.colors[offIdx + i] = this.colors[offLast + i];
      }
      const lastId = this.indexToId[lastIdx];
      this.idToIndex.set(lastId, idx);
      this.indexToId[idx] = lastId;
    }
    this.indexToId.length = lastIdx;
    this.idToIndex.delete(id);
    this.baseColorById.delete(id);
    this.count = lastIdx;
    this.dirty = true;
    this.colorDirty = true;
  }

  has(id: number): boolean {
    return this.idToIndex.has(id);
  }

  indexOf(id: number): number | null {
    const idx = this.idToIndex.get(id);
    return idx === undefined ? null : idx;
  }

  elementIdAt(segmentIndex: number): number | null {
    if (segmentIndex < 0 || segmentIndex >= this.count) return null;
    const id = this.indexToId[segmentIndex];
    return id === undefined ? null : id;
  }

  setColor(id: number, color: number): void {
    const idx = this.idToIndex.get(id);
    if (idx === undefined) return;
    this.writeColor(idx, color);
    this.colorDirty = true;
  }

  setBaseColor(id: number, color: number): void {
    this.baseColorById.set(id, color);
    this.setColor(id, color);
  }

  getBaseColor(id: number): number {
    return this.baseColorById.get(id) ?? COLORS.frame;
  }

  restoreColor(id: number): void {
    this.setColor(id, this.getBaseColor(id));
  }

  clear(): void {
    this.idToIndex.clear();
    this.indexToId.length = 0;
    this.baseColorById.clear();
    this.count = 0;
    this.dirty = true;
    this.colorDirty = true;
  }

  /** Push all dirty buffers to the GPU. Call once per frame/sync after upserts. */
  flush(): void {
    if (!this.dirty && !this.colorDirty) return;
    const segmentCount = this.count;
    if (segmentCount === 0) {
      // LineSegmentsGeometry with zero segments — use empty arrays to clear.
      this.geo.setPositions(new Float32Array(0));
      this.geo.setColors(new Float32Array(0));
    } else {
      this.geo.setPositions(this.positions.subarray(0, segmentCount * 6));
      this.geo.setColors(this.colors.subarray(0, segmentCount * 6));
    }
    this.mesh.computeLineDistances();
    this.dirty = false;
    this.colorDirty = false;
  }

  dispose(): void {
    this.clear();
    this.geo.dispose();
    this.mat.dispose();
  }

  private writeColor(idx: number, color: number): void {
    this._colorTmp.setHex(color);
    const r = this._colorTmp.r;
    const g = this._colorTmp.g;
    const b = this._colorTmp.b;
    const off = idx * 6;
    this.colors[off] = r;
    this.colors[off + 1] = g;
    this.colors[off + 2] = b;
    this.colors[off + 3] = r;
    this.colors[off + 4] = g;
    this.colors[off + 5] = b;
  }

  private grow(): void {
    const newCap = this.capacity * 2;
    const newPos = new Float32Array(newCap * 6);
    const newCol = new Float32Array(newCap * 6);
    newPos.set(this.positions.subarray(0, this.count * 6));
    newCol.set(this.colors.subarray(0, this.count * 6));
    this.positions = newPos;
    this.colors = newCol;
    this.capacity = newCap;
  }
}
