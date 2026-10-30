/**
 * What an influence line is drawn for, where it is read and in which sign.
 *
 * Signs follow the explained step-by-step documents: a reaction is positive along +X, up, or
 * counter-clockwise; N in tension; V the classical shear; M positive when it tensions the fibre on
 * the drawn −z side of the member (the bottom fibre of a beam); ux, uz and ry along +X, up and
 * counter-clockwise.
 */
import type { InfluenceQuantity } from '../../store/model.svelte';

export type IlFamily = 'reaction' | 'force' | 'displacement';

export const REACTION_QUANTITIES = ['Rz', 'Rx', 'My'] as const;
export const FORCE_QUANTITIES = ['M', 'V', 'N'] as const;
export const DISPLACEMENT_QUANTITIES = ['uz', 'ux', 'ry'] as const;

/** The quantity's current name: the plane model's former reaction names read as their Z-up ones. */
export function canonicalQuantity(q: InfluenceQuantity): InfluenceQuantity {
  if (q === 'Ry') return 'Rz';
  if (q === 'Mz') return 'My';
  return q;
}

export function familyOf(q: InfluenceQuantity): IlFamily {
  const c = canonicalQuantity(q);
  if ((REACTION_QUANTITIES as readonly string[]).includes(c)) return 'reaction';
  if ((FORCE_QUANTITIES as readonly string[]).includes(c)) return 'force';
  return 'displacement';
}

/** The unit of an ordinate: the quantity's own unit per kN of the unit load. */
export function ordinateUnit(q: InfluenceQuantity): string {
  switch (canonicalQuantity(q)) {
    case 'M': case 'My': return 'kN·m/kN';
    case 'uz': case 'ux': return 'm/kN';
    case 'ry': return 'rad/kN';
    default: return 'kN/kN';
  }
}

/** The unit of the quantity itself (an effect computed from the line). */
export function quantityUnit(q: InfluenceQuantity): string {
  switch (canonicalQuantity(q)) {
    case 'M': case 'My': return 'kN·m';
    case 'uz': case 'ux': return 'm';
    case 'ry': return 'rad';
    default: return 'kN';
  }
}

/** Where a line is read: at a node (a reaction, a node's displacement) or at a section x of a member. */
export type IlTarget =
  | { kind: 'node'; nodeId: number }
  | { kind: 'section'; elementId: number; t: number };

/** The quantity's symbol for text and TeX ("M", "R_z", "θ"). */
export function quantitySymbol(q: InfluenceQuantity): string {
  switch (canonicalQuantity(q)) {
    case 'Rz': return 'R_z';
    case 'Rx': return 'R_x';
    case 'My': return 'M_y';
    case 'uz': return 'u_z';
    case 'ux': return 'u_x';
    case 'ry': return '\\theta';
    default: return canonicalQuantity(q);
  }
}

/** The symbol as plain text, for labels on the canvas and in the panel. */
export function plainSymbol(q: InfluenceQuantity): string {
  return quantitySymbol(q).replace('\\theta', 'θ').replace('_', '');
}
