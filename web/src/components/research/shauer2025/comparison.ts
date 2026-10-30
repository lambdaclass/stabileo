import { checkFields } from './field-check.mjs';
import type { Frame } from './simulation.svelte';

export type ReferenceStep = { step: number; reaction: number; iterations: number; damageMax?: number };

/** The same force tolerances as the native reference validation. */
export function compareReference(frames: Frame[], reference: ReferenceStep[], fields: { nodes: Float64Array; elements: Uint32Array; snapshots: { damage: Record<number, number[]>; displacement: Record<number, number[]> }; material: { e: number; nu: number; plane: string }; replay: boolean }) {
  const failures: string[] = [];
  const refPeak = reference.reduce((a, b) => b.reaction > a.reaction ? b : a);
  const peak = frames.reduce((a, b) => b.step.reaction > a.step.reaction ? b : a, frames[0]);
  let worstPre = 0;
  let worstAll = 0;
  let sameIterations = 0;
  if (frames.length !== reference.length || frames.some((f, i) => f.step.step !== reference[i]?.step)) failures.push('missing or out-of-order frames');
  const numericFields = ['step', 'pseudotime', 'displacement', 'reaction', 'iterations', 'residual',
    'damage_max', 'damage_min', 'elastic_energy', 'fracture_energy'] as const;
  if (frames.some(f => numericFields.some(key => !Number.isFinite(f.step[key])))) failures.push('missing or non-finite step results');
  if (frames.some(f => f.step.converged !== true)) failures.push('non-converged steps');
  frames.forEach((f, i) => {
    const r = reference[i];
    if (!r) return;
    failures.push(...checkFields(f, fields.nodes, fields.elements, fields.snapshots, fields.material, fields.replay));
    if (r.damageMax !== undefined && r.step <= refPeak.step && Math.abs(f.step.damage_max - r.damageMax) > Math.abs(r.damageMax) * 1e-9) failures.push('maximum damage mismatch');
    const diff = Math.abs(f.step.reaction - r.reaction);
    if (r.step <= refPeak.step) worstPre = Math.max(worstPre, diff / Math.max(Math.abs(r.reaction), 1e-300));
    worstAll = Math.max(worstAll, diff);
    if (f.step.iterations === r.iterations) sameIterations++;
  });
  if (!(worstPre <= 1e-9)) failures.push('pre-fracture force difference exceeds 1e-9 relative');
  if (!(worstAll <= 1e-5)) failures.push('force difference exceeds force comparison tolerance 1e-5 kN');
  if (peak?.step.step !== refPeak.step) failures.push('peak at a different step');
  if (sameIterations !== reference.length) failures.push('different iteration counts');
  return { peak, worstPre, worstAll, sameIterations, failures, matches: failures.length === 0 };
}

export function deepLinkStep(value: string | null, count: number): number | null {
  if (value === null || value.trim() === '') return null;
  const step = Number(value);
  return Number.isFinite(step) && Number.isInteger(step) ? Math.max(0, Math.min(count - 1, step)) : null;
}
