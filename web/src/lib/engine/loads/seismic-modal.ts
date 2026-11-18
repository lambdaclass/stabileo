import { massSamples, type MassNode, type SeismicMass } from './seismic-mass';

export interface ModalLevel { elevation: number; weightKN: number; mass: readonly SeismicMass[] }
export interface ModalPoint { ux: number; uy: number; uz: number; rx: number; ry: number; rz: number }
export interface ModeShape {
  period: number;
  shape: Map<number, ModalPoint>;
  participation?: Record<'x' | 'y', { gamma: number; ratio: number }>;
}

export class SeismicModeRefusal extends Error {}

function interpolatedMode(mass: SeismicMass, mode: ModeShape): (shape: number[]) => number[] {
  const at = (node: MassNode) => {
    const d = mode.shape.get(node.id);
    if (!d || ![d.ux, d.uy, d.uz, d.rx, d.ry, d.rz].every(Number.isFinite)) throw new SeismicModeRefusal();
    return d;
  };
  if (mass.kind === 'shell') {
    const corners = mass.nodes.map(at);
    return shape => (['ux', 'uy', 'uz'] as const).map(key => corners.reduce((s, d, k) => s + shape[k]! * d[key], 0));
  }
  const i = at(mass.nodeI), j = at(mass.nodeJ);
  const axis = [mass.nodeJ.x - mass.nodeI.x, mass.nodeJ.y - mass.nodeI.y, mass.nodeJ.z - mass.nodeI.z];
  const ui = [i.ux, i.uy, i.uz], uj = [j.ux, j.uy, j.uz];
  const parallel = (u: number[]) => axis.reduce((s, x, k) => s + x * u[k]!, 0) / mass.length ** 2;
  const pi = parallel(ui), pj = parallel(uj);
  const slope = ({ rx, ry, rz }: ModalPoint) => [ry * axis[2]! - rz * axis[1]!, rz * axis[0]! - rx * axis[2]!, rx * axis[1]! - ry * axis[0]!];
  const si = slope(i), sj = slope(j);
  return ([t]) => {
    const q = 1 - t!;
    const hi = q ** 2 * (1 + 2 * t!), hj = t! ** 2 * (3 - 2 * t!);
    return ui.map((u, k) => hi * u + hj * uj[k]!
      + (pi * (q - hi) + pj * (t! - hj)) * axis[k]!
      + t! * q ** 2 * si[k]! - t! ** 2 * q * sj[k]!);
  };
}

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
  if (!(Number.isFinite(W) && W > 0) || levels.some(l => l.weightKN > 0 && !l.mass.length)) throw new SeismicModeRefusal();
  const n = levels.length;
  const perMode: ModalForces['perMode'] = [];
  const shears: number[][] = [];
  for (const m of modes) {
    if (!Number.isFinite(m.period) || m.period <= 0) throw new SeismicModeRefusal();
    const index = dir === 'x' ? 0 : 1;
    let energy = 0;
    const participation = m.participation?.[dir];
    const momentum = levels.map(level => {
      let sum = 0;
      for (const mass of level.mass) {
        const displacement = interpolatedMode(mass, m);
        massSamples(mass, (w, _x, _y, shape) => {
          const u = displacement(shape);
          sum += w * u[index]!;
          if (participation === undefined) energy += w * u.reduce((s, v) => s + v ** 2, 0);
        });
      }
      return sum;
    });
    const a = momentum.reduce((s, v) => s + v, 0);
    if (participation === undefined && energy === 0) continue;
    const gamma = participation?.gamma ?? a / energy;
    const ratio = participation?.ratio ?? a * gamma / W;
    const c = cm(m.period);
    if (![a, gamma, ratio, c].every(Number.isFinite) || ratio < 0 || c < 0) throw new SeismicModeRefusal();
    const f = momentum.map(p => gamma * p * c);
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
