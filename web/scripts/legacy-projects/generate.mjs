#!/usr/bin/env node
/**
 * Regenerate the legacy-projects corpus (#718): every bundled example saved as a `.ded` by each
 * released version, with the results that version showed.
 *
 *   node web/scripts/legacy-projects/generate.mjs                 # every release tag (vX.Y.Z)
 *   node web/scripts/legacy-projects/generate.mjs v0.3.0 v0.4.0   # some of them
 *   LEGACY_WORK=/some/dir ...   where the release checkouts live (kept between runs; default: a
 *                               directory under the OS temp dir)
 *
 * For each tag it:
 *   1. checks the tag out in its own git worktree (reused when already there);
 *   2. builds what the save and solve paths need, with THAT tag's toolchain: `nix develop` on the
 *      tag's own flake (its rust-toolchain.toml when it has one), then `npm ci` and the tag's own
 *      `npm run wasm`. Skipped when node_modules and the WASM glue are already there;
 *   3. copies `in-version.capture.ts` (+ `capture-results.ts`, `compare.mjs`) into the tag's
 *      `src/lib/__legacy_capture__/` and runs it with the tag's Vitest: every example is opened by
 *      that version's `loadExample`, solved by its solve entry point, and saved by its
 *      `serializeProject`; a session of three tabs by its `sessionPayload`;
 *   4. writes `web/legacy-projects/<tag>/`: the files exactly as written (gzipped when large, so
 *      the corpus stays small; the bytes inside are untouched), the results in the snapshot
 *      gate's committed format, and `manifest.json`.
 *
 * Heavy: run it when a release is tagged, not in CI. Throttled (CARGO_BUILD_JOBS=4, nice).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { FORMAT, serialiseSnapshot } from '../results-snapshot/compare.mjs';
import { SESSION_TABS, SOLVE_LIMIT, GZIP_ABOVE, workspaceOf } from './plan.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, '../..');
const repo = resolve(web, '..');
const corpus = join(web, 'legacy-projects');
const work = process.env.LEGACY_WORK ?? join(tmpdir(), 'stabileo-legacy-projects');

const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const hasNix = spawnSync('nix', ['--version']).status === 0;

function releaseTags() {
  return git('tag', '--list', 'v*').split('\n').filter((t) => /^v\d+\.\d+\.\d+$/.test(t))
    .sort((a, b) => a.slice(1).split('.').map(Number).reduce((d, x, i) => d || x - b.slice(1).split('.').map(Number)[i], 0));
}

/** Run a shell command in `cwd` inside that checkout's own nix dev shell (its pinned toolchain). */
function inShell(cwd, command, env = {}) {
  const full = hasNix && existsSync(join(cwd, 'flake.nix'))
    ? ['nice', ['nix', 'develop', '--command', 'bash', '-c', command]]
    : ['nice', ['bash', '-c', command]];
  const r = spawnSync(full[0], full[1], {
    cwd, stdio: 'inherit',
    env: { ...process.env, CARGO_BUILD_JOBS: '4', NODE_OPTIONS: '--max-old-space-size=6144', ...env },
  });
  if (r.status !== 0) throw new Error(`${cwd}: \`${command}\` exited ${r.status}`);
}

function checkout(tag) {
  const dir = join(work, tag);
  if (!existsSync(join(dir, '.git'))) {
    mkdirSync(work, { recursive: true });
    git('worktree', 'add', '--detach', dir, tag);
  }
  const wasm = join(dir, 'web/src/lib/wasm');
  const built = existsSync(join(dir, 'web/node_modules/.bin/vitest'))
    && existsSync(wasm) && readdirSync(wasm).some((f) => f.endsWith('.wasm'));
  if (!built) inShell(dir, 'cd web && npm ci --no-audit --no-fund --loglevel=error && npm run wasm');
  return dir;
}

/** Example ids in the tag's `fixture-index.ts`, 2D and 3D, in the order they are listed. */
function examplesOf(tag) {
  const src = git('show', `${tag}:web/src/lib/templates/fixture-index.ts`);
  const block = (name) => {
    const start = src.indexOf(`const ${name}`);
    const end = src.indexOf('\n};', start);
    return [...src.slice(start, end).matchAll(/^\s+'([a-z0-9-]+)':\s*\(\)\s*=>/gm)].map((m) => m[1]);
  };
  return { twoD: block('fixtures2D'), threeD: block('fixtures3D') };
}

function fixtureSize(tag, id) {
  const j = JSON.parse(git('show', `${tag}:web/src/lib/templates/fixtures/${id}.json`));
  const n = (k) => (Array.isArray(j[k]) ? j[k].length : 0);
  return n('elements') + n('quads') + n('plates');
}

