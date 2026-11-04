/**
 * Exact content hashes: SHA-256 of a canonical JSON that keeps every bit of every number.
 *
 * Not `engine/design/canonical-hash.ts`. That one quantises to four decimals on purpose, so a
 * re-serialisation cannot void a design certificate. A provenance hash answers the opposite
 * question, "is this bit for bit the same", and quantising would make two results that differ in
 * the last place hash alike, which is exactly what a reproducibility check exists to catch.
 *
 * Canonical form:
 *   - object keys sorted, `undefined` members dropped (absent and undefined hash alike);
 *   - Maps as their entries sorted by key, Sets as their sorted values;
 *   - numbers by `String(n)`, which is the shortest text that reads back to the same double,
 *     so distinct finite doubles never share a text; `-0` is written `-0`, and NaN/±Infinity
 *     by name (JSON would turn all three into `null`);
 *   - typed arrays as plain arrays of their numbers.
 */
import { sha256Hex } from './sha256';

function num(n: number): string {
  if (Number.isNaN(n)) return '"NaN"';
  if (n === Infinity) return '"Infinity"';
  if (n === -Infinity) return '"-Infinity"';
  if (Object.is(n, -0)) return '-0';
  return String(n);
}

function write(value: unknown, out: string[], omit: ReadonlySet<string>): void {
  if (value === null || value === undefined) { out.push('null'); return; }
  switch (typeof value) {
    case 'number': out.push(num(value)); return;
    case 'boolean': out.push(value ? 'true' : 'false'); return;
    case 'string': out.push(JSON.stringify(value)); return;
    case 'bigint': out.push(JSON.stringify(value.toString())); return;
    case 'function': case 'symbol': out.push('null'); return;
  }
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    write(Array.from(value as unknown as ArrayLike<number>), out, omit);
    return;
  }
  if (Array.isArray(value)) {
    out.push('[');
    value.forEach((v, i) => { if (i) out.push(','); write(v, out, omit); });
    out.push(']');
    return;
  }
  if (value instanceof Map) {
    const entries = [...value.entries()].map(([k, v]) => [String(k), v] as const)
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    write(Object.fromEntries(entries), out, omit);
    return;
  }
  if (value instanceof Set) {
    const items = [...value].map((v) => canonicalExactJson(v)).sort();
    out.push('[', items.join(','), ']');
    return;
  }
  const src = value as Record<string, unknown>;
  const keys = Object.keys(src).filter((k) => src[k] !== undefined && !omit.has(k)).sort();
  out.push('{');
  keys.forEach((k, i) => {
    if (i) out.push(',');
    out.push(JSON.stringify(k), ':');
    write(src[k], out, omit);
  });
  out.push('}');
}

/**
 * Canonical JSON of `value`. `omit`: keys dropped at every depth (wall-clock timings, say, which
 * describe the run and not the answer).
 */
export function canonicalExactJson(value: unknown, omit: readonly string[] = []): string {
  const out: string[] = [];
  write(value, out, new Set(omit));
  return out.join('');
}

/** Lowercase hex SHA-256 of the canonical JSON of `value`. */
export function exactHash(value: unknown, omit: readonly string[] = []): string {
  return sha256Hex(canonicalExactJson(value, omit));
}
