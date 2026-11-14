import { fromProject, type ProvenancedValue } from '../regulation';
import { msg, round } from '../message';
import { windDirectionsOf, type LevelMass, type LoadPlanInput, type PlanSink } from '../../engine/loads/load-plan';
import { levelLoads, type WindDirection } from '../../engine/loads/wind-cases';
import { windInputOf } from './inputs';
import { TS498 } from './refs';

const BANDS: ReadonlyArray<readonly [number, number]> = [[8, 0.5], [20, 0.8], [100, 1.1], [Infinity, 1.3]];
const SLOPE_Q = 1.1;
export const C_GENERAL = 1.2;
export const C_TOWER = 1.6;

export function velocityPressure(z: number, exposedSlope = false): number {
  const q = BANDS.find(([top]) => z <= top + 1e-9)![1];
  return exposedSlope ? Math.max(q, SLOPE_Q) : q;
}

export function meanPressure(z0: number, z1: number, exposedSlope = false): number {
  if (z1 <= z0) return velocityPressure(z0, exposedSlope);
  const cuts = [z0, ...BANDS.map(([top]) => top).filter((z) => z > z0 && z < z1), z1];
  let area = 0;
  for (let i = 0; i + 1 < cuts.length; i++) area += velocityPressure((cuts[i]! + cuts[i + 1]!) / 2, exposedSlope) * (cuts[i + 1]! - cuts[i]!);
  return area / (z1 - z0);
}

export interface WindStorey { elevation: number; nodeIds: number[]; z0: number; z1: number; q: number; force: number }

export function storeyWind(
  levels: ReadonlyArray<{ elevation: number; nodeIds: number[] }>, base: number, c: number, across: number, exposedSlope = false,
): WindStorey[] {
  const elevated = levels.filter((l) => l.elevation > base + 1e-6);
  return elevated.map((lv, i) => {
    const below = i === 0 ? base : elevated[i - 1]!.elevation;
    const above = i === elevated.length - 1 ? lv.elevation : elevated[i + 1]!.elevation;
    const z0 = (below + lv.elevation) / 2 - base, z1 = (lv.elevation + above) / 2 - base;
    const q = meanPressure(z0, z1, exposedSlope);
    return { elevation: lv.elevation, nodeIds: lv.nodeIds, z0, z1, q, force: c * q * across * (z1 - z0) };
  });
}

export function planTs498Wind(input: LoadPlanInput, levels: LevelMass[], sink: PlanSink): { windQh: ProvenancedValue<number> | undefined } {
  if (!input.wind?.enabled) return { windQh: undefined };
  const wi = windInputOf(input.codeInputs);
  const region = input.wind.region ? new Set(input.wind.region) : null;
  const lv = region ? levels.map((l) => ({ ...l, nodeIds: l.nodeIds.filter((id) => region.has(id)) })).filter((l) => l.nodeIds.length > 0) : levels;
  const nodes = [...input.model.nodes.values()].filter((n) => !region || region.has(n.id));
  if (!nodes.length || !lv.length) { sink.unsupportedKeys.push(msg('loadPlan.note.windEmptyRegion')); return { windQh: undefined }; }
  const base = Math.min(...levels.map((l) => l.elevation));
  const h = Math.max(...lv.map((l) => l.elevation)) - base;
  const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
  const bx = Math.max(...xs) - Math.min(...xs), by = Math.max(...ys) - Math.min(...ys);
  const tower = wi.shape ? wi.shape === 'tower' : h >= 5 * ((bx + by) / 2);
  const c = tower ? C_TOWER : C_GENERAL;
  const dirs: WindDirection[] = wi.directions
    ? [...(wi.directions.x ? (['+x', '-x'] as const) : []), ...(wi.directions.y ? (['+y', '-y'] as const) : [])]
    : windDirectionsOf(input.wind);
  sink.refs.push(TS498('11.2', 'rüzgar yükü hesap değeri'), TS498('Çizelge 5', 'yüksekliğe bağlı rüzgar hızı ve emme'), TS498('Çizelge 6', tower ? '1.1.1 b' : '1.1.1 a'));
  sink.derivation.push(msg(tower ? 'loads.tr.wind.derivation.tower' : 'loads.tr.wind.derivation.general', { c, h: round(h, 2), b: round((bx + by) / 2, 2) }));
  if (wi.exposedSlope) sink.derivation.push(msg('loads.tr.wind.derivation.exposedSlope', { q: SLOPE_Q }));
  for (const axis of ['x', 'y'] as const) {
    const senses = dirs.filter((d) => d.endsWith(axis));
    if (!senses.length) continue;
    const across = axis === 'x' ? by : bx;
    const storeys = storeyWind(lv, base, c, across, wi.exposedSlope);
    for (const s of storeys) {
      sink.derivation.push(msg('loads.tr.wind.derivation.level', {
        dir: axis.toUpperCase(), level: round(s.elevation, 2), z0: round(s.z0, 2), z1: round(s.z1, 2), q: round(s.q, 3), force: round(s.force, 2),
      }));
    }
    for (const d of senses) {
      const sign = d.startsWith('-') ? -1 : 1;
      const index = sink.cases.length;
      sink.cases.push({ existingId: null, type: 'W', nameKey: 'loads.tr.wind.case', nameParams: { dir: `${sign > 0 ? '+' : '−'}${axis.toUpperCase()}` } });
      for (const s of storeys) {
        for (const n of levelLoads(input.model.nodes, s.nodeIds, axis === 'x' ? sign * s.force : 0, axis === 'y' ? sign * s.force : 0, 0)) {
          sink.nodal.push({ nodeId: n.nodeId, caseType: 'W', caseIndex: index, fx: n.fx, fy: n.fy, fz: 0 });
        }
      }
    }
  }
  if (input.wind.structure && input.wind.structure.kind !== 'building') sink.unsupportedKeys.push(msg('loads.tr.wind.note.notBuilding'));
  sink.unsupportedKeys.push(msg('loads.tr.wind.note.roofAndCladding'));
  return { windQh: fromProject(velocityPressure(h, wi.exposedSlope) * 1000, 'N/m²') };
}
