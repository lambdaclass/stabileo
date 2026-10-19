/**
 * Sizing a footing on the general path, in one of three modes:
 *
 *   full       from the pre-size (`presize.ts`), grown until every check holds;
 *   minimum    from the footing's present size, which is kept as the least it may be;
 *   reinforce  the size is left alone and only the bars are designed again.
 *
 * Growing: bearing, overturning or a pile over capacity widens the plan by 10 cm (a strip only
 * across the wall, a pile cap one pile more), shear or punching thickens it by 5 cm, in that order
 * and one step at a time, since a wider base changes the shear and a thicker one the weight. A
 * footing held at a property line keeps its column at the line. A footing whose dimensions are
 * locked is not sized. Fixed bars do not stop the sizing; the design checks them afterwards.
 */
import { designGeneralFooting, type GeneralFootingInput } from './general-footing';
import { presizeFooting } from '../../model/foundation/presize';
import { capPlan } from '../../model/foundation/piles';
import { serviceGravity } from '../detailing/service-reaction';
import type { Footing } from '../../model/footing';

export type SizingMode = 'full' | 'minimum' | 'reinforce';

export interface SizingResult {
  /** The size reached: what to write on the footing. Empty when nothing changes. */
  size: Partial<Pick<Footing, 'B' | 'L' | 'thickness' | 'eccentricityB' | 'eccentricityL' | 'rotationDeg' | 'piles'>>;
  reached: boolean;
  utilization: number;
  steps: number;
  reason?: 'locked' | 'refused' | 'limit' | 'unchanged';
}

const STEP_PLAN = 0.1, STEP_T = 0.05, MAX_PLAN = 15, MAX_T = 2.5;
const up = (v: number) => Math.ceil(v / 0.05 - 1e-9) * 0.05;

export function sizeFooting(i: GeneralFootingInput & { mode: SizingMode }): SizingResult {
  const f0 = i.footing;
  if (i.mode === 'reinforce') return { size: {}, reached: true, utilization: NaN, steps: 0, reason: 'unchanged' };
  if (f0.locked?.dimensions) return { size: {}, reached: false, utilization: NaN, steps: 0, reason: 'locked' };
  let f: Footing = { ...f0, mats: undefined };
  const col = i.columnAt(f.nodeId);
  if (i.mode === 'full') {
    const ids = [f.nodeId, ...(f.supportedNodeIds ?? [])];
    const loads = ids.map((id) => {
      const c = i.reactions.get(id)?.cases, n = i.nodes.get(id);
      return { x: n?.x ?? 0, y: n?.y ?? 0, axial: (c && serviceGravity(c)?.axial) || 0 };
    });
    const thickness = f.kind === 'pileCap' ? Math.max(0.6, 2 * (f.piles?.diameter ?? 0.4)) : 0.4;
    const p = presizeFooting({
      kind: f.kind, loads, allowableKPa: i.allowable ?? 0, thickness,
      ...(col ? { column: { x: col.b, y: col.h } } : {}), ...(f.anchor ? { anchor: f.anchor } : {}),
      ...(f.kind === 'pileCap' && i.pileCapacity ? { pile: { capacity: i.pileCapacity, diameter: f.piles?.diameter ?? 0.5, length: f.piles?.length ?? 12 } } : {}),
    });
    if ('refused' in p) return { size: {}, reached: false, utilization: NaN, steps: 0, reason: 'refused' };
    f = { ...f, B: p.B, L: p.L, thickness, rotationDeg: f.kind === 'isolated' || f.kind === 'pileCap' ? f.rotationDeg : p.rotationDeg, eccentricityB: p.eccentricityB, eccentricityL: p.eccentricityL, ...(p.piles ? { piles: p.piles } : {}) };
  }
  // A footing at a property line keeps its column there as it grows.
  const anchored = (g: Footing): Footing => {
    if (g.kind !== 'isolated' || !g.anchor) return g;
    const [ax, ay] = g.anchor, cx = col?.b ?? 0, cy = col?.h ?? 0;
    return { ...g, eccentricityB: ax ? -ax * (g.B / 2 - cx / 2) : g.eccentricityB, eccentricityL: ay ? -ay * (g.L / 2 - cy / 2) : g.eccentricityL };
  };
  let steps = 0, utilization = NaN;
  for (; steps < 200; steps++) {
    const d = designGeneralFooting({ ...i, footing: f });
    if ('refused' in d) return { size: {}, reached: false, utilization: NaN, steps, reason: 'refused' };
    utilization = d.utilization;
    let bearing: boolean, shear: boolean;
    if ('cap' in d.result) {
      const c = d.result.cap;
      bearing = c.piles.tension || c.piles.utilization > 1 + 1e-9;
      shear = Math.max(c.x.shear.utilization, c.y.shear.utilization, c.punching.column, c.punching.cornerPile) > 1 + 1e-9;
    } else {
      const r = d.result.rigid;
      bearing = !r.bearing.ok || r.overturns;
      shear = Math.max(r.x.shear.utilization, r.y.shear.utilization, ...r.punching.map((p) => p.utilization)) > 1 + 1e-9;
    }
    if (!bearing && !shear) return { size: sizeOf(f, f0), reached: true, utilization, steps };
    if (bearing) {
      if (f.kind === 'pileCap' && f.piles) {
        const piles = { ...f.piles, count: f.piles.count + 1 }, plan = capPlan(piles);
        f = { ...f, piles, B: Math.max(f.B, up(plan.B)), L: Math.max(f.L, up(plan.L)) };
      } else if (f.kind === 'strip') f = { ...f, L: +(f.L + STEP_PLAN).toFixed(3) };
      else f = anchored({ ...f, B: +(f.B + STEP_PLAN).toFixed(3), L: +(f.L + STEP_PLAN).toFixed(3) });
    } else f = { ...f, thickness: +(f.thickness + STEP_T).toFixed(3) };
    if (f.B > MAX_PLAN || f.L > MAX_PLAN || f.thickness > MAX_T || (f.piles?.count ?? 0) > 30) break;
  }
  return { size: sizeOf(f, f0), reached: false, utilization, steps, reason: 'limit' };
}

function sizeOf(f: Footing, f0: Footing): SizingResult['size'] {
  const out: SizingResult['size'] = {};
  for (const k of ['B', 'L', 'thickness', 'eccentricityB', 'eccentricityL', 'rotationDeg'] as const) if (Math.abs(f[k] - f0[k]) > 1e-9) out[k] = f[k];
  if (f.piles && JSON.stringify(f.piles) !== JSON.stringify(f0.piles)) out.piles = f.piles;
  return out;
}
