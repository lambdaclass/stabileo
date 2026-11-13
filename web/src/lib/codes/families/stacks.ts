/**
 * The families of codes a project can generate its loads with, each as the adapters it binds to
 * every load role at once (null: the family has no code for that role, so the role is unbound).
 */
import type { ProjectRegulations, RegulationRole } from '../roles';

export type LoadFamilyChoice = 'cirsoc' | 'eurocode' | 'uk' | 'us' | 'turkey';
export const LOAD_FAMILY_CHOICES: readonly LoadFamilyChoice[] = ['cirsoc', 'eurocode', 'uk', 'us', 'turkey'];

export const FAMILY_STACKS: Record<LoadFamilyChoice, Partial<Record<RegulationRole, string | null>>> = {
  cirsoc: { basis: 'cirsoc101-2025-basis', loads: 'cirsoc101-2025-loads', wind: 'cirsoc102-2025', snow: 'cirsoc104-2005', seismic: 'inpres103-2018', thermal: 'cirsoc101-2025-thermal' },
  eurocode: { basis: 'en1990', loads: 'en1991-1-1', wind: 'en1991-1-4', snow: 'en1991-1-3', seismic: 'en1998-1', thermal: null },
  uk: { basis: 'en1990-uk', loads: 'en1991-1-1-uk', wind: 'en1991-1-4-uk', snow: 'en1991-1-3-uk', seismic: null, thermal: null },
  us: { basis: 'asce7-22-basis', loads: 'asce7-22-loads', wind: 'asce7-22-wind', snow: 'asce7-22-snow', seismic: 'asce7-22-seismic', thermal: null },
  turkey: { basis: 'ts500-2000-basis', loads: 'ts498-1997-loads', wind: 'ts498-1997-wind', snow: 'ts498-1997-snow', seismic: 'tbdy2018', thermal: null },
};

/** The family whose basis code the project binds, if it is one of these. */
export function loadFamilyOfRegulations(reg: ProjectRegulations): LoadFamilyChoice | null {
  const basis = reg.basis.adapterId;
  return LOAD_FAMILY_CHOICES.find((f) => FAMILY_STACKS[f].basis === basis) ?? null;
}
