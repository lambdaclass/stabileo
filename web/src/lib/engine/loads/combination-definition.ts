/**
 * A combination of the model's cases, written back in load symbols: `1.2 D + 1.6 L`.
 *
 * The combinations list shows each one by what it adds up, read from its factors rather than
 * its name, so a factor edited by hand shows at once. Cases of a symbol that all enter with the
 * same factor are that symbol (two dead-load cases at 1,2 are `1.2 D`); a case entering on its
 * own, as one wind direction among several does, is named beside its symbol (`1.0 W (Viento +X)`).
 * A case with no type, or made of others, is named alone.
 *
 * Pure: no store.
 */
import { symbolOfCase } from './combination-cases';
import { RULE_SYMBOLS, termsLabel } from './combination-rules';

const ORDER: readonly string[] = RULE_SYMBOLS;

export function combinationDefinition(
  factors: ReadonlyArray<{ caseId: number; factor: number }>,
  cases: ReadonlyArray<{ id: number; type?: string; name: string; includes?: ReadonlyArray<unknown> }>,
): string {
  const caseById = new Map(cases.map((c) => [c.id, c]));
  const casesOf = new Map<string, number>();
  for (const c of cases) {
    const s = symbolOfCase(c);
    if (s) casesOf.set(s, (casesOf.get(s) ?? 0) + 1);
  }

  // Group by symbol and factor, keeping the cases each group holds.
  const groups = new Map<string, { symbol: string | null; factor: number; names: string[] }>();
  for (const f of factors) {
    if (Math.abs(f.factor) < 1e-12) continue;
    const c = caseById.get(f.caseId);
    if (!c) continue;
    const symbol = symbolOfCase(c);
    const key = symbol ? `${symbol}|${f.factor}` : `#${c.id}`;
    const g = groups.get(key) ?? { symbol, factor: f.factor, names: [] };
    g.names.push(c.name);
    groups.set(key, g);
  }

  const rank = (s: string | null) => (s === null ? ORDER.length : ORDER.indexOf(s));
  const terms: Array<{ label: string; factor: number; rank: number }> = [];
  for (const g of groups.values()) {
    if (g.symbol === null) {
      terms.push({ label: g.names[0]!, factor: g.factor, rank: rank(null) });
    } else if (g.names.length === casesOf.get(g.symbol)) {
      terms.push({ label: g.symbol, factor: g.factor, rank: rank(g.symbol) });
    } else {
      for (const n of g.names) terms.push({ label: `${g.symbol} (${n})`, factor: g.factor, rank: rank(g.symbol) });
    }
  }
  terms.sort((a, b) => a.rank - b.rank);
  return termsLabel(terms);
}
