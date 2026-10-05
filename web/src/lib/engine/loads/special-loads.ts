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
 * ── The pressure ─────────────────────────────────────────────────
 *
 * Each wall pushed takes a surface load: horizontal along its normal, linear in depth below the
 * grade or the level and nothing above it (`shell-load-integration.ts`, the one integral of every
 * shell load, with the consistent nodal forces whose total and moment are exact for a pressure
 * linear in depth). It used to be written as nodal forces, which no table, drawing or edit could
 * read back as a pressure; before that each node took p(its own depth) times a quarter of the
 * area, which lost the moment of a one-quad-high wall about its base.
 *
 * Pure: no store.
 */
import { msg, round, type EngineMessage } from '../../codes/message';
import { shellLoadForces } from '../shell-load-integration';

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
  /** The walls the soil pushes, each a surface load (see the header). */
  soil: WallPressure[];
  fluid: WallPressure[];
  fluidBottom: Array<{ quadId: number; q: number }>;
  derivation: EngineMessage[];
  notes: EngineMessage[];
}

/** A horizontal pressure on a wall: along `dir`, q₁ at the top c₁ and q₂ at c₂ below, nothing above. */
export interface WallPressure {
  quadId: number;
  dir: [number, number, number];
  vary: { dir: [number, number, number]; c1: number; q1: number; c2: number; q2: number };
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

/** Each wall pushed, a pressure linear in depth p(d) = p0 + p1·d below `top`. */
function pressureOn(pushed: Pushed[], top: number, p0: number, p1: number): WallPressure[] {
  return pushed.map(({ wall: w, dir }) => ({
    quadId: w.quadId,
    dir: [dir * w.n[0], dir * w.n[1], 0],
    vary: { dir: [0, 0, 1], c1: top, q1: p0, c2: w.zMin, q2: p0 + p1 * (top - w.zMin) },
  }));
}

/** The nodal forces of wall pressures: what the solve applies, for a total or a check. */
export function wallPressureForces(model: SpecialModel, ps: readonly WallPressure[]): Array<{ nodeId: number; fx: number; fy: number; fz: number }> {
  const out: Array<{ nodeId: number; fx: number; fy: number; fz: number }> = [];
  for (const p of ps) {
    const q = model.quads?.get(p.quadId);
    const pts = q?.nodes.map((id) => model.nodes.get(id));
    if (!q || !pts || pts.some((x) => !x)) continue;
    const r = shellLoadForces('quad', pts as never, { q: 0, frame: 'global', dir: p.dir, vary: p.vary });
    r?.forces.forEach((f, i) => out.push({ nodeId: q.nodes[i]!, fx: f[0], fy: f[1], fz: f[2] }));
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
    out.soil = pressureOn(w.pushed, s.gradeZ, s.k * s.surcharge, s.k * s.gamma);
    if (w.lone > 0) out.notes.push(msg('loadPlan.note.soilSideUnknown', { n: w.lone }));
    if (out.soil.length === 0) out.notes.push(msg('loadPlan.note.noSoilWalls', { z: round(s.gradeZ, 2) }));
    else out.derivation.push(msg('loadPlan.derivation.soil', { k: s.k, gamma: s.gamma, q: s.surcharge, z: round(s.gradeZ, 2), total: round(wallPressureForces(model, out.soil).reduce((t, n) => t + Math.hypot(n.fx, n.fy), 0), 1) }));
  }
  if (i.fluid) {
    const f = i.fluid;
    const w = pushedWalls(ws, f.levelZ, f.inside, false, reach);
    out.fluid = pressureOn(w.pushed, f.levelZ, 0, f.gamma);
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
