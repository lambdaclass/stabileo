import { snowRoofSteps, snowRoofSurfaces, roofSurfaceModel } from './snow-roof-surfaces';
import { widthSpans, type GravityLayout, type GravityModel } from './plan-gravity';
import { stepDrift, parapetDrift, slidingSnow, REF_DRIFT, REF_DRIFT_ADJACENT, REF_FIG9, REF_PARAPET, REF_SLIDING, type StepDrift } from '../../codes/cirsoc104/drift';
import { msg, round, type EngineMessage } from '../../codes/message';
import type { ClauseRef } from '../../codes/regulation';

type P2 = [number, number];

export interface SnowSurchargeLoad {
  elementId: number; q: number; qJ?: number; a?: number; b?: number; frame: 'projected';
}

interface Band { p0: P2; u: P2; len: number; n: P2; on: number[]; p: (d: number, t: number) => number }

const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const centroid = (poly: P2[]): P2 => [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];

function nearSeg(p: P2, a: P2, b: P2, tol: number): boolean {
  const d = sub(b, a), L2 = dot(d, d);
  const t = L2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), d) / L2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * d[0]), p[1] - (a[1] + t * d[1])) <= tol;
}

function lineInto(a: P2, b: P2, poly: P2[]): { p0: P2; u: P2; len: number; n: P2 } {
  const d = sub(b, a), len = Math.hypot(d[0], d[1]);
  const u: P2 = [d[0] / len, d[1] / len];
  let n: P2 = [-u[1], u[0]];
  if (dot(sub(centroid(poly), a), n) < 0) n = [u[1], -u[0]];
  return { p0: a, u, len, n };
}

