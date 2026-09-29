/**
 * Numbers as the step-by-step documents write them: four significant
 * figures, a true minus, and powers of ten in the KaTeX way, so 0.000123
 * reads 1.23·10⁻⁴ and 200000000 reads 2·10⁸. One format for every method,
 * so a value computed in step 3 reads the same when it comes back in step 7.
 */

/** A number in KaTeX, with `sig` significant figures (trailing zeros dropped). */
export function num(v: number, sig = 4): string {
  if (!Number.isFinite(v)) return v > 0 ? '\\infty' : v < 0 ? '-\\infty' : '\\text{—}';
  if (Math.abs(v) < 1e-12) return '0';
  const a = Math.abs(v);
  const e = Math.floor(Math.log10(a));
  if (e >= 6 || e <= -4) {
    const ms = trim((v / 10 ** e).toPrecision(sig));
    if (ms === '1') return `10^{${e}}`;
    if (ms === '-1') return `-10^{${e}}`;
    return `${ms} \\cdot 10^{${e}}`;
  }
  return trim(roundSig(v, sig));
}

/** The same number as plain text (tables, captions). */
export function numText(v: number, sig = 4): string {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) < 1e-12) return '0';
  const a = Math.abs(v);
  const e = Math.floor(Math.log10(a));
  if (e >= 6 || e <= -4) {
    const m = trim((v / 10 ** e).toPrecision(sig)).replace('-', '−');
    return `${m}·10${superscript(e)}`;
  }
  return trim(roundSig(v, sig)).replace('-', '−');
}

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
/** An exponent as superscript characters, for plain text: 10⁻⁴. */
export function superscript(e: number): string {
  return String(e).split('').map((c) => SUP[c] ?? c).join('');
}

/**
 * A computed value that should equal `target` (a joint's couple, zero): the
 * relation to write and the value. Round-off is written as the target
 * itself; a leftover within what an iteration was asked to reach (10⁻⁵ of
 * the size of the terms) as ≈ the target; anything larger as it is, so a
 * real error still shows.
 */
export function settle(v: number, target: number, scale: number): { rel: string; tex: string; ok: boolean } {
  const d = Math.abs(v - target);
  const s = Math.max(Math.abs(scale), Math.abs(target), 1e-9);
  if (d <= 1e-9 * s) return { rel: '=', tex: num(target), ok: true };
  if (d <= 1e-5 * s) return { rel: '\\approx', tex: num(target), ok: true };
  return { rel: '=', tex: num(v), ok: false };
}

/** A number inside a sum or product: wrapped in parentheses when negative. */
export function par(v: number, sig = 4): string {
  const s = num(v, sig);
  return v < 0 ? `(${s})` : s;
}

/** A signed term to append to a sum: "+ 3.2" or "- 3.2". */
export function term(v: number, sig = 4): string {
  return v < 0 ? `- ${num(-v, sig)}` : `+ ${num(v, sig)}`;
}

function roundSig(v: number, sig: number): string {
  const a = Math.abs(v);
  // Integers up to 6 digits keep all their digits (4889, not 4889.0 or 4890).
  if (Number.isInteger(v) && a < 1e6) return String(v);
  const digits = Math.max(0, sig - 1 - Math.floor(Math.log10(a)));
  return v.toFixed(Math.min(digits, 10));
}

function trim(s: string): string {
  if (!s.includes('.') || s.includes('e')) return s;
  return s.replace(/0+$/, '').replace(/\.$/, '');
}

/** A node or member name as the documents write it: A, B, … Z, AA, AB … by order. */
export function letterName(k: number): string {
  let s = '';
  let n = k;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

/**
 * Words with the subscripts and superscripts they carry split out, for the
 * viewer to set as such: "θ_I − ψ" reads θ with I below, "u_{x,B}" u with
 * x,B below, "V^s" V with s above. The mark follows a letter; `_{…}` or
 * `^{…}` takes everything in braces, a bare mark the letters and digits that
 * follow.
 */
export type ProsePart = { text: string; kind: 'text' | 'sub' | 'sup' };
export function proseParts(s: string): ProsePart[] {
  const out: ProsePart[] = [];
  const re = /(?<=[\p{L}′'])([_^])(\{([^}]*)\}|[\p{L}\p{N}′]+)/gu;
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index! > last) out.push({ text: s.slice(last, m.index), kind: 'text' });
    out.push({ text: m[3] ?? m[2], kind: m[1] === '_' ? 'sub' : 'sup' });
    last = m.index! + m[0].length;
  }
  if (last < s.length || out.length === 0) out.push({ text: s.slice(last), kind: 'text' });
  return out;
}
