/**
 * Display mathematics for a narrow panel.
 *
 * A step writes its mathematics for a page: two results side by side
 * (FEM_ij = …, \qquad FEM_ji = …), a chain of equalities on one line, a long
 * sum. A side panel or a phone has a few hundred pixels. The viewer asks for
 * the next level of breaking while the equation still does not fit:
 *
 *   0. what `\qquad` puts side by side is stacked, one per line;
 *   1. lists (a, b, c or a \quad b) are stacked too, and a chain of
 *      relations (a = b = c, a = 0 ⇒ b = …) is broken at its relation
 *      signs, lined up;
 *   2. a line still long is broken before its + and − signs, and every line
 *      starts at the left, the relation sign opening the ones that follow;
 *   3 and 4. the same, shorter.
 *
 * Only what is at the top level is broken: nothing inside braces, brackets,
 * parentheses, \left … \right or an environment.
 */

export const NARROW_LEVELS = 4;

/** Below about this many characters an item is never broken. */
const SHORT = 22;

interface Token { text: string; depth: number; at: number }

const OPEN = new Set(['{', '(', '[']);
const CLOSE = new Set(['}', ')', ']']);

/*
 * At the last level, plain parentheses, brackets and \{ \} no longer count as
 * nesting: a long bracketed sum may then break inside its brackets. Braces,
 * \left … \right and environments always do, since breaking those would not
 * parse.
 */
let loose = false;

/** The tex split into characters and commands, each with its nesting depth. */
function tokens(tex: string): Token[] {
  const out: Token[] = [];
  let depth = 0;
  for (let i = 0; i < tex.length;) {
    const c = tex[i];
    if (c === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(tex.slice(i));
      const name = m ? m[1] : '';
      const text = m ? m[0] : c;
      if (name === 'left' || name === 'begin') {
        out.push({ text, depth, at: i }); depth++;
        i += text.length;
        // The delimiter or the environment's name belongs to it.
        const d = name === 'begin' ? /^\{[^}]*\}/.exec(tex.slice(i)) : /^\s*(\\[{}|.]|\\[A-Za-z]+|[^\s])/.exec(tex.slice(i));
        if (d) { out.push({ text: d[0], depth, at: i }); i += d[0].length; }
        continue;
      }
      if (name === 'right' || name === 'end') {
        depth = Math.max(0, depth - 1);
        out.push({ text, depth, at: i });
        i += text.length;
        const d = name === 'end' ? /^\{[^}]*\}/.exec(tex.slice(i)) : /^\s*(\\[{}|.]|\\[A-Za-z]+|[^\s])/.exec(tex.slice(i));
        if (d) { out.push({ text: d[0], depth, at: i }); i += d[0].length; }
        continue;
      }
      if (name === '{' && !loose) { out.push({ text, depth, at: i }); depth++; i += 2; continue; }
      if (name === '}' && !loose) { depth = Math.max(0, depth - 1); out.push({ text, depth, at: i }); i += 2; continue; }
      out.push({ text, depth, at: i });
      i += text.length;
      continue;
    }
    if (OPEN.has(c) && (c === '{' || !loose)) { out.push({ text: c, depth, at: i }); depth++; i++; continue; }
    if (CLOSE.has(c) && (c === '}' || !loose)) { depth = Math.max(0, depth - 1); out.push({ text: c, depth, at: i }); i++; continue; }
    out.push({ text: c, depth, at: i });
    i++;
  }
  return out;
}

/** Split at the top-level tokens `is` accepts; the separators are returned too. */
function splitTop(tex: string, is: (t: Token, k: number, all: Token[]) => boolean): { parts: string[]; seps: string[] } {
  const all = tokens(tex);
  const parts: string[] = [], seps: string[] = [];
  let last = 0;
  all.forEach((t, k) => {
    if (t.depth === 0 && is(t, k, all)) {
      parts.push(tex.slice(last, t.at));
      seps.push(t.text);
      last = t.at + t.text.length;
    }
  });
  parts.push(tex.slice(last));
  return { parts, seps };
}

