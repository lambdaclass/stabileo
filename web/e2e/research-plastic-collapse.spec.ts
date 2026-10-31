import { test, expect, type Page } from '@playwright/test';

const route = (locale: string) => `/${locale}/research/benchmarks/plastic-collapse/`;
const VIEWPORTS = [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 810, height: 1080 }];

async function checkLayout(page: Page, viewport: { width: number; height: number }) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('.portal').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  const canvas = await page.locator('.rs-viewer-host canvas').first().evaluate(el => {
    const r = el.getBoundingClientRect();
    return { top: r.top + scrollY, height: r.height };
  });
  expect(canvas.height).toBeGreaterThan(0);
  expect(canvas.top + Math.min(canvas.height, 120)).toBeLessThanOrEqual(viewport.height);
  for (const control of await page.locator('.rs-shell-app button:not(.cam-backdrop), .rs-shell-app input').all()) {
    if (!await control.isVisible()) continue;
    const size = (await control.boundingBox())!;
    expect(size.height).toBeGreaterThanOrEqual(44);
    expect(size.width).toBeGreaterThanOrEqual(44);
  }
  const small = await page.locator('.rs-shell').evaluate(el => [...el.querySelectorAll('*')]
    .filter(e => [...e.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) && e.getBoundingClientRect().height > 0)
    .filter(e => parseFloat(getComputedStyle(e).fontSize) < 12).map(e => e.textContent));
  expect(small).toEqual([]);
}

test.describe('@smoke plastic collapse', () => {
  for (const viewport of VIEWPORTS) {
    test(`live result, hinge events and checks at ${viewport.width}×${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(route('en'));
      await expect(page.getByRole('heading', { name: 'Classic plastic collapse', exact: true })).toBeVisible();
      await expect(page.getByText('First version · 2 review rounds', { exact: true })).toBeVisible();
      await expect(page.getByTestId('source')).toHaveText('Live computation');
      await expect(page.getByText('6 of 6 checks pass')).toBeVisible();
      await expect(page.getByText('Against the hand calculation')).toBeVisible();
      await expect(page.getByText('reproduction of')).toHaveCount(0);
      await expect(page.getByText('full text was not accessible')).toHaveCount(0);
      await expect(page.getByTestId('model')).toContainText('Span L = 4 m, height h = 3 m, uniform Mp = 100 kN·m');
      await expect(page.getByTestId('collapse-factor')).toHaveText('Stabileo λ = 85.714286');
      await expect(page.getByTestId('bound-row')).toHaveText([/Beam100\.000000-14\.285714/, /Sway133\.333333-47\.619048/, /Combined85\.7142860\.000000/]);
      await expect(page.getByTestId('event-row')).toHaveText([
        '1Right roof corner74.600718-100.000', '2Midspan77.067680100.000', '3Right base77.787654100.000', '4Left base85.714286100.000',
      ]);
      await expect(page.getByTestId('node-row')).toHaveText([
        '1 · Left base0.0000000.000000', '2 · Left roof corner0.018214-0.000011', '3 · Right roof corner0.018201-0.000015',
        '4 · Right base0.0000000.000000', '5 · Midspan0.018208-0.020963',
      ]);
      await expect(page.locator('[data-testid="check"][data-passed="true"]')).toHaveCount(6);
      await expect(page.getByText('42.857143 kN·m')).toBeVisible();
      await expect(page.locator('.rs-viewer-host canvas').first()).toBeVisible();
      await expect(page.locator('.axis-gizmo')).toBeHidden();
      await checkLayout(page, viewport);

      const slider = page.getByRole('slider');
      await slider.focus();
      await page.keyboard.press('Home');
      await expect(slider).toHaveValue('0');
      await expect(page.getByTestId('frame-lambda')).toHaveText('λ = 74.600718');
      await expect(page.getByTestId('node-row').nth(1)).toHaveText('2 · Left roof corner0.006494-0.000008');
      const run = page.getByRole('button', { name: 'Recompute live', exact: true });
      await run.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('status')).toHaveText('Live computation');
      await expect(slider).toHaveValue('3');
      await page.getByRole('button', { name: 'Restart', exact: true }).click();
      await expect(page.getByTestId('source')).toHaveText('Live computation');
      await page.getByRole('button', { name: 'Stop', exact: true }).click();
      await expect(page.getByRole('alert')).toHaveCount(0);
    });
  }

  for (const [locale, title, meta, run, lambda, place] of [
    ['en', 'Classic plastic collapse', 'Classic plastic collapse', 'Recompute live', '85.714286', 'Midspan'],
    ['es', 'Colapso plástico clásico', 'Colapso plástico clásico', 'Recalcular en vivo', '85,714286', 'Centro de la viga'],
    ['pt', 'Colapso plástico clássico', 'Colapso plástico clássico', 'Recalcular ao vivo', '85,714286', 'Meio da viga'],
    ['de', 'Klassischer plastischer Kollaps', 'Klassischer plastischer Kollaps', 'Live neu berechnen', '85,714286', 'Feldmitte'],
    ['fr', 'Effondrement plastique classique', 'Effondrement plastique classique', 'Recalculer en direct', '85,714286', 'Mi-portée'],
    ['tr', 'Klasik plastik göçme', 'Klasik plastik göçme', 'Canlı yeniden hesapla', '85,714286', 'Açıklık ortası'],
  ]) {
    for (const viewport of [VIEWPORTS[1], VIEWPORTS[2]]) {
      test(`translated page and layout: ${locale} at ${viewport.width}×${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(route(locale));
        await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
        await expect(page.locator('h1')).toHaveAttribute('lang', locale);
        await expect(page).toHaveTitle(new RegExp(meta));
        await expect(page.getByTestId('collapse-factor')).toContainText(lambda);
        await expect(page.getByTestId('event-row').nth(1)).toContainText(place);
        await expect(page.getByRole('button', { name: run, exact: true })).toBeEnabled();
        await expect(page.locator('[data-testid="check"][data-passed="true"]')).toHaveCount(6);
        await expect(page.locator('.rs-viewer-host canvas').first()).toBeVisible();
        await checkLayout(page, viewport);
      });
    }
  }
});
