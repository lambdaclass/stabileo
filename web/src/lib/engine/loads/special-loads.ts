/**
 * The load cases of the regulation load generator that are not gravity, wind or earthquake:
 * T, H and F of CIRSOC 101-2025 §2.2.
 *
 *   T  restraint effects of a temperature change: a uniform ΔT, and a gradient through the depth,
 *      on every member and shell (§2.3.4);
 *   H  the lateral pressure of soil, p = K (γ (z_g − z) + q) below the grade z_g, with K the
 *      coefficient (at rest K0, or active), γ the soil's unit weight (Tabla 3.2) and q a surcharge;
 *   F  the pressure of a fluid of unit weight γ, γ (z_f − z) below its level z_f, horizontal on
 *      the walls and vertical on the bottom.
 *
 * CIRSOC 101 gives the symbols and the combinations, not how much soil or fluid pushes: K, γ and
 * the levels are the reader's, and the derivation says so.
 *
 * ── Which walls, and from which side ─────────────────────────────
 *
 * Soil acts from the side it is retained on, a fluid from the side it is held on; neither can be
 * told from the order of a quad's nodes. The reader may give a point in plan on that side (in the
 * retained soil; inside the fluid): then the walls loaded are those seen from it, the segment from
 * the point to the wall crossing no other wall, pushed away from it. Without a point, the walls
 * are read off the plan as a whole. A wall with one side closed in by walls and the other open
 * bounds a region: soil pushes from the open side (a basement), a fluid from the closed one (a
 * tank). A wall closed in on both sides is an interior one and takes neither; a wall open on
 * both (a lone retaining wall) cannot say its side, and is left out with a note asking for the
 * point. A side is open when some line from the wall's middle, within 75° of its normal, leaves
 * the plan without meeting another wall. A fluid's bottom is the horizontal quads under its level
 * seen from the point, or closed in by walls on every side; a slab outside the tank takes nothing.
 * This used to load every vertical quad below the grade or the level, interior walls included,
 * each pushed toward or away from the middle of them all, which on a single wall is no side at
 * all and fell to the node order; and every horizontal quad below the level, inside or not.
 *
 * ── The nodal forces ─────────────────────────────────────────────
 *
 * The pressure is integrated over the part of each quad below the grade or the level, with the
 * quad's bilinear shape functions: the consistent nodal loads, whose total and moment are exact
 * for a pressure linear in depth. Along a line of one natural coordinate z is linear in the other,
 * so the cut at the grade is found exactly on each line, integrated along it by Gauss and across
 * the lines by composite Gauss, taking first the coordinate z changes along. This used to give
 * each node p(its own depth) times a quarter of the area, which put the whole of a one-quad-high
 * wall's load at its foot, losing its moment about the base, γH³/6 per metre of a hydrostatic
 * wall; and gave a quad cut by the level p(bottom) over half its area, half again the force.
 *
 * Pure: no store.
 */
import { msg, round, type EngineMessage } from '../../codes/message';

export interface SpecialModel {
  nodes: Map<number, { id: number; x: number; y: number; z?: number }>;
  elements: Map<number, { id: number; type?: 'frame' | 'truss' }>;
  quads?: Map<number, { id: number; nodes: number[] }>;
}

export interface ThermalInput { dtUniform: number; dtGradient: number }
/** `side`: a point in plan in the retained soil (see the header); absent, read off the plan. */
export interface SoilInput { gradeZ: number; gamma: number; k: number; surcharge: number; side?: { x: number; y: number } }
/** `inside`: a point in plan inside the fluid (see the header); absent, read off the plan. */
export interface FluidInput { levelZ: number; gamma: number; inside?: { x: number; y: number } }

export interface SpecialLoads {
  thermal: Array<{ elementId?: number; quadId?: number; dtUniform: number; dtGradient: number }>;
  soil: Array<{ nodeId: number; fx: number; fy: number; fz: number }>;
  fluid: Array<{ nodeId: number; fx: number; fy: number; fz: number }>;
  fluidBottom: Array<{ quadId: number; q: number }>;
  derivation: EngineMessage[];
  notes: EngineMessage[];
}

const Z = (n: { z?: number }) => n.z ?? 0;
type V2 = [number, number];
type V3 = [number, number, number];

interface Wall {
  quadId: number; nodes: number[]; pts: V3[];
  /** Horizontal unit normal, plan centroid, plan segment, lowest z. */
  n: V2; c: V2; seg: [V2, V2]; zMin: number;
}

