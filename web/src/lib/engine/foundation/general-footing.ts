/**
 * The footings the isolated path does not take: combined under several columns, strips under a
 * wall, pile caps, any footing turned in plan, and an isolated one whose base lifts in part. Each
 * is checked as a rigid base (`rigid-footing.ts`) or on its piles (`pile-cap.ts`) for every
 * strength combination, and its two mats are laid out from the worst of them.
 *
 * ── How the loads reach the footing ─────────────────────────────
 *
 * The centroid is the first node plus the eccentricity along the footing's own axes, the reading
 * `presize.ts` writes: u = (cos θ, sin θ) along B, v = (−sin θ, cos θ) along L. Every supported
 * node is placed in those axes, and its reaction moments, taken as the isolated path takes them
 * (my shifts the resultant along X, mx along Y), are turned with the footing. As the isolated path
 * does, both orientations of the moments are checked, since a reaction's sign depends on the
 * support it was read at.
 *
 * Bearing is a service check on the gravity cases at unit factors plus the footing's weight;
 * strength on each combination's factored reactions. Pure; kN, m, kPa.
 */
import { checkRigidFooting, type Post, type RigidFootingResult } from './rigid-footing';
import { checkPileCap, type PileCapResult } from './pile-cap';
import { pileCentres } from '../../model/foundation/piles';
import { serviceGravity } from '../detailing/service-reaction';
import { buildStraightBarWithHooks, type BarPath } from '../../codes/cirsoc201/bar-geometry';
import type { ClauseRef, RegulationEdition } from '../../codes/regulation';
import type { BearingResult, CheckStatus, FootingCheck, OneWayShearResult } from '../detailing/foundation-check';
import type { PunchingCheck } from '../detailing/punching-shear';
import type { Footing } from '../../model/footing';
import type { NodeReactions, FootingColumn, FootingNode } from '../detailing/run-footing-design';

export interface GeneralFootingInput {
  footing: Footing;
  nodes: ReadonlyMap<number, FootingNode>;
  reactions: ReadonlyMap<number, NodeReactions>;
  /** The column on each supported node, where there is one. */
  columnAt: (nodeId: number) => FootingColumn | undefined;
  /** A strip's wall thickness, m. */
  wallThickness?: number;
  fc: number; fy: number;
  /** Soil allowable pressure, kPa; null for a pile cap. */
  allowable: number | null;
  /** The edge pressure may reach this many times the allowable while the mean stays under it. */
  edgeFactor?: number;
  /** One pile's allowable capacity, kN, for a pile cap. */
  pileCapacity?: number;
  barDiameterMm: { x: number; y: number };
  edition: RegulationEdition;
}

export type GeneralRefusal = 'noNodes' | 'noReaction' | 'noService' | 'noPiles' | 'noBearing';

export interface MatLayer { diameterMm: number; spacing: number; count: number; area: number; required: number }

export interface GeneralFootingDesign {
  kind: Footing['kind'];
  /** Worst result over the combinations, and the one it came from. */
  result: { rigid: RigidFootingResult } | { cap: PileCapResult };
  governing: string;
  utilization: number;
  /** Required over provided steel, worst layer: under 1 always for laid-out bars, checked for fixed ones. */
  flexure: number;
  /** Bottom and top mats along local x and y; top only where a negative moment asks for it. */
  mats: { bottomX: MatLayer; bottomY: MatLayer; topX: MatLayer | null; topY: MatLayer | null };
  bars: BarPath[];
  /** Local frame: centroid in model coordinates and the angle of B, radians. */
  frame: { cx: number; cy: number; theta: number };
  /** Supported nodes in local coordinates. */
  posts: Array<{ nodeId: number; x: number; y: number }>;
}

/** The footing's local frame and a node placed in it. */
export function footingFrame(f: Footing, n0: FootingNode) {
  const theta = (f.rotationDeg * Math.PI) / 180, c = Math.cos(theta), s = Math.sin(theta);
  const cx = n0.x + f.eccentricityB * c - f.eccentricityL * s, cy = n0.y + f.eccentricityB * s + f.eccentricityL * c;
  const toLocal = (p: { x: number; y: number }) => ({ x: (p.x - cx) * c + (p.y - cy) * s, y: -(p.x - cx) * s + (p.y - cy) * c });
  const toGlobal = (x: number, y: number) => ({ x: cx + x * c - y * s, y: cy + x * s + y * c });
  // Reaction moments as a shift (my along X, mx along Y), turned into the footing's axes.
  const moments = (mx: number, my: number) => ({ My: my * c + mx * s, Mx: -my * s + mx * c });
  return { cx, cy, theta, toLocal, toGlobal, moments };
}

const TOP_MIN = 1e-5;

