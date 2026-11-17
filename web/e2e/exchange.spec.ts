/**
 * The designed building for other programs, from the Documents stage: the qa-8 frame designed and
 * detailed, exported as IFC with its bars and read back by the app's own importer; the forces of
 * each physical member as CSV; the project workbook. The file itself is pinned in
 * `lib/ifc/__tests__/ifc-writer.test.ts`.
 */
import { test, expect, designAll, loadModel, openDocumentsStage, designPlace } from './fixtures';
import { readFileSync } from 'node:fs';

test.use({ viewport: { width: 1400, height: 900 } });

test.describe('@slow exchange', () => {
  test('IFC with bars, read back; forces by physical member; the workbook', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await designPlace(page, 'detailing');
    await page.getByTestId('cmd-generate-detailing').click();
    await expect.poll(async () => page.evaluate(() =>
      (window.__stabileo as unknown as { detailingAssemblies(): unknown[] }).detailingAssemblies().length), { timeout: 30_000 }).toBeGreaterThan(0);
    await openDocumentsStage(page);
    const panel = page.getByTestId('exchange-panel').first();
    await panel.scrollIntoViewIfNeeded();

    const [ifc] = await Promise.all([page.waitForEvent('download'), panel.getByTestId('exchange-ifc').click()]);
    expect(ifc.suggestedFilename()).toMatch(/\.ifc$/);
    const text = readFileSync(await ifc.path(), 'utf8');
    expect(text).toContain("FILE_SCHEMA(('IFC4'));");
    expect(text).toMatch(/IFCCOLUMN\(/);
    expect(text).toMatch(/IFCBEAM\(/);
    expect((text.match(/IFCREINFORCINGBAR\(/g) ?? []).length).toBeGreaterThan(10);
    expect(text).toContain("'Stabileo_Design'");

    const [csv] = await Promise.all([page.waitForEvent('download'), panel.getByTestId('exchange-csv').click()]);
    // The file opens with the results' provenance as `#` comment lines, then the table.
    const lines = readFileSync(await csv.path(), 'utf8').trim().split('\n');
    expect(lines[0]).toMatch(/^# /);
    const rows = lines.filter((l) => !l.startsWith('#'));
    expect(rows[0]).toContain('member');
    expect(rows.length).toBeGreaterThan(8);

    const [xlsx] = await Promise.all([page.waitForEvent('download'), panel.getByTestId('exchange-xlsx').click()]);
    expect(xlsx.suggestedFilename()).toMatch(/\.(xlsx|zip)$/);

    // The exported file comes back in through the importer as the same building.
    await page.locator('input[type=file][accept=".ifc"]').setInputFiles({ name: 'back.ifc', mimeType: 'application/octet-stream', buffer: Buffer.from(text) });
    await expect(page.getByTestId('ifc-classes')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('ifc-class-IfcColumn')).toHaveValue('column');
    await expect(page.getByTestId('ifc-class-IfcBeam')).toHaveValue('beam');
    await expect(page.getByTestId('ifc-preview-3d').locator('line')).not.toHaveCount(0);
  });
});
