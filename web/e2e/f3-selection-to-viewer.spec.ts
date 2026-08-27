/**
 * Selecting a member from the list — §8 objective 3.
 *
 * `rebar-workspace-selection.test.ts` proves the store: which member, one focus request, history,
 * clearing. What only a browser can add is that the ROW writes that channel and no other, that
 * the keyboard produces the same selection as the mouse, and that the element the list named is
 * the element the 3-D viewer highlights.
 *
 * The channel is read through `window.__stabileo.rebarSelection()`, which is
 * `rebarWorkspace.selection` and NOT `uiStore.selectedElements`. Comparing the two is how "no
 * parallel state" stops being a promise in a comment.
 */

import { test, expect, loadModel, solveModel, computeDemands, designAll } from './fixtures';
import type { Page } from '@playwright/test';

/** Frames only: no shells and no footings. */
const FRAMES = 'rc-design-qa-8';
/** More than a frame. */
const BUILDING = 'pro-edificio-7p';

async function classify(page: Page, model: string): Promise<void> {
  await loadModel(page, model);
  await solveModel(page);
  await computeDemands(page);
}

async function openDetailing(page: Page): Promise<void> {
  const section = page.getByTestId('detailing-disclosure');
  if (await section.getAttribute('open') === null) {
    await section.locator('> summary').click();
  }
  await expect(page.getByTestId('rc-member-list')).toBeVisible();
}

/** What the shared channel holds. */
function channel(page: Page): Promise<number[]> {
  return page.evaluate(() => (window.__stabileo as unknown as
    { rebarSelection(): number[] }).rebarSelection());
}

/** The rows of one family, as element ids in the order the list presents them. */
async function rowIds(page: Page, family: string): Promise<string[]> {
  return page.locator(
    `[data-testid="rc-family-rows-${family}"] [data-testid^="rc-member-"][data-family]`,
  ).evaluateAll((els) => els.map(
    (e) => e.getAttribute('data-testid')!.replace('rc-member-', '')));
}

test.describe('@smoke a row selects exactly its own member', () => {
  for (const family of ['beam', 'column'] as const) {
    test(`clicking a ${family} writes that element into the shared channel`,
      async ({ pro: page }) => {
        await classify(page, FRAMES);
        await openDetailing(page);

        const ids = await rowIds(page, family);
        expect(ids.length, `${family} rows exist`).toBeGreaterThan(0);
        // Deliberately not the first row: selecting by POSITION would pass on index 0 and fail
        // here, which is the defect worth catching.
        const target = ids[Math.min(1, ids.length - 1)];

        await page.getByTestId(`rc-member-${target}`).click();

        expect(await channel(page), 'exactly the member clicked').toEqual([Number(target)]);
        await expect(page.getByTestId(`rc-member-${target}`))
          .toHaveAttribute('aria-selected', 'true');

        // And every other row says it is NOT selected, so the panel shows one current member.
        const selected = await page.locator('[data-family][aria-selected="true"]').count();
        expect(selected, 'one row is selected, not several').toBe(1);
      });
  }

  test('the row and the channel never disagree', async ({ pro: page }) => {
    await classify(page, FRAMES);
    await openDetailing(page);
    const ids = await rowIds(page, 'beam');

    for (const id of ids.slice(0, 3)) {
      await page.getByTestId(`rc-member-${id}`).click();
      expect(await channel(page)).toEqual([Number(id)]);
      const marked = await page.locator('[data-family][aria-selected="true"]')
        .evaluateAll((els) => els.map(
          (e) => e.getAttribute('data-testid')!.replace('rc-member-', '')));
      expect(marked, 'the DOM marks what the channel holds').toEqual([id]);
    }
  });

  test('changing the selection replaces it instead of accumulating', async ({ pro: page }) => {
    await classify(page, FRAMES);
    await openDetailing(page);
    const beams = await rowIds(page, 'beam');
    const columns = await rowIds(page, 'column');

    await page.getByTestId(`rc-member-${beams[0]}`).click();
    await page.getByTestId(`rc-member-${columns[0]}`).click();
    expect(await channel(page), 'the beam is no longer selected')
      .toEqual([Number(columns[0])]);
    await expect(page.getByTestId(`rc-member-${beams[0]}`))
      .toHaveAttribute('aria-selected', 'false');
  });
});