/** Vertical quads: their horizontal unit normal, plan centroid and plan segment. */
function walls(model: SpecialModel): Wall[] {
  const out: Wall[] = [];
  for (const q of model.quads?.values() ?? []) {
    const ids = q.nodes.slice(0, 4);
    const p = ids.map((id) => model.nodes.get(id)).filter((x): x is NonNullable<typeof x> => !!x);
    if (p.length < 3 || p.length !== ids.length) continue;
    const u = [p[1]!.x - p[0]!.x, p[1]!.y - p[0]!.y, Z(p[1]!) - Z(p[0]!)];
    const v = [p[2]!.x - p[0]!.x, p[2]!.y - p[0]!.y, Z(p[2]!) - Z(p[0]!)];
    const nx = u[1]! * v[2]! - u[2]! * v[1]!, ny = u[2]! * v[0]! - u[0]! * v[2]!, nz = u[0]! * v[1]! - u[1]! * v[0]!;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9 || Math.abs(nz) / len > 0.1) continue;
    const h = Math.hypot(nx, ny);
    const n: V2 = [nx / h, ny / h];
    const c: V2 = [p.reduce((t, x) => t + x.x, 0) / p.length, p.reduce((t, x) => t + x.y, 0) / p.length];
    // Along the wall in plan: the extent of its nodes.
    const along = p.map((x) => -(x.x - c[0]) * n[1] + (x.y - c[1]) * n[0]);
    const lo = Math.min(...along), hi = Math.max(...along);
    out.push({
      quadId: q.id, nodes: ids, pts: p.map((x) => [x.x, x.y, Z(x)] as V3), n, c,
      seg: [[c[0] - lo * n[1], c[1] + lo * n[0]], [c[0] - hi * n[1], c[1] + hi * n[0]]],
      zMin: Math.min(...p.map(Z)),
    });
  }
  return out;
}

/** Whether the segment a→b meets the segment s (b's end excluded, a's never on it). */
function meets(a: V2, b: V2, s: [V2, V2]): boolean {
  const r: V2 = [b[0] - a[0], b[1] - a[1]], q: V2 = [s[1][0] - s[0][0], s[1][1] - s[0][1]];
  const den = r[0] * q[1] - r[1] * q[0];
  if (Math.abs(den) < 1e-12) return false;
  const w: V2 = [s[0][0] - a[0], s[0][1] - a[1]];
  const t = (w[0] * q[1] - w[1] * q[0]) / den, u = (w[0] * r[1] - w[1] * r[0]) / den;
  return t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9;
}

const blockedBy = (a: V2, b: V2, others: Wall[]) => others.some((o) => meets(a, b, o.seg));

/** Whether some line from `from` within 75° of `dir` leaves the plan without meeting a wall. */
function opens(from: V2, dir: V2, others: Wall[], reach: number): boolean {
  for (let deg = -75; deg <= 75; deg += 15) {
    const t = (deg * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t);
    const d: V2 = [dir[0] * cs - dir[1] * sn, dir[0] * sn + dir[1] * cs];
    if (!blockedBy(from, [from[0] + d[0] * reach, from[1] + d[1] * reach], others)) return true;
  }
  return false;
}

/** Whether the point is closed in by walls on every side. */
function enclosed(pt: V2, ws: Wall[], reach: number): boolean {
  for (let k = 0; k < 24; k++) {
    const t = (k * Math.PI) / 12;
    if (!blockedBy(pt, [pt[0] + Math.cos(t) * reach, pt[1] + Math.sin(t) * reach], ws)) return false;
  }
  return true;
}

const GAUSS3: ReadonlyArray<[number, number]> = [[-Math.sqrt(0.6), 5 / 9], [0, 8 / 9], [Math.sqrt(0.6), 5 / 9]];

/**
 * Consistent nodal forces of a pressure p(depth) on the part of a quad below `top` (see the
 * header): the integral of N_i p dA for each node. A triangle is a quad with its last node twice.
 */
