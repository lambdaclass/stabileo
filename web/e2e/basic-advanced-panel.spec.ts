/**
 * Basic's Advanced panel on a phone: the list in the bottom sheet, its closed groups, the
 * search with the on-screen keyboard and a function opened and left by touch, with nothing
 * wider than the screen and every target large enough to tap.
 */
import { test, expect, type Page } from './fixtures';
import { ADV_FUNCTIONS, ADV_GROUPS } from '../src/lib/advanced/catalog';
import { openAdvancedList, openStepsCatalog, expandStepsCatalog } from './advanced-panel';

async function boot(page: Page) {
  await page.addInitScript(() => localStorage.setItem('liveCalc', 'false'));
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 30_000 });
  await page.evaluate(() => window.__stabileoActions.loadExample('portal-second-order'));
}

/** Elements of the panel that reach past the screen's edges, and the page's own width. */
async function overflow(page: Page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-testid="basic-panel"]')!;
    const wide = [...panel.querySelectorAll<HTMLElement>('*')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1) && !el.closest('svg, .katex-display');
    }).slice(0, 5).map((el) => `${el.tagName}.${el.className}`);
    return { page: document.documentElement.scrollWidth, vw: window.innerWidth, wide };
  });
}

async function expectFits(page: Page) {
  const o = await overflow(page);
  expect(o.page, 'the page scrolls sideways').toBeLessThanOrEqual(o.vw + 1);
  expect(o.wide, 'elements past the screen').toEqual([]);
}

async function tallEnough(page: Page, selector: string) {
  const heights = await page.locator(selector).evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect().height));
  expect(heights.length, selector).toBeGreaterThan(0);
  for (const h of heights) expect(h, `${selector} is too small to tap`).toBeGreaterThanOrEqual(44);
}

for (const [label, viewport] of [['390×844', { width: 390, height: 844 }], ['360×740', { width: 360, height: 740 }], ['landscape 844×390', { width: 844, height: 390 }]] as const) {
  test.describe(`@smoke the Advanced panel on a phone, ${label}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('closed groups, a search for phi, and a function opened and left by touch', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await boot(page);
      await page.getByTestId('rb-cmd-advanced').tap();
      await expect(page.getByTestId('adv-launcher')).toBeVisible();
      for (const g of ADV_GROUPS) await expect(page.getByTestId(`adv-group-toggle-${g}`)).toHaveAttribute('aria-expanded', 'false');
      await tallEnough(page, '[data-testid^=adv-group-toggle-]');
      await expectFits(page);

      await page.getByTestId('adv-group-toggle-analysis').tap();
      await expect(page.getByTestId('adv-fn-buckling')).toBeVisible();
      await tallEnough(page, 'button[data-testid^=adv-fn-]');
      await expectFits(page);

      const search = page.getByTestId('adv-search');
      await search.tap();
      await page.keyboard.type('phi');
      await expect(page.getByTestId('adv-step-so-buckling-phi')).toBeVisible();
      const box = (await search.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(await search.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)), 'the phone zooms into a small search field').toBeGreaterThanOrEqual(16);
      await tallEnough(page, '[data-testid^=adv-step-]');
      await expectFits(page);

      await page.getByTestId('adv-search-clear').tap();
      await page.getByTestId('adv-fn-buckling').tap();
      await expect(page.getByTestId('adv-running')).toHaveAttribute('data-adv', 'buckling');
      await tallEnough(page, '[data-testid=adv-close]');
      await expectFits(page);
      await page.getByTestId('adv-close').tap();
      await expect(page.getByTestId('adv-launcher')).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}

test.describe('@smoke plane-only functions in a 3D workspace', () => {
  test('no list, search hit or step-by-step link starts one', async ({ page }) => {
    await boot(page);
    await page.getByTestId('rb-cmd-dim').click();
    await openAdvancedList(page);
    const planeOnly = ADV_FUNCTIONS.filter((f) => f.requires.plane);
    expect(planeOnly.map((f) => f.id)).toContain('influenceLine');

    await page.getByTestId('adv-search').fill('influence');
    await expect(page.getByTestId('adv-fn-influenceLine')).toBeDisabled();
    const steps = page.locator('[data-testid^=adv-step-]');
    for (let i = await steps.count(); i-- > 0;) {
      const id = (await steps.nth(i).getAttribute('data-testid'))!.slice('adv-step-'.length);
      if (planeOnly.some((f) => f.steps.includes(id))) await expect(steps.nth(i)).toBeDisabled();
    }
    await page.getByTestId('adv-search-clear').click();

    await openStepsCatalog(page);
    await expandStepsCatalog(page);
    for (const f of planeOnly) {
      for (const m of f.steps) await expect(page.getByTestId(`steps-function-${m}`), m).toHaveCount(0);
    }
  });
});
