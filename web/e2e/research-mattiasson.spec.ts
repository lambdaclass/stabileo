import { test, expect } from '@playwright/test';

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
  await expect(page.getByTestId('force-1')).not.toContainText(/Not computed|Sin calcular|Não calculado/);
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
  await expect(editor.locator('canvas').first()).toBeVisible();
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
      await page.getByRole('tab').nth(1).click();
      await inspect();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator('#mattiasson-chart-description')).toBeVisible();
      await page.getByRole('tab').first().click();
      const slider = page.getByRole('slider').first();
      await slider.fill('1');
      await expect(slider).toHaveAttribute('aria-valuetext', /PL²\/EI = 1/);
    });
  }
}
