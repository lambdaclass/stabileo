/**
 * On a phone the tabs are one control in the header that opens a list, and
 * the header row never needs a horizontal scroll to reach any of its buttons.
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

async function headerOverflow(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('.app-header')!;
    const rights = [...header.querySelectorAll<HTMLElement>('button, select')]
      .filter((el) => !el.closest('[data-testid=tab-switcher-panel]'))
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0)
      .map((r) => Math.round(r.right));
    return {
      header: header.scrollWidth - header.clientWidth,
      page: document.documentElement.scrollWidth - window.innerWidth,
      rightmost: Math.max(...rights),
      width: window.innerWidth,
    };
  });
}

async function addTab(page: Page) {
  await page.getByTestId('tab-switcher').tap();
  await page.getByTestId('tab-switcher-new').tap();
  await expect(page.getByTestId('tab-switcher-panel')).toHaveCount(0);
}

for (const width of [360, 390]) {
  test.describe(`@smoke tabs on a ${width} px phone`, () => {
    test.use({ viewport: { width, height: 800 }, hasTouch: true, isMobile: true });

    test('switch, create, rename and close from the dropdown; the header fits', async ({ page }) => {
      await page.goto('/app/basic?e2e=1');
      await page.waitForFunction(() => !!window.__stabileo && window.__stabileo.solverReady(), null, { timeout: 30_000 });
      await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
      const nodes = await page.evaluate(() => window.__stabileo.nodeCount());
      expect(nodes).toBeGreaterThan(0);

      const trigger = page.getByTestId('tab-switcher');
      await expect(page.locator('.tab-bar')).toHaveCount(0);
      await expect(trigger).toHaveAttribute('data-count', '1');
      await addTab(page);
      await addTab(page);
      await addTab(page);
      await expect(trigger).toHaveAttribute('data-count', '4');
      expect(await page.evaluate(() => window.__stabileo.nodeCount())).toBe(0);

      const fit = await headerOverflow(page);
      expect(fit.header, 'header scrolls sideways').toBeLessThanOrEqual(0);
      expect(fit.page, 'page scrolls sideways').toBeLessThanOrEqual(0);
      expect(fit.rightmost, 'a header control ends past the edge').toBeLessThanOrEqual(fit.width);
      const box = await trigger.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);

      await trigger.tap();
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      const panel = page.getByTestId('tab-switcher-panel');
      const rows = panel.getByTestId('tab-switcher-row');
      await expect(rows).toHaveCount(4);
      await expect(rows.nth(3).getByTestId('tab-switcher-tab')).toBeFocused();
      const panelBox = await panel.boundingBox();
      expect(panelBox!.x).toBeGreaterThanOrEqual(0);
      expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(width);
      expect(panelBox!.width, 'the panel spans the screen, not the trigger').toBeGreaterThanOrEqual(width - 24);
      const headerBottom = await page.evaluate(() => document.querySelector('.app-header')!.getBoundingClientRect().bottom);
      expect(panelBox!.y).toBeGreaterThanOrEqual(headerBottom);
      expect(panelBox!.y).toBeLessThanOrEqual(headerBottom + 12);
      for (const id of ['tab-switcher-tab', 'tab-switcher-rename', 'tab-switcher-close']) {
        const b = await rows.first().getByTestId(id).boundingBox();
        expect(b!.height, id).toBeGreaterThanOrEqual(44);
        expect(b!.width, id).toBeGreaterThanOrEqual(44);
      }

      await rows.first().getByTestId('tab-switcher-tab').tap();
      await expect(panel).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBe(nodes);
      await expect(trigger).toHaveAttribute('aria-label', /\(1\D+4\)/);

      await trigger.tap();
      await rows.nth(1).getByTestId('tab-switcher-rename').tap();
      const input = panel.getByTestId('tab-switcher-input');
      await expect(input).toBeFocused();
      await input.fill('Beam B');
      await input.press('Enter');
      await expect(rows.nth(1)).toContainText('Beam B');
      await expect(rows.nth(1).getByTestId('tab-switcher-rename')).toBeFocused();

      page.once('dialog', (d) => d.accept());
      await rows.nth(3).getByTestId('tab-switcher-close').tap();
      await expect(rows).toHaveCount(3);
      await expect(trigger).toHaveAttribute('data-count', '3');

      await page.keyboard.press('Escape');
      await expect(panel).toHaveCount(0);
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await expect(trigger).toBeFocused();

      await trigger.tap();
      await rows.nth(1).getByTestId('tab-switcher-tab').tap();
      await expect(trigger).toContainText('Beam B');
      expect(await page.evaluate(() => window.__stabileo.nodeCount())).toBe(0);

      await page.setViewportSize({ width: 1280, height: 800 });
      await expect(page.locator('.tab-bar .tab')).toHaveCount(3);
      await expect(trigger).toHaveCount(0);
    });
  });
}

test.describe('@smoke PRO tabs on a 360 px phone', () => {
  test.use({ viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true });

  test('the save status moves into the dropdown and the header still fits', async ({ page }) => {
    await page.goto('/app/pro?e2e=1');
    await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 30_000 });
    await page.evaluate(async () => { await window.__stabileoActions.loadExample('3d-portal-frame'); });
    const trigger = page.getByTestId('tab-switcher');
    await expect(trigger.locator('.mts-save')).toHaveAttribute('data-state', 'changed');
    await expect(page.locator('.header-actions [data-testid=pro-save-status]')).toHaveCount(0);
    const fit = await headerOverflow(page);
    expect(fit.header, 'header scrolls sideways').toBeLessThanOrEqual(0);
    expect(fit.rightmost, 'a header control ends past the edge').toBeLessThanOrEqual(fit.width);

    await trigger.tap();
    const status = page.getByTestId('tab-switcher-panel').getByTestId('pro-save-status');
    await expect(status).toBeVisible();
    await expect(status).toContainText(/\S/);
    await status.tap();
    await expect(page.getByTestId('tab-switcher-panel')).toHaveCount(0);
    await expect(trigger.locator('.mts-save')).toHaveAttribute('data-state', /saved|degraded/, { timeout: 30_000 });
  });
});

test.describe('@smoke tabs on a phone held sideways', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('a tablet-wide but short touch screen gets the dropdown, and a mouse at the same size keeps the strip', async ({ page }) => {
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 30_000 });
    await expect(page.getByTestId('tab-switcher')).toBeVisible();
    await addTab(page);
    await page.getByTestId('tab-switcher').tap();
    await expect(page.getByTestId('tab-switcher-row')).toHaveCount(2);
    const fit = await headerOverflow(page);
    expect(fit.header, 'header scrolls sideways').toBeLessThanOrEqual(0);
    expect(fit.page, 'page scrolls sideways').toBeLessThanOrEqual(0);
  });
});

test.describe('@smoke tabs on a short desktop window', () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test('keeps the strip for a mouse', async ({ page }) => {
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 30_000 });
    await expect(page.locator('.tab-bar')).toBeVisible();
    await expect(page.getByTestId('tab-switcher')).toHaveCount(0);
  });
});
