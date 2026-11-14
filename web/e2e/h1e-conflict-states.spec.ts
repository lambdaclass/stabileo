/**
 * The conflict and refusal states, on the fixtures that actually produce them.
 *
 * `rc-qa-diagnostic` builds a document with unresolved conflicts, and refuses members on its own
 * since the design reads the bars' anchorage in the columns.
 */

import { test, expect, designAll, loadModel, openDocumentsStage, designPlace } from './fixtures';
import type { Page } from '@playwright/test';

type Hooks = {
  __stabileo: {
    detailingAssemblies(): Array<{ conflicts?: unknown[] }>;
  };
};

async function generate(page: Page, model: string) {
  await loadModel(page, model);
  await designAll(page);
  await designPlace(page, 'detailing');
  const generate = page.getByTestId('cmd-generate-detailing');
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect
    .poll(() => page.evaluate(() =>
      (window as unknown as Hooks).__stabileo.detailingAssemblies().length),
      { timeout: 180_000 })
    .toBeGreaterThan(0);
}

test.describe('@slow conflicts, on a model that has them', () => {
  test.slow();
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the document reports them and refuses to claim more than a draft',
    async ({ pro: page }) => {
      await generate(page, 'rc-qa-diagnostic');
      await openDocumentsStage(page);
      const download = page.waitForEvent('download', { timeout: 30_000 });
      await page.getByTestId('doc-xlsx').click();
      await download;

      /*
       * `doc-conflicts` is a state H1-C never reached: on `rc-design-qa-8` there are none, so the
       * block never rendered and the readiness never fell below its best case.
       */
      const conflicts = page.getByTestId('doc-conflicts');
      await expect(conflicts).toBeVisible();
      expect((await conflicts.innerText()).trim()).toMatch(/\d+/);

      // And the readiness says draft, which is the honest consequence of unresolved conflicts.
      await expect(page.getByTestId('doc-readiness')).toContainText(/draft|borrador|rascunho/i);
    });
});

test.describe('@slow what these fixtures now reach', () => {
  test.slow();
  test.use({ viewport: { width: 1280, height: 720 } });

  test('rc-qa-diagnostic now refuses members', async ({ pro: page }) => {
    await generate(page, 'rc-qa-diagnostic');
    const counts = await page.evaluate(() => window.__stabileo.runCounts());
    expect([counts?.searchExhausted, counts?.unsupported], 'the refusals the engine reached').toEqual([5, 1]);
  });
});

