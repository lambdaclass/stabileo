/**
 * Where CIRSOC 104's drifts (Cap. 7 and 8) and sliding snow (Cap. 9) land on the model
 * (`codes/cirsoc104/drift.ts` for the regulation's numbers).
 *
 * ── Steps ─────────────────────────────────────────────────────────
 *
 * A step is a stretch where a lower roof panel and a higher roof panel share a side in plan
 * (`plan-gravity.ts` gives the panels and which are roofs). The upper roof's length upwind of
 * the step, l_u, is how far its panels reach from the step line on their side; the lower roof's,
 * on the other.
 *
 * ── Parapets and separate structures ──────────────────────────────
 *
 * An exterior edge of a roof (no roof of its level, nor a higher one, just outside it) takes the
 * drift of Cap. 8 against a parapet of the height given, and the drift of §7.2 from a separate
 * higher structure standing on that side of the model, reduced by its separation. l_u is the
 * roof's length from the edge into it.
 *
 * ── Sliding ───────────────────────────────────────────────────────
 *
 * A sloped roof member of a higher roof whose low end stands over the side of a lower roof panel
 * is an eave over that roof. W is the horizontal distance from that side to the highest nodes of
 * the sloped roof members behind it.
 *
 * ── Loads ─────────────────────────────────────────────────────────
 *
 * Both are a surcharge that varies across the lower roof with the distance from the step or the
 * eave. A beam carries it over the strip it collects: each panel piece is cut in four, and at
 * each end of a cut the surcharge is averaged along the strip, from the beam to its tributary
 * depth, times that depth. A member loaded by width reads it on its own line.
 *
 * The surcharge stays on the lower roof: the panels of its level joined to the one the band
 * starts from, side by side. A roof of the same level that is not joined to it (across a gap, or
 * a separate building) takes none of it, though it lies within w or 4,5 m of the step; it used
 * to. The lengths l_u are read on the joined panels too.
 *
 * Pure: no store.
 */
import type { GravityLayout, GravityModel } from './plan-gravity';
import { stepDrift, parapetDrift, slidingSnow, REF_DRIFT, REF_DRIFT_ADJACENT, REF_FIG9, REF_PARAPET, REF_SLIDING, type StepDrift } from '../../codes/cirsoc104/drift';
import { msg, round, type EngineMessage } from '../../codes/message';
import type { ClauseRef } from '../../codes/regulation';

type P2 = [number, number];

export interface SnowSurchargeLoad {
  elementId: number; q: number; qJ?: number; a?: number; b?: number; frame: 'projected';
}

/**
 * A surcharge band along a line, into the lower roof: `p(d)` at distance d from the line, only
 * on the lower roof's panels `on`.
 */
interface Band { p0: P2; u: P2; len: number; n: P2; z: number; on: P2[][]; p: (d: number) => number }

const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const centroid = (poly: P2[]): P2 => [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];

function nearSeg(p: P2, a: P2, b: P2, tol: number): boolean {
  const d = sub(b, a), L2 = dot(d, d);
  const t = L2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), d) / L2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * d[0]), p[1] - (a[1] + t * d[1])) <= tol;
}

/** A band's line from a side of `poly` (the lower panel), its normal pointing into the panel. */
function lineInto(a: P2, b: P2, poly: P2[]): { p0: P2; u: P2; len: number; n: P2 } {
  const d = sub(b, a), len = Math.hypot(d[0], d[1]);
  const u: P2 = [d[0] / len, d[1] / len];
  let n: P2 = [-u[1], u[0]];
  if (dot(sub(centroid(poly), a), n) < 0) n = [u[1], -u[0]];
  return { p0: a, u, len, n };
}

