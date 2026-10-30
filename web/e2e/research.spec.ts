import { test, expect } from '@playwright/test';
import { pickLanguage } from './fixtures';
import { EXPERIMENTS } from '../src/components/research/experiments';
import catalog from '../../research/papers.json' with { type: 'json' };
import type { StabileoTestActions, StabileoTestHooks } from '../src/lib/utils/e2e-hooks';

/**
 * Stabileo Research: the gallery, and the phase-field page running its real simulation (the
 * research WASM, in a worker) for a few load steps on the coarse mesh.
 *
 * Run locally:
 *   npx playwright test --grep "@smoke research"
 */
test.describe('@smoke research', () => {
  test('the gallery shows every runnable experiment before the catalogue and links to each experiment', async ({ page }) => {
    await page.goto('/en/research/');
    await expect(page.getByRole('heading', { name: 'Stabileo Research' })).toBeVisible();
    const catalogue = catalog.papers.filter((paper) => !EXPERIMENTS.some((experiment) => experiment.paperId === paper.id));
    await expect(page.locator('.rs-g-card')).toHaveCount(catalogue.length);
    await expect(page.getByText('Research, not a design tool').first()).toBeVisible();
    const cards = page.locator('.rs-g-run .rs-g-runcard');
    expect(EXPERIMENTS.length).toBeGreaterThan(0);
    await expect(cards).toHaveCount(EXPERIMENTS.length);
    expect(await page.locator('.rs-g-run').evaluate((run) => {
      const list = document.querySelector('.rs-g-list')!;
      return Boolean(run.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING)
        && run.getBoundingClientRect().bottom <= list.getBoundingClientRect().top;
    })).toBe(true);

    for (const experiment of EXPERIMENTS) {
      expect(catalog.papers.some((paper) => paper.id === experiment.paperId)).toBe(true);
      const path = `/en${experiment.path}/`;
      const card = cards.filter({ has: page.locator(`h3 a[href="${path}"]`) });
      await expect(card).toHaveCount(1);
      const heading = card.getByRole('heading');
      await expect(heading).toBeVisible();
      const title = (await heading.innerText()).trim();
      expect(title.length).toBeGreaterThan(0);
      await expect(card.getByText('First version', { exact: true })).toBeVisible();
      // Every runnable experiment shows its build-time thumbnail, never the field icon.
      await expect(card.locator('.rs-g-thumb-icon')).toHaveCount(0);
      await expect(card.locator('a.rs-g-thumb')).toHaveAttribute('href', path);
      const img = card.locator('img');
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
      const link = card.getByRole('link', { name: 'Read & run', exact: true });
      await expect(link).toHaveAttribute('href', path);
      await link.click();
      await expect(page).toHaveURL(new URL(path, page.url()).href);
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await page.goto('/en/research/');
    }
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
    // The live mesh was rebuilt while Parameters hid the viewer. A positive-size resize
    // must fit the camera and draw geometry, not just reveal an empty WebGL canvas.
    await page.locator('#rs-tab-viewer').click();
    await expect.poll(() => page.locator('.sfv canvas').first().evaluate((canvas: HTMLCanvasElement) => {
      const copy = document.createElement('canvas');
      copy.width = canvas.width; copy.height = canvas.height;
      const ctx = copy.getContext('2d')!;
      ctx.drawImage(canvas, 0, 0);
      const pixels = ctx.getImageData(0, 0, copy.width, copy.height).data;
      let different = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (Math.abs(pixels[i] - pixels[0]) + Math.abs(pixels[i + 1] - pixels[1]) + Math.abs(pixels[i + 2] - pixels[2]) > 30) different++;
      }
      return different / (copy.width * copy.height);
    })).toBeGreaterThan(0.01);
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

  test('article parameter links correct malformed input and run', async ({ page }) => {
    const input = page.locator('#p-l0');
    await input.fill('oops');
    await input.blur();
    await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'try ℓ = 0.015 mm', exact: true }).click();
    await expect(input).toHaveValue('0.015');
    await expect(input).toHaveAttribute('aria-invalid', 'false');
    await expect(page.locator('.rs-app')).toHaveAttribute('data-source', 'live');
    expect(await page.evaluate(() => JSON.parse((window as unknown as { sentConfig: string }).sentConfig).material.l0)).toBe(0.015);
    await expect(page.locator('.rs-app')).toHaveAttribute('data-steps', '1');
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

// The step slider's accessible name in each language (research i18n.ts, loadStepShown).
const LOAD_STEP: Record<string, string> = { en: 'Load step shown', es: 'Paso de carga mostrado', pt: 'Passo de carga exibido' };
for (const locale of ['es', 'pt', 'en']) {
  test(`@smoke research locale ${locale} preserves replay deep-link state`, async ({ page }) => {
    const query = '?step=56&mesh=0&view=tip&deformed=0';
    await page.goto(`/en/research/fracture/shauer-2025/${query}`);
    await expect(page.getByRole('slider', { name: 'Load step shown' })).toHaveValue('56');
    await pickLanguage(page, 'nav-lang', locale);
    await expect(page).toHaveURL(new RegExp(`/${locale}/research/fracture/shauer-2025/\\?step=56&mesh=0&view=tip&deformed=0$`));
    await expect(page.getByRole('slider', { name: LOAD_STEP[locale] })).toHaveValue('56');
  });
}

for (const mode of ['basic', 'pro']) test(`@smoke research navigation preserves ${mode} editor changes against public-page shortcuts`, async ({ page }) => {
  await page.goto(`/app/${mode}?e2e=1`);
  await page.waitForFunction(() => !!window.__stabileoActions);
  const before = await page.evaluate(async () => {
    const app = window as unknown as { __stabileo: StabileoTestHooks; __stabileoActions: StabileoTestActions };
    await app.__stabileoActions.loadExample('portal-frame');
    const id = app.__stabileo.nodeIds()[0];
    const position = app.__stabileo.nodePos(id)!;
    app.__stabileoActions.moveNode(id, position.x + 0.25, position.y, position.z);
    app.__stabileoActions.selectNodes([id]);
    return { snapshot: JSON.parse(app.__stabileo.serializeProject()).snapshot, id, position, edited: app.__stabileo.nodePos(id), undo: app.__stabileo.undoCount(), timeOrigin: performance.timeOrigin };
  });
  await page.keyboard.press('ControlOrMeta+c');
  await page.locator('.logo-home').click();
  // The nav collapses into its menu at laptop widths; open it when it has.
  const toggle = page.locator('.nav-toggle');
  if (await toggle.isVisible()) await toggle.click();
  await page.locator('.nav [data-nav="research"]').click();
  await expect(page.getByRole('heading', { name: 'Stabileo Research' })).toBeVisible();
  for (const destination of ['/research/', '/blog/', '/']) {
    await page.evaluate(path => window.dispatchEvent(new CustomEvent('stabileo-navigate', { detail: path })), destination);
    await expect(page.locator('.app-container')).toHaveClass(/hidden-behind-landing/);
    for (const key of ['Delete', 'Backspace', 'Control+z', 'Control+v', 'ControlOrMeta+z', 'ControlOrMeta+v', 'ControlOrMeta+x', 'ControlOrMeta+y']) await page.keyboard.press(key);
    await page.waitForTimeout(200);
  }
  await page.locator('.nav-actions > button.btn-primary').click();
  await expect(page.locator('.app-container')).toBeVisible();
  const after = await page.evaluate((id) => {
    const app = window as unknown as { __stabileo: StabileoTestHooks };
    return { snapshot: JSON.parse(app.__stabileo.serializeProject()).snapshot, edited: app.__stabileo.nodePos(id), undo: app.__stabileo.undoCount(), timeOrigin: performance.timeOrigin };
  }, before.id);
  expect(after).toEqual({ snapshot: before.snapshot, edited: before.edited, undo: before.undo, timeOrigin: before.timeOrigin });
  expect(after.undo).toBeGreaterThan(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => page.evaluate((id) => (window as unknown as { __stabileo: StabileoTestHooks }).__stabileo.nodePos(id), before.id)).toEqual(before.position);
});

test('@smoke research survives navigation while the App chunk is delayed', async ({ page }) => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  let requested!: () => void;
  const request = new Promise<void>((resolve) => { requested = resolve; });
  await page.route(/\/assets\/App-[^/]+\.js$/, async (route) => {
    requested();
    await blocked;
    await route.continue();
  });
  await page.goto('/en/');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('stabileo-enter-app')));
  await request;
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('stabileo-navigate', { detail: '/research/' })));
  await expect(page.getByRole('heading', { name: 'Stabileo Research' })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { appReady: boolean }).appReady = false;
    window.addEventListener('stabileo-app-ready', () => { (window as unknown as { appReady: boolean }).appReady = true; });
  });
  release();
  await page.waitForFunction(() => (window as unknown as { appReady: boolean }).appReady);
  await expect(page.getByRole('heading', { name: 'Stabileo Research' })).toBeVisible();
  await expect(page).toHaveURL(/\/en\/research\/$/);
  await expect(page.locator('.app-container')).toHaveClass(/hidden-behind-landing/);
  await expect(page.locator('.app-container')).toHaveCSS('pointer-events', 'none');
  const heading = page.getByRole('heading', { name: 'Stabileo Research' });
  await expect.poll(() => heading.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  })).toBe(true);
});

