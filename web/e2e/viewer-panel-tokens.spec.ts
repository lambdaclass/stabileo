/**
 * The viewer's concrete panels paint from tokens, and the scene's colours stay the scene's.
 *
 * ── What only a browser can settle ─────────────────────────────────
 *
 * `concrete-status-tokens.test.ts` reads the source and computes the contrast arithmetic from
 * `tokens.css`. Two things it cannot see:
 *
 * 1. **Whether the token resolves to what it says.** `.workspace` SHADOWS `--st-border` with
 *    `--st-hair-strong`, so a panel inside the overlay and the same panel outside it paint
 *    different values from one declaration. Only `getComputedStyle` inside the real cascade
 *    knows which.
 * 2. **Whether a hover rule fires at all.** A `:hover` selector that never matches is invisible
 *    to a source assertion and to a screenshot.
 *
 * ── The route, and why it is the cheap one first ───────────────────
 *
 * `RebarScenePanel` mounts twice: inside `RebarWorkspace` and inside `DocumentsSection`. The
 * second is reachable without opening the WebGL workspace at all, which is where its one
 * tokenised rule — the filled `.open` button — lives. That part runs in all three languages. The
 * overlay panels need the scene built, so they run once, at the same width.
 */

import { test, expect, designAll, loadModel, openDocumentsStage } from './fixtures';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 720 } });

const resolve = (page: Page, colour: string) =>
  page.evaluate((c) => {
    const el = document.createElement('span');
    el.style.color = c;
    document.body.appendChild(el);
    const out = getComputedStyle(el).color;
    el.remove();
    return out;
  }, colour);

/** A token as the browser finally paints it, read from the element that USES it. */
const tokenOn = (page: Page, testid: string, name: string) =>
  page.getByTestId(testid).evaluate(
    (el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);

const resolvedOn = async (page: Page, testid: string, name: string) =>
  resolve(page, await tokenOn(page, testid, name));

/**
 * Reach the scene panel in Documents — no workspace, no WebGL.
 *
 * The assemblies poll is not optional: `doc-3d` is clickable before the detailing exists, and
 * the panel then renders `rebar-empty` with no `.open` button in it, which would make every
 * assertion below vacuous rather than failing.
 */
async function openScenePanel(page: Page) {
  await loadModel(page, 'rc-design-qa-8');
  await designAll(page);
  await page.getByTestId('detailing-disclosure').locator('> summary').click();
  const generate = page.getByTestId('cmd-generate-detailing');
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect
    .poll(() => page.evaluate(() =>
      (window.__stabileo as unknown as { detailingAssemblies(): unknown[] })
        .detailingAssemblies().length), { timeout: 60_000 })
    .toBeGreaterThan(0);
  await openDocumentsStage(page);
  await buildScene(page);
  /*
   * The overlay is CLOSED again on purpose.
   *
   * `doc-3d` does not merely reveal the Documents panel — it opens the workspace over it. The
   * first version of this file then clicked `rebar-open-workspace` to "open" a workspace that
   * was already open, and Playwright waited three minutes for a button sitting under the
   * overlay to become actionable. Reading a computed style off a covered element works, which
   * is why the five assertions that only measure passed and the three that clicked did not.
   */
  await page.getByTestId('rebar-workspace-close').click();
  await expect(page.getByTestId('rebar-workspace')).toHaveCount(0);
  await expect(page.getByTestId('rebar-open-workspace')).toBeVisible({ timeout: 60_000 });
}

/** Click through to the 3-D document and wait on the BUILD COUNTER, not on the paint. */
async function buildScene(page: Page) {
  const before = await page.evaluate(() =>
    (window.__stabileo as unknown as { rebarSceneBuilds(): number }).rebarSceneBuilds());
  await page.getByTestId('doc-3d').click();
  await expect(page.getByTestId('rebar-workspace')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() =>
      (window.__stabileo as unknown as { rebarSceneBuilds(): number }).rebarSceneBuilds()),
      { timeout: 120_000 })
    .toBeGreaterThan(before);
}

