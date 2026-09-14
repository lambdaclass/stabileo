/**
 * The cold-formed selector, as a user meets it.
 *
 * ── What only an E2E can check here ────────────────────────────────
 *
 * The unit tests prove the geometry, the resolution and that five scope facts exist. None of them
 * proves a user can REACH any of it, or that all five facts are actually rendered rather than
 * four-plus-one-that-got-styled-away. That is what this file is for.
 *
 * The central assertion is the awkward one: a screen that produces sections must simultaneously
 * say that nothing it produces is verified. Both halves are tested together, because either alone
 * is the wrong screen — a selector that hides the limits, or a wall of refusals with no selector.
 */

import { test, expect, PRO_URL } from './fixtures';
import type { Page } from '@playwright/test';

async function openSteelPanel(page: Page): Promise<void> {
  await page.getByTestId('pr-stage-design').click();
  await page.getByTestId('pr-cmd-steel').click();
  await expect(page.getByTestId('pro-steel-panel')).toBeVisible();
}

async function openPanel(page: Page): Promise<void> {
  await page.goto(PRO_URL);
  await openSteelPanel(page);
  await page.getByTestId('cold-formed-panel').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('cold-formed-panel')).toBeVisible();
}

/** Type a designation and commit it. */
async function enterDesignation(page: Page, text: string): Promise<void> {
  const input = page.getByTestId('cf-designation-input');
  await input.fill(text);
  await input.press('Enter');
}

test.describe('the selector is reachable and works with no series loaded', () => {
  test('specifies a section from four dimensions', async ({ page }) => {
    await openPanel(page);
    // The defaults are already a valid section, which is the point: a parametric family has
    // nothing to load before it can answer.
    await expect(page.getByTestId('cf-designation')).toHaveText('C 100x50x15x2.0');
    await expect(page.getByTestId('cf-properties')).toBeVisible();
  });

  test('resolves a designation nobody has a table for', async ({ page }) => {
    await openPanel(page);
    await enterDesignation(page, 'Z 240x75x20x2.5');
    await expect(page.getByTestId('cf-designation')).toHaveText('Z 240x75x20x2.5');
    await expect(page.getByTestId('cf-shape-Z')).toHaveClass(/active/);
  });

  test('normalises what a person types', async ({ page }) => {
    await openPanel(page);
    // Lower case, the multiplication sign, a decimal comma, spaces — all one section.
    await enterDesignation(page, ' c 100 × 50 × 15 × 2,0 ');
    await expect(page.getByTestId('cf-designation')).toHaveText('C 100x50x15x2.0');
  });

  test('editing a dimension re-derives the designation and the properties', async ({ page }) => {
    await openPanel(page);
    const before = await page.getByTestId('cf-properties').textContent();
    await page.getByTestId('cf-h').fill('200');
    await expect(page.getByTestId('cf-designation')).toHaveText('C 200x50x15x2.0');
    expect(await page.getByTestId('cf-properties').textContent()).not.toBe(before);
  });

  test('says which dimension is impossible instead of just refusing', async ({ page }) => {
    await openPanel(page);
    // Lips past mid-depth: they would collide. The panel has to name that, not print "invalid".
    await page.getByTestId('cf-c').fill('60');
    await expect(page.getByTestId('cf-reject')).toBeVisible();
    await expect(page.getByTestId('cf-designation')).toHaveCount(0);
  });
});

