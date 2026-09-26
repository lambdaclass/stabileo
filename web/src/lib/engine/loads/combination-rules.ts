/**
 * Combination rules the project states, in load symbols, beside the regulation's.
 *
 * A rule is a combination spec the engineer writes: `1,2 D + 1,0 E + 0,5 L`, for strength or
 * service. It goes through the same expansion as the regulation's (`combination-cases.ts`),
 * so a rule with W or E still gets one combination per wind or seismic case, and both senses
 * when asked. Rules are saved with the project and travel as a template file between projects.
 */
import type { CombinationTerm, LoadCombinationSpec, LoadSymbol } from '../../codes/cirsoc101/combinations';

export interface CombinationRule {
  id: string;
  purpose: 'strength' | 'service';
  terms: CombinationTerm[];
}

export const RULE_SYMBOLS: readonly LoadSymbol[] = ['D', 'L', 'Lr', 'S', 'R', 'W', 'E', 'F', 'H', 'T'];

/** The rule's formula, in the regulation's locale-neutral notation (`1.2 D + 1.6 L`). */
export function ruleLabel(rule: CombinationRule): string {
  const t = rule.terms.filter((x) => x.factor !== 0);
  if (t.length === 0) return '—';
  return t.map((x, i) => {
    const f = Math.abs(x.factor);
    const sign = x.factor < 0 ? (i === 0 ? '−' : ' − ') : i === 0 ? '' : ' + ';
    return `${sign}${Number.isInteger(f) ? f.toFixed(1) : String(+f.toFixed(3))} ${x.symbol}`;
  }).join('');
}

export function ruleToSpec(rule: CombinationRule): LoadCombinationSpec {
  return {
    id: `project-${rule.id}`, terms: rule.terms.filter((t) => t.factor !== 0),
    label: ruleLabel(rule), refs: [], notes: [], purpose: rule.purpose,
  };
}

/** A regulation spec as an editable rule, to start a project's set from. */
export function specToRule(spec: LoadCombinationSpec, id: string): CombinationRule {
  return { id, purpose: spec.purpose ?? 'strength', terms: spec.terms.map((t) => ({ ...t })) };
}

const TEMPLATE_KIND = 'stabileo.combinationRules';

/** The rules as a template file. */
export function rulesToTemplate(rules: readonly CombinationRule[], name: string): string {
  return JSON.stringify({ kind: TEMPLATE_KIND, version: 1, name, rules }, null, 2);
}

/** Read a template file; null when it is not one. Unknown symbols and non-numeric factors are dropped. */
export function rulesFromTemplate(text: string): { name: string; rules: CombinationRule[] } | null {
  let doc: unknown;
  try { doc = JSON.parse(text); } catch { return null; }
  const d = doc as { kind?: unknown; name?: unknown; rules?: unknown };
  if (!d || d.kind !== TEMPLATE_KIND || !Array.isArray(d.rules)) return null;
  const rules: CombinationRule[] = [];
  d.rules.forEach((r: unknown, i: number) => {
    const x = r as { purpose?: unknown; terms?: unknown };
    if (!x || !Array.isArray(x.terms)) return;
    const terms = (x.terms as Array<{ symbol?: unknown; factor?: unknown }>)
      .filter((t) => RULE_SYMBOLS.includes(t.symbol as LoadSymbol) && typeof t.factor === 'number' && Number.isFinite(t.factor))
      .map((t) => ({ symbol: t.symbol as LoadSymbol, factor: t.factor as number }));
    if (terms.length === 0) return;
    rules.push({ id: `r${i + 1}`, purpose: x.purpose === 'service' ? 'service' : 'strength', terms });
  });
  return { name: typeof d.name === 'string' ? d.name : '', rules };
}
