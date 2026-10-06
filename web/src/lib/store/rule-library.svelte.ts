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

/*
 * Every tab on this computer shares the list, and any of them may have saved since this one read
 * it. So every change reads the stored list again and changes only its own entry: writing back
 * the list this tab read at start dropped what another tab had saved since. Entries are parsed
 * one at a time and an entry that does not parse is skipped, not dropped: one bad entry used to
 * throw out of the whole read, the library came back empty, and the next save overwrote every
 * template with the one being saved. A skipped entry stays in storage as it was.
 */

/** The stored entries as they are; null when storage cannot be read. */
function readRaw(): unknown[] | null {
  let raw: string | null;
  try { raw = localStorage.getItem(KEY); } catch { return null; }
  try {
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function parse(x: unknown): RuleTemplate | null {
  try {
    const e = x as { id?: unknown; name?: unknown; doc?: unknown; savedAt?: unknown } | null;
    const parsed = typeof e?.doc === 'string' ? rulesFromTemplate(e.doc) : null;
    return parsed && typeof e!.id === 'string'
      ? { id: e!.id, name: typeof e!.name === 'string' ? e!.name : parsed.name, rules: parsed.rules, savedAt: String(e!.savedAt ?? '') }
      : null;
  } catch { return null; }
}

const parseAll = (list: unknown[]): RuleTemplate[] => list.flatMap((x) => parse(x) ?? []);
const stored = (x: RuleTemplate) => ({ id: x.id, name: x.name, savedAt: x.savedAt, doc: rulesToTemplate(x.rules, x.name) });

let templates = $state<RuleTemplate[]>(parseAll(readRaw() ?? []));

// Another tab's save shows here too.
if (typeof window !== 'undefined') {
  window.addEventListener?.('storage', (e) => { if (e.key === KEY || e.key === null) templates = parseAll(readRaw() ?? []); });
}

/**
 * Apply `change` to the list as stored now, and keep it. Without storage the change still applies
 * to this tab's list, and the result says it did not keep.
 */
function update(change: (list: unknown[]) => unknown[]): boolean {
  const current = readRaw();
  const next = change(current ?? templates.map(stored));
  templates = parseAll(next);
  if (current === null) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    return true;
  } catch { return false; }
}

/** An id no entry has: the time alone gave two saves in one millisecond the same id. */
function freshId(list: unknown[]): string {
  const used = new Set(list.map((x) => (x as { id?: unknown } | null)?.id));
  let id: string;
  do id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; while (used.has(id));
  return id;
}

export const ruleLibrary = {
  get templates() { return templates; },
  /** Save under `name`, replacing a template of the same name. False when the browser did not keep it. */
  save(name: string, rules: readonly CombinationRule[]): boolean {
    const clean = name.trim() || 'Template';
    const copy = rules.map((r) => ({ ...r, terms: r.terms.map((t) => ({ ...t })) }));
    return update((list) => [
      ...list.filter((x) => parse(x)?.name !== clean),
      stored({ id: freshId(list), name: clean, rules: copy, savedAt: new Date().toISOString() }),
    ]);
  },
  remove(id: string): void { update((list) => list.filter((x) => (x as { id?: unknown } | null)?.id !== id)); },
};