test.describe('@smoke the keyboard produces the same selection as the mouse', () => {
  test('Enter and Space select the focused row', async ({ pro: page }) => {
    await classify(page, FRAMES);
    await openDetailing(page);
    const ids = await rowIds(page, 'beam');

    const first = page.getByTestId(`rc-member-${ids[0]}`);
    await first.focus();
    await expect(first).toBeFocused();
    await page.keyboard.press('Enter');
    expect(await channel(page), 'Enter selects').toEqual([Number(ids[0])]);

    // Space is the other activation a button owes the keyboard, and it must mean the same thing.
    await page.getByTestId(`rc-member-${ids[1]}`).focus();
    await page.keyboard.press(' ');
    expect(await channel(page), 'Space selects the same way').toEqual([Number(ids[1])]);
  });

  test('the arrows move through the rows and the selection follows', async ({ pro: page }) => {
    await classify(page, FRAMES);
    await openDetailing(page);
    const ids = await rowIds(page, 'beam');
    test.skip(ids.length < 3, 'needs at least three rows to walk');

    await page.getByTestId(`rc-member-${ids[0]}`).focus();
    await page.keyboard.press('ArrowDown');
    expect(await channel(page)).toEqual([Number(ids[1])]);
    // Focus follows too, or the next press would start from where it was.
    await expect(page.getByTestId(`rc-member-${ids[1]}`)).toBeFocused();

    await page.keyboard.press('ArrowDown');
    expect(await channel(page)).toEqual([Number(ids[2])]);
    await page.keyboard.press('ArrowUp');
    expect(await channel(page)).toEqual([Number(ids[1])]);
  });

  test('the arrows stop at the ends rather than wrapping into another family',
    async ({ pro: page }) => {
      await classify(page, FRAMES);
      await openDetailing(page);
      const ids = await rowIds(page, 'beam');

      await page.getByTestId(`rc-member-${ids[0]}`).focus();
      await page.keyboard.press('ArrowUp');
      // Nothing was selected and nothing happened: an arrow at the edge must not jump families.
      expect(await channel(page)).toEqual([]);
    });

  test('Escape clears through the same channel', async ({ pro: page }) => {
    await classify(page, FRAMES);
    await openDetailing(page);
    const ids = await rowIds(page, 'beam');

    const row = page.getByTestId(`rc-member-${ids[0]}`);
    await row.click();
    expect(await channel(page)).toEqual([Number(ids[0])]);

    await row.focus();
    await page.keyboard.press('Escape');
    expect(await channel(page), 'the channel is cleared').toEqual([]);
    await expect(row).toHaveAttribute('aria-selected', 'false');
  });
});

test.describe('@slow the viewer highlights the member the list named', () => {
  test('the 3-D workspace reports the selected element as its own', async ({ pro: page }) => {
    await loadModel(page, FRAMES);
    await designAll(page);
    await openDetailing(page);
    await page.getByTestId('cmd-generate-detailing').click();
    await expect
      .poll(() => page.evaluate(() => (window.__stabileo as unknown as
        { detailingAssemblies(): unknown[] }).detailingAssemblies().length), { timeout: 60_000 })
      .toBeGreaterThan(0);

    const ids = await rowIds(page, 'beam');
    const target = ids[Math.min(1, ids.length - 1)];
    await page.getByTestId(`rc-member-${target}`).click();

    // Open the viewer on that selection and let it say which member it is showing.
    await page.getByTestId('cmd-open-3d').click();
    await expect(page.getByTestId('rebar-workspace')).toBeVisible();

    /*
     * `rebar-sel-parent` is the inspector's own read of the selected member. Asserting it rather
     * than a pixel is deliberate: the claim is that the list and the viewer agree about WHICH
     * element, and a screenshot would prove neither that nor anything else stably.
     */
    await expect(page.getByTestId('rebar-sel-parent')).toContainText(target);
    expect(await channel(page), 'and the channel still holds it').toEqual([Number(target)]);
  });
});

