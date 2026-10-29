import { test, expect } from '@playwright/test';
import { pickLanguage } from './fixtures';
import type { StabileoTestActions, StabileoTestHooks } from '../src/lib/utils/e2e-hooks';

/**
 * Stabileo Research: the gallery, and the phase-field page running its real simulation (the
 * research WASM, in a worker) for a few load steps on the coarse mesh.
 *
 * Run locally:
 *   npx playwright test --grep "@smoke research"
 */
test.describe('@smoke research', () => {
  test('the gallery shows the runnable experiment first, then the list, and links to the experiment', async ({ page }) => {
    await page.goto('/en/research/');
    await expect(page.getByRole('heading', { name: 'Stabileo Research' })).toBeVisible();
    expect(await page.locator('.rs-g-card').count()).toBeGreaterThanOrEqual(5);
    await expect(page.getByText('Research, not a design tool').first()).toBeVisible();
    // Every runnable experiment shows its build-time thumbnail, never the field icon.
    const cards = page.locator('.rs-g-runcard');
    expect(await cards.count()).toBeGreaterThanOrEqual(1);
    for (const card of await cards.all()) {
      await expect(card.locator('.rs-g-thumb-icon')).toHaveCount(0);
      const img = card.locator('img');
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    }
    await page.getByRole('link', { name: 'Read & run' }).first().click();
    await expect(page).toHaveURL(/\/en\/research\/fracture\/shauer-2025\/$/);
    await expect(page.getByRole('heading', { name: 'Phase-field fracture of a notched plate' })).toBeVisible();
  });

  test('the phase-field experiment replays, then runs load steps live and plots the force', async ({ page }) => {
    const wasm: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('phasefield_bg.wasm')) wasm.push(r.url());
    });
    await page.goto('/en/research/fracture/shauer-2025/');
    await expect(page.getByText('Research, not a design tool').first()).toBeVisible();
    const app = page.locator('.rs-app');
    await expect(app).toHaveAttribute('data-source', 'replay');
    await expect.poll(async () => Number(await app.getAttribute('data-steps')), { timeout: 30_000 }).toBeGreaterThanOrEqual(70);
    await expect(page.locator('.sfv canvas').first()).toBeVisible();
    expect(wasm, 'the solver WASM loads only when a live run starts').toHaveLength(0);

    await page.locator('#rs-tab-parameters').click();
    await page.locator('#p-mesh').selectOption('coarse');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(app).toHaveAttribute('data-source', 'live');
    await expect.poll(async () => Number(await app.getAttribute('data-steps')), { timeout: 60_000 }).toBeGreaterThanOrEqual(5);
    await page.locator('#rs-tab-force').click();
    const curve = page.locator('#rs-panel-force svg path[stroke-width="1.75"]').first();
    await expect(curve).toBeVisible();
    expect(((await curve.getAttribute('d')) ?? '').split('L').length).toBeGreaterThanOrEqual(5);
    expect(wasm.length).toBeGreaterThan(0);
  });

  test('the application and the landing do not load research code', async ({ page }) => {
    const research: string[] = [];
    page.on('request', (r) => {
      if (/research-wasm|ResearchPage|sim\.worker|ScalarFieldViewer/.test(r.url())) research.push(r.url());
    });
    await page.goto('/en/');
    await page.waitForLoadState('networkidle');
    expect(research).toEqual([]);
  });

  for (const width of [390, 1120, 1280]) {
    test(`the experiment page reflows at ${width} px: nothing is cut off`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/en/research/fracture/shauer-2025/');
      await expect(page.locator('.rs-app')).toHaveAttribute('data-source', 'replay');
      await page.waitForTimeout(1000);
      const m = await page.evaluate(() => {
        const landing = document.querySelector('.landing') as HTMLElement;
        const pane = document.querySelector('.rs-shell-app') as HTMLElement;
        const article = document.querySelector('.rs-shell-article') as HTMLElement;
        return { lw: landing.scrollWidth, lc: landing.clientWidth, pw: pane.scrollWidth, pc: pane.clientWidth, ar: article.getBoundingClientRect().right, iw: innerWidth };
      });
      expect(m.lw).toBeLessThanOrEqual(m.lc + 1);
      expect(m.pw).toBeLessThanOrEqual(m.pc + 1);
      expect(m.ar).toBeLessThanOrEqual(m.iw + 1);
    });
  }

  test('the research page uses Plex Sans for Latin text and its Greek and maths subset', async ({ page }) => {
    await page.goto('/en/research/fracture/shauer-2025/');
    await page.waitForLoadState('networkidle');
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].filter((f) => f.family.includes('IBM Plex Sans') && f.status === 'loaded').map((f) => f.unicodeRange);
    });
    expect(loaded.some((r) => r.includes('U+20-7E'))).toBe(true);
    expect(loaded.some((r) => r.includes('U+370-3FF'))).toBe(true);
  });
});

