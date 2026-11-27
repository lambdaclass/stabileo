import { expect, test } from '@playwright/test';
import archReplay from '../../research/benchmarks/dadeppo-arch-1975/results/stabileo_results.json' with { type: 'json' };
import arch from '../../engine/tests/benchmarks/dadeppo_arch.json' with { type: 'json' };

test('@smoke stopping a moment change preserves the displayed replay', async ({ page }) => {
  await page.addInitScript(() => { window.Worker = class { postMessage() {} terminate() {} } as unknown as typeof Worker; });
  await page.goto('/en/research/stability/ferrari-sigmund-2025/');
  const select = page.getByTestId('ferrari-sign');
  const original = await select.inputValue();
  const displayed = await select.locator('option:checked').innerText();
  await select.selectOption({ index: 1 });
  await expect(page.getByTestId('ferrari-source')).toContainText(displayed);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(select).toHaveValue(original);
  await expect(page.getByTestId('ferrari-source')).toContainText('Precomputed replay');
});

test('@smoke stopping a portal update restores its model', async ({ page }) => {
  await page.route(/dedaliano_engine_bg[^/]*\.wasm/, () => {});
  await page.goto('/en/research/benchmarks/plastic-collapse/');
  const height = page.getByTestId('height');
  const original = await height.inputValue();
  const description = await page.getByTestId('model').innerText();
  await height.fill('4');
  await expect(page.getByTestId('model')).toHaveText(description);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(height).toHaveValue(original);
});

test('@smoke mesh links respect the running Mattiasson mesh', async ({ page }) => {
  await page.route(/dedaliano_engine_bg[^/]*\.wasm/, () => {});
  await page.goto('/en/research/benchmarks/mattiasson-elastica/');
  const mesh = page.locator('.benchmark-pane select');
  await expect(mesh).toBeDisabled();
  await expect(page.locator('.rs-xlink').filter({ hasText: '64' })).toBeDisabled();
  await expect(mesh).toHaveValue('16');
});

test('@smoke an interrupted custom plate has no measured field', async ({ page }) => {
  await page.addInitScript(() => {
    window.Worker = class {
      postMessage() {}
      terminate() { document.documentElement.dataset.plateTerminated = 'true'; }
    } as unknown as typeof Worker;
  });
  await page.goto('/en/research/benchmarks/navier-plate/');
  await page.getByTestId('navier-n').selectOption('8');
  await expect(page.getByTestId('navier-results')).toBeHidden();
  await expect(page.getByTestId('navier-plate-centre')).toHaveText('…');
  await expect(page.locator('.navier .sfv-canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-plate-terminated', 'true');
  await expect(page.getByTestId('navier-source')).toContainText(/stop|interrupt/i);
});

test('@smoke the Fairclough paper row sends a live request', async ({ page }) => {
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

test('@smoke thin plate warns when the predicted displacement exceeds its thickness', async ({ page }) => {
  await page.goto('/en/research/benchmarks/navier-plate/');
  await page.getByTestId('navier-t').selectOption('0.02');
  await expect(page.getByTestId('navier-small-deflection')).toContainText(/thickness/i);
  await page.getByTestId('navier-t').selectOption('0.1');
  await expect(page.getByTestId('navier-small-deflection')).toHaveCount(0);
});

test('@smoke a built shell mesh reports initialization failure and offers retry', async ({ page }) => {
  await page.route(/dedaliano_engine_bg[^/]*\.wasm/, route => route.abort());
  await page.goto('/en/research/benchmarks/shell-obstacle-course/');
  await page.getByTestId('try-roof-20').click();
  await expect(page.getByTestId('selected-result')).toContainText(/fail|error/i);
  await expect(page.getByTestId('retry-mesh')).toBeEnabled();
});

for (const elements of [20, 80] as const) {
  test(`@smoke matching the ${elements}-element arch peak alone cannot certify the descending branch`, async ({ page }) => {
    const { loadFactor, uOverR, vOverR, rotation } = archReplay.convergence.meshes.find(mesh => mesh.elements === elements)!;
    const maxSteps = elements === 80 ? arch.input.maxSteps / 2 : arch.input.maxSteps;
    const frame = { step: maxSteps, loadFactor, displacements: Array.from({ length: elements + 1 }, (_, i) => ({ nodeId: i, ux: 0, uz: 0, ry: 0 })) };
    const steps = Array.from({ length: maxSteps }, (_, i) => ({ step: i + 1, converged: true, loadFactor: i === maxSteps - 1 ? loadFactor * 0.99 : loadFactor }));
    const crown = { uOverR, vOverR, rotation };
    await page.addInitScript(data => {
      window.Worker = class {
        onmessage?: (event: { data: unknown }) => void;
        postMessage() { this.onmessage?.({ data }); }
        terminate() {}
      } as unknown as typeof Worker;
    }, { frame, steps, limit: { loadFactor, crown }, done: true });
    await page.goto('/en/research/benchmarks/dadeppo-arch-1975/');
    const controls = page.locator('.controls');
    await controls.locator('select').first().selectOption(String(elements));
    await expect(controls.locator('option[value="400"]')).toContainText(String(maxSteps));
    await controls.locator('button').first().click();
    await expect(page.getByTestId('arch-verdict')).toHaveText('Outside tolerance');
  });
}

test('@smoke a shell retry recovers after the WASM download becomes available', async ({ page }) => {
  const binary = /dedaliano_engine_bg[^/]*\.wasm/;
  await page.route(binary, route => route.abort());
  await page.goto('/en/research/benchmarks/shell-obstacle-course/');
  await page.getByTestId('try-roof-20').click();
  const retry = page.getByTestId('retry-mesh');
  await expect(retry).toBeVisible();
  await page.unroute(binary);
  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect(page.getByTestId('selected-result')).toContainText(/pass/i);
});

test('@smoke discarded plate rows cannot enter the next run', async ({ page }) => {
  await page.addInitScript(() => {
    window.Worker = class {
      onmessage?: (event: {data: unknown}) => void;
      postMessage() {
        if (document.documentElement.dataset.firstPlateWorker) return;
        document.documentElement.dataset.firstPlateWorker = 'true';
        window.addEventListener('deliver-plate-row', () => this.onmessage?.({ data: {
          row: { family: 'DKT', n: 4, center_mm: 1, values: [] }, index: 0
        } }), { once: true });
      }
      terminate() {}
    } as unknown as typeof Worker;
  });
  await page.goto('/en/research/benchmarks/navier-plate/');
  const run = page.getByRole('button', { name: 'Recompute live' });
  await run.click();
  await page.getByRole('button', { name: 'Restart' }).click();
  await expect(page.getByTestId('navier-results').locator('tbody tr')).toHaveCount(6);
  await run.click();
  await page.evaluate(() => window.dispatchEvent(new Event('deliver-plate-row')));
  await expect(page.getByTestId('navier-results').locator('tbody tr')).toHaveCount(0);
});