test.describe('@slow the scene panel in Documents', () => {
  test.slow();

  test('the open-workspace button is the blue fill, not the danger fill',
    async ({ pro: page }) => {
      await openScenePanel(page);
      const btn = page.getByTestId('rebar-open-workspace');
      const bg = await btn.evaluate((el) => getComputedStyle(el).backgroundColor);
      const fg = await btn.evaluate((el) => getComputedStyle(el).color);

      expect(bg, 'the fill is --st-blue')
        .toBe(await resolvedOn(page, 'rebar-open-workspace', '--st-blue'));
      expect(fg, 'the label is --st-text-on-accent')
        .toBe(await resolvedOn(page, 'rebar-open-workspace', '--st-text-on-accent'));

      // The negative that matters: `--st-accent` is vermillion and is what this application
      // fills its DESTRUCTIVE buttons with. "Open workspace" must not have joined them.
      expect(bg, 'and not the accent/danger fill')
        .not.toBe(await resolvedOn(page, 'rebar-open-workspace', '--st-accent'));
      // Nor the literal it replaced, which is four steps away on two channels.
      expect(bg).not.toBe(await resolve(page, '#2b6cb0'));
    });

  test('the state dots still paint exactly what Three.js paints', async ({ pro: page }) => {
    await openScenePanel(page);
    /*
     * The mirror, measured on the rendered page rather than in the stylesheet. A token that
     * resolved to a near-miss would satisfy the source test and fail here.
     */
    const expected: Record<string, string> = {
      failed: '#e0444a', unsupported: '#b06ad6', refused: '#d4762a',
      'designed-not-modelled': '#d9c04a', 'not-evaluated': '#8b93a3', modelled: '#4caf72',
    };
    const seen: string[] = [];
    for (const [state, hex] of Object.entries(expected)) {
      const dot = page.locator(`.dot.${state}`).first();
      if (!(await dot.count())) continue;
      seen.push(state);
      expect(await dot.evaluate((el) => getComputedStyle(el).backgroundColor), state)
        .toBe(await resolve(page, hex));
    }
    expect(seen.length, 'at least one state row is on screen').toBeGreaterThan(0);
    test.info().annotations.push(
      { type: 'coverage', description: `dots measured: ${seen.join(', ') || 'none'}` });
  });
});

