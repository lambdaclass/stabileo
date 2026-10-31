import { test, expect, type Page } from '@playwright/test';
import replay from '../../research/benchmarks/navier-plate/results/stabileo_results.json' with { type: 'json' };

const reference = replay.parameters.reference_mm;
const mindlin = replay.parameters.mindlin_reference_mm;
const number = (text: string | null) => Number(text!.trim().replace(',', '.').replace('−', '-').replace('+', ''));

async function expectRows(page: Page, rows: typeof replay.rows) {
  const body = page.getByTestId('navier-results').locator('tbody tr');
  await expect(body).toHaveCount(rows.length);
  for (const [i, row] of rows.entries()) {
    const cells = body.nth(i).locator('td');
    await expect(cells.nth(0)).toHaveText(row.family);
    expect(number(await cells.nth(2).textContent())).toBeCloseTo(row.center_mm, 6);
    const diff = (await cells.nth(3).textContent())!;
    expect(number(diff)).toBeCloseTo(100 * (row.center_mm / reference - 1), 3);
    expect(diff.trim().startsWith('+')).toBe(row.center_mm > reference);
  }
}

async function open(page: Page, locale: string, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/${locale}/research/benchmarks/navier-plate/`);
  await expect(page.locator('.rs-viewer-host canvas').first()).toBeVisible();
}

for (const [width, height] of [[360, 900], [390, 844], [844, 390], [810, 1080]]) {
  test(`@smoke Navier plate layout and replay at ${width}x${height}`, async ({ page }, testInfo) => {
    await open(page, 'en', width, height);
    await expect(page.getByRole('heading', { name: 'Navier plate: mesh convergence' })).toBeVisible();
    await expect(page.getByTestId('navier-source')).toHaveText('Precomputed replay (same solver)');
    await expectRows(page, replay.rows);
    const hard = page.getByTestId('navier-hard').locator('tbody tr');
    await expect(hard).toHaveCount(replay.hard_rows.length);
    for (const [i, row] of replay.hard_rows.entries()) {
      expect(number(await hard.nth(i).locator('td').nth(1).textContent())).toBeCloseTo(row.center_mm, 6);
      expect(number(await hard.nth(i).locator('td').nth(2).textContent())).toBeCloseTo(100 * (row.center_mm / mindlin - 1), 3);
    }
    expect(number(await page.getByTestId('navier-mindlin').textContent())).toBeCloseTo(mindlin, 6);
    expect(number(await page.getByTestId('navier-published').textContent())).toBe(1.28375);
    await expect(page.getByTestId('navier-reduction')).toHaveText('Absolute-error reduction, 4×4 → 16×16: DKT against the thin-plate series: 15.78×; MITC4 with hard support against the Reissner–Mindlin series: 13.71×');
    await expect(page.getByTestId('navier-closer')).toHaveText('Closer to the thin-plate series (not an accuracy ranking): 4×4: MITC4; 8×8: MITC4; 16×16: DKT');

    const viewer = (await page.locator('.rs-viewer-host').boundingBox())!;
    expect(viewer.y).toBeLessThan(height);
    expect(viewer.y + Math.min(viewer.height, 120)).toBeLessThanOrEqual(height);

    const targets = page.locator('.navier button:visible, .navier input[type=range], .navier label.check');
    for (const target of await targets.all()) {
      const box = (await target.boundingBox())!;
      expect(box.height, await target.evaluate(el => el.outerHTML.slice(0, 80))).toBeGreaterThanOrEqual(44);
      if (await target.evaluate(el => el.tagName === 'BUTTON')) expect(box.width).toBeGreaterThanOrEqual(44);
    }
    const small = await page.evaluate(() => [...document.querySelectorAll('.navier *')]
      .filter(el => [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent!.trim()) && (el as HTMLElement).offsetParent !== null)
      .filter(el => parseFloat(getComputedStyle(el).fontSize) < 12)
      .map(el => `${el.tagName}.${el.className}: ${getComputedStyle(el).fontSize}`));
    expect(small).toEqual([]);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const overflowing = await page.evaluate(() => [...document.querySelectorAll('.navier *')]
      .filter(el => (el as HTMLElement).offsetParent !== null && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && !['CANVAS', 'svg'].includes(el.tagName) && getComputedStyle(el).clipPath === 'none')
      .map(el => `${el.tagName}.${el.className}`));
    expect(overflowing).toEqual([]);

    const order = await page.evaluate(() => {
      const focusable = [...document.querySelectorAll<HTMLElement>('.panes a, .panes button, .panes input, .panes [tabindex="0"]')].filter(el => el.offsetParent !== null);
      return { firstInApp: focusable[0].closest('.app') !== null, firstLink: focusable.findIndex(el => el.tagName === 'A'), lastApp: focusable.findLastIndex(el => el.closest('.app') !== null) };
    });
    expect(order.firstInApp).toBe(true);
    expect(order.lastApp).toBeLessThan(order.firstLink);

    await page.screenshot({ path: testInfo.outputPath('navier.png'), fullPage: true });
  });
}

test('@smoke Navier plate recomputes live and restores the replay', async ({ page }) => {
  await open(page, 'en', 390, 844);
  await page.getByRole('button', { name: 'Recompute live' }).click();
  await expect(page.getByTestId('navier-source')).toHaveText('Live result: all six meshes computed in this browser', { timeout: 40_000 }); // slow-ok: The WASM worker loads the production engine and solves all six plate meshes.
  await expect(page.locator('.table-scroll').first()).toHaveAttribute('aria-busy', 'false');
  await expectRows(page, replay.rows);
  await page.getByRole('button', { name: 'Show the finest MITC4 mesh' }).click();
  await expect(page.getByTestId('navier-source')).toHaveText('Live result: all six meshes computed in this browser');
  await expect(page.locator('label.step')).toContainText('MITC4 16 × 16');
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(page.getByTestId('navier-source')).toHaveText('Precomputed replay (same solver)');
});

test('@smoke Navier plate stopped before the first result says so and shows no live rows', async ({ page }) => {
  await open(page, 'en', 390, 844);
  await page.getByRole('button', { name: 'Recompute live' }).click();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByTestId('navier-source')).toHaveText(/^(Stopped before the first mesh finished: no live result|Stopped: [1-5] of 6 meshes computed live)$/);
  const shown = await page.getByTestId('navier-results').locator('tbody tr').count();
  expect(shown).toBeLessThan(6);
  if (shown === 0) await expect(page.getByTestId('navier-source')).toHaveText('Stopped before the first mesh finished: no live result');
  else await expect(page.getByTestId('navier-source')).toHaveText(`Stopped: ${shown} of 6 meshes computed live`);
  await expect(page.getByTestId('navier-source')).toHaveAttribute('role', 'status');
});

test('@smoke Navier plate reports a failed live computation', async ({ page, context }) => {
  await context.route('**/*dedaliano_engine_bg*.wasm', route => route.abort());
  await open(page, 'en', 390, 844);
  await page.getByRole('button', { name: 'Recompute live' }).click();
  await expect(page.getByTestId('navier-source')).toHaveText('Live computation failed: no complete result', { timeout: 20_000 });
  await expect(page.getByRole('alert')).toHaveText('Computation failed: the engine could not be loaded.');
  await expect(page.getByTestId('navier-results').locator('tbody tr')).toHaveCount(0);
});

const LOCALES = [
  ['es', 'Placa de Navier: convergencia de malla', 'Reproducción precalculada (mismo solver)'],
  ['pt', 'Placa de Navier: convergência da malha', 'Reprodução pré-calculada (mesmo solver)'],
  ['de', 'Navier-Platte: Netzkonvergenz', 'Vorberechnete Wiedergabe (gleicher Solver)'],
  ['fr', 'Plaque de Navier : convergence du maillage', 'Relecture précalculée (même solveur)'],
  ['tr', 'Navier plağı: ağ yakınsaması', 'Önceden hesaplanmış tekrar (aynı çözücü)'],
] as const;

for (const [locale, title, replayLabel] of LOCALES) {
  test(`@smoke Navier plate in ${locale}`, async ({ page }) => {
    await open(page, locale, 390, 844);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(page).toHaveTitle(`${title} — Stabileo Research`);
    await expect(page.getByTestId('navier-source')).toHaveText(replayLabel);
    await expectRows(page, replay.rows);
    await expect(page.getByTestId('navier-reference')).toHaveText(new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(reference));
    const keys = page.locator('.sfv-keys');
    await expect(keys).not.toHaveText('');
    await expect(keys).not.toContainText('Arrow keys pan');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('@smoke Navier viewer pans and zooms from the keyboard', async ({ page }) => {
  await open(page, 'en', 390, 844);
  const canvas = page.locator('.sfv-canvas');
  await expect(canvas).toHaveAttribute('aria-label', /^Downward displacement contour, (DKT|MITC4) \d+ × \d+ mesh: [\d.]+ to [\d.]+ mm$/);
  await expect(page.locator('.axis-gizmo')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.shell-legend')).toHaveAttribute('aria-label', /^Downward displacement \[mm\]: .+ – .+$/);
  const zoom = page.locator('.sfv-status .status-item').nth(1).locator('.status-value');
  const before = await zoom.textContent();
  await canvas.focus();
  await page.keyboard.press('+');
  await expect(zoom).not.toHaveText(before!);
  await page.keyboard.press('0');
  await expect(zoom).toHaveText(before!);
  await page.keyboard.press('ArrowLeft');
  await expect(canvas).toBeFocused();
});
