/**
 * The snow of a load plan: CIRSOC 104-2005 roof snow as load cases, the balanced pattern and,
 * where the roof asks for them, the unbalanced ones, grouped as alternatives. Moved out of
 * `load-plan.ts` as it was; returns whether any snow case was planned.
 */
import { snowLoadCases } from './snow-loads';
import { msg, round } from '../../codes/message';
import type { LoadPlanInput, PlanSink } from './load-plan';
import type { GravityLayout } from './plan-gravity';

/** The alternatives group of the snow patterns the planner generates for one roof. */
export const SNOW_PATTERNS = 'snow-roof';

/** With `layout`, the snow goes by the plan's panels, with the drifts and sliding snow (`snow-loads.ts`). */
export function planSnow(input: LoadPlanInput, sink: PlanSink, layout?: GravityLayout): boolean {
  const { cases, nodal, distributed, derivation, refs, unsupportedKeys, blockedKeys } = sink;
  let snowPlanned = false;
  if (input.snow?.enabled) {
    const sn = input.snow;
    const out = snowLoadCases({ model: input.model, snow: sn, tributaryWidth: input.tributaryWidth, layout });
    if (!out) {
      unsupportedKeys.push(msg('snow.note.noRoof'));
    } else if (out.result.refused) {
      blockedKeys.push(msg(out.result.refused));
    } else {
      const r = out.result;
      refs.push(...r.refs);
      derivation.push(msg('snow.derivation.pf', {
        pg: round(sn.pg, 2), source: sn.source, ce: r.ce, ct: r.ct, i: r.importance,
        pf: round(r.pfComputed, 3),
      }));
      if (r.pfMinimum !== null) derivation.push(msg('snow.derivation.minimum', { min: round(r.pfMinimum, 3), pf: round(r.pf, 3) }));
      derivation.push(msg('snow.derivation.ps', {
        slope: round(sn.roofSlopeDeg ?? out.geometry.slopeDeg, 1), cs: round(r.cs, 3), ps: round(r.ps, 3),
        w: round(out.geometry.W, 2),
      }));
      // The roof surfaces of another slope, each with its own C_s (`snow-loads.ts`).
      for (const sf of out.surfaces) derivation.push(msg('snow.derivation.psSurface', { slope: round(sf.slopeDeg, 1), cs: round(sf.cs, 3), ps: round(sf.ps, 3) }));
      if (r.rainOnSnow > 0) derivation.push(msg('snow.derivation.rain', { add: round(r.rainOnSnow, 3) }));
      if (r.unbalanced) {
        derivation.push(msg('snow.derivation.unbalanced', {
          leeward: round(r.unbalanced.leeward, 3), windward: round(r.unbalanced.windward, 3),
        }));
      }
      if ((sn.roofSlopeDeg ?? out.geometry.slopeDeg) < 1.2) unsupportedKeys.push(msg('snow.note.ponding'));
      derivation.push(...out.derivation);
      refs.push(...out.refs);
      // Drifts and sliding snow are read off the panels; by width there are none to read.
      unsupportedKeys.push(msg(layout ? 'snow.note.notCoveredPanels' : 'snow.note.notCovered'));
      // Balanced and unbalanced are the same snow on the same roof, three ways: alternatives.
      const alternatives = out.cases.length > 1 ? SNOW_PATTERNS : undefined;
      for (const c of out.cases) {
        const index = cases.length;
        cases.push({ existingId: null, type: 'S', nameKey: c.nameKey, nameParams: c.nameParams, ...(alternatives ? { alternatives } : {}), ...(c.pattern ? { pattern: true } : {}) });
        for (const d of c.distributed) distributed.push({ ...d, caseType: 'S', caseIndex: index });
        for (const n of c.nodal) nodal.push({ nodeId: n.nodeId, caseType: 'S', caseIndex: index, fx: n.fx, fy: n.fy, fz: n.fz, ...(n.carrier !== undefined ? { carrier: n.carrier } : {}) });
        snowPlanned = true;
      }
    }
  }

  return snowPlanned;
}
