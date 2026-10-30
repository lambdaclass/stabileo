import { test as base, expect, type Page } from '@playwright/test';
import { type Locale } from '../src/lib/i18n/offered';
import { bootLanding } from './landing-helpers';
import { PRICING, OBSOLETE_PRICING } from './pricing-contract';

// Landing animations have wedged the shared CI browser on subsequent contexts.
// Each case owns a browser process; retain the configured launch/context options
// and always close it, including when an assertion fails.
const test = base.extend({
  page: async ({ playwright, browserName, launchOptions, contextOptions, baseURL }, use) => {
    const browser = await playwright[browserName].launch(launchOptions);
    try {
      const context = await browser.newContext({ ...contextOptions, baseURL });
      await use(await context.newPage());
    } finally {
      await browser.close();
    }
  },
});

async function expectResponsiveNavigation(page: Page, width: number) {
  const header = page.locator('.site-header');
  const toggle = header.locator('.nav-toggle');
  await expect(toggle).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(header.locator('.nav-links')).toBeVisible();
  for (const control of await header.locator('button:visible, a:visible').all()) {
    expect(await control.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
    const rect = await control.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect!.width).toBeGreaterThanOrEqual(44);
    expect(rect!.height).toBeGreaterThanOrEqual(44);
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
  }
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
}

export function landingPricingTests(locale: Locale) {
  test.describe('@smoke landing pricing and responsive layout', () => {
    for (const width of [360, 390, 810]) {
      test(`pricing for both audiences in ${locale} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await bootLanding(page, { locale });
        await expectResponsiveNavigation(page, width);
        const copy = PRICING[locale];
        const pricing = page.locator('section[data-section="pricing"]');
        await pricing.scrollIntoViewIfNeeded();
        await expect(pricing).toBeVisible();
        const table = pricing.locator('.model-table');
        await expect(table.locator('thead th:not(:first-child)')).toHaveText(copy.audiences);
        const rows = await table.locator('tbody tr').evaluateAll((trs) =>
          trs.map((tr) => [...tr.querySelectorAll('th,td')].map((c) => c.textContent?.trim() ?? '')),
        );
        const prices = [
          [copy.free, copy.free],
          [copy.free, copy.free],
          [`${copy.paid}*`, copy.free],
          [`${copy.atCost}**`, `${copy.atCost}**`],
          ['', copy.free],
        ];
        expect(rows).toEqual(copy.modules.map((mod, i) => [mod, ...prices[i]]));
        await expect(pricing.locator('.lead')).toHaveText(copy.intro);
        for (const [index, note] of copy.notes.entries()) {
          await expect(pricing.locator('.mode-note').nth(index)).toHaveText(`${'*'.repeat(index + 1)} ${note}`);
        }
        // Both AI cells reference the same note; every distinct reference must resolve.
        const inTable = await table.locator('.fn').allInnerTexts();
        const inNotes = await pricing.locator('.mode-note .fn').allInnerTexts();
        expect([...new Set(inTable)].sort()).toEqual(inNotes.sort());

        // Check internal overflow too: a scrollable wrapper can hide a whole
        // audience while the document itself still fits the viewport.
        await page.evaluate(() => document.fonts.ready);
        const layout = await pricing.evaluate((section) => {
          const wrap = section.querySelector('.model-table-wrap')!;
          const cells = [...section.querySelectorAll('.model-table th, .model-table td')];
          return {
            wrapperFits: wrap.scrollWidth <= wrap.clientWidth + 1,
            cellsFit: cells.every((cell) => {
              const rect = cell.getBoundingClientRect();
              return cell.scrollWidth <= cell.clientWidth + 1 && rect.left >= 0 && rect.right <= innerWidth;
            }),
            textSizes: [...section.querySelectorAll('.model-table th, .model-table td, .lead, .mode-note')].map(
              (th) => parseFloat(getComputedStyle(th).fontSize),
            ),
          };
        });
        expect(layout.wrapperFits).toBe(true);
        expect(layout.cellsFit).toBe(true);
        for (const size of layout.textSizes) expect(size).toBeGreaterThanOrEqual(12);

        await expect(page.locator('.landing .hero-meta dt').first()).toBeVisible();
        await expect(page.locator('.landing .footer-legal p').first()).toBeVisible();
        const badges = page.locator('.landing .badge-dev, .landing .eyebrow, .landing .tf-key, .landing .hero-meta dt, .landing .footer-legal p');
        expect(await badges.count()).toBeGreaterThan(0);
        for (const badge of await badges.all()) {
          await expect(badge).toBeVisible();
          const metrics = await badge.evaluate((el) => ({
            size: parseFloat(getComputedStyle(el).fontSize),
            fits: el.scrollWidth <= el.clientWidth + 1 &&
              el.getBoundingClientRect().left >= 0 && el.getBoundingClientRect().right <= innerWidth,
          }));
          expect(metrics.size).toBeGreaterThanOrEqual(12);
          expect(metrics.fits).toBe(true);
        }
        const overflow = await page.evaluate(() => ({
          document: document.documentElement.scrollWidth,
          landing: document.querySelector('.landing')!.scrollWidth,
          viewport: innerWidth,
        }));
        expect(overflow.document).toBeLessThanOrEqual(overflow.viewport + 1);
        expect(overflow.landing).toBeLessThanOrEqual(overflow.viewport + 1);
      });
      for (const route of ['sap2000-alternative', 'cirsoc']) {
        test(`${route} pricing and layout in ${locale} at ${width}px`, async ({ page }) => {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`/${locale}/${route}`);
          const article = page.locator('article.standing');
          await expect(article).toBeVisible();
          await expectResponsiveNavigation(page, width);
          // An independent policy contract: reverting either FAQ must fail.
          await expect(article.locator('.post-body > p').filter({ hasText: PRICING[locale].intro }))
            .toHaveText(PRICING[locale].intro);
          await expect(article).not.toContainText(OBSOLETE_PRICING[locale]);
          const metrics = await article.evaluate((el) => {
            const elements = [el, ...el.querySelectorAll<HTMLElement>('*')];
            return {
              smallText: elements.filter((node) => node.getClientRects().length > 0 &&
                [...node.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) &&
                parseFloat(getComputedStyle(node).fontSize) < 12).map((node) => node.outerHTML),
              overflow: elements.filter((node) => node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1)
                .map((node) => node.className),
            };
          });
          expect(metrics.smallText).toEqual([]);
          expect(metrics.overflow).toEqual([]);
          for (const control of await article.locator('button:visible, a:visible').all()) {
            const rect = await control.boundingBox();
            expect(rect).not.toBeNull();
            expect(rect!.width).toBeGreaterThanOrEqual(44);
            expect(rect!.height).toBeGreaterThanOrEqual(44);
            expect(rect!.x).toBeGreaterThanOrEqual(0);
            expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
        });
      }
    }
  });
}
