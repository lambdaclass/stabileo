/**
 * INPRES-CIRSOC 103-2018 Cap. 7, the modal response spectrum method, turned into seismic forces per
 * level (`docs/codes/CIRSOC/markdown/inpres-cirsoc-103-i`, capítulo 7).
 *
 *   §7.2.2  each mode's ordinate is Cm = Sam·γr/R, the elastic spectrum of §3.5.1 at its period;
 *   §7.2.3  enough modes for 90 % of the mass in each direction analysed;
 *   §7.2.4  the modal effects combined by complete quadratic combination (CQC);
 *   §7.2.5  when the modal base shear Vod is under 85 % of the static one Voe, every effect is
 *           multiplied by 0,85·Voe/Vod.
 *
 * ── Levels ────────────────────────────────────────────────────────
 *
 * The masses are the plan's levels, the same weights the static method distributes, and each
 * mode's shape at a level is the mean horizontal displacement of the level's nodes in the
 * direction analysed. From them, per mode m: Γm = Σ Wk φk / Σ Wk φk², the effective mass ratio
 * (Σ Wk φk)² / (Σ Wk φk² · Σ Wk), and the force at level k, Fkm = Γm φkm Wk Cm. The participation
 * is computed here from the same masses the forces use, so it does not depend on how a mode
 * shape was normalised.
 *
 * The shear in each storey is combined over the modes by CQC (ρ of Der Kiureghian, 5 %
 * damping, the spectrum's), and a level's force is the difference of the combined shears above
 * and below it: combined forces are not added, their shears are.
 *
 * Pure: no store.
 */

export interface ModalLevel { elevation: number; weightKN: number; nodeIds: number[] }
export interface ModeShape { period: number; shape: Map<number, { ux: number; uy: number }> }

export interface ModalForces {
  /** Combined force per level, kN, in the order of `levels`. */
  forces: number[];
  /** Combined base shear Vod, kN. */
  baseShear: number;
  /** Cumulative effective mass ratio of the modes used. */
  massRatio: number;
  perMode: Array<{ period: number; gamma: number; ratio: number; baseShear: number }>;
}

/** CQC correlation of two modes of periods ti, tj at damping ζ (Der Kiureghian). */
export function cqcRho(ti: number, tj: number, zeta = 0.05): number {
  const r = Math.min(ti, tj) / Math.max(ti, tj);   // ω ratio, ≤ 1
  const num = 8 * zeta * zeta * (1 + r) * r ** 1.5;
  const den = (1 - r * r) ** 2 + 4 * zeta * zeta * r * (1 + r) ** 2;
  return den > 0 ? num / den : 1;
}

export function modalStoryForces(
  levels: readonly ModalLevel[], modes: readonly ModeShape[], dir: 'x' | 'y',
  /** Cm(T): the reduced ordinate, in g. */
  cm: (t: number) => number,
  zeta = 0.05,
): ModalForces {
  const W = levels.reduce((s, l) => s + l.weightKN, 0);
  const n = levels.length;
  const perMode: ModalForces['perMode'] = [];
  const shears: number[][] = [];
  for (const m of modes) {
    const phi = levels.map((l) => {
      const vs = l.nodeIds.map((id) => m.shape.get(id)).filter((v): v is { ux: number; uy: number } => !!v);
      return vs.length ? vs.reduce((s, v) => s + (dir === 'x' ? v.ux : v.uy), 0) / vs.length : 0;
    });
    const a = levels.reduce((s, l, k) => s + l.weightKN * phi[k]!, 0);
    const b = levels.reduce((s, l, k) => s + l.weightKN * phi[k]! ** 2, 0);
    if (!(b > 0) || !(m.period > 0)) continue;
    const gamma = a / b;
    const ratio = (a * a) / (b * W);
    const c = cm(m.period);
    const f = levels.map((l, k) => gamma * phi[k]! * l.weightKN * c);
    // Storey shear: everything at or above the level.
    const v = new Array<number>(n).fill(0);
    for (let k = n - 1; k >= 0; k--) v[k] = f[k]! + (k + 1 < n ? v[k + 1]! : 0);
    shears.push(v);
    perMode.push({ period: m.period, gamma, ratio, baseShear: Math.abs(v[0] ?? 0) });
  }
  const combined = new Array<number>(n).fill(0);
  for (let k = 0; k < n; k++) {
    let s = 0;
    for (let i = 0; i < shears.length; i++) for (let j = 0; j < shears.length; j++) {
      s += cqcRho(perMode[i]!.period, perMode[j]!.period, zeta) * shears[i]![k]! * shears[j]![k]!;
    }
    combined[k] = Math.sqrt(Math.max(0, s));
  }
  const forces = combined.map((v, k) => v - (k + 1 < n ? combined[k + 1]! : 0));
  return { forces, baseShear: combined[0] ?? 0, massRatio: perMode.reduce((s, p) => s + p.ratio, 0), perMode };
}
