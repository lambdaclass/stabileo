/**
 * Keyboard access to the 3-D workspace: the trap, the landing, and the return.
 *
 * ── The defect this suite exists for ───────────────────────────────
 *
 * The workspace is `role="dialog" aria-modal="true"`, `position: fixed`, `z-index: 900`, and
 * Escape was its only keyboard affordance. `docs/handoffs/pr20-ui-and-workflow-plan.md` §5.2
 * lists three consequences and puts them first, as the only accessibility items that make the
 * feature unusable rather than merely degraded:
 *
 *   - **no focus trap.** Tab from inside the overlay walked straight into the page behind it,
 *     which `aria-modal` had just told a screen reader does not exist. The user then types
 *     into controls they cannot see, and the reading order and the visual order disagree
 *     completely. `aria-modal="true"` on a dialog that does not trap focus is worse than no
 *     ARIA at all: it actively lies to the assistive technology.
 *   - **no initial focus.** Opening left focus on the button that opened it — a button now
 *     underneath a full-window overlay — so the first Tab landed somewhere arbitrary.
 *   - **no focus restore on close.** Escape closed the overlay and focus went to `<body>`: the
 *     user was returned to the top of the document rather than to the control they left.
 *
 * ── Why these assertions are in a browser and not in Vitest ────────
 *
 * Because the thing under test is the browser's own Tab sequencing. A jsdom harness would be
 * asserting that the trap agrees with a reimplementation of tab order, which is the part most
 * likely to be wrong in both. This repo has no DOM environment for Vitest for exactly that
 * reason, and DOM behaviour lives in e2e. So the keystrokes here are real keystrokes.
 *
 * The small model is used throughout: none of this depends on how much steel is in the scene,
 * and the 7-storey building costs minutes to set up.
 */

import { test, expect, designAll, loadModel } from './fixtures';

type Page = import('@playwright/test').Page;

const SMALL = 'rc-qa-diagnostic';

/** Load, design, detail, and open the workspace through the UI — as the other 3-D specs do. */
async function openWorkspace(page: Page) {
  await loadModel(page, SMALL);
  await designAll(page);
  await page.getByTestId('detailing-disclosure').locator('> summary').click();
  const generate = page.getByTestId('cmd-generate-detailing');
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect
    .poll(() => page.evaluate(() => (window.__stabileo as unknown as
      { detailingAssemblies(): unknown[] }).detailingAssemblies().length), { timeout: 60_000 })
    .toBeGreaterThan(0);

  const before = await page.evaluate(() => window.__stabileo.rebarSceneBuilds());
  // `doc-3d` moved into the Documents stage, which is collapsed by default. The control that
  // opens the workspace is still the one focus must return to, which is what this file asserts.
  const docs = page.getByTestId('documents-disclosure');
  if (await docs.getAttribute('open') === null) await docs.locator('> summary').click();
  await page.getByTestId('doc-3d').click();
  await expect(page.getByTestId('rebar-workspace')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.rebarSceneBuilds()), { timeout: 180_000 })
    .toBeGreaterThan(before);
}

/** Where focus is, described the way a failure message should read. */
async function focused(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return { tag: 'none', inside: false, testid: null as string | null };
    return {
      tag: el.tagName.toLowerCase(),
      inside: !!el.closest('[data-testid="rebar-workspace"]'),
      testid: el.getAttribute('data-testid'),
    };
  });
}

test.describe('@smoke the 3-D workspace keeps the keyboard', () => {
  test('opening moves focus into the overlay, not onto the button underneath it', async ({ pro: page }) => {
    await openWorkspace(page);
    const at = await focused(page);
    expect(at.inside, `focus landed on <${at.tag} data-testid=${at.testid}> outside the overlay`)
      .toBe(true);
    // The container itself, so a screen reader reads the dialog's accessible name rather than
    // dropping the user part-way through its toolbar.
    expect(at.testid).toBe('rebar-workspace');
  });

  test('Tab never leaves the overlay, forwards or backwards', async ({ pro: page }) => {
    await openWorkspace(page);

    // Forwards, far enough to pass the last control several times over. The rail is open on
    // the e2e viewport, so this walks the topbar, the rail and the body.
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const at = await focused(page);
      expect(at.inside, `Tab #${i + 1} escaped to <${at.tag} data-testid=${at.testid}>`)
        .toBe(true);
    }

    // And backwards, which is the direction that walks out through the START of the dialog —
    // a separate edge, and the one an implementation that only wraps at the end will miss.
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Shift+Tab');
      const at = await focused(page);
      expect(at.inside, `Shift+Tab #${i + 1} escaped to <${at.tag} data-testid=${at.testid}>`)
        .toBe(true);
    }
  });

  test('the trap follows the rail: folding it does not open a hole', async ({ pro: page }) => {
    /**
     * The tabbables are asked for AT THE KEYSTROKE rather than captured on open, because the
     * rail folds, both banners come and go with the scene, and the details panel appears only
     * once something is picked. A list captured on open goes stale the first time any of that
     * happens, and a stale trap is a trap with holes in it.
     *
     * The rail is driven from a window width here rather than from the toggle alone, because
     * that is the only way to reach it: `.rail-toggle` is `display: none` above 860 px, where
     * the rail is a column beside the canvas and there is nothing to fold. Below it the rail
     * becomes a sheet OVER the canvas and the button appears. So the walk is: cross the
     * breakpoint, which folds the rail on its own, then re-open it as a sheet — two changes to
     * the tabbable set, one in each direction, with a Tab walk after each.
     */
    await openWorkspace(page);

    await page.setViewportSize({ width: 800, height: 720 });
    const toggle = page.getByTestId('rebar-rail-toggle');
    await expect(toggle, 'the rail toggle appears below the breakpoint').toBeVisible();
    await expect(toggle, 'crossing the breakpoint folds the rail by itself')
      .toHaveAttribute('aria-expanded', 'false');

    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const at = await focused(page);
      expect(at.inside, `Tab #${i + 1} escaped with the rail folded`).toBe(true);
    }

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const at = await focused(page);
      expect(at.inside, `Tab #${i + 1} escaped with the rail re-opened as a sheet`).toBe(true);
    }
  });

  test('Escape closes it and hands focus back to the control that opened it', async ({ pro: page }) => {
    await openWorkspace(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('rebar-workspace')).toHaveCount(0);

    const at = await focused(page);
    // `<body>` is what a dialog with no restore leaves behind, and it means "the top of the
    // document" — the user is not returned, they are ejected.
    expect(at.tag, 'focus fell to the document body instead of returning').not.toBe('body');
    expect(at.testid).toBe('doc-3d');
  });

  test('the close button restores focus too, not only Escape', async ({ pro: page }) => {
    await openWorkspace(page);
    await page.getByTestId('rebar-workspace-close').click();
    await expect(page.getByTestId('rebar-workspace')).toHaveCount(0);

    const at = await focused(page);
    expect(at.tag, 'focus fell to the document body instead of returning').not.toBe('body');
    expect(at.testid).toBe('doc-3d');
  });
});
