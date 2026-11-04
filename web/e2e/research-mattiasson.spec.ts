import { test, expect } from '@playwright/test';
import LZString from 'lz-string';
import { strings } from '../src/components/research/mattiasson1981/i18n';

const anyLocale = (key: keyof typeof strings.en) => new RegExp(Object.values(strings).map(s => s[key].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'));

test('Mattiasson live results, playback interaction and rerun @smoke', async ({ page }) => {
  await page.goto('/research/benchmarks/mattiasson-elastica');
  await expect(page.getByTestId('mattiasson-summary')).toContainText(/\d+\/5/, { timeout: 120_000 }); // slow-ok: The production WASM engine computes the elastica benchmark cases before reporting the five checks.
  const slider = page.getByRole('slider').first();
  await slider.fill('1');
  await expect(page.getByTestId('mattiasson-step')).toContainText('force-1');
  await page.waitForTimeout(900);
  await expect(slider).toHaveValue('1');
  await page.getByRole('tab', { name: /Results|Resultados/ }).click();
  await expect(page.getByTestId('force-1')).toContainText(/0[.,]05643324/);
  await expect(page.getByTestId('force-1')).toContainText(/0[.,]05639026/);
  await expect(page.getByTestId('mattiasson-summary')).toContainText('5/5');
  await expect(page.getByTestId('force-1')).not.toContainText(anyLocale('compute'));
  await expect(page.getByText(`${strings.en.complete}: 21/21 · ${strings.en.fail}: 0`, { exact: true })).toBeVisible();
  await expect(page.getByTestId('force-10')).toContainText(/Pass|Cumple|Passa/);
  await page.getByRole('button', { name: /Run again|Ejecutar de nuevo|Executar novamente/ }).click();
  await expect(page.getByTestId('mattiasson-summary')).toContainText(/\d+\/5/, { timeout: 120_000 }); // slow-ok: Run again recomputes the elastica benchmark cases through the production WASM engine.
});

test('Mattiasson editor handoff @smoke', async ({ page }) => {
  await page.goto('/research/benchmarks/mattiasson-elastica');
  await expect(page.getByTestId('mattiasson-summary')).toContainText(/\d+\/5/, { timeout: 120_000 }); // slow-ok: The elastica solve initializes playback before selecting the model to export.
  await page.getByRole('slider').first().fill('1');
  await page.getByRole('tab', { name: /Model|Modelo/, exact: true }).click();
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: /Open in Stabileo|Abrir en Stabileo|Abrir no Stabileo/, exact: true }).click();
  const editor = await popup;
  await expect(editor).toHaveURL(/\/app#data=/);
  const shared = JSON.parse(LZString.decompressFromEncodedURIComponent(editor.url().split('#data=')[1]));
  expect(shared.name).toBe('Mattiasson: force-1');
  expect(shared.analysisMode).toBe('2d');
  expect(shared.includeSelfWeight).toBe(false);
  expect(shared._shareMeta).toEqual({ includeSelfWeight: false, autoSolve: false });
  expect(shared.loads.map((l: { data: { nodeId: number; fx: number; fy: number; mz: number } }) => [l.data.nodeId, l.data.fx, l.data.fy, l.data.mz])).toEqual([[17, 0, -5000, 0]]);
  expect(shared.supports).toEqual([[1, { id: 1, nodeId: 1, type: 'fixed' }]]);
  expect(shared.sections[0][1]).toMatchObject({ a: 1, iz: 1e-4 });
  await expect(editor.locator('canvas').first()).toBeVisible();
});

test('Mattiasson moment selection keeps the force step on the slider', async ({ page }) => {
  await page.goto('/en/research/benchmarks/mattiasson-elastica/');
  await expect(page.getByTestId('mattiasson-summary')).toContainText('5/5', { timeout: 120_000 }); // slow-ok: All 21 production WASM solves complete before the moment case is selected.
  const slider = page.getByRole('slider').first();
  await slider.fill('3');
  await page.getByRole('checkbox', { name: strings.en.moment }).check();
  await expect(page.getByTestId('mattiasson-step')).toHaveText(`${strings.en.moment}: moment-1`);
  await expect(slider).toBeDisabled();
  await expect(slider).toHaveAttribute('aria-valuetext', `${strings.en.force}: PL²/EI = 2`);
  await page.getByRole('checkbox', { name: strings.en.moment }).uncheck();
  await expect(page.getByTestId('mattiasson-step')).toHaveText(`${strings.en.force}: force-2`);
});

test('Mattiasson Stop keeps computed steps seekable and playable', async ({ page }) => {
  await page.goto('/en/research/benchmarks/mattiasson-elastica/');
  await expect(page.getByTestId('mattiasson-summary')).toContainText('5/5', { timeout: 120_000 }); // slow-ok: The first run's 21 production WASM solves complete before Run again.
  await page.getByRole('tab', { name: strings.en.results }).click();
  await page.evaluate(({ run, stop, compute }) => new Promise<void>(resolve => {
    const button = (label: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === label)!;
    const row = document.querySelector('[data-testid="force-1"]')!;
    const observer = new MutationObserver(() => {
      if (row.textContent!.includes(compute)) return;
      observer.disconnect();
      button(stop).click();
      resolve();
    });
    observer.observe(row, { subtree: true, childList: true, characterData: true });
    button(run).click();
  }), { run: strings.en.run, stop: strings.en.stop, compute: strings.en.compute });
  await expect(page.locator('.benchmark-pane [role="alert"]')).toHaveText(strings.en.interrupted);
  await expect(page.getByTestId('force-1.5')).toContainText(strings.en.compute);
  await expect(page.getByText(`${strings.en.complete}: 2/21 · ${strings.en.fail}: 0`, { exact: true })).toBeVisible();
  await expect(page.getByTestId('mattiasson-summary')).toContainText('1/5');
  await page.getByRole('tab', { name: strings.en.viewer }).click();
  const slider = page.getByRole('slider').first();
  await slider.fill('0');
  await expect(page.getByTestId('mattiasson-step')).toHaveText(`${strings.en.force}: force-0.5`);
  await page.getByRole('button', { name: strings.en.play, exact: true }).click();
  await expect(page.getByTestId('mattiasson-step')).toHaveText(`${strings.en.force}: force-1`);
  await expect(slider).toHaveValue('1');
  await expect(page.getByRole('button', { name: strings.en.run, exact: true })).toBeEnabled();
});

for (const [width, height] of [[360, 800], [390, 844], [844, 390], [810, 1080]]) {
  for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) {
    test(`Mattiasson direct visit ${locale} ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`/${locale}/research/benchmarks/mattiasson-elastica/`);
      await expect(page.getByTestId('mattiasson-summary')).toContainText('5/5', { timeout: 120_000 }); // slow-ok: All 21 production WASM solves complete before inspecting the page.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const viewer = page.locator('.benchmark-pane .sfv');
      await expect(viewer).toBeInViewport({ ratio: 0.2 });
      expect((await viewer.boundingBox())!.height).toBeLessThanOrEqual(height * .48 + 1);
      await expect(page.locator('.rs-shell')).not.toContainText(/scalarViewer\.|Questions for the authors|provisional|not checked|pending/i);
      const inspect = async () => {
        const errors = await page.locator('.rs-shell').evaluate(root => {
          const errors: string[] = [];
          for (const el of root.querySelectorAll('*')) {
            const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
            if (!rect.width || !rect.height || style.visibility === 'hidden') continue;
            const text = [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
            const scale = el instanceof SVGGraphicsElement ? (el.getScreenCTM()?.a ?? 1) : 1;
            if (text && parseFloat(style.fontSize) * scale < 12) errors.push(`text: ${el.tagName}`);
            if (el.matches('button, input, select, [role="button"]') && (rect.height < 44 || rect.width < 44)) errors.push(`target: ${el.className}`);
          }
          return errors;
        });
        expect(errors).toEqual([]);
      };
      await inspect();
      await page.locator('.benchmark-pane .cam-cube').click();
      await inspect();
      await page.locator('.benchmark-pane .cam-backdrop').click({ position: { x: 2, y: height - 2 } });
      await expect(page.locator('.benchmark-pane .cam-backdrop')).toHaveCount(0);
      await page.getByRole('tab').nth(1).click();
      await inspect();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator('#mattiasson-chart-description')).toBeVisible();
      expect(await page.locator('.benchmark-pane').evaluate(pane => pane.scrollWidth <= pane.clientWidth + 1)).toBe(true);
      await page.getByRole('tab').first().click();
      const slider = page.getByRole('slider').first();
      await slider.fill('1');
      await expect(slider).toHaveAttribute('aria-valuetext', /PL²\/EI = 1/);
    });
  }
}
