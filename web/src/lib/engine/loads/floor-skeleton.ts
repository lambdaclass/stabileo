/**
 * The straight skeleton of a panel, as the cells each side sweeps: the tributary region of every
 * side of a panel that is not convex or that has openings.
 *
 * Every side moves inward at unit speed, parallel to itself (a roof at 45° over the panel). A
 * point belongs to the side whose front reaches it first; the region a side sweeps is its share
 * of the panel. On a convex panel it is the region nearer to that side than to any other, the
 * 45° pattern of a two-way slab (`floor-loads.ts`). Around a re-entrant corner the regions are
 * bounded by the corner's bisector, straight lines where the nearest-side rule would draw
 * parabolas, so each side still receives a load that is linear between breakpoints.
 *
 * The front is simulated event by event (Felkel and Obdržálek): a side shrinking to nothing (its
 * two ends meet), and a re-entrant corner reaching another side, which splits the front, or joins
 * an opening's front to the outer one. Between events every stretch of front sweeps a trapezoid;
 * those are the cells returned, per side.
 *
 * Loops: the outer one counter-clockwise, openings clockwise, so the panel lies left of every
 * side. Pure.
 */

export type P2 = [number, number];

interface Edge { a: P2; n: P2; u: P2; c: number }
interface V { x: P2; w: P2; eL: number; eR: number; prev: number; next: number; alive: boolean }

const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const cross = (a: P2, b: P2) => a[0] * b[1] - a[1] * b[0];
const at = (v: V, dt: number): P2 => [v.x[0] + dt * v.w[0], v.x[1] + dt * v.w[1]];

function polyArea(p: readonly P2[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]!; s += p[i]![0] * q[1] - q[0] * p[i]![1]; }
  return s / 2;
}

/**
 * The cells each side sweeps, indexed as the sides are given (loop after loop, side k from vertex
 * k to k + 1). Null when the simulation does not close (a degenerate input).
 */
