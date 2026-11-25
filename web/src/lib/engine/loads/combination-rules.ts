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

// Wa is the service-level wind of CIRSOC 102-2025 B.4.2: the service rules seeded from the code
// carry it, and a table or template without it dropped the wind from the service envelope.
// M, A and I (mass, accidental, ice) are named by a project's rules only, which is how their cases
// enter a combination; a template reading them dropped them as unknown.
export const RULE_SYMBOLS: readonly LoadSymbol[] = ['D', 'L', 'Lr', 'S', 'R', 'W', 'Wa', 'E', 'F', 'H', 'T', 'M', 'A', 'I'];

/**
 * Terms as a formula, in the regulation's locale-neutral notation (`1.2 D + 1.6 L − 1.0 W`):
 * one decimal at least, more when the factor has them.
 */
export function termsLabel(terms: ReadonlyArray<{ label: string; factor: number; includeZero?: boolean }>): string {
  const t = terms.filter((x) => x.factor !== 0 || x.includeZero);
  if (t.length === 0) return '—';
  return t.map((x, i) => {
    const f = Math.abs(x.factor);
    const sign = x.factor < 0 ? (i === 0 ? '−' : ' − ') : i === 0 ? '' : ' + ';
    return `${sign}${Number.isInteger(f) ? f.toFixed(1) : String(+f.toFixed(3))} ${x.label}`;
  }).join('');
}

export function isCombinationGroup(group: unknown): group is string {
  return typeof group === 'string' && group.trim().length > 0;
}

export function ruleTermSymbol(symbol: LoadSymbol, snowBasis: CombinationTerm['snowBasis']): string {
  return snowBasis === 'flatRoof' ? `${symbol} (pf)` : symbol;
}

export function ruleLabel(rule: CombinationRule): string {
  return termsLabel(rule.terms.map(({ symbol, snowBasis, group, factor }) => {
    const action = ruleTermSymbol(symbol, snowBasis);
    return { label: group === undefined ? action : `${action}(${group})`, factor, includeZero: group !== undefined };
  }));
}

export function ruleToSpec(rule: CombinationRule): LoadCombinationSpec {
  return {
    id: `project-${rule.id}`, terms: rule.terms.filter((t) => t.factor !== 0 || t.group !== undefined),
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

export function rulesFromTemplate(text: string): { name: string; rules: CombinationRule[] } | null {
  let doc: unknown;
  try { doc = JSON.parse(text); } catch { return null; }
  const d = doc as { kind?: unknown; name?: unknown; rules?: unknown };
  if (!d || d.kind !== TEMPLATE_KIND || !Array.isArray(d.rules)) return null;
  const rules: CombinationRule[] = [];
  for (const [i, r] of d.rules.entries()) {
    const x = r as { purpose?: unknown; terms?: unknown };
    if (!x || !Array.isArray(x.terms)) return null;
    const terms: CombinationTerm[] = [];
    for (const t of x.terms as Array<{ symbol?: unknown; factor?: unknown; group?: unknown; snowBasis?: unknown } | null>) {
      if (!t || typeof t !== 'object' || Array.isArray(t)) return null;
      const { factor, group, snowBasis } = t;
      const symbol = RULE_SYMBOLS.find(allowed => allowed === t.symbol);
      if (symbol === undefined || typeof factor !== 'number' || !Number.isFinite(factor)) return null;
      if (group !== undefined && !isCombinationGroup(group)) return null;
      if (snowBasis !== undefined && (symbol !== 'S' || snowBasis !== 'flatRoof')) return null;
      terms.push({ symbol, factor, ...(group === undefined ? {} : { group }), ...(snowBasis === undefined ? {} : { snowBasis }) });
    }
    if (terms.length === 0) continue;
    rules.push({ id: `r${i + 1}`, purpose: x.purpose === 'service' ? 'service' : 'strength', terms });
  }
  return { name: typeof d.name === 'string' ? d.name : '', rules };
}

/**
 * `count` rule ids not in use. Numbering from the list's length reused an id once a rule had
 * been deleted — rules r1 and r3 left, and the next one was r3 again — and two rules with one
 * id broke the keyed list and edited or removed both at once.
 */
export function freshRuleIds(rules: ReadonlyArray<{ id: string }>, count: number): string[] {
  const used = new Set(rules.map((r) => r.id));
  const out: string[] = [];
  for (let n = 1; out.length < count; n++) {
    const id = `r${n}`;
    if (!used.has(id)) { out.push(id); used.add(id); }
  }
  return out;
}
