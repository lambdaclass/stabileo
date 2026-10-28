/**
 * Finding a raw i18n key in what the reader is shown (#719).
 *
 * A key reaches the screen when `t()` is asked for it before its dictionary is registered (the
 * desktop app's project name and window title read `tabBar.newStructure`, 2026-10-27), or when
 * the key does not exist: `t()` then returns the key itself. The e2e check
 * (`e2e/no-raw-i18n-keys.spec.ts`) reads every visible text, title, tooltip and label of the main
 * screens and asks this module which of their words are keys.
 *
 * Two kinds of hit, both from the dictionaries' own key list so that ordinary text does not
 * match (a file name, a URL, "e.g.", a decimal):
 *
 *   - `key`: the word IS a key of the dictionaries (`tabBar.newStructure`);
 *   - `namespace`: the word has a key's shape under one of the dictionaries' namespaces and is
 *     not a key (`tabBar.newStructur`): a key that was never added, which `t()` shows as is.
 *
 * Plain TypeScript with no import from the store, so Playwright can load it in Node.
 */

export interface RawKeyIndex {
  keys: ReadonlySet<string>;
  /** The first segment of every key (`tabBar`, `pro`, `design`, …). */
  namespaces: ReadonlySet<string>;
}

export interface RawKeyHit {
  text: string;
  kind: 'key' | 'namespace';
}

/** The index of every key of the given dictionaries. */
export function rawKeyIndex(dictionaries: ReadonlyArray<Record<string, string>>): RawKeyIndex {
  const keys = new Set<string>();
  for (const d of dictionaries) for (const k of Object.keys(d)) keys.add(k);
  const namespaces = new Set<string>();
  for (const k of keys) {
    const dot = k.indexOf('.');
    if (dot > 0) namespaces.add(k.slice(0, dot));
  }
  return { keys, namespaces };
}

/**
 * A key's shape: a lowercase-led identifier, then one or more `.segment`s of identifier
 * characters, standing alone (not inside a longer dotted run, a path or a number).
 */
const KEY_SHAPE = /(?<![\w./:@-])[a-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+(?![\w/@-]|\.[A-Za-z0-9_])/g;
/**
 * A segment that reads as a key's rather than as a file extension or an abbreviation: an
 * identifier of three or more characters with a letter (`newStructure`, `calc`, `c301`).
 */
const KEY_SEGMENT = /^[A-Za-z][A-Za-z0-9_]{2,}$/;

/** A file name is not a key, even when its stem is a namespace (`design.ded`). */
const FILE_EXTENSION = /\.(ded|json|dxf|dwg|ifc|pdf|csv|xlsx|xls|png|jpe?g|svg|html?|md|txt|zip|js|ts|wasm)$/i;

/** Every raw key in `text`, each once. */
export function findRawKeys(text: string, index: RawKeyIndex): RawKeyHit[] {
  const out = new Map<string, RawKeyHit>();
  for (const m of text.matchAll(KEY_SHAPE)) {
    const word = m[0];
    if (index.keys.has(word)) { out.set(word, { text: word, kind: 'key' }); continue; }
    const [ns, ...rest] = word.split('.');
    if (index.namespaces.has(ns) && !FILE_EXTENSION.test(word) && rest.every((s) => KEY_SEGMENT.test(s))) {
      out.set(word, { text: word, kind: 'namespace' });
    }
  }
  return [...out.values()];
}
