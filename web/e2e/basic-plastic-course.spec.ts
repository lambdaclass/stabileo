import { test, expect } from './fixtures';
import { openAdvancedFunction, openStepsCatalog, expandStepsCatalog } from './advanced-panel';

test.describe('@slow plastic collapse, withheld', () => {
  test('the course explains the refusal and the withheld methods produce no verdict', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await openAdvancedFunction(page, 'plastic');

    const withheld = page.getByTestId('plastic-withheld');
    await expect(withheld).toBeVisible();
    await expect(withheld).toHaveRole('alert');
    await expect(withheld).toContainText(/4[.,]6/);
    // A note that explains, never a link out to the tracker; it closes.
    await expect(withheld.locator('a')).toHaveCount(0);
    await expect(withheld).not.toContainText('#758');
    for (const id of ['plastic-verdict', 'plastic-trace', 'plastic-curve', 'plastic-mechanism', 'plastic-user']) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
    await page.getByTestId('plastic-withheld-close').click();
    await expect(withheld).toHaveCount(0);
    await page.getByTestId('adv-close').click();
    await openStepsCatalog(page);
    await expandStepsCatalog(page);
    for (const id of ['plasticKinematic', 'plasticStatic']) {
      const row = page.getByTestId(`steps-withheld-${id}`);
      await expect(row).toContainText(/4[.,]6/);
      await expect(row).toHaveAttribute('role', 'alert');
      await expect(row.getByRole('link')).toHaveAttribute('href', 'https://github.com/lambdaclass/stabileo/issues/758');
      await expect(row.getByRole('link')).toContainText('#758');
      await expect(page.getByTestId(`steps-open-${id}`)).toBeDisabled();
    }
    const queries = await Promise.all(['plasticKinematic', 'plasticStatic'].map(async id =>
      [id, await page.getByTestId(`steps-method-${id}`).locator('.sc-name').innerText()] as const));
    await page.getByTestId('steps-catalog-back').click();
    for (const [id, title] of queries) {
      const search = page.getByTestId('adv-search');
      await search.fill(title);
      const hit = page.getByTestId(`adv-step-${id}`);
      await expect(hit).toBeVisible();
      await expect(hit).toBeDisabled();
      const box = await hit.boundingBox();
      if (!box) throw Error('Missing search result');
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page.getByTestId('steps-doc')).toHaveCount(0);
      await expect(page.getByTestId('plastic-verdict')).toHaveCount(0);
      await search.press('Enter');
      await expect(page.getByTestId('steps-doc')).toHaveCount(0);
      await expect(page.getByTestId('plastic-verdict')).toHaveCount(0);
      await expect(search).toHaveValue(title);
    }
    expect(errors).toEqual([]);
  });
});
