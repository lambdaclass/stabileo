/**
 * The automatic loads say they are working (QA of 19-oct: «you can't tell whether it froze or is
 * applying»): the preview and the apply show their step, a stopped preview leaves nothing behind,
 * and an applied plan closes the dialog once the loads are in the model.
 */
import { test, expect, placeFrameFromGrid } from './fixtures';

test.use({ viewport: { width: 1400, height: 900 } });

test.describe('@slow automatic loads, step by step', () => {
  test('preview and apply say their step; stopping leaves no plan', async ({ pro: page }) => {
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-grid').click();
    await page.getByTestId('grid-bays-x').fill('5');
    await page.getByTestId('grid-generate-x').click();
    await page.getByTestId('grid-bays-y').fill('4');
    await page.getByTestId('grid-generate-y').click();
    await page.getByTestId('grid-heights').fill('3');
    await page.getByTestId('grid-generate-levels').click();
    await page.getByTestId('grid-open-building').click();
    await placeFrameFromGrid(page);

    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-loads').click();
    await page.getByTestId('pro-auto-loads-btn').click();

    // The preview starts, says its first step, and is stopped before the plan is built.
    const seen = await page.evaluate(async () => {
      (document.querySelector('[data-testid="al-preview-btn"]') as HTMLButtonElement).click();
      await Promise.resolve(); await new Promise((r) => setTimeout(r, 0));
      const status = document.querySelector('[data-testid="al-working"]')?.textContent ?? '';
      (document.querySelector('[data-testid="al-working-cancel"]') as HTMLButtonElement | null)?.click();
      return status;
    });
    expect(seen).toMatch(/Paso 1 de \d|Step 1 of \d|Passo 1 de \d/);
    await expect(page.getByTestId('al-working')).toHaveCount(0);
    await expect(page.getByTestId('al-apply')).toHaveCount(0);
    await expect(page.getByTestId('al-preview-btn')).toBeEnabled();

    // Run to the end: the plan is shown, then applied with its count said while it goes in.
    await page.getByTestId('al-preview-btn').click();
    await expect(page.getByTestId('al-apply')).toBeEnabled({ timeout: 60_000 });
    const applying = await page.evaluate(async () => {
      (document.querySelector('[data-testid="al-apply"]') as HTMLButtonElement).click();
      await Promise.resolve(); await new Promise((r) => setTimeout(r, 0));
      return document.querySelector('[data-testid="al-working"]')?.textContent ?? '';
    });
    expect(applying).toMatch(/Aplicando \d+ cargas|Applying \d+ loads/);
    await expect(page.getByTestId('al-apply')).toHaveCount(0, { timeout: 60_000 });
    expect((await page.evaluate(() => window.__stabileo.modelCensus())).loads).toBeGreaterThan(0);
  });
});
