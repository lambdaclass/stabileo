import { msg, round } from '../message';
import { roofMembers } from '../../engine/loads/wind-cases';
import { roofGeometry, snowSlopes } from '../../engine/loads/snow-loads';
import { SNOW_PATTERNS } from '../../engine/loads/load-plan-snow';
import { widthSpans, type GravityLayout } from '../../engine/loads/plan-gravity';
import type { LoadPlanInput, PlannedDistributed, PlannedNodal, PlanSink } from '../../engine/loads/load-plan';
import { EN1991_1_3, UK_NA_1991_1_3, type EcFamily } from './refs';
import { SNOW_ADAPTER, SNOW_DEFAULTS, type EcSnowInput, type SnowExposure, type UkSnowInput } from './inputs';

export const EXPOSURE_CE: Readonly<Record<SnowExposure, number>> = { windswept: 0.8, normal: 1.0, sheltered: 1.2 };

export function mu1(alphaDeg: number): number {
  if (alphaDeg <= 30) return 0.8;
  return alphaDeg < 60 ? 0.8 * (60 - alphaDeg) / 30 : 0;
}

export function ukGroundSnow(zone: number, altitudeM: number): number {
  return 0.15 + (0.1 * zone + 0.05) + (altitudeM - 100) / 525;
}

export function roofSnowLoad(mu: number, ce: number, ct: number, sk: number): number { return mu * ce * ct * sk; }

type Arrangement = 'i' | 'ii' | 'iii';
const FACTORS: Readonly<Record<Arrangement, [number, number]>> = { i: [1, 1], ii: [0.5, 1], iii: [1, 0.5] };

