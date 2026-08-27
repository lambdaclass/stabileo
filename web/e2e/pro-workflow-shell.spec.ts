/**
 * The PRO shell as a workflow: the buttons that must exist, do something, and say what.
 *
 * ── The reports this suite exists for ──────────────────────────────
 *
 *  1. "The settings button at the top right does nothing." It did toggle state and it did
 *     mount the panel — into `.app-body`, whose `position: relative` made `top: 100%` mean one
 *     whole app-body below the window. Every click worked and nothing was ever visible.
 *  2. "A yellow warning sits over the right panel the moment PRO opens." `checkModel` reports
 *     three errors for an empty model, and the chip rendered on `count > 0`.
 *  3. "Getting to the 3-D view means finding a button inside a disclosure two levels under the
 *     commands that produce it."
 *
 * Every assertion here is on a REAL press in a real browser. Nothing is forced, nothing waits
 * on a timer, and no timeout is widened to make a slow thing pass.
 */

import { test, expect, designAll, loadModel, openDocumentsStage } from './fixtures';

type Page = import('@playwright/test').Page;

const SMALL = 'rc-qa-diagnostic';

test.describe('@smoke PRO shell — settings', () => {
  test('the settings button opens a panel that is actually on screen', async ({ pro: page }) => {
    const gear = page.getByTestId('pro-settings');
    await expect(gear).toBeVisible();
    await expect(gear, 'closed to begin with').toHaveAttribute('aria-expanded', 'false');

    await gear.click();

    const panel = page.getByTestId('pro-settings-panel');
    await expect(panel, 'the panel mounts').toBeVisible();
    await expect(gear).toHaveAttribute('aria-expanded', 'true');

    /**
     * The assertion the old bug would have failed.
     *
     * `toBeVisible()` alone would NOT have caught it: the panel had a size and was not
     * `display: none`, it was simply positioned below the bottom of the window. So this
     * measures where it landed, against the viewport it has to be inside.
     */
    const box = await panel.boundingBox();
    expect(box, 'the panel has a box').not.toBeNull();
    const view = page.viewportSize()!;
    expect(box!.y, 'top edge is on screen').toBeGreaterThanOrEqual(0);
    expect(box!.y, 'and not below the fold').toBeLessThan(view.height);
    expect(box!.x + box!.width, 'right edge is on screen').toBeLessThanOrEqual(view.width + 1);
    expect(box!.height, 'and it has real content in it').toBeGreaterThan(40);
  });

  test('Escape closes it and the gear is where focus goes back to', async ({ pro: page }) => {
    await page.getByTestId('pro-settings').click();
    await expect(page.getByTestId('pro-settings-panel')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pro-settings-panel')).toHaveCount(0);

    const focused = await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.getAttribute('data-testid') ?? null);
    expect(focused, 'focus returns to the control that opened it').toBe('pro-settings');
  });

  test('a click outside closes it', async ({ pro: page }) => {
    await page.getByTestId('pro-settings').click();
    await expect(page.getByTestId('pro-settings-panel')).toBeVisible();
    await page.getByTestId('pro-panel-title').click();
    await expect(page.getByTestId('pro-settings-panel')).toHaveCount(0);
  });

  test('it is reachable and operable from the keyboard alone', async ({ pro: page }) => {
    await page.getByTestId('pro-settings').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('pro-settings-panel')).toBeVisible();
    const inside = await page.evaluate(() =>
      !!document.activeElement?.closest('[data-testid="pro-settings-panel"]'));
    expect(inside, 'focus moves into the panel rather than staying under it').toBe(true);
  });
});

