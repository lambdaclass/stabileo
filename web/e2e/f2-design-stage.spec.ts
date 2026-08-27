/**
 * F2 — the DISEÑAR stage: the design surface inside it, and one command with a visible scope.
 *
 * What these are for, in order of what they would catch:
 *
 *   1. ProDesignTab is INSIDE the stage, mounted once, and the floor pass is a sub-step of it
 *      rather than a stage of its own.
 *   2. There is ONE design command. Two commands with different scopes — `cmd-design-all` in
 *      the bar and `cmd-design-families` beside the boxes — is what §2 names, and a different
 *      label does not fix it.
 *   3. The scope is on screen BEFORE the command runs. That is the condition the narrowed
 *      default depends on: an unticked family nobody can see is the old "a building with no
 *      floors, and it did not say so" defect wearing a smaller default.
 *   4. A family the model does not contain is not offered at all, so "this model has no walls"
 *      stays distinguishable from "the walls have not been designed".
 */

import { test, expect, loadModel } from './fixtures';
import type { Page } from '@playwright/test';

const stage = (page: Page) => page.getByTestId('design-stage-disclosure');
const openDesign = async (page: Page) => {
  await page.getByTestId('rc-stage-design').locator('button').click();
  await expect(page.getByTestId('pro-design-tab')).toBeVisible();
};

test.describe('the stage contains the surface it names', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the design table is inside the DISEÑAR stage, and mounted once', async ({ pro: page }) => {
    await openDesign(page);
    await expect(page.getByTestId('pro-design-tab')).toHaveCount(1);
    const inside = await stage(page).getByTestId('pro-design-tab').count();
    expect(inside, 'the table is inside the stage, not after every stage').toBe(1);
  });

  test('the floor pass is a sub-step of it, not a stage', async ({ pro: page }) => {
    await openDesign(page);
    const floors = page.getByTestId('floor-families-disclosure');
    await expect(floors).toHaveCount(1);
    expect(await stage(page).getByTestId('floor-families-disclosure').count(),
      'it lives inside DISEÑAR').toBe(1);
    // And it says it is optional rather than waiting on anything.
    await expect(page.getByTestId('floor-families-disclosure-state'))
      .toContainText(/optional|opcional|opcional/i);
  });

  /*
   * A sub-step has no position in the pipeline. A number here would be a second "3" beside the
   * stage's own, which is the class of defect this branch removed from the tab.
   */
  test('the sub-step carries no pipeline number', async ({ pro: page }) => {
    await openDesign(page);
    const marker = page.getByTestId('floor-families-disclosure').locator('> summary > .marker');
    expect((await marker.innerText()).trim(), 'a glyph, not a step number').not.toMatch(/^\d+$/);
  });

  test('nothing in the panel is mounted twice', async ({ pro: page }) => {
    await openDesign(page);
    const dupes = await page.evaluate(() => {
      const c: Record<string, number> = {};
      for (const el of document.querySelectorAll('.rc-workflow [data-testid]')) {
        const k = el.getAttribute('data-testid')!;
        c[k] = (c[k] ?? 0) + 1;
      }
      return Object.entries(c).filter(([, n]) => n > 1).map(([k, n]) => `${k} ×${n}`);
    });
    expect(dupes).toEqual([]);
  });
});

