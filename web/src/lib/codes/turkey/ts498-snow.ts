import { msg, round } from '../message';
import type { LoadPlanInput, PlanSink } from '../../engine/loads/load-plan';
import type { GravityLayout } from '../../engine/loads/plan-gravity';
import { roofMembers } from '../../engine/loads/wind-cases';
import { snowSlopes } from '../../engine/loads/snow-loads';
import { snowInputOf, type SnowZone } from './inputs';
import { TS498 } from './refs';

const ALTITUDES = [200, 300, 400, 500, 600, 700, 800, 900, 1000] as const;
const PK0: Readonly<Record<SnowZone, readonly number[]>> = {
  I: [0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.80, 0.80, 0.80],
  II: [0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.85, 0.95, 1.05],
  III: [0.75, 0.75, 0.75, 0.75, 0.80, 0.85, 1.25, 1.30, 1.35],
  IV: [0.75, 0.80, 0.80, 0.85, 0.90, 0.95, 1.40, 1.50, 1.60],
};

export function groundSnow(zone: SnowZone, altitudeM: number): { pk0: number; row: number | string } {
  const row = PK0[zone];
  if (altitudeM > 1000) return { pk0: row[row.length - 1]! * (altitudeM > 1500 ? 1.15 : 1.1), row: '>1000' };
  const k = ALTITUDES.findIndex((a) => altitudeM <= a + 1e-9);
  return { pk0: row[k]!, row: ALTITUDES[k]! };
}

const mAtDegree = (deg: number) => Math.min(1, Math.max(0, Math.floor((1 - (deg - 30) / 40) * 100 + 1e-9) / 100));

export function slopeFactor(alphaDeg: number, slidingPrevented = false): number {
  if (slidingPrevented || alphaDeg <= 30) return 1;
  const lo = Math.floor(alphaDeg), hi = Math.ceil(alphaDeg);
  if (lo === hi) return mAtDegree(lo);
  return mAtDegree(lo) + (mAtDegree(hi) - mAtDegree(lo)) * (alphaDeg - lo);
}

export function planTs498Snow(input: LoadPlanInput, sink: PlanSink, layout?: GravityLayout): boolean {
  if (!input.snow?.enabled) return false;
  const si = snowInputOf(input.codeInputs);
  if (si.noSnow) { sink.derivation.push(msg('loads.tr.snow.derivation.noSnow')); sink.refs.push(TS498('7')); return false; }
  if (!si.zone) { sink.blockedKeys.push(msg('loads.tr.snow.blocked.zone')); return false; }
  if (!(si.altitudeM! >= 0)) { sink.blockedKeys.push(msg('loads.tr.snow.blocked.altitude')); return false; }
  const chosen = input.snow.roof ? new Set(input.snow.roof) : undefined;
  const roof = roofMembers(input.model, chosen);
  if (!roof.length) { sink.unsupportedKeys.push(msg(chosen ? 'snow.note.emptyRegion' : 'snow.note.noRoof')); return false; }
  const ids = new Set(roof.map((r) => r.id));
  const { pk0, row } = groundSnow(si.zone, si.altitudeM!);
  sink.refs.push(TS498('8', 'kar yükü'), TS498('Çizelge 4', 'zati kar yükü'), TS498('7', 'kar yükü hesap değeri'), TS498('Çizelge 3', 'çatı eğimine bağlı azaltma değeri'));
  sink.derivation.push(msg('loads.tr.snow.derivation.pk0', { zone: si.zone, altitude: si.altitudeM!, row, pk0: round(pk0, 3) }));
  // Çizelge 3 by the slope of each surface (`snowSlopes`): a panel the slope of the roof over it.
  const slopes = si.roofSlopeDeg === undefined ? snowSlopes(input.model, layout) : null;
  const slopeOf = (id: number, panel?: number) => si.roofSlopeDeg ?? slopes!.of(id, panel);
  const pk = (id: number, panel?: number) => pk0 * slopeFactor(slopeOf(id, panel), si.slidingPrevented);
  const seen = new Map<number, number>();
  const note = (a0: number) => { const a = round(a0, 1); if (!seen.has(a)) seen.set(a, slopeFactor(a, si.slidingPrevented)); };
  for (const id of ids) note(slopeOf(id));
  if (layout) for (const pc of layout.pieces) if (pc.roof) note(slopeOf(pc.elementId, pc.panel));
  for (const [a, m] of [...seen].sort((x, y) => x[0] - y[0])) sink.derivation.push(msg('loads.tr.snow.derivation.pk', { alpha: a, m: round(m, 3), pk: round(pk0 * m, 3) }));

  const index = sink.cases.length;
  const before = sink.distributed.length + sink.nodal.length;
  const pkFlat = round(pk0 * slopeFactor(si.roofSlopeDeg ?? 0, si.slidingPrevented), 3);
  sink.cases.push({ existingId: null, type: 'S', nameKey: 'loads.tr.snow.case', nameParams: { pk: pkFlat } });
  if (layout) {
    for (const pc of layout.pieces) {
      if (chosen ? !(ids.has(pc.elementId) && (pc.roof || !layout.roof.has(pc.elementId))) : !pc.roof) continue;
      const p = pk(pc.elementId, pc.panel);
      sink.distributed.push({ elementId: pc.elementId, caseType: 'S', caseIndex: index, q: -p * pc.wI, qJ: -p * pc.wJ, ...(pc.a !== undefined ? { a: pc.a, b: pc.b } : {}), frame: 'projected' });
    }
    for (const pt of layout.points) {
      if (chosen ? !ids.has(pt.elementId) : !pt.roof) continue;
      sink.nodal.push({ nodeId: pt.nodeId, caseType: 'S', caseIndex: index, fx: 0, fy: 0, fz: -pk(pt.elementId, pt.panel) * pt.w, carrier: pt.elementId });
    }
    for (const w of layout.widthMembers) {
      if (!(chosen ? ids.has(w.elementId) : layout.roof.has(w.elementId))) continue;
      const p = pk(w.elementId);
      if (!w.spans) { sink.distributed.push({ elementId: w.elementId, caseType: 'S', caseIndex: index, q: -p * input.tributaryWidth, frame: 'projected' }); continue; }
      for (const s of w.spans) sink.distributed.push({ elementId: w.elementId, caseType: 'S', caseIndex: index, q: -p * s.width, a: s.t0 * w.length, b: s.t1 * w.length, frame: 'projected' });
    }
    if (layout.roofQuads.size > 0) sink.unsupportedKeys.push(msg('loads.tr.snow.note.shells'));
  } else {
    for (const id of ids) sink.distributed.push({ elementId: id, caseType: 'S', caseIndex: index, q: -pk(id) * input.tributaryWidth, frame: 'projected' });
  }
  if (sink.distributed.length + sink.nodal.length === before) { sink.cases.pop(); return false; }
  sink.unsupportedKeys.push(msg('loads.tr.snow.note.uniformOnly'));
  return true;
}
