import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import type { Download, Page } from '@playwright/test';
import { test, expect, loadModel } from './fixtures';

const EMPTY_DONE = /Exported with no data|Exportado sin datos/;

async function basic(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
  const panel = page.locator('[data-testid="basic-panel"][data-panel="project"]');
  if (await panel.count() === 0) await page.getByTestId('hdr-project').click();
}

async function emptyExport(page: Page, click: () => Promise<unknown>): Promise<Download> {
  const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
  expect(dl.suggestedFilename()).not.toMatch(/tabBar/);
  await expect(page.locator('.toast', { hasText: EMPTY_DONE }).last()).toBeVisible();
  return dl;
}

async function zipNames(click: () => Promise<unknown>, page: Page): Promise<string[]> {
  const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
  expect(dl.suggestedFilename()).toMatch(/\.zip$/);
  return Object.keys(unzipSync(new Uint8Array(readFileSync((await dl.path())!)))).sort();
}

test.describe('@smoke exporting an empty model', () => {
  test.describe.configure({ timeout: 180_000 });

  test('PRO offers every export, warns in each dialog and after, and the files still come out', async ({ pro: page }) => {
    await page.getByTestId('pr-project').click();
    for (const id of ['pp-export-results', 'pp-export-report', 'pp-export-drawings', 'pp-export-ifc']) await expect(page.getByTestId(id)).toBeEnabled();

    await page.getByTestId('pp-export-results').click();
    const data = page.getByTestId('pro-data-export-dialog');
    await expect(data.getByTestId('export-empty-note')).toBeVisible();
    await emptyExport(page, () => data.locator('button.primary').click());

    await page.getByTestId('pp-export-report').click();
    const report = page.getByTestId('pro-report-dialog');
    await expect(report.getByTestId('export-empty-note')).toBeVisible();
    await report.getByTestId('rpt-format-docx').click();
    expect((await emptyExport(page, () => report.getByTestId('rpt-pdf').click())).suggestedFilename()).toMatch(/\.docx$/);

    if (await page.getByTestId('pp-export-drawings').count() === 0) await page.getByTestId('pr-project').click();
    await page.getByTestId('pp-export-drawings').click();
    const dxf = page.getByTestId('pro-dxf-export-dialog');
    await expect(dxf.getByTestId('export-empty-note')).toBeVisible();
    await emptyExport(page, () => dxf.getByTestId('pro-dxf-export-download').click());

    await page.getByTestId('pp-export-drawings').click();
    await page.getByTestId('pro-dxf-export-dialog').getByTestId('drawing-format-png').click();
    await emptyExport(page, () => page.getByTestId('pro-view-export-download').click());

    expect((await emptyExport(page, () => page.getByTestId('pp-export-ifc').click())).suggestedFilename()).toMatch(/\.ifc$/);
    await expect(page.locator('.toast-error')).toHaveCount(0);
  });

  test('Basic warns in each dialog and after, without the solver complaining', async ({ page }) => {
    await basic(page);
    await page.getByTestId('export-results').click();
    const results = page.getByTestId('results-export-dialog');
    await expect(results.getByTestId('export-empty-note')).toBeVisible();
    await emptyExport(page, () => results.getByTestId('results-export-download').click());

    await page.getByTestId('export-report').click();
    const report = page.getByTestId('calc-report-dialog');
    await expect(report.getByTestId('export-empty-note')).toBeVisible();
    await report.getByTestId('calc-report-format-docx').click();
    await emptyExport(page, () => report.getByTestId('calc-report-generate').click());

    await page.getByTestId('export-drawings').click();
    const drawings = page.getByTestId('view-export-dialog');
    await expect(drawings.getByTestId('export-empty-note')).toBeVisible();
    await emptyExport(page, () => drawings.getByTestId('view-export-download').click());
    await expect(page.locator('.toast-error')).toHaveCount(0);
  });
});

test.describe('@smoke choosing which drawings come out', () => {
  test.describe.configure({ timeout: 180_000 });

  test('Basic: model and diagrams in one file each, or on one sheet', async ({ page }) => {
    await basic(page);
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await page.getByTestId('export-drawings').click();
    const d = page.getByTestId('view-export-dialog');
    await expect(d.getByTestId('export-empty-note')).toHaveCount(0);

    await d.getByTestId('view-export-preset-model').click();
    await expect(d.getByTestId('view-export-layout-together')).toHaveCount(0);
    await d.getByTestId('view-export-preset-diagrams').click();
    await expect(d.getByTestId('view-export-preset-diagrams')).toHaveClass(/on/);
    for (const c of ['model', 'moment', 'shear', 'axial']) await expect(d.getByTestId(`view-export-${c}`)).toBeChecked();
    for (const c of ['reactions', 'deformed', 'despiece']) await expect(d.getByTestId(`view-export-${c}`)).not.toBeChecked();

    await d.getByTestId('view-export-format-png').click();
    await d.getByTestId('view-export-layout-separate').click();
    const names = await zipNames(() => d.getByTestId('view-export-download').click(), page);
    expect(names.filter((n) => n.endsWith('.png'))).toHaveLength(4);

    await page.getByTestId('export-drawings').click();
    await d.getByTestId('view-export-layout-together').click();
    const [one] = await Promise.all([page.waitForEvent('download'), d.getByTestId('view-export-download').click()]);
    expect(one.suggestedFilename()).toMatch(/\.png$/);
  });

  test('PRO: DXF as one drawing with layers or one per result, and the pictures the same', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await page.getByTestId('pr-project').click();
    await page.getByTestId('pp-export-drawings').click();
    const dxf = page.getByTestId('pro-dxf-export-dialog');
    await dxf.getByTestId('pro-dxf-preset-model').click();
    await expect(dxf.getByTestId('pro-dxf-layout-together')).toHaveCount(0);
    await dxf.getByTestId('pro-dxf-preset-diagrams').click();
    await dxf.getByTestId('pro-dxf-layout-separate').click();
    const dxfs = await zipNames(() => dxf.getByTestId('pro-dxf-export-download').click(), page);
    expect(dxfs.filter((n) => n.endsWith('.dxf')).map((n) => n.replace(/^.*_/, ''))).toEqual(['M.dxf', 'N.dxf', 'V.dxf', 'estructura.dxf']);

    await page.getByTestId('pp-export-drawings').click();
    await page.getByTestId('pro-dxf-export-dialog').getByTestId('drawing-format-png').click();
    const view = page.getByTestId('pro-view-export-dialog');
    await view.getByTestId('pro-view-export-preset-diagrams').click();
    await view.getByTestId('pro-view-export-layout-separate').click();
    const pngs = await zipNames(() => view.getByTestId('pro-view-export-download').click(), page);
    expect(pngs.filter((n) => n.endsWith('.png'))).toHaveLength(4);
  });
});
