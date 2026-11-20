import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = '/scripts/tests/fixtures/pro-mesher-inputs.html';

test('production PRO mesher validates all drawn boundaries', async (t) => {
  const server = await createServer({ root, mode: 'production', server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  t.after(() => server.close());
  await server.listen();
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const url = new URL(fixture, server.resolvedUrls.local[0]);

  async function open() {
    const page = await browser.newPage();
    await page.goto(url.href);
    const mesher = page.getByTestId('mesher');
    await expect(mesher).toBeVisible();
    assert.equal(await page.evaluate(() => window.mesherFixture.unified), false);
    return { page, mesher, outline: page.getByTestId('ms-outline'), apply: page.getByTestId('ms-apply') };
  }

  for (const bad of ['1, 2, 999', '1, 2, 3, 4, typo', '1, 2, 3, 2']) {
    await t.test(`refuses outline ${bad}`, async () => {
      const { page, mesher, outline, apply } = await open();
      try {
        await outline.fill(bad);
        await expect(apply).toBeDisabled();
        await expect(mesher.getByText(/check the outline and data/i)).toBeVisible();
        assert.equal(await page.evaluate(() => window.mesherFixture.area()), 0);
        await outline.fill('1, 2, 3, 4');
        await apply.click();
        assert.equal(await page.evaluate(() => window.mesherFixture.area()), 16);
      } finally {
        await page.close();
      }
    });
  }

  for (const bad of ['5, 6, 999', '5, 6, 7, typo', '5, 6, 7, 6', '']) {
    await t.test(`refuses polygon hole ${JSON.stringify(bad)}`, async () => {
      const { page, mesher, outline, apply } = await open();
      try {
        await outline.fill('1; 2, 3 4');
        await page.getByTestId('ms-add-hole').click();
        await mesher.locator('.ms-hole select').selectOption('polygon');
        const hole = mesher.locator('.ms-hole input');
        await hole.fill(bad);
        await expect(apply).toBeDisabled();
        await expect(mesher.getByText(/check the outline and data/i)).toBeVisible();
        assert.equal(await page.evaluate(() => window.mesherFixture.area()), 0);
        const triangular = bad === '5, 6, 999';
        await hole.fill(triangular ? '5, 6, 7' : '5, 6, 7, 8');
        await apply.click();
        expect(await page.evaluate(() => window.mesherFixture.area())).toBeCloseTo(triangular ? 15.5 : 15, 9);
      } finally {
        await page.close();
      }
    });
  }

  await t.test('refuses a circle with a missing coordinate even after a valid polygon hole', async () => {
    const { page, mesher, outline, apply } = await open();
    try {
      await outline.fill('1, 2, 3, 4');
      await page.getByTestId('ms-add-hole').click();
      await mesher.locator('.ms-hole select').selectOption('polygon');
      await mesher.locator('.ms-hole input').fill('5, 6, 7, 8');
      await page.getByTestId('ms-add-hole').click();
      const center = page.getByTestId('ms-hole-center-1');
      await center.fill('3; 3;');
      await expect(apply).toBeDisabled();
      await expect(mesher.getByText(/check the outline and data/i)).toBeVisible();
      assert.equal(await page.evaluate(() => window.mesherFixture.area()), 0);
      await center.fill('3; 3; 0');
      await expect(apply).toBeEnabled();
      await apply.click();
      const area = await page.evaluate(() => window.mesherFixture.area());
      assert.ok(area > 0 && area < 15);
    } finally {
      await page.close();
    }
  });
});
