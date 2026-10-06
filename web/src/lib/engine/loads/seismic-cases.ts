/**
 * The seismic load cases of a plan, from the force each level takes in each direction
 * (`load-plan.ts`, by the static method of Cap. 6 or the modal one of Cap. 7).
 *
 * ── Accidental torsion, §6.2.4.2 ───────────────────────────────────
 *
 * Each level adds a moment Mta,k = Fk·eak about the vertical, eak from Tabla 6.3 by the torsional
 * irregularity: none for a regular plan or a low irregularity, 5 % of the plan's length across
 * the forces for a medium one, 10 % for an extreme one. Its sign is either, so a direction with
 * torsion is two cases, +e and −e. The moment is spread over the level's nodes the way the wind's
 * torsion is (`wind-cases.ts`): forces with no resultant and moment Mta about the plan's centre.
 *
 * ── A third direction, §3.2 ──────────────────────────────────────
 *
 * When the lateral systems are not in two perpendicular directions, the action is also applied at
 * 45° to them: the larger of the two directions' forces, split equally along X and Y.
 *
 * Pure: no store.
 */
import { levelLoads, type WindModel } from './wind-cases';

export type TorsionalIrregularity = 'low' | 'medium' | 'extreme';
/** Tabla 6.3: eak as a fraction of the plan's length across the forces. */
export const ACCIDENTAL_ECCENTRICITY: Readonly<Record<TorsionalIrregularity, number>> = Object.freeze({ low: 0, medium: 0.05, extreme: 0.1 });

export interface SeismicCasesInput {
  nodes: WindModel['nodes'];
  levels: ReadonlyArray<{ elevation: number; nodeIds: number[] }>;
  /** The force at each level, kN, in each direction. */
  forcesX: readonly number[];
  forcesY: readonly number[];
  directions: { x: boolean; y: boolean };
  torsion?: TorsionalIrregularity;
  diagonal?: boolean;
}

export interface SeismicCase {
  nameKey: string;
  nameParams: Record<string, string | number>;
  /** Which `directions` axis it is (for a case already in the model), or 'diagonal'. */
  axis: 'X' | 'Y' | 'diagonal';
  nodal: Array<{ nodeId: number; fx: number; fy: number; mz: number }>;
}

export function seismicCases(i: SeismicCasesInput): SeismicCase[] {
  const e = ACCIDENTAL_ECCENTRICITY[i.torsion ?? 'low'];
  const extent = (ids: number[], axis: 'x' | 'y') => {
    const v = ids.map((id) => i.nodes.get(id)).filter((n): n is NonNullable<typeof n> => !!n).map((n) => n[axis]);
    return v.length ? Math.max(...v) - Math.min(...v) : 0;
  };
  const out: SeismicCase[] = [];
  for (const axis of ['X', 'Y'] as const) {
    if (!(axis === 'X' ? i.directions.x : i.directions.y)) continue;
    const forces = axis === 'X' ? i.forcesX : i.forcesY;
    for (const sign of e > 0 ? [1, -1] : [0]) {
      const nodal = i.levels.flatMap((lv, k) => {
        const F = forces[k] ?? 0;
        // The plan's length across the forces: along Y for forces along X.
        const mt = sign * F * e * extent(lv.nodeIds, axis === 'X' ? 'y' : 'x');
        return levelLoads(i.nodes, lv.nodeIds, axis === 'X' ? F : 0, axis === 'Y' ? F : 0, mt);
      });
      out.push(sign === 0
        ? { nameKey: 'autoLoad.seismicCaseDir', nameParams: { dir: axis }, axis, nodal }
        : { nameKey: 'autoLoad.seismicCaseEcc', nameParams: { dir: axis, sign: sign > 0 ? '+' : '−', e: Math.round(e * 100) }, axis, nodal });
    }
  }
  if (i.diagonal) {
    const nodal = i.levels.flatMap((lv, k) => {
      const F = Math.max(Math.abs(i.forcesX[k] ?? 0), Math.abs(i.forcesY[k] ?? 0)) / Math.SQRT2;
      return levelLoads(i.nodes, lv.nodeIds, F, F, 0);
    });
    out.push({ nameKey: 'autoLoad.seismicCaseDir', nameParams: { dir: '45°' }, axis: 'diagonal', nodal });
  }
  return out;
}