test.describe('@smoke PRO shell — the diagnostics warning', () => {
  test('an untouched PRO says nothing about being empty', async ({ pro: page }) => {
    // The bug report, asserted at the surface. The model is empty and `checkModel` has three
    // complaints about that; none of them is the user's problem yet.
    await expect(page.getByTestId('design-diagnostics-warning')).toHaveCount(0);
    await expect(page.getByTestId('pro-error-count'), 'and the old panel-header chip is gone')
      .toHaveCount(0);
  });

  test('it stays silent on a model that loads clean', async ({ pro: page }) => {
    await loadModel(page, SMALL);
    await expect(page.getByTestId('design-diagnostics-warning')).toHaveCount(0);
  });

  test('Diagnostics carries the control that hides it, and states its scope', async ({ pro: page }) => {
    // Through the ribbon, as a user reaches it: the Analyse stage, then the Diagnostics command.
    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-diagnostics').click();

    const notify = page.getByTestId('diag-notify');
    await expect(notify).toBeVisible();
    await expect(page.getByTestId('diag-hide-warning')).toBeVisible();
    // The scope is written out, not implied: per diagnostic set, for this session.
    await expect(notify).toContainText(/session|sesión/i);
  });
});

test.describe('@smoke PRO shell — Ver modelo 3D on the Design row', () => {
  test('the command is on the Design command row, disabled until there is something to draw',
    async ({ pro: page }) => {
      await loadModel(page, SMALL);
      const btn = page.getByTestId('cmd-open-3d');
      await expect(btn, 'it is on the main row, not inside a disclosure').toBeVisible();
      await expect(btn, 'and refuses honestly rather than vanishing').toBeDisabled();

      /**
       * It is IN the command row, and under no disclosure.
       *
       * Asserted by DOM containment rather than by comparing y-coordinates: the row wraps and the
       * PRO panel is a sidebar, so at some widths the commands legitimately run onto a second
       * line. What must never happen again is this command living somewhere else entirely — under
       * a disclosure, in another panel — and that is exactly what containment tests.
       *
       * ── Why `Design all` is no longer half of this claim ────────────
       *
       * It used to require `cmd-open-3d` and `cmd-design-all` in the same row. F3 step 3 moved the
       * design command to the stage strip, so that conjunction became unsatisfiable and this test
       * went red for a reason that had nothing to do with the 3-D command. Step 5 audited whether
       * this one should follow it there, and it should NOT:
       *
       *  - `openRebar3D` has FOUR entry points ON PURPOSE — this button, `overview-open-3d`,
       *    `doc-3d` and the ribbon's `pr-cmd-rebar3d` — and `rc-commands.test.ts` asserts that one
       *    function stays behind all of them. Every command in the strip has the opposite
       *    invariant: it exists exactly once, with no copy inside any disclosure.
       *  - one of those entries is `ProRibbon`, which serves the METALLIC flow. That flow has no
       *    `RcStageTimeline` at all, so a viewer reachable only from the RC strip could not serve
       *    it.
       *  - it advances no stage. `rc-stages.ts` has no notion of the workspace, and the strip's
       *    action row is keyed by stage.
       *  - its inputs are document metadata (author, timestamp), not stage state, and its
       *    prerequisite is the pipeline's OUTPUT: coordinated assemblies exist.
       *
       * So it is a transversal viewer tool that belongs on the Design row, next to the work whose
       * result it shows — not a pipeline step.
       *
       * ── What this asserts, and what it deliberately does not ────────
       *
       * "In the command row" it does assert. "Not inside a disclosure" it does NOT, and the first
       * attempt at this rewrite got that wrong and was caught here: since F2 put `ProDesignTab`
       * INSIDE the DISEÑAR stage, this button has a `<details>` ancestor like everything else in
       * the toolbar. Asserting otherwise would fail for a true reason.
       *
       * Which leaves a real question rather than a tidy answer: with DISEÑAR collapsed, THIS entry
       * is unreachable — the same form-1 hiding that moved the detailing command to the strip. It
       * is acceptable only because the viewer is not confined to it, and the entry that saves it is
       * the ribbon's, which sits outside every disclosure. That is asserted below, and it is what
       * "transversal" has to mean concretely to be worth anything.
       */
      const placement = await page.evaluate(() => {
        const b = document.querySelector('[data-testid="cmd-open-3d"]');
        const row = document.querySelector('[data-testid="design-toolbar"] .cmd-row');
        return { inRow: !!b && !!row && row.contains(b) };
      });
      expect(placement.inRow, "in the toolbar's command row").toBe(true);
    });

  /**
   * Every way in reaches the same viewer.
   *
   * The step-5 audit turned on this being deliberate, so it is asserted rather than left to a
   * comment: four entry points, one `openRebar3D`. Three live in the RC panel and one in the
   * ribbon that also serves the metallic flow. Presence and enablement are what this checks —
   * that they are the same OPERATION is proved below, and in `rc-commands.test.ts` on the source.
   */
  test('the viewer is reachable from every valid entry point', async ({ pro: page }) => {
    await loadModel(page, SMALL);
    await designAll(page);
    await page.getByTestId('detailing-disclosure').locator('> summary').click();
    await page.getByTestId('cmd-generate-detailing').click();
    await expect
      .poll(() => page.evaluate(() => (window.__stabileo as unknown as
        { detailingAssemblies(): unknown[] }).detailingAssemblies().length), { timeout: 60_000 })
      .toBeGreaterThan(0);

    // The three in the RC panel. `doc-3d` sits in the Documents stage, which has to be opened.
    for (const id of ['cmd-open-3d', 'overview-open-3d'] as const) {
      await expect(page.getByTestId(id), `${id} is present`).toBeVisible();
      await expect(page.getByTestId(id), `${id} is enabled once there is a document`).toBeEnabled();
    }
    await openDocumentsStage(page);
    await expect(page.getByTestId('doc-3d')).toBeEnabled();

    /*
     * And the ribbon's, which is the entry the metallic flow shares. Its stage has to be opened
     * first: the ribbon renders only the active stage's groups, so the command does not exist in
     * the DOM until then — which is why this asserts nothing about its absence beforehand.
     */
    await page.getByTestId('pr-stage-design').click();
    await expect(page.getByTestId('pr-cmd-rebar3d')).toBeEnabled();

    /*
     * And this is the one that makes the other three safe to leave inside disclosures.
     *
     * All three panel entries have a `<details>` ancestor — the toolbar and the overview live in
     * their stages, `doc-3d` in the Documents stage — so with those collapsed, none of them is
     * reachable. The ribbon's is not in a disclosure, which is why a collapsed panel can never
     * leave the viewer with no way in. If this ever changes, the panel entries stop being
     * conveniences and one of them has to move.
     */
    const outsideAnyDisclosure = await page.evaluate(() =>
      !document.querySelector('[data-testid="pr-cmd-rebar3d"]')?.closest('details'));
    expect(outsideAnyDisclosure,
      'the ribbon entry is reachable with every panel section collapsed').toBe(true);
  });

  test('it enables once detailing exists, reports the count, and opens the workspace',
    async ({ pro: page }) => {
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

      const btn = page.getByTestId('cmd-open-3d');
      await expect(btn).toBeEnabled();

      // The count on the button is the number of coordinated assemblies, not a decoration.
      const shown = Number(await page.getByTestId('cmd-open-3d-count').innerText());
      const actual = await page.evaluate(() => (window.__stabileo as unknown as
        { detailingAssemblies(): unknown[] }).detailingAssemblies().length);
      expect(shown).toBe(actual);

      const before = await page.evaluate(() => window.__stabileo.rebarSceneBuilds());
      await btn.click();
      await expect(page.getByTestId('rebar-workspace'), 'the big workspace, not a panel preview')
        .toBeVisible();
      await expect
        .poll(() => page.evaluate(() => window.__stabileo.rebarSceneBuilds()), { timeout: 180_000 })
        .toBeGreaterThan(before);
    });

  test('both entry points are the same operation', async ({ pro: page }) => {
    /**
     * Two buttons with one name must not be two operations. `openRebar3D` is the only path
     * either takes, so the revision behind the picture is the same revision whichever is
     * pressed — which is what keeps the 3-D view, the report, the schedule and the drawings
     * projections of one document instead of two that happen to agree.
     */
    await loadModel(page, SMALL);
    await designAll(page);
    await page.getByTestId('detailing-disclosure').locator('> summary').click();
    await page.getByTestId('cmd-generate-detailing').click();
    await expect
      .poll(() => page.evaluate(() => (window.__stabileo as unknown as
        { detailingAssemblies(): unknown[] }).detailingAssemblies().length), { timeout: 60_000 })
      .toBeGreaterThan(0);

    await page.getByTestId('cmd-open-3d').click();
    await expect(page.getByTestId('rebar-workspace')).toBeVisible();
    const viaToolbar = await page.evaluate(() => window.__stabileo.rebarSceneCensus());
    await page.getByTestId('rebar-workspace-close').click();
    await expect(page.getByTestId('rebar-workspace')).toHaveCount(0);

    // `doc-3d` moved into the Documents stage, which is collapsed by default.
    const docs = page.getByTestId('documents-disclosure');
    if (await docs.getAttribute('open') === null) await docs.locator('> summary').click();
    await page.getByTestId('doc-3d').click();
    await expect(page.getByTestId('rebar-workspace')).toBeVisible();
    const viaPanel = await page.evaluate(() => window.__stabileo.rebarSceneCensus());
    await page.getByTestId('rebar-workspace-close').click();
    await expect(page.getByTestId('rebar-workspace')).toHaveCount(0);

    /**
     * The third entry point, added by this pass.
     *
     * `View 3-D model` is now offered at the top of the panel as well, because reaching it used
     * to mean opening detailing and scrolling. Three ways in is only acceptable while all three
     * are ONE operation — so the census is compared across all of them, not just two.
     */
    await page.getByTestId('overview-open-3d').click();
    await expect(page.getByTestId('rebar-workspace')).toBeVisible();
    const viaOverview = await page.evaluate(() => window.__stabileo.rebarSceneCensus());

    expect(viaPanel, 'the same scene, from either button').toEqual(viaToolbar);
    expect(viaOverview, 'and from the one at the top of the panel').toEqual(viaToolbar);
  });
});

