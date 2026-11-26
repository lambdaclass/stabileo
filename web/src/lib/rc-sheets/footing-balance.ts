import { strapForces } from '../engine/foundation/strap-footing';
import type { FootingPlan } from './footing-mechanics';
import type { FootingAction, FootingAdopted, FootingDemand, FootingPosition, StrapPartner } from './footing-types';

/** A strap shorter than this past the footing's own offset levers nothing: its forces would grow without bound. */
const STRAP_MIN_ARM = 0.1;

export type Axis = 'x' | 'y';

/** One axis the structure balances: toward the inside `u` (±1), the footing's offset `along` it, m; a strap's length L or a tie's height H, m. */
export interface BalancedAxis { axis: Axis; u: 1 | -1; along: number; L?: number; H?: number; partner?: StrapPartner }

/**
 * How a footing held at a line reads its loads. Along each axis a strap or a tie balances, the
 * soil sees the column at the centroid (`strap-footing.ts`): a strap adds its end force to the
 * load, V = (P·e + |w|)/(L − e); a tie at the first floor takes P·e + |w| as a couple with the
 * column, T = (P·e + |w|)/H, and adds nothing. Where a strap runs square to the line of an edge
 * footing, the beam carries the footing across it: the footing only cantilevers along the line,
 * from the beam's faces. The rest stays with the soil as an uneven pressure.
 */
export interface Balance {
  position: FootingPosition;
  axes: BalancedAxis[];
  /** The axes a strap beam carries the footing across. */
  carried: Axis[];
  /** The anchored axes left to the soil: no strap partner, no tie height, or an eccentric footing. */
  free: Axis[];
  soilPlan: FootingPlan;
  facePlan: FootingPlan;
  /** The action the soil sees. */
  soil(a: FootingAction, lever: number): FootingAction;
  /** The action punching reads: the column's load, without the moments the structure takes. */
  punch(a: FootingAction): FootingAction;
  /** Each balanced axis's force (a strap's end force, a tie's pull), its moment P·e + |w| and the partner's relief, in the order of `axes`. */
  forces(a: FootingAction, lever: number): { force: number[]; moment: number[]; relief: number[] };
}

/** The shift a column's moment and shear give its load at the underside, kN·m, along X and along Y. */
export const shiftAt = (a: Pick<FootingAction, 'Mx' | 'My' | 'Vx' | 'Vy'>, lever: number): { x: number; y: number } =>
  ({ x: a.My + lever * a.Vx, y: -(a.Mx - lever * a.Vy) });

export function balanceOf(d: FootingDemand, a: Pick<FootingAdopted, 'B' | 'L' | 'ex' | 'ey' | 'straps'>, plan: FootingPlan, lever: number): Balance {
  const e = d.edge;
  const anchor = e?.anchor ?? [0, 0];
  const position: FootingPosition = anchor[0] && anchor[1] ? 'corner' : anchor[0] || anchor[1] ? 'edge' : 'centred';
  const axes: BalancedAxis[] = [], free: Axis[] = [];
  for (const axis of ['x', 'y'] as const) {
    const s = axis === 'x' ? anchor[0] : anchor[1];
    if (!s) continue;
    const u = (s > 0 ? -1 : 1) as 1 | -1, along = (axis === 'x' ? a.ex : a.ey) * u;
    const partner = e?.balance === 'strap' ? e.partners.find((p) => p.axis === axis) : undefined;
    const H = e?.balance === 'tie' && d.column?.storey ? lever + d.column.storey : undefined;
    if (partner && partner.L > along + STRAP_MIN_ARM) axes.push({ axis, u, along, L: partner.L, partner });
    else if (H) axes.push({ axis, u, along, H });
    else free.push(axis);
  }
  const strap = e?.balance === 'strap';
  const carried: Axis[] = strap && position === 'edge' ? axes.map((x) => x.axis) : [];
  const on = (k: Axis) => axes.some((x) => x.axis === k);
  const soilPlan = { ...plan, ...(on('x') ? { xc: 0 } : {}), ...(on('y') ? { yc: 0 } : {}) };
  let facePlan = plan;
  for (const k of carried) {
    const bw = a.straps?.[k]?.b ?? axes.find((x) => x.axis === k)?.partner?.beam?.b ?? 0;
    facePlan = k === 'x' ? { ...facePlan, h: Math.max(facePlan.h, bw) } : { ...facePlan, b: Math.max(facePlan.b, bw) };
  }
  const forces = (x: FootingAction, lever: number) => {
    const w = shiftAt(x, lever), P = Math.abs(x.N);
    const ws = axes.map((k) => (k.axis === 'x' ? w.x : w.y) * k.u);
    const along = axes.map((k) => k.along);
    if (!strap) {
      const moment = axes.map((_, i) => Math.abs(P * along[i]!) + Math.abs(ws[i]!));
      return { force: moment.map((m, i) => m / axes[i]!.H!), moment, relief: axes.map(() => 0) };
    }
    return strapForces(P, along, ws, axes.map((k) => k.L!));
  };
  const strip = (x: FootingAction): FootingAction => ({ ...x, ...(on('x') ? { My: 0, Vx: 0 } : {}), ...(on('y') ? { Mx: 0, Vy: 0 } : {}) });
  return {
    position, axes, carried, free, soilPlan, facePlan,
    soil: (x, lever) => {
      const s = strip(x);
      return strap ? { ...s, N: x.N + forces(x, lever).force.reduce((t, f) => t + f, 0) } : s;
    },
    punch: strip,
    forces,
  };
}
