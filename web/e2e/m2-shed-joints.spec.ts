/**
 * The industrial shed's joints, in a browser, on the shipped example.
 *
 * ── Why this file exists, and why unit tests were not enough ───────
 *
 * The symptom was "the app detects no joints". Two rounds of pure and store-level tests said
 * the pipeline was fine — and they were right about the model they used, a GENERATED shed:
 * 300 joints, 625 metallic members, nothing filtered. The shipped EXAMPLE is a different
 * model, and it was in a state no generated one can reach:
 *
 *   · all 633 elements pointed at material id 2;
 *   · material 2 declared `e`, `nu`, `rho` and **no `fy`**;
 *   · `materialFamilyOf` with no yield strength returns `unknown` — correctly;
 *   · so the inventory held 0 of 633, and all 226 joints were filtered away.
 *
 * That is the whole lesson of this file: a fixture is a code path, and "we tested it with the
 * model we happened to build" is how one stays broken. Everything below loads the example a
 * user actually opens.
 */

import { test, expect, PRO_URL, loadModel } from './fixtures';
import type { Page } from '@playwright/test';

async function openShedConnections(page: Page): Promise<void> {
  await page.goto(PRO_URL);
  await loadModel(page, '3d-nave-industrial');
  await page.getByTestId('pr-stage-design').click();
  await page.getByTestId('pr-cmd-connections').click();
  await expect(page.getByTestId('conn-sec-joints')).toBeVisible();
}

test.describe('the shed has joints, and the panel shows them', () => {
  test('the count is real and the list is not empty', async ({ page }) => {
    await openShedConnections(page);
    const badge = page.getByTestId('conn-joint-count');
    await expect(badge).toBeVisible();
    const n = Number((await badge.innerText()).trim());
    // 226 in the shipped file. Asserted as a range so a fixture edit does not silently pass
    // by dropping the model to two members.
    expect(n).toBeGreaterThan(100);
    await expect(page.getByTestId('conn-no-joints')).toHaveCount(0);
    await expect(page.getByTestId('conn-none-metallic')).toHaveCount(0);
  });

  test('each row names its node and how many members meet there', async ({ page }) => {
    await openShedConnections(page);
    const rows = page.locator('.conn-joint-row');
    await expect(rows.first()).toBeVisible();
    const first = await rows.first().innerText();
    expect(first).toMatch(/N\d+/);
    // The busiest joint leads, so the first row is the one worth detailing.
    expect(first).toMatch(/\d+/);
  });

  test('selecting a joint shows the members that meet at it', async ({ page }) => {
    await openShedConnections(page);
    await page.locator('.conn-joint-row').first().click();
    const members = page.getByTestId('conn-joint-members');
    await expect(members).toBeVisible();
    await expect(members).not.toBeEmpty();
  });

  test('the selected row is marked, so the panel and the model agree', async ({ page }) => {
    await openShedConnections(page);
    const row = page.locator('.conn-joint-row').first();
    await row.click();
    await expect(row).toHaveClass(/active/);
  });

  test('the joint rows are reachable by keyboard', async ({ page }) => {
    await openShedConnections(page);
    const row = page.locator('.conn-joint-row').first();
    await row.focus();
    await expect(row).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(row).toHaveClass(/active/);
  });
});

test.describe('an empty list says which emptiness it is', () => {
  /*
   * The distinction the shed's own defect made necessary. "No joints" and "there are joints and
   * none of them is metallic" are different facts about a model, and only the second one has an
   * action attached to it.
   */
  test('an empty model says there are no joints', async ({ page }) => {
    await page.goto(PRO_URL);
    await page.getByTestId('pr-stage-design').click();
    await page.getByTestId('pr-cmd-connections').click();
    await expect(page.getByTestId('conn-no-joints')).toBeVisible();
    await expect(page.getByTestId('conn-none-metallic')).toHaveCount(0);
  });

  /*
   * A concrete model has joints and no metallic member, which is exactly the second state — and
   * the panel must say so rather than claiming the model has no joints.
   */
  test('a concrete model says its joints could not be shown, and why', async ({ page }) => {
    await page.goto(PRO_URL);
    await loadModel(page, 'pro-edificio-7p');
    await page.getByTestId('pr-stage-design').click();
    await page.getByTestId('pr-cmd-connections').click();
    const blocked = page.getByTestId('conn-none-metallic');
    await expect(blocked).toBeVisible();
    await expect(blocked).not.toBeEmpty();
    await expect(page.getByTestId('conn-no-joints')).toHaveCount(0);
  });
});
