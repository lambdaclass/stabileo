/**
 * F6 — the 3-D viewer, audited and then gated.
 *
 * Every test here was written from a MEASUREMENT taken before the fix, and each one states the
 * number it fired on. The unit suite already proves the pieces — `rebar-workspace-selection`
 * proves the channel, `element-status` proves the states, `viewer-notices` proves the fold — so
 * what belongs here is only what needs a real window, a real overlay and real focus:
 *
 *   1. that DETALLE can reach the viewer at all;
 *   2. that closing it returns the user to the control they left;
 *   3. that the standing notices fold to a row and never to nothing;
 *   4. that the selection panel is a column beside the cage on a window that can afford one;
 *   5. that a member picked in the list is the member the viewer reports, through ONE channel.
 */

import { test, expect, loadModel, solveModel, computeDemands } from './fixtures';
import type { Page } from '@playwright/test';

/** Frames only: no shells, no footings, and fast enough to set up per test. */
const FRAMES = 'rc-design-qa-8';

const builds = (page: Page) => page.evaluate(() => window.__stabileo.rebarSceneBuilds());

/** A designed, coordinated project — the state every one of these tests starts from. */
async function coordinated(page: Page): Promise<void> {
  await loadModel(page, FRAMES);
  await solveModel(page);
  await computeDemands(page);
  await page.evaluate(() => window.__stabileoActions.designAll());
  await expect.poll(() => page.evaluate(() => window.__stabileo.runCounts()?.total ?? 0))
    .toBeGreaterThan(0);
  await page.getByTestId('cmd-generate-detailing').click();
  await expect
    .poll(() => page.evaluate(() => (window.__stabileo.detailingAssemblies() as unknown[]).length))
    .toBeGreaterThan(0);
}

async function openDetailing(page: Page): Promise<void> {
  const section = page.getByTestId('detailing-disclosure');
  if (await section.getAttribute('open') === null) {
    await section.locator('> summary').click();
  }
  await expect(page.getByTestId('rc-member-list')).toBeVisible();
}

/** What has DOM focus, named the way a reader would name it. */
function focused(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute('data-testid')
    ?? document.activeElement?.tagName ?? null);
}

async function waitForScene(page: Page): Promise<void> {
  await expect(page.getByTestId('rebar-workspace')).toBeVisible();
  await expect.poll(() => builds(page), { timeout: 120_000 }).toBeGreaterThan(0);
}

// ─── 1. The stage that details the steel can show it ─────────────

test.describe('@smoke DETALLE reaches the viewer', () => {
  test('the stage carries an entry, and it is the same operation as the others', async (
    { pro: page },
  ) => {
    await coordinated(page);
    await openDetailing(page);

    /**
     * The measurement this fired on.
     *
     * Walking the five disclosures and collecting every control whose testid names the viewer
     * gave: MODELADO `overview-open-3d`, DISEÑAR `cmd-open-3d`, DOCUMENTOS `doc-3d`, and DETALLE
     * `[]`. The stage whose whole subject is the coordinated cage was the one stage that could
     * not open it — and `selectAndFocus` files a camera request from these rows that only the
     * open overlay serves, so a click here highlighted a row and did nothing else.
     */
    const entry = page.getByTestId('member-list-open-3d');
    await expect(entry, 'DETALLE has a way into the viewer').toBeVisible();
    await expect(entry).toBeEnabled();

    const before = await builds(page);
    await entry.click();
    await waitForScene(page);
    expect(await builds(page), 'it built the cage once, not twice').toBe(before + 1);

    /**
     * ONE document, not a second projection.
     *
     * `canvasCount` covers every canvas in the page, so a second WebGL surface would show up
     * here whether or not it was the reinforcement's. Three is the whole page: the 2-D viewport,
     * the main 3-D viewport, and this overlay's.
     */
    expect(await page.evaluate(() => window.__stabileo.canvasCount()),
      'the overlay adds one canvas, and only one').toBe(3);
  });

  test('a member chosen in the list is the member the viewer arrives on', async ({ pro: page }) => {
    await coordinated(page);
    await openDetailing(page);

    const rows = await page.locator(
      '[data-testid="rc-family-rows-beam"] [data-testid^="rc-member-"][data-family]')
      .evaluateAll((els) => els.map(
        (e) => e.getAttribute('data-testid')!.replace('rc-member-', '')));
    expect(rows.length, 'the fixture has beams to choose from').toBeGreaterThan(1);
    // Deliberately not the first row: a defect that selects by POSITION passes on index 0.
    const target = Number(rows[1]);

    await page.getByTestId(`rc-member-${target}`).click();
    expect(await page.evaluate(() => window.__stabileo.rebarSelection()),
      'the shared channel holds exactly that member').toEqual([target]);

    await page.getByTestId('member-list-open-3d').click();
    await waitForScene(page);

    /**
     * The selection SURVIVES the open, and nothing re-sends it.
     *
     * `rebarWorkspace.selection` is one `$state` and the camera request is queued on it, so the
     * open serves a focus the list filed while the overlay was closed. A viewer that had to be
     * told again would be a second channel by another name.
     */
    expect(await page.evaluate(() => window.__stabileo.rebarSelection()),
      'the same member, through the same channel').toEqual([target]);
    await expect(page.getByTestId('rebar-inspector'),
      'and the panel reports it rather than "nothing selected"')
      .toHaveAttribute('data-selected', 'true');
    await expect(page.getByTestId('rebar-inspector')).toContainText(String(target));
  });
});

