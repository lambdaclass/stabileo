/**
 * The generator and metallic surfaces, pinned at the level a UI rework can break.
 *
 * ── Why these specs exist for someone else's benefit ────────────────
 *
 * This branch's UI is deliberately thin and is expected to be reworked. What must survive
 * that rework is not the layout, it is four properties:
 *
 *   G1  the number beside Generate is the number that lands in the model;
 *   G2  the section figure shows the ARRANGEMENT, not just the profile;
 *   S1  no metallic member is ever presented as verified;
 *   S2  the experimental warning cannot be scrolled past or conditioned away.
 *
 * Each is asserted against behaviour rather than markup, so a redesign that keeps the
 * meaning passes and one that loses it fails. None of them asserts "the element is visible",
 * because that assertion is true throughout every failure mode they cover.
 */

import { test, expect, PRO_URL } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Reach a tab through the ribbon, as a user does.
 *
 * These two panels were written against the Analysis dropdown of the old PRO bar. The
 * ribbon replaced that bar, and the two panels are no longer neighbours in it: the
 * generators DRAW geometry and sit in Model beside nodes and elements, while the steel
 * panel DESIGNS and sits in Design beside the concrete one. So the stage is a parameter —
 * naming it here is what keeps the click path the one a user actually has.
 */
const STAGE_OF = { generators: 'model', steel: 'design' } as const;

async function openTab(page: Page, tab: 'generators' | 'steel'): Promise<void> {
  await page.getByTestId(`pr-stage-${STAGE_OF[tab]}`).click();
  await page.getByTestId(`pr-cmd-${tab}`).click();
}