const RELATIONS = new Set(['=', '\\Rightarrow', '\\approx', '\\equiv']);
const SPACE = /^\s$/;

/** A + or − joining two terms (not a sign: after a relation, an opening or the start). */
function isBinary(t: Token, k: number, all: Token[]): boolean {
  if (t.text !== '+' && t.text !== '-') return false;
  for (let j = k - 1; j >= 0; j--) {
    const p = all[j].text;
    if (SPACE.test(p)) continue;
    if (all[j].depth !== 0) return true; // the end of a group: }, ), ]
    return /^[A-Za-z0-9.|!'}\])]$/.test(p) || /^\\(right|prime|infty|checkmark)/.test(p) || /^\\[A-Za-z]+$/.test(p) && !RELATIONS.has(p) && !/^\\(cdot|times|quad|qquad|left|,|;|pm|mp)$/.test(p);
  }
  return false;
}

/** About how many characters wide a piece of tex reads. */
function visible(tex: string): number {
  return tex
    .replace(/\\(mathrm|mathbf|mathit|text|hat|bar|tilde|boxed|left|right|displaystyle|operatorname)\b/g, '')
    .replace(/\\(,|;|!|:|quad|qquad)/g, ' ')
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a, b) => (a.length > b.length ? a : b))
    .replace(/\\[A-Za-z]+/g, 'x')
    .replace(/[{}^_\s&]/g, '').length;
}

const trimSep = (s: string) => s.trim().replace(/^\\[,;]\s*|\s*\\[,;]$/g, '').replace(/,\s*$/, '').trim();

/** Everything a single top-level \boxed{…} holds, or null. */
function boxedInner(tex: string): string | null {
  const t = tex.trim();
  if (!t.startsWith('\\boxed{')) return null;
  const all = tokens(t);
  const close = all.findIndex((x, k) => k > 1 && x.text === '}' && x.depth === 0);
  return close === all.length - 1 ? t.slice(all[1].at + 1, t.length - 1) : null;
}

/** Stack the items of a top-level list: a, b, c and a \quad b. */
function listItems(tex: string): string[] {
  const { parts } = splitTop(tex, (t) => t.text === ',' || t.text === '\\quad' || t.text === '\\qquad');
  return parts.map(trimSep).filter(Boolean);
}

/**
 * One item laid out as aligned rows: broken at its relations, then before its
 * + and − when longer than `max`. `flush` starts every row at the left, so a
 * long first side does not push the rest off the panel.
 */
function alignItem(item: string, max: number | null, flush = false): string {
  const { parts, seps } = splitTop(item, (t) => RELATIONS.has(t.text));
  const sides = parts.map((p) => p.trim());
  const rows: string[] = [];
  const pack = (lead: string, body: string, first: boolean) => {
    if (max === null || visible(body) <= max) { rows.push(first ? body : `${lead} ${body}`); return; }
    const { parts: terms, seps: ops } = splitTop(body, isBinary);
    let line = terms[0].trim();
    let firstLine = true;
    const emit = () => { rows.push(firstLine ? (first ? line : `${lead} ${line}`) : `&\\quad ${line}`); firstLine = false; };
    for (let k = 1; k < terms.length; k++) {
      const next = `${ops[k - 1]} ${terms[k].trim()}`;
      if (visible(line) + visible(next) > max && visible(line) > 0) { emit(); line = next; }
      else line = `${line} ${next}`;
    }
    emit();
  };
  if (sides.length === 1) {
    pack('', sides[0], true);
    if (rows.length === 1) return rows[0];
    return `\\begin{aligned} &${rows.join(' \\\\ ')} \\end{aligned}`;
  }
  if (flush) {
    // Every row at the left: the first side alone, then each relation opening its row.
    pack('&', sides[0], false);
    for (let k = 1; k < sides.length; k++) pack(`&${seps[k - 1]}`, sides[k], false);
    return `\\begin{aligned} ${rows.join(' \\\\ ')} \\end{aligned}`;
  }
  // The first side stays at the left of the first relation; the rest line up on it.
  pack(`${sides[0]} &${seps[0]}`, sides[1], false);
  for (let k = 2; k < sides.length; k++) pack(`&${seps[k - 1]}`, sides[k], false);
  return `\\begin{aligned} ${rows.join(' \\\\ ')} \\end{aligned}`;
}

