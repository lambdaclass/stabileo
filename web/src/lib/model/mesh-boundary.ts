/**
 * The plan outline of a set of shells: the closed loops of their edges that only one shell uses.
 *
 * A slab meshed around columns and openings, or with an L or a notch, is not its convex hull nor
 * its bounding box. Its edge is where the mesh ends: every edge shared by two elements is inside,
 * every edge used once is on the outline or on an opening. Chained node to node, those edges close
 * into loops; the one enclosing the most area is the outline, the others are the openings.
 */
export interface PlanPoint { x: number; y: number }

/** Signed area of a loop (counter-clockwise positive), m². */
export function loopArea(loop: readonly PlanPoint[]): number {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i]!, q = loop[(i + 1) % loop.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * The boundary loops of the faces (each a list of node ids), as points, the outline first and the
 * openings after it by decreasing area. Collinear points along an edge are dropped. Faces whose
 * nodes `at` cannot place are skipped.
 */
export function boundaryLoops(faces: ReadonlyArray<readonly number[]>, at: (node: number) => PlanPoint | undefined): PlanPoint[][] {
  const count = new Map<string, number>();
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  for (const f of faces) {
    if (f.some((n) => !at(n))) continue;
    for (let i = 0; i < f.length; i++) {
      const a = f[i]!, b = f[(i + 1) % f.length]!;
      if (a !== b) count.set(key(a, b), (count.get(key(a, b)) ?? 0) + 1);
    }
  }
  // The boundary edges, undirected: a person's shells need not all wind the same way.
  const adj = new Map<number, number[]>();
  for (const [k, n] of count) {
    if (n !== 1) continue;
    const [a, b] = k.split('-').map(Number) as [number, number];
    adj.set(a, [...(adj.get(a) ?? []), b]);
    adj.set(b, [...(adj.get(b) ?? []), a]);
  }
  const used = new Set<string>();
  const loops: PlanPoint[][] = [];
  for (const [start, outs] of adj) {
    for (const first of outs) {
      if (used.has(key(start, first))) continue;
      const ids = [start];
      let prev = start, cur = first;
      used.add(key(start, first));
      while (cur !== start) {
        ids.push(cur);
        const cand = (adj.get(cur) ?? []).filter((n) => !used.has(key(cur, n)));
        if (!cand.length) break;
        // Where two loops touch at a node, keep turning the same way rather than crossing over.
        const n = cand.length === 1 ? cand[0]! : sharpestLeft(at(prev)!, at(cur)!, cand.map((c) => ({ id: c, p: at(c)! })));
        used.add(key(cur, n));
        prev = cur; cur = n;
      }
      if (cur === start && ids.length >= 3) loops.push(simplify(ids.map((id) => at(id)!)));
    }
  }
  return loops.filter((l) => l.length >= 3).sort((p, q) => Math.abs(loopArea(q)) - Math.abs(loopArea(p)));
}

/** Of the edges leaving `b`, the one that turns most to the left coming from `a`. */
function sharpestLeft(a: PlanPoint, b: PlanPoint, cands: Array<{ id: number; p: PlanPoint }>): number {
  const inAng = Math.atan2(b.y - a.y, b.x - a.x);
  let best = cands[0]!.id, bestTurn = -Infinity;
  for (const c of cands) {
    let t = Math.atan2(c.p.y - b.y, c.p.x - b.x) - inAng;
    while (t <= -Math.PI) t += 2 * Math.PI;
    while (t > Math.PI) t -= 2 * Math.PI;
    if (t > bestTurn) { bestTurn = t; best = c.id; }
  }
  return best;
}

/** Drop the points that sit on a straight run between their neighbours. */
function simplify(loop: PlanPoint[]): PlanPoint[] {
  const out = loop.filter((p, i) => {
    const a = loop[(i + loop.length - 1) % loop.length]!, b = loop[(i + 1) % loop.length]!;
    const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return Math.abs(cross) / len > 1e-6;
  });
  return out.length >= 3 ? out : loop;
}
