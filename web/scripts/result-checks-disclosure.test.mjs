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

const manualReduction = `
import { mount, unmount, tick } from 'svelte';
import Details from '/src/components/pro/loads/ProCaseDetails.svelte';
import { modelStore, uiStore } from '/src/lib/store/index.ts';
import { regulationsStore } from '/src/lib/store/regulations.svelte.ts';
import { serializeProject, deserializeProject } from '/src/lib/store/file.ts';
let component, caseId;
globalThis.openReduction = async (workspace, occupancyKey, family, floorsSupported = 6) => {
  if (component) await unmount(component);
  modelStore.clear();
  modelStore.addNode(0, 0);
  uiStore.analysisMode = workspace;
  if (family) {
    const { FAMILY_STACKS } = await import('/src/lib/codes/families/stacks.ts');
    const change = regulationsStore.requestStack(FAMILY_STACKS[family]);
    if (change.kind !== 'needsLoadReview') throw Error(JSON.stringify(change));
    regulationsStore.applyPending('loadRegulation');
  }
  caseId = modelStore.addLoadCase('Office live load', 'L');
  modelStore.updateLoadCaseFields(caseId, { reduction: { ratio: 1, tributaryAreaM2: 80, elementKind: 'interiorColumn', floorsSupported, occupancyKey } });
  if (!deserializeProject(serializeProject())) throw Error('Could not reopen reduction');
  const lc = modelStore.loadCases.find(c => c.id === caseId);
  component = mount(Details, { target: document.body, props: { lc } });
  await tick();
};
globalThis.savedReduction = () => JSON.parse(serializeProject()).snapshot.loadCases.find(c => c.id === caseId).reduction;
globalThis.expectedReduction = async (key, floorsSupported) => {
  const { loadCodeFor } = await import('/src/lib/codes/families/index.ts');
  const code = loadCodeFor(regulationsStore.binding('loads').adapterId), row = code.occupancy(key);
  return code.reduce({ occupancyKey: key, loKNm2: row.uniformKNm2, tributaryAreaM2: 80, elementKind: 'interiorColumn', floorsSupported, noReduction: !!row.noReduction, publicAssembly: false, passengerGarage: false }).lKNm2 / row.uniformKNm2;
};
`;

test('known wrong result: #1928 reopening a case cannot apply a replacement occupancy without a selection', async () => {
  for (const profile of ['production', 'test']) {
    await withComponent(profile, manualReduction, async (page, url) => {
      await page.goto(url);
      await page.waitForFunction(() => typeof globalThis.openReduction === 'function');
      for (const workspace of ['2d', '3d', 'pro']) {
        await page.evaluate(workspace => globalThis.openReduction(workspace, 'archived-use'), workspace);
        const apply = page.getByTestId('cd-red-apply'), select = page.getByTestId('cd-red-occupancy');
        assert.equal(await apply.isDisabled(), true, workspace);
        assert.equal((await page.evaluate(() => globalThis.savedReduction())).occupancyKey, 'archived-use');
        await select.selectOption('vivienda');
        assert.equal(await apply.isEnabled(), true);
        await apply.click();
        const saved = await page.evaluate(() => globalThis.savedReduction());
        assert.equal(saved.occupancyKey, 'vivienda');
        assert.equal(saved.ratio, await page.evaluate(() => globalThis.expectedReduction('vivienda', 6)));
      }
    });
  }
});

test('known wrong result: #1928 a manual TS 498 case applies the reduction for its recorded occupancy row', async () => {
  await withComponent('test', manualReduction, async (page, url) => {
    await page.goto(url);
    await page.waitForFunction(() => typeof globalThis.openReduction === 'function');
    for (const workspace of ['2d', '3d', 'pro']) {
      for (const [key, floors] of [['tr_office', 3], ['tr_office', 4], ['tr_residential', 6], ['tr_shop_small', 6], ['tr_hospital_rooms', 6]]) {
        await page.evaluate(([w, k, n]) => globalThis.openReduction(w, k, 'turkey', n), [workspace, key, floors]);
        const expected = await page.evaluate(([k, n]) => globalThis.expectedReduction(k, n), [key, floors]);
        await page.getByTestId('cd-red-apply').click();
        const saved = await page.evaluate(() => globalThis.savedReduction());
        assert.equal(saved.occupancyKey, key);
        assert.equal(saved.ratio, expected, workspace + ' ' + key + ' ' + floors);
      }
    }
  });
});