for (const failure of ['constructor', 'unavailable', 'error']) {
  test(`@smoke research displays pre-mesh ${failure} failure`, async ({ page }) => {
    await page.addInitScript((kind) => {
      window.Worker = class {
        onmessage: ((e: { data: unknown }) => void) | null = null;
        constructor() { if (kind === 'constructor') throw new Error('test solver failure'); }
        terminate() {}
        postMessage(m: { runId: number }) {
          queueMicrotask(() => this.onmessage?.({ data: { type: kind, runId: m.runId, message: 'test solver failure' } }));
        }
      } as unknown as typeof Worker;
    }, failure);
    await page.goto('/en/research/fracture/shauer-2025/');
    await expect.poll(async () => Number(await page.locator('.rs-app').getAttribute('data-steps'))).toBeGreaterThan(0);
    await page.locator('#rs-tab-parameters').click();
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await page.locator('#rs-tab-viewer').click();
    await expect(page.locator('.rs-placeholder')).toContainText('test solver failure');
    await expect(page.locator('.rs-placeholder')).not.toContainText('Loading the replay');
  });
}

test('@smoke research short desktop reaches Run, Stop and Back to replay', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.addInitScript(() => {
    // Keep a run pending so Stop is available deterministically.
    window.Worker = class { postMessage() {} terminate() {} } as unknown as typeof Worker;
  });
  await page.goto('/en/research/fracture/shauer-2025/');
  await expect.poll(async () => Number(await page.locator('.rs-app').getAttribute('data-steps'))).toBeGreaterThan(0);
  await page.locator('#rs-tab-parameters').click();
  const panel = page.locator('#rs-panel-parameters');
  await expect(panel).toHaveCSS('overflow-y', 'auto');
  expect(await panel.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.getByRole('button', { name: 'Back to the replay', exact: true }).click();
  await expect(page.locator('.rs-app')).toHaveAttribute('data-source', 'replay');
});

