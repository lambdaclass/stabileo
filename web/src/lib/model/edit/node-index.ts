/** Shared node welding tolerance and spatial lookup. Pure: no store. */
import type { Vec3 } from './affine';

/** The default weld tolerance; the one in force is `weldTolerance()`. */
export const DEFAULT_WELD = 1e-4;

/** A spatial hash for the weld: cells of the weld tolerance, neighbours checked. */
export class NodeIndex {
  private cells = new Map<string, number[]>();
  constructor(private tol: number) {}
  private key(x: number, y: number, z: number) {
    return `${Math.round(x / this.tol)},${Math.round(y / this.tol)},${Math.round(z / this.tol)}`;
  }
  add(id: number, p: Vec3) {
    const k = this.key(p[0], p[1], p[2]);
    (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(id);
  }
  find(p: Vec3, pos: (id: number) => Vec3 | undefined): number | null {
    const [cx, cy, cz] = [Math.round(p[0] / this.tol), Math.round(p[1] / this.tol), Math.round(p[2] / this.tol)];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const id of this.cells.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
        const q = pos(id);
        if (q && Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) <= this.tol) return id;
      }
    }
    return null;
  }
}
