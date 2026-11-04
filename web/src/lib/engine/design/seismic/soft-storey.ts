/**
 * Soft storeys: a storey much less stiff than the ones above it (an open ground floor, lighter
 * infill) concentrates the earthquake's deformation, and its members' forces are amplified.
 *
 * The stiffness of a storey in a direction is its shear over its drift under a seismic case:
 * the shear is the sum of the case's horizontal loads at and above the storey's top. A storey is
 * flagged soft when its stiffness is under 70 % of the storey above, or under 80 % of the mean of
 * the three above (the usual irregularity test). The project marks which storeys to amplify; the
 * flags only propose. Amplification multiplies the moments and the shears of the members of a
 * marked storey in the combinations that carry the earthquake, by member kind.
 */
import type { SoftKind, SoftStoreys } from '../../../model/seismic-design';
import type { ElementStationResult, ElementDesignDemands } from '../../station-design-forces';

export interface StoreyStiffness {
  level: number; levelName?: string;
  shearX: number; shearY: number; driftX: number; driftY: number;
  kX: number | null; kY: number | null;
  soft: boolean;
  /** Stiffness over the storey above's, the worse direction. */
  ratio: number | null;
}

export function storeyStiffness(
  storeys: ReadonlyArray<{ level: number; levelName?: string; driftX: number; driftY: number }>,
  loads: ReadonlyArray<{ z: number; fx: number; fy: number }>,
): StoreyStiffness[] {
  const sorted = [...storeys].sort((a, b) => a.level - b.level);
  const out = sorted.map((s) => {
    const above = loads.filter((l) => l.z >= s.level - 1e-6);
    const shearX = Math.abs(above.reduce((a, l) => a + l.fx, 0)), shearY = Math.abs(above.reduce((a, l) => a + l.fy, 0));
    const k = (v: number, d: number) => (v > 1e-9 && Math.abs(d) > 1e-12 ? v / Math.abs(d) : null);
    return { level: s.level, ...(s.levelName ? { levelName: s.levelName } : {}), shearX, shearY, driftX: s.driftX, driftY: s.driftY, kX: k(shearX, s.driftX), kY: k(shearY, s.driftY), soft: false, ratio: null as number | null };
  });
  for (let i = 0; i < out.length; i++) {
    let worst: number | null = null;
    for (const dir of ['kX', 'kY'] as const) {
      const ki = out[i]![dir];
      const up = out.slice(i + 1, i + 4).map((s) => s[dir]).filter((v): v is number => v !== null);
      if (ki === null || up.length === 0) continue;
      const r = ki / up[0]!;
      worst = worst === null ? r : Math.min(worst, r);
      if (ki < 0.7 * up[0]! || (up.length >= 3 && ki < 0.8 * (up.reduce((a, v) => a + v, 0) / up.length))) out[i]!.soft = true;
    }
    out[i]!.ratio = worst;
  }
  return out;
}

/** The storey a member belongs to: the one whose top is the member's upper end (or its level, for a beam). */
export function storeyOf(levels: readonly number[], zTop: number): number | null {
  const hit = levels.find((l) => Math.abs(l - zTop) < 0.05);
  return hit ?? null;
}

/**
 * Amplify a member's design forces in place: moments by `moment`, shears by `shear`, only in the
 * combinations `seismic` names. Returns whether anything changed.
 */
export function amplify(
  stations: ElementStationResult | undefined, demands: ElementDesignDemands | undefined,
  seismic: ReadonlySet<number>, factor: { moment: number; shear: number },
): boolean {
  if ((factor.moment === 1 && factor.shear === 1) || seismic.size === 0) return false;
  let changed = false;
  for (const c of stations?.comboResults ?? []) {
    if (!seismic.has(c.comboId)) continue;
    c.stations = c.stations.map((s) => ({ ...s, my: s.my * factor.moment, mz: s.mz * factor.moment, vy: s.vy * factor.shear, vz: s.vz * factor.shear }));
    changed = true;
  }
  for (const d of demands?.demands ?? []) {
    if (!seismic.has(d.comboId)) continue;
    const f = d.category.startsWith('M') ? factor.moment : d.category.startsWith('V') ? factor.shear : 1;
    d.value *= f; d.absValue *= f;
    d.forces = { ...d.forces, my: d.forces.my * factor.moment, mz: d.forces.mz * factor.moment, vy: d.forces.vy * factor.shear, vz: d.forces.vz * factor.shear };
    changed = true;
  }
  return changed;
}

export function softFactor(s: SoftStoreys, kind: SoftKind): { moment: number; shear: number } {
  return { moment: s.moment[kind], shear: s.shear[kind] };
}
