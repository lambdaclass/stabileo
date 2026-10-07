/**
 * The registry of load-code modules, by the adapter id a role binds (`roles.ts`).
 *
 * A family is plugged in by registering its modules; nothing else in the generator names a code.
 * A role bound to an adapter with no module here cannot generate loads: the plan says so, and the
 * selector does not offer it.
 */
import type { ProjectRegulations, RegulationRole } from '../roles';
import { roleUsable } from '../roles';
import type { AnyLoadCode, CodeFamilyId, CombinationCode, LoadCodes } from './load-codes';
import type { LoadCombinationSpec } from '../cirsoc101/combinations';
import { CIRSOC_FAMILY } from './cirsoc';

const MODULES = new Map<string, AnyLoadCode>();
for (const m of CIRSOC_FAMILY) MODULES.set(m.adapterId, m);

/**
 * Add a family's modules (an implementation, or a test's). Returns a function that removes them,
 * putting back any module they stood in for.
 */
export function registerLoadCodes(modules: readonly AnyLoadCode[]): () => void {
  const before = modules.map((m) => [m, MODULES.get(m.adapterId)] as const);
  for (const m of modules) MODULES.set(m.adapterId, m);
  return () => {
    for (const [m, prev] of before) {
      if (MODULES.get(m.adapterId) !== m) continue;
      if (prev) MODULES.set(m.adapterId, prev);
      else MODULES.delete(m.adapterId);
    }
  };
}

/**
 * A combination with the code, edition and rule that wrote it, and what for. One a project typed
 * in its own rules says `project`, in the basis code's family. A combination that already says is
 * kept as it is.
 */
export function withOrigin(c: LoadCombinationSpec, basis: CombinationCode, project = false): LoadCombinationSpec {
  if (c.origin) return c;
  const purpose = c.purpose ?? 'strength';
  return {
    ...c,
    origin: project
      ? { code: 'project', family: basis.family, edition: '', rule: c.id, purpose }
      : { code: basis.adapterId, family: basis.family, edition: basis.edition, rule: c.id, purpose },
  };
}

/** The module for an adapter, if one is registered. */
export function loadCodeFor(adapterId: string | null | undefined): AnyLoadCode | undefined {
  return adapterId ? MODULES.get(adapterId) : undefined;
}

/** Whether an adapter of a load role has a module to generate with. */
export function hasLoadModule(adapterId: string): boolean {
  return MODULES.has(adapterId);
}

/** The load roles a plan resolves modules for. */
export const PLAN_ROLES = ['basis', 'loads', 'wind', 'snow', 'seismic', 'thermal'] as const satisfies readonly RegulationRole[];

/**
 * The modules of the roles bound and usable, or the roles that are bound and have none. `basis`
 * and `loads` are required; the others only when bound.
 */
export function resolveLoadCodes(reg: ProjectRegulations): { codes: LoadCodes } | { missing: RegulationRole[] } {
  const missing: RegulationRole[] = [];
  const pick = <R extends (typeof PLAN_ROLES)[number]>(role: R) => {
    const b = reg[role];
    if (!b?.adapterId || !roleUsable(reg, role)) return undefined;
    const m = MODULES.get(b.adapterId);
    if (!m || m.role !== role) { missing.push(role); return undefined; }
    return m;
  };
  const basis = pick('basis'), loads = pick('loads');
  const wind = pick('wind'), snow = pick('snow'), seismic = pick('seismic'), thermal = pick('thermal');
  if (missing.length || !basis || !loads) return { missing };
  return { codes: { basis, loads, wind, snow, seismic, thermal } as LoadCodes };
}

/** The family of the bound load roles, when they share one. */
export function loadFamilyOf(reg: ProjectRegulations): CodeFamilyId | null {
  const fams = new Set(PLAN_ROLES.map((r) => loadCodeFor(reg[r]?.adapterId)?.family).filter((f): f is CodeFamilyId => !!f));
  return fams.size === 1 ? [...fams][0]! : null;
}

export type { ActionCategory, CombinationOrigin, LoadCodes } from './load-codes';
