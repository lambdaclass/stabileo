/**
 * Snow load cases on the model's roof, from CIRSOC 104-2005 (`codes/cirsoc104/snow.ts`).
 *
 *   · one balanced case, p_s on every roof member;
 *   · on a gable roof that §6.1 asks it of, two unbalanced cases, one per wind direction across
 *     the ridge: the leeward slope at the unbalanced load, the windward slope at 0,3·p_s (or
 *     unloaded where W ≤ 6 m).
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
 * Pure: no store.
 */
import { roofMembers, type WindModel } from './wind-cases';
import { roofSnow, type SnowInputs, type SnowResult } from '../../codes/cirsoc104/snow';

type Axis = 'x' | 'y';

export interface SnowCaseLoads {
  nameKey: string;
  nameParams: Record<string, string | number>;
  distributed: Array<{ elementId: number; q: number }>;
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

/** Loads of `p` (kN/m² on the horizontal projection) on the given roof members. */
function projectionLoads(
  model: WindModel, ids: Set<number>, pOf: (mid: number) => number, tributaryWidth: number,
): Pick<SnowCaseLoads, 'distributed' | 'nodal'> {
  const distributed: SnowCaseLoads['distributed'] = [];
  const nodal: SnowCaseLoads['nodal'] = [];
  for (const e of model.elements.values()) {
    if (!ids.has(e.id)) continue;
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const dx = b.x - a.x, dy = b.y - a.y, dz = Z(b) - Z(a);
    const L = Math.hypot(dx, dy, dz), Lh = Math.hypot(dx, dy);
    const p = pOf(e.id);
    if (!(p > 0) || L < 1e-9) continue;
    const w = p * tributaryWidth;          // kN per metre of horizontal projection
    const cos = Lh / L;
    distributed.push({ elementId: e.id, q: -w * cos * cos });
    // Along the member: the total vertical load's axial component, half to each end.
    const total = w * Lh;
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
  snow: Omit<SnowInputs, 'roof'> & { roofKind: 'mono' | 'gable'; slippery: boolean; roofSlopeDeg?: number };
  tributaryWidth: number;
}

export function snowLoadCases(input: SnowCasesInput): { result: SnowResult; geometry: RoofGeometry; cases: SnowCaseLoads[] } | null {
  const geometry = roofGeometry(input.model);
  if (!geometry) return null;
  const slopeDeg = input.snow.roofSlopeDeg ?? geometry.slopeDeg;
  const result = roofSnow({
    ...input.snow,
    roof: { kind: input.snow.roofKind, slopeDeg, W: geometry.W, slippery: input.snow.slippery },
  });
  if (result.refused) return { result, geometry, cases: [] };
  const roof = roofMembers(input.model);
  const all = new Set(roof.map((r) => r.id));
  const cases: SnowCaseLoads[] = [{
    nameKey: 'snow.case.balanced', nameParams: { ps: +result.ps.toFixed(3) },
    ...projectionLoads(input.model, all, () => result.ps, input.tributaryWidth),
  }];
  if (result.unbalanced) {
    const side = new Map(roof.map((r) => [r.id, (geometry.axis === 'x' ? r.mid.x : r.mid.y) - geometry.ridge]));
    for (const sense of [1, -1] as const) {
      // Wind blowing toward +axis leaves the snow on the side beyond the ridge.
      const leeward = (id: number) => (side.get(id) ?? 0) * sense > 0;
      cases.push({
        nameKey: 'snow.case.unbalanced',
        nameParams: { dir: `${sense > 0 ? '+' : '−'}${geometry.axis.toUpperCase()}` },
        ...projectionLoads(input.model, all,
          (id) => (leeward(id) ? result.unbalanced!.leeward : result.unbalanced!.windward), input.tributaryWidth),
      });
    }
  }
  return { result, geometry, cases };
}