function within(pt: P2, poly: P2[]): boolean {
  let c = false;
  for (let k = 0, j = poly.length - 1; k < poly.length; j = k++) {
    if (nearSeg(pt, poly[j]!, poly[k]!, 0.05)) return true;
    const [xi, yi] = poly[k]!, [xj, yj] = poly[j]!;
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

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

function surcharge(bands: Band[], pt: P2, on: (panel: number) => boolean): number {
  let s = 0;
  for (const b of bands) {
    const r = sub(pt, b.p0), t = dot(r, b.u), d = dot(r, b.n);
    if (t < -1e-6 || t > b.len + 1e-6 || d < -1e-6) continue;
    if (!b.on.some(on)) continue;
    s += b.p(d, t);
  }
  return s;
}

export interface DriftInputs {
  pg: number;
  balanced: number | ((panel: number, point: P2) => number);
  pf: number;
  pfFor?: (slope: number, W: number) => number;
  slippery: boolean;
  tributaryWidth: number;
  parapet?: { height: number };
  adjacent?: Array<{ side: '+x' | '-x' | '+y' | '-y'; topZ: number; separation: number; length: number }>;
}

export function driftAndSlidingLoads(model: GravityModel, layout: GravityLayout, i: DriftInputs, surfaceModel = roofSurfaceModel(model)): {
  distributed: SnowSurchargeLoad[]; derivation: EngineMessage[]; refs: ClauseRef[];
} {
  const surfaces = snowRoofSurfaces(model, layout, surfaceModel);
  const balanced = (panel: number, pt: P2) => typeof i.balanced === 'number' ? i.balanced : i.balanced(panel, pt);
  const bands: Band[] = [];
  const derivation: EngineMessage[] = [];
  const refs: ClauseRef[] = [];
  const roofs = layout.panels.map((p, k) => ({ ...p, k })).filter((p) => p.roof);
  const roofOf = (k: number): typeof roofs => {
    const start = roofs.find((p) => p.k === k);
    if (!start) return [];
    const group = [start];
    for (let i = 0; i < group.length; i++) {
      for (const p of roofs) {
        if (group.includes(p) || Math.abs(p.z - start.z) > 1e-8) continue;
        if (joined(group[i]!.polygon, p.polygon)) group.push(p);
      }
    }
    return group;
  };
  for (const step of snowRoofSteps(model, layout, surfaces)) {
    const L = roofs.find(p => p.k === step.lower)!, U = roofs.find(p => p.k === step.upper)!;
    const { a, b } = step;
    const line = lineInto(a, b, L.polygon);
    const t0 = 0, t1 = line.len;
    const lower = roofOf(L.k);
    const reach = (group: typeof roofs, sign: number) => Math.max(0, ...group.flatMap((p) => p.polygon.map((v) => sign * dot(sub(v, a), line.n))));
    const atStep = (t: number): P2 => [a[0] + line.u[0] * (t0 + t), a[1] + line.u[1] * (t0 + t)];
    const luUpper = reach(roofOf(U.k), -1), luLower = reach(lower, 1);
    const local = (t: number): StepDrift => {
      const pt = atStep(t);
      const stepHeight = surfaces(U.k).elevation(pt) - surfaces(L.k).elevation(pt);
      return stepDrift({ pg: i.pg, balanced: balanced(L.k, pt), stepHeight,
        luUpper, luLower });
    };
    const samples = [0, (t1 - t0) / 2, t1 - t0].map(t => ({ t, dr: local(t) }));

    for (const { t, dr } of samples) derivation.push(msg(dr.applies ? 'snow.derivation.drift' : 'snow.derivation.noDrift', {
      z: round(surfaces(L.k).elevation(atStep(t)), 2), up: round(surfaces(U.k).elevation(atStep(t)), 2), hb: round(dr.hb, 3), hc: round(dr.hc, 3),
      lee: round(dr.hdLeeward, 3), wind: round(dr.hdWindward, 3), h: round(dr.height, 3), w: round(dr.w, 2), pd: round(dr.pd, 3),
    }));
    if (refs.length === 0) refs.push(REF_DRIFT, REF_FIG9);
    bands.push({ p0: atStep(0), u: line.u, len: t1 - t0, n: line.n,
      on: lower.map(p => p.k), p: (d, t) => {
        const dr = local(t);
        return dr.applies && d <= dr.w ? dr.pd * (1 - d / dr.w) : 0;
      } });
  }
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
        const mid: P2 = [a[0] + line.u[0] * line.len / 2 - line.n[0] * 0.05, a[1] + line.u[1] * line.len / 2 - line.n[1] * 0.05];
        if (roofs.some((p) => p.k !== L.k && p.z >= L.z - 0.05 && inside(mid, p.polygon))) continue;
        const lower = roofOf(L.k);
        const lu = Math.max(0, ...lower.flatMap((p) => p.polygon.map((v) => dot(sub(v, a), line.n))));
        const point = (t: number): P2 => [a[0] + t * line.u[0], a[1] + t * line.u[1]];
        const band = (local: (pt: P2) => StepDrift) => bands.push({ p0: a, u: line.u, len: line.len, n: line.n, on: lower.map((p) => p.k), p: (d, t) => {
          const dr = local(point(t));
          return dr.applies && d <= dr.w ? dr.pd * (1 - d / dr.w) : 0;
        } });
        if (i.parapet && i.parapet.height > 0) {
          const local = (pt: P2) => parapetDrift({ pg: i.pg, balanced: balanced(L.k, pt), parapetHeight: i.parapet!.height, lu });
          const dr = local(a);
          derivation.push(msg(dr.applies ? 'snow.derivation.parapet' : 'snow.derivation.noParapet', {
            z: round(L.z, 2), hp: round(i.parapet.height, 2), lu: round(lu, 2), hb: round(dr.hb, 3), hc: round(dr.hc, 3),
            hd: round(dr.hdWindward, 3), h: round(dr.height, 3), w: round(dr.w, 2), pd: round(dr.pd, 3),
          }));
          band(local);
          if (dr.applies && !refs.includes(REF_PARAPET)) refs.push(REF_PARAPET, REF_FIG9);
        }
        for (const adj of i.adjacent ?? []) {
          const out: P2 = [-line.n[0], -line.n[1]];
          const want: P2 = adj.side === '+x' ? [1, 0] : adj.side === '-x' ? [-1, 0] : adj.side === '+y' ? [0, 1] : [0, -1];
          if (dot(out, want) < 0.95) continue;
          const beyond = layout.panels.some((p) => {
            const t = p.polygon.map((v) => dot(sub(v, a), line.u)), o = p.polygon.map((v) => dot(sub(v, a), out));
            return Math.max(...o) > 0.05 && Math.max(...t) > 0.05 && Math.min(...t) < line.len - 0.05;
          });
          if (beyond || adj.topZ <= L.z + 1e-8) continue;
          const local = (pt: P2) => stepDrift({ pg: i.pg, balanced: balanced(L.k, pt), stepHeight: adj.topZ - surfaces(L.k).elevation(pt), luUpper: adj.length, luLower: lu, separation: adj.separation });
          const dr = local(a);
          derivation.push(msg(dr.applies ? 'snow.derivation.adjacent' : 'snow.derivation.noAdjacent', {
            z: round(L.z, 2), side: adj.side.toUpperCase(), top: round(adj.topZ, 2), s: round(adj.separation, 2),
            hb: round(dr.hb, 3), hc: round(dr.hc, 3), h: round(dr.height, 3), w: round(dr.w, 2), pd: round(dr.pd, 3),
          }));
          band(local);
          if (dr.applies && !refs.includes(REF_DRIFT_ADJACENT)) refs.push(REF_DRIFT_ADJACENT, REF_FIG9);
        }
      }
    }
  }
  for (const L of roofs) {
    for (let e = 0; e < L.polygon.length; e++) {
      const a = L.polygon[e]!, b = L.polygon[(e + 1) % L.polygon.length]!;
      const line = lineInto(a, b, L.polygon);
      for (const source of surfaceModel.planes) {
        if (dot(source.gradient, line.n) >= 0) continue;
        const eave = surfaceModel.roof.filter(m => source.members.has(m.id)).flatMap(m => {
          const low = (m.a.z ?? 0) <= (m.b.z ?? 0) ? m.a : m.b;
          const pt: P2 = [low.x, low.y];
          return nearSeg(pt, a, b, 0.01) && source.elevation(pt) > surfaces(L.k).elevation(pt) + 1e-8 ? [dot(sub(pt, a), line.u)] : [];
        });
        if (!eave.length) continue;
        const t0 = Math.max(0, Math.min(...eave)), t1 = Math.min(line.len, Math.max(...eave));
        if (t1 - t0 <= 1e-9) continue;
        const sl = slidingSnow({ pf: i.pfFor?.(source.slope, source.W) ?? i.pf, slopePercent: Math.hypot(...source.gradient) * 100, slippery: i.slippery, W: source.W });
        derivation.push(msg(sl.applies ? 'snow.derivation.sliding' : 'snow.derivation.noSliding', {
          z: round(L.z, 2), W: round(source.W, 2), slope: round(Math.hypot(...source.gradient) * 100, 1), perMetre: round(sl.perMetre, 3), p: round(sl.intensity, 3),
        }));
        if (!sl.applies) continue;
        if (!refs.includes(REF_SLIDING)) refs.push(REF_SLIDING);
        bands.push({ p0: [a[0] + line.u[0] * t0, a[1] + line.u[1] * t0], u: line.u, len: t1 - t0, n: line.n,
          on: roofOf(L.k).map(p => p.k), p: (d, t) => {
            const pt: P2 = [a[0] + (t + t0) * line.u[0], a[1] + (t + t0) * line.u[1]];
            return d <= 4.5 && source.elevation(pt) > surfaces(L.k).elevation(pt) + 1e-8 ? sl.intensity : 0;
          } });
      }
    }
  }
  if (bands.length === 0) return { distributed: [], derivation, refs };
  const out: SnowSurchargeLoad[] = [];
  const at = (id: number) => {
    const el = model.elements.get(id)!;
    const a = model.nodes.get(el.nodeI)!, b = model.nodes.get(el.nodeJ)!;
    const L = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
    return { a, b, L, zAt: (x: number) => (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * x / L, pt: (x: number): P2 => [a.x + ((b.x - a.x) * x) / L, a.y + ((b.y - a.y) * x) / L] };
  };
  for (const p of layout.pieces) {
    if (!p.roof) continue;
    const m = at(p.elementId);
    const c = centroid(layout.panels[p.panel]!.polygon);
    const x0 = p.a ?? 0, x1 = p.b ?? m.L;
    const dir: P2 = [(m.b.x - m.a.x) / m.L, (m.b.y - m.a.y) / m.L];
    let inward: P2 = [-dir[1], dir[0]];
    if (dot(sub(c, m.pt(x0)), inward) < 0) inward = [dir[1], -dir[0]];
    const q = (x: number) => {
      const dep = p.wI + ((p.wJ - p.wI) * (x - x0)) / Math.max(x1 - x0, 1e-9);
      const s = m.pt(x);
      let sum = 0;
      for (let k = 0; k <= 8; k++) {
        const f = (dep * k) / 8;
        sum += (k === 0 || k === 8 ? 1 : k % 2 ? 4 : 2) * surcharge(bands, [s[0] + inward[0] * f, s[1] + inward[1] * f], panel => panel === p.panel && within([s[0] + inward[0] * f, s[1] + inward[1] * f], layout.panels[panel]!.polygon));
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
    for (const s of widthSpans(w, i.tributaryWidth)) {
      const cuts = [s.t0, ...[1, 2, 3].map((k) => k / 4).filter((t) => t > s.t0 && t < s.t1), s.t1];
      for (let k = 0; k + 1 < cuts.length; k++) {
        const xa = m.L * cuts[k]!, xb = m.L * cuts[k + 1]!;
        const qa = surcharge(bands, m.pt(xa), panel => within(m.pt(xa), layout.panels[panel]!.polygon) && Math.abs(surfaces(panel).elevation(m.pt(xa)) - m.zAt(xa)) <= 0.05) * s.width, qb = surcharge(bands, m.pt(xb), panel => within(m.pt(xb), layout.panels[panel]!.polygon) && Math.abs(surfaces(panel).elevation(m.pt(xb)) - m.zAt(xb)) <= 0.05) * s.width;
        if (qa < 1e-6 && qb < 1e-6) continue;
        out.push({ elementId: w.elementId, q: -qa, qJ: -qb, a: xa, b: xb, frame: 'projected' });
      }
    }
  }
  return { distributed: out, derivation, refs };
}
