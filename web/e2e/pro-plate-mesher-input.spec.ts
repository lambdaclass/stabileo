import { expect, loadModel, test } from './fixtures';

const invalidInputs = [
  ['unknown outline node', '5, 6, 999, 8, 7', null, null],
  ['malformed outline token', '5, 6, nope, 8, 7', null, null],
  ['incomplete circle outline', null, '0; ; 0', null],
  ['incomplete polygon hole', '5, 6, 8, 7', null, '5, 6'],
  ['malformed polygon hole', '5, 6, 8, 7', null, '5, 6, nope'],
  ['incomplete circle hole', null, '0; 0; 0', '1; ; 0'],
  ['nonfinite circle hole', null, '0; 0; 0', '1; Infinity; 0'],
] as const;

for (const [label, outline, center, hole] of invalidInputs) {
  test(`#2376 @smoke the mesher refuses ${label}`, async ({ pro: page }) => {
    if (outline) await loadModel(page, '3d-portal-frame');
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-shells').click();
    await page.getByRole('button', { name: /Mesh generator/i }).click();
    if (outline) {
      await page.getByTestId('ms-outline').fill(outline);
    } else {
      await page.getByTestId('ms-circle').check();
      await page.getByTestId('ms-center').fill(center!);
    }
    if (hole) {
      await page.getByTestId('ms-add-hole').click();
      if (outline) {
        const row = page.locator('.ms-hole');
        await row.locator('select').selectOption('polygon');
        await row.locator('input').fill(hole);
      } else {
        await page.getByTestId('ms-hole-center-0').fill(hole);
      }
    }
    await expect(page.getByTestId('ms-apply')).toBeDisabled({ timeout: 1000 });
    await expect(page.getByTestId('ms-summary')).toHaveCount(0);
    await expect(page.getByTestId('ms-input-error')).toContainText(hole ? 'Plate hole 1' : 'Plate outline');
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }]) {
  test(`@smoke the plate mesher displays a blocking message and accepts corrections at ${viewport.width}px`, async ({ pro: page }) => {
    await page.getByTestId('pr-stage-model').click();
    await page.setViewportSize(viewport);
    if (viewport.width < 768) {
      await page.getByTestId('mobile-panel-toggle').click();
      const grid = page.getByTestId('pm-grid-toggle');
      if (await grid.getAttribute('aria-expanded') !== 'true') await grid.click();
      await expect(grid).toHaveAttribute('aria-expanded', 'true');
      await page.getByTestId('pm-cmd-shells').click();
    } else {
      await page.getByTestId('pr-cmd-shells').click();
    }
    await page.getByRole('button', { name: /Mesh generator/i }).click();
    await page.getByTestId('ms-circle').check();
    await page.getByTestId('ms-add-hole').click();
    await page.getByTestId('ms-hole-center-0').fill('1; 0; 0');
    const radius = page.getByTestId('ms-hole-r-0');
    const apply = page.getByTestId('ms-apply');
    const message = page.getByTestId('ms-input-error');
    await expect(apply).toBeEnabled();

    for (const invalid of ['', 'invalid', '0']) {
      await radius.fill(invalid);
      await radius.press('Tab');
      await expect(apply).toBeDisabled();
      await expect(message).toHaveText(/Plate hole 1/);
      await message.scrollIntoViewIfNeeded();
      await expect(message).toBeInViewport();
      const box = (await message.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }

    await radius.fill('0.05');
    await radius.press('Tab');
    await expect(message).toHaveCount(0);
    await expect(apply).toBeEnabled();
    await apply.click();
    await expect(page.getByTestId('ms-done')).toBeVisible();
  });
}
