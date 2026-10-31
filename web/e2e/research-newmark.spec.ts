import { expect, test, type Page } from '@playwright/test';
import replay from '../../research/benchmarks/newmark-1959/results/stabileo_results.json' with { type: 'json' };

const route = (locale: string) => `/${locale}/research/benchmarks/newmark-1959/`;

async function smallestTarget(page: Page) {
  return page.locator('.rs-shell-app').evaluate(app => {
    const sizes = [...app.querySelectorAll('button, select, input, a')]
      .map(el => el.getBoundingClientRect())
      .filter(r => r.width > 0 && r.height > 0)
      .map(r => Math.min(r.width, r.height));
    return Math.min(...sizes);
  });
}

async function textBelow12px(page: Page) {
  return page.evaluate(() => {
    const small: string[] = [];
    for (const root of document.querySelectorAll('.rs-shell-head, .rs-shell-app, .rs-shell-article')) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement!;
        if (!node.textContent!.trim() || !el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
        const ctm = el instanceof SVGGraphicsElement ? el.getScreenCTM()!.a : 1;
        const px = parseFloat(getComputedStyle(el).fontSize) * ctm;
        if (px < 12) small.push(`${node.textContent!.trim()} (${px.toFixed(1)} px)`);
      }
    }
    return small;
  });
}

for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 810, height: 1080 }]) {
  test(`@smoke Newmark page layout and provenance at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(route('en'));
    await expect(page.getByRole('heading', { name: 'Newmark average acceleration' })).toBeVisible();
    await expect(page.getByText('First version · 2 review rounds', { exact: true })).toBeVisible();
    const verification = page.locator('.rs-verify');
    await expect(verification.locator('dt').first()).toHaveText('Against closed form and native engine');
    await expect(verification.locator('dd').first()).toContainText('13 of 13 checks pass');
    await expect(verification.locator('dd').nth(1)).toContainText('None: this page checks the method against exact closed-form solutions');
    await expect(page.locator('.rs-shell')).not.toContainText(/author’s code|full text|Questions for the authors|pending|provisional|not compared/i);
    await expect(page.locator('.rs-citebox')).toContainText('Newmark average acceleration”, benchmark after Nathan M. Newmark (1959');
    await expect(page.locator('.rs-citebox')).not.toContainText('reproduction of');
    await expect(page.getByTestId('description')).toContainText('E = 10 MPa, A = 0.01 m², synthetic density = 300000 kg/m³');
    await expect(page.getByTestId('description')).toContainText('m = ρAL/3 = 1 t and k = EA/L = 100 kN/m. A 1 kN step');
    await expect(page.getByTestId('formula')).toContainText('ω = √(k/m) = 10 rad/s, T = 2π/ω = 0.628319 s');
    await expect(page.getByTestId('periods').locator('tbody tr').first()).toHaveText(/0\.025\s*0\.629608\s*0\.629610\s*0\.206/);
    await expect(page.getByTestId('errors').locator('tbody tr').first()).toHaveText(/0\.025.*0\.483\s*0\.515/);

    const canvas = page.locator('.rs-viewer-host canvas').first();
    await expect(canvas).toBeVisible();
    const top = (await canvas.boundingBox())!.y;
    expect(top).toBeLessThan(viewport.height - 60);
    expect(await smallestTarget(page)).toBeGreaterThanOrEqual(44);
    expect(await textBelow12px(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`newmark-${viewport.width}x${viewport.height}.png`), fullPage: false });
  });
}

test('@smoke Newmark live recompute matches the replay and keeps every check', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(route('en'));
  await expect(page.getByTestId('source')).toContainText('Precomputed replay');
  await page.getByLabel('Time step', { exact: true }).selectOption('0.025');
  const replayError = Number(await page.getByTestId('comparison').getAttribute('data-error'));
  expect(replayError).toBe(replay.runs[0].maxError);
  await page.getByRole('button', { name: 'Recompute live', exact: true }).click();
  await expect(page.getByTestId('source')).toContainText('Live computation', { timeout: 60_000 }); // slow-ok: The production WASM engine computes the Newmark time-history response.
  const fine = Number(await page.getByTestId('comparison').getAttribute('data-error'));
  expect(Math.abs(fine - replayError)).toBeLessThan(1e-10);
  expect(fine).toBeGreaterThan(0);
  expect(fine).toBeLessThan(0.0005);
  await expect(page.locator('.rs-verify dd').first()).toContainText('13 of 13 checks pass');

  await page.getByLabel('Time step', { exact: true }).selectOption('0.2');
  await page.getByRole('button', { name: 'Recompute live', exact: true }).click();
  await expect(page.getByTestId('source')).toContainText('Live computation');
  expect(Number(await page.getByTestId('comparison').getAttribute('data-error'))).toBeGreaterThan(fine);

  const slider = page.getByRole('slider', { name: 'Sample' });
  await slider.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Sample 1 of 20, t = 0.1257 s');
  await expect(page.getByRole('img', { name: 'Axial displacement history from our production Newmark run' })).toBeVisible();
});

for (const [locale, title, label, published] of [
  ['es', 'Aceleración media de Newmark', 'Frente a la forma cerrada y al motor nativo', 'Ninguna: esta página verifica el método'],
  ['pt', 'Aceleração média de Newmark', 'Frente à forma fechada e ao motor nativo', 'Nenhuma: esta página verifica o método'],
]) {
  test(`@smoke Newmark page in ${locale}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(route(locale));
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.locator('.rs-verify dt').first()).toHaveText(label);
    await expect(page.locator('.rs-verify dd').nth(1)).toContainText(published);
    await expect(page.getByTestId('description')).toContainText('E = 10 MPa, A = 0,01 m²');
    await expect(page).toHaveTitle('Newmark (1959) — Stabileo Research');
  });
}
