export function conditionGroups(w) {
  return [...(w.any?.length ? [w.any] : []), ...(w.all ?? []).map((f) => [f]), ...(w.allOf ?? [])];
}

export function conditionHolds(w, features) {
  return conditionGroups(w).every((g) => g.some((f) => features.has(f)));
}

export function fieldCovered(entry, path, features) {
  if (!Array.isArray(features) || !entry.when || typeof entry.when !== 'object' || Array.isArray(entry.when) || !Array.isArray(entry.quantities)) return false;
  const family = path.split('.')[0];
  const analysis = /^(pdelta|modal|spectral|buckling|nonlinear)$/.test(family) ? family : 'linear';
  if (family !== 'design' && !features.includes(`analysis:${analysis}`)) return false;
  const fieldFeatures = new Set(features.filter((f) => !f.startsWith('analysis:')));
  if (family !== 'design') fieldFeatures.add(`analysis:${analysis}`);
  if (!conditionHolds(entry.when, fieldFeatures)) return false;
  if (family === 'model') return false;
  if (family === 'design' ? entry.area !== 'design' : entry.area === 'design') return false;
  const quantities = entry.quantities;
  if (path === 'solve.ok' || path === 'solve.refusal') return quantities.includes('solve.ok');
  if (quantities.includes('*')) return true;
  const rest = path.replace(/^(base|(?:case|combo)\[[^\]]+\]|envelope\.maxAbs|pdelta\.results|nonlinear\.results|spectral\.[XYZ]|modal|buckling|pdelta|design)\./, '');
  const collection = /^[A-Za-z][A-Za-z0-9]*/.exec(rest)?.[0];
  const field = /\]\.([A-Za-z][A-Za-z0-9]*)$/.exec(rest)?.[1];
  return quantities.includes(rest) || (!!collection && (quantities.includes(collection) || (!!field && quantities.includes(`${collection}.${field}`))));
}