export function planEcSnow(family: EcFamily, input: LoadPlanInput, sink: PlanSink, layout?: GravityLayout): boolean {
  if (!input.snow?.enabled) return false;
  const { cases, nodal, distributed, derivation, refs, unsupportedKeys, blockedKeys } = sink;
  const ci = { ...SNOW_DEFAULTS, ...((input.codeInputs?.[SNOW_ADAPTER[family]] ?? {}) as EcSnowInput & UkSnowInput) };
  let sk: number;
  if (family === 'uk') {
    if (!(ci.zone! > 0) || ci.altitude === undefined) { blockedKeys.push(msg('loads.ec.blocked.ukSnow')); return false; }
    sk = ukGroundSnow(ci.zone!, ci.altitude);
    refs.push(UK_NA_1991_1_3('NA.2.8', 'sk from zone and altitude'));
    derivation.push(msg('loads.ec.snow.ukSk', { z: ci.zone!, a: round(ci.altitude, 0), sk: round(sk, 3) }));
  } else {
    if (!(ci.sk! > 0)) { blockedKeys.push(msg('loads.ec.blocked.sk')); return false; }
    sk = ci.sk!;
  }
  const geometry = roofGeometry(input.model);
  const chosen = input.snow?.roof ? new Set(input.snow.roof) : undefined;
  const roof = roofMembers(input.model, chosen);
  if (!geometry || roof.length === 0) { unsupportedKeys.push(msg(chosen ? 'snow.note.emptyRegion' : 'snow.note.noRoof')); return false; }
  // μ1 by the slope of each surface (`snowSlopes`): a panel the slope of the roof over it, flat when none.
  const slopes = snowSlopes(input.model, layout);
  const ce = EXPOSURE_CE[ci.exposure], ct = ci.ct;
  const nodes = input.model.nodes;
  const span = (() => {
    const c = [...nodes.values()].map((n) => (geometry.axis === 'x' ? n.x : n.y));
    return Math.max(...c) - Math.min(...c);
  })();
  const sideOf = (id: number): 0 | 1 | 2 => {
    const e = input.model.elements.get(id);
    const a = e && nodes.get(e.nodeI), b = e && nodes.get(e.nodeJ);
    if (!a || !b) return 0;
    const c = geometry.axis === 'x' ? (a.x + b.x) / 2 : (a.y + b.y) / 2;
    if (Math.abs(c - geometry.ridge) <= 1e-3 * Math.max(span, 1)) return 0;
    return c < geometry.ridge ? 1 : 2;
  };
  const slopeOf = (id: number, panel?: number) => slopes.of(id, panel);
  const muOf = (id: number, panel?: number) => (ci.slidingPrevented ? Math.max(mu1(slopeOf(id, panel)), 0.8) : mu1(slopeOf(id, panel)));
  const sloped = roof.filter((m) => slopeOf(m.id) > 1);
  const duo = ci.roof === 'duopitch' && sloped.some((m) => sideOf(m.id) === 1) && sloped.some((m) => sideOf(m.id) === 2);
  if (ci.roof === 'duopitch' && !duo) derivation.push(msg('loads.ec.snow.duoAsMono'));
  const sOf = (id: number, arr: Arrangement, panel?: number) => {
    const [k1, k2] = FACTORS[arr], side = sideOf(id);
    const k = side === 1 ? k1 : side === 2 ? k2 : (k1 + k2) / 2;
    return roofSnowLoad(k * muOf(id, panel), ce, ct, sk);
  };

  refs.push(
    EN1991_1_3('5.2', 'roof snow load, eq. 5.1'), EN1991_1_3('Table 5.1', 'Ce'), EN1991_1_3('5.2(8)', 'Ct'),
    EN1991_1_3('Table 5.2', 'mu1'), EN1991_1_3(duo ? '5.3.3' : '5.3.2', duo ? 'duopitch, Figure 5.3' : 'monopitch, Figure 5.2'),
  );
  derivation.push(msg('loads.ec.snow.basis', { sk: round(sk, 3), ce, ct, roof: msg(duo ? 'loads.ec.snowRoof.duopitch' : 'loads.ec.snowRoof.monopitch') }));
  const seen = new Set<number>();
  const surface = (id: number, panel?: number) => {
    const a = round(slopeOf(id, panel), 1);
    if (seen.has(a)) return;
    seen.add(a);
    derivation.push(msg('loads.ec.snow.surface', { slope: a, mu: round(muOf(id, panel), 3), s: round(roofSnowLoad(muOf(id, panel), ce, ct, sk), 3) }));
  };
  for (const m of roof) surface(m.id);
  if (layout) for (const pc of layout.pieces) if (pc.roof) surface(pc.elementId, pc.panel);
  unsupportedKeys.push(msg('loads.ec.snow.notCovered'));

  const roofIds = new Set(roof.map((m) => m.id));
  const arrangements: Arrangement[] = duo ? ['i', 'ii', 'iii'] : ['i'];
  for (const arr of arrangements) {
    const index = cases.length;
    const d: PlannedDistributed[] = [], n: PlannedNodal[] = [];
    if (layout) {
      // The roof the person chose, as the other codes read it; none chosen: what the layout calls roof.
      const mine = (id: number, onRoof: boolean) => (chosen ? chosen.has(id) && (onRoof || !layout.roof.has(id)) : onRoof);
      for (const pc of layout.pieces) {
        if (!mine(pc.elementId, pc.roof)) continue;
        const s = sOf(pc.elementId, arr, pc.panel);
        if (s > 0) d.push({ elementId: pc.elementId, caseType: 'S', caseIndex: index, q: -s * pc.wI, qJ: -s * pc.wJ, ...(pc.a !== undefined ? { a: pc.a, b: pc.b } : {}), frame: 'projected' });
      }
      for (const w of layout.widthMembers) {
        if (chosen ? !chosen.has(w.elementId) : !layout.roof.has(w.elementId)) continue;
        const s = sOf(w.elementId, arr);
        if (!(s > 0)) continue;
        for (const sp of widthSpans(w, input.tributaryWidth)) {
          d.push({ elementId: w.elementId, caseType: 'S', caseIndex: index, q: -s * sp.width, ...(w.spans ? { a: sp.t0 * w.length, b: sp.t1 * w.length } : {}), frame: 'projected' });
        }
      }
      for (const pt of layout.points) {
        if (!mine(pt.elementId, pt.roof)) continue;
        const s = sOf(pt.elementId, arr, pt.panel);
        if (s > 0) n.push({ nodeId: pt.nodeId, caseType: 'S', caseIndex: index, fx: 0, fy: 0, fz: -s * pt.w, carrier: pt.elementId });
      }
    } else {
      for (const id of roofIds) {
        const s = sOf(id, arr);
        if (s > 0) d.push({ elementId: id, caseType: 'S', caseIndex: index, q: -s * input.tributaryWidth, frame: 'projected' });
      }
    }
    if (!d.length && !n.length) continue;
    cases.push({ existingId: null, type: 'S', nameKey: `loads.ec.snowCase.${arr}`, nameParams: {}, ...(arrangements.length > 1 ? { alternatives: SNOW_PATTERNS } : {}) });
    distributed.push(...d);
    nodal.push(...n);
  }
  sink.snowRetains = false;
  return cases.some((c) => c.type === 'S');
}