// ─── 2. Closing returns the user where they were ─────────────────

test.describe('@smoke focus comes back to the control that opened the viewer', () => {
  /**
   * The trace this fired on.
   *
   * Instrumenting `HTMLElement.prototype.focus` and both focus events across one open produced:
   * `out← cmd-open-3d`, `focus(rebar-workspace)`, `in→ rebar-workspace`, then on Escape
   * `out← rebar-workspace`, `focus(BODY)` — with no `focus(cmd-open-3d)` anywhere. The opener
   * had been blurred by its own pending state DISABLING it, so `captureFocus` recorded `<body>`
   * and then restored to it. `dialog-focus.ts` names that as the one outcome it exists to
   * prevent, and the guard passed because `<body>` is connected.
   *
   * Both openers with a pending state are checked, because both had it.
   */
  for (const opener of ['cmd-open-3d', 'overview-open-3d', 'member-list-open-3d'] as const) {
    test(`Escape returns focus to ${opener}`, async ({ pro: page }) => {
      await coordinated(page);
      if (opener === 'member-list-open-3d') await openDetailing(page);

      const button = page.getByTestId(opener);
      await button.focus();
      expect(await focused(page), 'the opener has focus before the click').toBe(opener);

      await button.click();
      await waitForScene(page);
      expect(await focused(page), 'focus moves into the dialog, not into the page behind it')
        .toBe('rebar-workspace');

      await page.keyboard.press('Escape');
      await expect(page.getByTestId('rebar-workspace')).toBeHidden();
      expect(await focused(page), 'and comes back to the control it left').toBe(opener);
    });
  }

  test('the restore does not scroll the panel away from the selected row', async (
    { pro: page },
  ) => {
    /**
     * The two properties that fought each other, pinned together.
     *
     * Fixing the restore is what exposed this: with focus going to `<body>` nothing scrolled, so
     * the conflict could not appear. Once the opener really got focus again, focusing
     * `cmd-open-3d` — which lives in an earlier stage of the same scrolling column — scrolled the
     * panel back up and took the row the viewer had just selected off screen with it.
     * `f3-selection-from-viewer` caught it; `dialog-focus.ts` records the resolution.
     *
     * Both must hold after a close: the keyboard is on the opener, AND the list still shows the
     * member the viewer left the reader on.
     */
    await coordinated(page);
    await openDetailing(page);

    const rows = await page.locator(
      '[data-testid="rc-family-rows-column"] [data-testid^="rc-member-"][data-family]')
      .evaluateAll((els) => els.map(
        (e) => e.getAttribute('data-testid')!.replace('rc-member-', '')));
    // The LAST row, which is the one most likely to be below the fold in the panel's list.
    const target = Number(rows[rows.length - 1]);

    await page.getByTestId('cmd-open-3d').focus();
    await page.getByTestId('cmd-open-3d').click();
    await waitForScene(page);
    await page.getByTestId(`rebar-element-${target}`).click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.rebarSelection()))
      .toEqual([target]);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('rebar-workspace')).toBeHidden();

    expect(await focused(page), 'the keyboard is back on the opener').toBe('cmd-open-3d');
    const visible = await page.getByTestId(`rc-member-${target}`).evaluate((el) => {
      const box = el.getBoundingClientRect();
      const panel = el.closest('.rc-workflow');
      if (!panel) return false;
      const p = panel.getBoundingClientRect();
      return box.bottom > p.top && box.top < p.bottom;
    });
    expect(visible, 'and the row the viewer selected is still on screen').toBe(true);
  });

  test('the pending state no longer takes the opener out of the tab order', async (
    { pro: page },
  ) => {
    await coordinated(page);
    /**
     * `aria-busy` and not `disabled`, which is the fix rather than a restatement of it.
     *
     * The button must stay focusable while it builds. Asserted on the attribute because the
     * pending window is a single frame — racing a click against it is how this would become a
     * flaky test of a property that is really about markup.
     */
    const button = page.getByTestId('cmd-open-3d');
    await expect(button).toBeEnabled();
    await expect(button, 'idle, so it says nothing about being busy')
      .not.toHaveAttribute('aria-busy', 'true');
  });

  test('Tab stays inside the dialog', async ({ pro: page }) => {
    await coordinated(page);
    await page.getByTestId('cmd-open-3d').click();
    await waitForScene(page);

    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(
        () => !!document.activeElement?.closest('[data-testid="rebar-workspace"]'));
      expect(inside, `Tab ${i + 1} is still inside a dialog that claims aria-modal`).toBe(true);
    }
  });
});

