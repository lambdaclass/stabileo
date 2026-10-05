/**
 * What the pushover pushes with, and where it stops:
 *
 *   pattern   the model's loads as they are, a load case's, or a lateral pattern along X or Y
 *             spread over the nodes by their gravity weight w_i: uniform (∝ w_i), triangular
 *             (∝ w_i · height above the base) or the first mode's (∝ w_i · φ_i). A pattern adds
 *             up to 1 kN, so the load factor reads as the base shear;
 *   target    a base shear or a control node's displacement: the capacity curve up to it, the
 *             last step interpolated (between two hinges the response is linear).
 *
 * The engine scales every load it is given by the same factor: a lateral pattern is pushed
 * without its gravity load alongside (a constant gravity with an increasing push is the
 * engine's to give).
 *
 * Pure.
 */
import type { SolverInput3D, SolverLoad3D } from './types-3d';
import { nodeGravity } from './direct-analysis';
import type { CapacityPoint } from './pushover-curve';

export type LateralPattern = 'uniform' | 'triangular' | 'modal';

/** The nodal loads of a lateral pattern, adding up to 1 kN along `dir`. */
export function lateralPatternLoads(
  input: SolverInput3D, gravity: SolverLoad3D[], kind: LateralPattern, dir: 'X' | 'Y',
  modeShape?: ReadonlyMap<number, { ux: number; uy: number }>, leftHand = false,
): SolverLoad3D[] | null {
  const w = nodeGravity(input, gravity, leftHand).gravity;
  const restrained = new Set([...input.supports.values()].map((s) => s.nodeId));
  const nodes = [...input.nodes.values()].filter((n) => !restrained.has(n.id) && (w.get(n.id) ?? 0) > 0);
  if (!nodes.length) return null;
  const zMin = Math.min(...[...input.nodes.values()].map((n) => n.z));
  let shape = (n: { id: number; z: number }) => (kind === 'triangular' ? n.z - zMin : 1);
  if (kind === 'modal') {
    if (!modeShape) return null;
    const comp = (id: number) => { const s = modeShape.get(id); return s ? (dir === 'X' ? s.ux : s.uy) : 0; };
    // The mode's sign, so the top moves along +dir.
    const top = nodes.reduce((a, b) => (b.z > a.z ? b : a));
    const sg = comp(top.id) < 0 ? -1 : 1;
    shape = (n) => sg * comp(n.id);
  }
  const raw = nodes.map((n) => ({ id: n.id, f: (w.get(n.id) ?? 0) * shape(n) }));
  const total = raw.reduce((s, r) => s + r.f, 0);
  if (!(Math.abs(total) > 0)) return null;
  return raw.filter((r) => r.f !== 0).map((r) => ({
    type: 'nodal' as const,
    data: { nodeId: r.id, fx: dir === 'X' ? r.f / total : 0, fy: dir === 'Y' ? r.f / total : 0, fz: 0, mx: 0, my: 0, mz: 0 },
  }));
}

/** The capacity curve up to a target: a base shear, or the control node's displacement. */
export function upToTarget(curve: readonly CapacityPoint[], target: { kind: 'shear' | 'displacement'; value: number }): { curve: CapacityPoint[]; reached: boolean } {
  const key = target.kind === 'shear' ? 'baseShear' : 'displacement';
  const out: CapacityPoint[] = [curve[0]!];
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1]!, b = curve[i]!;
    if (b[key] >= target.value) {
      const t = (target.value - a[key]) / ((b[key] - a[key]) || 1);
      out.push({ ...b, displacement: a.displacement + t * (b.displacement - a.displacement), baseShear: a.baseShear + t * (b.baseShear - a.baseShear), loadFactor: a.loadFactor + t * (b.loadFactor - a.loadFactor), hinges: t >= 1 - 1e-12 ? b.hinges : [] });
      return { curve: out, reached: true };
    }
    out.push(b);
  }
  return { curve: out, reached: false };
}
