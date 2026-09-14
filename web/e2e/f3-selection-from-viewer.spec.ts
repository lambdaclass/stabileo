/**
 * Selecting in the viewer marks the row — §8 objective 4, the other direction.
 *
 * There is deliberately no synchronisation to test. The list READS
 * `rebarWorkspace.selection`, so a selection made anywhere writes one place and the row follows;
 * these assertions exist to prove that is actually true end to end, and that nothing grew a
 * second copy of the answer while objective 3 was being wired.
 *
 * The viewer-side origin is `rebar-element-<id>` in the workspace's status panel, which calls the
 * same `selectAndFocus` a scene pick calls. Chosen over clicking the WebGL canvas on purpose: a
 * raycast into a cage of thousands of bars is not a stable way to name WHICH member was picked,
 * and the claim here is about which member — not about hit-testing geometry.
 */

import { test, expect, loadModel, solveModel, computeDemands, designAll } from './fixtures';
import type { Page } from '@playwright/test';

const FRAMES = 'rc-design-qa-8';

/**
 * The workspace's member rows.
 *
 * Scoped to buttons INSIDE `rebar-element-list`, and both halves are load-bearing: the prefix
 * `rebar-element-` is also the id of the `<ul>` that holds them, so
 * `[data-testid^="rebar-element-"]` alone puts the container at index 0. That produced a
 * `Number('list')` of NaN here, and it passed silently in the two tests that happened to index a
 * real row instead.
 */
const VIEWER_ROWS = '[data-testid="rebar-element-list"] button[data-testid^="rebar-element-"]';

function channel(page: Page): Promise<number[]> {
  return page.evaluate(() => (window.__stabileo as unknown as
    { rebarSelection(): number[] }).rebarSelection());
}

async function openDetailing(page: Page): Promise<void> {
  const section = page.getByTestId('detailing-disclosure');
  if (await section.getAttribute('open') === null) {
    await section.locator('> summary').click();
  }
  await expect(page.getByTestId('rc-member-list')).toBeVisible();
}

/** A detailed project with the 3-D workspace open on it. */
async function detailedWithViewer(page: Page): Promise<void> {
  await loadModel(page, FRAMES);
  await designAll(page);
  await openDetailing(page);
  await page.getByTestId('cmd-generate-detailing').click();
  await expect
    .poll(() => page.evaluate(() => (window.__stabileo as unknown as
      { detailingAssemblies(): unknown[] }).detailingAssemblies().length), { timeout: 60_000 })
    .toBeGreaterThan(0);
  await page.getByTestId('cmd-open-3d').click();
  await expect(page.getByTestId('rebar-workspace')).toBeVisible();
}

