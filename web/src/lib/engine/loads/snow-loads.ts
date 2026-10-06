/**
 * Snow load cases on the model's roof, from CIRSOC 104-2005 (`codes/cirsoc104/snow.ts`).
 *
 *   · one balanced case, p_s on every roof member;
 *   · on a gable roof that §6.1 asks it of, two unbalanced cases, one per wind direction across
 *     the ridge: the leeward slope at the unbalanced load, the windward slope at 0,3·p_s (or
 *     unloaded where W ≤ 6 m). A member on the ridge itself collects from both slopes, so it
 *     takes their mean either way; it used to take the windward value in both directions.
 *
 * ── Each surface its own C_s ──────────────────────────────────────
 *
 * p_s = C_s p_f is read for the slope of the surface each member carries (`surfaceSlopes`): a
 * sloped member its own slope, a level one on a sloped roof (a purlin, a ridge, an eave between
 * rafters) the slope of the rafters it joins, and any other level member, or a panel the beams
 * close, a flat roof. It used to be one p_s, from the mean slope of the sloped members, on every
 * roof member: a flat lower roof beside a 25° smooth roof took the 25° roof's C_s of 0,69. The
 * drifts read h_b from the lower roof's own p_s, and the partial loads arrange the per-surface
 * values. A slope the reader gives (`roofSlopeDeg`) is still the one slope of the whole roof.
 *
 * The roof members are the ones wind loads (`wind-cases.ts`), with the tributary width the
 * gravity loads use. Snow acts on the horizontal projection (Cap. 4), so on a member of slope θ
 * the load per metre of member is w·cos θ: its component normal to the member, w·cos²θ, goes on
 * the member's local z, and the component along it goes to the two end nodes as forces along
 * the member, half each — the member's end forces are exact, and the axial force inside it is
 * read as constant rather than linear.
 *
 * The ridge and W come from the roof's geometry: the slope axis is the horizontal direction
 * the sloped roof members run along, the ridge is where the roof nodes are highest, and W is
 * the largest horizontal distance from it to an eave.
 *
 * ── By panels ─────────────────────────────────────────────────────
 *
 * When the plan loads area loads by the panels the beams close (`plan-gravity.ts`), snow goes the
 * same way: on the roof panels by tributary area and, where the width is used, on the roof
 * members, vertical per metre of projection. Then the drifts at steps and the snow sliding off a
 * higher roof (`snow-drift-loads.ts`) are added to the balanced case, as CIRSOC 104 §7.1 and Cap. 9
 * superpose them on the balanced snow.
 *
 * Pure: no store.
 */
import { roofMembers, type WindModel } from './wind-cases';
import type { GravityLayout, GravityModel } from './plan-gravity';
import { driftAndSlidingLoads } from './snow-drift-loads';
import { layoutSpans, layoutUnits, partialSnowPatterns, type Unit } from './plan-spans';
import { shapedSnow } from './snow-shapes';
import { msg, round, type EngineMessage } from '../../codes/message';
import type { ClauseRef } from '../../codes/regulation';
import { roofSnow, type SnowInputs, type SnowResult } from '../../codes/cirsoc104/snow';
import { clause } from '../../codes/regulation';

const REF_PARTIAL = clause('cirsoc-104', '2005', '5.1', 'sistemas de vigas continuas');

type Axis = 'x' | 'y';

export interface SnowCaseLoads {
  nameKey: string;
  nameParams: Record<string, string | number>;
  /** A partial load of Cap. 5: an arrangement of the balanced snow (see LoadCase.pattern). */
  pattern?: boolean;
  /** Along local z, unless `frame` says global Z per metre of projection. */
  distributed: Array<{ elementId: number; q: number; qJ?: number; a?: number; b?: number; frame?: 'projected' }>;
  nodal: Array<{ nodeId: number; fx: number; fy: number; fz: number }>;
}

export interface RoofGeometry {
  axis: Axis;
  ridge: number;
  W: number;
  /** The mean slope of the sloped roof members, degrees; 0 for a flat roof. */
  slopeDeg: number;
}

