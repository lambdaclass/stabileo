import { test, expect, type Page } from './fixtures';

const MODULES = (process.env.COURSE_MODULES ?? 'statics,influence,second,plastic,dynamics').split(',');

async function boot(page: Page, width: number, example: string) {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 1180 });
  await page.addInitScript(() => localStorage.setItem('liveCalc', 'false'));
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
  await page.evaluate((n) => window.__stabileoActions.loadExample(n), example);
  await page.getByTestId('rb-cmd-advanced').click();
}

async function noOverflow(page: Page, testId: string, shot: string) {
  const panel = page.getByTestId(testId).first();
  await expect(panel).toBeVisible();
  await panel.scrollIntoViewIfNeeded();
  const m = await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
    const wide = [...el.querySelectorAll<HTMLElement>('*')].filter((c) => {
      const r = c.getBoundingClientRect();
      return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1) && getComputedStyle(c).position !== 'fixed' && !c.closest('[style*="overflow"], .katex-display, svg');
    }).slice(0, 5).map((c) => `${c.tagName}.${c.className}:${Math.round(c.getBoundingClientRect().right)}`);
    return { doc: document.documentElement.scrollWidth, vw: window.innerWidth, wide };
  }, testId);
  await page.screenshot({ path: `test-results/vp-${shot}.png` });
  expect(m.doc, `${shot}: page wider than the viewport`).toBeLessThanOrEqual(m.vw + 1);
  expect(m.wide, `${shot}: elements past the viewport`).toEqual([]);
}

for (const width of [390, 820]) {
  test.describe(`course panels at ${width} px`, () => {
    test('force method wizard and the explained catalog', async ({ page }) => {
      test.skip(!MODULES.includes('statics'));
      test.setTimeout(120_000);
      await boot(page, width, 'continuous-beam');
      await page.getByTestId('adv-steps').click();
      await page.getByTestId('steps-open-fm').click();
      await noOverflow(page, 'fm-wizard', `${width}-fm`);
    });
    test('influence line panel and load states', async ({ page }) => {
      test.skip(!MODULES.includes('influence'));
      test.setTimeout(120_000);
      await boot(page, width, 'continuous-beam');
      await page.locator('button.adv-btn', { hasText: /^Influence line$/ }).click();
      await noOverflow(page, 'il-panel', `${width}-il`);
      await page.getByTestId('adv-close').click();
      await page.getByTestId('adv-load-states').click();
      await noOverflow(page, 'load-states-il', `${width}-states`);
    });
    test('second-order options', async ({ page }) => {
      test.skip(!MODULES.includes('second'));
      test.setTimeout(120_000);
      await boot(page, width, 'portal-second-order');
      await page.getByTestId('so-options-toggle').click();
      await noOverflow(page, 'so-method', `${width}-so`);
    });
    test('plastic collapse panel', async ({ page }) => {
      test.skip(!MODULES.includes('plastic'));
      test.setTimeout(120_000);
      await boot(page, width, 'portal-frame');
      await page.locator('button.adv-btn', { hasText: /Plastic collapse|Colapso plástico/ }).click();
      const withheld = page.getByTestId('plastic-withheld');
      await expect(withheld).toContainText(/4[.,]6/);
      await expect(withheld.locator('a')).toHaveAttribute('href', 'https://github.com/lambdaclass/stabileo/issues/758');
      await expect(page.getByTestId('plastic-verdict')).toHaveCount(0);
      const box = (await withheld.boundingBox())!;
      expect(box.height, `${width}: the refusal is an empty panel`).toBeGreaterThan(40);
      const link = (await withheld.locator('a').boundingBox())!;
      expect(link.height, `${width}: the #758 link is too small to tap`).toBeGreaterThanOrEqual(24);
      await noOverflow(page, 'plastic-withheld', `${width}-plastic`);
    });
    test('dynamics course panel', async ({ page }) => {
      test.skip(!MODULES.includes('dynamics'));
      test.setTimeout(120_000);
      await boot(page, width, 'dynamics-column-mass');
      await page.getByRole('button', { name: /^(Dynamic|Dinámico|Dinâmico)$/ }).first().click();
      await page.getByTestId('dyn-sdof-toggle').click();
      await noOverflow(page, 'dynamics-course', `${width}-dyn`);
    });
  });
}
