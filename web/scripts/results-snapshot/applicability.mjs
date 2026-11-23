export function conditionGroups(w) {
  return [...(w.any?.length ? [w.any] : []), ...(w.all ?? []).map((f) => [f]), ...(w.allOf ?? [])];
}

export function conditionHolds(w, features) {
  return conditionGroups(w).every((g) => g.some((f) => features.has(f)));
}

const resultFamily = (path) => path.split(/\.|\[/)[0];

function resultAnalysis(path) {
  const family = resultFamily(path);
  return /^(pdelta|modal|spectral|buckling|nonlinear|ssi)$/.test(family) ? family : 'linear';
}

export function conditionAllowsResult(w, path) {
  const feature = `analysis:${resultAnalysis(path)}`;
  return conditionGroups(w).every(g => g.some(f => !f.startsWith('analysis:') || f === feature));
}

export function fieldCovered(entry, path, features) {
  if (!Array.isArray(features) || !entry.when || typeof entry.when !== 'object' || Array.isArray(entry.when) || !Array.isArray(entry.quantities)) return false;
  const family = resultFamily(path);
  const loadResult = ['generatedLoads', 'snowDerivation', 'snowResult'].includes(family);
  const analysis = loadResult ? null : resultAnalysis(path);
  if (loadResult && (entry.area !== 'loads' || !features.includes('generatedLoads'))) return false;
  if (!loadResult && family !== 'design' && !conditionAllowsResult(entry.when, path)) return false;
  if (!loadResult && family !== 'design' && !features.includes(`analysis:${analysis}`)) return false;
  const fieldFeatures = new Set(features.filter((f) => !f.startsWith('analysis:')));
  if (!loadResult && family !== 'design') fieldFeatures.add(`analysis:${analysis}`);
  if (!conditionHolds(entry.when, fieldFeatures)) return false;
  if (family === 'model') return false;
  if (family === 'design' ? entry.area !== 'design' : entry.area === 'design') return false;
  const quantities = entry.quantities;
  if (path === 'solve.ok' || path === 'solve.refusal') return quantities.includes('solve.ok');
  if (quantities.includes('*')) return true;
  const rest = path.replace(/^(base|(?:case|combo)\[[^\]]+\]|envelope\.maxAbs|(?:pdelta|nonlinear|ssi)\.results|spectral\.[XYZ]|modal|buckling|pdelta|nonlinear|ssi|gallery|design)\./, '');
  const collection = /^[A-Za-z][A-Za-z0-9]*/.exec(rest)?.[0];
  const field = /\]\.([A-Za-z][A-Za-z0-9]*)$/.exec(rest)?.[1];
  return quantities.includes(rest) || (!!collection && (quantities.includes(collection) || (!!field && quantities.includes(`${collection}.${field}`))));
}

/**
 * A comparison of one example's numbers with only what no registered engine entry explains: a
 * moved, removed or added path drops out when an entry with `when` holds for the model it was
 * solved from (`features`) and declares that path. Examples-scoped entries explain nothing here.
 */
export function unexplainedDiff(diff, excuse) {
  const entries = (excuse?.entries ?? []).filter((e) => e.scope !== 'examples');
  const features = excuse?.features ?? [];
  const explained = (path) => entries.find((e) => fieldCovered(e, path, features));
  const by = new Set();
  const keep = (path) => { const e = explained(path); if (e) by.add(e.id); return !e; };
  const changed = diff.changed.filter((c) => keep(c.path));
  const removed = diff.removed.filter(keep);
  const added = diff.added.filter(keep);
  return { changed, removed, added, differs: changed.length > 0 || removed.length > 0 || added.length > 0, explainedBy: [...by] };
}