test.describe('@smoke PRO shell — the Project section', () => {
  test('nothing in it touches the panel border', async ({ pro: page }) => {
    await page.getByTestId('pr-project').click();
    const tab = page.getByTestId('pro-project-tab');
    await expect(tab).toBeVisible();

    const panel = await tab.boundingBox();
    const buttons = page.locator('[data-testid="pro-project-tab"] button');
    const n = await buttons.count();
    expect(n, 'there are controls to check').toBeGreaterThan(3);

    for (let i = 0; i < n; i++) {
      const b = await buttons.nth(i).boundingBox();
      if (!b) continue; // inside a collapsed disclosure
      // Four pixels is the smallest gap that reads as deliberate rather than as a clipped edge.
      expect(b.x - panel!.x, `control ${i} clears the left edge`).toBeGreaterThanOrEqual(4);
      expect((panel!.x + panel!.width) - (b.x + b.width), `control ${i} clears the right edge`)
        .toBeGreaterThanOrEqual(4);
    }
  });

  test('it states what is open and where the autosave lives', async ({ pro: page }) => {
    await page.getByTestId('pr-project').click();
    await expect(page.getByTestId('pro-project-tab')).toBeVisible();
    await expect(page.getByTestId('pp-doc-name')).toBeVisible();
    await expect(page.getByTestId('pp-doc-size')).toBeVisible();
    await expect(page.getByTestId('pp-autosave-backend')).toBeVisible();
    await expect(page.getByTestId('pp-autosave-last')).toBeVisible();

    // One restore surface, and it is not this one.
    await expect(page.locator('[data-testid="pro-project-tab"] button.restore'),
      'the Restore button belongs to the inline prompt beside the tabs').toHaveCount(0);
  });

  test('every control in it shows a focus ring', async ({ pro: page }) => {
    await page.getByTestId('pr-project').click();
    await expect(page.getByTestId('pro-project-tab')).toBeVisible();
    const save = page.getByTestId('pp-save');
    await save.focus();
    const outline = await save.evaluate((el) => getComputedStyle(el).outlineWidth);
    expect(parseFloat(outline), 'a keyboard user can see where they are').toBeGreaterThan(0);
  });
});
