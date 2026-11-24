interface Box { x0: number; y0: number; x1: number; y1: number }

export class BoxGrid {
  private readonly cells = new Map<number, number[]>();
  private readonly x0: number;
  private readonly y0: number;
  private readonly side: number;
  private readonly nx: number;
  private readonly ny: number;
  private readonly seen: Uint32Array;
  private stamp = 0;
  private readonly all: readonly number[];
  private readonly fallback: boolean;

  constructor(boxes: readonly Box[]) {
    this.seen = new Uint32Array(boxes.length);
    this.all = boxes.map((_, i) => i);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of boxes) { x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); }
    const w = Math.max(x1 - x0, 1e-9), h = Math.max(y1 - y0, 1e-9);
    this.side = Math.max(Math.sqrt((w * h) / Math.max(1, boxes.length)) * 2, Math.max(w, h) / 512, 1e-6);
    this.x0 = x0; this.y0 = y0;
    this.nx = boxes.length ? Math.floor(w / this.side) + 1 : 0;
    this.ny = boxes.length ? Math.floor(h / this.side) + 1 : 0;
    this.fallback = boxes.length > 0 && (![x0, y0, x1, y1, this.side].every(Number.isFinite)
      || !boxes.every(b => [b.x0, b.y0, b.x1, b.y1].every(Number.isFinite)));
    if (this.fallback) return;
    boxes.forEach((b, k) => {
      const [i0, j0] = this.cell(b.x0, b.y0), [i1, j1] = this.cell(b.x1, b.y1);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const key = i * this.ny + j;
        const list = this.cells.get(key);
        if (list) list.push(k); else this.cells.set(key, [k]);
      }
    });
  }

  private cell(x: number, y: number): [number, number] {
    return [
      Math.min(this.nx - 1, Math.max(0, Math.floor((x - this.x0) / this.side))),
      Math.min(this.ny - 1, Math.max(0, Math.floor((y - this.y0) / this.side))),
    ];
  }

  candidates(pt: readonly [number, number]): readonly number[] {
    if (this.fallback || !pt.every(Number.isFinite)) return this.all;
    if (this.nx === 0 || pt[0] < this.x0 || pt[1] < this.y0 || pt[0] > this.x0 + this.nx * this.side || pt[1] > this.y0 + this.ny * this.side) return NONE;
    const [i, j] = this.cell(pt[0], pt[1]);
    return this.cells.get(i * this.ny + j) ?? NONE;
  }

  overlapping(box: Box): number[] {
    if (this.fallback || ![box.x0, box.y0, box.x1, box.y1].every(Number.isFinite)) return [...this.all];
    if (this.nx === 0 || box.x1 < this.x0 || box.y1 < this.y0 || box.x0 > this.x0 + this.nx * this.side || box.y0 > this.y0 + this.ny * this.side) return [];
    const [i0, j0] = this.cell(box.x0, box.y0), [i1, j1] = this.cell(box.x1, box.y1);
    if (this.stamp === 0xffffffff) { this.seen.fill(0); this.stamp = 0; }
    this.stamp++;
    const out: number[] = [];
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const list = this.cells.get(i * this.ny + j);
      if (!list) continue;
      for (const k of list) if (this.seen[k] !== this.stamp) { this.seen[k] = this.stamp; out.push(k); }
    }
    return out.sort((a, b) => a - b);
  }
}
const NONE: readonly number[] = [];
