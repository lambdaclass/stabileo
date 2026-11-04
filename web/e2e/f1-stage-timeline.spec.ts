/**
 * F1 — the steps of design, one vocabulary (interface A).
 *
 * This file pinned the concrete flow's own stage strip, five stages over five disclosures of the
 * classic screen. The strip and the disclosures are gone: the Design stage is one workspace, and
 * the top of it draws the four steps of design (prepare, size, detail, document) over the
 * places of the desk. The assertions are the same claims, carried to the steps:
 *
 *   1. FOUR steps, in the order the work happens, numbered 1–4. Preparing is the model and the
 *      code together (the strip's MODELADO and REGLAMENTOS); they gate one thing.
 *   2. No verification step before sizing. A completed verification shown before anything has
 *      been designed says the reinforcement was verified.
 *   3. The steps stay put while the place under them scrolls.
 *   4. Pressing a step opens its places and moves the keyboard there.
 *   5. Opening a place by hand moves the reading marker. One state, both directions.
 *   6. The project marker («you are here») and the reading marker are separate.
 *   7. The steps say what they wait on.
 */

import { test, expect, loadModel, solveModel, designPlace, openDeskStage } from './fixtures';
import type { Page } from '@playwright/test';

/** The four steps, in the order the work happens. */
const STEPS = ['prepare', 'size', 'detail', 'document'] as const;

/**
 * The places each step opens. Duplicated from `stepOf` on purpose: a spec that imported the map
 * could not catch a wrong map.
 */
const PLACES: Record<(typeof STEPS)[number], readonly string[]> = {
  prepare: ['desk-rail-prepare', 'desk-rail-designData'],
  size: ['desk-tab-plan', 'desk-tab-levels', 'desk-mode-piece', 'desk-rail-list', 'desk-rail-steel', 'desk-rail-connections', 'desk-rail-codes', 'desk-mode-pending'],
  detail: ['desk-rail-detailing', 'desk-rail-3d'],
  document: ['desk-rail-documents'],
};

const bar = (page: Page) => page.getByTestId('desk-process');
const step = (page: Page, id: string) => page.getByTestId(`desk-step-${id}`);

test.describe('the steps are one vocabulary', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('draws exactly four steps, in the order the work happens', async ({ pro: page }) => {
    const items = bar(page).locator('[data-testid^="desk-step-"][data-state]');
    await expect(items).toHaveCount(4);
    for (const [i, id] of STEPS.entries()) {
      await expect(items.nth(i), `position ${i} is ${id}`).toHaveAttribute('data-testid', `desk-step-${id}`);
    }
  });

  test('numbers the steps 1 to 4', async ({ pro: page }) => {
    for (const [i, id] of STEPS.entries()) {
      // A finished step shows a tick instead of its number; on a fresh project none is.
      expect((await step(page, id).locator('.dp-mark').innerText()).trim(), `${id} shows its position`).toBe(String(i + 1));
    }
  });

  test('every step lands on its own places, and no two share one', async ({ pro: page }) => {
    const seen = new Set<string>();
    for (const id of STEPS) {
      await step(page, id).click();
      await expect(page.getByTestId('desk-rail')).toHaveAttribute('data-step', id);
      for (const p of PLACES[id]) {
        await expect(page.getByTestId(p), `${id} lists ${p}`).toBeVisible();
        expect(seen.has(p), `${p} is listed once`).toBe(false);
        seen.add(p);
      }
    }
  });

  test('has no verification step before sizing, and none of the orphaned ids', async ({ pro: page }) => {
    for (const orphan of ['demands', 'check', 'floors', 'verification', 'codes', 'model']) {
      await expect(step(page, orphan), `${orphan} is not a step`).toHaveCount(0);
    }
    const labels = (await bar(page).locator('[data-testid^="desk-step-"][data-state]').allInnerTexts()).map((s) => s.trim().toLowerCase());
    const sizeIdx = STEPS.indexOf('size');
    for (const [i, l] of labels.entries()) {
      if (i < sizeIdx) expect(l, `"${l}" precedes sizing and must not claim verification`).not.toMatch(/verif/i);
    }
  });
});

test.describe('the steps stay where they can be read', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('do not scroll away with the place under them', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designPlace(page, 'list');
    await expect(page.getByTestId('pro-design-tab')).toBeVisible();
    const before = await bar(page).boundingBox();
    const column = page.locator('.dd-canvas-body');
    await expect.poll(() => column.evaluate((el) => el.scrollHeight - el.clientHeight), { message: 'the place has something to scroll' }).toBeGreaterThan(0);
    await column.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect.poll(() => column.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    const after = await bar(page).boundingBox();
    expect(Math.abs(after!.y - before!.y), 'the steps held their position').toBeLessThanOrEqual(2);
    await expect(bar(page)).toBeInViewport();
  });

  /*
   * It must not eat the screen. The bar replaced the ribbon's command row AND the desk's head, so
   * it is held to less than either was: one line of steps, the step's actions beside them.
   */
  test('stays compact at 1024x700', async ({ pro: page }) => {
    await page.setViewportSize({ width: 1024, height: 700 });
    const box = await bar(page).boundingBox();
    expect(box!.height, 'the bar is a bar, not a panel').toBeLessThan(80);
    const tops = await bar(page).locator('[data-testid^="desk-step-"][data-state]')
      .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(tops).size, 'every step sits on one line').toBe(1);
  });

  test('the place never scrolls sideways at either size', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designPlace(page, 'list');
    for (const vp of [{ width: 1280, height: 720 }, { width: 1024, height: 700 }]) {
      await page.setViewportSize(vp);
      const over = await page.locator('.dd-canvas-body').evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(over, `no horizontal overflow at ${vp.width}`).toBeLessThanOrEqual(1);
    }
  });
});

