import type { PointMass } from '../../../lib/engine/dynamics/mass-source';

export function pointMassNode(field: { value: string }, points: readonly PointMass[], i: number, exists: (id: number) => boolean): number | null {
  const v = Number(field.value);
  if (Number.isInteger(v) && exists(v) && !points.some((q, k) => k !== i && q.nodeId === v)) return v;
  field.value = String(points[i].nodeId);
  return null;
}
