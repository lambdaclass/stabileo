/**
 * A linked IFC in PRO's analysis, without the design: linked from Grid and levels, drawn in 3D as
 * a reference, with the count of what it draws, and in halftone in the View panel's categories.
 */
import { test, expect } from './fixtures';
import { BUILDING_IFC } from '../src/lib/ifc/__tests__/building-ifc';

test.use({ viewport: { width: 1440, height: 900 } });

test('@smoke an architecture IFC linked as a 3D reference in halftone', async ({ pro: page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-grid').click();
  const card = page.getByTestId('linked-models-card');
  await card.getByTestId('linked-file').setInputFiles({ name: 'arq.ifc', mimeType: 'application/octet-stream', buffer: Buffer.from(BUILDING_IFC) });
  await expect(card.getByTestId('linked-note')).toContainText(/3 (objects|objetos)/, { timeout: 30_000 });
  await expect(card.locator('[data-testid^="linked-summary-"]')).toHaveCount(1);

  await page.getByTestId('pr-cmd-view').click();
  await expect(page.getByTestId('view-cat-linked-halftone')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('view-cat-linked-hidden').click();
  await expect(page.getByTestId('hidden-categories-chip')).toContainText(/IFC/);
  expect(errors).toEqual([]);
});
