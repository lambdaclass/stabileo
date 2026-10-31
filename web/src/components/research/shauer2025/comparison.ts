import type { ComparisonFailure } from './failure-labels';
import { checkFields } from './field-check.mjs';
import type { Frame } from './simulation.svelte';

export type ReferenceStep = { step: number; pseudotime: number; reaction: number; iterations: number; damageMax?: number };

/** The same force tolerances as the native reference validation. */
export function compareReference(frames: Frame[], reference: ReferenceStep[], fields: { nodes: Float64Array; elements: Uint32Array; snapshots: { damage: Record<number, number[]>; displacement: Record<number, number[]> }; material: { e: number; nu: number; plane: string }; replay: boolean }) {
  const failures: ComparisonFailure[] = [];
  const refPeak = reference.reduce((a, b) => b.reaction > a.reaction ? b : a);
  const peak = frames.reduce((a, b) => b.step.reaction > a.step.reaction ? b : a, frames[0]);
  let worstPre = 0;
  let worstAll = 0;
  let sameIterations = 0;
  if (frames.length !== reference.length || frames.some((f, i) => f.step.step !== reference[i]?.step)) failures.push('frame-order');
  const numericFields = ['step', 'pseudotime', 'displacement', 'reaction', 'iterations', 'residual',
    'damage_max', 'damage_min', 'elastic_energy', 'fracture_energy'] as const;
  if (frames.some(f => numericFields.some(key => !Number.isFinite(f.step[key])))) failures.push('nonfinite-step');
  if (frames.some(f => f.step.converged !== true)) failures.push('nonconverged');
  frames.forEach((f, i) => {
    const r = reference[i];
    if (!r) return;
    if (!Number.isFinite(r.pseudotime) || Math.abs(f.step.pseudotime - r.pseudotime) > 1e-12 || Math.abs(f.step.displacement - r.pseudotime * 0.01) > 1e-14) failures.push('load-coordinate-mismatch');
    if (checkFields(f, fields.nodes, fields.elements, fields.snapshots, fields.material, fields.replay).length) failures.push('fields');
    if (r.damageMax !== undefined && r.step <= refPeak.step && Math.abs(f.step.damage_max - r.damageMax) > Math.abs(r.damageMax) * 1e-9) failures.push('damage-max');
    const diff = Math.abs(f.step.reaction - r.reaction);
    if (r.step <= refPeak.step) worstPre = Math.max(worstPre, diff / Math.max(Math.abs(r.reaction), 1e-300));
    worstAll = Math.max(worstAll, diff);
    if (f.step.iterations === r.iterations) sameIterations++;
  });
  if (!(worstPre <= 1e-9)) failures.push('force-relative');
  if (!(worstAll <= 1e-5)) failures.push('force-absolute');
  if (peak?.step.step !== refPeak.step) failures.push('peak-step');
  if (sameIterations !== reference.length) failures.push('iterations');
  return { peak, worstPre, worstAll, sameIterations, failures, matches: failures.length === 0 };
}

export function deepLinkStep(value: string | null, count: number): number | null {
  if (value === null || value.trim() === '') return null;
  const step = Number(value);
  return Number.isFinite(step) && Number.isInteger(step) ? Math.max(0, Math.min(count - 1, step)) : null;
}
