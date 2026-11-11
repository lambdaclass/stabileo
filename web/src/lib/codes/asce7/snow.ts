import { slopeFactor } from '../cirsoc104/snow';
import { msg, round } from '../message';
import type { ClauseRef } from '../regulation';
import { roofMembers } from '../../engine/loads/wind-cases';
import type { GravityLayout } from '../../engine/loads/plan-gravity';
import type { LoadPlanInput, PlanSink } from '../../engine/loads/load-plan';
import { ADAPTER, codeInput, SNOW_DEFAULTS, type Asce7SnowInput, type RiskCategory } from './inputs';
import { A7, PSF } from './refs';

export const REF_SNOW = {
  pg: A7('7.2', 'ground snow loads'),
  pf: A7('7.3-1', 'flat roof snow load'),
  ce: A7('Table 7.3-1', 'exposure factor'),
  ct: A7('Table 7.3-2', 'thermal factor'),
  pm: A7('7.3.4', 'minimum snow load for low-slope roofs'),
  ps: A7('7.4-1', 'sloped roof snow load'),
  cs: A7('Figure 7.4-1', 'roof slope factor'),
};

export const PM_MAX_PSF: Readonly<Record<RiskCategory, number>> = { I: 25, II: 30, III: 35, IV: 40 };
export const LOW_SLOPE_DEG = 15;

export interface Asce7RoofSnow { pf: number; pm: number | null; cs: number; ps: number; balanced: number; csTyped: boolean; refs: ClauseRef[] }

export function roofSnow7(i: { pg: number; ce: number; ct: number; riskCategory: RiskCategory; slopeDeg: number; slippery: boolean; cs?: number }): Asce7RoofSnow {
  const pf = 0.7 * i.ce * i.ct * i.pg;
  const refs = [REF_SNOW.pg, REF_SNOW.pf, REF_SNOW.ce, REF_SNOW.ct, REF_SNOW.ps, REF_SNOW.cs];
  const csTyped = i.cs !== undefined;
  const cs = csTyped ? i.cs! : slopeFactor(i.slopeDeg, i.ct, i.slippery);
  const ps = cs * pf;
  const pm = i.slopeDeg < LOW_SLOPE_DEG && i.pg > 0 ? Math.min(i.pg, PM_MAX_PSF[i.riskCategory] * PSF) : null;
  if (pm !== null) refs.push(REF_SNOW.pm);
  return { pf, pm, cs, ps, balanced: Math.max(ps, pm ?? 0), csTyped, refs };
}

const Z = (n: { z?: number }) => n.z ?? 0;

