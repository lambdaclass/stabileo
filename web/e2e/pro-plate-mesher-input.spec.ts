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
  test.skip(`known wrong result: #2376 @smoke the mesher refuses ${label}`, async ({ pro: page }) => {
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
  });
}
