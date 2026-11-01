import { test, expect, loadModel } from './fixtures';

const census = (page: import('@playwright/test').Page) => page.evaluate(() => window.__stabileo.modelCensus());

test('@slow a shared model at the root restores behind the landing, as on main', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
  await loadModel(page, 'two-story-frame');
  const before = await census(page);
  expect(before.nodes).toBeGreaterThan(0);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByTestId('hdr-project').click();
  await page.getByTestId('project-share-link').click();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  const hash = url.slice(url.indexOf('#'));
  expect(hash).toMatch(/^#data=./);

  const recipient = await context.newPage();
  await recipient.goto(`/?e2e=1${hash}`);
  await recipient.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
  await expect.poll(() => census(recipient), { timeout: 30_000 }).toEqual(before);
  await expect(recipient).toHaveURL(/\/\?e2e=1$/);
  await expect(recipient.locator('.landing')).toBeVisible();
  await expect(recipient.locator('.landing .hero h1')).toBeVisible();
  await expect(recipient.locator('.app-container')).toHaveClass(/hidden-behind-landing/);
  await expect(recipient.locator('.site-header .nav-brand')).toHaveAttribute('aria-label', /.+/);

  await recipient.locator('.landing .hero-ctas .btn').first().click();
  await expect(recipient.locator('.landing')).toHaveCount(0);
  await expect(recipient.locator('.app-container')).not.toHaveClass(/hidden-behind-landing/);
  expect(await census(recipient)).toEqual(before);
});

test('@smoke a shared model reached by fragment navigation keeps the landing up', async ({ page }) => {
  await page.goto('/en/');
  await expect(page.locator('.landing .hero h1')).toBeVisible();
  await page.locator('.landing .hero-ctas .btn').first().click();
  await expect(page).toHaveURL(/\/app\/basic/);
  await expect(page.locator('.app-container')).toBeVisible({ timeout: 30_000 });
  await page.goBack();
  await expect(page.locator('.landing .hero h1')).toBeVisible();
  await page.evaluate(() => { location.hash = '#data=x'; });
  await page.waitForTimeout(300);
  await expect(page.locator('.landing .hero h1')).toBeVisible();
  await expect(page.locator('.app-container')).toHaveClass(/hidden-behind-landing/);
});

test('@smoke the landing brand scrolls to the top under a translated name; elsewhere it goes home', async ({ page }) => {
  await page.goto('/es/');
  const scroller = page.locator('#app .landing');
  await expect(scroller.locator('.hero h1')).toBeVisible();
  const brand = page.locator('#app .site-header .nav-brand');
  await expect(brand).toHaveAttribute('aria-label', 'Volver arriba');
  await expect(brand).toHaveAttribute('href', '/es/');
  await scroller.evaluate(el => el.scrollTo({ top: 1500, behavior: 'instant' }));
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(100);
  const entries = await page.evaluate(() => history.length);
  await brand.click();
  await expect.poll(() => scroller.evaluate(el => el.scrollTop), { timeout: 5_000 }).toBeLessThan(2);
  expect(await page.evaluate(() => history.length)).toBe(entries);
  await expect(page).toHaveURL(/\/es\/$/);

  await page.goto('/es/blog/');
  await expect(brand).not.toHaveAttribute('aria-label', /.*/);
  await expect(brand).toHaveAttribute('href', '/es/');
  await brand.click();
  await expect(page).toHaveURL(/\/es\/$/);
  await expect(brand).toHaveAttribute('aria-label', 'Volver arriba');
});

test('@smoke the editor keeps native scroll restoration; public pages take it over', async ({ page }) => {
  await page.goto('/en/');
  await expect(page.locator('.landing .hero h1')).toBeVisible();
  await expect.poll(() => page.evaluate(() => history.scrollRestoration)).toBe('manual');
  await page.locator('.landing .hero-ctas .btn').first().click();
  await expect(page.locator('.app-container')).toBeVisible();
  await expect.poll(() => page.evaluate(() => history.scrollRestoration)).toBe('auto');
  await page.goBack();
  await expect(page.locator('.landing .hero h1')).toBeVisible();
  await expect.poll(() => page.evaluate(() => history.scrollRestoration)).toBe('manual');

  await page.goto('/app/basic');
  await expect(page.locator('.app-container')).toBeVisible();
  await expect.poll(() => page.evaluate(() => history.scrollRestoration)).toBe('auto');
});