export function planAsce7Snow(input: LoadPlanInput, sink: PlanSink, layout?: GravityLayout): boolean {
  if (!input.snow?.enabled) return false;
  const ci = codeInput<Asce7SnowInput>(input, ADAPTER.snow);
  const { cases, distributed, nodal, derivation, refs, unsupportedKeys, blockedKeys, assumptions } = sink;
  if (!(ci.pg !== undefined && ci.pg >= 0)) { blockedKeys.push(msg('loads.asce7.snow.blocked.noPg')); return false; }
  const chosen = input.snow.roof ? new Set(input.snow.roof) : undefined;
  const roof = roofMembers(input.model, chosen);
  if (!roof.length) { unsupportedKeys.push(msg(chosen ? 'snow.note.emptyRegion' : 'snow.note.noRoof')); return false; }
  const sloped = roof.filter((m) => Math.abs(m.dz) / Math.max(m.lh, 1e-9) > Math.tan(Math.PI / 180));
  const measured = sloped.length ? sloped.reduce((s, m) => s + (Math.atan(Math.abs(m.dz) / Math.max(m.lh, 1e-9)) * 180) / Math.PI, 0) / sloped.length : 0;
  const slopeDeg = ci.roofSlopeDeg ?? input.snow.roofSlopeDeg ?? measured;
  const riskCategory = ci.riskCategory ?? SNOW_DEFAULTS.riskCategory;
  const ce = ci.ce ?? SNOW_DEFAULTS.ce, ct = ci.ct ?? SNOW_DEFAULTS.ct;
  if (ci.ce === undefined) assumptions.push(msg('loads.asce7.snow.assumption.ce', { ce }));
  if (ci.ct === undefined) assumptions.push(msg('loads.asce7.snow.assumption.ct', { ct }));
  const r = roofSnow7({ pg: ci.pg, ce, ct, riskCategory, slopeDeg, slippery: ci.slippery ?? SNOW_DEFAULTS.slippery, cs: ci.cs });
  if (!r.csTyped) assumptions.push(msg('loads.asce7.snow.assumption.csCurve'));
  refs.push(...r.refs);
  derivation.push(msg('loads.asce7.snow.derivation.pf', { pg: round(ci.pg, 3), ce, ct, pf: round(r.pf, 3) }));
  derivation.push(msg('loads.asce7.snow.derivation.ps', { slope: round(slopeDeg, 1), cs: round(r.cs, 3), ps: round(r.ps, 3) }));
  if (r.pm !== null) derivation.push(msg(r.pm > r.ps ? 'loads.asce7.snow.derivation.pmGoverns' : 'loads.asce7.snow.derivation.pm', { rc: riskCategory, pm: round(r.pm, 3), ps: round(r.ps, 3) }));
  unsupportedKeys.push(msg('loads.asce7.snow.unsupported.notCovered'));
  sink.snowRetains = r.cs >= 1;

  const p = r.balanced;
  const index = cases.length;
  cases.push({ existingId: null, type: 'S', nameKey: 'snow.case.balanced', nameParams: { ps: +p.toFixed(3), pf: +r.pf.toFixed(3) } });
  const put = (d: { elementId: number; q: number; qJ?: number; a?: number; b?: number; frame?: 'projected' }) => distributed.push({ ...d, caseType: 'S', caseIndex: index });
  if (p <= 0) return true;
  if (layout) {
    const mine = (id: number, onRoof: boolean) => (chosen ? chosen.has(id) && (onRoof || !layout.roof.has(id)) : onRoof);
    for (const pc of layout.pieces) if (mine(pc.elementId, pc.roof)) put({ elementId: pc.elementId, q: -p * pc.wI, qJ: -p * pc.wJ, ...(pc.a !== undefined ? { a: pc.a, b: pc.b } : {}), frame: 'projected' });
    for (const wm of layout.widthMembers) {
      if (chosen ? !chosen.has(wm.elementId) : !layout.roof.has(wm.elementId)) continue;
      if (!wm.spans) { put({ elementId: wm.elementId, q: -p * input.tributaryWidth, frame: 'projected' }); continue; }
      for (const s of wm.spans) put({ elementId: wm.elementId, q: -p * s.width, a: s.t0 * wm.length, b: s.t1 * wm.length, frame: 'projected' });
    }
    for (const pt of layout.points) if (mine(pt.elementId, pt.roof)) nodal.push({ nodeId: pt.nodeId, caseType: 'S', caseIndex: index, fx: 0, fy: 0, fz: -p * pt.w, carrier: pt.elementId });
    return true;
  }
  for (const m of roof) {
    const e = input.model.elements.get(m.id)!;
    const a = input.model.nodes.get(e.nodeI)!, b = input.model.nodes.get(e.nodeJ)!;
    const L = Math.hypot(m.dx, m.dy, m.dz);
    if (L < 1e-9) continue;
    const cos = m.lh / L, wq = p * input.tributaryWidth;
    put({ elementId: m.id, q: -wq * cos * cos });
    const fAx = -wq * m.lh * (m.dz / L);
    if (Math.abs(fAx) > 1e-9) for (const id of [e.nodeI, e.nodeJ]) nodal.push({ nodeId: id, caseType: 'S', caseIndex: index, fx: (fAx / 2) * (m.dx / L), fy: (fAx / 2) * (m.dy / L), fz: (fAx / 2) * ((Z(b) - Z(a)) / L) });
  }
  return true;
}
