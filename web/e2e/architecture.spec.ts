/**
 * Architecture in the design desk, on a concrete frame: a construction by layers checked against
 * the project's U limit, a wall on a level, its weight put on the structure, and the memoria
 * downloaded. The arithmetic is pinned in `engine/architecture/__tests__/architecture.test.ts`
 * and `store/__tests__/architecture.test.ts`.
 */
import { test, expect, loadModel, solveModel, openDeskStage, deskTab } from './fixtures';

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('@slow architecture', () => {
  test('a construction, a wall and its load, the memoria', async ({ pro: page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await openDeskStage(page);
    await deskTab(page, 'arch');
    const a = page.getByTestId('arch-editor');
    const v: Record<string, string> = { 'cons-name': 'Ladrillo 18', 'cons-rsi': '0.13', 'cons-rse': '0.04', 'cons-uMax': '1.8', 'layer-0-name': 'ladrillo', 'layer-0-d': '180', 'layer-0-lambda': '0.81', 'layer-0-rho': '1600' };
    for (const [k, x] of Object.entries(v)) await a.getByTestId(k).fill(x);
    await a.getByTestId('cons-save').click();
    const row = a.locator('[data-testid^="cons-row-"]');
    await expect(row).toHaveCount(1);
    await row.click();
    await expect(page.getByTestId('member-rows-sheet')).toContainText(/Thermal transmittance|Transmitancia térmica/);
    await a.getByTestId('arch-walls').locator('summary').click();
    const level = a.getByTestId('wall-level');
    await level.selectOption({ index: 1 });
    for (const [k, x] of Object.entries({ x1: '0', y1: '0', x2: '4', y2: '0', height: '2.7' })) await a.getByTestId(`wall-${k}`).fill(x);
    await a.getByTestId('wall-construction').selectOption({ index: 1 });
    await a.getByTestId('wall-add').click();
    await a.getByTestId('arch-loads').locator('summary').click();
    await a.getByTestId('arch-wall-loads').click();
    await expect(a.getByTestId('arch-note')).toContainText(/loads applied|cargas aplicadas/);
    const download = page.waitForEvent('download');
    await a.getByTestId('arch-memoria').click();
    expect((await download).suggestedFilename()).toMatch(/architecture\.html$/);
    expect(errors).toEqual([]);
  });
});
