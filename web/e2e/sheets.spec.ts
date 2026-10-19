/**
 * The sheet set on the Documents stage: the qa-8 frame designed and detailed, its drawings laid
 * out on numbered A1 sheets with the index first, a revision stated on one sheet, the documents'
 * language switched, and both downloads recorded in the export log. The composition, the formats
 * and the three writers are pinned in `lib/sheets/__tests__/sheets.test.ts`.
 */
import { test, expect, designAll, loadModel, openDocumentsStage, solveModel, designPlace } from './fixtures';
import { readFileSync, writeFileSync } from 'node:fs';

test.use({ viewport: { width: 1400, height: 900 } });

test.describe('@slow sheets', () => {
  test('the drawings on numbered sheets, revised, in another language, downloaded', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await designPlace(page, 'detailing');
    const d = page.getByTestId('desk-detailing');
    await page.getByTestId('cmd-generate-detailing').click();
    await expect.poll(async () => page.evaluate(() =>
      (window.__stabileo as unknown as { detailingAssemblies(): unknown[] })
        .detailingAssemblies().length), { timeout: 30_000 }).toBeGreaterThan(0);
    await openDocumentsStage(page);

    const panel = page.getByTestId('sheets-panel');
    await panel.scrollIntoViewIfNeeded();
    await page.getByTestId('sheets-build').click();
    await expect(page.getByTestId('sheets-count')).toBeVisible();
    // The index is the first sheet, numbered from the project's prefix and start.
    await expect(page.getByTestId('sheets-item-E-01')).toContainText(/Índice|index/i);
    await expect(page.getByTestId('sheets-item-E-02')).toBeVisible();
    await expect(page.getByTestId('sheets-preview').locator('svg')).toBeVisible();
    if (process.env.SHOT) {
      for (const n of ['E-02', 'E-03', 'E-04', 'E-05', 'E-06', 'E-08']) {
        if (await page.getByTestId(`sheets-item-${n}`).count() === 0) continue;
        await page.getByTestId(`sheets-item-${n}`).click();
        writeFileSync(process.env.SHOT.replace('.png', `-${n}.svg`), await page.getByTestId('sheets-preview').innerHTML());
      }
    }

    // The construction drawings come before and after the detailing ones.
    const list = page.getByTestId('sheets-list');
    for (const re of [/General notes|Notas generales/, /Formwork plan|Planta de encofrado/, /Column schedule|Cuadro de columnas/, /bending schedule|Planilla de doblado/i, /Construction details|Detalles constructivos/]) {
      await expect(list).toContainText(re);
    }
    // A kind left out is gone from the set.
    await page.getByTestId('sheets-kinds').locator('summary').click();
    await page.getByTestId('sheets-kind-details').uncheck();
    await expect(list).not.toContainText(/Construction details|Detalles constructivos/);
    await page.getByTestId('sheets-kind-details').check();

    // A revision on one sheet reaches its title block and the index.
    await page.getByTestId('sheets-rev-E-02').fill('B');
    await page.getByTestId('sheets-rev-E-02').press('Enter');
    await page.getByTestId('sheets-item-E-02').click();
    await expect(page.getByTestId('sheets-preview')).toContainText('B');

    // The drawings in English while the app stays in Spanish.
    await page.getByTestId('sheets-language').selectOption('en');
    await page.getByTestId('sheets-item-E-01').click();
    await expect(page.getByTestId('sheets-preview')).toContainText('Sheet index');
    await expect(page.getByTestId('sheets-build')).toHaveText(/Armar|Lay out/);

    // Another numbering: prefix and first number.
    await page.getByTestId('sheets-prefix').fill('S-');
    await page.getByTestId('sheets-prefix').press('Enter');
    await expect(page.getByTestId('sheets-item-S-01')).toBeVisible();

    const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByTestId('sheets-pdf').click()]);
    expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
    const bytes = readFileSync(await pdf.path());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.toString('latin1')).toContain('Sheet index');

    const [zip] = await Promise.all([page.waitForEvent('download'), page.getByTestId('sheets-dxf').click()]);
    expect(zip.suggestedFilename()).toMatch(/\.zip$/);

    const kinds = await page.evaluate(() =>
      (window.__stabileo as unknown as { exportRecords(): Array<{ kind: string }> }).exportRecords().map((r) => r.kind));
    expect(kinds).toEqual(expect.arrayContaining(['sheetsPdf', 'sheetsDxf']));

    // The settings travel with the project.
    const file = await page.evaluate(() => JSON.parse(window.__stabileo.serializeProject()));
    expect(JSON.stringify(file)).toContain('"prefix":"S-"');
  });

  test('a steel building without detailing: framing, anchors and a sheet per joint', async ({ pro: page }) => {
    await loadModel(page, '3d-nave-industrial');
    await solveModel(page);
    await designPlace(page, 'connections');
    const overview = page.getByTestId('joints-overview');
    await overview.getByTestId('joints-propose-all').click();
    await expect(overview.getByTestId('joints-note')).toContainText(/\d/);
    await designPlace(page, 'steel');
    const stage = page.getByTestId('steel-stage-documents');
    if (await stage.getAttribute('open') === null) await stage.locator('> summary').click();
    const panel = stage.getByTestId('sheets-panel');
    await panel.scrollIntoViewIfNeeded();
    await panel.getByTestId('sheets-build').click();
    const list = page.getByTestId('sheets-list');
    for (const re of [/Steel framing|Estructura metálica/, /Anchors|Anclajes/, /Connections|Uniones/]) await expect(list).toContainText(re);
    if (process.env.SHOT) {
      const items = page.locator('[data-testid^="sheets-item-"]');
      for (let i = 1; i < await items.count(); i += 3) {
        await items.nth(i).click();
        writeFileSync(process.env.SHOT.replace('.png', `-steel-${i}.svg`), await page.getByTestId('sheets-preview').innerHTML());
      }
    }
    const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByTestId('sheets-pdf').click()]);
    expect(pdf.suggestedFilename()).toBe('sheets.pdf');
  });
});