async function modelCounts(page: Page): Promise<{ nodes: number; elements: number }> {
  return page.evaluate(() => {
    const h = window.__stabileo as unknown as { elementIds(): number[]; modelVersion(): number };
    void h.modelVersion();
    return { nodes: -1, elements: h.elementIds().length };
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto(PRO_URL);
  await expect
    .poll(() => page.evaluate(() => (window.__stabileo as unknown as { solverReady(): boolean }).solverReady()))
    .toBe(true);
});

test.describe('generators', () => {
  test('G1 — the count beside Generate is the count that lands in the model @smoke', async ({ page }) => {
    await openTab(page, 'generators');
    const panel = page.getByTestId('pro-generators-panel');
    await expect(panel).toBeVisible();

    // Read the promise off the preview, then generate, then read the model.
    const promised = await page.getByTestId('gen-preview').innerText();
    const m = promised.match(/(\d+)\s+members\s+·\s+(\d+)\s+nodes/);
    expect(m, `preview did not state its totals: ${promised}`).not.toBeNull();
    const promisedMembers = Number(m![1]);

    await page.getByTestId('gen-generate').click();
    await expect(page.getByTestId('gen-result')).toBeVisible();

    const after = await modelCounts(page);
    expect(after.elements).toBe(promisedMembers);

    // And the panel reports agreement rather than a mismatch — the same check
    // `matchesPreview` makes, surfaced.
    await expect(page.getByTestId('gen-result')).not.toContainText(/mismatch|Discrepancia/i);
  });

  test('G1b — a shed lands whole, through the same path', async ({ page }) => {
    await openTab(page, 'generators');
    await page.getByTestId('gen-kind-shed').click();
    const promised = await page.getByTestId('gen-preview').innerText();
    const members = Number(promised.match(/(\d+)\s+members/)![1]);
    expect(members).toBeGreaterThan(100);

    await page.getByTestId('gen-generate').click();
    await expect(page.getByTestId('gen-result')).toBeVisible();
    expect((await modelCounts(page)).elements).toBe(members);
  });

  test('G2 — the section figure tracks the arrangement, not only the profile', async ({ page }) => {
    await openTab(page, 'generators');
    const row = page.getByTestId('gen-profile-chord');
    const figure = row.locator('svg').first();

    // A channel, so the arrangement is geometrically visible at all.
    //
    // Driven through the PRO section modal, which is where the whole `ProfileSpec` now lives.
    // The row used to carry arrangement, gap and rotation as its own controls AND the modal
    // carried them too — two writers of one object, free to disagree the moment one of them was
    // touched. The assertions below are untouched; only the path to the arrangement changed.
    const pickArrangement = async (value: string) => {
      await page.getByTestId('gen-profile-trigger-chord').click();
      await page.getByTestId('section-arrangement').selectOption(value);
      await page.getByTestId('section-apply').click();
      await expect(page.getByTestId('pro-section-modal')).toBeHidden();
    };

    await page.getByTestId('gen-profile-trigger-chord').click();
    await page.getByTestId('profile-search').fill('UPN 100');
    await page.getByTestId('profile-option-UPN 100').click();
    await page.getByTestId('section-apply').click();
    await expect(figure.locator('polygon')).toHaveCount(1);

    await pickArrangement('doubleBack');
    await expect(figure.locator('polygon')).toHaveCount(2);
    const back = await figure.innerHTML();

    await pickArrangement('doubleFacing');
    await expect(figure.locator('polygon')).toHaveCount(2);
    // Same count, same overall width — and a DIFFERENT drawing. That difference is the whole
    // reason the figure exists: `][` and `[]` cannot be told apart from any dimension.
    expect(await figure.innerHTML()).not.toBe(back);

    await pickArrangement('quadBox');
    await expect(figure.locator('polygon')).toHaveCount(4);
  });

  test('G2b — the figure carries an accessible name stating the assembled size', async ({ page }) => {
    await openTab(page, 'generators');
    const figure = page.getByTestId('gen-profile-chord').locator('svg').first();
    await expect(figure).toHaveAttribute('aria-label', /\d+×\d+\s*mm/);
  });

  test('the previews are drawn, and a shed gets both views', async ({ page }) => {
    await openTab(page, 'generators');
    const previews = page.getByTestId('gen-previews');
    await expect(previews.locator('svg')).toHaveCount(1);
    // Counted, not `toBeVisible`: a horizontal `<line>` has zero height and Playwright calls
    // any zero-area element hidden. The question here is whether members were drawn.
    expect(await previews.locator('svg line').count()).toBeGreaterThan(0);

    await page.getByTestId('gen-kind-shed').click();
    // Frame elevation plus isometric.
    await expect(previews.locator('svg')).toHaveCount(2);
  });
});

test.describe('the metallic surface', () => {
  /** Generate a truss, so the inventory has something metallic to list. */
  async function generateTruss(page: Page): Promise<void> {
    await openTab(page, 'generators');
    await page.getByTestId('gen-generate').click();
    await expect(page.getByTestId('gen-result')).toBeVisible();
  }

  test('S1 — every metallic member is listed, and none of them as verified @smoke', async ({ page }) => {
    await generateTruss(page);
    await openTab(page, 'steel');

    await expect(page.getByTestId('steel-summary')).toContainText(/metallic members/i);
    const badges = page.getByTestId('steel-status-badge');
    const n = await badges.count();
    expect(n).toBeGreaterThan(0);

    for (let i = 0; i < n; i++) {
      const status = await badges.nth(i).getAttribute('data-status');
      // The four honest states, and no fifth one that could read as a pass.
      expect(['NOT_DESIGNED', 'EXPERIMENTAL', 'DEMAND_UNAVAILABLE', 'NOT_APPLICABLE'])
        .toContain(status);
    }
    // No badge anywhere claims a tick.
    await expect(page.getByTestId('pro-steel-panel')).not.toContainText('✓');
  });

  test('S1b — each status carries text, not colour alone', async ({ page }) => {
    await generateTruss(page);
    await openTab(page, 'steel');
    const badge = page.getByTestId('steel-status-badge').first();
    // The glyph is aria-hidden, so the accessible name has to come from the text.
    await expect(badge).not.toHaveText('');
    const name = await badge.evaluate((el) => el.textContent?.trim() ?? '');
    expect(name.replace(/[○⚗—·]/g, '').trim().length).toBeGreaterThan(0);
  });

  test('S2 — the experimental warning is present before anything else in the panel', async ({ page }) => {
    await openTab(page, 'steel');
    const banner = page.getByTestId('steel-experimental-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/experimental/i);

    // It is the first child of the panel, so no amount of content can push it below a fold
    // that a reader stops at.
    const isFirst = await page.getByTestId('pro-steel-panel').evaluate(
      (el) => el.firstElementChild?.getAttribute('data-testid') === 'steel-experimental-banner',
    );
    expect(isFirst).toBe(true);

    // And there is no control to dismiss it.
    await expect(banner.locator('button')).toHaveCount(0);
  });

  test('S2b — an empty model says WHICH kind of nothing it has', async ({ page }) => {
    await openTab(page, 'steel');
    // Fresh PRO session: no elements at all, which is a different message from "no steel".
    await expect(page.getByTestId('steel-empty')).toBeVisible();
    await expect(page.getByTestId('steel-empty')).not.toHaveText('');
  });

  test('the capability gaps are listed, so the absence is legible before modelling', async ({ page }) => {
    await openTab(page, 'steel');
    const gaps = page.getByTestId('steel-gaps');
    await expect(gaps).toBeVisible();
    await gaps.locator('summary').click();
    await expect(gaps.locator('li')).not.toHaveCount(0);
  });
});
