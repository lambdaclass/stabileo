/**
 * A library of combination rule templates kept in this browser, for every project: the same
 * document a template file holds (`engine/loads/combination-rules.ts`), stored under a name. A
 * file still moves a template to another computer; the library saves the round trip on this one.
 *
 * Browser storage can be missing or refused (a private window, blocked site data): reads come
 * back empty and a save says it did not keep.
 */
import { rulesFromTemplate, rulesToTemplate, type CombinationRule } from '../engine/loads/combination-rules';

const KEY = 'stabileo-combination-rule-library';

export interface RuleTemplate { id: string; name: string; rules: CombinationRule[]; savedAt: string }

function read(): RuleTemplate[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.flatMap((x: { id?: unknown; name?: unknown; doc?: unknown; savedAt?: unknown }) => {
      const parsed = typeof x?.doc === 'string' ? rulesFromTemplate(x.doc) : null;
      return parsed && typeof x.id === 'string'
        ? [{ id: x.id, name: typeof x.name === 'string' ? x.name : parsed.name, rules: parsed.rules, savedAt: String(x.savedAt ?? '') }]
        : [];
    });
  } catch { return []; }
}

let templates = $state<RuleTemplate[]>(read());

function write(next: RuleTemplate[]): boolean {
  templates = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next.map((x) => ({ id: x.id, name: x.name, savedAt: x.savedAt, doc: rulesToTemplate(x.rules, x.name) }))));
    return true;
  } catch { return false; }
}

export const ruleLibrary = {
  get templates() { return templates; },
  /** Save under `name`, replacing a template of the same name. False when the browser did not keep it. */
  save(name: string, rules: readonly CombinationRule[]): boolean {
    const clean = name.trim() || 'Template';
    const rest = templates.filter((x) => x.name !== clean);
    return write([...rest, { id: `t${Date.now().toString(36)}`, name: clean, rules: rules.map((r) => ({ ...r, terms: r.terms.map((t) => ({ ...t })) })), savedAt: new Date().toISOString() }]);
  },
  remove(id: string): void { write(templates.filter((x) => x.id !== id)); },
};