/** Bars of one area over a width: the preferred diameter at a spacing rounded down to 2,5 cm, 10 to 30 cm. */
export function layOut(required: number, width: number, thickness: number, diameterMm: number): MatLayer {
  const a = (Math.PI * (diameterMm / 1000) ** 2) / 4;
  const sMax = Math.min(0.3, 3 * thickness);
  const s = required > 0 ? Math.max(0.1, Math.min(sMax, Math.floor(((a * width) / required) * 40 + 1e-9) / 40)) : sMax;
  const count = Math.max(2, Math.floor(width / s) + 1);
  return { diameterMm, spacing: s, count, area: count * a, required };
}

/** A layer fixed by hand, over the width it spans. */
export function fixedLayer(spec: { diameterMm: number; spacing: number }, required: number, width: number): MatLayer {
  const a = (Math.PI * (spec.diameterMm / 1000) ** 2) / 4, count = Math.max(2, Math.floor(width / spec.spacing + 1e-9) + 1);
  return { diameterMm: spec.diameterMm, spacing: spec.spacing, count, area: count * a, required };
}

export function designGeneralFooting(i: GeneralFootingInput): GeneralFootingDesign | { refused: GeneralRefusal } {
  const f = i.footing;
  const ids = [f.nodeId, ...(f.supportedNodeIds ?? [])];
  const n0 = i.nodes.get(f.nodeId);
  if (!n0 || ids.some((id) => !i.nodes.has(id))) return { refused: 'noNodes' };
  if (ids.some((id) => !(i.reactions.get(id)?.factored.length))) return { refused: 'noReaction' };
  const fr = footingFrame(f, n0);
  const at = ids.map((id) => ({ nodeId: id, ...fr.toLocal(i.nodes.get(id)!) }));

  const service = ids.map((id) => { const c = i.reactions.get(id)!.cases; return c ? serviceGravity(c) : null; });
  if (service.some((s) => !s)) return { refused: 'noService' };
  const combos = [...new Map(ids.flatMap((id) => i.reactions.get(id)!.factored.map((c) => [c.combinationId, c.combinationName] as const))).entries()];
  const factoredOf = (k: number, combo: number) => i.reactions.get(ids[k]!)!.factored.find((c) => c.combinationId === combo);

  // Each supported node a post: its column, or for a strip the wall's share of its length.
  const strip = f.kind === 'strip';
  const xs = at.map((p) => p.x).sort((a, b) => a - b);
  const share = (x: number) => {
    const k = xs.indexOf(x), lo = k > 0 ? (x + xs[k - 1]!) / 2 : Math.max(-f.B / 2, x - 0.25), hi = k < xs.length - 1 ? (x + xs[k + 1]!) / 2 : Math.min(f.B / 2, x + 0.25);
    return Math.max(0.05, hi - lo);
  };
  const size = (k: number) => {
    if (strip) return { cx: share(at[k]!.x), cy: i.wallThickness ?? 0.2 };
    const col = i.columnAt(ids[k]!);
    return { cx: col?.b ?? 0.3, cy: col?.h ?? 0.3 };
  };
  const nodePosts = (combo: number, sign: 1 | -1): Post[] => at.map((p, k) => {
    const s = service[k]!, u = factoredOf(k, combo);
    const sm = fr.moments(s.mx, s.my), um = fr.moments(u?.mx ?? 0, u?.my ?? 0);
    return {
      id: `N${p.nodeId}`, x: p.x, y: p.y, ...size(k), wall: strip,
      service: { N: s.axial, Mx: sign * sm.Mx, My: sign * sm.My },
      factored: { N: Math.abs(u?.fz ?? 0), Mx: sign * um.Mx, My: sign * um.My },
    };
  });
  /**
   * A strip under a wall carries the wall, not its feet one by one: the wall, stiff in its own
   * plane, spreads along the strip what the analysis gave its feet (more under a column, less
   * between), as a wall footing is designed per metre of wall. Its feet are one length of wall
   * over the whole strip, at their resultant across it; what lay along it is the wall's.
   */
  const wallSpread = strip && i.wallThickness !== undefined;
  const postsFor = (combo: number, sign: 1 | -1): Post[] => {
    const posts = nodePosts(combo, sign);
    if (!wallSpread || posts.length === 0) return posts;
    const one = (key: 'service' | 'factored') => {
      const N = posts.reduce((t, p) => t + p[key].N, 0);
      const y = N > 0 ? posts.reduce((t, p) => t + p[key].N * p.y, 0) / N : posts.reduce((t, p) => t + p.y, 0) / posts.length;
      return { N, y, Mx: posts.reduce((t, p) => t + p[key].Mx + p[key].N * (p.y - y), 0) };
    };
    const s = one('service'), u = one('factored');
    return [{
      id: 'wall', x: 0, y: s.y, cx: f.B, cy: i.wallThickness!, wall: true,
      service: { N: s.N, Mx: s.Mx, My: 0 },
      factored: { N: u.N, Mx: u.Mx + u.N * (u.y - s.y), My: 0 },
    }];
  };

  let best: { util: number; name: string; result: GeneralFootingDesign['result'] } | null = null;
  let need = { bx: 0, by: 0, tx: 0, ty: 0 };
  if (f.kind === 'pileCap') {
    if (!f.piles || !(f.piles.count > 0) || !(i.pileCapacity! > 0)) return { refused: 'noPiles' };
    const piles = pileCentres(f.piles).map(([x, y]) => ({ x, y }));
    const col = i.columnAt(f.nodeId);
    for (const [combo, name] of combos) for (const sign of [1, -1] as const) {
      const posts = postsFor(combo, sign), p0 = at[0]!;
      const sum = (key: 'service' | 'factored') => posts.reduce((a, p) => ({
        N: a.N + p[key].N, My: a.My + p[key].My + p[key].N * (p.x - p0.x), Mx: a.Mx + p[key].Mx + p[key].N * (p.y - p0.y),
      }), { N: 0, My: 0, Mx: 0 });
      const r = checkPileCap({
        B: f.B, L: f.L, thickness: f.thickness, cover: f.cover, fc: i.fc, fy: i.fy, piles, pileDiameter: f.piles.diameter,
        pileCapacity: i.pileCapacity!, column: { x: p0.x, y: p0.y, cx: col?.b ?? 0.3, cy: col?.h ?? 0.3 },
        service: sum('service'), factored: sum('factored'),
      });
      need = { bx: Math.max(need.bx, r.x.as), by: Math.max(need.by, r.y.as), tx: 0, ty: 0 };
      if (!best || r.utilization > best.util) best = { util: r.utilization, name, result: { cap: r } };
    }
  } else {
    if (!(i.allowable! > 0)) return { refused: 'noBearing' };
    for (const [combo, name] of combos) for (const sign of [1, -1] as const) {
      const r = checkRigidFooting({
        B: f.B, L: f.L, thickness: f.thickness, cover: f.cover, fc: i.fc, fy: i.fy, allowable: i.allowable!, ...(i.edgeFactor ? { edgeFactor: i.edgeFactor } : {}),
        posts: postsFor(combo, sign), surcharge: 25 * f.thickness,
      });
      need = { bx: Math.max(need.bx, r.x.asBottom), by: Math.max(need.by, r.y.asBottom), tx: Math.max(need.tx, r.x.asTop), ty: Math.max(need.ty, r.y.asTop) };
      if (!best || r.utilization > best.util) best = { util: r.utilization, name, result: { rigid: r } };
    }
  }
  const fixed = f.mats;
  const mats = fixed ? {
    bottomX: fixedLayer(fixed.bottomX, need.bx, f.L), bottomY: fixedLayer(fixed.bottomY, need.by, f.B),
    topX: fixed.topX ? fixedLayer(fixed.topX, need.tx, f.L) : null, topY: fixed.topY ? fixedLayer(fixed.topY, need.ty, f.B) : null,
  } : {
    bottomX: layOut(need.bx, f.L, f.thickness, i.barDiameterMm.x),
    bottomY: layOut(need.by, f.B, f.thickness, i.barDiameterMm.y),
    // Under 0,1 cm² is the integration's noise around a zero moment, not a top mat.
    topX: need.tx > TOP_MIN ? layOut(need.tx, f.L, f.thickness, i.barDiameterMm.x) : null,
    topY: need.ty > TOP_MIN ? layOut(need.ty, f.B, f.thickness, i.barDiameterMm.y) : null,
  };
  // Fixed bars answer to the demand: a missing top mat where one is asked for counts as none.
  const ratio = (l: MatLayer | null, req: number) => (req > TOP_MIN ? req / Math.max(l?.area ?? 0, 1e-12) : 0);
  const flexure = Math.max(ratio(mats.bottomX, need.bx), ratio(mats.bottomY, need.by), ratio(mats.topX, need.tx), ratio(mats.topY, need.ty));
  return {
    kind: f.kind, result: best!.result, governing: best!.name, utilization: Math.max(best!.util, flexure), flexure, mats,
    bars: footingBars(f, fr, mats, ids.map((id) => i.columnAt(id)?.elementId).filter((e): e is number => e !== undefined), i.edition), frame: { cx: fr.cx, cy: fr.cy, theta: fr.theta },
    posts: at,
  };
}

