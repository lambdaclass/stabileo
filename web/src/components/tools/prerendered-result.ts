type Encoded = null | boolean | string | number | Encoded[] | { [key: string]: Encoded };

class Unencodable extends Error {}

function encode(value: unknown): Encoded {
  if (value === undefined) return { $u: 1 };
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) && !Object.is(value, -0) ? value : { $n: Object.is(value, -0) ? '-0' : String(value) };
  if (value instanceof Map) return { $map: [...value].map(([k, v]) => [encode(k), encode(v)]) };
  if (Array.isArray(value)) return Array.from(value, encode);
  if (typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    const out: Record<string, Encoded> = {};
    for (const [key, item] of Object.entries(value)) {
      if (key.startsWith('$')) throw new Unencodable(key);
      out[key] = encode(item);
    }
    return out;
  }
  throw new Unencodable(typeof value);
}

function decode(value: Encoded): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (value === null || typeof value !== 'object') return value;
  if ('$u' in value) return undefined;
  if ('$n' in value) return value.$n === '-0' ? -0 : Number(value.$n);
  if ('$map' in value) return new Map((value.$map as Encoded[][]).map(([k, v]) => [decode(k), decode(v)]));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decode(v)]));
}

function same(a: unknown, b: unknown): boolean {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return Object.is(a, b);
  if (a instanceof Map) return b instanceof Map && a.size === b.size && [...a].every(([k, v], j) => { const [kb, vb] = [...b][j]; return same(k, kb) && same(v, vb); });
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k, j) => k === kb[j] && same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

const paramsKey = (params: Record<string, unknown>) => JSON.stringify(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)));

/** The script text that carries `result` for `params`, or null when it would not decode to exactly the same values. */
export function serializePrerenderedResult(params: Record<string, unknown>, result: unknown): string | null {
  let text: string;
  try {
    text = JSON.stringify({ params: paramsKey(params), result: encode(result) });
  } catch (error) {
    if (error instanceof Unencodable) return null;
    throw error;
  }
  return same(decode(JSON.parse(text).result), result) ? text.replace(/</g, '\\u003c') : null;
}

export function parsePrerenderedResult<T>(text: string, params: Record<string, unknown>): T | null {
  try {
    const stored = JSON.parse(text) as { params: string; result: Encoded };
    return stored.params === paramsKey(params) ? decode(stored.result) as T : null;
  } catch {
    return null;
  }
}

/** Only during scripts/prerender.ts (it sets the flag): leaves the result in <head>, which the capture ships. */
export function recordPrerenderedResult(tool: string, params: Record<string, unknown>, result: unknown) {
  if (typeof window === 'undefined' || !(window as { __stabileoPrerender?: boolean }).__stabileoPrerender) return;
  const text = serializePrerenderedResult(params, result);
  if (text === null) return;
  document.head.querySelector(`script[data-prerendered-result="${tool}"]`)?.remove();
  const script = document.createElement('script');
  script.type = 'application/json';
  script.dataset.prerenderedResult = tool;
  script.textContent = text;
  document.head.appendChild(script);
}

/** The engine's result the build computed for these exact parameters, or null. */
export function prerenderedResult<T>(tool: string, params: Record<string, unknown>): T | null {
  const text = typeof document === 'undefined' ? null : document.head.querySelector(`script[data-prerendered-result="${tool}"]`)?.textContent;
  return text ? parsePrerenderedResult<T>(text, params) : null;
}
