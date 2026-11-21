import { execFileSync, spawnSync } from 'node:child_process';
import { featuresForMode } from '../config/public-features.mjs';

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
        tests.set(id, { path, active: entry.expectedStatus !== 'skipped', tagged: spec.tags?.includes('@switch-on') });
      }
    }
    for (const child of suite.suites ?? []) collect(child, path, [...parents, suite.title]);
  }
  for (const suite of report.suites) collect(suite);
  return tests;
}

const list = process.argv.includes('--list');
let files = process.argv.slice(2).filter(arg => arg !== '--list');
const production = featuresForMode('production');
const enabled = featuresForMode('test');
if (!files.length && Object.keys(production).some(key => production[key] !== enabled[key])) {
  const off = inventory('production');
  files = [...new Set([...inventory('test')].flatMap(([id, entry]) =>
    entry.active && (!off.get(id)?.active || entry.tagged) ? [`e2e/${entry.path}`] : [],
  ))].sort();
}

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
