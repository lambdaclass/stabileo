/**
 * Foreign codes in the design desk, on a concrete frame: EN 1992-1-1 with the UK National Annex
 * chosen for concrete, its scope by article, and its design member by member, one opened. The
 * arithmetic is pinned in `engine/design/eurocode/__tests__/ec2.test.ts` and
 * `store/__tests__/foreign-design.test.ts`.
 */
import { test, expect, loadModel, solveModel, openDeskStage, deskTab } from './fixtures';

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('@slow foreign codes', () => {
  test('a concrete frame designed by BS EN 1992-1-1', async ({ pro: page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await openDeskStage(page);
    await deskTab(page, 'codes');
    const fx = page.getByTestId('foreign-codes');
    await expect(fx).toContainText(/Choose a foreign code|Elegí una norma extranjera/);
    await fx.getByTestId('fx-concrete').selectOption('ec2-uk');
    const sec = fx.getByTestId('fx-code-ec2-uk');
    await expect(sec).toContainText('BS EN 1992-1-1');
    await sec.getByTestId('fx-matrix-ec2-uk').locator('xpath=..').locator('summary').click();
    await expect(sec.getByTestId('fx-matrix-ec2-uk')).toContainText('6.2.2');
    await sec.getByTestId('fx-run-ec2-uk').click();
    const rows = sec.getByTestId('fx-members-ec2-uk').locator('tbody tr');
    await expect(rows).not.toHaveCount(0);
    await rows.first().click();
    await expect(page.getByTestId('member-rows-sheet')).toContainText(/6\.1|5\.8\.3/);
    expect(errors).toEqual([]);
  });
});