/** Write a file as the version wrote it, gzipped when large (the bytes inside are untouched); its committed name. */
function put(dest, name, bytes) {
  const big = bytes.length > GZIP_ABOVE;
  const fileName = big ? `${name}.gz` : name;
  writeFileSync(join(dest, fileName), big ? gzipSync(bytes, { level: 9 }) : bytes);
  return fileName;
}

function generate(tag) {
  const dir = checkout(tag);
  const { twoD, threeD } = examplesOf(tag);
  const examples = [...twoD, ...threeD].map((id) => {
    const size = fixtureSize(tag, id);
    return { id, workspace: workspaceOf(id, twoD.includes(id)), solve: size <= SOLVE_LIMIT, size };
  });
  const raw = join(work, `${tag}-out`);
  rmSync(raw, { recursive: true, force: true });
  const plan = { out: raw, examples, session: SESSION_TABS.filter((s) => examples.some((e) => e.id === s.id)) };
  const planFile = join(work, `${tag}-plan.json`);
  writeFileSync(planFile, JSON.stringify(plan));

  const cap = join(dir, 'web/src/lib/__legacy_capture__');
  rmSync(cap, { recursive: true, force: true });
  mkdirSync(cap, { recursive: true });
  copyFileSync(join(here, 'in-version.capture.ts'), join(cap, 'generate.test.ts'));
  copyFileSync(join(web, 'scripts/results-snapshot/compare.mjs'), join(cap, 'compare.mjs'));
  writeFileSync(join(cap, 'capture-results.ts'), readFileSync(join(web, 'src/lib/legacy-projects/capture-results.ts'), 'utf8')
    .replace('../../../scripts/results-snapshot/compare.mjs', './compare.mjs'));
  try {
    inShell(join(dir, 'web'), 'npx vitest run --project unit src/lib/__legacy_capture__/generate.test.ts', { LEGACY_PLAN: planFile });
  } finally {
    rmSync(cap, { recursive: true, force: true });
  }

  const dest = join(corpus, tag);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const run = JSON.parse(readFileSync(join(raw, 'run.json'), 'utf8'));
  const registry = (() => {
    try { return JSON.parse(git('show', `${tag}:web/src/lib/provenance/result-changes.json`)).currentResultsVersion; } catch { return 0; }
  })();
  const entries = [];
  for (const ex of examples) {
    const text = readFileSync(join(raw, `${ex.id}.ded`));
    const fileName = put(dest, `${ex.id}.ded`, text);
    const parsed = JSON.parse(text.toString('utf8'));
    const values = JSON.parse(readFileSync(join(raw, `${ex.id}.results.json`), 'utf8'));
    let results = null;
    if (ex.solve) {
      results = put(dest, `${ex.id}.results.json`,
        Buffer.from(serialiseSnapshot({ case: `${tag}/${ex.id}`, covers: `${ex.id} as ${tag} solved it (${ex.workspace})`, format: FORMAT, values })));
    }
    entries.push({
      example: ex.id,
      file: fileName,
      fileFormatVersion: parsed.version,
      workspace: ex.workspace,
      analysisMode: parsed.analysisMode ?? null,
      model: { nodes: values['model.nodes'], elements: values['model.elements'], shells: values['model.shells'] },
      results,
      ...(results ? {} : { notSolved: `larger than ${SOLVE_LIMIT} members and shells: opened and migrated only` }),
      solvedWithResultsVersion: parsed.snapshot?.solvedWith?.resultsVersion ?? null,
      fixtureBlob: git('rev-parse', `${tag}:web/src/lib/templates/fixtures/${ex.id}.json`),
    });
  }
  let session = null;
  if (existsSync(join(raw, 'session.ded'))) {
    const bytes = readFileSync(join(raw, 'session.ded'));
    session = { file: put(dest, 'session.ded', bytes), envelopeVersion: JSON.parse(bytes.toString('utf8')).version, tabs: plan.session };
  } else {
    session = { file: null, unavailable: `this version's session writer fails: ${readFileSync(join(raw, 'session.unavailable.txt'), 'utf8')}` };
  }
  const manifest = {
    $comment: 'Generated by web/scripts/legacy-projects/generate.mjs (#718). Do not edit: regenerate.',
    version: tag.slice(1),
    tag,
    commit: git('rev-parse', `${tag}^{commit}`),
    resultsVersion: registry,
    solveEntry: run.solveEntry,
    resultsFormat: FORMAT,
    session,
    examples: entries,
  };
  writeFileSync(join(dest, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${tag}: ${entries.length} examples (${entries.filter((e) => e.results).length} solved), session: ${session.file ? `${plan.session.length} tabs` : 'unavailable'} → ${dest}`);
}

const wanted = process.argv.slice(2);
for (const tag of wanted.length ? wanted : releaseTags()) generate(tag);
