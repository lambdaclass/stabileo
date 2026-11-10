import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { certify_plastic_3d } from '../../wasm/dedaliano_engine.js';
import { plasticReading } from '../certificate-read';
import { knownIssueResultDisposition } from '../known-issues';

it('reads the returned certified factor independently of the preserved raw mismatch and shows its warning #1760', () => {
  const artifact = readFileSync(resolve(__dirname, '../../../../../engine/fuzz/corpus-regressions/plastic-lp-budget/issue-1760.bin'));
  const output = JSON.parse(certify_plastic_3d(artifact.subarray(2).toString('utf8')));
  expect(output.results.collapseFactor).toBe(output.certificate.lambdaLower);
  expect(output.certificate.certified).toBe(true);
  expect(output.certificate.solverWithinBounds).toBe(false);
  expect(plasticReading(output.certificate, output.results.collapseFactor).within).toBe(true);
  expect(plasticReading(output.certificate, output.certificate.solverCollapseFactor).within).toBe(false);
  const disposition = knownIssueResultDisposition(output);
  expect(disposition.refused).toBe(false);
  expect(disposition.messages).toContainEqual(expect.stringContaining('certified lower bound'));
  expect(disposition.messages).toContainEqual(expect.stringContaining(String(output.certificate.solverCollapseFactor)));
  expect(output.results.warnings).toContainEqual(expect.stringContaining('PL-3D-CERTIFICATE-MISMATCH'));
  expect(output.results.steps.length).toBeGreaterThan(0);
  expect(output.results.hinges.length).toBeGreaterThan(0);
});
