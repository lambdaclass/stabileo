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
 * those are the cells returned, per side. Events are taken one at a time, each found anew on the
 * front the last one left, so several at one moment (a rectangle's two short sides; an opening's
 * corner reaching a side just as the side's end does) follow one another zero apart, and what
 * has met along a line or shrunk to nothing is cleared between them.
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
  /** A length, and an area, too small to be anything but rounding. */
  const tolL = 10 * eps, tolA = 1e-12 * Math.max(1, scale) ** 2;
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
  /**
   * The velocity of the corner between two sides' fronts. Null for two fronts facing each other
   * along one line: they have met there (`tidy` takes the spike out).
   */
  const velocity = (eL: number, eR: number): P2 | null => {
    const a = edges[eL]!.n, b = edges[eR]!.n;
    const det = a[0] * b[1] - a[1] * b[0];
    if (Math.abs(det) < 1e-10) return dot(a, b) > 0 ? [a[0], a[1]] : null;
    return [(b[1] - a[1]) / det, (a[0] - b[0]) / det];
  };
  for (const v of verts) v.w = velocity(v.eL, v.eR) ?? [0, 0];

  let T = 0;
  const reflex = (v: V) => cross(edges[v.eL]!.u, edges[v.eR]!.u) < -1e-12;
  const kill = (i: number) => { verts[i]!.alive = false; };
  /** A new corner between `prev` and `next`, from side `eL` to side `eR`, linked in. */
  const join = (x: P2, eL: number, eR: number, prev: number, next: number): number => {
    const id = verts.length;
    verts.push({ x, w: velocity(eL, eR) ?? [0, 0], eL, eR, prev, next, alive: true });
    verts[prev]!.next = id; verts[next]!.prev = id;
    return id;
  };
  /** A side whose front has shrunk to nothing: its two corners become one. */
  const collapse = (i: number) => {
    const v = verts[i]!, ni = v.next, n = verts[ni]!;
    kill(i); kill(ni);
    if (n.next === i) return; // a loop of two: nothing left
    join([(v.x[0] + n.x[0]) / 2, (v.x[1] + n.x[1]) / 2], v.eL, n.eR, v.prev, n.next);
  };
  /** How fast the front of the side from `v` to the next corner grows (negative: shrinks). */
  const growth = (v: V) => dot(edges[v.eR]!.u, sub(verts[v.next]!.w, v.w));

  /** Loops of the live corners. */
  const liveLoops = (): number[][] => {
    const seen = new Set<number>(), out: number[][] = [];
    verts.forEach((v, i) => {
      if (!v.alive || seen.has(i)) return;
      const loop: number[] = [];
      let j = i;
      while (!seen.has(j)) { seen.add(j); loop.push(j); j = verts[j]!.next; }
      out.push(loop);
    });
    return out;
  };

  /**
   * The front made clean before the next event, one change at a time, each on the front as it
   * stands: a loop with no area left ends; a stretch of front with no length and not growing goes
   * (its corners become one); a corner between two stretches of one side goes; and two fronts that
   * have met along a line, out and back (a spike), are swept where they overlap, and what is left
   * of the longer one goes on.
   */
  const tidy = () => {
    for (let guard = 0; guard < 100000; guard++) {
      let changed = false;
      for (const loop of liveLoops()) {
        if (loop.length < 3 || Math.abs(polyArea(loop.map((i) => verts[i]!.x))) <= tolA) {
          for (const i of loop) kill(i);
          changed = true;
          break;
        }
        for (const i of loop) {
          const v = verts[i]!, p = verts[v.prev]!, n = verts[v.next]!;
          if (Math.hypot(...sub(n.x, v.x)) <= tolL && growth(v) <= 1e-9) { collapse(i); changed = true; break; }
          if (v.eL === v.eR) { kill(i); p.next = v.next; n.prev = v.prev; changed = true; break; }
          if (velocity(v.eL, v.eR) !== null) continue;
          const pi = v.prev, ni = v.next;
          const dp = Math.hypot(...sub(p.x, v.x)), dn = Math.hypot(...sub(n.x, v.x));
          kill(i);
          if (Math.abs(dp - dn) <= tolL) { kill(pi); kill(ni); join(p.x, p.eL, n.eR, p.prev, n.next); }
          else if (dp < dn) { kill(pi); join(p.x, p.eL, v.eR, p.prev, ni); }
          else { kill(ni); join(n.x, v.eL, n.eR, pi, n.next); }
          changed = true;
          break;
        }
        if (changed) break;
      }
      if (!changed) return;
    }
  };

  // One event at a time, the earliest, on the front as it stands: a side shrinking to nothing (its
  // two corners meet), or a re-entrant corner reaching a side, which splits the front in two, or
  // joins an opening's front to the outer one. Taken a batch at a time, two events at one moment
  // left a corner linked to corners the other had ended, and the front never closed.
  const limit = 10 * verts.length + 100;
  for (let iter = 0; iter < limit; iter++) {
    tidy();
    const alive: number[] = [];
    verts.forEach((v, i) => { if (v.alive) alive.push(i); });
    if (alive.length === 0) return cells;

    let tNext = Infinity, kind: 'edge' | 'split' = 'edge', ev = -1, onto = -1;
    for (const i of alive) {
      const v = verts[i]!, rate = growth(v);
      if (rate >= -1e-12) continue;
      const t = T + Math.max(0, dot(edges[v.eR]!.u, sub(verts[v.next]!.x, v.x))) / -rate;
      if (t < tNext) { tNext = t; kind = 'edge'; ev = i; }
    }
    for (const vi of alive) {
      const v = verts[vi]!;
      if (!reflex(v)) continue;
      for (const ai of alive) {
        const a = verts[ai]!;
        if (ai === vi || a.next === vi) continue;
        const e = edges[a.eR]!;
        if (a.eR === v.eL || a.eR === v.eR) continue;
        const d = dot(e.n, v.x) - (e.c + T);
        const rate = 1 - dot(e.n, v.w);
        if (d < -tolL || rate <= 1e-12) continue;
        const t = T + Math.max(0, d) / rate;
        if (t >= tNext) continue;
        const sp = dot(e.u, at(v, t - T));
        if (sp < dot(e.u, at(a, t - T)) - tolL || sp > dot(e.u, at(verts[a.next]!, t - T)) + tolL) continue;
        tNext = t; kind = 'split'; ev = vi; onto = ai;
      }
    }
    if (!Number.isFinite(tNext)) return null;

    // Sweep to it: each stretch of front a trapezoid.
    const dt = tNext - T;
    for (const i of alive) {
      const v = verts[i]!, n = verts[v.next]!;
      const cell: P2[] = [v.x, n.x, at(n, dt), at(v, dt)];
      if (Math.abs(polyArea(cell)) > eps * eps) cells[v.eR]!.push(cell);
    }
    for (const i of alive) { const v = verts[i]!; v.x = at(v, dt); }
    T = tNext;

    if (kind === 'edge') { collapse(ev); continue; }
    // The corner splits the side it reached: two corners where it was, one on each new loop.
    const v = verts[ev]!, a = verts[onto]!;
    const bi = a.next, vprev = v.prev, vnext = v.next;
    kill(ev);
    join(v.x, v.eL, a.eR, vprev, bi);
    join(v.x, a.eR, v.eR, onto, vnext);
  }
  return null;
}