export function consistentPressure(pts: V3[], top: number, p: (depth: number) => number): number[] {
  const P = pts.length === 3 ? [pts[0]!, pts[1]!, pts[2]!, pts[2]!] : pts.slice(0, 4);
  const N = (xi: number, eta: number) => [(1 - xi) * (1 - eta) / 4, (1 + xi) * (1 - eta) / 4, (1 + xi) * (1 + eta) / 4, (1 - xi) * (1 + eta) / 4];
  const at = (xi: number, eta: number, k: number) => N(xi, eta).reduce((t, w, i) => t + w * P[i]![k]!, 0);
  const dA = (xi: number, eta: number) => {
    const dxi = [0, 1, 2].map((k) => ((1 - eta) * (P[1]![k]! - P[0]![k]!) + (1 + eta) * (P[2]![k]! - P[3]![k]!)) / 4);
    const deta = [0, 1, 2].map((k) => ((1 - xi) * (P[3]![k]! - P[0]![k]!) + (1 + xi) * (P[2]![k]! - P[1]![k]!)) / 4);
    return Math.hypot(dxi[1]! * deta[2]! - dxi[2]! * deta[1]!, dxi[2]! * deta[0]! - dxi[0]! * deta[2]!, dxi[0]! * deta[1]! - dxi[1]! * deta[0]!);
  };
  // The inner coordinate is the one z changes along at the middle.
  const dzXi = Math.abs(at(1, 0, 2) - at(-1, 0, 2)), dzEta = Math.abs(at(0, 1, 2) - at(0, -1, 2));
  const swap = dzXi > dzEta;
  const point = (a: number, b: number): [number, number] => (swap ? [b, a] : [a, b]);
  const f = [0, 0, 0, 0];
  const M = 8;
  for (let m = 0; m < M; m++) {
    const a0 = -1 + (2 * m) / M, ha = 1 / M;
    for (const [ga, wa] of GAUSS3) {
      const a = a0 + ha + ga * ha;
      // z along this line is linear in b: z = z0 + z1 b.
      const zA = at(...point(a, -1), 2), zB = at(...point(a, 1), 2);
      const z0 = (zA + zB) / 2, z1 = (zB - zA) / 2;
      let lo = -1, hi = 1;
      if (Math.abs(z1) < 1e-12) { if (z0 >= top) continue; }
      else {
        const bStar = (top - z0) / z1;
        if (z1 > 0) hi = Math.min(1, bStar); else lo = Math.max(-1, bStar);
      }
      if (hi - lo <= 1e-12) continue;
      const hb = (hi - lo) / 2;
      for (const [gb, wb] of GAUSS3) {
        const b = lo + hb + gb * hb;
        const [xi, eta] = point(a, b);
        const depth = top - at(xi, eta, 2);
        if (!(depth > 0)) continue;
        const w = wa * ha * wb * hb * p(depth) * dA(xi, eta);
        N(xi, eta).forEach((ni, i) => { f[i] = f[i]! + ni * w; });
      }
    }
  }
  if (pts.length === 3) return [f[0]!, f[1]!, f[2]! + f[3]!];
  return f;
}

type Pushed = { wall: Wall; dir: 1 | -1 };

/**
 * The walls a soil or a fluid below `top` pushes on, and the sense along each normal (see the
 * header). `point`: on the side the pressure comes from; `soil`: whether it comes from the open
 * side (soil) or the closed one (fluid).
 */
function pushedWalls(ws: Wall[], top: number, point: { x: number; y: number } | undefined, soil: boolean, reach: number) {
  const loaded = ws.filter((w) => w.zMin < top - 1e-6);
  const out: Pushed[] = [];
  let lone = 0;
  for (const w of loaded) {
    const others = loaded.filter((o) => o !== w);
    const off = (s: number): V2 => [w.c[0] + s * 1e-4 * w.n[0], w.c[1] + s * 1e-4 * w.n[1]];
    if (point) {
      const side = w.n[0] * (point.x - w.c[0]) + w.n[1] * (point.y - w.c[1]);
      if (Math.abs(side) < 1e-6) continue;
      const s = side > 0 ? 1 : -1;
      if (blockedBy([point.x, point.y], off(s), others)) continue;
      out.push({ wall: w, dir: s > 0 ? -1 : 1 });
      continue;
    }
    const plus = opens(off(1), w.n, others, reach), minus = opens(off(-1), [-w.n[0], -w.n[1]], others, reach);
    if (plus && minus) { lone++; continue; }
    if (!plus && !minus) continue;   // an interior wall
    // The side the pressure comes from: the open one for soil, the closed one for a fluid.
    const from = (plus === soil) ? 1 : -1;
    out.push({ wall: w, dir: from > 0 ? -1 : 1 });
  }
  return { pushed: out, lone };
}

