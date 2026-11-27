import { expect, test } from '@playwright/test';
import plateReplay from '../../research/benchmarks/navier-plate/results/stabileo_results.json' with { type: 'json' };
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
      postMessage(request: { unitWeight: number }) {
        const data = document.documentElement.dataset;
        data.layoutRequests = JSON.stringify([...JSON.parse(data.layoutRequests ?? '[]'), request.unitWeight]);
      }
      terminate() {}
    } as unknown as typeof Worker;
  });
  await page.goto('/en/research/optimisation/fairclough-2026/');
  const requests = () => page.evaluate(() => JSON.parse(document.documentElement.dataset.layoutRequests ?? '[]') as number[]);
  const before = await requests();
  await page.locator('.rs-xlink').filter({ hasText: '1.65' }).click();
  await expect.poll(requests).toEqual([...before, 1.65]);
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
        postMessage() {
          for (const step of [20, 60, data.frame.step]) this.onmessage?.({ data: { frame: { ...data.frame, step }, steps: data.steps } });
          this.onmessage?.({ data: { limit: data.limit, done: true } });
        }
        terminate() {}
      } as unknown as typeof Worker;
    }, { frame, steps, limit: { loadFactor, crown, peakStep: 52 } });
    await page.goto('/en/research/benchmarks/dadeppo-arch-1975/');
    const controls = page.locator('.controls');
    await controls.locator('select').first().selectOption(String(elements));
    await expect(controls.locator('option[value="400"]')).toContainText(String(maxSteps));
    await controls.locator('button').first().click();
    await expect(page.getByTestId('arch-verdict')).toHaveText('Outside tolerance');
    await page.getByRole('button', { name: 'Inspect the arch near its peak (step 60)' }).click();
    await expect(page.locator('.arch-app .slider input[type="range"]').first()).toHaveValue('1');
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
        const data = document.documentElement.dataset;
        const id = Number(data.plateWorkers ?? 0) + 1;
        data.plateWorkers = String(id);
        window.addEventListener(`deliver-plate-${id}`, e => this.onmessage?.({ data: { row: (e as CustomEvent).detail, index: 0 } }), { once: true });
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
  const deliver = (id: number) => page.evaluate(({ id, row }) => window.dispatchEvent(new CustomEvent(`deliver-plate-${id}`, { detail: row })), { id, row: plateReplay.rows[0] });
  await deliver(1);
  const rows = page.getByTestId('navier-results').locator('tbody tr');
  await expect(rows).toHaveCount(0);
  await deliver(2);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(plateReplay.rows[0].family);
});

test('@smoke a failed portal variant has no result or evidence link', async ({ page }) => {
  await page.route(/dedaliano_engine_bg[^/]*\.wasm/, route => route.abort());
  await page.goto('/en/research/benchmarks/plastic-collapse/');
  await page.getByTestId('ratio').fill('4');
  await expect(page.getByTestId('source')).toHaveText('No result for these inputs');
  await expect(page.getByRole('alert')).toContainText('No result for these inputs');
  await expect(page.locator('.rs-verify dd').first()).toHaveText('Unavailable');
  await expect(page.locator('.rs-verify dd').first().getByRole('link')).toHaveCount(0);
});

test('@smoke a tied portal checks either compatible hinge pattern', async ({ page }) => {
  await page.goto('/en/research/benchmarks/plastic-collapse/');
  await page.getByTestId('ratio').fill('3');
  await expect(page.getByTestId('governs')).toContainText('either compatible pattern');
  await expect(page.getByTestId('check').filter({ hasText: 'either compatible pattern' })).toHaveAttribute('data-passed', 'true');
});

test('@smoke an interrupted refined Lee solve exposes an undetermined peak', async ({ page }) => {
  await page.addInitScript(() => {
    window.Worker = class {
      onmessage?: (message: {data: unknown}) => void;
      postMessage() { this.onmessage?.({data: {error: 'solveError'}}); }
      terminate() {}
    } as unknown as typeof Worker;
  });
  await page.goto('/en/research/benchmarks/lee-frame-1968/');
  await page.locator('.controls select').selectOption('4');
  await page.locator('.controls button').first().click();
  await expect(page.getByTestId('lee-limit')).toHaveText('Unavailable');
  await expect(page.locator('.rs-verify dd').first().getByRole('link')).toHaveAttribute('href', /lee-frame-1968\/VALIDATION\.json$/);
});

test('@smoke restarting the cable replay clears a live failure', async ({ page }) => {
  await page.addInitScript(() => {
    window.Worker = class {
      onerror?: () => void;
      postMessage() { this.onerror?.(); }
      terminate() {}
    } as unknown as typeof Worker;
  });
  await page.goto('/en/research/optimisation/fairclough-2026/');
  await page.locator('.rs-xlink').filter({ hasText: '1.65' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Restart replay', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('@smoke a pending portal has no governing result for the requested ratio', async ({ page }) => {
  await page.route(/dedaliano_engine_bg[^/]*\.wasm/, () => {});
  await page.goto('/en/research/benchmarks/plastic-collapse/');
  await page.getByTestId('ratio').fill('4');
  await expect(page.getByTestId('governs')).toBeHidden();
  await expect(page.getByTestId('collapse-factor')).toBeHidden();
  await expect(page.getByTestId('check')).toHaveCount(0);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByTestId('collapse-factor')).toBeVisible();
});

test('@smoke the Ferrari article uses the signed moment of the displayed live path', async ({ page }) => {
  await page.addInitScript(() => {
    window.Worker = class {
      onmessage?: (event: { data: unknown }) => void;
      postMessage() { this.onmessage?.({ data: { kind: 'buckling', lambda: 1 } }); }
      terminate() {}
    } as unknown as typeof Worker;
  });
  await page.goto('/en/research/stability/ferrari-sigmund-2025/');
  const moments = page.getByTestId('ferrari-sign');
  const replayMoment = await moments.locator('option:checked').innerText();
  await expect(page.getByTestId('ferrari-model')).toContainText(replayMoment);
  await moments.selectOption({ index: 1 });
  const opposite = await moments.locator('option:checked').innerText();
  expect(opposite).not.toBe(replayMoment);
  await expect(page.getByTestId('ferrari-source')).toContainText(opposite);
  await expect(page.getByTestId('ferrari-model')).toContainText(opposite);
});
