import { test, expect } from '@playwright/test';

test('MBB replay, both filters and live solve @smoke', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en/research/optimization/andreassen-2011/');
  await expect(page.getByRole('heading', { name: 'Topology optimization of an MBB beam' })).toBeVisible();
  await expect(page.getByText('Research, not a design tool. Nothing here is an engineering result.', { exact: true })).toBeVisible();
  await expect(page.getByText(/Compliance: 216\.8137/)).toBeVisible();
  await expect(page.locator('.rs-viewer-host canvas').first()).toBeVisible();
  await page.getByRole('button', { name: 'Convergence', exact: true }).click();
  await expect(page.getByText('Authors’ reference · Stabileo', { exact: true })).toBeVisible();
  await page.getByLabel('Filter', { exact: true }).selectOption('2');
  await page.getByRole('button', { name: 'Recompute live' }).click();
  await expect(page.getByText('Cached result', { exact: true })).toBeVisible({ timeout: 120000 }); // slow-ok: The topology-optimization worker completes the density-filter MBB iterations.
  await expect(page.getByText(/Compliance: 233\.7146/)).toBeVisible();
  await page.getByLabel('Horizontal elements', { exact: true }).fill('100000');
  await expect(page.getByRole('button', { name: 'Recompute live' })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('Invalid');
});

const route = '/en/research/optimization/andreassen-2011/';

test('reference loading cannot interrupt a live run', async ({ page }) => {
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let sawReference!: () => void;
  const requested = new Promise<void>(resolve => { sawReference = resolve; });
  await page.route('**/andreassen-2011/*/ft1.json', async request => { sawReference(); await blocked; await request.continue(); });
  await page.goto(route);
  await requested;
  await expect(page.getByRole('button', { name: 'Recompute live' })).toBeDisabled();
  release();
  await expect(page.getByRole('button', { name: 'Recompute live' })).toBeEnabled();
  await page.getByRole('button', { name: 'Recompute live' }).click();
  await expect(page.getByText('Cached result', { exact: true })).toBeVisible({ timeout: 120000 }); // slow-ok: The topology-optimization worker completes the sensitivity-filter MBB iterations after reference loading is released.
});

for (const failure of [false, true]) test(`partial worker run is ${failure ? 'failed' : 'stopped'}, never cached`, async ({ page }) => {
  await page.addInitScript(({ failure }) => {
    window.Worker = class {
      onmessage?: (e: { data: unknown }) => void;
      terminate() {}
      postMessage({ config }: { config: { nelx: number; nely: number } }) {
        setTimeout(() => this.onmessage?.({ data: failure ? { type: 'error', message: 'Raw internal exception' } : { type: 'step', frame: { iteration: 1, compliance: 10, volume: .5, change: .2, density: Array(config.nelx * config.nely).fill(.5) } } }), 10);
      }
    } as unknown as typeof Worker;
  }, { failure });
  await page.goto(route);
  await page.getByRole('button', { name: 'Recompute live' }).click();
  if (!failure) {
    await expect(page.getByText(/Compliance: 10\.0000/)).toBeVisible();
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
  }
  await expect(page.getByText(failure ? 'Computation failed' : 'Stopped before convergence', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Cached result', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Raw internal exception')).toHaveCount(0);
});

for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 810, height: 1080 }, { width: 1280, height: 600 }]) {
  test(`layout and keyboard at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(route);
    const canvas = page.locator('.sfv-canvas');
    await expect(canvas).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const box = await canvas.boundingBox();
    expect(box!.y).toBeLessThan(viewport.height < 500 ? 390 : 550);
    for (const control of await page.locator('.rs-shell-app button:not(.cam-backdrop), .rs-shell-app select, .rs-shell-app input').all()) {
      if (!await control.isVisible()) continue;
      const size = await control.boundingBox();
      expect(size!.height).toBeGreaterThanOrEqual(44);
      expect(size!.width).toBeGreaterThanOrEqual(44);
    }
    const small = await page.locator('.rs-shell-app').evaluate(el => [...el.querySelectorAll('*')].filter(e => [...e.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) && e.getBoundingClientRect().height > 0).filter(e => parseFloat(getComputedStyle(e).fontSize) < 12).map(e => e.textContent));
    expect(small).toEqual([]);
    const menu = page.getByRole('button', { name: 'View options', exact: true });
    await menu.click();
    await page.keyboard.press('Escape');
    await expect(menu).toBeFocused();
    await menu.click();
    await page.locator('.cam-menu').getByRole('button', { name: 'Zoom to extents', exact: true }).click();
    await expect(menu).toBeFocused();
    await canvas.focus();
    await page.keyboard.press('ArrowRight');
    const zoom = page.locator('.sfv-status .status-item').nth(1).locator('.status-value');
    const beforeZoom = await zoom.textContent();
    await page.keyboard.press('+');
    await expect(zoom).not.toHaveText(beforeZoom!);
    const slider = page.getByRole('slider');
    await slider.focus();
    await page.keyboard.press('Home');
    await expect(slider).toHaveAttribute('aria-valuetext', 'Iteration 1');
    await page.getByRole('button', { name: 'Convergence', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Convergence', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByText('Chart data', { exact: true }).click();
    await expect(page.locator('.rs-shell-app table tbody tr')).toHaveCount(106);
    await page.getByLabel('Filter', { exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByLabel('Filter', { exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const [locale, title, run] of [
  ['en', 'Topology optimization of an MBB beam', 'Recompute live'],
  ['es', 'Optimización topológica de una viga MBB', 'Recalcular en vivo'],
  ['pt', 'Otimização topológica de uma viga MBB', 'Recalcular ao vivo'],
  ['de', 'Topologieoptimierung eines MBB-Balkens', 'Live neu berechnen'],
  ['fr', 'Optimisation topologique d’une poutre MBB', 'Recalculer en direct'],
  ['tr', 'MBB kirişinin topoloji optimizasyonu', 'Canlı yeniden hesapla'],
]) test(`translated page and persistent language: ${locale}`, async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('stabileo-lang', 'fr'); localStorage.setItem('stabileo-lang-manual', 'true'); });
  await page.goto(`/${locale}/research/optimization/andreassen-2011/`);
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page).toHaveTitle(new RegExp(title));
  await expect(page.getByRole('button', { name: run, exact: true })).toBeEnabled();
  await expect(page.locator('.sfv-canvas')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('stabileo-lang'))).toBe('fr');
});
