import { governingMagnitude2D, governingMagnitude3D, type Component2D, type Component3D } from '../engine/governing-case';
import type { ElementForces } from '../engine/types';
import type { ElementForces3D } from '../engine/types-3d';

const COMPONENTS_3D = new Set<string>(['momentZ', 'shearY', 'axial', 'momentY', 'shearZ', 'torsion']);
const COMPONENTS_2D = new Set<string>(['moment', 'shear', 'axial']);

function magnitude(f: Record<string, unknown>, component: string): number | undefined {
  if ('mzStart' in f) return COMPONENTS_3D.has(component) ? governingMagnitude3D(f as unknown as ElementForces3D, component as Component3D) : undefined;
  return COMPONENTS_2D.has(component) ? governingMagnitude2D(f as unknown as ElementForces, component as Component2D) : undefined;
}

/** Every combination whose value for this member and component equals the governing one, sorted. */
export function governingTies(perCombo: Map<number, { elementForces: unknown[] }>, elementId: number, component: string, value: number): number[] {
  const out: number[] = [];
  for (const [comboId, r] of perCombo) {
    const f = (r.elementForces as Array<Record<string, unknown>>).find((x) => x.elementId === elementId);
    const m = f && magnitude(f, component);
    if (m !== undefined && Math.abs(m - value) <= 1e-9 * Math.max(Math.abs(value), 1e-12)) out.push(comboId);
  }
  return out.sort((a, b) => a - b);
}

/**
 * The combinations recorded as governing a member's component: every one that ties with the
 * app's governing value (which of them the app names depends on the order the session built the
 * combinations in), and always the one the app named, so a governing combination that is not
 * among them changes the snapshot.
 */
export function governingCombos(
  perCombo: Map<number, { elementForces: unknown[] }>, elementId: number, component: string, ref: { comboId: number; value: number },
): number[] {
  return [...new Set([...governingTies(perCombo, elementId, component, ref.value), ref.comboId])].sort((a, b) => a - b);
}
