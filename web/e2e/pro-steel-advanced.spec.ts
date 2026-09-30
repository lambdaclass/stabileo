/**
 * PRO 10/10: tapered members from the edit panel, and the shed generator's tapered columns.
 */
import { test, expect, loadModel } from './fixtures';

test.use({ viewport: { width: 1280, height: 800 } });

test.describe('@smoke PRO tapered members', () => {
  test('a selected member is cut into prismatic segments of varying depth', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await page.getByTestId('pr-stage-model').click();
    const before = await page.evaluate(() => window.__stabileo.modelCensus().elements);
    await page.evaluate(() => window.__stabileoActions.selectElements([1]));
    await page.getByTestId('pr-cmd-edit').click();
    await expect(page.getByTestId('ep-taper')).toBeVisible();
    await page.getByTestId('ep-taper-n').fill('4');
    await page.getByTestId('ep-taper-n').blur();
    await page.getByTestId('ep-taper-go').click();
    await expect(page.getByTestId('ep-done')).toContainText('1');
    const after = await page.evaluate(() => window.__stabileo.modelCensus().elements);
    expect(after).toBe(before + 3);
  });
});

test.describe('@smoke PRO direct analysis', () => {
  test('AISC 360 reads the direct analysis at K = 1, one row per combination', async ({ pro: page }) => {
    await page.evaluate(async () => {
      await window.__stabileoActions.loadExample('3d-portal-frame');
      window.__stabileoActions.updateSection(1, { shape: 'I', tw: 0.0108, tf: 0.0162 });
      window.__stabileoActions.combineCases('1.0 todos');
      await window.__stabileoActions.solve();
    });
    await page.getByTestId('pr-stage-design').click();
    await page.getByTestId('pr-cmd-otherCodes').click();
    await page.getByTestId('other-codes-source-direct').click();
    await expect(page.getByTestId('other-codes-run')).toBeDisabled();
    await page.getByTestId('direct-run').click();
    await expect(page.getByTestId('direct-table').locator('tbody tr')).not.toHaveCount(0);
    await page.getByTestId('other-codes-run').click();
    await expect(page.getByTestId('other-codes-direct-note')).toBeVisible();
    await expect(page.getByTestId('other-codes-summary')).toBeVisible();
    await page.getByTestId('direct-notional').fill('0.003');
    await expect(page.getByTestId('direct-stale')).toBeVisible();
    await expect(page.getByTestId('other-codes-run')).toBeDisabled();
    await expect(page.getByTestId('other-codes-stale')).toBeVisible();
    await page.getByTestId('direct-run').click();
    await expect(page.getByTestId('other-codes-run')).toBeEnabled();
    await expect(page.getByTestId('direct-stale')).toHaveCount(0);
  });

  test('blocks verification when one of two active combinations is unstable', async ({ pro: page }) => {
    const project = {
      version: '2.0', name: 'Stable and unstable combinations', analysisMode: 'pro',
      snapshot: {
        nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: 4 }]],
        elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]],
        materials: [[1, { id: 1, name: 'Steel', e: 200000, nu: .3, rho: 0, fy: 355 }]],
        sections: [[1, { id: 1, name: 'Column', a: .01, iy: 1e-5, iz: 1e-5, j: 2e-5 }]],
        supports: [[1, { id: 1, nodeId: 1, type: 'fixed3d' }]],
        loads: [{ type: 'nodal3d', data: { id: 1, nodeId: 2, caseId: 1, fx: 0, fy: 0, fz: -60, mx: 0, my: 0, mz: 0 } }],
        loadCases: [{ id: 1, name: 'Dead', type: 'D' }],
        combinations: [1, 5].map((factor, i) => ({ id: i + 1, name: `${factor}D`, factors: [{ caseId: 1, factor }] })),
        nextId: { node: 3, element: 2, material: 2, section: 2, support: 2, load: 2, loadCase: 2, combination: 3 },
      },
    };
    await page.getByTestId('pr-project').click();
    await page.getByTestId('pp-open-file').setInputFiles({
      name: 'direct.ded', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)),
    });
    await page.getByTestId('pr-stage-design').click();
    await page.getByTestId('pr-cmd-otherCodes').click();
    await page.getByTestId('other-codes-source-direct').click();
    await page.getByTestId('direct-run').click();
    await expect(page.getByTestId('direct-table').locator('tbody tr')).toHaveCount(2);
    await expect(page.getByTestId('direct-table').locator('tbody tr.bad')).toHaveCount(1);
    await expect(page.getByTestId('direct-design-blocked')).toBeVisible();
    await expect(page.getByTestId('other-codes-run')).toBeDisabled();
    await expect(page.getByTestId('other-codes-summary')).toHaveCount(0);
  });
});

test.describe('@smoke PRO optimiser criteria', () => {
  test('a target ratio and a depth limit shape the proposal', async ({ pro: page }) => {
    await page.evaluate(async () => {
      await window.__stabileoActions.loadExample('3d-portal-frame');
      await window.__stabileoActions.solve();
    });
    await page.getByTestId('pr-stage-design').click();
    await page.getByTestId('pr-cmd-steel').click();
    const opt = page.getByTestId('steel-optimise');
    await opt.scrollIntoViewIfNeeded();
    await page.getByTestId('opt-criteria').locator('summary').click();
    await page.getByTestId('opt-family-HEB').check();
    await page.getByTestId('opt-hmax').fill('400');
    await page.getByTestId('opt-target').fill('80');
    await page.getByTestId('opt-run').click();
    const rows = page.getByTestId('opt-rows').locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    const ratios = await rows.locator('td:nth-child(6)').allInnerTexts();
    for (const r of ratios) if (r !== '—') expect(Number(r.replace(/[^\d.]/g, ''))).toBeLessThanOrEqual(80);
  });
});
