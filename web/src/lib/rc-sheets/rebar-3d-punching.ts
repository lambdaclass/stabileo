import type { BendRules } from './shape';
import { punchingLeg, punchingLegLength, type PieceOptions } from './schedule/pieces';
import { punchingLegs } from './punching-bars';
import type { PunchingFigure, PunchingRow } from './punching-row';
import { barOf, laid, type Frame, type Rebar3d } from './rebar-3d-geometry';

/** A punching joint's stirrup legs where the plan puts them, each standing through the slab from its node's mid-plane. */
export function punchingBars3d(r: PunchingRow, fig: PunchingFigure, f: Frame, o: PieceOptions, R: BendRules): Rebar3d[] {
  const shape = punchingLeg(r, fig.reinforcement!.legDiameter, o, R), len = punchingLegLength(r, o);
  const base = { element: r.key, rows: [r.key], family: 'punching' as const, ...(r.level !== undefined ? { level: r.level } : {}), kind: 'punchingLeg' as const, tone: 'punching' as const };
  return punchingLegs(fig).map(([x, y]) => barOf(shape, laid(shape, f, (u, w) => [x + w, y, -len / 2 + u]), base));
}
