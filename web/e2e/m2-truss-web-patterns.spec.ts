/**
 * The truss web patterns, as a user meets them.
 *
 * ── What only an E2E can check here ────────────────────────────────
 *
 * `truss-web-patterns.test.ts` proves the geometry: Pratt diagonals descend toward midspan,
 * Warren alternates and has no interior posts, the subdivision splits rather than crosses. And
 * `generated-models-solve.test.ts` proves none of it is a mechanism.
 *
 * What none of them proves is that a user can SELECT any of it. Warren has to appear in the
 * list, the subdivision checkbox has to appear only when it applies, and the count beside
 * Generate has to change when it is ticked — because a control that changes nothing visible is
 * indistinguishable from one that is not wired.
 */

import { test, expect, PRO_URL } from './fixtures';
import type { Page } from '@playwright/test';

async function openGenerators(page: Page): Promise<void> {
  await page.goto(PRO_URL);
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-generators').click();
  await expect(page.getByTestId('pro-generators-panel')).toBeVisible();
}

/** The member count the preview promises. */
async function promisedMembers(page: Page): Promise<number> {
  const text = await page.getByTestId('gen-preview').innerText();
  const m = text.match(/(\d+)\s+members/);
  expect(m, `preview did not state its totals: ${text}`).not.toBeNull();
  return Number(m![1]);
}

test.describe('the three web patterns are offered', () => {
  test('Warren is in the list beside Pratt and Howe', async ({ page }) => {
    await openGenerators(page);
    const select = page.getByTestId('gen-web-pattern');
    const values = await select.locator('option').evaluateAll((os) =>
      os.map((o) => (o as HTMLOptionElement).value),
    );
    expect(values.sort()).toEqual(['howe', 'pratt', 'warren']);
  });

  /*
   * The labels carried the error too — «Pratt (suben al centro)» — so a user reading the list
   * was told the opposite of what the truss did. Asserted in the UI, not only in the dictionary.
   */
  test('the Pratt label says its diagonals descend', async ({ page }) => {
    await openGenerators(page);
    const select = page.getByTestId('gen-web-pattern');
    const pratt = await select.locator('option[value="pratt"]').innerText();
    expect(pratt.toLowerCase()).toMatch(/bajan|descend|descem/);
    const howe = await select.locator('option[value="howe"]').innerText();
    expect(howe.toLowerCase()).toMatch(/suben|rise|sobem/);
  });
});

test.describe('subdividing the diagonals', () => {
  test('the control appears, with its explanation', async ({ page }) => {
    await openGenerators(page);
    await expect(page.getByTestId('gen-subdivide')).toBeVisible();
    await expect(page.getByTestId('gen-subdivide-hint')).not.toBeEmpty();
  });

  test('ticking it adds members, so it is visibly wired', async ({ page }) => {
    await openGenerators(page);
    const before = await promisedMembers(page);
    await page.getByTestId('gen-subdivide').check();
    await expect.poll(() => promisedMembers(page)).toBeGreaterThan(before);
  });

  /*
   * Hidden where it would be a no-op: with one panel per half the new panel point lands on the
   * existing midspan one, so the option is refused rather than offered and ignored.
   */
  test('it disappears when one panel per half makes it meaningless', async ({ page }) => {
    await openGenerators(page);
    const panels = page.getByTestId('gen-panels');
    await panels.fill('1');
    await panels.blur();
    await expect(page.getByTestId('gen-subdivide')).toBeHidden();
  });
});

test.describe('every pattern still generates a model', () => {
  for (const pattern of ['pratt', 'howe', 'warren'] as const) {
    test(`generates a ${pattern} truss`, async ({ page }) => {
      await openGenerators(page);
      const select = page.getByTestId('gen-web-pattern');
      await select.selectOption(pattern);
      const promised = await promisedMembers(page);
      await page.getByTestId('gen-generate').click();
      await expect(page.getByTestId('gen-result')).toBeVisible();
      // The count beside Generate is the count that lands, for every pattern.
      await expect(page.getByTestId('gen-result')).toContainText(String(promised));
    });
  }
});