test.describe('navigation goes both ways, and there is one state', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  /* Focus, not just the eye: the next Tab continues in the step's places, not on the bar. */
  test('pressing a step moves the keyboard into its places', async ({ pro: page }) => {
    await step(page, 'detail').click();
    await expect(page.getByTestId('desk-rail').locator('button').first()).toBeFocused();
  });

  test('and the bar marks what is being read', async ({ pro: page }) => {
    await step(page, 'detail').click();
    await expect(step(page, 'detail')).toHaveAttribute('data-open', 'true');
    await expect(step(page, 'prepare')).not.toHaveAttribute('data-open', 'true');
  });

  test('opening a place by hand moves the marker', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designPlace(page, 'designData');
    await expect(step(page, 'prepare')).toHaveAttribute('data-open', 'true');
    await designPlace(page, 'documents');
    await expect(step(page, 'document')).toHaveAttribute('data-open', 'true');
    await expect(step(page, 'prepare')).not.toHaveAttribute('data-open', 'true');
  });

  /*
   * `aria-current` marks where the PROJECT is; `data-open` marks what you are READING. Reading a
   * later step must not move the «you are here» marker onto it.
   */
  test('the reading marker and the "you are here" marker are separate', async ({ pro: page }) => {
    await step(page, 'document').click();
    await expect(step(page, 'document')).toHaveAttribute('data-open', 'true');
    const current = bar(page).locator('[aria-current="step"]');
    await expect(current, 'exactly one step is current').toHaveCount(1);
    await expect(step(page, 'prepare'), 'and it is still Prepare').toHaveAttribute('aria-current', 'step');
  });

  /* Escape inside the «Size…» dialog closes the dialog only, not design. */
  test('Escape closes the topmost surface only', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await designPlace(page, 'plan');
    await page.getByTestId('desk-design').click();
    await expect(page.getByTestId('desk-run-options')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('desk-run-options')).toBeHidden();
    await expect(page.getByTestId('design-desk')).toBeVisible();
  });

  test('every step button is reachable and named by the keyboard', async ({ pro: page }) => {
    for (const id of STEPS) {
      const btn = step(page, id);
      const name = await btn.evaluate((el) => (el.textContent ?? '').trim());
      expect(name.length, `${id} has an accessible name`).toBeGreaterThan(1);
      await btn.focus();
      await expect(btn).toBeFocused();
    }
  });
});

test.describe('the steps say what they are waiting for', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('an empty project says there is no model', async ({ pro: page }) => {
    await openDeskStage(page);
    const r = page.getByTestId('desk-step-next');
    await expect(r).toBeVisible();
    await expect(r).toHaveAttribute('data-readiness', 'empty');
  });

  test('a loaded but unsolved model says so instead', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    const r = page.getByTestId('desk-step-next');
    await expect(r).toHaveAttribute('data-readiness', 'unsolved');
    await expect(r).toBeVisible();
  });

  test('and a solved one finishes preparing', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await expect(step(page, 'prepare')).toHaveAttribute('data-state', 'complete');
    await expect(page.getByTestId('desk-step-next')).not.toHaveAttribute('data-readiness', /empty|unsolved/);
  });

  test('an empty project blocks what cannot start, and marks Document optional', async ({ pro: page }) => {
    await expect(step(page, 'prepare')).toHaveAttribute('data-state', 'current');
    await expect(step(page, 'size')).toHaveAttribute('data-state', 'blocked');
    await expect(step(page, 'document')).toHaveAttribute('data-state', 'optional');
  });

  test('a project under way is pending rather than blocked', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await expect(step(page, 'detail')).toHaveAttribute('data-state', 'pending');
  });

  /*
   * An example model carries no ExportRecord and no manual-edit list — it predates both — and
   * loading one must neither fail nor make the app claim anything about them.
   */
  test('a model with no export or retouch history loads and designs normally', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await expect(bar(page)).toBeVisible();
    await expect(step(page, 'prepare')).toHaveAttribute('data-state', 'complete');
  });
});

for (const locale of ['en', 'es', 'pt'] as const) {
  test.describe(`in ${locale}`, () => {
    test.use({ appLocale: locale, viewport: { width: 1024, height: 700 } });

    test('every step is named, and none of the names is a key', async ({ pro: page }) => {
      for (const id of STEPS) {
        const label = (await step(page, id).innerText()).trim();
        expect(label.length, `${id} is named`).toBeGreaterThan(1);
        expect(label, `${id} is translated, not a key`).not.toMatch(/desk\.|design\./);
      }
      const hint = (await page.getByTestId('desk-step-next').innerText()).trim();
      expect(hint.length).toBeGreaterThan(5);
      expect(hint).not.toMatch(/^design\./);
    });

    test('and the steps still fit on one line', async ({ pro: page }) => {
      const tops = await bar(page).locator('[data-testid^="desk-step-"][data-state]')
        .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      expect(new Set(tops).size, `one line in ${locale}`).toBe(1);
    });
  });
}
