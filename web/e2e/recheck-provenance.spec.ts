/**
 * Re-check prompt for old projects, and reproducible results (roadmap: "Trust and verification
 * backlog", items 8 and 9).
 *
 *  - A project saved before projects recorded which version solved them opens with a notice
 *    that lists only the registered changes that concern THAT model, cannot be dismissed
 *    without acknowledging it, and leaves the results marked stale until they are re-run.
 *  - The same model solved twice, and on the worker vs the main thread, gives bit-identical
 *    results; the reproduce dialog confirms a report's provenance.
 */
import { test, expect, loadModel, solveModel, bootPro } from './fixtures';
import type { Locator, Page } from '@playwright/test';
import { OFFERED_LOCALES } from '../src/lib/i18n/offered';

// Vite names the lazy chunk after applicability.ts; full-registry.ts is its static dependency.
const NOTICE_CHUNK = '**/applicability-*.js';

// This spec is about the notice: it must open untouched (fixtures.ts acknowledges it elsewhere).
test.use({ recheckNotice: 'assert' });

const STEEL = { id: 1, name: 'F-24', e: 200000, nu: 0.3, rho: 78.5, fy: 235 };
const CONCRETE = { id: 2, name: 'H-25', e: 30000, nu: 0.2, rho: 25, fy: 25 };

/** A `.ded` as a build before solve stamps wrote it: no `snapshot.solvedWith`. */
function oldProject(materialId: 1 | 2, type: 'truss' | 'frame') {
  const rel = { tx: false, ry: false, rz: false, my: false, mz: false, t: false };
  return {
    version: '2.0',
    name: materialId === 1 ? 'Old steel truss' : 'Old concrete frame',
    timestamp: '2026-09-01T12:00:00.000Z',
    analysisMode: 'pro',
    snapshot: {
      localAxisConvention: 'zUpStrongAxis',
      nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 4, y: 0, z: 0 }], [3, { id: 3, x: 2, y: 0, z: 2 }]],
      materials: [[1, STEEL], [2, CONCRETE]],
      sections: [[1, { id: 1, name: 'S', a: 0.01, iz: 1e-4, iy: 1e-4, j: 1e-5, b: 0.2, h: 0.3 }]],
      elements: [
        [1, { id: 1, type, nodeI: 1, nodeJ: 3, materialId, sectionId: 1, releaseI: rel, releaseJ: rel }],
        [2, { id: 2, type, nodeI: 3, nodeJ: 2, materialId, sectionId: 1, releaseI: rel, releaseJ: rel }],
        [3, { id: 3, type, nodeI: 1, nodeJ: 2, materialId, sectionId: 1, releaseI: rel, releaseJ: rel }],
      ],
      supports: [[1, { id: 1, nodeId: 1, type: 'fixed3d' }], [2, { id: 2, nodeId: 2, type: 'fixed3d' }]],
      loads: [{ type: 'nodal3d', data: { id: 1, nodeId: 3, fx: 0, fy: 0, fz: -20, mx: 0, my: 0, mz: 0, caseId: 1 } }],
      loadCases: [{ id: 1, type: 'D', name: 'Dead Load' }],
      combinations: [],
      nextId: { node: 4, material: 3, section: 2, element: 4, support: 3, load: 2, loadCase: 2, combination: 1 },
    },
  };
}

const recheck = (page: Page) => page.evaluate(() => window.__stabileo.recheck());