/** Point in polygon, its sides included (within 5 cm). */
function within(pt: P2, poly: P2[]): boolean {
  let c = false;
  for (let k = 0, j = poly.length - 1; k < poly.length; j = k++) {
    if (nearSeg(pt, poly[j]!, poly[k]!, 0.05)) return true;
    const [xi, yi] = poly[k]!, [xj, yj] = poly[j]!;
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Whether two panels share a stretch of side (more than 10 cm of it). */
function joined(A: P2[], B: P2[]): boolean {
  for (let e = 0; e < A.length; e++) {
    const a = A[e]!, b = A[(e + 1) % A.length]!;
    const d = sub(b, a), len = Math.hypot(d[0], d[1]);
    if (len < 1e-9) continue;
    const u: P2 = [d[0] / len, d[1] / len], n: P2 = [-u[1], u[0]];
    for (let f = 0; f < B.length; f++) {
      const c = B[f]!, g = B[(f + 1) % B.length]!;
      if (Math.abs(dot(sub(c, a), n)) > 0.01 || Math.abs(dot(sub(g, a), n)) > 0.01) continue;
      const tc = dot(sub(c, a), u), tg = dot(sub(g, a), u);
      if (Math.min(len, Math.max(tc, tg)) - Math.max(0, Math.min(tc, tg)) > 0.1) return true;
    }
  }
  return false;
}

/** The value of the bands at a plan point of level z. */
function surcharge(bands: Band[], pt: P2, z: number): number {
  let s = 0;
  for (const b of bands) {
    if (Math.abs(b.z - z) > 0.05) continue;
    const r = sub(pt, b.p0), t = dot(r, b.u), d = dot(r, b.n);
    if (t < -1e-6 || t > b.len + 1e-6 || d < -1e-6) continue;
    if (!b.on.some((poly) => within(pt, poly))) continue;
    s += b.p(d);
  }
  return s;
}

export interface DriftInputs {
  pg: number;
  /** Balanced snow on the roofs (p_s), kN/m², and the flat-roof load p_f. */
  balanced: number;
  pf: number;
  slippery: boolean;
  tributaryWidth: number;
  /** A parapet of this height above the roof on every exterior edge of the roofs, m (Cap. 8). */
  parapet?: { height: number };
  /**
   * Separate structures higher than the roof beside it (§7.2): the side of the model they stand
   * on, the elevation of their roof, the gap to them and the length of their roof, m.
   */
  adjacent?: Array<{ side: '+x' | '-x' | '+y' | '-y'; topZ: number; separation: number; length: number }>;
}

export function driftAndSlidingLoads(model: GravityModel, layout: GravityLayout, i: DriftInputs): {
  distributed: SnowSurchargeLoad[]; derivation: EngineMessage[]; refs: ClauseRef[];
} {
  const bands: Band[] = [];
  const derivation: EngineMessage[] = [];
  const refs: ClauseRef[] = [];
  const roofs = layout.panels.map((p, k) => ({ ...p, k })).filter((p) => p.roof);
  /** The roof a panel belongs to: the panels of its level joined to it, side by side, in turn. */
  const roofOf = (k: number): typeof roofs => {
    const start = roofs.find((p) => p.k === k);
    if (!start) return [];
    const group = [start];
    for (let i = 0; i < group.length; i++) {
      for (const p of roofs) {
        if (group.includes(p) || Math.abs(p.z - start.z) > 0.05) continue;
        if (joined(group[i]!.polygon, p.polygon)) group.push(p);
      }
    }
    return group;
  };

  // ── Steps (Cap. 7.1) ──
  for (const L of roofs) for (const U of roofs) {
    if (U.z <= L.z + 0.1) continue;
    for (let e = 0; e < L.polygon.length; e++) {
      const a = L.polygon[e]!, b = L.polygon[(e + 1) % L.polygon.length]!;
      const line = lineInto(a, b, L.polygon);
      // The part of this side that a side of U runs along.
      let t0 = Infinity, t1 = -Infinity;
      for (let f = 0; f < U.polygon.length; f++) {
        const c = U.polygon[f]!, d = U.polygon[(f + 1) % U.polygon.length]!;
        if (Math.abs(dot(sub(c, a), line.n)) > 0.01 || Math.abs(dot(sub(d, a), line.n)) > 0.01) continue;
        const tc = dot(sub(c, a), line.u), td = dot(sub(d, a), line.u);
        const lo = Math.max(0, Math.min(tc, td)), hi = Math.min(line.len, Math.max(tc, td));
        if (hi - lo > 0.1) { t0 = Math.min(t0, lo); t1 = Math.max(t1, hi); }
      }
      if (!(t1 > t0)) continue;
      const lower = roofOf(L.k);
      const reach = (group: typeof roofs, sign: number) => Math.max(0, ...group.flatMap((p) => p.polygon.map((v) => sign * dot(sub(v, a), line.n))));
      const dr: StepDrift = stepDrift({
        pg: i.pg, balanced: i.balanced, stepHeight: U.z - L.z, luUpper: reach(roofOf(U.k), -1), luLower: reach(lower, 1),
      });
      derivation.push(msg(dr.applies ? 'snow.derivation.drift' : 'snow.derivation.noDrift', {
        z: round(L.z, 2), up: round(U.z, 2), hb: round(dr.hb, 3), hc: round(dr.hc, 3),
        lee: round(dr.hdLeeward, 3), wind: round(dr.hdWindward, 3), h: round(dr.height, 3), w: round(dr.w, 2), pd: round(dr.pd, 3),
      }));
      if (!dr.applies) continue;
      if (refs.length === 0) refs.push(REF_DRIFT, REF_FIG9);
      bands.push({ p0: [a[0] + line.u[0] * t0, a[1] + line.u[1] * t0], u: line.u, len: t1 - t0, n: line.n, z: L.z,
        on: lower.map((p) => p.polygon), p: (d) => (d <= dr.w ? dr.pd * (1 - d / dr.w) : 0) });
    }
  }

  // ── Exterior edges: parapets (Cap. 8) and separate structures (§7.2) ──
  const inside = (pt: P2, poly: P2[]) => {
    let c = false;
    for (let k = 0, j = poly.length - 1; k < poly.length; j = k++) {
      const [xi, yi] = poly[k]!, [xj, yj] = poly[j]!;
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  if (i.parapet || i.adjacent?.length) {
    for (const L of roofs) {
      for (let e = 0; e < L.polygon.length; e++) {
        const a = L.polygon[e]!, b = L.polygon[(e + 1) % L.polygon.length]!;
        const line = lineInto(a, b, L.polygon);
        if (line.len < 0.1) continue;
        // Exterior: just outside the edge there is no roof of this level, nor a higher one (a step).
        const mid: P2 = [a[0] + line.u[0] * line.len / 2 - line.n[0] * 0.05, a[1] + line.u[1] * line.len / 2 - line.n[1] * 0.05];
        if (roofs.some((p) => p.k !== L.k && p.z >= L.z - 0.05 && inside(mid, p.polygon))) continue;
        // The roof's length from this edge into it, for l_u.
        const lower = roofOf(L.k);
        const lu = Math.max(0, ...lower.flatMap((p) => p.polygon.map((v) => dot(sub(v, a), line.n))));
        const band = (dr: StepDrift) => bands.push({ p0: a, u: line.u, len: line.len, n: line.n, z: L.z, on: lower.map((p) => p.polygon), p: (d) => (d <= dr.w ? dr.pd * (1 - d / dr.w) : 0) });
        if (i.parapet && i.parapet.height > 0) {
          const dr = parapetDrift({ pg: i.pg, balanced: i.balanced, parapetHeight: i.parapet.height, lu });
          derivation.push(msg(dr.applies ? 'snow.derivation.parapet' : 'snow.derivation.noParapet', {
            z: round(L.z, 2), hp: round(i.parapet.height, 2), lu: round(lu, 2), hb: round(dr.hb, 3), hc: round(dr.hc, 3),
            hd: round(dr.hdWindward, 3), h: round(dr.height, 3), w: round(dr.w, 2), pd: round(dr.pd, 3),
          }));
          if (dr.applies) { band(dr); if (!refs.includes(REF_PARAPET)) refs.push(REF_PARAPET, REF_FIG9); }
        }
        for (const adj of i.adjacent ?? []) {
          // The edge faces the side the structure stands on, and nothing of the model is beyond it.
          const out: P2 = [-line.n[0], -line.n[1]];
          const want: P2 = adj.side === '+x' ? [1, 0] : adj.side === '-x' ? [-1, 0] : adj.side === '+y' ? [0, 1] : [0, -1];
          if (dot(out, want) < 0.95) continue;
          const beyond = layout.panels.some((p) => {
            const t = p.polygon.map((v) => dot(sub(v, a), line.u)), o = p.polygon.map((v) => dot(sub(v, a), out));
            return Math.max(...o) > 0.05 && Math.max(...t) > 0.05 && Math.min(...t) < line.len - 0.05;
          });
          if (beyond || adj.topZ <= L.z + 0.1) continue;
          const dr = stepDrift({ pg: i.pg, balanced: i.balanced, stepHeight: adj.topZ - L.z, luUpper: adj.length, luLower: lu, separation: adj.separation });
          derivation.push(msg(dr.applies ? 'snow.derivation.adjacent' : 'snow.derivation.noAdjacent', {
            z: round(L.z, 2), side: adj.side.toUpperCase(), top: round(adj.topZ, 2), s: round(adj.separation, 2),
            hb: round(dr.hb, 3), hc: round(dr.hc, 3), h: round(dr.height, 3), w: round(dr.w, 2), pd: round(dr.pd, 3),
          }));
          if (dr.applies) { band(dr); if (!refs.includes(REF_DRIFT_ADJACENT)) refs.push(REF_DRIFT_ADJACENT, REF_FIG9); }
        }
      }
    }
  }

  // ── Sliding (Cap. 9) ──
  const sloped = layout.widthMembers.filter((m) => layout.roof.has(m.elementId) && m.length - m.horizontalLength > 1e-6);
  for (const L of roofs) {
    for (let e = 0; e < L.polygon.length; e++) {
      const a = L.polygon[e]!, b = L.polygon[(e + 1) % L.polygon.length]!;
      const line = lineInto(a, b, L.polygon);
      const eave: number[] = [];
      let slopeSum = 0;
      for (const m of sloped) {
        const el = model.elements.get(m.elementId)!;
        const nI = model.nodes.get(el.nodeI)!, nJ = model.nodes.get(el.nodeJ)!;
        const [low, high] = (nI.z ?? 0) <= (nJ.z ?? 0) ? [nI, nJ] : [nJ, nI];
        if ((low.z ?? 0) <= L.z + 0.1 || !nearSeg([low.x, low.y], a, b, 0.01)) continue;
        // The member climbs away from the lower roof.
        if (dot(sub([high.x, high.y], [low.x, low.y]), line.n) >= 0) continue;
        eave.push(dot(sub([low.x, low.y], a), line.u));
        slopeSum += (((high.z ?? 0) - (low.z ?? 0)) / Math.max(m.horizontalLength, 1e-9)) * 100;
      }
      if (eave.length === 0) continue;
      const t0 = Math.max(0, Math.min(...eave)), t1 = Math.min(line.len, Math.max(...eave));
      // W: from the eave to the highest nodes of the sloped roof behind it, within the eave's reach.
      const behind = sloped.flatMap((m) => {
        const el = model.elements.get(m.elementId)!;
        return [model.nodes.get(el.nodeI)!, model.nodes.get(el.nodeJ)!];
      }).filter((n) => { const t = dot(sub([n.x, n.y], a), line.u); return t >= t0 - 0.5 && t <= t1 + 0.5 && dot(sub([n.x, n.y], a), line.n) <= 0; });
      const zTop = Math.max(...behind.map((n) => n.z ?? 0));
      const ridge = behind.filter((n) => (n.z ?? 0) >= zTop - 0.05);
      const W = ridge.reduce((s, n) => s - dot(sub([n.x, n.y], a), line.n), 0) / Math.max(ridge.length, 1);
      const sl = slidingSnow({ pf: i.pf, slopePercent: slopeSum / eave.length, slippery: i.slippery, W });
      derivation.push(msg(sl.applies ? 'snow.derivation.sliding' : 'snow.derivation.noSliding', {
        z: round(L.z, 2), W: round(W, 2), slope: round(slopeSum / eave.length, 1), perMetre: round(sl.perMetre, 3), p: round(sl.intensity, 3),
      }));
      if (!sl.applies) continue;
      if (!refs.includes(REF_SLIDING)) refs.push(REF_SLIDING);
      bands.push({ p0: [a[0] + line.u[0] * t0, a[1] + line.u[1] * t0], u: line.u, len: Math.max(t1 - t0, 0.01), n: line.n, z: L.z,
        on: roofOf(L.k).map((p) => p.polygon), p: (d) => (d <= 4.5 ? sl.intensity : 0) });
    }
  }
  if (bands.length === 0) return { distributed: [], derivation, refs };

  // ── On the members of the lower roofs ──
  const out: SnowSurchargeLoad[] = [];
  const at = (id: number) => {
    const el = model.elements.get(id)!;
    const a = model.nodes.get(el.nodeI)!, b = model.nodes.get(el.nodeJ)!;
    const L = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
    return { a, b, L, z: ((a.z ?? 0) + (b.z ?? 0)) / 2, pt: (x: number): P2 => [a.x + ((b.x - a.x) * x) / L, a.y + ((b.y - a.y) * x) / L] };
  };
  for (const p of layout.pieces) {
    if (!p.roof) continue;
    const m = at(p.elementId);
    const c = centroid(layout.panels[p.panel]!.polygon);
    const x0 = p.a ?? 0, x1 = p.b ?? m.L;
    const dir: P2 = [(m.b.x - m.a.x) / m.L, (m.b.y - m.a.y) / m.L];
    let inward: P2 = [-dir[1], dir[0]];
    if (dot(sub(c, m.pt(x0)), inward) < 0) inward = [dir[1], -dir[0]];
    // The surcharge over the strip the beam collects at x: its mean along the strip, by Simpson
    // over eight intervals (the surcharge is piecewise linear and can stop inside the strip).
    const q = (x: number) => {
      const dep = p.wI + ((p.wJ - p.wI) * (x - x0)) / Math.max(x1 - x0, 1e-9);
      const s = m.pt(x);
      let sum = 0;
      for (let k = 0; k <= 8; k++) {
        const f = (dep * k) / 8;
        sum += (k === 0 || k === 8 ? 1 : k % 2 ? 4 : 2) * surcharge(bands, [s[0] + inward[0] * f, s[1] + inward[1] * f], m.z);
      }
      return (sum / 24) * dep;
    };
    for (let k = 0; k < 4; k++) {
      const xa = x0 + ((x1 - x0) * k) / 4, xb = x0 + ((x1 - x0) * (k + 1)) / 4;
      const qa = q(xa), qb = q(xb);
      if (qa < 1e-6 && qb < 1e-6) continue;
      out.push({ elementId: p.elementId, q: -qa, qJ: -qb, a: xa, b: xb, frame: 'projected' });
    }
  }
  for (const w of layout.widthMembers) {
    if (!layout.roof.has(w.elementId)) continue;
    const m = at(w.elementId);
    for (let k = 0; k < 4; k++) {
      const xa = (m.L * k) / 4, xb = (m.L * (k + 1)) / 4;
      const qa = surcharge(bands, m.pt(xa), m.z) * i.tributaryWidth, qb = surcharge(bands, m.pt(xb), m.z) * i.tributaryWidth;
      if (qa < 1e-6 && qb < 1e-6) continue;
      out.push({ elementId: w.elementId, q: -qa, qJ: -qb, a: xa, b: xb, frame: 'projected' });
    }
  }
  return { distributed: out, derivation, refs };
}
