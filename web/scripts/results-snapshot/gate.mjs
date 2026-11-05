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
 * A new snapshot file (a new corpus case) is coverage, not a result change. In an existing one,
 * every value that moved beyond the tolerance, is no longer produced or is newly produced is a
 * change, and so is a deleted snapshot (`coverage.test.ts` makes removing a case delete its
 * snapshot). Only a bump of the snapshot format (`compare.mjs` FORMAT, the harness recording more)
 * lets values be added without registration, and only the paths that format declares it began
 * recording (FORMAT_ADDITIONS).
 *
 * `decide` is pure, so the negative case (#451) is a unit test: a deliberate change without a
 * registry entry fails (`scripts/__tests__/results-snapshot-gate.test.ts`). `main` is the CLI
 * CI runs: `node scripts/results-snapshot/gate.mjs --base <sha>`.
 */
import { pathToFileURL } from 'node:url';
import { compareValues, formatCaseReport, parseSnapshot, FORMAT, FORMAT_ADDITIONS } from './compare.mjs';

export const SNAPSHOT_DIR = 'web/results-snapshots';
export const REGISTRY = 'web/src/lib/provenance/result-changes.json';
export const FRAGMENT_DIR = 'changelog.d';
export const FIXTURE_DIR = 'web/src/lib/templates/fixtures';
export const CORPUS = 'web/src/lib/results-snapshot/corpus.ts';

/** A fixture's model inputs: its JSON without the names and descriptions it shows, keys sorted. */
export function modelInputs(fixtureText) {
  const strip = (v) => Array.isArray(v) ? v.map(strip)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().filter((k) => k !== 'name' && k !== 'description').map((k) => [k, strip(v[k])]))
    : v;
  return fixtureText === null ? null : JSON.stringify(strip(JSON.parse(fixtureText)));
}

/** Each corpus case opened from a bundled example: its snapshot file, and the example's id. */
export function corpusExamples(corpusText) {
  const out = {};
  for (const m of (corpusText ?? '').matchAll(/name: '([^']+)', source: ex\('([^']+)'\)/g)) out[`${SNAPSHOT_DIR}/${m[1]}.json`] = m[2];
  return out;
}
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
/**
 * Whether an added path is what a snapshot format bump began recording (`compare.mjs` FORMAT and
 * FORMAT_ADDITIONS): the head must be at the harness's current format, every format it skips must
 * be declared, and the path must be one of theirs. Anything else added is a result change.
 */
export function newlyRecorded(path, baseFormat, headFormat, format = FORMAT, formatAdditions = FORMAT_ADDITIONS) {
  if (headFormat !== format || !(headFormat > baseFormat)) return false;
  for (let v = baseFormat + 1; v <= headFormat; v++) if (formatAdditions[v]?.test(path)) return true;
  return false;
}

