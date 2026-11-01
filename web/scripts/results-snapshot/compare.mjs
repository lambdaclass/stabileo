/**
 * Results snapshots (#716): flattening, the comparison tolerance, the readable report.
 *
 * Plain JavaScript on purpose: the snapshot test (Vitest, TypeScript) and the CI gate
 * (`results-snapshot-gate.mjs`, plain Node, no transpiler) must compare with the SAME rule. Two
 * copies of a tolerance drift apart, and then the test passes a change the gate calls a result
 * change, or the reverse.
 *
 * A snapshot is a flat map `path → leaf`, one line per value in the committed JSON, so a git
 * diff of a snapshot reads as a list of the numbers that moved.
 *
 * ── The tolerance ──────────────────────────────────────────────
 *
 * Two numbers a and b of the same quantity are the same result when
 *
 *     |a − b| ≤ RTOL · max(|a|, |b|) + ATOL · peak
 *
 * where `peak` is the largest magnitude of that quantity in the case (its path with the
 * indices taken out: every member's `myStart` in one result set is one quantity).
 *
 *   RTOL = 1e-6. An engineering difference is at least a few parts per thousand (a code's
 *   rounding, a 0.1 % change in a load factor); one part per million is a thousand times
 *   tighter than any of them, so every change an engineer could see is caught.
 *
 *   ATOL = 1e-7 of the peak. A quantity that should be zero comes out as round-off (1e-17 m,
 *   1e-13 kN·m), and its relative change between two builds is meaningless. A change of one
 *   ten-millionth of the largest moment in the model is not a result.
 *
 * Against last-bit noise: the WASM engine is bit-for-bit deterministic for one build
 * (docs/verification/PROVENANCE.md, "Determinism"), so the same build reproduces the snapshot
 * exactly. What the tolerance absorbs is a refactor that reorders floating-point operations
 * (a sum in another order, a factorisation with another pivot sequence): its error is about
 * κ·ε, with ε = 2.2e-16 and κ the stiffness's condition number, up to ~1e8 on the slender
 * building models here, so ~1e-8 of the peak, ten times below ATOL and a hundred below RTOL.
 *
 * Values are stored with STORED_DIGITS significant digits (a relative rounding of 5e-11), far
 * below the tolerance, so storing does not move a value across it.
 *
 * Strings and booleans (verdicts, statuses, refusal reasons, which checks ran) compare exactly.
 */

export const FORMAT = 1;
export const RTOL = 1e-6;
export const ATOL = 1e-7;
export const STORED_DIGITS = 10;

/** A quantity's group: its path with every `[…]` index taken out. */
export function groupOf(path) {
  return path.replace(/\[[^\]]*\]/g, '[]');
}

/** A number as it is stored: rounded to STORED_DIGITS, `-0` as 0, non-finite as a string. */
export function storeNumber(v) {
  if (Number.isNaN(v)) return 'NaN';
  if (v === Infinity) return 'Infinity';
  if (v === -Infinity) return '-Infinity';
  if (v === 0) return 0;
  return Number(v.toPrecision(STORED_DIGITS));
}

/** The largest magnitude of each quantity group across the given value maps. */
export function peaks(...maps) {
  const out = new Map();
  for (const m of maps) {
    for (const [path, v] of Object.entries(m)) {
      if (typeof v !== 'number') continue;
      const g = groupOf(path);
      const a = Math.abs(v);
      if (!(out.get(g) >= a)) out.set(g, a);
    }
  }
  return out;
}

/** Whether two leaves are the same result under the tolerance. */
export function sameLeaf(a, b, peak = 0) {
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= RTOL * Math.max(Math.abs(a), Math.abs(b)) + ATOL * peak;
  }
  return a === b;
}

/**
 * Compare a committed snapshot's values with a fresh run's.
 * `changed`: paths in both whose values differ; `removed`: in the reference only; `added`: in
 * the fresh run only. Additions are not result changes (a new case, a new quantity recorded);
 * a change or a removal is.
 */