test.describe('@slow selecting in the viewer marks the row', () => {
  test('a member picked in the workspace is the member the list marks', async ({ pro: page }) => {
    await detailedWithViewer(page);

    // The workspace's own element list — a viewer-side origin, calling the same channel.
    const viewerRows = page.locator(VIEWER_ROWS);
    expect(await viewerRows.count(), 'the workspace lists members').toBeGreaterThan(0);
    const picked = (await viewerRows.nth(1).getAttribute('data-testid'))!
      .replace('rebar-element-', '');

    await viewerRows.nth(1).click();
    expect(await channel(page), 'the viewer wrote the shared channel')
      .toEqual([Number(picked)]);

    // Close the overlay and the panel behind it is already pointing at that member.
    await page.getByTestId('rebar-workspace-close').click();
    await expect(page.getByTestId('rebar-workspace')).toHaveCount(0);
    await openDetailing(page);

    const row = page.getByTestId(`rc-member-${picked}`);
    await expect(row, 'the row is marked selected').toHaveAttribute('aria-selected', 'true');
    /*
     * And it is the family's tab stop, which is what "focuses the row" has to mean for a
     * selection made elsewhere: reading lands on it the moment the keyboard reaches the list,
     * without focus having been yanked out of the viewer while it was open.
     */
    await expect(row).toHaveAttribute('tabindex', '0');

    // Exactly one row is marked, across the whole list.
    expect(await page.locator('[data-family][aria-selected="true"]').count()).toBe(1);
  });

  test('the row is scrolled into view rather than left off screen', async ({ pro: page }) => {
    await detailedWithViewer(page);

    const viewerRows = page.locator(VIEWER_ROWS);
    const count = await viewerRows.count();
    // The last one, which is the case most likely to be below the fold in the panel's list.
    const picked = (await viewerRows.nth(count - 1).getAttribute('data-testid'))!
      .replace('rebar-element-', '');
    await viewerRows.nth(count - 1).click();

    await page.getByTestId('rebar-workspace-close').click();
    await openDetailing(page);

    const row = page.getByTestId(`rc-member-${picked}`);
    await expect(row).toHaveAttribute('aria-selected', 'true');
    // Inside its scrolling container, not merely possessing a box somewhere.
    const visible = await row.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const panel = el.closest('.rc-workflow');
      if (!panel) return false;
      const p = panel.getBoundingClientRect();
      return box.bottom > p.top && box.top < p.bottom;
    });
    expect(visible, 'the selected row is within the panel viewport').toBe(true);
  });

  test('there is one source of truth, not two that agree', async ({ pro: page }) => {
    await detailedWithViewer(page);
    const viewerRows = page.locator(VIEWER_ROWS);
    const a = (await viewerRows.nth(0).getAttribute('data-testid'))!
      .replace('rebar-element-', '');
    const b = (await viewerRows.nth(1).getAttribute('data-testid'))!
      .replace('rebar-element-', '');

    /*
     * Select in the viewer, then in the list, then in the viewer again, and after each step the
     * channel and the DOM must name the same single member. Two sources that merely agree would
     * pass the first step and drift on the third.
     */
    await viewerRows.nth(0).click();
    expect(await channel(page)).toEqual([Number(a)]);

    await page.getByTestId('rebar-workspace-close').click();
    await openDetailing(page);
    await page.getByTestId(`rc-member-${b}`).click();
    expect(await channel(page)).toEqual([Number(b)]);

    await page.getByTestId('cmd-open-3d').click();
    await expect(page.getByTestId('rebar-workspace')).toBeVisible();
    // The viewer opens on what the list selected, rather than on its own remembered pick.
    await expect(page.getByTestId('rebar-sel-parent')).toContainText(b);

    await viewerRows.nth(0).click();
    expect(await channel(page)).toEqual([Number(a)]);
    await page.getByTestId('rebar-workspace-close').click();
    await openDetailing(page);
    await expect(page.getByTestId(`rc-member-${a}`)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId(`rc-member-${b}`)).toHaveAttribute('aria-selected', 'false');
  });
});

test.describe('the list keeps one tab stop per family', () => {
  test('one row is tabbable whether or not anything is selected', async ({ pro: page }) => {
    await loadModel(page, FRAMES);
    await solveModel(page);
    await computeDemands(page);
    await openDetailing(page);

    const rows = page.locator('[data-testid="rc-family-rows-beam"] [data-family]');
    const stops = () => rows.evaluateAll(
      (els) => els.filter((e) => e.getAttribute('tabindex') === '0')
        .map((e) => e.getAttribute('data-testid')));

    /*
     * With nothing selected it falls to the FIRST row. A family whose every row is `-1` cannot be
     * reached by Tab at all, and one where every row is `0` makes a hundred members stand between
     * the keyboard and whatever follows them.
     */
    const before = await stops();
    expect(before, 'exactly one tab stop before selecting').toHaveLength(1);
    const ids = await rows.evaluateAll(
      (els) => els.map((e) => e.getAttribute('data-testid')!.replace('rc-member-', '')));
    expect(before[0]).toBe(`rc-member-${ids[0]}`);

    // Selecting moves the tab stop onto the selected member, and there is still just one.
    await page.getByTestId(`rc-member-${ids[2] ?? ids[1] ?? ids[0]}`).click();
    const after = await stops();
    expect(after, 'still exactly one tab stop').toHaveLength(1);
    expect(after[0]).toBe(`rc-member-${ids[2] ?? ids[1] ?? ids[0]}`);
  });
});