const Z = (n: { z?: number }) => n.z ?? 0;

/** Slope axis, ridge and W of the roof members (see the header). */
export function roofGeometry(model: WindModel): RoofGeometry | null {
  const roof = roofMembers(model);
  if (roof.length === 0) return null;
  let ax = 0, ay = 0, slopeSum = 0, sloped = 0;
  for (const m of roof) {
    const s = Math.abs(m.dz) / Math.max(m.lh, 1e-9);
    if (s > Math.tan((1 * Math.PI) / 180)) {
      ax += Math.abs(m.dx); ay += Math.abs(m.dy);
      slopeSum += (Math.atan(s) * 180) / Math.PI; sloped++;
    }
  }
  const nodes = new Set<number>();
  for (const e of model.elements.values()) if (roof.some((r) => r.id === e.id)) { nodes.add(e.nodeI); nodes.add(e.nodeJ); }
  const pts = [...nodes].map((id) => model.nodes.get(id)!).filter(Boolean);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  // A flat roof has no slope axis: take the longer plan side as across the ridge, for W.
  const axis: Axis = sloped > 0 ? (ax >= ay ? 'x' : 'y')
    : (Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? 'y' : 'x');
  const coord = (p: { x: number; y: number }) => (axis === 'x' ? p.x : p.y);
  const zMax = Math.max(...pts.map(Z));
  const top = pts.filter((p) => Z(p) > zMax - 0.05);
  const ridge = top.reduce((s, p) => s + coord(p), 0) / top.length;
  const lo = Math.min(...pts.map(coord)), hi = Math.max(...pts.map(coord));
  const W = Math.max(ridge - lo, hi - ridge);
  return { axis, ridge, W, slopeDeg: sloped > 0 ? slopeSum / sloped : 0 };
}

const SLOPED = Math.tan((1 * Math.PI) / 180);

/**
 * The slope of the roof surface each roof member carries snow from, degrees (see the header). A
 * level member lies on a sloped surface when sloped roof members leave both its ends across it
 * in plan, and then takes their mean slope.
 */
export function surfaceSlopes(model: WindModel): Map<number, number> {
  const roof = roofMembers(model);
  const isSloped = (m: { dz: number; lh: number }) => Math.abs(m.dz) / Math.max(m.lh, 1e-9) > SLOPED;
  const deg = (m: { dz: number; lh: number }) => (Math.atan(Math.abs(m.dz) / Math.max(m.lh, 1e-9)) * 180) / Math.PI;
  const sloped = roof.filter(isSloped);
  const out = new Map<number, number>();
  for (const m of roof) {
    if (isSloped(m)) { out.set(m.id, deg(m)); continue; }
    const e = model.elements.get(m.id)!;
    const acrossAt = (node: number) => sloped.filter((r) => {
      const re = model.elements.get(r.id)!;
      if (re.nodeI !== node && re.nodeJ !== node) return false;
      // Across: their plans more than 30° apart.
      return Math.abs(m.dx * r.dy - m.dy * r.dx) > 0.5 * Math.max(m.lh, 1e-9) * Math.max(r.lh, 1e-9);
    });
    const atI = acrossAt(e.nodeI), atJ = acrossAt(e.nodeJ);
    const on = atI.length > 0 && atJ.length > 0 ? [...atI, ...atJ] : [];
    out.set(m.id, on.length ? on.reduce((s, r) => s + deg(r), 0) / on.length : 0);
  }
  return out;
}

/** An intensity on a member, kN/m² of horizontal projection: one value, or one at each end. */
type Intensity = number | [number, number];
const ends = (p: Intensity): [number, number] => (typeof p === 'number' ? [p, p] : p);

