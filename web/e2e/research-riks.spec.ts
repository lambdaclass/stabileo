import { test, expect } from '@playwright/test';

const route = '/en/research/benchmarks/riks-crisfield/';

test.describe('@smoke research riks-crisfield', () => {
  test('the native replay checks the truss limit and the rigid frame energy reference', async ({ page }) => {
    await page.goto(route);
    const app = page.locator('.rs-app');
    await expect(app).toHaveAttribute('data-case', 'von-mises-truss');
    await expect(app).toHaveAttribute('data-source', 'replay');
    await expect(app).toHaveAttribute('data-steps', '700');
    await expect(page.getByTestId('benchmark-headline')).toHaveText('Stabileo traces the snap-through: 3/3 checks within 5%');
    await expect(page.locator('.sfv canvas').first()).toBeVisible();

    await page.locator('#rs-tab-path').click();
    await expect(page.locator('#rs-panel-path svg path')).toHaveCount(2);
    await expect(page.locator('#rs-panel-path td.pass')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

    await page.locator('#rs-tab-parameters').click();
    await page.locator('#p-case').selectOption('shallow-toggle');
    await expect(app).toHaveAttribute('data-case', 'shallow-toggle');
    await expect(app).toHaveAttribute('data-steps', '100');
    await expect(page.getByTestId('benchmark-headline')).toHaveText('Frame energy reference: 1/1 checks pass');
    await page.locator('#rs-tab-path').click();
    await expect(page.locator('#rs-panel-path td.pass')).toHaveCount(1);
    await expect(page.locator('#rs-panel-path td.fail')).toHaveCount(0);
  });

  test('controls recompute through the production WASM wrapper', async ({ page }) => {
    await page.goto(`${route}?case=shallow-toggle&tab=parameters`);
    await page.locator('#p-rise').fill('0.04');
    await page.locator('#p-rise').blur();
    const app = page.locator('.rs-app');
    await expect(app).toHaveAttribute('data-source', 'live');
    await expect(app).toHaveAttribute('data-status', 'done', { timeout: 60_000 });
    await expect(app).toHaveAttribute('data-steps', '100');
    await expect(page.locator('.rs-status')).toContainText('Live run complete');
    await page.locator('#rs-tab-path').click();
    await expect(page.locator('#rs-panel-path svg path')).toHaveCount(2);
    await expect(page.locator('#rs-panel-path')).toContainText('total Newton iterations');
  });

  test('Open in Stabileo restores the shared model in the editor', async ({ page }) => {
    await page.goto(route);
    await expect(page.locator('.sfv canvas').first()).toBeVisible();
    await page.getByRole('button', { name: 'Open in the editor', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/basic#code=/);
    await page.goto(page.url().replace('#', '?e2e=1#'));
    await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
    const model = await page.evaluate(() => ({ nodes: window.__stabileo.nodeIds().length, elements: window.__stabileo.elementIds().length }));
    expect(model).toEqual({ nodes: 3, elements: 2 });
  });
});
