import { test, expect } from '@playwright/test';
import { BATCH_IDS } from '../src/components/tools/batch';
import { TOOL_IDS, formula, format, workedExamples } from '../src/components/tools/calculators';

for (const id of TOOL_IDS) test(`@smoke tools ${id} computes and opens the same model`, async ({ page, request }) => {
  const html = await (await request.get(`/en/tools/${id}/`)).text();
  expect(html).toContain('id="prerender"');
  for (const p of workedExamples(id)) expect(html).toContain(`data-value="${format(formula(id, p).value)}"`);
  await page.goto(`/en/tools/${id}/?e2e=1`);
  const agreement = page.getByTestId('agreement');
  await expect(agreement).toBeVisible();
  expect(Number(await agreement.getAttribute('data-difference'))).toBeLessThan(id === 'column-buckling' ? 3e-6 : 1e-9);
  await expect(page.getByTestId('worked-example')).toHaveCount(workedExamples(id).length);
  for (const [j, p] of workedExamples(id).entries()) await expect(page.getByTestId('worked-example').nth(j)).toHaveAttribute('data-value', format(formula(id, p).value));
  const before = await page.getByTestId('engine-value').textContent();
  await page.getByTestId('e').fill('100000');
  await expect(agreement).toHaveCount(0);
  await expect(page.getByTestId('engine-value')).not.toHaveText(before!);
  await expect(agreement).toBeVisible();
  const expectedMembers = id === 'column-buckling' ? 32 : id === 'cantilever-beam' ? 1 : 2;
  await page.getByRole('link', { name: /^Open in Stabileo/ }).click();
  await expect(page).toHaveURL(/\/app\/basic\?e2e=1#data=2\./);
  await expect.poll(() => page.evaluate(() => (window as any).__stabileo?.memberAxialForces()?.length ?? 0), { timeout: 60000 }).toBe(expectedMembers);
  const materials = await page.evaluate(() => (window as any).__stabileo.entityData('setting', 'materials'));
  expect(materials[0][1].e).toBe(100000);
  const section = await page.evaluate(() => (window as any).__stabileo.entityData('section', 1));
  expect(section.iz).toBe(0.00008);
});

for (const [width, height] of [[360, 800], [390, 844], [844, 390], [810, 1080]]) {
  for (const id of [...TOOL_IDS, ...BATCH_IDS]) test(`@smoke tools ${id} at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`/en/tools/${id}/?e2e=1`);
    await expect(page.getByTestId('agreement')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await page.locator('.tool-viewer').boundingBox())!.y).toBeLessThan(height <= 400 ? height - 40 : 450);
    if (width < 1120) {
      const title = (await page.locator('h1').boundingBox())!;
      const viewer = (await page.locator('.tool-viewer').boundingBox())!;
      const form = (await page.locator('form').boundingBox())!;
      expect(viewer.y).toBeGreaterThan(title.y + title.height);
      expect(form.y).toBeGreaterThan(viewer.y + viewer.height);
    }
    for (const control of await page.locator('main input, main textarea, main select, main button, .open-editor').all()) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await control.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
    }
  });
}
for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) test(`@smoke tools localized index ${locale}`, async ({ page }) => {
  await page.goto(`/${locale}/tools/`);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.tool-card h2 a')).toHaveCount(8);
  await expect(page.locator('.tool-card')).toHaveCount(8);
  await expect(page.locator('nav [data-nav="tools"]')).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://stabileo.com/${locale}/tools/`);
  for (const lang of ['en', 'es', 'pt', 'de', 'fr', 'tr']) await expect(page.locator(`link[hreflang="${lang}"]`)).toHaveAttribute('href', `https://stabileo.com/${lang}/tools/`);
});

for (const id of BATCH_IDS) test(`@smoke tools ${id} prerender and editor handoff`, async ({ page, request }) => {
  const html = await (await request.get(`/en/tools/${id}/`)).text();
  expect(html).toContain('id="prerender"');
  await page.goto(`/en/tools/${id}/?e2e=1`);
  await expect(page.getByTestId('agreement')).toBeVisible();
  expect(Number(await page.getByTestId('agreement').getAttribute('data-difference'))).toBeLessThan(id === 'portal-frame' ? .002 : .00002);
  await page.getByTestId('e').fill('100000');
  await expect(page.getByTestId('agreement')).toBeVisible();
  await page.getByRole('link', { name: /^Open in Stabileo/ }).click();
  await expect(page).toHaveURL(/\/app\/basic\?e2e=1#data=2\./);
  await expect.poll(() => page.evaluate(() => (window as any).__stabileo?.memberAxialForces()?.length ?? 0), { timeout: 60000 }).toBeGreaterThan(0);
  const materials = await page.evaluate(() => (window as any).__stabileo.entityData('setting', 'materials'));
  expect(materials[0][1].e).toBe(100000);
});

// Exercise Root's in-place lazy mount separately from the ordinary full-document links.
test('@smoke tools shared model survives a client-side editor transition', async ({ page }) => {
  await page.goto('/en/tools/continuous-beam/?e2e=1');
  const link = page.getByRole('link', { name: /^Open in Stabileo/ });
  await expect(link).toHaveAttribute('href', /#data=2\./);
  const origin = await page.evaluate(() => performance.timeOrigin);
  await page.evaluate(href => {
    history.pushState(null, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, (await link.getAttribute('href'))!);
  await expect.poll(() => page.evaluate(() => (window as any).__stabileo?.memberAxialForces()?.length ?? 0)).toBeGreaterThan(0);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  await expect(page.locator('canvas').first()).toBeVisible();
});
