import type { BarPath } from '../../codes/cirsoc201/bar-geometry';

interface IndexedBar {
  id: string;
  diameterMm: number;
  x: number;
  y: number;
  minZ: number;
  maxZ: number;
  memberOrder: number;
  barOrder: number;
}

/**
 * Column cage queries use a bar's first point in plan and all segment endpoints in Z.
 * Cache those bounds once, and visit only nearby plan cells. Keep member/bar order so
 * equal-position ties are resolved exactly as by the original member-map scan.
 * Rebuild after replacing geometry; append joint ties as they are generated.
 */
export class ColumnBarIndex {
  private readonly cell = 1.5;
  private readonly buckets = new Map<string, IndexedBar[]>();
  private readonly members = new Map<number, { order: number; nextBar: number }>();
  private readonly all: IndexedBar[] = [];
  private readonly unbucketed: IndexedBar[] = [];

  constructor(members: Iterable<{ elementId: number; bars: readonly BarPath[] }>) {
    for (const member of members) this.append(member.elementId, member.bars);
  }

  append(memberId: number, bars: readonly BarPath[]): void {
    let member = this.members.get(memberId);
    if (!member) {
      member = { order: this.members.size, nextBar: 0 };
      this.members.set(memberId, member);
    }
    for (const bar of bars) {
      const barOrder = member.nextBar++;
      const p = bar.segments[0]?.start;
      if (!p) continue;
      let minZ = Infinity, maxZ = -Infinity;
      for (const segment of bar.segments) {
        minZ = Math.min(minZ, segment.start.z, segment.end.z);
        maxZ = Math.max(maxZ, segment.start.z, segment.end.z);
      }
      const entry: IndexedBar = {
        id: bar.id, diameterMm: bar.diameterMm, x: p.x, y: p.y, minZ, maxZ,
        memberOrder: member.order, barOrder,
      };
      this.all.push(entry);
      const cx = Math.floor(p.x / this.cell), cy = Math.floor(p.y / this.cell);
      if (!Number.isSafeInteger(cx) || !Number.isSafeInteger(cy)) {
        this.unbucketed.push(entry);
        continue;
      }
      const key = `${cx}:${cy}`;
      const bucket = this.buckets.get(key);
      if (bucket) bucket.push(entry); else this.buckets.set(key, [entry]);
    }
  }

  query(centre: { x: number; y: number }, level: number, radius: number): readonly IndexedBar[] {
    // Include adjacent cells: subtraction can round a point just beyond a cell
    // boundary onto the exact radius in the final Math.hypot test.
    const x0 = Math.floor((centre.x - radius) / this.cell) - 1;
    const x1 = Math.floor((centre.x + radius) / this.cell) + 1;
    const y0 = Math.floor((centre.y - radius) / this.cell) - 1;
    const y1 = Math.floor((centre.y + radius) / this.cell) + 1;
    let candidates: IndexedBar[];
    // Invalid or exceptionally large geometry must not create an unbounded cell walk.
    if (![x0, x1, y0, y1].every(Number.isSafeInteger) || (x1 - x0 + 1) * (y1 - y0 + 1) > 100) {
      candidates = this.all;
    } else {
      candidates = [...this.unbucketed];
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const bucket = this.buckets.get(`${x}:${y}`);
        if (bucket) for (const bar of bucket) candidates.push(bar);
      }
    }
    return candidates.filter((b) =>
      !(b.minZ > level + 0.02 || b.maxZ < level - 0.02 || Math.hypot(b.x - centre.x, b.y - centre.y) > radius),
    ).sort((a, b) => a.memberOrder - b.memberOrder || a.barOrder - b.barOrder);
  }
}