/** A single top-level \boxed{…} with a unit after it (\boxed{a, b}\ \mathrm{kN}): what it holds and the unit. */
function boxedWithUnit(tex: string): { inner: string; unit: string } | null {
  const t = tex.trim();
  if (!t.startsWith('\\boxed{')) return null;
  const all = tokens(t);
  const close = all.findIndex((x, k) => k > 1 && x.text === '}' && x.depth === 0);
  if (close < 0) return null;
  const unit = t.slice(all[close].at + 1).trim();
  if (!/^(\\[ ,;!]|\\quad|~)?\s*\\(mathrm|text)\{[^{}]*\}$/.test(unit)) return null;
  return { inner: t.slice(all[1].at + 1, all[close].at), unit };
}

/** The rows of a whole-tex gathered or aligned environment, without their alignment marks, or null. */
function envRows(tex: string): string[] | null {
  const m = /^\\begin\{(gathered|aligned)\}([\s\S]*)\\end\{\1\}$/.exec(tex.trim());
  if (!m) return null;
  const inner = m[2];
  // The environment must be the whole tex: nothing inside may close it early.
  let open = 0;
  for (const x of tokens(inner)) {
    if (x.text === '\\begin') open++;
    else if (x.text === '\\end' && --open < 0) return null;
  }
  const rows = splitTop(inner, (t) => t.text === '\\\\').parts;
  return rows.map((r) => splitTop(r, (t) => t.text === '&').parts.join(' ').trim()).filter(Boolean);
}

function layItem(item: string, level: number): string[] {
  const inner = boxedInner(item);
  if (inner !== null && level >= 1) {
    return layItem(inner, level).map((x) => `\\boxed{${x}}`);
  }
  const withUnit = level >= 1 ? boxedWithUnit(item) : null;
  if (withUnit) return layItem(withUnit.inner, level).map((x) => `\\boxed{${x} ${withUnit.unit}}`);
  const items = level >= 1 ? listItems(item) : [item];
  const max = level >= 4 ? 18 : level >= 3 ? 26 : level >= 2 ? 36 : null;
  return items.map((it) => {
    if (level < 1) return it;
    const rels = splitTop(it, (t) => RELATIONS.has(t.text)).seps.length;
    // A short chain (x = 0 : N = −41.92) reads better on one line than broken.
    if (visible(it) <= SHORT || (rels < 2 && (max === null || visible(it) <= max))) return it;
    return alignItem(it, max, level >= 2);
  });
}

/** The same mathematics laid out for a panel a few hundred pixels wide, at a level of breaking (0 … NARROW_LEVELS). */
export function narrowTex(tex: string, level = 0): string {
  loose = level >= 4;
  try {
    // Rows a step already set one under the other are laid out one by one.
    const rows = level >= 1 ? envRows(tex) : null;
    const top = (rows ?? [tex]).flatMap((r) => splitTop(r, (t) => t.text === '\\qquad').parts).map(trimSep).filter(Boolean);
    const items = top.flatMap((p) => layItem(p, level));
    if (items.length === 0) return tex;
    if (items.length === 1) return items[0] === trimSep(tex) && top.length === 1 ? tex : items[0];
    return `\\begin{gathered} ${items.join(' \\\\ ')} \\end{gathered}`;
  } finally {
    loose = false;
  }
}