export function decide({ snapshots, baseRegistry, headRegistry, fragments, format = FORMAT, formatAdditions = FORMAT_ADDITIONS, changedFixtures = [], caseExample = {} }) {
  const changed = [];
  const entries = newRegistryEntries(baseRegistry, headRegistry);
  const releasedVersion = baseRegistry?.currentResultsVersion ?? 0;
  const invalid = entries.filter((entry) => entry.resultsVersion <= releasedVersion);
  const lost = (baseRegistry?.changes ?? []).filter((entry) =>
    !(headRegistry?.changes ?? []).some((candidate) => candidate.id === entry.id && candidate.resultsVersion === entry.resultsVersion));
  if (invalid.length || lost.length || (headRegistry?.currentResultsVersion ?? 0) < releasedVersion) {
    return {
      ok: false, changed,
      report: `FAIL: results versions through ${releasedVersion} are already released. `
        + `New entries must use a later version; preserve released entries and their versions. `
        + `Colliding entries: ${invalid.map((entry) => entry.id).join(', ') || 'none'}. `
        + `Missing or renumbered entries: ${lost.map((entry) => entry.id).join(', ') || 'none'}.`,
    };
  }
  for (const s of snapshots) {
    if (s.base === null) continue; // a new case: coverage, not a change
    if (s.head === null) { changed.push({ file: s.file, report: `✗ ${s.file}: snapshot deleted` }); continue; }
    const diff = compareValues(s.base.values ?? {}, s.head.values ?? {});
    const added = diff.added.filter((path) => !newlyRecorded(path, s.base.format ?? 1, s.head.format ?? 1, format, formatAdditions));
    const counted = { ...diff, added };
    if (counted.changed.length || counted.removed.length || counted.added.length) {
      changed.push({ file: s.file, report: formatCaseReport(s.file, counted) });
    }
  }
  const exampleEntries = entries.filter((e) => e.scope === 'examples');
  const listed = new Set(exampleEntries.flatMap((e) => e.examples ?? []));
  const unchangedInputs = [...listed].filter((id) => !changedFixtures.includes(id));
  if (unchangedInputs.length) {
    return {
      ok: false, changed,
      report: `FAIL: an examples-scoped entry lists examples whose fixture (${FIXTURE_DIR}/) did not change: ${unchangedInputs.join(', ')}. `
        + 'Such an entry registers a change of bundled example inputs only; an engine change needs an entry with `when`.',
    };
  }
  if (changed.length === 0) {
    return { ok: true, changed, report: `Results snapshot gate: no committed result changed (${snapshots.length} snapshot file(s) touched).` };
  }
  const breaking = fragments.filter((f) => isBreakingResultsFragment(f.text));
  const missing = [];
  if (entries.length === 0) missing.push(`no new entry in ${REGISTRY}`);
  const examplesOnly = entries.length > 0 && exampleEntries.length === entries.length;
  if (examplesOnly) {
    const unexplained = changed.filter((c) => !listed.has(caseExample[c.file]));
    if (unexplained.length) missing.push(`an examples-only entry cannot explain ${unexplained.map((c) => c.file).join(', ')}: not a snapshot of a listed example`);
  }
  const equivalence = examplesOnly ? changed.filter((c) => snapshots.find((s) => s.file === c.file)?.base).map((c) => ({ file: c.file, example: caseExample[c.file] })) : [];
  if (breaking.length === 0) missing.push(`no ${FRAGMENT_DIR}/ fragment under "${BREAKING_RESULTS}"`);
  const head = [
    `Results snapshot gate: this pull request changes the committed results of ${changed.length} case(s):`,
    '',
    ...changed.map((c) => c.report),
    '',
  ];
  if (missing.length === 0) {
    return {
      ok: true, changed, equivalence,
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
  const changedFixtures = git('-C', root, 'diff', '--name-only', '--no-renames', base, 'HEAD', '--', FIXTURE_DIR)
    .split('\n').filter((f) => f.endsWith('.json')).filter((f) => modelInputs(at(base, f)) !== modelInputs(at('HEAD', f)))
    .map((f) => f.slice(FIXTURE_DIR.length + 1, -'.json'.length));
  const r = decide({ snapshots, baseRegistry: json(at(base, REGISTRY)), headRegistry: json(at('HEAD', REGISTRY)), fragments, changedFixtures, caseExample: corpusExamples(at('HEAD', CORPUS)) });
  (r.ok ? console.log : console.error)(r.report);
  if (!r.ok) return 1;
  return r.equivalence?.length ? proveEquivalence(r.equivalence, base, at, root) : 0;
}

/**
 * Solve each case an examples-only entry explains from the fixture it had at `base`, with this
 * build's engine (`make wasm` first), and require the numbers its snapshot had at `base`.
 */
async function proveEquivalence(cases, base, at, root) {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(), 'examples-equivalence-'));
  const list = cases.map(({ file, example }) => {
    const name = file.slice(SNAPSHOT_DIR.length + 1, -'.json'.length);
    const fixture = join(dir, `${name}.fixture.json`);
    const snapshot = join(dir, `${name}.snapshot.json`);
    writeFileSync(fixture, at(base, `${FIXTURE_DIR}/${example}.json`));
    writeFileSync(snapshot, at(base, file));
    return { case: name, fixture, snapshot };
  });
  writeFileSync(join(dir, 'list.json'), JSON.stringify(list));
  const run = spawnSync('npx', ['vitest', 'run', '--project', 'results', 'src/lib/results-snapshot/__tests__/examples-equivalence.test.ts'],
    { cwd: join(root, 'web'), env: { ...process.env, EXAMPLES_EQUIVALENCE: join(dir, 'list.json') }, stdio: 'inherit' });
  if (run.status === 0) {
    console.log(`Examples-only change proven: ${list.map((c) => c.case).join(', ')} give their ${base} numbers from their ${base} fixtures.`);
    return 0;
  }
  console.error('FAIL: an examples-scoped entry suppresses the recheck notice, so the engine must give each example it explains its old numbers from its old inputs, and it does not. '
    + 'This change moves results of saved models too: register it with an entry that has `when`.');
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e); process.exit(2); });
}
