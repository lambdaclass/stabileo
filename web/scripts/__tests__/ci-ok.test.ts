import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const gate = workflow.split('\n  ci-ok:')[1];
const needs = gate.split('    needs:\n')[1].split('    steps:')[0].match(/(?<=      - )\S+/g)!;
const script = gate.split('        run: |\n')[1].split('\n').map((line) => line.replace(/^          /, '')).join('\n');

it.each(['success', 'skipped', 'failure', 'cancelled'])('propagates docker-smoke %s through the real aggregate shell', (result) => {
  expect(gate).toContain('    if: always()');
  expect(needs).toContain('docker-smoke');
  const results = needs.map((job) => job === 'docker-smoke' ? result : 'success').join(' ');
  const run = spawnSync('bash', ['-c', script], { env: { ...process.env, RESULTS: results } });
  expect(run.status).toBe(['success', 'skipped'].includes(result) ? 0 : 1);
});