test.describe('@smoke re-check prompt for old projects', () => {
  test('keeps old results stale and acknowledgement disabled while notice details load', async ({ pro: page }) => {
    let requested = false;
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route(NOTICE_CHUNK, async route => {
      requested = true;
      await pending;
      await route.continue();
    });
    try {
      expect(await page.evaluate(f => window.__stabileoActions.loadProject(f), oldProject(1, 'frame'))).toBe(true);
      await expect(page.getByTestId('recheck-notice')).toBeVisible();
      await expect.poll(() => requested).toBe(true);
      await expect(page.getByTestId('recheck-ack')).toBeDisabled();
      await expect(page.getByTestId('recheck-later')).toBeDisabled();
      await expect(page.getByTestId('recheck-rerun')).toBeDisabled();
      expect((await recheck(page)).stale).toBe(true);
    } finally {
      release();
    }
    await expect(page.locator('[data-change-id="cirsoc301-tension-needs-connection"]')).toBeVisible();
    await expect(page.getByTestId('recheck-ack')).toBeEnabled();
    await page.getByTestId('recheck-ack').check();
    await page.getByTestId('recheck-later').click();
    await expect(page.getByTestId('recheck-notice')).toBeHidden();
    expect((await recheck(page)).stale).toBe(true);
  });

  test('recovers from an unavailable notice chunk without losing work or clearing stale status', async ({ page }) => {
    await bootPro(page);
    await page.route(NOTICE_CHUNK, route => route.abort());
    const project = oldProject(1, 'frame');
    project.snapshot.nodes[2][1] = { id: 3, x: 2.75, y: 0, z: 2 };
    expect(await page.evaluate(f => window.__stabileoActions.loadProject(f), project)).toBe(true);
    await expect(page.getByTestId('recheck-reload')).toBeVisible();
    await expect(page.getByTestId('recheck-ack')).toBeDisabled();
    const before = await page.evaluate(() => JSON.parse(window.__stabileo.serializeProject()).snapshot);
    const stale = await recheck(page);
    expect(stale.stale).toBe(true);
    await page.unroute(NOTICE_CHUNK);
    await Promise.all([page.waitForEvent('load'), page.getByTestId('recheck-reload').click()]);
    for (const id of stale.changes) {
      await expect(page.locator(`[data-change-id="${id}"]`)).toBeVisible();
    }
    await expect(page.getByTestId('recheck-ack')).toBeEnabled();
    const after = await page.evaluate(() => JSON.parse(window.__stabileo.serializeProject()).snapshot);
    expect(after).toEqual(before);
    expect((await recheck(page)).stale).toBe(true);
    await page.getByTestId('recheck-ack').check();
    await page.getByTestId('recheck-later').click();
    await expect(page.getByTestId('recheck-stale-banner')).toBeVisible();
  });

  test('keeps the session open when recovery cannot save the workspace', async ({ page }) => {
    await bootPro(page);
    await page.route(NOTICE_CHUNK, route => route.abort());
    expect(await page.evaluate(f => window.__stabileoActions.loadProject(f), oldProject(1, 'frame'))).toBe(true);
    await expect(page.getByTestId('recheck-reload')).toBeVisible();
    const before = await page.evaluate(() => JSON.parse(window.__stabileo.serializeProject()).snapshot);
    await page.evaluate(() => {
      Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
    });
    await page.getByTestId('recheck-reload').click();
    await expect(page.getByTestId('recheck-notice').getByRole('alert')).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(window.__stabileo.serializeProject()).snapshot)).toEqual(before);
    expect((await recheck(page)).stale).toBe(true);
    await expect(page.getByTestId('recheck-ack')).toBeDisabled();
  });

  test('a steel project lists the CIRSOC 301 tension change; the notice holds until acknowledged', async ({ pro: page }) => {
    expect(await page.evaluate((f) => window.__stabileoActions.loadProject(f), oldProject(1, 'frame'))).toBe(true);
    const notice = page.getByTestId('recheck-notice');
    await expect(notice).toBeVisible();
    await expect(notice.locator('[data-change-id="cirsoc301-tension-needs-connection"]')).toBeVisible();
    await expect(notice.locator('[data-change-id="cirsoc201-strain-compatibility"]')).toHaveCount(0);

    // Escape does not dismiss it, and neither button works before the box is ticked.
    await page.keyboard.press('Escape');
    await expect(notice).toBeVisible();
    await expect(page.getByTestId('recheck-later')).toBeDisabled();
    await expect(page.getByTestId('recheck-rerun')).toBeDisabled();

    await page.getByTestId('recheck-ack').check();
    await page.getByTestId('recheck-later').click();
    await expect(notice).toBeHidden();
    // Acknowledged, not re-run: still stale, and the banner says so.
    await expect(page.getByTestId('recheck-stale-banner')).toBeVisible();
    expect((await recheck(page)).stale).toBe(true);
    expect((await page.evaluate(() => window.__stabileo.resultProvenance()) as { stale: boolean }).stale).toBe(true);

    await page.getByTestId('recheck-banner-rerun').click();
    await expect(page.getByTestId('recheck-stale-banner')).toBeHidden({ timeout: 45_000 });
    const r = await recheck(page);
    expect(r.stale).toBe(false);
    expect(r.stampVersion).toBeGreaterThan(0);
  });

  test('a concrete project is told about CIRSOC 201, not about steel tension', async ({ pro: page }) => {
    expect(await page.evaluate((f) => window.__stabileoActions.loadProject(f), oldProject(2, 'frame'))).toBe(true);
    const notice = page.getByTestId('recheck-notice');
    await expect(notice).toBeVisible();
    await expect(notice.locator('[data-change-id="cirsoc201-strain-compatibility"]')).toBeVisible();
    await expect(notice.locator('[data-change-id="cirsoc301-tension-needs-connection"]')).toHaveCount(0);
    // Re-run from the notice itself.
    await page.getByTestId('recheck-ack').check();
    await page.getByTestId('recheck-rerun').click();
    await expect(notice).toBeHidden();
    await expect.poll(async () => (await recheck(page)).stale, { timeout: 45_000 }).toBe(false);
  });

  test('a project stamped with this version opens silently', async ({ pro: page }) => {
    const f = oldProject(1, 'frame');
    const stamp = await page.evaluate(() => window.__stabileo.recheck().stampVersion);
    (f.snapshot as Record<string, unknown>).solvedWith = { id: 'e2e', resultsVersion: stamp, analyses: ['linear'] };
    expect(await page.evaluate((x) => window.__stabileoActions.loadProject(x), f)).toBe(true);
    await expect(page.getByTestId('recheck-notice')).toHaveCount(0);
    expect((await recheck(page)).noticeOpen).toBe(false);
  });
});

