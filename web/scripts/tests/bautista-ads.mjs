import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 768, height: 1024 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.BAUTISTA_URL ?? 'http://localhost:4000');
  await page.evaluate(async () => {
    const { mount } = await import('/node_modules/.vite/deps/svelte.js');
    const { default: Tree } = await import('/src/admin/ads/AdsTree.svelte');
    const target = document.createElement('div');
    document.body.replaceChildren(target);
    const row = { accounts: 1, paid: 0, analyzed: 0, saved: 0, exported: 0, return_eligible: 0, returned: 0, median_hours_to_save: null };
    mount(Tree, { target, props: { campaigns: [
      { ...row, channel: 'search', campaign: 'A', ad_sets: [{ ...row, ad_set: 'B', ads: [] }] },
      { ...row, channel: 'search', campaign: 'A|B', ad_sets: [] },
    ] } });
  });
  await page.locator('.ads-twist').click();
  await page.waitForTimeout(100);
  assert.deepEqual(errors, [], 'known wrong result: #1251 T25 — expanding valid hierarchy names must not collide');
  assert.equal(await page.locator('tbody tr').count(), 3);
} finally {
  await browser.close();
}
