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
export const EQUIVALENCE_TEST = 'web/src/lib/results-snapshot/__tests__/examples-equivalence.test.ts';

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
  const equivalence = Object.entries(caseExample).filter(([, example]) => listed.has(example)).map(([file, example]) => ({ file, example }));
  const unsnapshotted = [...listed].filter((id) => !equivalence.some((e) => e.example === id));
  if (unsnapshotted.length) {
    return {
      ok: false, changed,
      report: `FAIL: an examples-scoped entry lists examples no corpus case opens: ${unsnapshotted.join(', ')}. `
        + 'Without a snapshot nothing proves the engine still gives them their old numbers.',
    };
  }
  if (unchangedInputs.length) {
    return {
      ok: false, changed,
      report: `FAIL: an examples-scoped entry lists examples whose fixture (${FIXTURE_DIR}/) did not change: ${unchangedInputs.join(', ')}. `
        + 'Such an entry registers a change of bundled example inputs only; an engine change needs an entry with `when`.',
    };
  }
  if (changed.length === 0) {
    return { ok: true, changed, equivalence, report: `Results snapshot gate: no committed result changed (${snapshots.length} snapshot file(s) touched).` };
  }
  const breaking = fragments.filter((f) => isBreakingResultsFragment(f.text));
  const missing = [];
  if (entries.length === 0) missing.push(`no new entry in ${REGISTRY}`);
  const examplesOnly = entries.length > 0 && exampleEntries.length === entries.length;
  if (examplesOnly) {
    const unexplained = changed.filter((c) => !listed.has(caseExample[c.file]));
    if (unexplained.length) missing.push(`an examples-only entry cannot explain ${unexplained.map((c) => c.file).join(', ')}: not a snapshot of a listed example`);
  }

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
  if (!r.equivalence?.length) return 0;
  return proveEquivalence(r.equivalence, base, at, { solve: (tree, list) => solveIn(tree ?? root, list), baseTree: () => checkoutBase(base, root, git) });
}

/**
 * Both engines must agree on both fixtures: this build's on each listed example as it was at
 * `base`, and the `base` engine on the example as it is now, which an engine change that touches
 * only what the new fixture uses would fail.
 */
export async function proveEquivalence(cases, base, at, { solve, baseTree }) {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const fixtureOf = (example) => `${FIXTURE_DIR}/${example}.json`;
  const missing = cases.filter(({ file, example }) => [base, 'HEAD'].some((rev) => at(rev, file) === null || at(rev, fixtureOf(example)) === null));
  if (missing.length) {
    console.error(`FAIL: an examples-scoped entry lists examples with no snapshot or fixture at ${base} or HEAD: ${missing.map((c) => c.file).join(', ')}. `
      + 'Nothing then proves the engine gives them the same numbers before and after: add the corpus case in its own pull request first.');
    return 1;
  }
  if (at(base, EQUIVALENCE_TEST) === null) {
    console.error(`FAIL: ${base} has no ${EQUIVALENCE_TEST}, so its engine cannot be asked for the examples' numbers: an examples-scoped entry needs a base that has the proof.`);
    return 1;
  }
  const dir = mkdtempSync(join(tmpdir(), 'examples-equivalence-'));
  const listAt = (rev) => {
    const list = cases.map(({ file, example }) => {
      const name = file.slice(SNAPSHOT_DIR.length + 1, -'.json'.length);
      const tag = rev === 'HEAD' ? 'head' : 'base';
      const fixture = join(dir, `${name}.${tag}.fixture.json`);
      const snapshot = join(dir, `${name}.${tag}.snapshot.json`);
      writeFileSync(fixture, at(rev, fixtureOf(example)));
      writeFileSync(snapshot, at(rev, file));
      return { case: name, fixture, snapshot };
    });
    const path = join(dir, `${rev === 'HEAD' ? 'head' : 'base'}.json`);
    writeFileSync(path, JSON.stringify(list));
    return path;
  };
  const names = cases.map(({ file }) => file.slice(SNAPSHOT_DIR.length + 1, -'.json'.length)).join(', ');
  if (await solve(null, listAt(base)) !== 0) {
    console.error('FAIL: an examples-scoped entry suppresses the recheck notice, so this engine must give each example it explains its old numbers from its old inputs, and it does not. '
      + 'This change moves results of saved models too: register it with an entry that has `when`.');
    return 1;
  }
  const tree = await baseTree();
  try {
    if (await solve(tree.dir, listAt('HEAD')) !== 0) {
      console.error(`FAIL: the ${base} engine does not give the committed numbers for the examples as they are now, so the engine changed for what the new inputs use. `
        + 'Saved models using it move too: register this change with an entry that has `when`.');
      return 1;
    }
  } finally {
    tree.dispose();
  }
  console.log(`Examples-only change proven: ${names} give the same numbers with the ${base} engine and this one, from both their ${base} and their new fixtures.`);
  return 0;
}

function solveIn(tree, list) {
  return import('node:child_process').then(({ spawnSync }) => spawnSync('npx', ['vitest', 'run', '--project', 'results', EQUIVALENCE_TEST.slice('web/'.length)],
    { cwd: `${tree}/web`, env: { ...process.env, EXAMPLES_EQUIVALENCE: list }, stdio: 'inherit' }).status);
}

export function headEngineServesBase(changedPaths) {
  return changedPaths.every((path) => (/^(web|docs|changelog\.d)\//.test(path) && !/^web\/src\/lib\/wasm\//.test(path)) || (/^research\//.test(path) && !/\.(rs|toml|lock)$/.test(path)));
}

async function checkoutBase(base, root, git) {
  const { mkdtempSync, symlinkSync, cpSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const dir = join(mkdtempSync(join(tmpdir(), 'examples-base-')), 'tree');
  git('-C', root, 'worktree', 'add', '--detach', dir, base);
  const dispose = () => { try { git('-C', root, 'worktree', 'remove', '--force', dir); } catch { return false; } return true; };
  const unchanged = (...paths) => { try { git('-C', root, 'diff', '--quiet', base, 'HEAD', '--', ...paths); return true; } catch { return false; } };
  const changed = git('-C', root, 'diff', '--name-only', '--no-renames', base, 'HEAD').split('\n').filter(Boolean);
  const run = (cmd, args, cwd) => {
    const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
    if (r.status !== 0) { dispose(); throw new Error(`${cmd} ${args.join(' ')} failed in the ${base} checkout`); }
  };
  if (unchanged('web/package.json', 'web/package-lock.json')) symlinkSync(join(root, 'web/node_modules'), join(dir, 'web/node_modules'));
  else run('npm', ['ci'], join(dir, 'web'));
  if (headEngineServesBase(changed)) cpSync(join(root, 'web/src/lib/wasm'), join(dir, 'web/src/lib/wasm'), { recursive: true });
  else run('bash', ['scripts/wasm-cached.sh'], dir);
  return { dir, dispose };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e); process.exit(2); });
}
