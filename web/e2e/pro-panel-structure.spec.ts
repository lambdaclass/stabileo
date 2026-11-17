/**
 * Design's structure: what is read first, and what stays put while you read it (interface A).
 *
 * ── Two defects, both about position rather than content ───────────
 *
 * **The summary was last.** The regulation in force and the count of every member lived inside the
 * command bar, below three collapsible stages: the first question was answered last. In A the
 * project's status is the first place of the first step (Prepare › Model and pieces), and the
 * member table with its commands is a place of sizing.
 *
 * **The titles did not stay.** Each open stage of the classic column was a scroller inside a
 * column that already scrolled. In A the stages are places, one on screen at a time, and the
 * canvas under the viewer is the one scroller: nothing inside a place scrolls on its own.
 *
 * Both are claims about LAYOUT, so both are measured as layout (document order, computed styles,
 * `elementFromPoint`) and not by looking at a screenshot.
 *
 * Retired with the classic column, and why: S4 (the status section collapses) and S6 (an earlier
 * stage's sticky title above the one being read). The status is no longer a collapsible stage but
 * a section of its place, and two stages are never on screen together, so no title can outlive
 * its section.
 */
import { test, expect, setAppLanguage, loadModel, designPlace } from './fixtures';

test.describe('@smoke design says where the project stands, first', () => {
  test('S1 — the status opens the first step, and the commands sit in the place they serve', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    const ids = await page.getByTestId('desk-process').locator('[data-testid^="desk-step-"][data-state]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    expect(ids[0], 'preparing is the first step').toBe('desk-step-prepare');
    await designPlace(page, 'prepare');
    await expect(page.getByTestId('desk-overview').getByTestId('design-overview')).toBeVisible();
    await expect(page.getByTestId('design-toolbar'), 'no command bar in the status').toHaveCount(0);
    await designPlace(page, 'list');
    await expect(page.getByTestId('desk-list').getByTestId('design-toolbar')).toBeVisible();
  });

  test('S2 — the regulation and the counts are IN it, and nowhere else', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designPlace(page, 'prepare');
    const overview = page.getByTestId('design-overview');
    await expect(overview.getByTestId('active-concrete-code')).toBeVisible();
    await expect(overview.getByTestId('design-counts')).toBeVisible();
    await expect(page.getByTestId('active-concrete-code')).toHaveCount(1);
    await expect(page.getByTestId('design-counts')).toHaveCount(1);
  });

  test('S3 — an empty project says what is missing instead of showing seven zeroes', async ({ pro: page }) => {
    await designPlace(page, 'prepare');
    await expect(page.getByTestId('desk-route-existing-missing')).toBeVisible();
    await expect(page.getByTestId('design-counts')).toHaveCount(0);
  });
});

test.describe('@smoke one scroller', () => {
  test('S5 — the canvas scrolls, and nothing inside a place is its own scroller', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designPlace(page, 'list');
    const floors = page.getByTestId('floor-families-disclosure');
    await floors.locator('> summary').click();
    const facts = await page.evaluate(() => ({
      canvas: getComputedStyle(document.querySelector('.dd-canvas-body')!).overflowY,
      floors: getComputedStyle(document.querySelector('[data-testid="floor-families-disclosure"]')!).overflowY,
    }));
    expect(['auto', 'scroll']).toContain(facts.canvas);
    expect(['visible', 'clip'], 'the floor pass does not scroll inside the canvas that scrolls').toContain(facts.floors);
  });
});

test.describe('@smoke the 3-D reinforcement is reachable from the top', () => {
  test('S7 — it is offered with the status, disabled, and says what is missing in TEXT', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designPlace(page, 'prepare');
    const btn = page.getByTestId('overview-open-3d');
    await expect(btn).toBeVisible();
    await expect(btn).toBeDisabled();
    const need = page.getByTestId('overview-open-3d-need');
    await expect(need).toBeVisible();
    expect((await need.innerText()).trim().length, 'the requirement is stated').toBeGreaterThan(0);
  });

  test('S8 — the status access and the contextual command are the same operation, under one name', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designPlace(page, 'prepare');
    await expect(page.getByTestId('overview-open-3d')).toBeDisabled();
    const name = (await page.getByTestId('overview-open-3d').innerText()).trim();
    await designPlace(page, 'list');
    await expect(page.getByTestId('cmd-open-3d')).toBeDisabled();
    await expect(page.getByTestId('cmd-open-3d')).toContainText(name);
  });
});

test.describe('the status section speaks the three languages', () => {
  for (const [locale, title] of [
    ['en', 'Project status'],
    ['es', 'Estado del proyecto'],
    ['pt', 'Estado do projeto'],
  ] as const) {
    test(`S9 ${locale} — the section is named in the interface's language`, async ({ pro: page }) => {
      await loadModel(page, 'rc-design-qa-8');
      await setAppLanguage(page, locale);
      await designPlace(page, 'prepare');
      await expect(page.getByTestId('desk-overview')).toContainText(title);
    });
  }
});
