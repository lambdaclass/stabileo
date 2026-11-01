import { decodeEntities } from './report-formats';
import type { Run } from './docx';

interface El { tag: string; attrs: string; kids: Array<El | string> }

function parse(xml: string): El | null {
  const root: El = { tag: '#root', attrs: '', kids: [] };
  const stack: El[] = [root];
  for (const m of xml.matchAll(/<(\/?)([a-zA-Z][\w:.-]*)([^>]*?)(\/?)>|([^<]+)/g)) {
    const top = stack[stack.length - 1]!;
    if (m[5] !== undefined) { top.kids.push(decodeEntities(m[5])); continue; }
    if (m[1]) { if (stack.length > 1 && top.tag === m[2]) stack.pop(); else return null; continue; }
    const el: El = { tag: m[2]!, attrs: m[3] ?? '', kids: [] };
    top.kids.push(el);
    if (!m[4]) stack.push(el);
  }
  return stack.length === 1 ? root : null;
}

const elems = (e: El) => e.kids.filter((k): k is El => typeof k !== 'string');
const text = (e: El | string): string => (typeof e === 'string' ? e : e.kids.map(text).join(''));

class Unsupported extends Error {}

/** A sub- or superscript inside another: Word cannot raise twice, so the inner one is written out. */
function raise(runs: Run[], vert: 'sub' | 'sup'): Run[] {
  return runs.map((r) => (r.vert ? { text: `${r.vert === 'sub' ? '_' : '^'}(${r.text})`, vert } : { ...r, vert }));
}

/** How many terms a node shows side by side: more than one needs parentheses as a fraction's part. */
function terms(e: El): number {
  if (e.tag === 'mrow' || e.tag === 'mstyle' || e.tag === 'mpadded') return elems(e).reduce((n, k) => n + terms(k), 0);
  if (e.tag === 'mfrac') return 2;
  return 1;
}

const LARGE_OPERATORS = /^[∑∏∐∫∬∭∮⋃⋂⋁⋀]$|^lim$|^max$|^min$/;

function runs(e: El): Run[] {
  switch (e.tag) {
    case 'mi': case 'mn': case 'mo': case 'mtext': case 'ms': {
      const t = text(e);
      return t ? [{ text: t }] : [];
    }
    case 'mspace': return [{ text: ' ' }];
    case 'mphantom': case 'annotation': case 'annotation-xml': return [];
    case 'math': case 'mrow': case 'mstyle': case 'mpadded': case '#root':
      return row(elems(e));
    case 'semantics': return elems(e).slice(0, 1).flatMap(runs);
    case 'msub': case 'msup': case 'msubsup': case 'munder': case 'mover': case 'munderover': {
      const [base, a, b] = elems(e);
      if (!base || !a) throw new Unsupported();
      const under = e.tag === 'munder' || e.tag === 'mover' || e.tag === 'munderover';
      if (under && !(base.tag === 'mo' && LARGE_OPERATORS.test(text(base)))) throw new Unsupported();
      const first: 'sub' | 'sup' = e.tag === 'msup' || e.tag === 'mover' ? 'sup' : 'sub';
      return [...wrapped(base), ...raise(runs(a), first), ...(b ? raise(runs(b), 'sup') : [])];
    }
    case 'mfrac': {
      const [num, den] = elems(e);
      if (!num || !den || /linethickness\s*=\s*"0/.test(e.attrs)) throw new Unsupported();
      return [...grouped(num), { text: '/' }, ...grouped(den)];
    }
    case 'msqrt': return [{ text: '√(' }, ...elems(e).flatMap(runs), { text: ')' }];
    case 'mroot': {
      const [radicand, index] = elems(e);
      if (!radicand || !index) throw new Unsupported();
      return [...raise(runs(index), 'sup'), { text: '√(' }, ...runs(radicand), { text: ')' }];
    }
    default: throw new Unsupported();
  }
}

const LOOSER = /^[+\-−±∓=≠≈≡∼<>≤≥,;:→⇒)\]}|]$/;
const isOp = (e: El | undefined, re: RegExp) => !!e && (e.tag === 'mo' || e.tag === 'mi') && re.test(text(e).trim());

/**
 * Side-by-side terms. A fraction written as a/b binds looser than what is set beside it, so it is
 * fenced when a factor follows it ("(1/2)qL", not "1/2qL") or a division precedes it.
 */
function row(kids: El[]): Run[] {
  const shown = kids.filter((k) => k.tag !== 'mspace');
  return kids.flatMap((k) => {
    if (k.tag !== 'mfrac') return runs(k);
    const i = shown.indexOf(k), prev = shown[i - 1], next = shown[i + 1];
    const fence = isOp(prev, /^[/÷]$/) || (!!next && !isOp(next, LOOSER));
    const r = runs(k);
    return fence ? [{ text: '(' }, ...r, { text: ')' }] : r;
  });
}

/** A fraction's numerator or denominator, in parentheses when it shows more than one term. */
function grouped(e: El): Run[] {
  const r = runs(e);
  return terms(e) > 1 ? [{ text: '(' }, ...r, { text: ')' }] : r;
}

/** The base of a script, in parentheses when it is itself compound (a fraction, a sum). */
function wrapped(e: El): Run[] {
  const r = runs(e);
  const fenced = r[0]?.text.startsWith('(') && r[r.length - 1]?.text.endsWith(')');
  return terms(e) > 1 && !fenced ? [{ text: '(' }, ...r, { text: ')' }] : r;
}

/**
 * A KaTeX MathML expression as Word runs: fractions as num/den with parentheses around compound
 * parts, roots as √(…), sub- and superscripts kept at every depth. Null for a construct it cannot
 * write unambiguously (accents, matrices, binomials), which the caller writes as its TeX.
 */
export function mathmlRuns(mathml: string): Run[] | null {
  const tree = parse(/<math\b[\s\S]*<\/math>/.exec(mathml)?.[0] ?? mathml);
  if (!tree) return null;
  try {
    const out: Run[] = [];
    for (const r of runs(tree)) {
      const last = out[out.length - 1];
      if (last && last.vert === r.vert) last.text += r.text; else out.push({ ...r });
    }
    return out;
  } catch (e) {
    if (e instanceof Unsupported) return null;
    throw e;
  }
}