for (const interaction of ['viewer', 'wheel', 'camera', 'tab', 'keyboard tab', 'article tab']) {
  test(`@smoke research playback stops on ${interaction} interaction`, async ({ page }) => {
    await page.goto('/en/research/fracture/shauer-2025/');
    const slider = page.getByRole('slider', { name: 'Load step shown' });
    await expect(page.locator('.sfv canvas').first()).toBeVisible();
    await slider.scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    if (interaction === 'viewer') await page.locator('.sfv canvas').first().click();
    else if (interaction === 'wheel') {
      await page.locator('.sfv canvas').first().hover();
      await page.mouse.wheel(0, 50);
    } else if (interaction === 'camera') await page.getByRole('button', { name: 'Zoom to extents', exact: true }).click();
    else if (interaction === 'article tab') await page.getByRole('button', { name: 'the force', exact: true }).click();
    else if (interaction === 'tab') await page.locator('#rs-tab-force').click();
    else {
      await page.locator('#rs-tab-viewer').focus();
      await page.keyboard.press('ArrowRight');
    }
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    const step = await slider.inputValue();
    await page.waitForTimeout(350);
    await expect(slider).toHaveValue(step);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => slider.inputValue()).not.toBe(step);
  });
}

test('@smoke public-page entry installs editor hooks after its lazy mount', async ({ page }) => {
  await page.goto('/en/research/?e2e=1');
  await expect(page.getByRole('heading', { name: 'Stabileo Research' })).toBeVisible();
  const origin = await page.evaluate(() => performance.timeOrigin);
  await page.locator('.nav-actions > button.btn-primary').click();
  await expect.poll(() => page.evaluate(() => !!window.__stabileo)).toBe(true);
  await expect(page.locator('canvas').first()).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
});