for (const locale of ['en', 'es', 'pt'] as const) {
  test.describe(`@slow the scene panel holds 1280×720 in ${locale}`, () => {
    test.slow();
    test.use({ appLocale: locale, viewport: { width: 1280, height: 720 } });

    test('nothing in it overflows and the button keeps its fill', async ({ pro: page }) => {
      await openScenePanel(page);
      const panel = page.getByTestId('rebar-open-workspace')
        .locator('xpath=ancestor::*[contains(@class,"scene")][1]');
      const target = (await panel.count()) ? panel : page.getByTestId('rebar-open-workspace');
      const box = await target.evaluate(
        (el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
      expect(box.scroll, `fits at 1280 in ${locale}`).toBeLessThanOrEqual(box.client + 1);

      // The label length changes per language; the fill must not.
      const btn = page.getByTestId('rebar-open-workspace');
      expect(await btn.evaluate((el) => getComputedStyle(el).backgroundColor))
        .toBe(await resolvedOn(page, 'rebar-open-workspace', '--st-blue'));
      // And the button did not grow out of the rail because a Portuguese verb is longer.
      const w = (await btn.boundingBox())!.width;
      expect(w, `the button stays a button in ${locale}`).toBeLessThan(420);
    });
  });
}

test.describe('@slow inside the workspace overlay', () => {
  test.slow();

  /**
   * The action buttons of the two panels this pass touched — scoped to the overlay.
   *
   * `.sel-actions button, .actions button` was the first version and it was wrong in the worst
   * way: it resolved to `review-submit`, a "Record review" button belonging to another component
   * entirely, sitting UNDER the workspace canvas. `hover()` reported the truth — the canvas
   * intercepts pointer events — but the test that only READ a computed style measured that
   * foreign button and passed. So the scope is the workspace, and the selection is made first,
   * because `SelectionDetails` renders its actions only once something is selected.
   */
  async function actionButton(page: Page) {
    const ws = page.getByTestId('rebar-workspace');
    let btn = ws.locator('.sel-actions button:visible, .actions button:visible').first();
    if (!(await btn.count())) {
      const row = ws.locator('[data-testid^="rebar-element-"]').first();
      if (await row.count()) {
        await row.click();
        btn = ws.locator('.sel-actions button:visible, .actions button:visible').first();
      }
    }
    return btn;
  }

  /** Re-open the overlay the way a user does after closing it, and wait on the build again. */
  async function openOverlay(page: Page) {
    await openScenePanel(page);
    const before = await page.evaluate(() =>
      (window.__stabileo as unknown as { rebarSceneBuilds(): number }).rebarSceneBuilds());
    await page.getByTestId('rebar-open-workspace').click();
    await expect(page.getByTestId('rebar-workspace')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() =>
        (window.__stabileo as unknown as { rebarSceneBuilds(): number }).rebarSceneBuilds()),
        { timeout: 120_000 })
      .toBeGreaterThan(before);
  }

  test('--st-border resolves to the STRONGER hairline in here, as the overlay intends',
    async ({ pro: page }) => {
      await openOverlay(page);
      /*
       * The one assertion no source test could make. `.workspace` declares
       * `--st-border: var(--st-hair-strong)`, so the action buttons' 1px rule is the 0.38
       * hairline inside the overlay and would be the 0.22 one outside it. Both are correct; the
       * point is that the shadow is live, which is why this pass left those fallbacks alone.
       */
      const btn = await actionButton(page);
      if (!(await btn.count())) {
        test.info().annotations.push(
          { type: 'note', description: 'no action button in the overlay — shadow unasserted' });
        return;
      }
      const border = await btn.evaluate((el) => getComputedStyle(el).borderTopColor);
      const strong = await resolve(page, await page.getByTestId('rebar-workspace')
        .evaluate((el) => getComputedStyle(el).getPropertyValue('--st-hair-strong').trim()));
      expect(border, 'inside the overlay the rule is the strong hairline').toBe(strong);
    });

  test('the hover rule fires and pairs an interactive border with full-contrast text',
    async ({ pro: page }) => {
      await openOverlay(page);
      /*
       * `:visible`, and scrolled to, before hovering.
       *
       * The previous test reads a computed style and passes on an element the rail has scrolled
       * out of view — `getComputedStyle` does not care. `hover()` does: it waits for
       * actionability, and `.first()` over both selectors had been resolving to a button inside
       * a collapsed inspector, so it waited the full three minutes for something that was never
       * going to be hoverable.
       */
      const btn = await actionButton(page);
      if (!(await btn.count())) {
        test.info().annotations.push(
          { type: 'note', description: 'no visible action button — hover unasserted' });
        return;
      }
      // Named, so a future failure says which button was measured rather than "a button".
      test.info().annotations.push({
        type: 'target',
        description: `hovered ${await btn.getAttribute('data-testid') ?? '(untagged)'}`,
      });
      await btn.scrollIntoViewIfNeeded();
      const beforeBorder = await btn.evaluate((el) => getComputedStyle(el).borderTopColor);
      await btn.hover();
      const afterBorder = await btn.evaluate((el) => getComputedStyle(el).borderTopColor);
      const afterText = await btn.evaluate((el) => getComputedStyle(el).color);

      // It fired. A `:hover` that never matches is invisible to a source assertion.
      expect(afterBorder, 'the hover rule actually applies').not.toBe(beforeBorder);
      const ws = page.getByTestId('rebar-workspace');
      const [interactive, text] = await Promise.all([
        ws.evaluate((el) => getComputedStyle(el).getPropertyValue('--st-interactive').trim())
          .then((v) => resolve(page, v)),
        ws.evaluate((el) => getComputedStyle(el).getPropertyValue('--st-text').trim())
          .then((v) => resolve(page, v)),
      ]);
      expect(afterBorder).toBe(interactive);
      expect(afterText, 'the label goes to full contrast, not to the blue')
        .toBe(text);
      expect(afterBorder, 'and not the literal it replaced')
        .not.toBe(await resolve(page, '#6fa8ff'));
    });

  test('the torsion notice and the conflict band, when the model produces them',
    async ({ pro: page }) => {
      await openOverlay(page);
      const ws = page.getByTestId('rebar-workspace');
      const tok = async (n: string) =>
        resolve(page, await ws.evaluate(
          (el, name) => getComputedStyle(el).getPropertyValue(name).trim(), n));
      const [warn, text] = [await tok('--st-warn'), await tok('--st-text')];
      const seen: string[] = [];

      // `TorsionBanner` — the other half of the amber pair.
      const banner = page.getByTestId('rebar-torsion-banner');
      if (await banner.count()) {
        seen.push('torsion-banner');
        expect(await banner.evaluate((el) => getComputedStyle(el).color)).toBe(text);
        expect(await banner.evaluate((el) => getComputedStyle(el).borderBottomColor)).toBe(warn);
        expect(await banner.locator('strong').first()
          .evaluate((el) => getComputedStyle(el).color)).toBe(warn);
        // And it stopped borrowing the unreinforced orange.
        expect(await banner.evaluate((el) => getComputedStyle(el).borderBottomColor))
          .not.toBe(await resolve(page, '#d4762a'));
      }

      // `SelectionDetails` — the half that must match it.
      const sel = page.getByTestId('rebar-sel-torsion');
      if (await sel.count()) {
        seen.push('sel-torsion');
        expect(await sel.evaluate((el) => getComputedStyle(el).color)).toBe(text);
        expect(await sel.locator('strong').first()
          .evaluate((el) => getComputedStyle(el).color)).toBe(warn);
      }

      // `ConflictInspector` — the band whose fill and rule stay the scene's.
      const band = page.getByTestId('rebar-conflict-warning');
      if (await band.count()) {
        seen.push('conflict-band');
        expect(await band.evaluate((el) => getComputedStyle(el).color)).toBe(text);
        expect(await band.evaluate((el) => getComputedStyle(el).borderLeftColor))
          .toBe(await resolve(page, '#e0444a'));
      }

      /*
       * Stated, not implied. If this fixture shows none of the three, the amber pair and the
       * conflict band are covered at source only, and saying so is the difference between a
       * test that proves something and one that looks like it did.
       */
      test.info().annotations.push({
        type: 'coverage',
        description: seen.length
          ? `measured in the browser: ${seen.join(', ')}`
          : 'none of the three appeared on this fixture — source coverage only',
      });
    });
});

/**
 * The amber pair, on the model that actually raises it.
 *
 * The first version of the test above reported "none of the three appeared on this fixture —
 * source coverage only", which was true and useless: `rc-design-qa-8` designs without torsion, so
 * `TorsionBanner` and `SelectionDetails`'s torsion line never rendered and the pair was verified
 * nowhere but in the stylesheet.
 *
 * `rc-qa-diagnostic` raises the torsion banner — `rebar-toggles.spec.ts` relies on that same fact
 * for its own worst-case rail test. So the pair is measured where it exists rather than asserted
 * where it is convenient.
 */
test.describe('@slow the torsion amber, measured where the model raises it', () => {
  test.slow();

  test('the banner and the selection line resolve to the same two tokens',
    async ({ pro: page }) => {
      await loadModel(page, 'rc-qa-diagnostic');
      await designAll(page);
      await page.getByTestId('detailing-disclosure').locator('> summary').click();
      const generate = page.getByTestId('cmd-generate-detailing');
      await expect(generate).toBeEnabled();
      await generate.click();
      await expect
        .poll(() => page.evaluate(() =>
          (window.__stabileo as unknown as { detailingAssemblies(): unknown[] })
            .detailingAssemblies().length), { timeout: 60_000 })
        .toBeGreaterThan(0);
      await openDocumentsStage(page);
      await buildScene(page);

      const banner = page.getByTestId('rebar-torsion-banner');
      await expect(banner, 'this model must raise the torsion banner').toBeVisible();

      const ws = page.getByTestId('rebar-workspace');
      const tok = async (n: string) =>
        resolve(page, await ws.evaluate(
          (el, name) => getComputedStyle(el).getPropertyValue(name).trim(), n));
      const [warn, text] = [await tok('--st-warn'), await tok('--st-text')];

      expect(await banner.evaluate((el) => getComputedStyle(el).color),
        'the banner body is full-contrast text').toBe(text);
      expect(await banner.evaluate((el) => getComputedStyle(el).borderBottomColor),
        'and its rule is the warn token').toBe(warn);
      expect(await banner.locator('strong').first()
        .evaluate((el) => getComputedStyle(el).color), 'as is its emphasis').toBe(warn);

      // The negatives: the private pair, and the unreinforced orange it used to borrow.
      for (const gone of ['#f2ddc6', '#ffbe7a', '#d4762a']) {
        const lit = await resolve(page, gone);
        expect(await banner.evaluate((el) => getComputedStyle(el).color), gone).not.toBe(lit);
        expect(await banner.evaluate((el) => getComputedStyle(el).borderBottomColor), gone)
          .not.toBe(lit);
      }

      // And the other half of the pair, if a member carrying torsion can be selected.
      const row = ws.locator('[data-testid^="rebar-element-"]').first();
      if (await row.count()) await row.click();
      const sel = page.getByTestId('rebar-sel-torsion');
      if (await sel.count()) {
        expect(await sel.evaluate((el) => getComputedStyle(el).color),
          'SelectionDetails agrees with the banner').toBe(text);
        expect(await sel.locator('strong').first()
          .evaluate((el) => getComputedStyle(el).color)).toBe(warn);
        test.info().annotations.push(
          { type: 'coverage', description: 'banner AND selection line measured' });
      } else {
        test.info().annotations.push({
          type: 'coverage',
          description: 'banner measured; the selection line needs a torsioned member selected',
        });
      }
    });
});
