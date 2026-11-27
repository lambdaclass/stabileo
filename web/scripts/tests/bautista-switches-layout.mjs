import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { assertNoGameLinks, startWithSwitchesOff } from './bautista-switches.mjs';
import { readFileSync } from 'node:fs';
const exampleCopy = JSON.parse(readFileSync(new URL('../../src/components/examples/main-copy.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ headless: true });
const base = process.env.BAUTISTA_URL ?? 'http://127.0.0.1:4186';
try {
  for (const [name, width, height] of [['phone', 390, 844], ['tablet', 768, 1024]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await startWithSwitchesOff(page);
    await page.goto(`${base}/en/`);
    await page.locator('h1').waitFor();
    for (const path of ['examples', 'tools', 'research']) assert.ok(await page.locator(`a[href="/en/${path}/"]`).count() > 0, `${name}: ${path} remains linked`);
    await assertNoGameLinks(page);
    assert.equal(await page.locator('a[href*="mohr-"]').count(), 0);
    for (const [path, selector] of [
      ['/en/tools/', 'li.tool-card:has(a[href="/en/tools/simply-supported-beam/"])'],
      ['/en/tools/simply-supported-beam/', '[data-testid="agreement"]'],
      ['/en/examples/', '[data-testid="card-beam-frame"]'],
      ['/en/examples/beam-frame/', '[data-testid="certificate"]'],
      ['/en/research/stability/feher-sipos-varkonyi-2026/', '#shape-theta'],
      ['/en/paper/', 'h1'],
    ]) {
      await page.goto(base + path);
      await page.locator(selector).waitFor();
      if (path === '/en/examples/beam-frame/') assert.equal(await page.locator('h1').textContent(), exampleCopy.en['beam-frame.title']);
      assert.equal(await page.locator('#shape-q, #shape-members, #why, [data-testid="card-mohr-2d"], [data-testid="card-mohr-3d"]').count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: ${path} overflows`);
      await page.screenshot({ path: `.bautista-r2-${name}-${path.split('/').filter(Boolean).slice(-1)[0]}.png` });
    }
    await page.goto(`${base}/hu/research/stability/feher-sipos-varkonyi-2026/?round=2#checks`);
    await page.locator('#shape-theta').waitFor();
    assert.equal(new URL(page.url()).pathname, '/en/research/stability/feher-sipos-varkonyi-2026/');
    assert.equal(new URL(page.url()).search, '?round=2');
    assert.equal(new URL(page.url()).hash, '#checks');
    await page.evaluate(() => {
      for (const name of ['research', 'tools', 'diagram-game']) localStorage.setItem(`stabileo-feature-${name}`, '1');
    });
    await page.goto(`${base}/hu/research/stability/feher-sipos-varkonyi-2026/`);
    await page.locator('#shape-q').waitFor();
    assert.equal(new URL(page.url()).pathname, '/hu/research/stability/feher-sipos-varkonyi-2026/');
    await page.locator('#why').waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    for (const [path, testid] of [['/en/tools/mohr-2d/', 'mohr2d-go-tmax'], ['/en/games/diagram-game/', 'dg-start']]) {
      await page.goto(base + path);
      await page.getByTestId(testid).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (testid === 'dg-start') {
        await page.getByTestId(testid).click();
        await page.getByTestId('dg-options').waitFor();
        assert.ok(await page.locator('[data-testid^="dg-option-"] svg').count() >= 3);
      }
    }
    assert.deepEqual(errors, [], `${name}: browser errors`);
    await page.close();
  }
  console.log('phone 390×844 and tablet 768×1024: main pages remain visible with switches off; Fehér controls, Hungarian research, Mohr and game appear only when enabled');
} finally {
  await browser.close();
}
