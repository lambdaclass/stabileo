/**
 * The Advanced panel's search: offline, over words the panel already has.
 *
 * Text and query are folded the same way (case, accents, Greek letters spelled out, sub- and
 * superscripts as digits, punctuation as spaces), so "phi" finds φ, "pdelta" finds "P-Δ" and
 * "flexion" finds "flexión". Every word of the query must match a word of the entry, exactly,
 * as its start, inside the entry run together, or within a small typo; the entry's title
 * counts most, then its aliases, its step-by-step methods and its description.
 */

const GREEK: Record<string, string> = {
  α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', '∆': 'delta', ε: 'epsilon', ϵ: 'epsilon', ζ: 'zeta', η: 'eta',
  θ: 'theta', ϑ: 'theta', ι: 'iota', κ: 'kappa', λ: 'lambda', μ: 'mu', µ: 'mu', ν: 'nu', ξ: 'xi', π: 'pi',
  ρ: 'rho', σ: 'sigma', ς: 'sigma', τ: 'tau', υ: 'upsilon', φ: 'phi', ϕ: 'phi', χ: 'chi', ψ: 'psi', ω: 'omega',
};

const SCRIPTS: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  'º': 'o', 'ª': 'a', 'ß': 'ss', 'ı': 'i', 'ø': 'o', 'æ': 'ae', 'œ': 'oe',
};

/** Query words that mean the same as others: each expands to the alternatives it may match. */
const ALIASES: Record<string, readonly string[]> = {
  fi: ['phi'], phy: ['phi'], fhi: ['phi'], lamda: ['lambda'], lamba: ['lambda'], sygma: ['sigma'],
  ni: ['nu'], my: ['mu'], omega: ['omega', 'w'], eps: ['epsilon'], tita: ['theta'], teta: ['theta'],
  delta: ['delta', 'd'], deltas: ['delta'],
  '2do': ['2', 'second', 'segundo', 'ii'], '2da': ['2', 'second', 'segunda', 'ii'], '2nd': ['2', 'second', 'ii'],
  '2o': ['2', 'second', 'segundo', 'ii'], '2a': ['2', 'second', 'segunda', 'ii'], ii: ['ii', '2', 'second'],
  segundo: ['segundo', 'second', '2'], segunda: ['segunda', 'second', '2'], second: ['second', '2', 'segundo'],
  orden: ['orden', 'order', 'ordem', 'ordnung', 'ordre'], order: ['order', 'orden', 'ordem'],
  primer: ['primer', 'first', '1'], first: ['first', '1'],
  pcr: ['pcr', 'buckling'], ncr: ['pcr', 'buckling'],
};

/** Lowercase, accents off, Greek spelled out, scripts as digits, anything else a space. */
export function fold(text: string): string {
  let s = '';
  for (const ch of text.toLowerCase()) s += GREEK[ch] ? ` ${GREEK[ch]} ` : SCRIPTS[ch] ?? ch;
  return s.normalize('NFD').replace(/\p{M}+/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function words(text: string): string[] {
  const f = fold(text);
  return f ? f.split(' ') : [];
}

/** Optimal string alignment distance, stopped once it exceeds `max`. */
export function typoDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2: number[] = new Array(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
    if (rowMin > max) return max + 1;
  }
  return prev[b.length];
}

const allowedTypos = (n: number) => (n >= 8 ? 2 : n >= 4 ? 1 : 0);

export type SearchField = 'title' | 'keywords' | 'steps' | 'description' | 'group';

const WEIGHT: Record<SearchField, number> = { title: 10, keywords: 9, steps: 5, description: 3, group: 1.5 };

const PHRASE_BONUS: Partial<Record<SearchField, { whole: number; start: number }>> = { title: { whole: 8, start: 4 }, keywords: { whole: 6, start: 3 } };

export interface SearchDoc<T = unknown> {
  id: string;
  /** Everything the entry is called, in each language searched. */
  fields: Partial<Record<SearchField, readonly string[]>>;
  /** Ranked a little under an entry that matches as well (a method under its function). */
  secondary?: boolean;
  item: T;
}

interface Prepared<T> {
  doc: SearchDoc<T>;
  order: number;
  fields: Array<{ field: SearchField; words: string[]; compact: string; title: string }>;
}

export interface SearchIndex<T> { docs: Prepared<T>[] }

export function buildIndex<T>(docs: readonly SearchDoc<T>[]): SearchIndex<T> {
  return {
    docs: docs.map((doc, order) => ({
      doc, order,
      fields: (Object.keys(doc.fields) as SearchField[]).flatMap((field) => (doc.fields[field] ?? []).map((text) => {
        const w = words(text);
        return { field, words: w, compact: w.join(''), title: w.join(' ') };
      })),
    })),
  };
}

/** How well one query word matches one word list (1 exact … 0 none). */
function wordScore(q: string, alternatives: readonly string[], field: { words: string[]; compact: string }): number {
  let best = 0;
  for (const alt of alternatives) {
    for (const w of field.words) {
      if (w === alt) return 1;
      if (alt.length >= 1 && w.startsWith(alt)) best = Math.max(best, alt.length === 1 ? 0.55 : 0.85);
      else {
        const max = allowedTypos(alt.length);
        if (max && Math.abs(w.length - alt.length) <= max) {
          if (typoDistance(alt, w, max) <= max) best = Math.max(best, 0.5);
        } else if (max && w.length > alt.length && typoDistance(alt, w.slice(0, alt.length), max) <= max) {
          best = Math.max(best, 0.4);
        }
      }
    }
    if (alt.length >= 3 && field.compact.includes(alt)) best = Math.max(best, 0.6);
  }
  if (q.length >= 4 && field.compact.includes(q)) best = Math.max(best, 0.6);
  return best;
}

export interface SearchHit<T> { doc: SearchDoc<T>; score: number }

export function search<T>(index: SearchIndex<T>, query: string): SearchHit<T>[] {
  const qWords = words(query);
  if (!qWords.length) return [];
  const qCompact = qWords.join('');
  const qPhrase = qWords.join(' ');
  const hits: Array<SearchHit<T> & { order: number }> = [];
  for (const p of index.docs) {
    let total = 0;
    let all = true;
    for (const q of qWords) {
      const alternatives = [q, ...(ALIASES[q] ?? [])];
      let best = 0;
      for (const f of p.fields) {
        const s = wordScore(q, alternatives, f) * WEIGHT[f.field];
        if (s > best) best = s;
      }
      if (best === 0) { all = false; break; }
      total += best;
    }
    if (!all && qWords.length > 1 && qCompact.length >= 4) {
      const whole = p.fields.reduce((m, f) => (f.compact.includes(qCompact) ? Math.max(m, 0.6 * WEIGHT[f.field] * qWords.length) : m), 0);
      if (whole > 0) { all = true; total = whole; }
    }
    if (!all) continue;
    let bonus = 0;
    for (const f of p.fields) {
      const b = PHRASE_BONUS[f.field];
      if (!b) continue;
      if (f.title === qPhrase) bonus = Math.max(bonus, b.whole);
      else if (f.title.startsWith(qPhrase) || f.compact.startsWith(qCompact)) bonus = Math.max(bonus, b.start);
    }
    total += bonus;
    if (p.doc.secondary) total *= 0.6;
    hits.push({ doc: p.doc, score: total, order: p.order });
  }
  hits.sort((a, b) => b.score - a.score || a.order - b.order);
  return hits.map(({ doc, score }) => ({ doc, score }));
}
