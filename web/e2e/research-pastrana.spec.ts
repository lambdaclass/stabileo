import { PUBLIC_LOCALES } from '../src/lib/i18n/offered';
import { test, expect } from '@playwright/test';

for (const locale of PUBLIC_LOCALES) for (const viewport of [{ width: 360, height: 780 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 810, height: 1080 }]) {
  test(`@smoke four-cable form at ${locale} ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/${locale}/research/form-finding/pastrana-2026?e2e=1`);
    await expect(page.locator('.rs-viewer-host canvas').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const app = await page.locator('.form-app').boundingBox();
    const article = await page.locator('.rs-shell-article').boundingBox();
    expect(app!.y).toBeLessThan(article!.y);
    expect((await page.locator('.rs-viewer-host').boundingBox())!.y).toBeLessThan(320);
    for (const button of await page.locator('.form-app button, .form-app input').all()) {
      const box = await button.boundingBox();
      if (box) { expect(box.height).toBeGreaterThanOrEqual(44); expect(box.width).toBeGreaterThanOrEqual(44); }
    }
    const small = await page.locator('.form-app').evaluate(el => [...el.querySelectorAll('*')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent?.trim()) && e.getClientRects().length).filter(e => parseFloat(getComputedStyle(e).fontSize) < 12).map(e => e.tagName));
    expect(small).toEqual([]);
    if (locale !== 'en') return;
    await expect(page.getByRole('heading', { name: 'Four cables, one equilibrium' })).toBeVisible();
    await expect(page.getByTestId('form-result')).toContainText('3.000 kN');
    await page.getByRole('textbox', { name: 'Force density (kN/m)', exact: true }).fill('2');
    await page.getByRole('button', { name: 'Recompute live' }).click();
    await expect(page.getByTestId('form-source')).toHaveText('Live Rust computation');
    await expect(page.getByTestId('form-result')).toContainText('−0.500 m');
    await expect(page.getByTestId('form-result')).toContainText('5.745 kN');
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Edit in Stabileo', exact: true }).click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(/app\/basic\?e2e=1#data=2\./);
    type Hooks = { hasDrawnResults(): boolean; nodePos(id: number): { x: number; y: number; z: number } };
    await expect.poll(() => popup.evaluate(() => (window as unknown as { __stabileo?: Hooks }).__stabileo?.hasDrawnResults()), { timeout: 60000 }).toBe(true); // slow-ok: The editor initializes WASM and solves the imported cable model before drawing results.
    const center = await popup.evaluate(() => (window as unknown as { __stabileo: Hooks }).__stabileo.nodePos(1));
    expect(center.z).toBeCloseTo(-0.5, 12);
    await popup.close();
    await page.getByRole('button', { name: 'Restart', exact: true }).click();
    await expect(page.getByTestId('form-source')).toContainText('Precomputed replay');
  });
}

test('recovery, restart, accessible output and failed recomputation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en/research/form-finding/pastrana-2026?e2e=1');
  await expect(page.getByRole('img', { name: 'Projection of our four-cable equilibrium result' })).toBeVisible();
  const density = page.getByRole('textbox', { name: 'Force density (kN/m)', exact: true });
  await density.fill('0');
  await expect(density).toHaveAttribute('aria-invalid', 'true');
  await expect(density).toHaveAttribute('aria-describedby', 'form-density-hint');
  await expect(page.getByRole('button', { name: 'Recompute live' })).toBeDisabled();
  await density.fill('2');
  await page.getByRole('button', { name: 'Recompute live' }).click();
  await expect(page.locator('[role=status][aria-live=polite]')).toContainText('5.745 kN');
  const previous = await page.getByTestId('form-result').innerText();
  await page.route('**/research-wasm/pastrana-2026/**', route => route.abort());
  await density.fill('1');
  await page.getByRole('button', { name: 'Recompute live' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.getByTestId('form-result').innerText()).toBe(previous);
  await expect(page.getByTestId('form-source')).toHaveText('Live Rust computation');
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.getByRole('slider').fill('12');
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(page.getByRole('slider')).toHaveValue('0');
  await expect(page.getByRole('slider')).toHaveAttribute('aria-valuetext', '1 / 25');
});
