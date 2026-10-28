/**
 * The results snapshot gate (#716): a pull request that changes a committed results snapshot
 * must say so, in the registry of result-affecting changes and in the changelog.
 *
 * The snapshot test (`src/lib/results-snapshot/__tests__/`) fails when the code gives other
 * numbers than the committed snapshots. Regenerating the snapshots makes it pass, so on its own
 * it would only ask for a `make snapshots-update`. This is the other half: comparing the
 * snapshots at the base of the pull request with the ones it brings, under the same tolerance
 * (`compare.mjs`), it fails unless the pull request also
 *
 *   - adds an entry to `web/src/lib/provenance/result-changes.json` (a change id the base does
 *     not have), and
 *   - adds or edits a `changelog.d/` fragment filed under `### BREAKING (results)`.
 *
 * A new case, or a new quantity recorded in a case, is not a result change: only values that
 * moved beyond the tolerance, or that are no longer produced, and snapshots deleted.
 *
 * `decide` is pure, so the negative case (#451) is a unit test: a deliberate change without a
 * registry entry fails (`scripts/__tests__/results-snapshot-gate.test.ts`). `main` is the CLI
 * CI runs: `node scripts/results-snapshot/gate.mjs --base <sha>`.
 */
import { pathToFileURL } from 'node:url';
import { compareValues, formatCaseReport, parseSnapshot } from './compare.mjs';

export const SNAPSHOT_DIR = 'web/results-snapshots';
export const REGISTRY = 'web/src/lib/provenance/result-changes.json';
export const FRAGMENT_DIR = 'changelog.d';
export const BREAKING_RESULTS = '### BREAKING (results)';

/** Whether a changelog fragment's text is filed under BREAKING (results): its first line. */
export function isBreakingResultsFragment(text) {
  const first = text.split('\n').find((l) => l.trim() !== '');
  return first?.trim() === BREAKING_RESULTS;
}

/** The change ids the head registry has and the base registry does not. */
export function newRegistryEntries(baseRegistry, headRegistry) {
  const before = new Set((baseRegistry?.changes ?? []).map((c) => c.id));
  return (headRegistry?.changes ?? []).filter((c) => !before.has(c.id));
}

/**
 * The decision.
 *
 * `snapshots`: every snapshot file the pull request touched, `{ file, base, head }` with each
 * side's parsed JSON or null (added: base null; deleted: head null).
 * `fragments`: the changelog fragments it added or edited, `{ file, text }`.
 */
export function decide({ snapshots, baseRegistry, headRegistry, fragments }) {
  const changed = [];
  for (const s of snapshots) {
    if (s.base === null) continue; // a new case: coverage, not a change
    if (s.head === null) { changed.push({ file: s.file, report: `✗ ${s.file}: snapshot deleted` }); continue; }
    const diff = compareValues(s.base.values ?? {}, s.head.values ?? {});
    if (diff.differs) changed.push({ file: s.file, report: formatCaseReport(s.file, diff) });
  }
  if (changed.length === 0) {
    return { ok: true, changed, report: `Results snapshot gate: no committed result changed (${snapshots.length} snapshot file(s) touched).` };
  }
  const entries = newRegistryEntries(baseRegistry, headRegistry);
  const breaking = fragments.filter((f) => isBreakingResultsFragment(f.text));
  const missing = [];
  if (entries.length === 0) missing.push(`no new entry in ${REGISTRY}`);
  if (breaking.length === 0) missing.push(`no ${FRAGMENT_DIR}/ fragment under "${BREAKING_RESULTS}"`);
  const head = [
    `Results snapshot gate: this pull request changes the committed results of ${changed.length} case(s):`,
    '',
    ...changed.map((c) => c.report),
    '',
  ];
  if (missing.length === 0) {
    return {
      ok: true, changed,
      report: [...head,
        `Registered: ${entries.map((e) => e.id).join(', ')} (results version ${[...new Set(entries.map((e) => e.resultsVersion))].join(', ')});`,
        `changelog: ${breaking.map((f) => f.file).join(', ')}.`].join('\n'),
    };
  }
  return {
    ok: false, changed,
    report: [...head,
      `FAIL: a result change must be registered, and this one is not: ${missing.join('; ')}.`,
      `Add an entry to ${REGISTRY} at currentResultsVersion + 1 (docs/verification/PROVENANCE.md, "Adding a change")`,
      `and a ${FRAGMENT_DIR}/ fragment whose first line is "${BREAKING_RESULTS}", so the engineers whose`,
      'projects these numbers belong to are told on opening them. If the change is not deliberate, it is a regression.'].join('\n'),
  };
}

// ── CLI ──────────────────────────────────────────────────────────

async function main(argv) {
  const { execFileSync } = await import('node:child_process');
  const baseAt = argv.indexOf('--base');
  const base = baseAt >= 0 ? argv[baseAt + 1] : undefined;
  if (!base) { console.error('usage: node web/scripts/results-snapshot/gate.mjs --base <rev>'); return 2; }
  const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  const root = git('rev-parse', '--show-toplevel').trim();
  const at = (rev, path) => {
    try { return git('-C', root, 'show', `${rev}:${path}`); } catch { return null; }
  };
  const json = (text) => (text === null ? null : JSON.parse(text));
  const snapshot = (text) => (text === null ? null : parseSnapshot(text));
  const touched = git('-C', root, 'diff', '--name-status', '--no-renames', base, 'HEAD', '--', SNAPSHOT_DIR, FRAGMENT_DIR)
    .split('\n').filter(Boolean).map((l) => { const [status, file] = l.split('\t'); return { status, file }; });
  const snapshots = touched.filter((t) => t.file.startsWith(`${SNAPSHOT_DIR}/`) && t.file.endsWith('.json'))
    .map((t) => ({ file: t.file, base: snapshot(at(base, t.file)), head: snapshot(at('HEAD', t.file)) }));
  const fragments = touched.filter((t) => t.file.startsWith(`${FRAGMENT_DIR}/`) && t.status !== 'D' && t.file.endsWith('.md'))
    .map((t) => ({ file: t.file, text: at('HEAD', t.file) ?? '' }));
  const r = decide({ snapshots, baseRegistry: json(at(base, REGISTRY)), headRegistry: json(at('HEAD', REGISTRY)), fragments });
  (r.ok ? console.log : console.error)(r.report);
  return r.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e); process.exit(2); });
}
