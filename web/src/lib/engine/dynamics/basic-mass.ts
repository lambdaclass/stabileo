/**
 * The mass Basic's dynamic analyses solve with: the members' own mass through
 * their density (section-mass.ts) plus the point masses the user put at nodes
 * (`MassSource.points`, the same field PRO uses), as the engine's nodal masses.
 * A point mass marked horizontal only moves with X alone.
 */
import type { ModelData } from '../solver-service';
import type { PointMass } from './mass-source';
import { withSectionMass } from './section-mass';

type Nodal = { nodeId: number; mass: number; massZ?: number };
type WithMasses = { nodes: Map<number, unknown>; masses?: { nodal?: Nodal[] } };

export function withPointMasses<T extends WithMasses>(input: T, points: readonly PointMass[] | undefined): T {
  const nodal: Nodal[] = (points ?? [])
    .filter((p) => p.m > 0 && input.nodes.has(p.nodeId))
    .map((p) => ({ nodeId: p.nodeId, mass: p.m, ...(p.horizontalOnly ? { massZ: 0 } : {}) }));
  if (!nodal.length) return input;
  return { ...input, masses: { ...(input.masses ?? {}), nodal: [...(input.masses?.nodal ?? []), ...nodal] } };
}

export function withBasicMass<T extends WithMasses & Parameters<typeof withSectionMass>[0]>(
  input: T,
  model: ModelData & { massSource?: { points?: PointMass[] } },
): { input: T; densities: Map<number, number> } {
  const physical = withSectionMass(input, model);
  return { input: withPointMasses(physical.input, model.massSource?.points), densities: physical.densities };
}
