import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
// ci-ok is followed by compatibility jobs (rust/npm); never execute their YAML.
const gate = workflow.split('\n  ci-ok:')[1].split(/\n  [\w-]+:/)[0];
const needs = gate.split('    needs:\n')[1].split('    steps:')[0].match(/(?<=      - )\S+/g)!;
const script = gate.match(/^        run: \|\n((?:          .*\n|\n)+)/m)![1]
  .split('\n').map((line) => line.replace(/^          /, '')).join('\n');

function runAggregate(results: Record<string, string>) {
  expect(Object.keys(results).sort()).toEqual([...needs].sort());
  const run = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
    env: { ...process.env, RESULTS: needs.map((job) => results[job]).join(' ') },
    encoding: 'utf8',
  });
  expect(run.error).toBeUndefined();
  expect(run.stderr).toBe('');
  return run.status;
}

it.each(['success', 'skipped', 'failure', 'cancelled'])('propagates docker-smoke %s through the real aggregate shell', (result) => {
  expect(gate).toContain('    if: always()');
  expect(needs).toContain('docker-smoke');
  const results = Object.fromEntries(needs.map((job) => [job, job === 'docker-smoke' ? result : 'success']));
  expect(runAggregate(results)).toBe(['success', 'skipped'].includes(result) ? 0 : 1);
});

// Successful jobs for each narrowed PR scope; all other dependencies intentionally skip.
const webJobs = ['wasm', 'research-wasm', 'site-e2e', 'web-unit', 'e2e'];
const selections = [
  { scope: 'docs', selected: [] },
  { scope: 'research', selected: [...webJobs, 'research'] },
  { scope: 'tools', selected: [...webJobs, 'research'] },
  { scope: 'engine', selected: [...webJobs, 'lint-engine', 'test-engine-gates', 'test-engine-suite',
    'test-engine-metamorphic', 'results-snapshot', 'determinism'] },
];

it.each(selections)('accepts intentional $scope PR-selection skips through the real aggregate shell', ({ selected }) => {
  const successful = ['changes', 'lint-repo', ...selected];
  expect(needs).toEqual(expect.arrayContaining(successful));
  const results = Object.fromEntries(needs.map((job) => [job, successful.includes(job) ? 'success' : 'skipped']));
  expect(runAggregate(results)).toBe(0);
});

it.each(needs)('rejects failure or cancellation of %s even when other jobs skip', (job) => {
  for (const result of ['failure', 'cancelled']) {
    const results = Object.fromEntries(needs.map((dependency) => [dependency, dependency === job ? result : 'skipped']));
    expect(runAggregate(results)).toBe(1);
  }
});
