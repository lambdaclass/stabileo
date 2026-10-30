import { test, expect } from '@playwright/test';
import type { StabileoTestHooks, StabileoTestActions } from '../src/lib/utils/e2e-hooks';
import { strings } from '../src/components/research/macneal1985/i18n';

const route = '/research/benchmarks/macneal-harder-1985/';
test('production engine benchmark results and editor handoff @smoke', async ({ page }) => {
  await page.addInitScript(() => {
    const open = window.open.bind(window);
    window.open = (url, target, features) => {
      const destination = new URL(String(url), location.href);
      destination.searchParams.set('e2e', '1');
      return open(destination.href, target, features);
    };
  });
  await page.goto(`/en${route}`);
  await expect(page.getByTestId('benchmark-summary')).toContainText('8/12', { timeout: 120_000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Results', exact: true }).click();
  const frame = page.getByTestId('frame-shear-1-uz');
  await expect(frame.getByTestId('computed')).toHaveText('0.0036');
  await expect(frame.getByTestId('classification')).toHaveText('Pass');
  await expect(page.getByTestId('classification').filter({ hasText: /^Pass$/ })).toHaveCount(8);
  await expect(page.getByTestId('classification').filter({ hasText: /^Fail$/ })).toHaveCount(4);
  await expect(page.getByTestId('solver-error')).toHaveCount(0);
  await expect(page.getByTestId('mitc4-trapezoidal-in').getByRole('link')).toHaveAttribute('href', /KNOWN_ISSUES.md#mh-mitc4-distortion/);
  await page.getByRole('button', { name: 'Run again', exact: true }).click();
  await expect(page.getByTestId('benchmark-summary')).toContainText('8/12');
  await expect(page.getByTestId('solver-error')).toHaveCount(0);
  await frame.getByRole('button').click();
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open in Stabileo', exact: true }).click();
  const editor = await opened;
  await expect(editor).toHaveURL(/\/app(?:\/basic)?\?e2e=1/);
  await expect.poll(() => editor.evaluate(() => (window as unknown as { __stabileo?: StabileoTestHooks }).__stabileo?.nodeCount()), { timeout: 120_000 }).toBe(2);
  const imported = await editor.evaluate(() => {
    const h = (window as unknown as { __stabileo: StabileoTestHooks }).__stabileo;
    return { census: h.modelCensus(), tip: h.nodePosition(2), loads: h.allLoads() };
  });
  expect(imported.census).toMatchObject({ nodes: 2, elements: 1, supports: 1, loads: 1 });
  expect(imported.tip).toEqual({ x: 6, y: 0, z: 0 });
  expect(imported.loads[0]).toMatchObject({ type: 'nodal', data: { nodeId: 2, fy: -1 } });
  await editor.evaluate(() => (window as unknown as { __stabileoActions: StabileoTestActions }).__stabileoActions.solve());
  await expect.poll(() => editor.evaluate(() => (window as unknown as { __stabileo: StabileoTestHooks }).__stabileo.nodalDisplacements()?.find(d => d.nodeId === 2)?.uz), { timeout: 120_000 }).toBeCloseTo(-0.0036, 8);
});

for (const locale of ['en', 'es', 'pt'] as const) {
  test(`benchmark localized static page and sitemap ${locale} @smoke`, async ({ browser, request, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await context.newPage();
    await page.goto(`/${locale}${route}`);
    await expect(page.getByRole('heading', { name: strings[locale].title, exact: true })).toBeVisible();
    await expect(page.getByText(strings[locale].limitations, { exact: true })).toBeVisible();
    expect(await (await request.get('/sitemap.xml')).text()).toContain(`/${locale}${route}</loc>`);
    await context.close();
  });
}
