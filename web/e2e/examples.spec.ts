import { test, expect, type Page } from '@playwright/test';
import { EXAMPLE_IDS } from '../src/components/examples/ids';

const value = async (page: Page, testId: string) => Number(await page.getByTestId(testId).getAttribute('data-value'));
const near = (actual: number, expected: number, relative: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(relative * Math.abs(expected));
const pageOverflow = (page: Page) => page.evaluate(() => [...document.querySelectorAll('main *')].filter(el => {
  for (let parent = el.parentElement; parent && parent.tagName !== 'MAIN'; parent = parent.parentElement) if (getComputedStyle(parent).overflowX !== 'visible') return false;
  const box = el.getBoundingClientRect();
  return box.width > 0 && (box.right > innerWidth + 1 || box.left < -1);
}).map(el => `${el.tagName.toLowerCase()}.${el.className}`));

test('@smoke examples gallery: a slider re-solves, and the share link and editor carry the model', async ({ page, request }) => {
  const html = await (await request.get('/en/examples/')).text();
  expect(html).toContain('id="prerender"');
  for (const id of EXAMPLE_IDS) expect(html).toContain(`/en/examples/${id}/`);
  await page.goto('/en/?e2e=1');
  await page.locator('.hero').getByRole('link', { name: /Examples/ }).click();
  await expect(page).toHaveURL(/\/en\/examples\/?/);
  await expect(page.getByTestId('card-beam-frame')).toBeVisible();
  await page.getByTestId('card-beam-frame').getByRole('heading').getByRole('link').click();
  await expect(page).toHaveURL(/\/en\/examples\/beam-frame\/?(\?|$)/);
  await expect(page.getByTestId('readout-maxMoment')).toBeVisible();
  near(await value(page, 'readout-maxMoment'), 45, 1e-9);
  await expect(page.getByTestId('certificate')).toHaveAttribute('data-status', 'certified');

  await page.getByTestId('param-span').fill('8');
  await expect(page.getByTestId('value-span')).toHaveText('8');
  await expect.poll(() => value(page, 'readout-maxMoment')).toBeCloseTo(80, 6);
  near(await value(page, 'reference-maxMoment'), 80, 1e-12);
  const share = await page.getByTestId('share-link').getAttribute('href');
  expect(share).toMatch(/\/en\/examples\/beam-frame\/?\?span=8$/);
  expect(new URL(page.url()).searchParams.get('span')).toBe('8');

  const shared = new URL(share!);
  await page.goto(`${shared.pathname}${shared.search}&e2e=1`);
  await expect(page.getByTestId('value-span')).toHaveText('8');
  await expect.poll(() => value(page, 'readout-maxMoment')).toBeCloseTo(80, 6);

  await page.getByTestId('open-editor').click();
  await expect(page).toHaveURL(/\/app\/basic\?e2e=1#data=2\./);
  await expect.poll(() => page.evaluate(() => (window as any).__stabileo?.memberAxialForces()?.length ?? 0), { timeout: 60000 }).toBe(2); // slow-ok: The editor initializes WASM and solves the shared example model before publishing member forces.
  const nodes = await page.evaluate(() => (window as any).__stabileo.entityData('node', 3));
  expect(nodes.x).toBe(8);
});

test('@smoke examples report the engine refusing a model with no load', async ({ page }) => {
  await page.goto('/en/examples/beam-frame/?load=0&e2e=1');
  await expect(page.getByTestId('refusal')).toBeVisible();
  await expect(page.getByTestId('readout-maxMoment')).toHaveCount(0);
});

for (const id of EXAMPLE_IDS) test(`@smoke example ${id} solves in the browser`, async ({ page }) => {
  await page.goto(`/en/examples/${id}/?e2e=1`);
  await expect(page.getByTestId('certificate')).toHaveAttribute('data-status', 'certified', { timeout: 30000 });
  await expect(page.locator('.ex-viewer canvas').first()).toBeVisible();
});

for (const [width, height] of [[360, 800], [390, 844], [844, 390], [810, 1080], [1440, 900]]) {
  for (const id of EXAMPLE_IDS) test(`@smoke example ${id} at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`/en/examples/${id}/?e2e=1`);
    await expect(page.getByTestId('certificate')).toBeVisible({ timeout: 30000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await pageOverflow(page)).toEqual([]);
    expect((await page.locator('.ex-viewer').boundingBox())!.y).toBeLessThan(height <= 400 ? height - 120 : 450);
    for (const control of await page.locator('main input, main select, main button, main a').all()) {
      if (!await control.isVisible()) continue;
      const box = (await control.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(await control.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
    }
  });
}

for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) test(`@smoke examples index in ${locale}`, async ({ page }) => {
  await page.goto(`/${locale}/examples/`);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.ex-card')).toHaveCount(EXAMPLE_IDS.length);
  await expect(page.locator('.site-header [data-nav="examples"]')).toBeVisible();
  expect(await page.title()).toContain('Stabileo');
  if (locale !== 'en') expect(await page.locator('h1').textContent()).not.toBe('Live structural examples');
});
