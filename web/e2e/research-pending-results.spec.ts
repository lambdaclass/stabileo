import { expect, test } from '@playwright/test';

test('stopping a moment change preserves the displayed replay', async ({ page }) => {
  await page.addInitScript(() => { window.Worker = class { postMessage() {} terminate() {} } as unknown as typeof Worker; });
  await page.goto('/en/research/stability/ferrari-sigmund-2025/');
  const select = page.getByTestId('ferrari-sign');
  const original = await select.inputValue();
  await select.selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(select).toHaveValue(original);
  await expect(page.getByTestId('ferrari-source')).toContainText('Precomputed replay');
});

test('stopping a portal update restores its model', async ({ page }) => {
  await page.route(/dedaliano_engine_bg[^/]*\.wasm/, () => {});
  await page.goto('/en/research/benchmarks/plastic-collapse/');
  const height = page.getByTestId('height');
  const original = await height.inputValue();
  await height.fill('4');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(height).toHaveValue(original);
});

test('mesh links respect the running Mattiasson mesh', async ({ page }) => {
  await page.route(/dedaliano_engine_bg[^/]*\.wasm/, () => {});
  await page.goto('/en/research/benchmarks/mattiasson-elastica/');
  const mesh = page.locator('.benchmark-pane select');
  await expect(mesh).toBeDisabled();
  await page.locator('.rs-xlink').filter({ hasText: '64' }).click();
  await expect(mesh).toHaveValue('16');
});

test('an interrupted custom plate has no measured field', async ({ page }) => {
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

test('known wrong result: #2505 — the Fairclough paper row sends a live request', async ({ page }) => {
  await page.addInitScript(() => {
    window.Worker = class {
      postMessage() { document.documentElement.dataset.liveLayout = 'requested'; }
      terminate() {}
    } as unknown as typeof Worker;
  });
  await page.goto('/en/research/optimisation/fairclough-2026/');
  await page.locator('.rs-xlink').filter({ hasText: '1.65' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-live-layout', 'requested');
});

test('known wrong result: #2505 — thin plate warns when the predicted displacement exceeds its thickness', async ({ page }) => {
  await page.goto('/en/research/benchmarks/navier-plate/');
  await page.getByTestId('navier-t').selectOption('0.02');
  await expect(page.getByTestId('navier-small-deflection')).toContainText(/thickness/i);
  await page.getByTestId('navier-t').selectOption('0.1');
  await expect(page.getByTestId('navier-small-deflection')).toHaveCount(0);
});

test.skip('known wrong result: #2505 — a built shell mesh reports initialization failure and offers retry', async ({ page }) => {
  await page.route(/dedaliano_engine_bg[^/]*\.wasm/, route => route.abort());
  await page.goto('/en/research/benchmarks/shell-obstacle-course/');
  await page.getByTestId('try-roof-20').click();
  await expect(page.getByTestId('selected-result')).toContainText(/fail|error/i);
  await expect(page.getByTestId('retry-mesh')).toBeEnabled();
});
