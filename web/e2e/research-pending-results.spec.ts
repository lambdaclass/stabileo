import { expect, test } from '@playwright/test';

test.skip('known wrong result: #2505 stopping a moment change preserves the displayed replay', async ({ page }) => {
  await page.addInitScript(() => { window.Worker = class { postMessage() {} terminate() {} } as unknown as typeof Worker; });
  await page.goto('/en/research/stability/ferrari-sigmund-2025/');
  const select = page.getByTestId('ferrari-sign');
  const original = await select.inputValue();
  await select.selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(select).toHaveValue(original);
  await expect(page.getByTestId('ferrari-source')).toContainText('Precomputed replay');
});

test.skip('known wrong result: #2505 stopping a portal update restores its model', async ({ page }) => {
  await page.route(/dedaliano_engine_bg[^/]*\.wasm/, () => {});
  await page.goto('/en/research/benchmarks/plastic-collapse/');
  const height = page.getByTestId('height');
  const original = await height.inputValue();
  await height.fill('4');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(height).toHaveValue(original);
});

test.skip('known wrong result: #2505 mesh links respect the running Mattiasson mesh', async ({ page }) => {
  await page.route(/dedaliano_engine_bg[^/]*\.wasm/, () => {});
  await page.goto('/en/research/benchmarks/mattiasson-elastica/');
  const mesh = page.locator('.benchmark-pane select');
  await expect(mesh).toBeDisabled();
  await page.locator('.rs-xlink').filter({ hasText: '64' }).click();
  await expect(mesh).toHaveValue('16');
});

test.skip('known wrong result: #2505 an interrupted custom plate has no measured field', async ({ page }) => {
  await page.addInitScript(() => {
    window.Worker = class {
      postMessage() {}
      terminate() { document.documentElement.dataset.plateTerminated = 'true'; }
    } as unknown as typeof Worker;
  });
  await page.goto('/en/research/benchmarks/navier-plate/');
  await page.getByTestId('navier-n').selectOption('8');
  await expect(page.getByTestId('navier-plate-centre')).toHaveText('…');
  await expect(page.locator('.navier .sfv-canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-plate-terminated', 'true');
  await expect(page.getByTestId('navier-source')).toContainText(/stop|interrupt/i);
});