test.describe('one command, and its scope is visible first', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the second design command is gone', async ({ pro: page }) => {
    await openDesign(page);
    await expect(page.getByTestId('cmd-design-families')).toHaveCount(0);
    await expect(page.getByTestId('cmd-design-all')).toHaveCount(1);
  });

  test('the scope is named beside the command before it runs', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await openDesign(page);
    const scope = page.getByTestId('cmd-design-scope');
    await expect(scope).toBeVisible();
    expect((await scope.innerText()).trim(), 'the families are named').toMatch(/column|beam/i);
  });

  /*
   * The narrowed default. Beams and columns are the two families the frame pass can design from
   * the analysis alone; everything else needs an input the user has to supply or confirm.
   */
  test('beams and columns start selected', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await openDesign(page);
    for (const f of ['beam', 'column']) {
      await expect(page.getByTestId(`design-family-${f}`), `${f} is selected`).toBeChecked();
    }
  });

  test('unticking everything disables the command rather than running an empty scope',
    async ({ pro: page }) => {
      await loadModel(page, 'rc-design-qa-8');
      await openDesign(page);
      await page.getByTestId('design-family-none').click();
      await expect(page.getByTestId('cmd-design-all')).toBeDisabled();
      const scope = (await page.getByTestId('cmd-design-scope').innerText()).trim();
      expect(scope.length, 'and it says the scope is empty').toBeGreaterThan(5);
    });

  test('the scope follows the boxes', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await openDesign(page);
    const scope = page.getByTestId('cmd-design-scope');
    const before = (await scope.innerText()).trim();
    await page.getByTestId('design-family-beam').click();
    await expect(scope).not.toHaveText(before);
  });
});

test.describe('only the families the model has are offered', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  /*
   * A frame-only building. A checkbox for something the building does not contain is a question
   * with one answer, and offering it would blur "this model has no walls" into "the walls have
   * not been designed".
   */
  test('a frame-only model offers beams and columns and nothing else', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await openDesign(page);
    for (const f of ['beam', 'column']) {
      await expect(page.getByTestId(`design-family-${f}`), `${f} is offered`).toHaveCount(1);
    }
    for (const f of ['slab', 'wall']) {
      await expect(page.getByTestId(`design-family-${f}`),
        `${f} is not offered by a frame-only model`).toHaveCount(0);
    }
  });

  /*
   * `pro-edificio-7p`, because it actually holds shell panels. An earlier version used
   * `rc-qa-diagnostic` and passed for the wrong reason waiting to happen: that model has no
   * shells, so it offers the same two families a bare frame does and the assertion was about a
   * fixture I had assumed rather than measured.
   */
  test('@slow a model with shells offers slabs and walls too', async ({ pro: page }) => {
    test.slow();
    await loadModel(page, 'pro-edificio-7p');
    await openDesign(page);
    for (const f of ['slab', 'wall']) {
      await expect(page.getByTestId(`design-family-${f}`), `${f} is offered`).toHaveCount(1);
    }
    const offered = await page.getByTestId('design-family-rows').locator('input').count();
    expect(offered, 'more families than a bare frame').toBeGreaterThan(2);
  });
});

test.describe('reaching it from the timeline', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the stage takes the keyboard with it', async ({ pro: page }) => {
    await page.getByTestId('rc-stage-design').locator('button').click();
    await expect(stage(page).locator('> summary')).toBeFocused();
  });

  test('and opening the floor sub-step keeps the stage marked as read', async ({ pro: page }) => {
    await openDesign(page);
    await page.getByTestId('floor-families-disclosure').locator('> summary').click();
    await expect(page.getByTestId('rc-stage-design')).toHaveAttribute('data-open', 'true');
  });
});

for (const vp of [
  { width: 1280, height: 720 }, { width: 1024, height: 700 }, { width: 860, height: 700 },
]) {
  test.describe(`at ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp });

    test('the stage fits without scrolling the column sideways', async ({ pro: page }) => {
      await loadModel(page, 'rc-design-qa-8');
      await openDesign(page);
      const over = await page.locator('.rc-workflow')
        .evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(over, `no horizontal overflow at ${vp.width}`).toBeLessThanOrEqual(1);
    });
  });
}

for (const locale of ['en', 'es', 'pt'] as const) {
  test.describe(`in ${locale}`, () => {
    test.use({ appLocale: locale, viewport: { width: 1024, height: 700 } });

    test('the command, its scope and the sub-step are all translated', async ({ pro: page }) => {
      await loadModel(page, 'rc-design-qa-8');
      await openDesign(page);
      for (const id of ['cmd-design-all', 'cmd-design-scope', 'floor-families-disclosure-purpose']) {
        const text = (await page.getByTestId(id).innerText()).trim();
        expect(text.length, `${id} is named in ${locale}`).toBeGreaterThan(2);
        expect(text, `${id} is translated, not a key`).not.toMatch(/^design\./);
      }
    });
  });
}