/** The mats as bars: straight along each local axis, hooked up (bottom) or down (top) at both ends. */
export function footingBars(
  f: Footing, fr: ReturnType<typeof footingFrame>, mats: GeneralFootingDesign['mats'], owners: number[], edition: RegulationEdition,
): BarPath[] {
  const bars: BarPath[] = [];
  const z0 = f.foundingElevation, c = Math.cos(fr.theta), s = Math.sin(fr.theta);
  const put = (layer: MatLayer | null, dir: 'x' | 'y', face: 'bottom' | 'top', below: number) => {
    if (!layer) return;
    const db = layer.diameterMm / 1000;
    const z = face === 'bottom' ? z0 + f.cover + below + db / 2 : z0 + f.thickness - f.cover - below - db / 2;
    const [len, wid] = dir === 'x' ? [f.B, f.L] : [f.L, f.B];
    const a0 = -len / 2 + f.cover, a1 = len / 2 - f.cover, w0 = -wid / 2 + f.cover + db / 2;
    const step = (wid - 2 * f.cover - db) / Math.max(1, layer.count - 1);
    for (let k = 0; k < layer.count; k++) {
      const w = w0 + k * step;
      const p = (a: number) => (dir === 'x' ? fr.toGlobal(a, w) : fr.toGlobal(w, a));
      const start = p(a0), end = p(a1);
      bars.push(buildStraightBarWithHooks({
        id: `F${f.id}-${face === 'bottom' ? 'B' : 'T'}${dir.toUpperCase()}-${k}`, diameterMm: layer.diameterMm, role: 'longitudinal',
        start: { ...start, z }, end: { ...end, z },
        axis: dir === 'x' ? { x: c, y: s, z: 0 } : { x: -s, y: c, z: 0 },
        hookNormal: { x: 0, y: 0, z: face === 'bottom' ? 1 : -1 }, startHook: 90, endHook: 90,
        ownerElementIds: owners, edition,
      }));
    }
  };
  put(mats.bottomX, 'x', 'bottom', 0);
  put(mats.bottomY, 'y', 'bottom', mats.bottomX.diameterMm / 1000);
  put(mats.topX, 'x', 'top', 0);
  put(mats.topY, 'y', 'top', (mats.topX?.diameterMm ?? 0) / 1000);
  return bars;
}