test.describe('a building with several families', () => {
  test('selecting reaches members outside the frame too', async ({ pro: page }) => {
    await classify(page, BUILDING);
    await openDetailing(page);

    // Whatever families this model turned out to have, a row in each of them selects its member.
    const families = await page.locator('[data-testid^="rc-family-rows-"]')
      .evaluateAll((els) => els.map(
        (e) => e.getAttribute('data-testid')!.replace('rc-family-rows-', '')));
    expect(families.length, 'the building lists at least one family').toBeGreaterThan(0);

    for (const family of families) {
      const ids = await rowIds(page, family);
      if (ids.length === 0) continue;
      await page.getByTestId(`rc-member-${ids[0]}`).click();
      expect(await channel(page), `${family} selects its own member`).toEqual([Number(ids[0])]);
    }
  });

  test('an unknown or absent family offers nothing to select', async ({ pro: page }) => {
    await loadModel(page, FRAMES);
    await openDetailing(page);

    // Before the demands every frame family is `unknown`: listed, explained, and not selectable.
    await expect(page.locator('[data-testid^="rc-family-rows-"]')).toHaveCount(0);
    await expect(page.locator('[data-family][role="option"]')).toHaveCount(0);
    expect(await channel(page), 'nothing could have been selected').toEqual([]);
  });
});

test.describe('the list is reachable from both ways in', () => {
  test('from the stage strip, and from the section itself', async ({ pro: page }) => {
    await classify(page, FRAMES);

    // 1. Through the strip, which is how a user navigates stages.
    await page.getByTestId('rc-stage-detailing').locator('button').click();
    await expect(page.getByTestId('rc-member-list')).toBeVisible();
    const ids = await rowIds(page, 'beam');
    await page.getByTestId(`rc-member-${ids[0]}`).click();
    expect(await channel(page)).toEqual([Number(ids[0])]);

    // 2. Collapse the section and reopen it by hand: the same list, the same channel, no reset
    // of what was selected.
    const section = page.getByTestId('detailing-disclosure');
    await section.locator('> summary').click();
    await section.locator('> summary').click();
    await expect(page.getByTestId('rc-member-list')).toBeVisible();
    expect(await channel(page), 'the selection survived the round trip')
      .toEqual([Number(ids[0])]);
    await expect(page.getByTestId(`rc-member-${ids[0]}`))
      .toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('selecting at the four widths', () => {
  for (const vp of [
    { width: 1280, height: 720 },
    { width: 1024, height: 700 },
    { width: 900, height: 700 },
    { width: 820, height: 700 },
  ]) {
    test(`a row is clickable at ${vp.width}x${vp.height}`, async ({ pro: page }) => {
      await page.setViewportSize(vp);
      await classify(page, FRAMES);
      await openDetailing(page);
      const ids = await rowIds(page, 'beam');

      const row = page.getByTestId(`rc-member-${ids[0]}`);
      await row.click();
      expect(await channel(page)).toEqual([Number(ids[0])]);

      /*
       * And a real pointer event at the row's centre reaches the row, rather than a sticky
       * header sitting over it — the same hit-test `pro-design-gates` runs on the commands, for
       * the same reason: "visible and enabled" was true throughout that defect too.
       */
      await row.scrollIntoViewIfNeeded();
      const box = await row.boundingBox();
      const receiver = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return el?.closest('[data-testid]')?.getAttribute('data-testid') ?? null;
      }, { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 });
      expect(receiver, 'the click lands on the row').toContain(`rc-member-${ids[0]}`);
    });
  }
});

test.describe('selecting in three languages', () => {
  for (const locale of ['en', 'es', 'pt'] as const) {
    test(`${locale} — selection works and says so`, async ({ pro: page }) => {
      await page.getByTestId('lang-select').selectOption(locale);
      await classify(page, FRAMES);
      await openDetailing(page);
      const ids = await rowIds(page, 'beam');

      await page.getByTestId(`rc-member-${ids[0]}`).click();
      expect(await channel(page)).toEqual([Number(ids[0])]);
      await expect(page.getByTestId(`rc-member-${ids[0]}`))
        .toHaveAttribute('aria-selected', 'true');
      // The label is still a translated human label, not a key, with the selection applied.
      const label = await page.getByTestId(`rc-member-label-${ids[0]}`).innerText();
      expect(label, 'no raw key').not.toMatch(/design\./);
      expect(label.trim().length).toBeGreaterThan(1);
    });
  }
});
