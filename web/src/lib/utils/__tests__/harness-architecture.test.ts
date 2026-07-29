/**
 * The test harness itself is a gate.
 *
 * The suite once reported every assertion passing and still exited 1:
 *
 *     [vitest-worker]: Timeout calling "onTaskUpdate"
 *
 * `onTaskUpdate` is the worker → coordinator RPC. It times out when the COORDINATOR is not
 * scheduled in time to answer, not when a test is slow — and the coordinator is also the
 * Vite transformer every worker depends on. The cause was measured, not guessed: a test
 * that shells out to two real `vite build`s ran inside the general worker pool, where a
 * parallel rollup job does not occupy one worker slot, it occupies the machine.
 *
 * The fix is structural — a bounded parallel pass plus a serial production-build pass, both
 * run by `scripts/test-all.mjs`. This file exists so the structure cannot quietly rot back:
 *
 *   · a new build-spawning test must be declared, not left to land in the general pool;
 *   · the split may not become a way to DROP a test file;
 *   · nobody may "fix" a future timeout by raising it, retrying, or muting worker errors.
 *
 * That last point is the one worth a gate. Every one of those three turns a real signal
 * off, and each is a one-line edit that looks like a fix and reads green.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const CONFIG = readFileSync(resolve(WEB_ROOT, 'vite.config.ts'), 'utf8');
const RUNNER = readFileSync(resolve(WEB_ROOT, 'scripts/test-all.mjs'), 'utf8');
const PKG = JSON.parse(readFileSync(resolve(WEB_ROOT, 'package.json'), 'utf8'));

/** Read a `const NAME = [ ... ]` string array out of the config source. */
function configArray(name: string): string[] {
  const m = CONFIG.match(new RegExp(`const ${name}\\s*=\\s*\\[([^\\]]*)\\]`));
  if (!m) throw new Error(`vite.config.ts no longer declares ${name}`);
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
}

const PRODUCTION_BUILD_TESTS = configArray('PRODUCTION_BUILD_TESTS');
const NOT_VITEST = configArray('NOT_VITEST');

/** Every Vitest file in the tree, as a repo-relative path with forward slashes. */
function allTestFiles(dir = resolve(WEB_ROOT, 'src')): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...allTestFiles(full));
    } else if (/\.(test|spec)\.ts$/.test(entry.name)) {
      out.push(relative(WEB_ROOT, full).split('\\').join('/'));
    }
  }
  return out;
}

/**
 * Markers for "this test starts another process".
 *
 * Deliberately about SPAWNING, not about the word "build": a test that merely imports a
 * builder is cheap, and a test that shells out is not, whatever it is called.
 */
