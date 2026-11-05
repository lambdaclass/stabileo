import { test, expect, type Page } from '@playwright/test';

async function scrolled(page: Page) {
  return page.evaluate(() => Math.max(window.scrollY, document.querySelector<HTMLElement>('#app .landing')?.scrollTop ?? 0));
}

async function scrollDown(page: Page) {
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#app .landing')?.scrollTo({ top: 1500, behavior: 'instant' });
    window.scrollTo({ top: 1500, behavior: 'instant' });
  });
  await expect.poll(() => scrolled(page)).toBeGreaterThan(300);
}

for (const [width, height] of [[390, 844], [820, 1180], [1440, 900]] as const) {
  test(`@smoke a public page opens at its top after landing, Research, a paper and back at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/en/');
    await expect(page.locator('#app .landing h1')).toBeVisible();
    await scrollDown(page);

    const header = page.locator('#app .site-header');
    if (await header.locator('.nav-toggle').isVisible()) await header.locator('.nav-toggle').click();
    await header.locator('[data-nav="research"]').click();
    await expect(page).toHaveURL(/\/en\/research\/?$/);
    await expect(page.locator('#app .landing .rs-g-runcard').first()).toBeVisible();
    await expect.poll(() => scrolled(page)).toBe(0);

    await scrollDown(page);
    const paper = page.locator('#app .landing .rs-g-runcard h3 a').first();
    const href = await paper.getAttribute('href');
    await paper.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.locator('#app .landing .rs-g-runcard')).toHaveCount(0);
    await expect.poll(() => scrolled(page)).toBe(0);

    await scrollDown(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/en\/research\/?$/);
    await expect(page.locator('#app .landing .rs-g-runcard').first()).toBeVisible();
    await expect.poll(() => scrolled(page)).toBe(0);
  });
}
