export const FROZEN_DIR = 'web/results-frozen';

export function freezeValues(value, prefix = '', out = {}) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Non-finite frozen output: ${prefix}`);
    out[prefix] = Object.is(value, -0) ? 0 : value;
  } else if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    out[prefix] = value;
  } else if (Array.isArray(value)) {
    out[`${prefix}.length`] = value.length;
    value.forEach((v, i) => freezeValues(v, `${prefix}[${i}]`, out));
  } else if (value && typeof value === 'object') {
    for (const key of Object.keys(value).sort()) {
      if (['timings', 'elapsedMs', 'elapsed', 'solveTimeMs', 'solverRunMeta'].includes(key)) continue;
      freezeValues(value[key], prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

export function compareFrozen(base, head) {
  const changed = Object.keys(base).filter(path => path in head && base[path] !== head[path])
    .map(path => ({ path, before: base[path], after: head[path] }));
  const removed = Object.keys(base).filter(path => !(path in head));
  const added = Object.keys(head).filter(path => !(path in base));
  return { changed, removed, added, differs: !!(changed.length || removed.length || added.length) };
}