test.describe('@smoke research review regressions', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      class WorkerStub {
        onmessage: ((e: { data: unknown }) => void) | null = null;
        terminate() {}
        postMessage(message: { type: string; runId: number; config: string }) {
          if (message.type !== 'run') return;
          (window as unknown as { sentConfig: string }).sentConfig = message.config;
          queueMicrotask(() => {
            const runId = message.runId;
            this.onmessage?.({ data: { type: 'mesh', runId, nodes: new Float64Array([0, 0, 1, 0, 1, 1, 0, 1]), elements: new Uint32Array([0, 1, 2, 3]) } });
            this.onmessage?.({ data: { type: 'step', runId,
              step: { step: 0, pseudotime: 0.01, displacement: 0.001, reaction: 1, iterations: 1, converged: true, residual: 0, damage_max: 0.1, damage_min: 0, elastic_energy: 1, fracture_energy: 0.1 },
              damage: new Float32Array(4), displacement: new Float32Array(8), syy: new Float32Array([1]) } });
            this.onmessage?.({ data: { type: 'done', runId, seconds: 0.1 } });
          });
        }
      }
      window.Worker = WorkerStub as unknown as typeof Worker;
    });
    await page.goto('/en/research/fracture/shauer-2025/?step=0');
    await expect.poll(async () => Number(await page.locator('.rs-app').getAttribute('data-steps'))).toBeGreaterThan(0);
    await page.locator('#rs-tab-parameters').click();
  });

  test('replacing a material parameter sends the new configuration and malformed input disables Run', async ({ page }) => {
    const input = page.locator('#p-e');
    const run = page.getByRole('button', { name: 'Run', exact: true });
    await input.fill('123.5');
    await input.blur();
    await run.click();
    const config = await page.evaluate(() => JSON.parse((window as unknown as { sentConfig: string }).sentConfig));
    expect(config.material).toEqual({ e: 123.5, nu: 0.3, gc: 0.0027, l0: 0.0075, plane: 'strain' });
    await input.fill('oops');
    await input.blur();
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveValue('oops');
    await expect(run).toBeDisabled();
    await input.fill('200');
    await input.blur();
    await expect(run).toBeEnabled();
  });

  test('article step links restore the reference replay after a custom load-step run', async ({ page }) => {
    await page.locator('#p-dt').selectOption('0.06');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.locator('.rs-app')).toHaveAttribute('data-source', 'live');
    expect(await page.evaluate(() => JSON.parse((window as unknown as { sentConfig: string }).sentConfig).controls.dt)).toBe(0.06);
    await page.getByRole('button', { name: 'the peak load (step 56)', exact: true }).click();
    await expect(page.locator('.rs-app')).toHaveAttribute('data-source', 'replay');
    await expect(page.getByRole('slider', { name: 'Load step shown' })).toHaveValue('56');
    await expect.poll(async () => Number(await page.locator('.rs-app').getAttribute('data-steps'))).toBeGreaterThan(70);
  });

  test('live stress falls back to damage on returning to replay, including controls and legend', async ({ page }) => {
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await page.locator('#rs-tab-viewer').click();
    const stress = page.getByRole('radio', { name: 'σyy', exact: true });
    await stress.click();
    await expect(stress).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.shell-legend')).toContainText('σyy');
    await page.locator('#rs-tab-parameters').click();
    await page.getByRole('button', { name: 'Back to the replay' }).click();
    await page.locator('#rs-tab-viewer').click();
    await expect(stress).toBeDisabled();
    await expect(page.getByRole('radio', { name: 'Damage d', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.shell-legend')).toBeVisible();
    await expect(page.locator('.shell-legend')).toContainText('Damage d');
    await expect(page.locator('.shell-legend')).not.toContainText('σyy');
  });
});

test('@smoke destroying the research page aborts its replay fetch and ignores a late resolution', async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.fetch;
    const state = window as unknown as { replaySignal: AbortSignal; releaseReplay: () => void; replayTicks: number };
    state.replayTicks = 0;
    const timeout = window.setTimeout;
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (delay === 110) state.replayTicks++;
      return timeout(handler, delay, ...args);
    }) as typeof window.setTimeout;
    window.fetch = async (url, init) => {
      const response = await original(url, init);
      if (String(url).includes('replay.srpl')) {
        state.replaySignal = init!.signal!;
        const body = await response.arrayBuffer();
        await new Promise<void>((resolve) => { state.releaseReplay = resolve; });
        // Deliberately resolve successfully even after abort, exercising the continuation guard.
        return new Response(body);
      }
      return response;
    };
  });
  await page.goto('/en/research/fracture/shauer-2025/');
  await page.waitForFunction(() => !!(window as unknown as { releaseReplay: unknown }).releaseReplay);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('stabileo-navigate', { detail: '/' })));
  await expect(page.locator('.rs-app')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { replaySignal: AbortSignal }).replaySignal.aborted)).toBe(true);
  await page.evaluate(() => (window as unknown as { releaseReplay: () => void }).releaseReplay());
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { replayTicks: number }).replayTicks)).toBe(0);
});

