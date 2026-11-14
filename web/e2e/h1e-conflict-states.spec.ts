/**
 * The refusal state, on a fixture that produces it: `rc-qa-diagnostic` refuses members on its own
 * since the design reads the bars' anchorage in the columns.
 */

import { test, expect, designAll, loadModel, designPlace } from './fixtures';
import type { Page } from '@playwright/test';

type Hooks = {
  __stabileo: {
    detailingAssemblies(): Array<{ conflicts?: unknown[] }>;
  };
};

async function generate(page: Page, model: string) {
  await loadModel(page, model);
  await designAll(page);
  await designPlace(page, 'list');
  const generate = page.getByTestId('cmd-generate-detailing');
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect
    .poll(() => page.evaluate(() =>
      (window as unknown as Hooks).__stabileo.detailingAssemblies().length),
      { timeout: 180_000 })
    .toBeGreaterThan(0);
}

test.describe('@slow what these fixtures now reach', () => {
  test.slow();
  test.use({ viewport: { width: 1280, height: 720 } });

  test('rc-qa-diagnostic now refuses members', async ({ pro: page }) => {
    await generate(page, 'rc-qa-diagnostic');
    const counts = await page.evaluate(() => window.__stabileo.runCounts());
    expect([counts?.searchExhausted, counts?.unsupported], 'the refusals the engine reached').toEqual([5, 1]);
  });
});

