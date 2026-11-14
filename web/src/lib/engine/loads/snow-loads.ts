import { roofMembers, type WindModel } from './wind-cases';
import { roofSurfaceModel } from './snow-roof-surfaces';
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

function roofSpans(model: GravityModel, layout: GravityLayout, geometry: RoofGeometry) {
  const local = (x: number, y: number): [number, number] => [(x - geometry.origin.x) * geometry.direction[0] + (y - geometry.origin.y) * geometry.direction[1], -(x - geometry.origin.x) * geometry.direction[1] + (y - geometry.origin.y) * geometry.direction[0]];
  const nodes = new Map([...model.nodes].map(([id, p]) => { const [x, y] = local(p.x, p.y); return [id, { ...p, x, y }]; }));
  const panels = layout.panels.map(p => ({ ...p, polygon: p.polygon.map(v => local(...v)) }));
  return layoutSpans({ ...model, nodes }, { ...layout, panels });
}

export interface SnowCaseLoads {
  nameKey: string;
  nameParams: Record<string, string | number>;
  pattern?: boolean;
  distributed: Array<{ elementId: number; q: number; qJ?: number; a?: number; b?: number; frame?: 'projected' }>;
  nodal: Array<{ nodeId: number; fx: number; fy: number; fz: number; carrier?: number }>;
}

export interface RoofGeometry {
  axis: Axis;
  ridge: number;
  W: number;
  slopeDeg: number;
  direction: [number, number];
  origin: { x: number; y: number };
}

const Z = (n: { z?: number }) => n.z ?? 0;

export function roofGeometry(model: WindModel, only?: ReadonlySet<number>, surfaces = roofSurfaceModel(model, only)): RoofGeometry | null {
  const roof = surfaces.roof;
  if (!roof.length) return null;
  const primary = surfaces.planes[0];
  const longest = [...roof].sort((a, b) => b.lh - a.lh)[0]!;
  const norm = primary ? Math.hypot(...primary.gradient) : longest.lh;
  const direction: [number, number] = primary ? [primary.gradient[0] / norm, primary.gradient[1] / norm] : [-longest.dy / norm, longest.dx / norm];
  const origin = roof[0]!.a;
  const coord = (p: { x: number; y: number }) => (p.x - origin.x) * direction[0] + (p.y - origin.y) * direction[1];
  const pts = roof.flatMap(m => [m.a, m.b]);
  const zMax = Math.max(...pts.map(Z));
  const top = pts.filter(p => Z(p) > zMax - 0.05);
  const ridge = top.reduce((s, p) => s + coord(p), 0) / top.length;
  const lo = Math.min(...pts.map(coord)), hi = Math.max(...pts.map(coord));
  const sloped = roof.filter(m => Math.abs(m.dz) > 1e-8 * m.lh);
  const weight = sloped.reduce((s, m) => s + m.lh, 0);
  const slopeDeg = weight ? sloped.reduce((s, m) => s + surfaces.atMember.get(m.id)!.slope * m.lh, 0) / weight : 0;
  const W = primary ? Math.max(...surfaces.planes.map(p => p.W)) : (hi - lo) / 2;
  return { axis: Math.abs(direction[0]) >= Math.abs(direction[1]) ? 'x' : 'y', direction, origin, ridge, W, slopeDeg };
}

export function surfaceSlopes(model: WindModel): Map<number, number> {
  const surfaces = roofSurfaceModel(model);
  return new Map(surfaces.roof.map(m => [m.id, surfaces.atMember.get(m.id)?.slope ?? 0]));
}

type Intensity = number | [number, number];
const ends = (p: Intensity): [number, number] => (typeof p === 'number' ? [p, p] : p);

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
    const wI = pI * tributaryWidth, wJ = pJ * tributaryWidth;
    distributed.push({ elementId: e.id, q: -wI * cos * cos, ...(Math.abs(wJ - wI) > 1e-9 ? { qJ: -wJ * cos * cos } : {}) });
    const total = ((wI + wJ) / 2) * Lh;
    const ex = [dx / L, dy / L, dz / L];
    const fAx = -total * ex[2]!;
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
    roofKind: 'mono' | 'gable' | 'curved' | 'multiple' | 'dome'; slippery: boolean; roofSlopeDeg?: number;
    abutting?: boolean;
    partial?: boolean;
    roof?: number[];
    parapet?: import('./snow-drift-loads').DriftInputs['parapet'];
    adjacent?: import('./snow-drift-loads').DriftInputs['adjacent'];
  };
  tributaryWidth: number;
  layout?: GravityLayout;
}

