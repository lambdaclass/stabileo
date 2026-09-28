/**
 * Story drift under the seismic cases, INPRES-CIRSOC 103-2018 Parte I §6.4.
 *
 *   [6.17]  d_u = C_d · d_e / γ_r         the design displacement from the elastic one
 *   [6.18]  θ_sk = (d_uk − d_uk−1) / h_sk  measured at the most unfavourable edge
 *   Tabla 6.4, by destination group and whether non-structural elements can be damaged:
 *
 *                 Ao or A    B
 *       D         0,010      0,015
 *       ND        0,015      0,025
 *
 * and not required for group C. `storyDrifts` measures every column and keeps each story's
 * worst, which is the most unfavourable edge; this scales the displacements by C_d/γ_r first.
 *
 * C_d comes from Tabla 5.1 through the structural system the project states; the group from
 * the seismic settings. Without either there is nothing to check against, and the caller says so.
 */
import { storyDrifts, type StoryDrift } from './story-drift';
import { RISK_FACTOR, type DestinationGroup } from '../codes/cirsoc103/spectrum';

export type DriftCondition = 'D' | 'ND';

/** Tabla 6.4; null for group C, where the check is not required. */
export function driftLimit(group: DestinationGroup, condition: DriftCondition): number | null {
  if (group === 'C') return null;
  const strict = group === 'Ao' || group === 'A';
  return condition === 'D' ? (strict ? 0.01 : 0.015) : (strict ? 0.015 : 0.025);
}

export interface SeismicDriftInput {
  nodes: ReadonlyMap<number, { x: number; y: number; z?: number }>;
  elements: Iterable<{ id: number; nodeI: number; nodeJ: number }>;
  /** Elastic displacements of one seismic case. */
  displacements: ReadonlyArray<{ nodeId: number; ux: number; uy: number; uz: number }>;
  cd: number;
  group: DestinationGroup;
  condition: DriftCondition;
  embedded2D?: boolean;
}

/** The stories' design drifts, or null when the group does not require the check. */
export function seismicDrifts(i: SeismicDriftInput): { limit: number; stories: StoryDrift[] } | null {
  const limit = driftLimit(i.group, i.condition);
  if (limit === null) return null;
  const k = i.cd / RISK_FACTOR[i.group];
  const amplified = i.displacements.map((d) => ({ ...d, ux: d.ux * k, uy: d.uy * k }));
  return { limit, stories: storyDrifts(i.nodes, i.elements, amplified, { limit, embedded2D: i.embedded2D }) };
}
