import { test, expect, type Page } from '@playwright/test';

const route = (locale: string) => `/${locale}/research/benchmarks/cqc-1981/`;

async function checkLayout(page: Page, viewport: { width: number; height: number }) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('.cqc-app').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  const viewer = await page.locator('.rs-viewer-host').evaluate(el => el.getBoundingClientRect().top + scrollY);
  expect(viewer).toBeLessThan(viewport.height);
  for (const control of await page.locator('.rs-shell-app button:not(.cam-backdrop), .rs-shell-app select, .rs-shell-app input').all()) {
    if (!await control.isVisible()) continue;
    const size = await control.boundingBox();
    expect(size!.height).toBeGreaterThanOrEqual(44);
    expect(size!.width).toBeGreaterThanOrEqual(44);
  }
  const small = await page.locator('.rs-shell-app').evaluate(el => [...el.querySelectorAll('*')]
    .filter(e => [...e.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) && e.getBoundingClientRect().height > 0)
    .filter(e => parseFloat(getComputedStyle(e).fontSize) < 12).map(e => e.textContent));
  expect(small).toEqual([]);
}

test.describe('@smoke CQC first version', () => {
  for (const viewport of [{ width: 360, height: 900 }, { width: 390, height: 900 }, { width: 844, height: 390 }, { width: 810, height: 1080 }]) {
    test(`replay and production WASM agree at ${viewport.width}×${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(route('en'));
      await expect(page.getByTestId('cqc-stage')).toHaveText('First version · 2 review rounds');
      await expect(page.getByText('9 of 9 checks pass')).toBeVisible();
      await expect(page.getByText('reproduction of')).toHaveCount(0);
      await expect(page.getByTestId('result-CQC')).toHaveText('17.549732');
      await expect(page.locator('.rs-viewer-host canvas').first()).toBeVisible();
      await checkLayout(page, viewport);
      const run = page.getByRole('button', { name: 'Recompute live' });
      await run.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('cqc-source')).toHaveText('Live result (production WASM)', { timeout: 60000 }); // slow-ok: The production WASM response-spectrum solve must finish before comparing CQC and SRSS.
      await expect(page.getByRole('status')).toHaveText('Live result (production WASM)');
      await expect(page.getByTestId('result-SRSS')).toHaveText('14.387571');
      await expect(page.getByTestId('result-CQC')).toHaveText('17.549732');
      for (const [id, value] of [['roof-5-SRSS', '10.676457'], ['roof-5-CQC', '10.311059'], ['roof-6-SRSS', '7.355556'], ['roof-6-CQC', '7.859579'], ['modal-0', '1.605897989'], ['modal-1', '1.766467727'], ['modal-2', '0.523274863'], ['cqc-deficit', '−18.02']]) {
        await expect(page.getByTestId(id)).toHaveText(value);
      }
      await checkLayout(page, viewport);
      const slider = page.getByRole('slider');
      await slider.focus();
      await page.keyboard.press('Home');
      await expect(slider).toHaveValue('0');
      const restart = page.getByRole('button', { name: 'Restart', exact: true });
      await restart.focus();
      await page.keyboard.press('Space');
      await expect(page.getByTestId('cqc-source')).toHaveText('Precomputed replay (same solver)');
      await expect(slider).toHaveValue('30');
      await page.getByRole('button', { name: 'Stop', exact: true }).click();
    });
  }

  for (const [locale, title, meta, run, cqc] of [
    ['en', 'Closely spaced modes: SRSS vs CQC', 'SRSS vs CQC (1981)', 'Recompute live', '17.549732'],
    ['es', 'Modos próximos: SRSS y CQC', 'SRSS y CQC (1981)', 'Recalcular en vivo', '17,549732'],
    ['pt', 'Modos próximos: SRSS e CQC', 'SRSS e CQC (1981)', 'Recalcular ao vivo', '17,549732'],
    ['de', 'Eng benachbarte Eigenformen: SRSS und CQC', 'SRSS und CQC (1981)', 'Live neu berechnen', '17,549732'],
    ['fr', 'Modes rapprochés : SRSS et CQC', 'SRSS et CQC (1981)', 'Recalculer en direct', '17,549732'],
    ['tr', 'Birbirine yakın modlar: SRSS ve CQC', 'SRSS ve CQC (1981)', 'Canlı yeniden hesapla', '17,549732'],
  ]) test(`translated page, metadata and layout: ${locale}`, async ({ page }) => {
    const viewport = { width: 390, height: 844 };
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(route(locale));
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
    await expect(page.locator('h1')).toHaveAttribute('lang', locale);
    await expect(page).toHaveTitle(new RegExp(meta.replace(/[()]/g, '\\$&')));
    await expect(page.getByTestId('result-CQC')).toHaveText(cqc);
    await expect(page.getByRole('button', { name: run, exact: true })).toBeEnabled();
    await expect(page.locator('.rs-viewer-host canvas').first()).toBeVisible();
    await checkLayout(page, viewport);
  });
});
