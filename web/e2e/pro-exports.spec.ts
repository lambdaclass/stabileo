/**
 * PRO's exports from the Project tab, on a model with shells: each button opens its dialog, and
 * what comes out carries what was chosen. The DXF has its layers and the shells as 3D faces; the
 * picture draws the shells' result with its scale; the report is the PDF, with its figures drawn
 * from the model. The content of each file is checked in `lib/export/__tests__/pro-exports.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { test, expect, loadModel, solveModel } from './fixtures';

test.describe('PRO exports', () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ pro: page }) => {
    await loadModel(page, 'mat-foundation');
    await solveModel(page);
    await page.getByTestId('pr-project').click();
  });

  test('DXF: shells as 3D faces, a layer per content, in millimetres', async ({ pro: page }) => {
    await page.getByTestId('pp-export-drawings').click();
    const dialog = page.getByTestId('pro-dxf-export-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('pro-dxf-deformed').check();
    await dialog.locator('summary', { hasText: /Dibujo|Drawing/ }).click();
    await dialog.getByTestId('pro-dxf-units-mm').click();
    const wait = page.waitForEvent('download');
    await dialog.getByTestId('pro-dxf-export-download').click();
    const dl = await wait;
    expect(dl.suggestedFilename()).toMatch(/\.dxf$/);
    const dxf = readFileSync((await dl.path())!, 'utf8');
    expect(dxf).toContain('$INSUNITS\n70\n4');
    expect(dxf).toContain('3DFACE');
    expect(dxf).toMatch(/\nLAYER\n2\n(PLACAS|SHELLS)\n/);
    expect(dxf).toMatch(/\nLAYER\n2\n(DEFORMADA|DEFORMED)\n/);
  });

  test('a picture of the shells\' result, as SVG', async ({ pro: page }) => {
    await page.getByTestId('pp-export-drawings').click();
    await page.getByTestId('pro-dxf-export-dialog').getByTestId('drawing-format-svg').click();
    const dialog = page.getByTestId('pro-view-export-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('pro-view-export-model').uncheck();
    await dialog.getByTestId('pro-view-export-shellMap').check();
    await expect(dialog.getByTestId('pro-view-export-shell-component')).toBeVisible();
    const wait = page.waitForEvent('download');
    await dialog.getByTestId('pro-view-export-download').click();
    const dl = await wait;
    expect(dl.suggestedFilename()).toMatch(/\.svg$/);
    const svg = readFileSync((await dl.path())!, 'utf8');
    expect(svg).toContain('<svg');
    expect(svg).toContain('kN/m²');
  });

  test('JPG is offered beside SVG and PNG', async ({ pro: page }) => {
    await page.getByTestId('pp-export-drawings').click();
    await page.getByTestId('pro-dxf-export-dialog').getByTestId('drawing-format-jpg').click();
    const dialog = page.getByTestId('pro-view-export-dialog');
    await expect(dialog.getByTestId('drawing-format-jpg')).toHaveClass(/on/);
    const wait = page.waitForEvent('download');
    await dialog.getByTestId('pro-view-export-download').click();
    expect((await wait).suggestedFilename()).toMatch(/\.jpg$/);
  });

  test('the report is a PDF document, each result as a table, a figure or both', async ({ pro: page }) => {
    await page.getByTestId('pp-export-report').click();
    const dialog = page.getByTestId('pro-report-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('rpt-xlsx')).toHaveCount(0);
    await dialog.getByTestId('rpt-mode-reactions').selectOption('figure');
    const opened = page.context().waitForEvent('page');
    await dialog.getByTestId('rpt-pdf').click();
    const report = await opened;
    await report.waitForLoadState();
    const html = await report.content();
    expect(html).toContain('data:image/svg+xml');
    expect(html).toMatch(/(Figura|Figure) 1\./);
  });
});