export function compareValues(reference, current) {
  const peak = peaks(reference, current);
  const changed = [];
  const removed = [];
  const added = [];
  for (const [path, a] of Object.entries(reference)) {
    if (!(path in current)) { removed.push(path); continue; }
    const b = current[path];
    if (!sameLeaf(a, b, peak.get(groupOf(path)) ?? 0)) changed.push({ path, before: a, after: b });
  }
  for (const path of Object.keys(current)) if (!(path in reference)) added.push(path);
  return { changed, removed, added, differs: changed.length > 0 || removed.length > 0 };
}

/**
 * The snapshot to commit after a deliberate run: the fresh values, except that a value within
 * the tolerance of the committed one keeps the committed spelling, so regenerating never
 * churns a file with noise.
 */
export function mergeValues(reference, current) {
  const peak = peaks(reference ?? {}, current);
  const out = {};
  for (const path of Object.keys(current).sort()) {
    const b = current[path];
    const a = reference?.[path];
    out[path] = a !== undefined && sameLeaf(a, b, peak.get(groupOf(path)) ?? 0) ? a : b;
  }
  return out;
}

/**
 * Flatten a result object into `prefix.path → leaf`. Arrays of records with an id are keyed by
 * that id (`elementForces[e12]`), so a reordered list is not a change; other arrays by index.
 * `skip` names keys never recorded (timings, echoed inputs).
 */
export function flatten(value, prefix, out, skip = DEFAULT_SKIP) {
  if (value === null || value === undefined) { out[prefix] = null; return out; }
  if (typeof value === 'number') { out[prefix] = storeNumber(value); return out; }
  if (typeof value === 'string' || typeof value === 'boolean') { out[prefix] = value; return out; }
  if (value instanceof Map) {
    for (const [k, v] of [...value.entries()].sort(([a], [b]) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0))) {
      flatten(v, `${prefix}[${k}]`, out, skip);
    }
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => flatten(v, `${prefix}[${keyOf(v, i)}]`, out, skip));
    return out;
  }
  if (typeof value === 'object') {
    for (const k of Object.keys(value).sort()) {
      if (skip.has(k)) continue;
      const v = value[k];
      if (typeof v === 'function') continue;
      flatten(v, prefix ? `${prefix}.${k}` : k, out, skip);
    }
    return out;
  }
  return out;
}

/**
 * Keys that are not results: timings and the build that ran (`solverRunMeta`); the model data a
 * result echoes back for its diagrams (loads, lengths, end releases); round-off measures (`maxImbalance`, `relativeResidual`:
 * 1e-14 one build, 3e-14 the next — their pass/fail flags are kept); and the id at which an
 * extreme occurs (`minId`, `maxId`), which on a symmetric model is a tie the last bit decides
 * (the extreme's value is kept); a record's id, which is its key.
 */
export const DEFAULT_SKIP = new Set([
  'timings', 'elapsedMs', 'elapsed', 'solveTimeMs', 'solverRunMeta',
  'maxImbalance', 'relativeResidual', 'minId', 'maxId',
  // The worked explanation a check prints (its sentences, with their numbers formatted to
  // the shown decimals): the numbers it formats are recorded as numbers beside it.
  'messages', 'steps',
  // A record's own id: already its key (`keyOf`).
  'nodeId', 'elementId', 'quadId', 'plateId',
  'qI', 'qJ', 'qYI', 'qYJ', 'qZI', 'qZJ', 'length',
  'releaseMyStart', 'releaseMyEnd', 'releaseMzStart', 'releaseMzEnd', 'releaseTStart', 'releaseTEnd',
  'pointLoads', 'pointLoadsY', 'pointLoadsZ', 'distributedLoads', 'distributedLoadsX', 'distributedLoadsY', 'distributedLoadsZ',
]);

function keyOf(v, i) {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    if (typeof v.elementId === 'number') return `e${v.elementId}`;
    if (typeof v.nodeId === 'number') return `n${v.nodeId}`;
    if (typeof v.quadId === 'number') return `q${v.quadId}`;
    if (typeof v.plateId === 'number') return `p${v.plateId}`;
    if (typeof v.id === 'number' || typeof v.id === 'string') return `#${v.id}`;
  }
  return String(i);
}

