/**
 * The mass Basic's dynamic analyses solve with: the members' own mass through
 * their density (section-mass.ts) plus the point masses the user put at nodes
 * (`MassSource.points`, the same field PRO uses), as the engine's nodal masses.
 * A point mass marked horizontal only has no vertical (Z) mass. Its `izz` is the
 * rotary inertia of the plane rotation in 2D (the engine's `iy`) and about the
 * vertical axis in 3D.
 */
import type { ModelData } from '../solver-service';
import type { PointMass } from './mass-source';
import { withSectionMass } from './section-mass';

type Nodal = { nodeId: number; mass: number; massZ?: number; iy?: number; izz?: number };
type WithMasses = { nodes: Map<number, unknown>; masses?: { nodal?: Nodal[] } };

export function withPointMasses<T extends WithMasses>(input: T, points: readonly PointMass[] | undefined, rotary: 'iy' | 'izz'): T {
  const positive = (v: number | undefined) => (v !== undefined && Number.isFinite(v) && v > 0 ? v : 0);
  const nodal: Nodal[] = (points ?? [])
    .map((p) => ({ p, m: positive(p.m), izz: positive(p.izz) }))
    .filter(({ p, m, izz }) => (m > 0 || izz > 0) && input.nodes.has(p.nodeId))
    .map(({ p, m, izz }) => ({
      nodeId: p.nodeId, mass: m,
      ...(p.horizontalOnly ? { massZ: 0 } : {}),
      ...(izz > 0 ? { [rotary]: izz } : {}),
    }));
  if (!nodal.length) return input;
  return { ...input, masses: { ...(input.masses ?? {}), nodal: [...(input.masses?.nodal ?? []), ...nodal] } };
}

export function withBasicMass<T extends WithMasses & Parameters<typeof withSectionMass>[0]>(
  input: T,
  model: ModelData & { massSource?: { points?: PointMass[] } },
  rotary: 'iy' | 'izz',
): { input: T; densities: Map<number, number> } {
  const physical = withSectionMass(input, model);
  return { input: withPointMasses(physical.input, model.massSource?.points, rotary), densities: physical.densities };
}
