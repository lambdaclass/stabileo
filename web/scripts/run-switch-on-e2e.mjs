import { execFileSync, spawnSync } from 'node:child_process';
import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { featuresForMode } from '../config/public-features.mjs';

const switchOnTag = '@switch-on';
const reportedTag = switchOnTag.slice(1);
const e2eDir = fileURLToPath(new URL('../e2e/', import.meta.url));
const cli = new URL('../node_modules/@playwright/test/cli.js', import.meta.url);
const run = (args, env = process.env) => execFileSync(process.execPath, [cli.pathname, 'test', ...args], {
  encoding: 'utf8', env, maxBuffer: 32 * 1024 * 1024,
});

function inventory(profile) {
  const report = JSON.parse(run(['--list', '--reporter=json'], {
    ...process.env, E2E_PREBUILT: '0', STABILEO_E2E_PROFILE: profile,
  }));
  const tests = new Map();
  function collect(suite, file, parents = []) {
    const path = file ?? suite.file;
    for (const spec of suite.specs ?? []) {
      const title = [...parents, suite.title, spec.title];
      for (const entry of spec.tests) {
        const id = JSON.stringify([path, title, entry.projectName]);
        tests.set(id, { path, active: entry.expectedStatus !== 'skipped', tagged: spec.tags?.includes(reportedTag) });
      }
    }
    for (const child of suite.suites ?? []) collect(child, path, [...parents, suite.title]);
  }
  for (const suite of report.suites) collect(suite);
  return tests;
}

function declaredSwitchOnSpecs() {
  function hasTag(node) {
    if (ts.isStringLiteralLike(node) && node.text.match(/@\S+/g)?.includes(switchOnTag)) return true;
    return ts.forEachChild(node, hasTag);
  }

  return globSync('**/*.{spec,test}.?(c|m)[jt]s?(x)', { cwd: e2eDir }).filter(path => {
    const source = ts.createSourceFile(path, readFileSync(join(e2eDir, path), 'utf8'), ts.ScriptTarget.Latest);
    return hasTag(source);
  });
}

function selectSwitchOnFiles() {
  const production = featuresForMode('production');
  const enabled = featuresForMode('test');
  const profilesDiffer = Object.keys(production).some(key => production[key] !== enabled[key]);
  const off = profilesDiffer ? inventory('production') : undefined;
  const declared = new Set(declaredSwitchOnSpecs());
  const activeTagged = new Set();
  const selected = new Set();
  for (const [id, { path, active, tagged }] of inventory('test')) {
    if (tagged) declared.add(path);
    if (!active) continue;
    if (tagged) activeTagged.add(path);
    if (tagged || (off && !off.get(id)?.active)) selected.add(path);
  }
  const missing = [...declared].filter(path => !activeTagged.has(path)).sort();
  if (missing.length) {
    throw new Error(`No active ${switchOnTag} cases were collected from: ${missing.map(path => `e2e/${path}`).join(', ')}`);
  }
  return [...selected].sort().map(path => `e2e/${path}`);
}

const list = process.argv.includes('--list');
const requested = process.argv.slice(2).filter(arg => arg !== '--list');
const files = requested.length ? requested : selectSwitchOnFiles();

if (files.length) console.log(`Switch-on E2E specs: ${files.join(', ')}`);
else console.log('No additional E2E tests are selected by the test profile.');

if (files.length && !list) {
  const normal = ['--grep-invert', '@flaky'];
  const quarantine = ['--grep', '@flaky', '--retries=2', '--pass-with-no-tests', '--output', 'e2e/.results/switch-on-flaky/traces'];
  for (const [filter, env] of [[normal, process.env], [quarantine, {
    ...process.env,
    PLAYWRIGHT_HTML_OUTPUT_DIR: 'e2e/.results/switch-on-flaky/report',
    E2E_JSON_REPORT: 'e2e/.results/switch-on-flaky/results.json',
  }]]) {
    const result = spawnSync(process.execPath, [cli.pathname, 'test', ...files, ...filter], { env, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exitCode = result.status ?? 1;
  }
}
