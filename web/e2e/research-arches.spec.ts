import { test, expect } from '@playwright/test';
test('@smoke research arches replay, mode and production WASM recomputation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en/research/mechanics/biggins-2026/');
  const app = page.locator('.arches-app');
  await expect(app).toHaveAttribute('data-source', 'replay');
  await expect(app).toHaveAttribute('data-step', '61');
  await expect(page.locator('.sfv canvas').first()).toBeVisible();
  expect(Number(await app.getAttribute('data-threshold'))).toBeCloseTo(21.52 * Math.sqrt(0.012), 2);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Recompute live', exact: true }).click();
  await expect(app).toHaveAttribute('data-source', 'live', { timeout: 60000 }); // slow-ok: The arches WASM worker computes the mode and equilibrium curve.
  expect(Number(await app.getAttribute('data-threshold'))).toBeCloseTo(21.52 * Math.sqrt(0.012), 2);
});

test('@smoke research arches width recomputation and stop', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en/research/mechanics/biggins-2026/');
  const app = page.locator('.arches-app');
  await page.getByRole('checkbox').check();
  await page.locator('#arch-width').focus();
  await page.locator('#arch-width').press('End');
  await expect(app).toHaveAttribute('data-width', '0.9', { timeout: 60000 }); // slow-ok: Changing width starts a new arches WASM equilibrium solve.
  expect(Number(await app.getAttribute('data-threshold'))).toBeGreaterThan(4.8);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  const step = await app.getAttribute('data-step');
  await page.waitForTimeout(400);
  await expect(app).toHaveAttribute('data-step', step!);
});

for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) {
  for (const viewport of [{ width: 360, height: 780 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 810, height: 1080 }]) {
    test(`@smoke arches accessibility ${locale} ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`/${locale}/research/mechanics/biggins-2026/`);
      const app = page.locator('.arches-app');
      await expect(app).toHaveAttribute('lang', locale);
      const canvas = app.locator('.sfv canvas').first();
      await expect(canvas).toBeVisible();
      const position = await canvas.boundingBox();
      expect(position!.y).toBeLessThan(viewport.height === 390 ? 390 : 500);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      for (const control of await page.locator('.rs-shell button, .rs-shell input, .rs-shell summary').all()) {
        if (!await control.isVisible()) continue;
        const box = await control.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      const smallText = await app.evaluate(el => [...el.querySelectorAll('*')].filter(node => {
        const style = getComputedStyle(node);
        return node.getBoundingClientRect().height > 0 && style.display !== 'none'
          && [...node.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())
          && parseFloat(style.fontSize) < 12;
      }).map(node => node.className));
      expect(smallText).toEqual([]);
      const chart = app.locator('.chart svg');
      await chart.scrollIntoViewIfNeeded();
      const box = await chart.boundingBox();
      await page.mouse.move(box!.x + box!.width - 30, box!.y + 60);
      const tooltip = app.locator('.readout');
      await expect(tooltip).toBeVisible();
      const tip = await tooltip.boundingBox();
      expect(tip!.x).toBeGreaterThanOrEqual(0);
      expect(tip!.x + tip!.width).toBeLessThanOrEqual(viewport.width);
      await app.locator('summary').focus();
      await page.keyboard.press('Enter');
      await expect(app.locator('table').first()).toBeVisible();
      await expect(app.locator('table tbody tr')).toHaveCount(62);
      await app.getByRole('checkbox').check();
      await page.locator('.rs-xlink').first().click();
      await expect(app.getByRole('checkbox')).not.toBeChecked();
      await expect(app).toHaveAttribute('data-step', '49');
      expect(Number(await app.getAttribute('data-alpha'))).toBe(Number(await app.getAttribute('data-threshold')));
    });
  }
}

for (const outcome of ['stop', 'failure']) {
  test(`@smoke arches keeps computed parameters after ${outcome}`, async ({ page }) => {
    await page.addInitScript(({ outcome }) => {
      class ControlledWorker {
        onmessage: ((event: { data: unknown }) => void) | null = null;
        onerror: (() => void) | null = null;
        postMessage() { if (outcome === 'failure') queueMicrotask(() => this.onmessage?.({ data: { error: 'test failure' } })); }
        terminate() {}
      }
      window.Worker = ControlledWorker as unknown as typeof Worker;
    }, { outcome });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/en/research/mechanics/biggins-2026/');
    const app = page.locator('.arches-app');
    const threshold = await app.getAttribute('data-threshold');
    await page.locator('#arch-width').focus();
    await page.locator('#arch-width').press('End');
    if (outcome === 'stop') await app.getByRole('button', { name: 'Stop', exact: true }).click();
    else await expect(app.getByRole('alert')).toBeVisible();
    await expect(app).toHaveAttribute('data-width', '0.7');
    await expect(app).toHaveAttribute('data-compression', '0.012');
    await expect(app).toHaveAttribute('data-threshold', threshold!);
    await expect(app.locator('.result-parameters')).toContainText('0.70');
    await expect(app.locator('.result-parameters')).toContainText('0.012');
  });
}
