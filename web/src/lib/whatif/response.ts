/**
 * The handful of numbers "What if?" compares while the reader moves things: the largest
 * displacement, internal forces along every member (not only at its ends, where a span load's
 * peak is not) and support reaction.
 */
import type { AnalysisResults } from '../engine/types';
import type { AnalysisResults3D } from '../engine/types-3d';
import { computeElementDiagram } from '../engine/diagrams';
import { computeGlobalMax3D } from '../engine/diagrams-3d';
import type { Quantity } from '../utils/units';

export type ResponseKey = 'delta' | 'moment' | 'shear' | 'axial' | 'reaction';
export type Response = Record<ResponseKey, number>;

export const RESPONSE_QUANTITY: Record<ResponseKey, Quantity> = {
  delta: 'displacement', moment: 'moment', shear: 'force', axial: 'force', reaction: 'force',
};

const peak = (values: Iterable<number>) => { let m = 0; for (const v of values) if (Number.isFinite(v) && Math.abs(v) > m) m = Math.abs(v); return m; };

export function response2D(r: AnalysisResults): Response {
  const along = (kind: 'moment' | 'shear' | 'axial') =>
    peak(r.elementForces.map((ef) => computeElementDiagram(kind, ef, 0, 0, ef.length, 0).maxAbsValue));
  return {
    delta: peak(r.displacements.map((d) => Math.hypot(d.ux, d.uz))),
    moment: along('moment'),
    shear: along('shear'),
    axial: along('axial'),
    reaction: peak(r.reactions.map((x) => Math.hypot(x.rx, x.rz))),
  };
}

export function response3D(r: AnalysisResults3D): Response {
  const ef = r.elementForces;
  return {
    delta: peak(r.displacements.map((d) => Math.hypot(d.ux, d.uy, d.uz))),
    moment: Math.max(computeGlobalMax3D(ef, 'momentY'), computeGlobalMax3D(ef, 'momentZ')),
    shear: Math.max(computeGlobalMax3D(ef, 'shearY'), computeGlobalMax3D(ef, 'shearZ')),
    axial: computeGlobalMax3D(ef, 'axial'),
    reaction: peak(r.reactions.map((x) => Math.hypot(x.fx, x.fy, x.fz))),
  };
}

/** The change from `before`, in percent; null when there is nothing to compare against. */
export function percentChange(before: number, now: number): number | null {
  if (!Number.isFinite(before) || !Number.isFinite(now)) return null;
  if (Math.abs(before) < 1e-12) return Math.abs(now) < 1e-12 ? 0 : null;
  return ((now - before) / Math.abs(before)) * 100;
}
