import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { certify_plastic_3d } from '../../wasm/dedaliano_engine.js';
import { plasticReading } from '../certificate-read';
import { knownIssueResultDisposition } from '../known-issues';

it.each(['issue-1760.bin', 'unconservative-cantilever.bin'])('reads the certified factor and raw mismatch warning for %s #1760', (file) => {
  const artifact = readFileSync(resolve(__dirname, '../../../../../engine/fuzz/corpus-regressions/plastic-lp-budget', file));
  const output = JSON.parse(certify_plastic_3d(artifact.subarray(2).toString('utf8')));
  expect(output.results.collapseFactor).toBe(output.certificate.lambdaLower);
  expect(output.certificate.certified).toBe(true);
  expect(output.certificate.solverWithinBounds).toBe(false);
  if (file === 'unconservative-cantilever.bin') {
    expect(output.certificate.solverCollapseFactor).toBeGreaterThan(output.certificate.lambdaUpper);
    const rawReading = plasticReading(output.certificate, output.certificate.solverCollapseFactor);
    expect(rawReading.deviation).toBeGreaterThan(0);
    expect(rawReading.within).toBe(true);
  } else {
    expect(output.certificate.solverCollapseFactor).toBeLessThan(output.certificate.lambdaLower);
    expect(plasticReading(output.certificate, output.certificate.solverCollapseFactor).within).toBe(false);
  }
  expect(plasticReading(output.certificate, output.results.collapseFactor).within).toBe(true);
  const disposition = knownIssueResultDisposition(output);
  expect(disposition.refused).toBe(false);
  expect(disposition.messages).toContainEqual(expect.stringContaining('certified lower bound'));
  expect(disposition.messages).toContainEqual(expect.stringContaining(String(output.certificate.solverCollapseFactor)));
  expect(disposition.messages).toContainEqual(expect.stringContaining(`[${output.certificate.lambdaLower}, ${output.certificate.lambdaUpper}]`));
  expect(disposition.messages).toContainEqual(expect.stringContaining('outside the certified interval'));
  expect(output.results.warnings).toContainEqual(expect.stringContaining('PL-3D-CERTIFICATE-MISMATCH'));
  expect(output.results.steps.length).toBeGreaterThan(0);
  expect(output.results.hinges.length).toBeGreaterThan(0);
});