export function skeletonCells(loops: readonly (readonly P2[])[]): P2[][][] | null {
  const edges: Edge[] = [];
  const verts: V[] = [];
  let scale = 0;
  for (const loop of loops) for (const p of loop) scale = Math.max(scale, Math.abs(p[0]), Math.abs(p[1]));
  for (const loop of loops) {
    let span = 0;
    for (let i = 0; i < loop.length; i++) span = Math.max(span, Math.hypot(...sub(loop[(i + 1) % loop.length]!, loop[i]!)));
    scale = Math.max(scale, span);
  }
  const eps = 1e-9 * Math.max(1, scale);
  const cells: P2[][][] = [];

  for (const loop of loops) {
    const base = edges.length, m = loop.length;
    for (let k = 0; k < m; k++) {
      const a = loop[k]!, b = loop[(k + 1) % m]!;
      const L = Math.hypot(...sub(b, a));
      const u: P2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      const n: P2 = [-u[1], u[0]];
      edges.push({ a, n, u, c: dot(n, a) });
      cells.push([]);
    }
    const vbase = verts.length;
    for (let k = 0; k < m; k++) {
      verts.push({ x: loop[k]!, w: [0, 0], eL: base + (k - 1 + m) % m, eR: base + k, prev: vbase + (k - 1 + m) % m, next: vbase + (k + 1) % m, alive: true });
    }
  }
  /** Null for two fronts facing each other: they have met, and the area check ends that loop. */
  const velocity = (eL: number, eR: number): P2 | null => {
    const a = edges[eL]!.n, b = edges[eR]!.n;
    const det = a[0] * b[1] - a[1] * b[0];
    if (Math.abs(det) < 1e-12) return dot(a, b) > 0 ? [a[0], a[1]] : null;
    return [(b[1] - a[1]) / det, (a[0] - b[0]) / det];
  };
  for (const v of verts) v.w = velocity(v.eL, v.eR) ?? [0, 0];

  let T = 0;
  const reflex = (v: V) => cross(edges[v.eL]!.u, edges[v.eR]!.u) < -1e-12;
  const kill = (i: number) => { verts[i]!.alive = false; };

  /** Loops of the alive vertices. */
  const liveLoops = (): number[][] => {
    const seen = new Set<number>(), out: number[][] = [];
    verts.forEach((v, i) => {
      if (!v.alive || seen.has(i)) return;
      const loop: number[] = [];
      let j = i, guard = 0;
      while (!seen.has(j) && guard++ < 100000) { seen.add(j); loop.push(j); j = verts[j]!.next; }
      out.push(loop);
    });
    return out;
  };

  /** Consecutive vertices at one point merge (a side that has shrunk away); dead loops end. */
  const tidy = () => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const loop of liveLoops()) {
        if (loop.length < 3 || Math.abs(polyArea(loop.map((i) => verts[i]!.x))) < eps * eps * 10) {
          for (const i of loop) kill(i);
          changed = true;
          continue;
        }
        // Two fronts facing each other on one line have met: the loop runs out along it and back
        // (a spike). The stretch where they overlap is swept; what is left of the longer one goes on.
        for (const i of loop) {
          const sv = verts[i]!;
          if (!sv.alive || velocity(sv.eL, sv.eR) !== null) continue;
          const pi = sv.prev, ni = sv.next;
          const p = verts[pi]!, n = verts[ni]!;
          if (pi === ni) continue;
          const dp = Math.hypot(...sub(p.x, sv.x)), dn = Math.hypot(...sub(n.x, sv.x));
          const id = verts.length;
          if (Math.abs(dp - dn) <= eps * 10) {
            const w = velocity(p.eL, n.eR);
            verts.push({ x: p.x, w: w ?? [0, 0], eL: p.eL, eR: n.eR, prev: p.prev, next: n.next, alive: true });
            verts[p.prev]!.next = id; verts[n.next]!.prev = id;
            kill(pi); kill(ni);
          } else if (dp < dn) {
            const w = velocity(p.eL, sv.eR);
            verts.push({ x: p.x, w: w ?? [0, 0], eL: p.eL, eR: sv.eR, prev: p.prev, next: ni, alive: true });
            verts[p.prev]!.next = id; n.prev = id;
            kill(pi);
          } else {
            const w = velocity(sv.eL, n.eR);
            verts.push({ x: n.x, w: w ?? [0, 0], eL: sv.eL, eR: n.eR, prev: pi, next: n.next, alive: true });
            p.next = id; verts[n.next]!.prev = id;
            kill(ni);
          }
          kill(i);
          changed = true;
          break;
        }
        if (changed) break;
        for (const i of loop) {
          const v = verts[i]!, n = verts[v.next]!;
          if (!v.alive || !n.alive || v.next === i) continue;
          if (Math.hypot(...sub(v.x, n.x)) > eps * 10) continue;
          const w = velocity(v.eL, n.eR);
          const id = verts.length;
          verts.push({ x: v.x, w: w ?? [0, 0], eL: v.eL, eR: n.eR, prev: v.prev, next: n.next, alive: true });
          verts[v.prev]!.next = id; verts[n.next]!.prev = id;
          kill(i); kill(v.next);
          changed = true;
          break;
        }
        if (changed) break;
      }
    }
  };

  for (let iter = 0; iter < 10000; iter++) {
    tidy();
    const alive = verts.map((v, i) => [v, i] as const).filter(([v]) => v.alive);
    if (alive.length === 0) return cells;

    // The next event: a side's ends meeting, or a re-entrant corner reaching a side.
    let tNext = Infinity;
    const splits: Array<{ t: number; v: number; a: number }> = [];
    for (const [v] of alive) {
      const n = verts[v.next]!;
      const e = edges[v.eR]!;
      const L = dot(e.u, sub(n.x, v.x)), rate = dot(e.u, sub(n.w, v.w));
      if (rate < -1e-12) tNext = Math.min(tNext, T + Math.max(0, -L / rate));
    }
    for (const [v, vi] of alive) {
      if (!reflex(v)) continue;
      for (const [a, ai] of alive) {
        if (ai === vi || a.next === vi) continue;
        const ei = a.eR;
        if (ei === v.eL || ei === v.eR) continue;
        const e = edges[ei]!;
        const d = dot(e.n, v.x) - (e.c + T);
        const rate = 1 - dot(e.n, v.w);
        if (d < -eps || rate <= 1e-12) continue;
        const t = T + Math.max(0, d) / rate;
        const P = at(v, t - T);
        const b = verts[a.next]!;
        const sa = dot(e.u, at(a, t - T)), sb = dot(e.u, at(b, t - T)), sp = dot(e.u, P);
        if (sp < sa - eps * 10 || sp > sb + eps * 10) continue;
        splits.push({ t, v: vi, a: ai });
        tNext = Math.min(tNext, t);
      }
    }
    if (!Number.isFinite(tNext)) return null;

    // Sweep to it: each stretch of front a trapezoid.
    const dt = tNext - T;
    for (const [v] of alive) {
      const n = verts[v.next]!;
      const cell: P2[] = [v.x, n.x, at(n, dt), at(v, dt)];
      if (Math.abs(polyArea(cell)) > eps * eps) cells[v.eR]!.push(cell);
    }
    for (const [v] of alive) v.x = at(v, dt);
    T = tNext;

    // The splits due now, one at a time, each checked against the front as it stands.
    const tol = eps * 100 + 1e-9 * T;
    for (const s of splits.filter((x) => x.t <= T + tol).sort((p, q) => p.t - q.t)) {
      const v = verts[s.v]!, a = verts[s.a]!;
      if (!v.alive || !a.alive) continue;
      const b = verts[a.next]!;
      const e = edges[a.eR]!;
      if (Math.abs(dot(e.n, v.x) - (e.c + T)) > tol * 10) continue;
      const sp = dot(e.u, v.x);
      if (sp < dot(e.u, a.x) - tol * 10 || sp > dot(e.u, b.x) + tol * 10) continue;
      if (a.next === s.v || verts[s.v]!.next === s.a) continue;
      const w1 = velocity(v.eL, a.eR), w2 = velocity(a.eR, v.eR);
      const i1 = verts.length, i2 = i1 + 1, bi = a.next, vprev = v.prev, vnext = v.next;
      verts.push({ x: v.x, w: w1 ?? [0, 0], eL: v.eL, eR: a.eR, prev: vprev, next: bi, alive: true });
      verts.push({ x: v.x, w: w2 ?? [0, 0], eL: a.eR, eR: v.eR, prev: s.a, next: vnext, alive: true });
      verts[vprev]!.next = i1; verts[bi]!.prev = i1;
      a.next = i2; verts[vnext]!.prev = i2;
      kill(s.v);
    }
  }
  return null;
}
