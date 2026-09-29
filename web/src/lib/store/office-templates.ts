/**
 * The office's templates: kept in this browser, exported and imported as files, and applied to
 * the open project as one undo step (`model/office-template.ts`).
 */
import type { DrawnSection } from '../section/drawn';
import { modelStore } from './model.svelte';
import { templateFrom, planTemplate, parseTemplate, type OfficeTemplate } from '../model/office-template';

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

/** Apply a template to the open project, one undo step. Returns what it added. */
export function applyTemplate(t: OfficeTemplate): ReturnType<typeof planTemplate> {
  const m = modelStore.model;
  const plan = planTemplate(t, {
    materials: m.materials.values(), sections: m.sections.values(),
    loadCases: m.loadCases, combinations: m.combinations,
    combinationRules: m.combinationRules, deflectionLimits: m.deflectionLimits,
  } as never);
  modelStore.batch(() => {
    /*
     * The template's material ids are the template's. Each one lands as a new material or, when
     * the project already has one of that name, as that one; a drawn section names materials by
     * id (its reference, its parts, its areas), so those ids follow. Kept as they were, a drawn
     * part pointed at whatever project material had the template's number.
     */
    const byName = new Map([...m.materials.values()].map((x) => [x.name.trim().toLowerCase(), x.id]));
    const materialId = new Map<number, number>();
    for (const mat of t.materials) { const hit = byName.get(mat.name.trim().toLowerCase()); if (hit !== undefined) materialId.set(mat.id, hit); }
    for (const mat of plan.materials) { const { id, ...rest } = mat; materialId.set(id, modelStore.addMaterial(rest as never)); }
    const remap = (id: number | null | undefined) => (id == null ? id : materialId.get(id) ?? id);
    for (const sec of plan.sections) {
      const { id: _i, ...rest } = sec as typeof sec & { drawn?: DrawnSection };
      const drawn = rest.drawn;
      if (drawn) {
        rest.drawn = {
          ...drawn,
          ...(drawn.refMaterialId !== undefined ? { refMaterialId: remap(drawn.refMaterialId)! } : {}),
          parts: drawn.parts.map((p) => (p.materialId !== undefined ? { ...p, materialId: remap(p.materialId)! } : p)),
          ...(drawn.areas ? { areas: drawn.areas.map((x) => ({ ...x, materialId: remap(x.materialId) ?? null })) } : {}),
        };
      }
      modelStore.addSection(rest as never);
    }
    const caseId = new Map(plan.existingCase);
    for (const c of plan.loadCases) caseId.set(c.id, modelStore.addLoadCase(c.name, c.type as never));
    for (const c of plan.combinations) {
      const factors = c.factors.map((f) => ({ caseId: caseId.get(f.caseId), factor: f.factor }));
      if (factors.some((f) => f.caseId === undefined)) continue;
      modelStore.addCombination(c.name, factors as Array<{ caseId: number; factor: number }>);
    }
    if (plan.combinationRules.length) modelStore.setCombinationRules([...(m.combinationRules ?? []), ...plan.combinationRules] as never);
    if (plan.regulations) m.regulations = JSON.parse(JSON.stringify(plan.regulations));
    if (plan.deflectionLimits) modelStore.setDeflectionLimits(plan.deflectionLimits);
  });
  return plan;
}