test.describe('@smoke reproducible results', () => {
  test('worker and main thread, and two solves, give the same bits; reproduce confirms it', async ({ pro: page }) => {
    // A model without combinations: with them, "all loads" is the sum of the case solves (another
    // computation than one direct solve), so the thread comparison would compare two algorithms.
    const f = oldProject(1, 'frame');
    const stamp = await page.evaluate(() => window.__stabileo.recheck().stampVersion);
    (f.snapshot as Record<string, unknown>).solvedWith = { id: 'e2e', resultsVersion: stamp, analyses: ['linear'] };
    expect(await page.evaluate((x) => window.__stabileoActions.loadProject(x), f)).toBe(true);
    await page.evaluate(() => window.__stabileoActions.solve());
    // The base solve's hash, whatever result the view settled on after the solve.
    const baseHash = () => page.evaluate(() => {
      const p = window.__stabileo.resultProvenance() as { scope: string; resultsHash: string | null; baseResultsHash: string | null };
      return p.scope === 'single' ? p.resultsHash : p.baseResultsHash;
    });
    const worker = await baseHash();
    expect(worker).toMatch(/^[0-9a-f]{64}$/);
    const main = await page.evaluate(() => window.__stabileoActions.solveOnMainThread());
    expect(main).toBe(worker);
    await page.evaluate(() => window.__stabileoActions.solve());
    const again = await baseHash();
    expect(again).toBe(worker);

    const record = await page.evaluate(() => JSON.stringify(window.__stabileo.resultProvenance()));
    await page.evaluate(() => window.dispatchEvent(new Event('stabileo-reproduce')));
    await page.getByTestId('reproduce-input').fill(record);
    await page.getByTestId('reproduce-run').click();
    await expect(page.getByTestId('reproduce-verdict')).toHaveAttribute('data-reproduced', 'true', { timeout: 45_000 });
  });
});

test.describe('@slow provenance on a PRO model with combinations (the common path)', () => {
  test('engine hashes, the solver input, a combination report reproduced', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    // The base result is the sum of the case solves here; the record still names the engine input.
    const p = await page.evaluate(() => window.__stabileo.exportProvenance()) as { engineInputSha256: string | null; engineResultsSha256: string | null; scopeRef: { kind: string } };
    expect(p.engineInputSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(p.engineResultsSha256).toMatch(/^[0-9a-f]{64}$/);

    await page.evaluate(() => window.dispatchEvent(new Event('stabileo-reproduce')));
    await page.getByTestId('reproduce-input').fill(JSON.stringify(p));
    await page.getByTestId('reproduce-run').click();
    await expect(page.getByTestId('reproduce-verdict')).toHaveAttribute('data-status', 'reproduced', { timeout: 120_000 });

    // The solver input for the CLI reproduce downloads.
    const download = page.waitForEvent('download');
    await page.getByTestId('reproduce-download-input').click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('solver-input-3d.json');
  });
});