/** How a leaf prints in a report. */
function show(v) {
  return typeof v === 'string' ? JSON.stringify(v) : String(v);
}

/**
 * The report of one case's differences, for a person: what moved, by how much, and what to do.
 * At most `limit` lines of each kind, with the count of the rest.
 */
export function formatCaseReport(name, diff, limit = 25) {
  const lines = [`✗ ${name}: ${diff.changed.length} value(s) changed, ${diff.removed.length} removed, ${diff.added.length} added`];
  for (const c of diff.changed.slice(0, limit)) {
    let delta = '';
    if (typeof c.before === 'number' && typeof c.after === 'number') {
      const d = c.after - c.before;
      const rel = c.before !== 0 ? ` (${(100 * d / Math.abs(c.before)).toPrecision(3)} %)` : '';
      delta = `   Δ ${d.toPrecision(3)}${rel}`;
    }
    lines.push(`    ${c.path}: ${show(c.before)} → ${show(c.after)}${delta}`);
  }
  if (diff.changed.length > limit) lines.push(`    … and ${diff.changed.length - limit} more changed`);
  for (const p of diff.removed.slice(0, limit)) lines.push(`    ${p}: no longer produced`);
  if (diff.removed.length > limit) lines.push(`    … and ${diff.removed.length - limit} more removed`);
  return lines.join('\n');
}

export const HOW_TO_REGISTER = [
  'A result changed. If the change is deliberate:',
  '  1. regenerate the snapshots:  make snapshots-update   (or: cd web && npm run snapshots:update)',
  '  2. add an entry to web/src/lib/provenance/result-changes.json at currentResultsVersion + 1',
  '     and bump currentResultsVersion (docs/verification/PROVENANCE.md, "Adding a change");',
  '  3. add a changelog.d/ fragment whose first line is "### BREAKING (results)".',
  'If it is not deliberate, it is a regression: fix the code, not the snapshot.',
].join('\n');

// ── The committed file ───────────────────────────────────────────

/**
 * The row a path belongs to and its field in it: `base.elementForces[e3]` and `myStart` for
 * `base.elementForces[e3].myStart`; `design.steel[e3]` and `compression.Fcr` for
 * `design.steel[e3].compression.Fcr`.
 */
function rowOf(path) {
  const m = /^(.*\])\.([A-Za-z0-9_.]+)$/.exec(path);
  return m ? [m[1], m[2]] : null;
}

/**
 * A snapshot as committed: one line per record (a node's displacements, a member's forces), its
 * fields in one object, and one line per other value; keys sorted. A git diff of a snapshot is
 * the list of records that moved, and the file is a third of its flat size.
 */
export function serialiseSnapshot(s) {
  const rows = new Map();
  for (const path of Object.keys(s.values).sort()) {
    const r = rowOf(path);
    const key = r ? r[0] : path;
    if (r) {
      const row = rows.get(key);
      if (row && typeof row === 'object') { row[r[1]] = s.values[path]; continue; }
      if (row === undefined) { rows.set(key, { [r[1]]: s.values[path] }); continue; }
    }
    rows.set(path, s.values[path]);
  }
  const lines = [...rows.keys()].sort().map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(rows.get(k))}`);
  return `{\n  "case": ${JSON.stringify(s.case)},\n  "covers": ${JSON.stringify(s.covers)},\n  "format": ${s.format},\n  "values": {\n${lines.join(',\n')}\n  }\n}\n`;
}

/** The flat snapshot back from its committed text. */
export function parseSnapshot(text) {
  const raw = JSON.parse(text);
  const values = {};
  for (const [k, v] of Object.entries(raw.values ?? {})) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const [f, x] of Object.entries(v)) values[`${k}.${f}`] = x;
    } else values[k] = v;
  }
  return { ...raw, values };
}
