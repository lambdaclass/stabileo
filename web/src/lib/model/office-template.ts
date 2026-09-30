/**
 * An office template: the materials, sections, load cases, combinations, combination rules,
 * regulations and deflection limits an office starts its projects with, as a file it can keep
 * and share (the same way the combination rules alone already travel, `combination-rules.ts`).
 *
 * Taken from a project and applied to another. Applying ADDS what the project lacks, matched by
 * name, and never overwrites what it has: a material or section of the same name stays as it is,
 * a load case of the same name is reused (and the template's combinations are remapped onto it),
 * a combination of the same name is skipped. The regulations are the template's, which is what
 * applying an office's template is for. Deflection rules by kind only: a rule naming members or a
 * group of another project names nothing here.
 *
 * Pure: `planTemplate` says what applying would do; the store carries it out.
 */
import type { DeflectionLimits } from '../engine/deflection-limits';

export const OFFICE_TEMPLATE_KIND = 'stabileo-office-template';

interface MaterialLike { id: number; name: string; [k: string]: unknown }
interface SectionLike { id: number; name: string; [k: string]: unknown }
interface CaseLike { id: number; name: string; type: string }
interface ComboLike { id: number; name: string; factors: Array<{ caseId: number; factor: number }> }

export interface OfficeTemplate {
  kind: typeof OFFICE_TEMPLATE_KIND;
  version: 1;
  name: string;
  savedAt: string;
  materials: MaterialLike[];
  sections: SectionLike[];
  loadCases: CaseLike[];
  combinations: ComboLike[];
  combinationRules?: unknown[];
  regulations?: unknown;
  deflectionLimits?: DeflectionLimits;
}

export interface TemplateSource {
  materials: Iterable<MaterialLike>;
  sections: Iterable<SectionLike>;
  loadCases: readonly CaseLike[];
  combinations: readonly ComboLike[];
  combinationRules?: readonly unknown[];
  regulations?: unknown;
  deflectionLimits?: DeflectionLimits;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
/** A section's derived state is the project's to settle, not the template's to carry. */
const bareSection = (s: SectionLike): SectionLike => { const { canonical: _c, ...rest } = s as SectionLike & { canonical?: unknown }; return clone(rest); };

export function templateFrom(src: TemplateSource, name: string, savedAt = new Date().toISOString()): OfficeTemplate {
  const kindRules = src.deflectionLimits?.rules.filter((r) => r.scope.kind === 'memberKind') ?? [];
  return {
    kind: OFFICE_TEMPLATE_KIND, version: 1, name, savedAt,
    materials: [...src.materials].map(clone),
    sections: [...src.sections].map(bareSection),
    loadCases: clone([...src.loadCases]),
    combinations: clone([...src.combinations]),
    ...(src.combinationRules?.length ? { combinationRules: clone([...src.combinationRules]) } : {}),
    ...(src.regulations ? { regulations: clone(src.regulations) } : {}),
    ...(kindRules.length ? { deflectionLimits: { rules: clone(kindRules) } } : {}),
  };
}

export class TemplateError extends Error {}

export function parseTemplate(text: string): OfficeTemplate {
  let v: unknown;
  try { v = JSON.parse(text); } catch { throw new TemplateError('notJson'); }
  const t = v as Partial<OfficeTemplate>;
  if (!t || t.kind !== OFFICE_TEMPLATE_KIND || t.version !== 1) throw new TemplateError('notTemplate');
  if (!Array.isArray(t.materials) || !Array.isArray(t.sections) || !Array.isArray(t.loadCases) || !Array.isArray(t.combinations)) throw new TemplateError('malformed');
  return t as OfficeTemplate;
}

export interface TemplatePlan {
  materials: MaterialLike[];
  sections: SectionLike[];
  loadCases: CaseLike[];
  /** Combinations to add, their factors still on the template's case ids. */
  combinations: ComboLike[];
  /** Template case id → the project's case with the same name, when there is one. */
  existingCase: Map<number, number>;
  combinationRules: unknown[];
  regulations?: unknown;
  deflectionLimits?: DeflectionLimits;
  skipped: { materials: number; sections: number; loadCases: number; combinations: number };
}

/** What applying `t` to a project holding `into` would add. */
export function planTemplate(t: OfficeTemplate, into: TemplateSource): TemplatePlan {
  const names = (it: Iterable<{ name: string }>) => new Set([...it].map((x) => x.name.trim().toLowerCase()));
  const has = (set: Set<string>, n: string) => set.has(n.trim().toLowerCase());
  const mats = names(into.materials), secs = names(into.sections), combos = names(into.combinations);
  const caseByName = new Map(into.loadCases.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const existingCase = new Map<number, number>();
  const loadCases: CaseLike[] = [];
  for (const c of t.loadCases) {
    const hit = caseByName.get(c.name.trim().toLowerCase());
    if (hit !== undefined) existingCase.set(c.id, hit); else loadCases.push(c);
  }
  const ruleIds = new Set((into.combinationRules ?? []).map((r) => (r as { id?: string }).id));
  const kindRulesHere = into.deflectionLimits?.rules.length ?? 0;
  const materials = t.materials.filter((m) => !has(mats, m.name));
  const sections = t.sections.filter((s) => !has(secs, s.name));
  const combinations = t.combinations.filter((c) => !has(combos, c.name));
  return {
    materials, sections, loadCases, combinations, existingCase,
    combinationRules: (t.combinationRules ?? []).filter((r) => !ruleIds.has((r as { id?: string }).id)),
    ...(t.regulations ? { regulations: t.regulations } : {}),
    ...(t.deflectionLimits && kindRulesHere === 0 ? { deflectionLimits: t.deflectionLimits } : {}),
    skipped: {
      materials: t.materials.length - materials.length,
      sections: t.sections.length - sections.length,
      loadCases: existingCase.size,
      combinations: t.combinations.length - combinations.length,
    },
  };
}
