import { roofMembers, type WindModel } from './wind-cases';
import { onSnowRoof, roofSurfaceModel, SNOW_INTENSITY_RELATIVE_ERROR, type SnowPlane, type RoofGeometry } from './snow-roof-surfaces';
import type { GravityLayout, GravityModel } from './plan-gravity';
import { driftAndSlidingLoads, snowDriftRefusal, STEP_DRIFT_REFUSAL } from './snow-drift-loads';
import { layoutSpans, layoutUnits, partialSnowPatterns } from './plan-spans';
import { shapedSnow } from './snow-shapes';
import { EngineMessageError, msg, round, type EngineMessage } from '../../codes/message';
import type { ClauseRef } from '../../codes/regulation';
import { roofSnow, type SnowInputs, type SnowResult } from '../../codes/cirsoc104/snow';
import { clause } from '../../codes/regulation';

const REF_PARTIAL = clause('cirsoc-104', '2005', '5.1', 'sistemas de vigas continuas');

type Axis = 'x' | 'y';

function roofSpans(model: GravityModel, layout: GravityLayout, geometry: RoofGeometry) {
  const local = (x: number, y: number): [number, number] => [(x - geometry.origin.x) * geometry.direction[0] + (y - geometry.origin.y) * geometry.direction[1], (x - geometry.origin.x) * geometry.transverse[0] + (y - geometry.origin.y) * geometry.transverse[1]];
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

export type { RoofGeometry } from './snow-roof-surfaces';

const Z = (n: { z?: number }) => n.z ?? 0;

export function roofGeometry(model: WindModel, only?: ReadonlySet<number>, surfaces = roofSurfaceModel(model, only)): RoofGeometry | null {
  return surfaces.geometry;
}

export function surfaceSlopes(model: WindModel): Map<number, number> {
  const surfaces = roofSurfaceModel(model);
  return new Map(surfaces.roof.map(m => [m.id, surfaces.atMember.get(m.id)?.slope ?? 0]));
}

type SnowUnit = { panel: number; point: [number, number]; surface?: SnowPlane; inside?: [number, number]; region?: true } | { member: number; point?: [number, number]; inside?: [number, number] };

type Intensity = number | [number, number];
type PressureProfile = ReturnType<ReturnType<typeof roofSurfaceModel>['pressureProfile']>;
const ends = (p: Intensity): [number, number] => (typeof p === 'number' ? [p, p] : p);

function projectionLoads(
  model: WindModel, ids: Set<number>, profile: PressureProfile, tributaryWidth: number,
): Pick<SnowCaseLoads, 'distributed' | 'nodal'> {
  const distributed: SnowCaseLoads['distributed'] = [];
  const nodal: SnowCaseLoads['nodal'] = [];
  for (const e of model.elements.values()) {
    if (!ids.has(e.id)) continue;
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const L = Math.hypot(b.x - a.x, b.y - a.y, Z(b) - Z(a));
    for (const piece of profile.memberLoads(e.id)) {
      const { q: pI, qJ: pJ } = piece;
      if (!(pI > 0 || pJ > 0) || L < 1e-9) continue;
      const wI = pI * tributaryWidth, wJ = pJ * tributaryWidth;
      distributed.push({ elementId: e.id, ...(piece.a === 0 && piece.b === L ? {} : { a: piece.a, b: piece.b }), q: -wI, ...(Math.abs(wJ - wI) > 1e-9 ? { qJ: -wJ } : {}), frame: 'projected' });
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

function pointLoads(model: WindModel, layout: GravityLayout, profile: PressureProfile, surfaces: ReturnType<typeof roofSurfaceModel>, only?: ReadonlySet<number>): SnowCaseLoads['nodal'] {
  const out: SnowCaseLoads['nodal'] = [];
  for (const pt of layout.points) {
    if (!onSnowRoof(layout, pt, only)) continue;
    const node = model.nodes.get(pt.nodeId)!;
    const surface = surfaces.panel(pt.panel, layout).planeAt([node.x, node.y]);
    const p = profile.at(pt.elementId, node, node, surface, pt.panel);
    if (p > 0) out.push({ nodeId: pt.nodeId, fx: 0, fy: 0, fz: -p * pt.w, carrier: pt.elementId });
  }
  return out;
}

function panelLoads(model: WindModel, layout: GravityLayout, tributaryWidth: number, only: ReadonlySet<number> | undefined, surfaces: ReturnType<typeof roofSurfaceModel>, profile: PressureProfile): SnowCaseLoads['distributed'] {
  const out: SnowCaseLoads['distributed'] = [];
  for (const pc of layout.pieces) {
    if (!onSnowRoof(layout, pc, only)) continue;
    const loads = surfaces.pieceLoads(pc, layout, (surface, point, inside) => {
      return profile.at(pc.elementId, { x: point[0], y: point[1] }, { x: inside[0], y: inside[1] }, surface, pc.panel);
    }, profile.boundaries);
    out.push(...loads.filter(d => d.q < 0 || d.qJ < 0));
  }
  for (const w of layout.widthMembers) {
    if ((only ? !only.has(w.elementId) : !layout.roof.has(w.elementId)) || !model.elements.has(w.elementId)) continue;
    for (const span of w.spans ?? [{ t0: 0, t1: 1, width: tributaryWidth }]) for (const d of profile.memberLoads(w.elementId, span.t0 * w.length, span.t1 * w.length)) {
      if (!(d.q > 0 || d.qJ > 0)) continue;
      out.push({ elementId: w.elementId, q: -d.q * span.width, ...(Math.abs(d.qJ - d.q) > 1e-9 ? { qJ: -d.qJ * span.width } : {}), ...(d.a === 0 && d.b === w.length ? {} : { a: d.a, b: d.b }), frame: 'projected' });
    }
  }
  return out;
}

export function snowLoadCases(input: SnowCasesInput): {
  result: SnowResult; geometry: RoofGeometry; cases: SnowCaseLoads[]; derivation: EngineMessage[]; refs: ClauseRef[];
  surfaces: Array<{ slopeDeg: number; cs: number; ps: number }>;
  flatRoof?: SnowCaseLoads;
} | null {
  const chosen = input.snow.roof ? new Set(input.snow.roof) : undefined;
  const surfaceModel = roofSurfaceModel(input.model, chosen);
  const driftSurfaces = surfaceModel;
  const geometry = roofGeometry(input.model, chosen, surfaceModel);
  if (!geometry) return null;
  const slopeDeg = input.snow.roofSlopeDeg ?? geometry.slopeDeg;
  const kind = input.snow.roofKind;
  const shapedKind = kind === 'curved' || kind === 'multiple' || kind === 'dome';
  const result = roofSnow({
    ...input.snow,
    roof: { kind: shapedKind ? 'mono' : kind, slopeDeg, W: geometry.W, slippery: input.snow.slippery },
  });
  if (!result.refused) {
    const refused = snowDriftRefusal(input.model as GravityModel, input.layout, driftSurfaces);
    if (refused) result.refused = refused;
  }
  if (result.refused) return { result, geometry, cases: [], derivation: [], refs: [], surfaces: [] };
  const roof = roofMembers(input.model, chosen);
  const all = new Set(roof.map((r) => r.id));
  const only = chosen ? all : undefined;
  const layout = input.layout;
  const on = (pOf: (id: number, unit?: SnowUnit) => Intensity, splitRidge = false): Pick<SnowCaseLoads, 'distributed' | 'nodal'> => {
    const profile = surfaceModel.pressureProfile((id, point, inside, surface, panel) => {
      const station = { point: [point.x, point.y] as [number, number], inside: [inside.x, inside.y] as [number, number] };
      const [a, b] = ends(pOf(id, panel === undefined ? { member: id, ...station } : { panel, surface, region: true, ...station }));
      return (a + b) / 2;
    }, splitRidge);
    return layout
      ? { distributed: panelLoads(input.model, layout, input.tributaryWidth, only, surfaceModel, profile), nodal: pointLoads(input.model, layout, profile, surfaceModel, only) }
      : projectionLoads(input.model, all, profile, input.tributaryWidth);
  };
  const derivation: EngineMessage[] = [], refs: ClauseRef[] = [];
  const axisVector = (axis: Axis, frame = geometry): [number, number] => axis === 'x' ? frame.direction : frame.transverse;
  const axisLabel = (axis: Axis, frame = geometry) => {
    const [x, y] = axisVector(axis, frame);
    return Math.abs(x) > 1 - 1e-9 ? 'X' : Math.abs(y) > 1 - 1e-9 ? 'Y' : `(${round(x, 4)}, ${round(y, 4)})`;
  };
  const directionLabel = (dir: string) => {
    if (!dir) return dir;
    const vector = axisVector(dir.endsWith('Y') ? 'y' : 'x');
    const sense = dir.startsWith('+') ? 1 : -1;
    const [x, y] = vector.map(v => sense * v);
    return Math.abs(x!) > 1 - 1e-9 ? `${x! > 0 ? '+' : '−'}X` : Math.abs(y!) > 1 - 1e-9 ? `${y! > 0 ? '+' : '−'}Y` : `(${round(x!, 4)}, ${round(y!, 4)})`;
  };

  const roofPoint = surfaceModel.roofPoint;
  const shaped = shapedKind ? shapedSnow(surfaceModel.profilePoints.map(roofPoint), {
    kind, pf: result.pf, ce: result.ce, ct: result.ct, slippery: input.snow.slippery, gamma: result.gamma, axis: 'x',
    abutting: input.snow.abutting,
  }) : null;
  if (shaped) { derivation.push(...shaped.derivation); refs.push(...shaped.refs); }
  const atEnds = (f: (pt: { x: number; y: number; z?: number }) => number) => (id: number, unit?: SnowUnit): Intensity => surfaceModel.memberValues(id, p => f(roofPoint(p)), unit?.point ? { x: unit.point[0], y: unit.point[1] } : undefined);
  const bySlope = new Map<string, { slopeDeg: number; result: SnowResult }>();
  const used = new Set<string>();
  const surfaceAt = (deg: number, W = geometry.W): SnowResult => {
    const key = `${deg}:${W}`;
    used.add(key);
    let r = bySlope.get(key)?.result;
    if (!r) {
      r = roofSnow({ ...input.snow, roof: { kind: shapedKind ? 'mono' : kind, slopeDeg: deg, W, slippery: input.snow.slippery } });
      bySlope.set(key, { slopeDeg: deg, result: r });
    }
    return r;
  };
  const localSurfaces = (id: number, unit?: SnowUnit): Array<SnowPlane | undefined> => {
    if (unit && 'panel' in unit) {
      if (unit.region) return [unit.surface];
      return [surfaceModel.panel(unit.panel, layout).planeAt(unit.point)];
    }
    const ps = surfaceModel.memberPlanes(id);
    return ps.length ? ps : [undefined];
  };
  const localResult = (surface?: SnowPlane) => surfaceAt(input.snow.roofSlopeDeg ?? surface?.slope ?? 0, surface?.W ?? geometry.W);
  const psOf = (id: number, unit?: SnowUnit): number => {
    const ps = localSurfaces(id, unit);
    return ps.reduce((sum, p) => sum + localResult(p).ps, 0) / ps.length;
  };
  const exempt = (p: SnowPlane | undefined, direction: [number, number]) => {
    const gradient = p?.gradient ?? geometry.direction;
    const aligned = Math.abs(gradient[0] * direction[1] - gradient[1] * direction[0]) <= 1e-9 * Math.hypot(...gradient);
    return kind === 'gable' && aligned && (input.snow.roofSlopeDeg ?? p?.slope ?? 0) > 21 / Math.max(p?.W ?? geometry.W, 1e-9) + 0.5;
  };
  const balancedOf: (id: number, unit?: SnowUnit) => Intensity = shaped
    ? atEnds((pt) => shaped.balanced(pt) + result.rainOnSnow)
    : psOf;
  const cases: SnowCaseLoads[] = [{
    nameKey: shaped ? 'snow.case.balancedShaped' : 'snow.case.balanced', nameParams: { ps: +(shaped ? result.pf : result.ps).toFixed(3) },
    ...on((id, u) => balancedOf(id, u)),
  }];
  if (layout) {
    let extra: ReturnType<typeof driftAndSlidingLoads>;
    try {
      extra = driftAndSlidingLoads(input.model as GravityModel, layout, {
        pg: input.snow.pg,
        balanced: (panel, pt) => shaped ? shaped.balanced(roofPoint({ x: pt[0], y: pt[1] })) + result.rainOnSnow : localResult(driftSurfaces.panel(panel, layout).planeAt(pt)).ps,
        balancedConstantOnPlanes: !shaped || kind === 'multiple',
        pf: result.pf, pfFor: (slope, W) => surfaceAt(slope, W).pf, slippery: input.snow.slippery,
        tributaryWidth: input.tributaryWidth, parapet: input.snow.parapet, adjacent: input.snow.adjacent,
      }, driftSurfaces);
    } catch (err) {
      if (!(err instanceof EngineMessageError) || err.key !== STEP_DRIFT_REFUSAL) throw err;
      result.refused = err.key;
      return { result, geometry, cases: [], derivation: [], refs: [], surfaces: [] };
    }
    cases[0]!.distributed.push(...extra.distributed.filter(d => !only || only.has(d.elementId)));
    derivation.push(...extra.derivation);
    refs.push(...extra.refs);
    if (input.snow.partial !== false) {
      const units = layoutUnits(layout, (u) => ('panel' in u ? !!layout.panels[u.panel]?.roof : layout.roof.has(u.member)));
      const directions: Array<[number, number]> = [];
      let count = 0;
      const exemptions: EngineMessage[] = [];
      const seen = new Set<string>([JSON.stringify({ distributed: cases[0]!.distributed, nodal: cases[0]!.nodal })]);
      for (const direction of surfaceModel.targetPlanes.length && surfaceModel.orientations.length ? surfaceModel.orientations : [geometry.direction]) {
        const frame = { ...geometry, direction, transverse: surfaceModel.transverse(direction) };
        const patterns = partialSnowPatterns(roofSpans(input.model as GravityModel, layout, frame), units);
        for (const axis of ['x', 'y'] as const) {
          const vector = axisVector(axis, frame);
          if (directions.some(d => Math.abs(d[0] * vector[1] - d[1] * vector[0]) <= 1e-9)) continue;
          directions.push(vector);
          for (const pt of patterns.filter(p => p.axis === axis)) {
            const loads = on((id, u) => {
              const factor = u ? pt.factor(u) : 1;
              if (shaped) { const [a, b] = ends(balancedOf(id, u)); return [a * factor, b * factor]; }
              const ps = localSurfaces(id, u);
              return ps.reduce((sum, p) => sum + localResult(p).ps * (exempt(p, vector) ? 1 : factor), 0) / ps.length;
            });
            const key = JSON.stringify(loads);
            if (seen.has(key)) continue;
            seen.add(key);
            count++;
            cases.push({
              nameKey: pt.snowCase === 3 ? 'snow.case.partialPair' : 'snow.case.partial', pattern: true,
              nameParams: { axis: axisLabel(axis, frame), c: pt.snowCase!, at: +(pt.at ?? 0).toFixed(2) },
              ...loads,
            });
          }
          if (units.every(u => {
            const ps = 'panel' in u ? surfaceModel.panel(u.panel, layout).planes : localSurfaces(u.member, u);
            return ps.length > 0 && ps.every(p => exempt(p, vector));
          })) exemptions.push(msg('snow.derivation.partialExempt', { axis: axisLabel(axis, frame), slope: round(slopeDeg, 1), limit: round(21 / Math.max(geometry.W, 1e-9) + 0.5, 1) }));
        }
      }
      derivation.push(msg(count > 0 ? 'snow.derivation.partial' : 'snow.derivation.noPartial', { n: count }));
      derivation.push(...exemptions);
      if (count > 0) refs.push(REF_PARTIAL);
    }
  }
  if (shaped) {
    for (const u of shaped.unbalanced) {
      cases.push({ nameKey: u.dir ? 'snow.case.unbalanced' : 'snow.case.unbalancedValleys', nameParams: { dir: directionLabel(u.dir) }, ...on(atEnds(u.at)) });
    }
  } else if (surfaceModel.planes.length ? surfaceModel.planes.some(p => localResult(p).unbalanced) : result.unbalanced) {
    for (const direction of surfaceModel.targetPlanes.length && surfaceModel.orientations.length ? surfaceModel.orientations : [geometry.direction]) for (const sense of [1, -1] as const) {
      const at = (id: number, unit?: SnowUnit) => {
        const ps = localSurfaces(id, unit);
        return ps.reduce((sum, p) => {
          const r = localResult(p), u = r.unbalanced;
          if (!u) return sum + r.ps;
          if (p) {
            const side = -(p.gradient[0] * direction[0] + p.gradient[1] * direction[1]);
            return sum + (Math.abs(side) <= 1e-9 ? r.ps : side * sense > 0 ? u.leeward : u.windward);
          }
          const point = unit?.inside ?? unit?.point;
          const side = point ? surfaceModel.roofPoint({ x: point[0], y: point[1] }).x - geometry.ridge : 0;
          return sum + (side === 0 ? (u.leeward + u.windward) / 2 : side * sense > 0 ? u.leeward : u.windward);
        }, 0) / ps.length;
      };
      const [x, y] = direction.map(v => sense * v);
      const dir = Math.abs(x!) > 1 - 1e-9 ? `${x! > 0 ? '+' : '−'}X` : Math.abs(y!) > 1 - 1e-9 ? `${y! > 0 ? '+' : '−'}Y` : `(${round(x!, 4)}, ${round(y!, 4)})`;
      cases.push({ nameKey: 'snow.case.unbalanced', nameParams: { dir }, ...on(at, true) });
    }
  }
  const surfaces = [...bySlope.entries()].filter(([key, value]) => used.has(key) && Math.abs(value.result.ps - result.ps) > 1e-9)
    .map(([, value]) => ({ slopeDeg: value.slopeDeg, cs: value.result.cs, ps: value.result.ps })).sort((a, b) => a.slopeDeg - b.slopeDeg);
  if (surfaceModel.approximation.maxAbsoluteError > 0) derivation.push(msg('snow.derivation.intensityBound', { relativePercent: 100 * SNOW_INTENSITY_RELATIVE_ERROR, absolute: surfaceModel.approximation.maxAbsoluteError }));
  const flatRoof: SnowCaseLoads = {
    nameKey: 'snow.case.flatRoof', nameParams: {},
    ...on((id, unit) => {
      const ps = localSurfaces(id, unit);
      return ps.reduce((sum, p) => { const r = localResult(p); return sum + r.pf + r.rainOnSnow; }, 0) / ps.length;
    }),
  };
  return { result, geometry, cases, derivation, refs, surfaces: shaped ? [] : surfaces, flatRoof };
}
