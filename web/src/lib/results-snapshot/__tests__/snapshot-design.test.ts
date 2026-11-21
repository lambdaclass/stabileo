/** Results snapshot gate (#716), the `design` cases of `corpus.ts`. See `run-group.ts`. */
import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resultsStore } from '../../store/results.svelte';
import { verificationStore } from '../../store/verification.svelte';
import { activePerCombo3D } from '../../store/active-results';
import { capture } from '../capture';
import { CORPUS } from '../corpus';
import { initSolver } from '../../engine/wasm-solver';
import { runGroup, snapshotFile } from '../run-group';

beforeAll(async () => { await initSolver(); });
runGroup('design');

it('design-rc-qa-diagnostic e26 records the positive moment at its stationary point', async () => {
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

const exactSteelGradient = process.env.RUN_KNOWN_WRONG === '2403' ? it : it.skip;
for (const [name, members] of [
  ['design-steel-3d-portal-frame', [[7, 3], [8, 3]]],
  ['design-steel-3d-tower', [[10, 2], [12, 3], [14, 2], [15, 2], [16, 3]]],
] as const) {
  exactSteelGradient(`known wrong result: #2403 ${name} uses equilibrium moments for Cb`, async () => {
    await capture(CORPUS.find(c => c.name === name)!);
    for (const [id, comboId] of members) {
      const force = activePerCombo3D().get(comboId)!.elementForces.find(ef => ef.elementId === id)!;
      const q = force.qZI!;
      expect(q).toBe(force.qZJ);
      const m = (x: number) => Math.abs(force.myStart + x * (force.vzStart + q * x / 2));
      const root = -force.vzStart / q;
      const L = force.length;
      expect(root).toBeGreaterThan(0);
      expect(root).toBeLessThan(L);
      const max = Math.max(m(0), m(root), m(L));
      const cb = 12.5 * max / (2.5 * max + 3 * m(L / 4) + 4 * m(L / 2) + 3 * m(3 * L / 4));
      const inputs = verificationStore.steelMap.get(id)!.inputs!;
      expect(inputs.length).toBeGreaterThan(0);
      for (const input of inputs) expect.soft(input.Cb, `member ${id}`).toBeCloseTo(cb, 12);
    }
  });
}