for (const locale of ['es', 'pt', 'en']) {
  test(`@smoke research locale ${locale} preserves replay deep-link state`, async ({ page }) => {
    const query = '?step=56&mesh=0&view=tip&deformed=0';
    await page.goto(`/en/research/fracture/shauer-2025/${query}`);
    await expect(page.getByRole('slider', { name: 'Load step shown' })).toHaveValue('56');
    await pickLanguage(page, 'nav-lang', locale);
    await expect(page).toHaveURL(new RegExp(`/${locale}/research/fracture/shauer-2025/\\?step=56&mesh=0&view=tip&deformed=0$`));
    await expect(page.getByRole('slider', { name: 'Load step shown' })).toHaveValue('56');
  });
}

test('@smoke research navigation preserves recent editor changes and undo history', async ({ page }) => {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions);
  const before = await page.evaluate(async () => {
    const app = window as unknown as { __stabileo: StabileoTestHooks; __stabileoActions: StabileoTestActions };
    await app.__stabileoActions.loadExample('portal-frame');
    const id = app.__stabileo.nodeIds()[0];
    const position = app.__stabileo.nodePos(id)!;
    app.__stabileoActions.moveNode(id, position.x + 0.25, position.y, position.z);
    return { id, position, edited: app.__stabileo.nodePos(id), undo: app.__stabileo.undoCount(), timeOrigin: performance.timeOrigin };
  });
  await page.locator('.logo-home').click();
  await page.locator('.nav [data-nav="research"]').click();
  await expect(page.getByRole('heading', { name: 'Stabileo Research' })).toBeVisible();
  await page.locator('.nav-actions > button.btn-primary').click();
  await expect(page.locator('.app-container')).toBeVisible();
  const after = await page.evaluate((id) => {
    const app = window as unknown as { __stabileo: StabileoTestHooks };
    return { edited: app.__stabileo.nodePos(id), undo: app.__stabileo.undoCount(), timeOrigin: performance.timeOrigin };
  }, before.id);
  expect(after).toEqual({ edited: before.edited, undo: before.undo, timeOrigin: before.timeOrigin });
  expect(after.undo).toBeGreaterThan(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => page.evaluate((id) => (window as unknown as { __stabileo: StabileoTestHooks }).__stabileo.nodePos(id), before.id)).toEqual(before.position);
});