/** Loads of `p` (kN/m² on the horizontal projection) on the given roof members. */
function projectionLoads(
  model: WindModel, ids: Set<number>, pOf: (mid: number) => Intensity, tributaryWidth: number,
): Pick<SnowCaseLoads, 'distributed' | 'nodal'> {
  const distributed: SnowCaseLoads['distributed'] = [];
  const nodal: SnowCaseLoads['nodal'] = [];
  for (const e of model.elements.values()) {
    if (!ids.has(e.id)) continue;
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const dx = b.x - a.x, dy = b.y - a.y, dz = Z(b) - Z(a);
    const L = Math.hypot(dx, dy, dz), Lh = Math.hypot(dx, dy);
    const [pI, pJ] = ends(pOf(e.id));
    if (!(pI > 0 || pJ > 0) || L < 1e-9) continue;
    const cos = Lh / L;
    // kN per metre of horizontal projection at each end, its normal part on the member's local z.
    const wI = pI * tributaryWidth, wJ = pJ * tributaryWidth;
    distributed.push({ elementId: e.id, q: -wI * cos * cos, ...(Math.abs(wJ - wI) > 1e-9 ? { qJ: -wJ * cos * cos } : {}) });
    // Along the member: the total vertical load's axial component, half to each end.
    const total = ((wI + wJ) / 2) * Lh;
    const ex = [dx / L, dy / L, dz / L];
    const fAx = -total * ex[2]!;           // gravity (−Z) projected on ex
    if (Math.abs(fAx) > 1e-9) {
      for (const id of [e.nodeI, e.nodeJ]) {
        nodal.push({ nodeId: id, fx: (fAx / 2) * ex[0]!, fy: (fAx / 2) * ex[1]!, fz: (fAx / 2) * ex[2]! });
      }
    }
  }
  return { distributed, nodal };
}

export interface SnowCasesInput {
  model: WindModel;
  snow: Omit<SnowInputs, 'roof'> & {
    /** `curved`, `multiple` (sawtooth, folded plates, a row of vaults) and `dome`: `snow-shapes.ts`. */
    roofKind: 'mono' | 'gable' | 'curved' | 'multiple' | 'dome'; slippery: boolean; roofSlopeDeg?: number;
    /** A curved roof abutting the ground or another roof at its eaves (§6.2, `snow-shapes.ts`). */
    abutting?: boolean;
    /** The partial loads of Cap. 5 on continuous systems, by panels (default on). */
    partial?: boolean;
    /** Parapets and separate higher structures within 6 m, for their drifts (`snow-drift-loads.ts`). */
    parapet?: import('./snow-drift-loads').DriftInputs['parapet'];
    adjacent?: import('./snow-drift-loads').DriftInputs['adjacent'];
  };
  tributaryWidth: number;
  /** The plan's panels, to load the snow by them (see the header). */
  layout?: GravityLayout;
}

/** Loads of `p` (kN/m² on the horizontal projection) on the roof panels and roof width members. */
function panelLoads(model: WindModel, layout: GravityLayout, pOf: (elementId: number, unit: Unit) => Intensity, tributaryWidth: number): SnowCaseLoads['distributed'] {
  const out: SnowCaseLoads['distributed'] = [];
  for (const pc of layout.pieces) {
    if (!pc.roof) continue;
    // A panel's piece is a stretch of a level: its intensity is the member's mean.
    const [pI, pJ] = ends(pOf(pc.elementId, { panel: pc.panel }));
    const p = (pI + pJ) / 2;
    if (!(p > 0)) continue;
    out.push({ elementId: pc.elementId, q: -p * pc.wI, qJ: -p * pc.wJ, ...(pc.a !== undefined ? { a: pc.a, b: pc.b } : {}), frame: 'projected' });
  }
  for (const w of layout.widthMembers) {
    if (!layout.roof.has(w.elementId) || !model.elements.has(w.elementId)) continue;
    const [pI, pJ] = ends(pOf(w.elementId, { member: w.elementId }));
    if (pI > 0 || pJ > 0) out.push({ elementId: w.elementId, q: -pI * tributaryWidth, ...(Math.abs(pJ - pI) > 1e-9 ? { qJ: -pJ * tributaryWidth } : {}), frame: 'projected' });
  }
  return out;
}