for (const width of [390, 810]) {
  for (const locale of ['es', 'pt']) {
    test.describe(`@smoke re-check layout ${width}px ${locale}`, () => {
      test.use({ viewport: { width, height: 844 }, appLocale: locale });

      test('keeps controls visible above a scrolling history and sizes touch targets', async ({ pro: page }) => {
        expect(await page.evaluate(f => window.__stabileoActions.loadProject(f), oldProject(1, 'frame'))).toBe(true);
        await expect(page.getByTestId('recheck-ack')).toBeEnabled();
        const notice = page.getByTestId('recheck-notice');
        // bootPro opens the design desk. The notice must own the modal top layer
        // even if another navigation request opens that workspace while it is pending.
        await page.evaluate(() => window.__stabileoActions.openDesignTab());
        await expect(page.getByTestId('recheck-overlay')).toHaveJSProperty('open', true);
        expect(await page.getByTestId('recheck-overlay').evaluate(el => el.matches(':modal'))).toBe(true);
        await page.keyboard.press('Escape');
        await expect(notice).toBeVisible();
        expect(await page.getByTestId('recheck-ack').evaluate(el => {
          const r = el.getBoundingClientRect();
          return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el;
        })).toBe(true);
        const list = page.getByTestId('recheck-changes');
        expect(await list.locator('li').count()).toBeGreaterThan(3);
        expect(await list.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
        const footer = notice.locator('footer');
        await expect(footer).toBeInViewport({ ratio: 1 });
        const before = await footer.boundingBox();
        await list.evaluate(el => { el.scrollTop = el.scrollHeight; });
        expect(await footer.boundingBox()).toEqual(before);
        expect(await notice.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
        for (const selector of ['.rc-item-text', '.rc-area', '.rc-link', '.rc-stale', '.rc-ack', '.rc-btn']) {
          expect(await notice.locator(selector).first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
        }
        for (const selector of ['.rc-link', '.rc-ack', '.rc-btn']) {
          for (const target of await notice.locator(selector).all()) {
            expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
          }
        }
        expect(await notice.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
        await page.getByTestId('recheck-ack').check();
        await page.getByTestId('recheck-later').click();
        const banner = page.getByTestId('recheck-stale-banner');
        await expect(banner).toBeInViewport({ ratio: 1 });
        expect(await banner.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
        for (const button of await banner.getByRole('button').all()) {
          expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
          expect(await button.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
        }
      });

      // Plain page + bootPro like the other recovery tests: the aborted chunk logs net::ERR_FAILED,
      // which the strict `pro` fixture would count as an unexpected console error.
      test('sizes recovery buttons for touch', async ({ page, appLocale }) => {
        await bootPro(page, appLocale);
        await page.route(NOTICE_CHUNK, route => route.abort());
        expect(await page.evaluate(f => window.__stabileoActions.loadProject(f), oldProject(1, 'frame'))).toBe(true);
        await expect(page.getByTestId('recheck-reload')).toBeVisible();
        for (const button of await page.getByTestId('recheck-notice').getByRole('button').all()) {
          expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        }
        await expect(page.getByTestId('recheck-notice').locator('footer')).toBeInViewport({ ratio: 1 });
      });
    });
  }
}


for (const viewport of [{ width: 390, height: 667 }, { width: 810, height: 390 }]) {
  for (const locale of OFFERED_LOCALES) {
    test(`@smoke scrolls recovery after download and storage failure at ${viewport.width}x${viewport.height} ${locale}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await bootPro(page, locale);
      await page.route(NOTICE_CHUNK, route => route.abort());
      expect(await page.evaluate(f => window.__stabileoActions.loadProject(f), oldProject(1, 'frame'))).toBe(true);
      const notice = page.getByTestId('recheck-notice');
      await expect(page.getByTestId('recheck-reload')).toBeVisible();
      await page.evaluate(() => {
        Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
      });
      await page.getByTestId('recheck-reload').click();
      await expect(notice.getByRole('alert')).toBeVisible();
      // Hidden overflow can be scrolled programmatically, but not by touch/wheel.
      expect(await notice.evaluate(el => getComputedStyle(el).overflowY)).toBe('auto');
      await expect(notice).toBeInViewport({ ratio: 1 });
      const overflow = await notice.evaluate(el => el.scrollHeight - el.clientHeight);
      // Portrait may fit all recovery content. Landscape must exercise real scrolling.
      if (viewport.height === 390) expect(overflow).toBeGreaterThan(0);
      if (overflow > 0) {
        await notice.hover();
        await page.mouse.wheel(0, -overflow - 1);
        await expect.poll(() => notice.evaluate(el => el.scrollTop)).toBe(0);
        await page.mouse.wheel(0, overflow + 1);
        // scrollHeight/clientHeight are integers; scrollTop can be fractional.
        await expect.poll(() => notice.evaluate(el =>
          Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop))).toBeLessThanOrEqual(1);
      }

      // Use wheel input inside the notice for each target: scrollIntoViewIfNeeded
      // could mask clipping by scrolling an overflow:hidden ancestor or the page.
      async function reachInsideNotice(target: Locator) {
        const geometry = () => target.evaluate(el => {
          const r = el.getBoundingClientRect();
          const container = el.closest<HTMLElement>('.rc')!;
          const c = container.getBoundingClientRect();
          const top = c.top + container.clientTop;
          const bottom = top + container.clientHeight;
          const left = c.left + container.clientLeft;
          return {
            contained: r.top >= top && r.bottom <= bottom
              && r.left >= left && r.right <= left + container.clientWidth,
            delta: (r.top + r.bottom - top - bottom) / 2,
          };
        });
        const { contained, delta } = await geometry();
        if (!contained) {
          await notice.hover();
          await page.mouse.wheel(0, delta);
        }
        await expect.poll(async () => (await geometry()).contained).toBe(true);
        await expect(target).toBeInViewport({ ratio: 1 });
      }

      const buttons = notice.getByRole('button');
      expect(await buttons.count()).toBe(5); // Three recovery actions and two footer actions.
      for (const button of await buttons.all()) {
        await reachInsideNotice(button);
        await expect(button).toBeVisible();
        await expect(button).toBeInViewport({ ratio: 1 });
        const bounds = (await button.boundingBox())!;
        expect(bounds.height).toBeGreaterThanOrEqual(44);
        expect(bounds.width).toBeGreaterThanOrEqual(44);
        // Also detect clipping by the dialog itself, which viewport checks alone miss.
        expect(await button.evaluate(el => {
          const r = el.getBoundingClientRect();
          const container = el.closest('.rc')!;
          const c = container.getBoundingClientRect();
          return r.top >= c.top && r.bottom <= c.bottom
            && el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        })).toBe(true);
      }
      for (const content of [notice.locator('.rc-intro').last(), notice.getByRole('alert'), notice.locator('footer')]) {
        await reachInsideNotice(content);
        await expect(content).toBeInViewport({ ratio: 1 });
        expect(await content.evaluate(el => {
          const r = el.getBoundingClientRect();
          const c = el.closest('.rc')!.getBoundingClientRect();
          return r.top >= c.top && r.bottom <= c.bottom;
        })).toBe(true);
      }
      expect(await notice.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(page.getByTestId('recheck-ack')).toBeDisabled();
    });
  }
}

for (const width of [390, 810]) {
  test(`@smoke downloads an unread session backup after storage failure at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await bootPro(page);
    await page.route(NOTICE_CHUNK, route => route.abort());
    expect(await page.evaluate(f => window.__stabileoActions.loadProject(f), oldProject(1, 'frame'))).toBe(true);
    await expect(page.getByTestId('recheck-backup')).toBeVisible();
    const before = await page.evaluate(() => JSON.parse(window.__stabileo.serializeProject()).snapshot);
    await page.evaluate(() => {
      Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
    });
    await page.getByTestId('recheck-reload').click();
    await expect(page.getByTestId('recheck-notice').getByRole('alert')).toBeVisible();
    const notice = page.getByTestId('recheck-notice');
    await expect(notice.locator('footer')).toBeInViewport({ ratio: 1 });
    expect(await notice.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const button of await notice.getByRole('button').all()) {
      const bounds = (await button.boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(await button.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
    }
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('recheck-backup').click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const session = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    expect(session.type).toBe('session');
    const active = session.tabs.find((tab: { id: string }) => tab.id === session.activeTabId);
    expect(active.modelSnapshot).toEqual(before);
    expect(active.modelSnapshot.pendingRecheckNotice.stamp.resultsVersion).toBe(0);
    await expect(page.getByTestId('recheck-ack')).toBeDisabled();
    await expect(page.getByTestId('recheck-notice')).toBeVisible();
  });
}