function pressureOn(model: SpecialModel, pushed: Pushed[], top: number, p: (depth: number) => number) {
  const out: Array<{ nodeId: number; fx: number; fy: number; fz: number }> = [];
  for (const { wall: w, dir } of pushed) {
    const f = consistentPressure(w.pts, top, p);
    w.nodes.forEach((id, i) => {
      const fi = f[i]!;
      if (fi > 1e-9 && model.nodes.has(id)) out.push({ nodeId: id, fx: dir * fi * w.n[0], fy: dir * fi * w.n[1], fz: 0 });
    });
  }
  return out;
}

export function specialLoads(model: SpecialModel, i: { thermal?: ThermalInput; soil?: SoilInput; fluid?: FluidInput }): SpecialLoads {
  const out: SpecialLoads = { thermal: [], soil: [], fluid: [], fluidBottom: [], derivation: [], notes: [] };
  if (i.thermal && (i.thermal.dtUniform !== 0 || i.thermal.dtGradient !== 0)) {
    const { dtUniform, dtGradient } = i.thermal;
    for (const e of model.elements.values()) out.thermal.push({ elementId: e.id, dtUniform, dtGradient: e.type === 'truss' ? 0 : dtGradient });
    for (const q of model.quads?.values() ?? []) out.thermal.push({ quadId: q.id, dtUniform, dtGradient });
    out.derivation.push(msg('loadPlan.derivation.thermal', { dt: dtUniform, grad: dtGradient, members: model.elements.size, shells: model.quads?.size ?? 0 }));
  }
  const ws = (i.soil || i.fluid) ? walls(model) : [];
  // How far a line must go to leave the plan.
  const all = [...model.nodes.values()];
  const reach = all.length ? 10 * (Math.max(...all.map((n) => n.x)) - Math.min(...all.map((n) => n.x)) + Math.max(...all.map((n) => n.y)) - Math.min(...all.map((n) => n.y))) + 100 : 100;
  if (i.soil) {
    const s = i.soil;
    const w = pushedWalls(ws, s.gradeZ, s.side, true, reach);
    out.soil = pressureOn(model, w.pushed, s.gradeZ, (d) => s.k * (s.gamma * d + s.surcharge));
    if (w.lone > 0) out.notes.push(msg('loadPlan.note.soilSideUnknown', { n: w.lone }));
    if (out.soil.length === 0) out.notes.push(msg('loadPlan.note.noSoilWalls', { z: round(s.gradeZ, 2) }));
    else out.derivation.push(msg('loadPlan.derivation.soil', { k: s.k, gamma: s.gamma, q: s.surcharge, z: round(s.gradeZ, 2), total: round(out.soil.reduce((t, n) => t + Math.hypot(n.fx, n.fy), 0), 1) }));
  }
  if (i.fluid) {
    const f = i.fluid;
    const w = pushedWalls(ws, f.levelZ, f.inside, false, reach);
    out.fluid = pressureOn(model, w.pushed, f.levelZ, (d) => f.gamma * d);
    if (w.lone > 0) out.notes.push(msg('loadPlan.note.fluidSideUnknown', { n: w.lone }));
    const around = ws.filter((x) => x.zMin < f.levelZ - 1e-6);
    for (const q of model.quads?.values() ?? []) {
      const p = q.nodes.map((id) => model.nodes.get(id)).filter((x): x is NonNullable<typeof x> => !!x);
      if (p.length < 3) continue;
      const zs = p.map(Z);
      if (Math.max(...zs) - Math.min(...zs) > 1e-3) continue;
      const depth = f.levelZ - zs[0]!;
      if (!(depth > 0)) continue;
      // Only a bottom of the fluid: seen from the point inside, or closed in by walls.
      const c: V2 = [p.reduce((t, x) => t + x.x, 0) / p.length, p.reduce((t, x) => t + x.y, 0) / p.length];
      const holds = f.inside ? !blockedBy([f.inside.x, f.inside.y], c, around) : enclosed(c, around, reach);
      if (holds) out.fluidBottom.push({ quadId: q.id, q: f.gamma * depth });
    }
    if (out.fluid.length === 0 && out.fluidBottom.length === 0) out.notes.push(msg('loadPlan.note.noFluidShells', { z: round(f.levelZ, 2) }));
    else out.derivation.push(msg('loadPlan.derivation.fluid', { gamma: f.gamma, z: round(f.levelZ, 2), walls: out.fluid.length, bottom: out.fluidBottom.length }));
  }
  return out;
}
