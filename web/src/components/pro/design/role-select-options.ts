/**
 * What a role's selector in the project regulations lists (`ProjectRegulationsPanel.svelte`).
 *
 * A load role offers only the codes with a module to generate with (`codes/families`). The code a
 * role is BOUND to is listed whatever it is: a project saved with a Eurocode bound (EN 1990,
 * EN 1991-1-4) had its binding filtered out of the options, and the selector read
 * "— not selected —" over a role that was bound. It is listed marked as having no module, and
 * cannot be chosen again once left.
 */
import { findOption, isLoadAffecting, optionsForRole, type RegulationRole, type RoleOption } from '../../../lib/codes/roles';
import { hasLoadModule } from '../../../lib/codes/families';

export interface RoleSelectOption {
  option: RoleOption;
  /** A load role's code with no module to generate with: listed only because it is the one bound. */
  noModule: boolean;
}

export function roleSelectOptions(role: RegulationRole, boundAdapterId: string | null | undefined): RoleSelectOption[] {
  const generates = (o: RoleOption) => !isLoadAffecting(role) || hasLoadModule(o.adapterId);
  const out = optionsForRole(role).filter(generates).map((option) => ({ option, noModule: false }));
  if (boundAdapterId && !out.some((x) => x.option.adapterId === boundAdapterId)) {
    const bound = findOption(boundAdapterId);
    if (bound && bound.role === role && !generates(bound)) out.push({ option: bound, noModule: true });
  }
  return out;
}