export function snowLoadCases(input: SnowCasesInput): {
  result: SnowResult; geometry: RoofGeometry; cases: SnowCaseLoads[]; derivation: EngineMessage[]; refs: ClauseRef[];
  /** The roof surfaces whose slope gives another p_s than `result`'s (see the header). */
  surfaces: Array<{ slopeDeg: number; cs: number; ps: number }>;
} | null {
  const geometry = roofGeometry(input.model);
  if (!geometry) return null;
  const slopeDeg = input.snow.roofSlopeDeg ?? geometry.slopeDeg;
  const kind = input.snow.roofKind;
  const shapedKind = kind === 'curved' || kind === 'multiple' || kind === 'dome';
  // A shaped roof takes p_f from (1) and its C_s point by point (`snow-shapes.ts`).
  const result = roofSnow({
    ...input.snow,
    roof: { kind: shapedKind ? 'mono' : kind, slopeDeg, W: geometry.W, slippery: input.snow.slippery },
  });
  if (result.refused) return { result, geometry, cases: [], derivation: [], refs: [], surfaces: [] };
  const roof = roofMembers(input.model);
  const all = new Set(roof.map((r) => r.id));
  const layout = input.layout;
  const on = (pOf: (id: number, unit?: Unit) => Intensity): Pick<SnowCaseLoads, 'distributed' | 'nodal'> => (layout
    ? { distributed: panelLoads(input.model, layout, pOf, input.tributaryWidth), nodal: [] }
    : projectionLoads(input.model, all, (id) => pOf(id), input.tributaryWidth));
  const derivation: EngineMessage[] = [], refs: ClauseRef[] = [];

  const roofNodes = [...new Set(roof.flatMap((r) => { const e = input.model.elements.get(r.id)!; return [e.nodeI, e.nodeJ]; }))]
    .map((id) => input.model.nodes.get(id)!).filter(Boolean);
  const shaped = shapedKind ? shapedSnow(roofNodes, {
    kind, pf: result.pf, ce: result.ce, ct: result.ct, slippery: input.snow.slippery, gamma: result.gamma, axis: geometry.axis,
    abutting: input.snow.abutting,
  }) : null;
  if (shaped) { derivation.push(...shaped.derivation); refs.push(...shaped.refs); }
  /** A plan-point intensity read at each end of a member. */
  const atEnds = (f: (pt: { x: number; y: number; z?: number }) => number) => (id: number): Intensity => {
    const e = input.model.elements.get(id);
    const a = e && input.model.nodes.get(e.nodeI), b = e && input.model.nodes.get(e.nodeJ);
    return a && b ? [f(a), f(b)] : 0;
  };
  // Each surface its own C_s (see the header), unless the reader gave the roof one slope.
  const slopes = input.snow.roofSlopeDeg === undefined ? surfaceSlopes(input.model) : null;
  const bySlope = new Map<number, SnowResult>();
  const used = new Set<number>();
  const surfaceAt = (deg: number): SnowResult => {
    const key = round(deg, 2);
    if (Math.abs(key - round(slopeDeg, 2)) < 1e-9) return result;
    let r = bySlope.get(key);
    if (!r) {
      r = roofSnow({ ...input.snow, roof: { kind: shapedKind ? 'mono' : kind, slopeDeg: key, W: geometry.W, slippery: input.snow.slippery } });
      bySlope.set(key, r);
    }
    return r;
  };
  // A panel the beams close is level: a flat roof.
  const psOf = (id: number, unit?: Unit): number => {
    if (!slopes) return result.ps;
    const deg = unit && 'panel' in unit ? 0 : slopes.get(id) ?? slopeDeg;
    used.add(round(deg, 2));
    return surfaceAt(deg).ps;
  };
  const balancedOf: (id: number, unit?: Unit) => Intensity = shaped
    ? atEnds((pt) => shaped.balanced(pt) + result.rainOnSnow)
    : psOf;
  const cases: SnowCaseLoads[] = [{
    nameKey: shaped ? 'snow.case.balancedShaped' : 'snow.case.balanced', nameParams: { ps: +(shaped ? result.pf : result.ps).toFixed(3) },
    ...on((id, u) => balancedOf(id, u)),
  }];
  if (layout) {
    // The drifts and the sliding snow land on panels, which are level: h_b reads the flat roof's p_s.
    const extra = driftAndSlidingLoads(input.model as GravityModel, layout, {
      pg: input.snow.pg, balanced: shaped || !slopes ? result.ps : surfaceAt(0).ps, pf: result.pf, slippery: input.snow.slippery,
      tributaryWidth: input.tributaryWidth, parapet: input.snow.parapet, adjacent: input.snow.adjacent,
    });
    cases[0]!.distributed.push(...extra.distributed);
    derivation.push(...extra.derivation);
    refs.push(...extra.refs);
    if (input.snow.partial !== false) {
      /*
       * Cap. 5. The spans perpendicular to the ridge of a gable roof steeper than 21/W + 0,5
       * degrees are exempt: those run along the roof's slope axis.
       */
      const steep = input.snow.roofKind === 'gable' && slopeDeg > 21 / Math.max(geometry.W, 1e-9) + 0.5;
      const units = layoutUnits(layout, (u) => ('panel' in u ? !!layout.panels[u.panel]?.roof : layout.roof.has(u.member)));
      const patterns = partialSnowPatterns(layoutSpans(input.model as GravityModel, layout), units, steep ? geometry.axis : undefined);
      for (const pt of patterns) {
        cases.push({
          nameKey: pt.snowCase === 3 ? 'snow.case.partialPair' : 'snow.case.partial', pattern: true,
          nameParams: { axis: pt.axis.toUpperCase(), c: pt.snowCase!, at: +(pt.at ?? 0).toFixed(2) },
          ...on((id, u) => { const f = u ? pt.factor(u) : 1; const [a, b] = ends(balancedOf(id, u)); return [a * f, b * f]; }),
        });
      }
      derivation.push(msg(patterns.length > 0 ? 'snow.derivation.partial' : 'snow.derivation.noPartial', { n: patterns.length }));
      if (steep) derivation.push(msg('snow.derivation.partialExempt', { axis: geometry.axis.toUpperCase(), slope: round(slopeDeg, 1), limit: round(21 / Math.max(geometry.W, 1e-9) + 0.5, 1) }));
      if (patterns.length > 0) refs.push(REF_PARTIAL);
    }
  }
  if (shaped) {
    for (const u of shaped.unbalanced) {
      cases.push({ nameKey: u.dir ? 'snow.case.unbalanced' : 'snow.case.unbalancedValleys', nameParams: { dir: u.dir }, ...on(atEnds(u.at)) });
    }
  } else if (result.unbalanced) {
    const mid = (id: number) => {
      const e = input.model.elements.get(id);
      const a = e && input.model.nodes.get(e.nodeI), b = e && input.model.nodes.get(e.nodeJ);
      return a && b ? (geometry.axis === 'x' ? (a.x + b.x) / 2 : (a.y + b.y) / 2) : geometry.ridge;
    };
    const side = new Map([...input.model.elements.keys()].map((id) => [id, mid(id) - geometry.ridge]));
    const { leeward: lee, windward: wind } = result.unbalanced;
    for (const sense of [1, -1] as const) {
      // Wind blowing toward +axis leaves the snow on the side beyond the ridge; a member on the
      // ridge collects from both slopes, the same either way.
      const at = (id: number) => {
        const s = side.get(id) ?? 0;
        return Math.abs(s) <= 0.01 ? (lee + wind) / 2 : s * sense > 0 ? lee : wind;
      };
      cases.push({
        nameKey: 'snow.case.unbalanced',
        nameParams: { dir: `${sense > 0 ? '+' : '−'}${geometry.axis.toUpperCase()}` },
        ...on(at),
      });
    }
  }
  const surfaces = [...bySlope.entries()].filter(([slope, r]) => used.has(slope) && Math.abs(r.ps - result.ps) > 1e-9)
    .sort((a, b) => a[0] - b[0]).map(([slope, r]) => ({ slopeDeg: slope, cs: r.cs, ps: r.ps }));
  return { result, geometry, cases, derivation, refs, surfaces: shaped ? [] : surfaces };
}
