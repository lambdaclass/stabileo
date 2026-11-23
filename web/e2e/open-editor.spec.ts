import { test, expect } from '@playwright/test';

for (const activation of ['click', 'keyboard'] as const) {
  test(`@smoke Open the editor gives immediate feedback on ${activation}`, async ({ page }) => {
    test.fixme(true, 'Known landing startup regression');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const ready = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    await page.route(/\/assets\/App-[^/]+\.js$/, async (route) => {
      ready.resolve();
      await release.promise;
      await route.continue();
    });

    const locale = activation === 'click' ? 'en' : 'es';
    const openLabel = activation === 'click' ? 'Open the editor' : 'Abrir el editor';
    const statusLabel = activation === 'click' ? 'Opening the editor…' : 'Abriendo el editor…';
    await page.goto(`/${locale}/`);
    const open = page.locator('#app .hero-ctas').getByRole('button', { name: openLabel, exact: true });
    await expect(open).toBeVisible();
    expect(await page.evaluate(() => performance.getEntriesByType('resource').some(entry =>
      /\/assets\/(?:load-app-|App-)|\.wasm$/.test(entry.name),
    ))).toBe(false);

    if (activation === 'keyboard') await open.focus();
    await expect.poll(() => open.evaluate((button) => {
      const initial = button.getBoundingClientRect().toJSON();
      button.addEventListener('click', () => {
        requestAnimationFrame(() => {
          document.documentElement.dataset.editorFirstFrame = JSON.stringify({
            busy: button.getAttribute('aria-busy'),
            rect: button.getBoundingClientRect().toJSON(),
            initial,
          });
        });
      }, { capture: true, once: true });
      return initial.width > 0;
    })).toBe(true);

    try {
      if (activation === 'click') await open.click();
      else await page.keyboard.press('Enter');
      await expect(page.locator('html')).toHaveAttribute('data-editor-first-frame', /.+/);
      const frame = JSON.parse((await page.locator('html').getAttribute('data-editor-first-frame'))!);
      expect(frame.busy).toBe('true');
      expect(frame.rect).toEqual(frame.initial);
      await expect(page).toHaveURL(/\/app\/basic$/);
      await expect(page.getByRole('status').filter({ hasText: statusLabel })).toBeVisible();
      await ready.promise;
      await expect(page.getByTestId('ribbon')).toHaveCount(0);
    } finally {
      release.resolve();
    }

    await expect(page.getByRole('status').filter({ hasText: statusLabel })).toHaveCount(0);
    const member = page.getByTestId('rb-cmd-element');
    await member.click();
    await expect(member).toHaveClass(/\bactive\b/);
  });
}
