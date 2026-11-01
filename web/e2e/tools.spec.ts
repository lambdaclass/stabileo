import { test, expect, type Locator, type Page } from '@playwright/test';
import { BATCH_IDS } from '../src/components/tools/batch';
import { TOOL_IDS, formula, format, workedExamples } from '../src/components/tools/calculators';

const difference = async (agreement: Locator) => {
  const raw = await agreement.getAttribute('data-difference');
  expect(raw).not.toBeNull();
  expect(raw!.trim()).not.toBe('');
  const value = Number(raw);
  expect(Number.isFinite(value)).toBe(true);
  return value;
};
const shown = async (locator: Locator) => Number((await locator.first().textContent())!.replace(/[^0-9.eE+−-]/g, '').replace('−', '-'));
const near = (actual: number, expected: number, relative: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(relative * Math.abs(expected));
const pageOverflow = (page: Page) => page.evaluate(() => [...document.querySelectorAll('main *')].filter(el => {
  for (let parent = el.parentElement; parent && parent.tagName !== 'MAIN'; parent = parent.parentElement) if (getComputedStyle(parent).overflowX !== 'visible') return false;
  const box = el.getBoundingClientRect();
  return box.width > 0 && (box.right > innerWidth + 1 || box.left < -1);
}).map(el => `${el.tagName.toLowerCase()}.${el.className}`));
const DEFAULT_VALUES: Record<string, number> = { 'simply-supported-beam': 0.010546875, 'cantilever-beam': 0.10125, 'column-buckling': 4386.490844928604, 'continuous-beam': 0.0043870585, 'influence-line': 15, 'beam-natural-frequency': 17.453292519943297 };

for (const id of TOOL_IDS) test(`@smoke tools ${id} computes and opens the same model`, async ({ page, request }) => {
  const html = await (await request.get(`/en/tools/${id}/`)).text();
  expect(html).toContain('id="prerender"');
  for (const p of workedExamples(id)) expect(html).toContain(`data-value="${format(formula(id, p).value)}"`);
  await page.goto(`/en/tools/${id}/?e2e=1`);
  const agreement = page.getByTestId('agreement');
  await expect(agreement).toBeVisible();
  expect(await difference(agreement)).toBeLessThan(id === 'column-buckling' ? 3e-6 : 1e-9);
  near(await shown(page.getByTestId('engine-value')), DEFAULT_VALUES[id], 6e-5);
  await expect(page.getByTestId('validity-warning')).toHaveCount(0);
  await expect(page.getByTestId('worked-example')).toHaveCount(workedExamples(id).length);
  const literal = { 'simply-supported-beam': ['0.010546875', '0.0028125'], 'cantilever-beam': ['0.10125', '0.045'], 'column-buckling': ['17545.9633797', '8952.02213251', '4386.49084493', '1096.62271123'] }[id];
  for (const [j, value] of literal.entries()) near(Number(await page.getByTestId('worked-example').nth(j).getAttribute('data-value')), Number(value), 1e-11);
  for (const [j, p] of workedExamples(id).entries()) await expect(page.getByTestId('worked-example').nth(j)).toHaveAttribute('data-value', format(formula(id, p).value));
  const before = await page.getByTestId('engine-value').textContent();
  await page.getByTestId('e').fill('100000');
  await expect(agreement).toHaveCount(0);
  await expect(page.getByTestId('engine-value')).not.toHaveText(before!);
  await expect(agreement).toBeVisible();
  const expectedMembers = id === 'column-buckling' ? 32 : id === 'cantilever-beam' ? 1 : 2;
  await page.getByRole('link', { name: /^Open in Stabileo/ }).click();
  await expect(page).toHaveURL(/\/app\/basic\?e2e=1#data=2\./);
  await expect.poll(() => page.evaluate(() => (window as any).__stabileo?.memberAxialForces()?.length ?? 0), { timeout: 60000 }).toBe(expectedMembers); // slow-ok: The editor initializes WASM and solves the shared calculator model before publishing member forces.
  const materials = await page.evaluate(() => (window as any).__stabileo.entityData('setting', 'materials'));
  expect(materials[0][1].e).toBe(100000);
  const section = await page.evaluate(() => (window as any).__stabileo.entityData('section', 1));
  expect(section.iz).toBe(0.00008);
});

for (const [width, height] of [[360, 800], [390, 844], [844, 390], [810, 1080]]) {
  for (const id of [...TOOL_IDS, ...BATCH_IDS]) test(`@smoke tools ${id} at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`/en/tools/${id}/?e2e=1`);
    await expect(page.getByTestId('agreement')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await pageOverflow(page)).toEqual([]);
    expect((await page.locator('.tool-viewer').boundingBox())!.y).toBeLessThan(height <= 400 ? height - 120 : 450);
    if (width < 1120) {
      const title = (await page.locator('h1').boundingBox())!;
      const viewer = (await page.locator('.tool-viewer').boundingBox())!;
      const form = (await page.locator('form').boundingBox())!;
      expect(viewer.y).toBeGreaterThan(title.y + title.height);
      expect(form.y).toBeGreaterThan(viewer.y + viewer.height);
    }
    for (const control of await page.locator('main input, main textarea, main select, main button, main summary, main a, .open-editor').all()) {
      if (!await control.isVisible()) continue;
      const box = (await control.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(await control.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
    }
  });
}
for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) test(`@smoke tools localized index ${locale}`, async ({ page }) => {
  await page.goto(`/${locale}/tools/`);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.tool-card h2 a')).toHaveCount(8);
  await expect(page.locator('.tool-card')).toHaveCount(8);
  await expect(page.locator('.tool-card .badge')).toHaveCount(0);
  for (const link of await page.locator('.tool-card h2 a, main .btn').all()) {
    const box = (await link.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await expect(page.locator('nav [data-nav="tools"]')).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://stabileo.com/${locale}/tools/`);
  for (const lang of ['en', 'es', 'pt', 'de', 'fr', 'tr']) await expect(page.locator(`link[hreflang="${lang}"]`)).toHaveAttribute('href', `https://stabileo.com/${lang}/tools/`);
});

for (const id of BATCH_IDS) test(`@smoke tools ${id} prerender and editor handoff`, async ({ page, request }) => {
  const html = await (await request.get(`/en/tools/${id}/`)).text();
  expect(html).toContain('id="prerender"');
  await page.goto(`/en/tools/${id}/?e2e=1`);
  await expect(page.getByTestId('agreement')).toBeVisible();
  expect(await difference(page.getByTestId('agreement'))).toBeLessThan(id === 'portal-frame' ? .002 : .00002);
  if (id in DEFAULT_VALUES) near(await shown(page.getByTestId('engine-value')), DEFAULT_VALUES[id], id === 'beam-natural-frequency' ? 3e-5 : 2e-5);
  if (id === 'portal-frame') near(await shown(page.getByTestId('sway')), 0.0056325, 2e-5);
  if (id === 'truss-2d') await expect(page.getByTestId('axial-force')).toHaveText(['N1: 15 kN', 'N2: 15 kN', 'N3: 15 kN', 'N4: 15 kN', 'N5: -21.2132 kN', 'N6: -20 kN', 'N7: -20 kN', 'N8: -21.2132 kN', /^N9: /, 'N10: -10 kN', /^N11: /, 'N12: 7.07107 kN', 'N13: 7.07107 kN']);
  await expect(page.getByTestId('validity-warning')).toHaveCount(0);
  const before = await page.getByTestId(id === 'portal-frame' ? 'sway' : 'engine-value').first().textContent();
  await page.getByTestId('e').fill('100000');
  await expect(page.getByTestId('agreement')).toBeVisible();
  if (id !== 'influence-line') await expect(page.getByTestId(id === 'portal-frame' ? 'sway' : 'engine-value').first()).not.toHaveText(before!);
  await page.getByRole('link', { name: /^Open in Stabileo/ }).click();
  await expect(page).toHaveURL(/\/app\/basic\?e2e=1#data=2\./);
  await expect.poll(() => page.evaluate(() => (window as any).__stabileo?.memberAxialForces()?.length ?? 0), { timeout: 60000 }).toBeGreaterThan(0); // slow-ok: The editor initializes WASM and solves the shared batch-tool model before publishing member forces.
  const materials = await page.evaluate(() => (window as any).__stabileo.entityData('setting', 'materials'));
  expect(materials[0][1].e).toBe(100000);
});

// Exercise Root's in-place lazy mount separately from the ordinary full-document links.
test('@smoke tools shared model survives a client-side editor transition', async ({ page }) => {
  await page.goto('/en/tools/continuous-beam/?e2e=1');
  const link = page.getByRole('link', { name: /^Open in Stabileo/ });
  await expect(link).toHaveAttribute('href', /#data=2\./);
  const origin = await page.evaluate(() => performance.timeOrigin);
  await page.evaluate(href => {
    history.pushState(null, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, (await link.getAttribute('href'))!);
  await expect.poll(() => page.evaluate(() => (window as any).__stabileo?.memberAxialForces()?.length ?? 0)).toBeGreaterThan(0);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  await expect(page.locator('canvas').first()).toBeVisible();
});

test('@smoke tools warn when the deflection leaves small-deflection theory', async ({ page }) => {
  await page.goto('/en/tools/simply-supported-beam/?e2e=1');
  await expect(page.getByTestId('agreement')).toBeVisible();
  await page.getByTestId('e').fill('1');
  await expect(page.getByTestId('validity-warning')).toContainText('1/50');
  await page.goto('/en/tools/portal-frame/?e2e=1');
  await page.getByTestId('length').fill('0.1');
  await page.getByTestId('height').fill('100');
  await expect(page.getByTestId('validity-warning')).toHaveCount(2);
});

test('@smoke tools refuse a decimal comma in span lists', async ({ page }) => {
  await page.goto('/es/tools/continuous-beam/?e2e=1');
  await expect(page.getByTestId('agreement')).toBeVisible();
  await page.locator('#spans').fill('6,5, 6');
  await expect(page.locator('[role=alert]').filter({ hasText: '6.5' })).toBeVisible();
  await expect(page.getByTestId('agreement')).toHaveCount(0);
});

for (const id of ['simply-supported-beam', 'beam-natural-frequency']) test(`@smoke tools ${id} localized at 390x844 and 844x390`, async ({ page }) => {
  for (const [width, height] of [[390, 844], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`/de/tools/${id}/?e2e=1`);
    await expect(page.getByTestId('agreement')).toBeVisible();
    expect(await pageOverflow(page)).toEqual([]);
    expect((await page.locator('.tool-viewer').boundingBox())!.y).toBeLessThan(height <= 400 ? height - 120 : 450);
    await expect(page.locator('main')).not.toContainText('Dense solver');
    await expect(page.locator('main')).not.toContainText('Residual');
  }
});
