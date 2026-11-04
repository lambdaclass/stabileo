/**
 * Coordination in the design desk: an IFC of another discipline linked and drawn as backgrounds,
 * the same file brought again as an update (nothing new, nothing modified), and a version
 * published as a package and compared with the model. The rules are pinned in
 * `engine/federation/__tests__/federation.test.ts` and `store/__tests__/federation.test.ts`.
 */
import { test, expect, loadModel, solveModel, openDeskStage, deskTab } from './fixtures';
import { BUILDING_IFC } from '../src/lib/ifc/__tests__/building-ifc';

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('@slow coordination', () => {
  test('a linked model, its update compared, a version published', async ({ pro: page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await openDeskStage(page);
    await deskTab(page, 'collab');
    const c = page.getByTestId('collab-editor');
    const file = { name: 'arq.ifc', mimeType: 'application/octet-stream', buffer: Buffer.from(BUILDING_IFC) };
    await c.getByTestId('fed-link-file').setInputFiles(file);
    await c.getByTestId('fed-link-name').fill('Arquitectura');
    await c.getByTestId('fed-link-add').click();
    await expect(c.getByTestId('fed-msg')).toContainText(/Model linked with|Modelo vinculado con/, { timeout: 30_000 });
    const row = c.locator('[data-testid^="fed-link-lk-"]');
    await expect(row).toHaveCount(1);
    await row.getByRole('button', { name: /Update|Actualizar/ }).click();
    await c.getByTestId('fed-update-file').setInputFiles({ ...file, name: 'arq-v2.ifc' });
    await expect(c.getByTestId('fed-pending')).toContainText(/0 (new|nuevos), 0 (modified|modificados), 0 (removed|eliminados)/, { timeout: 30_000 });
    await c.getByTestId('fed-apply').click();
    await c.getByTestId('fed-author').fill('BC');
    const download = page.waitForEvent('download');
    await c.getByTestId('fed-publish').click();
    expect((await download).suggestedFilename()).toMatch(/-v1\.zip$/);
    await c.getByTestId('fed-compare-1').click();
    await expect(c.getByTestId('fed-comparison')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
