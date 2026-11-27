import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { assertNoGameLinks, startWithSwitchesOff } from './bautista-switches.mjs';
const browser = await chromium.launch({ headless: true });
const base = process.env.BAUTISTA_URL ?? 'http://127.0.0.1:4001';
try {
  for (const [name, width, height] of [['phone', 390, 844], ['tablet', 768, 1024]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await startWithSwitchesOff(page);
    await page.goto(`${base}/hu/`);
    await page.locator('h1').waitFor();
    await assertNoGameLinks(page);
    assert.equal(await page.locator('a[href*="/tools/mohr-"]').count(), 0);
    for (const section of ['tools', 'research', 'examples']) assert.ok(await page.locator(`a[href$="/${section}/"]`).count() > 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `.bautista-${name}-landing.png` });
    await page.goto(`${base}/hu/blog/verificacion-flexion-cirsoc-201/`);
    await page.getByText('Nem felel meg', { exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `.bautista-${name}-article.png` });
    await page.evaluate(() => {
      for (const name of ['research', 'tools', 'diagram-game']) localStorage.setItem(`stabileo-feature-${name}`, '1');
    });
    for (const [path, testid] of [['/en/tools/mohr-2d/', 'mohr2d-go-tmax'], ['/en/games/diagram-game/', 'dg-start']]) {
      await page.goto(base + path);
      await page.getByTestId(testid).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (testid === 'dg-start') {
        await page.getByTestId(testid).click();
        await page.getByTestId('dg-options').waitFor();
        assert.ok(await page.locator('[data-testid^="dg-option-"] svg').count() >= 3);
      }
      await page.screenshot({ path: `.bautista-${name}-${testid}.png` });
    }
    await page.goto(`${base}/en/tools/simply-supported-beam/`);
    await page.getByTestId('agreement').waitFor();
    const stale = await page.getByTestId('e').evaluate(async node => {
      node.value = '100000';
      node.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      return document.querySelector('[data-testid="tool-results"]')?.getAttribute('aria-busy');
    });
    assert.equal(stale, 'true');
    assert.deepEqual(errors, [], `${name}: uncaught browser errors`);
    await page.close();
  }
  console.log('phone 390×844 and tablet 768×1024: switches-off landing, Hungarian correction, enabled Mohr and diagram game pass');
} finally {
  await browser.close();
}