test.describe('all five scope facts are rendered, not four and a capability', () => {
  const FACTS = [
    'parametricGeometryAvailable',
    'tabulatedCatalogueUnavailable',
    'cirsoc301Excludes',
    'cirsoc303NotIncorporated',
    'noNormativeVerification',
  ];

  test('every one of them is visible', async ({ page }) => {
    await openPanel(page);
    for (const fact of FACTS) {
      const li = page.getByTestId(`cf-scope-${fact}`);
      await expect(li, fact).toBeVisible();
      // A rendered sentence, not a bare key and not an empty bullet. Measured on the text rather
      // than matched with a pattern: `\S{20,}` would demand twenty characters with no space in
      // them, which no sentence has — the mistake this line was written with first.
      expect((await li.innerText()).trim().length, fact).toBeGreaterThan(20);
    }
  });

  test('the capability is not styled as a refusal', async ({ page }) => {
    /*
     * The failure this whole structure guards against: five facts rendered uniformly as limits,
     * which tells a reader that nothing works when in fact the geometry does.
     */
    await openPanel(page);
    await expect(page.getByTestId('cf-scope-parametricGeometryAvailable')).toHaveClass(/available/);
    for (const fact of FACTS.slice(1)) {
      await expect(page.getByTestId(`cf-scope-${fact}`), fact).toHaveClass(/unavailable/);
    }
  });

  test('and both regulations are named on screen', async ({ page }) => {
    await openPanel(page);
    await expect(page.getByTestId('cf-scope-cirsoc301Excludes')).toContainText('301');
    await expect(page.getByTestId('cf-scope-cirsoc303NotIncorporated')).toContainText('303');
  });
});

test.describe('nothing on this screen claims a section was checked', () => {
  test('carries no verification vocabulary in any state', async ({ page }) => {
    await openPanel(page);
    for (const d of ['C 100x50x15x2.0', 'Z 200x75x20x2.5']) {
      await enterDesignation(page, d);
      const text = (await page.getByTestId('cold-formed-panel').innerText()).toLowerCase();
      for (const word of ['verificado', 'verified', 'aprobado', 'approved', 'certificad', 'apto']) {
        expect(text, `${d} must not say "${word}"`).not.toContain(word);
      }
    }
  });

  test('labels every number as derived from geometry', async ({ page }) => {
    // The provenance a reader needs: these are not table values, and the screen says which.
    await openPanel(page);
    await expect(page.getByTestId('cf-basis')).toContainText('derivedFromGeometry');
  });

  test('states the square-corner cost as a number', async ({ page }) => {
    await openPanel(page);
    await expect(page.getByTestId('cf-corners')).toContainText(/0\.\d\d ?%/);
  });
});

test.describe('the zed says its axes are rotated; the channel does not', () => {
  test('warns on a zed, with the angle', async ({ page }) => {
    /*
     * The notice text and the decision to show it both come from `section/axes.ts` now — the same
     * rule that will cover the 37 catalogued angles. What this panel adds is the measured angle,
     * which is why the assertion looks for a number as well as the citation.
     */
    await openPanel(page);
    await enterDesignation(page, 'Z 200x75x20x2.5');
    const warn = page.getByTestId('cf-axes-notice');
    await expect(warn).toBeVisible();
    // A number, not the word "rotated": «rotated» and «rotated 23 degrees» are different warnings.
    await expect(warn).toContainText(/\d+\.\d/);
    await expect(warn).toContainText('303');
  });

  test('and stays quiet on a channel, whose geometric axes ARE principal', async ({ page }) => {
    await openPanel(page);
    await enterDesignation(page, 'C 200x75x20x2.5');
    await expect(page.getByTestId('cf-axes-notice')).toHaveCount(0);
  });
});

test.describe('a specified section reaches the model', () => {
  test('adds it, and the model keeps the designation as its name', async ({ page }) => {
    await openPanel(page);
    await enterDesignation(page, 'Z 150x60x20x2.0');
    await page.getByTestId('cf-add').click();
    await expect(page.getByTestId('cf-added')).toContainText('Z 150x60x20x2.0');

    // No store read: there is no `sections()` test hook, and a conditional assertion that skips
    // itself when the hook is absent is a test that reports success for the wrong reason. The
    // next case checks the model for real, through the sections table a user would look at.
  });

  test('and the section appears in the sections table under its designation', async ({ page }) => {
    await openPanel(page);
    await enterDesignation(page, 'C 180x60x20x2.5');
    await page.getByTestId('cf-add').click();
    await expect(page.getByTestId('cf-added')).toBeVisible();

    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-sections').click();
    await expect(page.getByText('C 180x60x20x2.5').first()).toBeVisible();
  });
});