const SPAWN_MARKERS = [
  /from ['"]node:child_process['"]/,
  /require\(['"]child_process['"]\)/,
  /\bexecFileSync\s*\(/,
  /\bspawnSync\s*\(/,
  /\bexecSync\s*\(/,
];

describe('Vitest harness architecture', () => {
  const files = allTestFiles();

  it('every declared production-build test exists', () => {
    expect(PRODUCTION_BUILD_TESTS.length).toBeGreaterThan(0);
    for (const p of PRODUCTION_BUILD_TESTS) {
      expect(existsSync(resolve(WEB_ROOT, p)), `${p} is declared but absent`).toBe(true);
    }
  });

  it('no test spawns a process without being declared a build test', () => {
    const undeclared: string[] = [];
    for (const f of files) {
      if (PRODUCTION_BUILD_TESTS.includes(f)) continue;
      const src = readFileSync(resolve(WEB_ROOT, f), 'utf8');
      if (SPAWN_MARKERS.some((m) => m.test(src))) undeclared.push(f);
    }
    // A spawning test inside the general pool is the exact defect this architecture exists
    // to prevent, so the failure message says what to do about it.
    expect(undeclared, 'add these to PRODUCTION_BUILD_TESTS in vite.config.ts, '
      + 'or stop them spawning processes').toEqual([]);
  });

  it('the unit pass excludes ONLY dependencies, Playwright and the build tests', () => {
    // The split must never become a way to drop a file. The only legitimate exclusions are
    // the two known groups; anything else means a test stopped running and nobody noticed.
    const unitExclude = CONFIG.match(/name: 'unit',[\s\S]*?exclude: \[([\s\S]*?)\]/);
    expect(unitExclude, "the 'unit' project no longer declares an exclude list").not.toBeNull();
    const spread = [...unitExclude![1].matchAll(/\.\.\.(\w+)/g)].map((m) => m[1]).sort();
    expect(spread).toEqual(['NOT_VITEST', 'PRODUCTION_BUILD_TESTS']);
    // and no extra inline literal alongside the two spreads
    expect([...unitExclude![1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])).toEqual([]);
  });

  it('the unit pass runs on threads, which is what fixed the RPC timeout', () => {
    // Measured, not preferred: `forks` failed 2/2 contended runs with
    // `Timeout calling "onTaskUpdate"` while all 216 files passed, and `threads` passed the
    // same load. Reverting this line reinstates the defect, so it is a gate.
    const unit = CONFIG.match(/name: 'unit',([\s\S]*?)\n\s{8}\}/);
    expect(unit).not.toBeNull();
    expect(unit![1]).toMatch(/pool: 'threads'/);
  });

  it('the unit pass does not narrow its include glob', () => {
    // An `include` on the unit project would silently define the suite as a subset.
    const unit = CONFIG.match(/name: 'unit',([\s\S]*?)\n\s{8}\}/);
    expect(unit).not.toBeNull();
    expect(unit![1]).not.toMatch(/\binclude:/);
  });

  it('the build pass runs the build tests, serially, and only them', () => {
    const build = CONFIG.match(/name: 'build',([\s\S]*?)\n\s{8}\}/);
    expect(build).not.toBeNull();
    expect(build![1]).toMatch(/include: PRODUCTION_BUILD_TESTS/);
    expect(build![1]).toMatch(/fileParallelism: false/);
    expect(build![1]).toMatch(/maxWorkers: 1/);
  });

  it('`npm test` runs BOTH passes and propagates either failure', () => {
    expect(PKG.scripts.test).toBe('node scripts/test-all.mjs');
    const projects = [...RUNNER.matchAll(/project: '(\w+)'/g)].map((m) => m[1]);
    expect(projects).toEqual(['unit', 'build']);
    // Both passes run before the verdict, so one broken pass cannot hide the other.
    expect(RUNNER).toMatch(/process\.exit\(1\)/);
    expect(RUNNER).toMatch(/results\.filter\(\(r\) => r\.code !== 0\)/);
  });

  it('the RPC timeout is not raised, and worker errors are not muted', () => {
    // Comment-stripped, because the comments legitimately NAME `onTaskUpdate` and the
    // forbidden thing is configuring it, not explaining it. Checking the raw source would
    // make the documentation of the fix fail the gate that protects the fix.
    const code = CONFIG
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    // Each of these is a one-line edit that turns a real signal off and reads green.
    for (const forbidden of [
      /teardownTimeout/, /dangerouslyIgnoreUnhandledErrors/, /retry\s*:/, /bail\s*:/,
      /VITEST_WORKER_TIMEOUT/, /onTaskUpdate/,
    ]) {
      expect(code, `vite.config.ts must not configure ${forbidden}`)
        .not.toMatch(forbidden);
    }
    expect(RUNNER).not.toMatch(/--retry/);
    // The runner must not re-run a failed pass to obtain exit code zero.
    expect(RUNNER).not.toMatch(/for \(let attempt/);
  });

  it('the two passes together still account for every test file', () => {
    // 4 421 assertions ran before this architecture existed and 4 421 must run after it.
    // The arithmetic that proves it: nothing is excluded except the declared build tests,
    // and those are exactly what the build pass includes.
    const inBuildPass = files.filter((f) => PRODUCTION_BUILD_TESTS.includes(f));
    const inUnitPass = files.filter((f) => !PRODUCTION_BUILD_TESTS.includes(f));
    expect(inBuildPass.sort()).toEqual([...PRODUCTION_BUILD_TESTS].sort());
    expect(inUnitPass.length + inBuildPass.length).toBe(files.length);
    expect(inUnitPass.length).toBeGreaterThan(200);
  });

  it('Playwright specs stay out of Vitest', () => {
    expect(NOT_VITEST).toContain('e2e/**');
  });

  it('no entry point runs the suite as one pool, bypassing the split', () => {
    // `npx vitest run` with no `--project` runs BOTH projects in ONE run, sharing one
    // pool — which puts the production build back alongside the general tests and
    // reinstates the defect through a side door. The Makefile did exactly that.
    //
    // Checked across the files that actually invoke the suite, so a green `npm test` does
    // not hide a red `make test-web`.
    const REPO = resolve(WEB_ROOT, '..');
    const entryPoints = ['Makefile', '.github/workflows/ci.yml', 'README.md'];
    for (const rel of entryPoints) {
      const p = resolve(REPO, rel);
      if (!existsSync(p)) continue;
      const src = readFileSync(p, 'utf8');
      const bad = src.split('\n').filter((line) =>
        /\bvitest\b/.test(line)
        && /\brun\b/.test(line)
        && !/--project/.test(line));
      expect(bad, `${rel} runs Vitest as a single pool; use \`npm test\``).toEqual([]);
    }
  });
});