function onRoof(layout: GravityLayout, piece: { elementId: number; roof: boolean }, only?: ReadonlySet<number>): boolean {
  if (!only) return piece.roof;
  return only.has(piece.elementId) && (piece.roof || !layout.roof.has(piece.elementId));
}

function pointLoads(layout: GravityLayout, pOf: (elementId: number, unit: Unit) => Intensity, only?: ReadonlySet<number>): SnowCaseLoads['nodal'] {
  const out: SnowCaseLoads['nodal'] = [];
  for (const pt of layout.points) {
    if (!onRoof(layout, pt, only)) continue;
    const [pI, pJ] = ends(pOf(pt.elementId, { panel: pt.panel }));
    const p = (pI + pJ) / 2;
    if (p > 0) out.push({ nodeId: pt.nodeId, fx: 0, fy: 0, fz: -p * pt.w, carrier: pt.elementId });
  }
  return out;
}

function panelLoads(model: WindModel, layout: GravityLayout, pOf: (elementId: number, unit: Unit) => Intensity, tributaryWidth: number, only?: ReadonlySet<number>): SnowCaseLoads['distributed'] {
  const out: SnowCaseLoads['distributed'] = [];
  for (const pc of layout.pieces) {
    if (!onRoof(layout, pc, only)) continue;
    const [pI, pJ] = ends(pOf(pc.elementId, { panel: pc.panel }));
    const p = (pI + pJ) / 2;
    if (!(p > 0)) continue;
    out.push({ elementId: pc.elementId, q: -p * pc.wI, qJ: -p * pc.wJ, ...(pc.a !== undefined ? { a: pc.a, b: pc.b } : {}), frame: 'projected' });
  }
  for (const w of layout.widthMembers) {
    if ((only ? !only.has(w.elementId) : !layout.roof.has(w.elementId)) || !model.elements.has(w.elementId)) continue;
    const [pI, pJ] = ends(pOf(w.elementId, { member: w.elementId }));
    if (!(pI > 0 || pJ > 0)) continue;
    if (!w.spans) { out.push({ elementId: w.elementId, q: -pI * tributaryWidth, ...(Math.abs(pJ - pI) > 1e-9 ? { qJ: -pJ * tributaryWidth } : {}), frame: 'projected' }); continue; }
    for (const s of w.spans) {
      const pa = pI + (pJ - pI) * s.t0, pb = pI + (pJ - pI) * s.t1;
      out.push({ elementId: w.elementId, q: -pa * s.width, ...(Math.abs(pb - pa) > 1e-9 ? { qJ: -pb * s.width } : {}), a: s.t0 * w.length, b: s.t1 * w.length, frame: 'projected' });
    }
  }
  return out;
}