/**
 * The general design in the shape the isolated check has, so the record, the assembly and the
 * transverse requirement read it as they read any footing. A pile cap's «bearing» is its most
 * loaded pile against its capacity, kN, and the record says so.
 */
export function asFootingCheck(g: GeneralFootingDesign, refs: ClauseRef[]): FootingCheck {
  const st = (u: number): CheckStatus => (u <= 1 + 1e-9 ? 'OK' : 'FAIL');
  const base = { memo: [] as string[], refs };
  let bearing: BearingResult, x: { vu: number; phiVc: number; utilization: number }, y: typeof x, punch: PunchingCheck[], Mu: number;
  if ('cap' in g.result) {
    const c = g.result.cap;
    bearing = {
      status: c.piles.tension ? 'FAIL' : st(c.piles.utilization), qMax: c.piles.max, qMin: c.piles.min, eB: 0, eL: 0,
      geometricOffsetB: 0, geometricOffsetL: 0, momentEccentricityB: 0, momentEccentricityL: 0,
      uplift: c.piles.tension, utilization: c.piles.tension ? Infinity : c.piles.utilization, ...base,
    };
    x = c.x.shear; y = c.y.shear; punch = c.punching.checks; Mu = Math.max(c.x.mu, c.y.mu);
  } else {
    const r = g.result.rigid, P = r.service.plane;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => r.service.at(a! * 1e9, b! * 1e9));
    bearing = {
      status: r.bearing.ok ? 'OK' : 'FAIL', qMax: r.bearing.qMax, qMin: Math.min(0, ...corners, P.a), eB: r.service.eB, eL: r.service.eL,
      geometricOffsetB: 0, geometricOffsetL: 0, momentEccentricityB: Math.abs(r.service.eB), momentEccentricityL: Math.abs(r.service.eL),
      uplift: r.bearing.contact < 1 - 1e-9, utilization: r.bearing.ok ? r.bearing.utilization : Math.max(r.bearing.utilization, 1.0001), ...base,
    };
    x = r.x.shear; y = r.y.shear; punch = r.punching.map((p) => p.check); Mu = Math.max(r.x.mPos, r.y.mPos);
  }
  const sh = x.utilization >= y.utilization ? x : y;
  const oneWayShear: OneWayShearResult = {
    status: st(sh.utilization), Vu: sh.vu, phiVc: sh.phiVc, utilization: sh.utilization,
    governingSide: null, cantilever: 0, qSection: 0, qEdge: 0, ...base,
  };
  const punching = punch.reduce<PunchingCheck | null>((w, p) => (!w || p.utilization > w.utilization ? p : w), null);
  return {
    status: st(g.utilization), bearing, oneWayShear, punching, Mu, MuSide: null, MuCantilever: 0, MuQFace: 0, MuQEdge: 0,
    punchingLoadInsidePerimeter: 0, worstUtilization: g.utilization, ...base, unsupported: [],
  };
}
