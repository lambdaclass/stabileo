/**
 * The works by phases in the design desk, on a concrete frame: the phases proposed by level, the
 * model shown at the end of the first phase and then whole again, and the safety items listed.
 * The sequence is pinned in `engine/site/__tests__/phases.test.ts` and `store/__tests__/site.test.ts`.
 */
import { test, expect, loadModel, solveModel, openDeskStage, deskTab } from './fixtures';

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('@slow works by phases', () => {
  test('phases proposed, stepped through, safety listed', async ({ pro: page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await openDeskStage(page);
    await deskTab(page, 'site');
    const s = page.getByTestId('site-editor');
    await s.getByTestId('site-start').fill('2026-11-02');
    await s.getByTestId('site-generate').click();
    await expect(s.getByTestId('site-note')).toContainText(/phases proposed|fases propuestas/);
    await expect(s.getByTestId('site-phases').locator('tbody tr')).not.toHaveCount(0);
    await s.getByTestId('site-slider').fill('0');
    await expect(s.getByTestId('site-phases').locator('tbody tr').first()).toHaveClass(/on/);
    await s.getByRole('button', { name: /Show all|Mostrar todo/ }).click();
    await s.getByTestId('site-safety').locator('summary').click();
    expect(errors).toEqual([]);
  });
});