export function snowLoadCases(input: SnowCasesInput): {
  result: SnowResult; geometry: RoofGeometry; cases: SnowCaseLoads[]; derivation: EngineMessage[]; refs: ClauseRef[];
  surfaces: Array<{ slopeDeg: number; cs: number; ps: number }>;
} | null {
  const chosen = input.snow.roof ? new Set(input.snow.roof) : undefined;
  const surfaceModel = roofSurfaceModel(input.model, chosen);
  const driftSurfaces = chosen ? roofSurfaceModel(input.model) : surfaceModel;
  const geometry = roofGeometry(input.model, chosen, surfaceModel);
  if (!geometry) return null;
  const slopeDeg = input.snow.roofSlopeDeg ?? geometry.slopeDeg;
  const kind = input.snow.roofKind;
  const shapedKind = kind === 'curved' || kind === 'multiple' || kind === 'dome';
  const result = roofSnow({
    ...input.snow,
    roof: { kind: shapedKind ? 'mono' : kind, slopeDeg, W: geometry.W, slippery: input.snow.slippery },
  });
  if (input.layout && !driftSurfaces.resolves(input.layout)) result.refused = 'snow.refused.roofPlane';
  if (result.refused) return { result, geometry, cases: [], derivation: [], refs: [], surfaces: [] };
  const roof = roofMembers(input.model, chosen);
  const all = new Set(roof.map((r) => r.id));
  const only = chosen ? all : undefined;
  const layout = input.layout;
  const on = (pOf: (id: number, unit?: Unit) => Intensity): Pick<SnowCaseLoads, 'distributed' | 'nodal'> => (layout
    ? { distributed: panelLoads(input.model, layout, pOf, input.tributaryWidth, only), nodal: pointLoads(layout, pOf, only) }
    : projectionLoads(input.model, all, (id) => pOf(id), input.tributaryWidth));
  const derivation: EngineMessage[] = [], refs: ClauseRef[] = [];
  const axisVector = (axis: Axis): [number, number] => axis === 'x' ? geometry.direction : [-geometry.direction[1], geometry.direction[0]];
  const axisLabel = (axis: Axis) => {
    const [x, y] = axisVector(axis);
    return Math.abs(x) > 1 - 1e-9 ? 'X' : Math.abs(y) > 1 - 1e-9 ? 'Y' : `(${round(x, 4)}, ${round(y, 4)})`;
  };
  const directionLabel = (dir: string) => {
    if (!dir) return dir;
    const vector = axisVector(dir.endsWith('Y') ? 'y' : 'x');
    const sense = dir.startsWith('+') ? 1 : -1;
    const [x, y] = vector.map(v => sense * v);
    return Math.abs(x!) > 1 - 1e-9 ? `${x! > 0 ? '+' : '−'}X` : Math.abs(y!) > 1 - 1e-9 ? `${y! > 0 ? '+' : '−'}Y` : `(${round(x!, 4)}, ${round(y!, 4)})`;
  };

  const roofPoint = (p: { x: number; y: number; z?: number }) => ({
    x: (p.x - geometry.origin.x) * geometry.direction[0] + (p.y - geometry.origin.y) * geometry.direction[1],
    y: -(p.x - geometry.origin.x) * geometry.direction[1] + (p.y - geometry.origin.y) * geometry.direction[0], z: p.z,
  });
  const roofNodes = [...new Set(roof.flatMap((r) => { const e = input.model.elements.get(r.id)!; return [e.nodeI, e.nodeJ]; }))]
    .map((id) => input.model.nodes.get(id)!).filter(Boolean);
  const shaped = shapedKind ? shapedSnow(roofNodes.map(roofPoint), {
    kind, pf: result.pf, ce: result.ce, ct: result.ct, slippery: input.snow.slippery, gamma: result.gamma, axis: 'x',
    abutting: input.snow.abutting,
  }) : null;
  if (shaped) { derivation.push(...shaped.derivation); refs.push(...shaped.refs); }
  const atEnds = (f: (pt: { x: number; y: number; z?: number }) => number) => (id: number): Intensity => {
    const e = input.model.elements.get(id);
    const a = e && input.model.nodes.get(e.nodeI), b = e && input.model.nodes.get(e.nodeJ);
    return a && b ? [f(roofPoint(a)), f(roofPoint(b))] : 0;
  };
  const slopes = input.snow.roofSlopeDeg === undefined ? new Map(surfaceModel.roof.map(m => [m.id, surfaceModel.atMember.get(m.id)?.slope ?? 0])) : null;
  const bySlope = new Map<string, { slopeDeg: number; result: SnowResult }>();
  const used = new Set<string>();
  const surfaceAt = (deg: number, W = geometry.W): SnowResult => {
    const key = `${deg}:${W}`;
    used.add(key);
    if (Math.abs(deg - slopeDeg) < 1e-9 && Math.abs(W - geometry.W) < 1e-9) return result;
    let r = bySlope.get(key)?.result;
    if (!r) {
      r = roofSnow({ ...input.snow, roof: { kind: shapedKind ? 'mono' : kind, slopeDeg: deg, W, slippery: input.snow.slippery } });
      bySlope.set(key, { slopeDeg: deg, result: r });
    }
    return r;
  };
  const psOf = (id: number, unit?: Unit): number => {
    if (!slopes) return result.ps;
    const deg = unit && 'panel' in unit ? surfaceModel.panel(unit.panel, layout).slope : slopes.get(id) ?? slopeDeg;
    return surfaceAt(deg, surfaceModel.atMember.get(id)?.W ?? geometry.W).ps;
  };
  const balancedOf: (id: number, unit?: Unit) => Intensity = shaped
    ? atEnds((pt) => shaped.balanced(pt) + result.rainOnSnow)
    : psOf;
  const cases: SnowCaseLoads[] = [{
    nameKey: shaped ? 'snow.case.balancedShaped' : 'snow.case.balanced', nameParams: { ps: +(shaped ? result.pf : result.ps).toFixed(3) },
    ...on((id, u) => balancedOf(id, u)),
  }];
  if (layout) {
    const extra = driftAndSlidingLoads(input.model as GravityModel, layout, {
      pg: input.snow.pg, balanced: (panel, pt) => shaped ? shaped.balanced(roofPoint({ x: pt[0], y: pt[1] })) + result.rainOnSnow : !slopes ? result.ps : surfaceAt(driftSurfaces.panel(panel, layout).slopeAt(pt), driftSurfaces.panel(panel, layout).planeAt(pt)?.W ?? geometry.W).ps, pf: result.pf, pfFor: (slope, W) => surfaceAt(slope, W).pf, slippery: input.snow.slippery,
      tributaryWidth: input.tributaryWidth, parapet: input.snow.parapet, adjacent: input.snow.adjacent,
    }, driftSurfaces);
    cases[0]!.distributed.push(...extra.distributed.filter(d => !only || only.has(d.elementId)));
    derivation.push(...extra.derivation);
    refs.push(...extra.refs);
    if (input.snow.partial !== false) {
      const steep = input.snow.roofKind === 'gable' && slopeDeg > 21 / Math.max(geometry.W, 1e-9) + 0.5;
      const units = layoutUnits(layout, (u) => ('panel' in u ? !!layout.panels[u.panel]?.roof : layout.roof.has(u.member)));
      const patterns = partialSnowPatterns(roofSpans(input.model as GravityModel, layout, geometry), units, steep ? 'x' : undefined);
      for (const pt of patterns) {
        cases.push({
          nameKey: pt.snowCase === 3 ? 'snow.case.partialPair' : 'snow.case.partial', pattern: true,
          nameParams: { axis: axisLabel(pt.axis), c: pt.snowCase!, at: +(pt.at ?? 0).toFixed(2) },
          ...on((id, u) => { const f = u ? pt.factor(u) : 1; const [a, b] = ends(balancedOf(id, u)); return [a * f, b * f]; }),
        });
      }
      derivation.push(msg(patterns.length > 0 ? 'snow.derivation.partial' : 'snow.derivation.noPartial', { n: patterns.length }));
      if (steep) derivation.push(msg('snow.derivation.partialExempt', { axis: axisLabel('x'), slope: round(slopeDeg, 1), limit: round(21 / Math.max(geometry.W, 1e-9) + 0.5, 1) }));
      if (patterns.length > 0) refs.push(REF_PARTIAL);
    }
  }
  if (shaped) {
    for (const u of shaped.unbalanced) {
      cases.push({ nameKey: u.dir ? 'snow.case.unbalanced' : 'snow.case.unbalancedValleys', nameParams: { dir: directionLabel(u.dir) }, ...on(atEnds(u.at)) });
    }
  } else if (result.unbalanced) {
    const mid = (id: number) => {
      const e = input.model.elements.get(id);
      const a = e && input.model.nodes.get(e.nodeI), b = e && input.model.nodes.get(e.nodeJ);
      return a && b ? (((a.x + b.x) / 2 - geometry.origin.x) * geometry.direction[0] + ((a.y + b.y) / 2 - geometry.origin.y) * geometry.direction[1]) : geometry.ridge;
    };
    const side = new Map([...input.model.elements.keys()].map((id) => [id, mid(id) - geometry.ridge]));
    const { leeward: lee, windward: wind } = result.unbalanced;
    for (const sense of [1, -1] as const) {
      const at = (id: number) => {
        const s = side.get(id) ?? 0;
        return Math.abs(s) <= 0.01 ? (lee + wind) / 2 : s * sense > 0 ? lee : wind;
      };
      cases.push({
        nameKey: 'snow.case.unbalanced',
        nameParams: { dir: directionLabel(`${sense > 0 ? '+' : '−'}X`) },
        ...on(at),
      });
    }
  }
  const surfaces = [...bySlope.entries()].filter(([key, value]) => used.has(key) && Math.abs(value.result.ps - result.ps) > 1e-9)
    .map(([, value]) => ({ slopeDeg: value.slopeDeg, cs: value.result.cs, ps: value.result.ps })).sort((a, b) => a.slopeDeg - b.slopeDeg);
  return { result, geometry, cases, derivation, refs, surfaces: shaped ? [] : surfaces };
}
