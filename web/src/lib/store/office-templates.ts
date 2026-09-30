/**
 * The office's templates: kept in this browser, exported and imported as files, and applied to
 * the open project as one undo step (`model/office-template.ts`).
 */
import { modelStore } from './model.svelte';
import { regulationsStore } from './regulations.svelte';
import { templateFrom, planTemplate, parseTemplate, type OfficeTemplate } from '../model/office-template';
import { REGULATION_ROLES, type RegulationRole, type RoleBinding } from '../codes/roles';

const KEY = 'stabileo-office-templates';

export function listTemplates(): OfficeTemplate[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((t) => t && t.kind) : [];
  } catch { return []; }
}

function writeTemplates(list: OfficeTemplate[]): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
}

/** The open project as a template. */
export function templateFromProject(name: string): OfficeTemplate {
  const m = modelStore.model;
  return templateFrom({
    materials: m.materials.values(), sections: m.sections.values(),
    loadCases: m.loadCases, combinations: m.combinations,
    combinationRules: m.combinationRules, regulations: m.regulations,
    deflectionLimits: m.deflectionLimits,
  } as never, name);
}

/** Keep a template in this browser, replacing one of the same name. */
export function saveTemplate(t: OfficeTemplate): boolean {
  return writeTemplates([...listTemplates().filter((x) => x.name !== t.name), t]);
}

export function removeTemplate(name: string): void { writeTemplates(listTemplates().filter((x) => x.name !== name)); }

export function importTemplate(text: string): OfficeTemplate {
  const t = parseTemplate(text);
  saveTemplate(t);
  return t;
}

/** What a template's regulations did: roles changed, staged for the loads review, or refused. */
export interface TemplateRegulations { applied: RegulationRole[]; review: RegulationRole[]; refused: RegulationRole[] }

/**
 * A template's regulations, role by role, through the regulations store — as if chosen in its
 * panel. They used to be written over the project's in one assignment: nothing validated the
 * stack or the shape of a hand-edited file, a load-affecting code was applied without the loads
 * review, and the revisions did not move, so designs made under the old code read as current.
 * Now a changed code is requested (validated; a load-affecting one staged for review), and the
 * settings and jurisdiction that come with it are set. What is not a binding is ignored.
 */
function applyRegulations(regs: unknown): TemplateRegulations {
  const out: TemplateRegulations = { applied: [], review: [], refused: [] };
  const roles = (regs as { roles?: unknown } | null)?.roles;
  if (!roles || typeof roles !== 'object') return out;
  for (const role of REGULATION_ROLES) {
    const b = (roles as Record<string, unknown>)[role] as Partial<RoleBinding> | undefined;
    if (!b || typeof b !== 'object' || typeof b.adapterId !== 'string') continue;
    if (b.adapterId !== regulationsStore.binding(role).adapterId) {
      const r = regulationsStore.requestChange(role, b.adapterId);
      if (r.kind === 'refused') { out.refused.push(role); continue; }
      (r.kind === 'needsLoadReview' ? out.review : out.applied).push(role);
    }
    if (b.settings && typeof b.settings === 'object') regulationsStore.configureRole(role, b.settings, b.configComplete ?? regulationsStore.binding(role).configComplete);
    if (typeof b.jurisdiction === 'string' && b.jurisdiction) regulationsStore.setJurisdiction(role, b.jurisdiction, b.adoption ?? regulationsStore.binding(role).adoption);
  }
  return out;
}

/** Apply a template to the open project, one undo step. Returns what it added. */
export function applyTemplate(t: OfficeTemplate): ReturnType<typeof planTemplate> & { regulationChanges: TemplateRegulations } {
  const m = modelStore.model;
  const plan = planTemplate(t, {
    materials: m.materials.values(), sections: m.sections.values(),
    loadCases: m.loadCases, combinations: m.combinations,
    combinationRules: m.combinationRules, deflectionLimits: m.deflectionLimits,
  } as never);
  let regulationChanges: TemplateRegulations = { applied: [], review: [], refused: [] };
  modelStore.batch(() => {
    for (const mat of plan.materials) { const { id: _i, ...rest } = mat; modelStore.addMaterial(rest as never); }
    for (const sec of plan.sections) { const { id: _i, ...rest } = sec; modelStore.addSection(rest as never); }
    const caseId = new Map(plan.existingCase);
    for (const c of plan.loadCases) caseId.set(c.id, modelStore.addLoadCase(c.name, c.type as never));
    for (const c of plan.combinations) {
      const factors = c.factors.map((f) => ({ caseId: caseId.get(f.caseId), factor: f.factor }));
      if (factors.some((f) => f.caseId === undefined)) continue;
      modelStore.addCombination(c.name, factors as Array<{ caseId: number; factor: number }>);
    }
    if (plan.combinationRules.length) modelStore.setCombinationRules([...(m.combinationRules ?? []), ...plan.combinationRules] as never);
    if (plan.regulations) regulationChanges = applyRegulations(plan.regulations);
    if (plan.deflectionLimits) modelStore.setDeflectionLimits(plan.deflectionLimits);
  });
  return { ...plan, regulationChanges };
}