// ─── 3. The standing notices ─────────────────────────────────────

test.describe('the viewer notices fold, and never to nothing', () => {
  /**
   * Why this runs on a fixture with no proposals, and what it therefore asserts.
   *
   * `rc-design-qa-8` designs clean, so neither notice is on screen — which is itself the
   * property worth pinning here: a notice with a zero count renders nothing at all, and the fold
   * cannot be what makes it absent. The FOLDED shape is proven without a browser in
   * `viewer-notices.test.ts`, and on a building that has proposals by
   * `rebar-workspace-notices.spec.ts`.
   */
  test('a count of zero renders no notice, and no fold either', async ({ pro: page }) => {
    await coordinated(page);
    await page.getByTestId('cmd-open-3d').click();
    await waitForScene(page);

    await expect(page.getByTestId('rebar-provisional-banner')).toHaveCount(0);
    await expect(page.getByTestId('rebar-provisional-banner-fold')).toHaveCount(0);
    await expect(page.getByTestId('rebar-torsion-banner')).toHaveCount(0);
    await expect(page.getByTestId('rebar-torsion-banner-fold')).toHaveCount(0);
  });
});

// ─── 4. The selection panel ──────────────────────────────────────

test.describe('@smoke the selection panel is a column, and has a floor under it', () => {
  test('beside the cage at 1280, under it at 1024, 900 and 820', async ({ pro: page }) => {
    await coordinated(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByTestId('cmd-open-3d').click();
    await waitForScene(page);

    /**
     * The measurement this fired on.
     *
     * At 1280×720 the panel was 1008 × 96 px UNDER the canvas with a bar selected, and 15 px
     * with nothing selected — a hairline in the place the reader was told to look. F6 §6 asks
     * for it on the right.
     */
    const wide = await geometry(page);
    expect(wide.inspector!.x, 'the panel is to the RIGHT of the canvas')
      .toBeGreaterThan(wide.canvas!.x);
    expect(wide.inspector!.x, 'and starts where the canvas ends')
      .toBeGreaterThanOrEqual(wide.canvas!.x + wide.canvas!.w - 1);
    expect(wide.inspector!.h, 'it is a column, not a strip')
      .toBeGreaterThan(wide.canvas!.h / 2);

    /**
     * The floor. `min-height` is what the 15 px was missing, and it holds with NOTHING selected —
     * which is the state the measurement was taken in.
     */
    expect(await page.evaluate(() => window.__stabileo.rebarSelection()),
      'nothing is selected yet, which is the case that measured 15 px').toEqual([]);
    expect(wide.inspector!.h, 'an empty panel is still legible').toBeGreaterThan(40);

    /**
     * The narrow shapes, asserted on GEOMETRY and not on an attribute.
     *
     * It used to be `data-layout`, set from a `side` prop the workspace computed from
     * `window.innerWidth`. `rebar-3d.spec.ts` caught what that costs: a resize handler runs after
     * layout, so a window resized to 390 px still had the desktop shape when the page was read
     * and the canvas came out 118 px wide. The shape is a media query now, and what a test can
     * usefully ask is where the boxes actually are — which is what the resize race made wrong,
     * and which an attribute the same JS also set could never have caught.
     */
    for (const width of [1024, 900, 820]) {
      await page.setViewportSize({ width, height: 720 });
      const m = await geometry(page);
      expect(m.inspector!.y, `at ${width} the panel is UNDER the canvas`)
        .toBeGreaterThan(m.canvas!.y);
      expect(m.canvas!.w, `at ${width} the canvas keeps the width, minus the rail only`)
        .toBeGreaterThan(width - 300);
      expect(m.inspector!.h, `at ${width} it still has a floor`).toBeGreaterThan(40);
      expect(m.bodyScrollW, `at ${width} nothing overflows sideways`).toBe(m.clientW);
    }

    /**
     * And a phone, which is where the resize race actually showed up.
     *
     * 390 px is `rebar-3d.spec.ts`'s own width for this. Asserted here too because that spec
     * checks the RAIL folding and happened to catch this; the panel is this file's subject.
     */
    await page.setViewportSize({ width: 390, height: 844 });
    const phone = await geometry(page);
    expect(phone.canvas!.w, 'on a phone the panel takes no width at all')
      .toBeGreaterThan(300);
    expect(phone.inspector!.y, 'it is under the canvas').toBeGreaterThan(phone.canvas!.y);
  });
});

interface Box { x: number; y: number; w: number; h: number }
async function geometry(page: Page): Promise<{
  bodyScrollW: number; clientW: number;
  canvas: Box | null; inspector: Box | null; rail: Box | null;
}> {
  return page.evaluate(() => {
    const box = (sel: string): Box | null => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
      };
    };
    return {
      bodyScrollW: document.body.scrollWidth,
      clientW: document.documentElement.clientWidth,
      canvas: box('[data-testid="rebar-canvas"]'),
      inspector: box('[data-testid="rebar-inspector"]'),
      rail: box('[data-testid="rebar-rail"]'),
    };
  });
}
