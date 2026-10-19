/**
 * The memoria de cálculo from the Documents stage: the qa-8 frame designed and detailed, the
 * catalog open with every chapter, a chapter left out, the language switched and the HTML
 * downloaded; and the industrial shed from the steel workflow, whose members read as within the
 * limit and never as satisfying a code. The document itself is pinned in
 * `lib/report/memoria/__tests__/memoria.test.ts`.
 */
import { test, expect, designAll, loadModel, openDocumentsStage, solveModel, openDeskStage, designPlace, leaveDesign } from './fixtures';
import { readFileSync, writeFileSync } from 'node:fs';

test.use({ viewport: { width: 1400, height: 900 } });

test.describe('@slow memoria', () => {
  test('the concrete frame: every chapter, one left out, another language, the file', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await designPlace(page, 'detailing');
    await page.getByTestId('cmd-generate-detailing').click();
    await expect.poll(async () => page.evaluate(() =>
      (window.__stabileo as unknown as { detailingAssemblies(): unknown[] }).detailingAssemblies().length), { timeout: 30_000 }).toBeGreaterThan(0);
    await openDocumentsStage(page);
    await page.getByTestId('memoria-open').first().click();
    const dialog = page.getByTestId('memoria-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('memoria-count')).toContainText(/\d+ (elements|elementos)/);

    const doc = page.frameLocator('[data-testid="memoria-preview"]');
    await expect(doc.locator('h2').first()).toBeVisible();
    await expect(doc.locator('body')).toContainText(/Scope and exclusions|Alcance y exclusiones/);
    await expect(doc.locator('body')).toContainText('CIRSOC 201');
    // A ficha: what must hold and the ratio.
    await expect(doc.locator('.ficha').first()).toContainText(/must satisfy|debe satisfacer/);
    await expect(doc.locator('.ficha .eta').first()).toContainText('η');

    // Without the scope, the hypotheses are chapter 1.
    await page.getByTestId('memoria-ch-scope').uncheck();
    await expect(doc.locator('h2').first()).toHaveText(/^1\. (Modeling assumptions|Hipótesis de modelado)/);

    await page.getByTestId('memoria-language').selectOption('pt');
    await expect(doc.locator('h2').first()).toHaveText(/^1\. Hipóteses de modelagem/);

    const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId('memoria-html').click()]);
    const html = readFileSync(await file.path(), 'utf8');
    expect(html).toContain('<h2>1. Hipóteses de modelagem</h2>');
    if (process.env.SHOT) writeFileSync(process.env.SHOT.replace('.png', '-rc.html'), html);
    await page.getByTestId('memoria-close').click();
    await expect(dialog).toHaveCount(0);
  });

  test('the steel shed: its members within the limit, never satisfying', async ({ pro: page }) => {
    await loadModel(page, '3d-nave-industrial');
    await solveModel(page);
    await openDeskStage(page);
    await page.getByTestId('desk-design').click();
    await page.getByTestId('desk-run').click();
    await expect(page.getByTestId('desk-report')).toBeVisible({ timeout: 120_000 });
    await leaveDesign(page);
    await designPlace(page, 'steel');
    const stage = page.getByTestId('steel-stage-documents');
    if (await stage.getAttribute('open') === null) await stage.locator('> summary').click();
    await stage.getByTestId('memoria-open').click();
    const doc = page.frameLocator('[data-testid="memoria-preview"]');
    await expect(doc.locator('body')).toContainText(/Steel members|Barras de acero/);
    await expect(doc.locator('body')).toContainText(/Within the limit|Dentro del límite|Exceeds|Excede/);
    const text = await doc.locator('table.summary').first().innerText();
    expect(/Satisfies|Cumple\b|verified|verificad/i.test(text)).toBe(false);
    if (process.env.SHOT) writeFileSync(process.env.SHOT.replace('.png', '-steel.html'), await doc.locator('html').evaluate((h) => h.outerHTML));
  });
});
