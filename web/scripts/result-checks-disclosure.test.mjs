import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withComponent } from './component-browser-fixture.mjs';

const solvedShell = `
import { mount } from 'svelte';
import Checks from '/src/components/ResultChecks.svelte';
import { uiStore, modelStore } from '/src/lib/store/index.ts';
import { discretizationStore } from '/src/lib/store/discretization.svelte.ts';
import { certificateStore } from '/src/lib/store/certificate.svelte.ts';
import { solveNow } from '/src/lib/actions/solve.ts';
import { initSolver } from '/src/lib/engine/wasm-solver.ts';
try {
  await initSolver();
  uiStore.analysisMode = 'pro';
  await modelStore.loadExample('rc-qa-diagnostic-shells');
  mount(Checks, {target: document.body});
  globalThis.readChecks = () => ({
    estimate: discretizationStore.estimate.status,
    high: discretizationStore.estimate.estimate?.exceedsThreshold,
    certified: certificateStore.shown(true).certificate?.status,
    applies: discretizationStore.applies(),
  });
  globalThis.outcome = await solveNow();
} catch (error) { globalThis.solveFailure = String(error); }
`;

test('known wrong result: #1928 a coarse-mesh warning opens the published results checks on a solved shell', async () => {
  for (const mode of ['production', 'test']) {
    await withComponent(mode, solvedShell, async (page, url) => {
      await page.goto(url);
      await page.waitForFunction(() => globalThis.solveFailure || (globalThis.readChecks?.().estimate === 'done' && globalThis.readChecks().certified));
      const result = await page.evaluate(() => globalThis.solveFailure ?? globalThis.readChecks());
      assert.deepEqual(result, { estimate: 'done', high: true, certified: 'certified', applies: true });
      const checks = page.getByTestId('result-checks');
      assert.equal(await checks.evaluate(el => el.open), mode === 'production');
      assert.equal(await checks.evaluate(el => el.classList.contains('warn')), mode === 'production');
      if (mode === 'test') {
        assert.equal(await checks.getAttribute('data-flag-level'), 'info');
        await checks.getByTestId('result-checks-toggle').click();
      }
      assert.equal(await checks.getByTestId('discretization-warning').first().isVisible(), true);
    });
  }
});

test('known wrong result: #1928 certificate text uses the result panel’s typography in each profile', async () => {
  for (const mode of ['production', 'test']) {
    await withComponent(mode, solvedShell, async (page, url) => {
      await page.goto(url);
      await page.waitForFunction(() => globalThis.solveFailure || globalThis.readChecks?.().certified);
      const cert = page.getByTestId('certificate-status').first();
      const same = await cert.evaluate((element, release) => {
        const expected = document.createElement('span');
        expected.style.fontSize = release ? '0.66rem' : '12px';
        expected.style.lineHeight = release ? '1.35' : '1.4';
        element.parentElement.append(expected);
        return ['fontSize', 'lineHeight'].every(k => getComputedStyle(expected)[k] === getComputedStyle(element)[k]);
      }, mode === 'production');
      assert.equal(same, true, mode);
    });
  }
});
