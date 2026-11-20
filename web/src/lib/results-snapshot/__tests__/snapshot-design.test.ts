/** Results snapshot gate (#716), the `design` cases of `corpus.ts`. See `run-group.ts`. */
import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resultsStore } from '../../store/results.svelte';
import { capture } from '../capture';
import { CORPUS } from '../corpus';
import { initSolver } from '../../engine/wasm-solver';
import { runGroup, snapshotFile } from '../run-group';

beforeAll(async () => { await initSolver(); });
runGroup('design');

const round3 = process.env.RUN_KNOWN_WRONG === '2403' ? it : it.skip;

round3('design-rc-qa-diagnostic e26 records the positive moment at its stationary point', async () => {
  const name = 'design-rc-qa-diagnostic';
  await capture(CORPUS.find(c => c.name === name)!);
  const member = resultsStore.envelope3D!.momentY.elements.find(e => e.elementId === 26)!;
  const regular = [0.55, 0.6, 0.65].map(t => member.posValues[member.tPositions.indexOf(t)]!);
  const [left, center, right] = regular as [number, number, number];
  const quadratic = (left + right) / 2 - center;
  const linear = (right - left) / 2;
  const u = -linear / (2 * quadratic);
  const t = 0.6 + 0.05 * u;
  const magnitude = center + u * (linear + u * quadratic);
  const peakIndex = member.posValues.indexOf(Math.max(...member.posValues));
  expect.soft(t).toBeCloseTo(0.599636, 6);
  expect.soft(magnitude).toBeCloseTo(22.72034856, 8);
  expect.soft(member.tPositions[peakIndex]).toBeCloseTo(t, 10);
  expect.soft(member.posValues[peakIndex]).toBeCloseTo(magnitude, 10);
  const saved = JSON.parse(readFileSync(snapshotFile(name), 'utf8')).values['envelope.momentY[e26]'];
  expect(saved[`posValues[${peakIndex}]`]).toBeCloseTo(magnitude, 8);
});
