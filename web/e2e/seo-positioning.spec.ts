import { expect, test, type Locator, type Page } from '@playwright/test';
import { PUBLIC_LOCALES } from '../src/lib/i18n/offered';

for (const locale of PUBLIC_LOCALES) {
  for (const product of ['sap2000', 'etabs']) {
    for (const width of [360, 390, 810]) {
      test(`${locale} ${product} at ${width}px @smoke`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/${locale}/alternatives/${product}/`);
        await expect(page.locator('.standing h1')).toContainText(product.toUpperCase());
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://stabileo.com/${locale}/alternatives/${product}/`);
        await expect(page.locator('link[hreflang]')).toHaveCount(PUBLIC_LOCALES.length + 1);
        await expect(page.locator('.post-body')).toContainText('.s2k');
        await expect(page.locator('.post-body')).toContainText('.e2k');
        const issues = await page.locator('.comparison').evaluate((root) => {
          const problems: string[] = [];
          if (root.scrollWidth > root.clientWidth + 1) problems.push('horizontal overflow');
          for (const el of root.querySelectorAll<HTMLElement>('*')) {
            const rect = el.getBoundingClientRect();
            if (!rect.width || !rect.height || getComputedStyle(el).visibility === 'hidden') continue;
            if (el.matches('a, button, select') && (rect.width < 44 || rect.height < 44)) problems.push(`${el.className}: target ${rect.width}×${rect.height}`);
            if ([...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) && parseFloat(getComputedStyle(el).fontSize) < 12) problems.push(`${el.className}: small text`);
          }
          return problems;
        });
        expect(issues).toEqual([]);
      });
    }
  }
}

test('comparison try action opens the editor @smoke', async ({ page }) => {
  await page.goto('/en/alternatives/etabs/');
  await page.locator('.standing-cta a').click();
  await expect(page).toHaveURL(/\/app\/basic/);
});

test('public social images follow the page, including navigation back to the default @smoke', async ({ page }) => {
  await page.goto('/en/research/fracture/shauer-2025/');
  for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
    await expect(page.locator(selector)).toHaveAttribute('content', 'https://stabileo.com/research-thumbs/shauer-2025.webp');
  }
  await page.locator('.nav-brand').click();
  for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
    await expect(page.locator(selector)).toHaveAttribute('content', 'https://stabileo.com/og/stabileo-social.png');
  }
  const graph = await page.locator('script[data-page-meta][type="application/ld+json"]').textContent();
  const app = JSON.parse(graph!)['@graph'].find((node: { '@type': string }) => node['@type'] === 'SoftwareApplication');
  expect(app.offers.price).toBe(0);
  expect(graph).not.toContain('aggregateRating');
  await page.goto('/en/blog/how-stabileo-checks-its-results/');
  for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
    await expect(page.locator(selector)).toHaveAttribute('content', 'https://stabileo.com/og/blog/how-stabileo-checks-its-results.en.png');
  }
});

async function expectTouchLayout(root: Locator) {
  const issues = await root.evaluate((root) => {
    const problems: string[] = [];
    if (document.documentElement.scrollWidth > window.innerWidth + 1) problems.push('page horizontal overflow');
    if (root.scrollWidth > root.clientWidth + 1) problems.push('surface horizontal overflow');
    for (const el of root.querySelectorAll<HTMLElement>('*')) {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height || getComputedStyle(el).visibility === 'hidden') continue;
      if (el.matches('a, button, select, input, summary') && (rect.width < 44 || rect.height < 44)) problems.push(`${el.className}: target ${rect.width}×${rect.height}`);
      if ([...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) && parseFloat(getComputedStyle(el).fontSize) < 12) problems.push(`${el.className}: small text`);
    }
    return problems;
  });
  expect(issues).toEqual([]);
}

async function expectHeaderMenus(page: Page) {
  const header = page.locator('.site-header');
  await expect(header).toBeVisible();
  await expectTouchLayout(header);
  const toggle = header.locator('.nav-toggle');
  await expect(toggle).toBeInViewport();
  await toggle.click();
  await expect(header.locator('.nav-links')).toBeVisible();
  await expectTouchLayout(header);
  await toggle.click();
  await page.getByTestId('nav-lang-button').click();
  await expect(page.getByTestId('nav-lang-list')).toBeVisible();
  await expectTouchLayout(header);
  await page.keyboard.press('Escape');
}

for (const locale of PUBLIC_LOCALES) {
  for (const path of ['/', '/blog/', '/research/', '/research/fracture/shauer-2025/', '/research/metamaterials/grossman-2026/']) {
    for (const width of [390, 810]) {
      test(`${locale} ${path} shared navigation and touch controls at ${width}px @smoke`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/${locale}${path}`);
        await expectHeaderMenus(page);
        const footer = page.locator('.lp-footer');
        await expect(footer).toBeVisible();
        await expectTouchLayout(footer);
        if (path.includes('/research/') && path !== '/research/') {
          const pane = page.locator('.rs-shell-app');
          await expect(pane).toBeVisible();
          await expectTouchLayout(pane);
          // Visit each pane so hidden parameter controls are measured too.
          const tabs = pane.getByRole('tab');
          for (let i = 0; i < await tabs.count(); i++) {
            await tabs.nth(i).click();
            await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true');
            await expectTouchLayout(pane);
          }
        }
      });
    }
  }
}
