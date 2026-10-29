/**
 * What Básico hands out: the workbook, the CSV, the figures and the calculation report.
 *
 * The drawing and the report's HTML are covered in unit tests (`lib/export/__tests__`,
 * `engine/__tests__/calc-report-content.test.ts`). What those cannot reach is the path from the
 * buttons to a file: that an export asked for before Calcular solves first, that one asked for
 * on a model that cannot be solved still comes out and says why, and that the figure dialog and
 * the report dialog produce what they offer.
 */
import { test, expect } from './fixtures';
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';

type Page = import('@playwright/test').Page;

async function openProject(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
  const panel = page.locator('[data-testid="basic-panel"][data-panel="project"]');
  if (await panel.count() === 0) await page.getByTestId('hdr-project').click();
  await expect(panel).toBeVisible();
}

async function download(page: Page, click: () => Promise<void>): Promise<{ name: string; path: string }> {
  const [d] = await Promise.all([page.waitForEvent('download'), click()]);
  return { name: d.suggestedFilename(), path: (await d.path())! };
}

function sheets(path: string): Record<string, string> {
  const wb = XLSX.read(readFileSync(path));
  return Object.fromEntries(wb.SheetNames.map((n) => [n, XLSX.utils.sheet_to_csv(wb.Sheets[n]!)]));
}

test.describe('Básico exports', () => {
  for (const space of [false, true]) test(`a ${space ? '3D' : '2D'} reaction figure uses the selected case and combination loads`, async ({ page }) => {
    test.setTimeout(120_000);
    await openProject(page);
    await page.evaluate(() => window.__stabileoActions.loadModelData({
      name: 'Reaction export',
      materials: [{ id: 1, name: 'Steel', e: 200000, nu: 0.3, rho: 78.5 }],
      sections: [{ id: 1, name: 'Beam', a: 0.01, iz: 0.0001, iy: 0.0001, j: 0.00001 }],
      nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 4, y: 0, z: 0 }],
      elements: [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }],
      supports: [{ id: 1, nodeId: 1, type: 'fixed' }],
      loads: [
        { type: 'nodal', data: { id: 1, nodeId: 2, fx: 0, fz: -10, my: 0, caseId: 1 } },
        { type: 'nodal', data: { id: 2, nodeId: 2, fx: 0, fz: -30, my: 0, caseId: 2 } },
      ],
      plates: [], quads: [], constraints: [],
      loadCases: [{ id: 1, type: 'D', name: 'Dead' }, { id: 2, type: 'L', name: 'Live' }],
      combinations: [{ id: 1, name: '2D + 3L', factors: [{ caseId: 1, factor: 2 }, { caseId: 2, factor: 3 }] }],
    }));
    await page.getByTestId('rb-cmd-load').click();
    await page.locator('.combos-fold > summary').click();
    await page.getByTestId('load-cases-toggle').check();
    await page.getByTestId('selfweight-toggle').uncheck();
    if (space) await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.evaluate(() => window.__stabileoActions.solve());

    for (const [set, expected, absent] of [
      ['case_1', ['10'], ['30']],
      ['combo_1', ['20', '90'], ['10', '30']],
    ] as const) {
      await page.getByTestId('rb-cmd-momentY').click();
      await page.getByTestId('results-view-bar').locator('select').first().selectOption(set);
      await page.getByTestId('hdr-project').click();
      await page.getByTestId('export-drawings').click();
      await page.getByTestId('view-export-format-svg').click();
      const section = page.getByTestId('view-export-content');
      if (!(await section.getByTestId('view-export-model').isVisible())) await section.locator('summary').click();
      await page.getByTestId('view-export-model').uncheck();
      await page.getByTestId('view-export-reactions').check();
      const file = await download(page, () => page.getByTestId('view-export-download').click());
      const svg = readFileSync(file.path, 'utf8');
      for (const value of expected) expect(svg).toMatch(new RegExp(`(?:>|[^0-9])${value}(?:\\.0+)? kN(?:<|[^·])`));
      if (set === 'case_1') expect([...svg.matchAll(/10(?:\.0+)? kN(?!·)/g)].length).toBeGreaterThanOrEqual(2);
      for (const value of absent) expect(svg).not.toMatch(new RegExp(`(?:>|[^0-9])${value}(?:\\.0+)? kN(?:<|[^·])`));
    }
  });

  test('a workbook asked for before solving solves first; one that cannot solve says why', async ({ page }) => {
    test.setTimeout(120_000);
    await openProject(page);

    // Nothing to solve yet: the workbook still comes out, and its results sheets send the reader
    // to the summary, which carries the reason.
    const results = async (f: 'xlsx' | 'csv') => download(page, async () => { await page.getByTestId('export-results').click(); await page.getByTestId(`results-format-${f}`).click(); await page.getByTestId('results-export-download').click(); });
    let wb = sheets((await results('xlsx')).path);
    const names = Object.keys(wb);
    expect(wb[names[0]!]).toMatch(/could not be solved/i);
    expect(Object.values(wb).join('\n')).toMatch(/fix the error described in the Summary sheet/i);

    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    wb = sheets((await results('xlsx')).path);
    const reactions = Object.entries(wb).find(([n]) => /reaction/i.test(n))?.[1] ?? '';
    // Two fixed bases, with numbers: solved by the export itself.
    expect(reactions.split('\n').filter((l) => /^\d+,/.test(l))).toHaveLength(2);

    const csv = readFileSync((await results('csv')).path, 'utf8');
    expect(csv.split('\n')[0]).toMatch(/^# Stabileo/);
  });

  test('the view dialog makes vector figures of what is chosen, and there is no DXF', async ({ page }) => {
    test.setTimeout(120_000);
    await openProject(page);
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await expect(page.locator('[data-testid="basic-panel"]').getByRole('button', { name: 'DXF', exact: true })).toHaveCount(0);

    await page.getByTestId('export-drawings').click();
    await page.getByTestId('view-export-format-svg').click();
    const dialog = page.getByTestId('view-export-dialog');
    await expect(dialog).toBeVisible();
    await page.getByTestId('view-export-despiece').check();
    await page.getByTestId('view-export-moment').check();
    const svg = await download(page, () => page.getByTestId('view-export-download').click());
    expect(svg.name).toMatch(/\.svg$/);
    const text = readFileSync(svg.path, 'utf8');
    expect(text).toContain('<svg');
    // Drawn, not captured: paths and text, no raster.
    expect(text).toContain('<path');
    expect(text).toMatch(/kN·m/);
    expect(text).not.toContain('<image');
    await expect(dialog).toBeHidden();

    await page.getByTestId('export-drawings').click();
    await page.getByTestId('view-export-format-png').click();
    const png = await download(page, () => page.getByTestId('view-export-download').click());
    expect(png.name).toMatch(/\.png$/);
    expect(readFileSync(png.path).subarray(1, 4).toString()).toBe('PNG');
  });

  test('the report carries the chosen parts: kinematics, free body and diagrams', async ({ page }) => {
    test.setTimeout(120_000);
    await openProject(page);
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await page.getByTestId('export-report').click();
    await expect(page.getByTestId('calc-report-dialog')).toBeVisible();
    // The members' dimensions, asked for in Figures.
    await page.getByTestId('calc-report-figures').locator('summary').click();
    await page.getByTestId('calc-report-lengths').check();
    const [report] = await Promise.all([page.waitForEvent('popup'), page.getByTestId('calc-report-generate').click()]);
    await report.waitForLoadState();
    // The tab opens inside the click and the report arrives once it is built: wait for it.
    await expect(report.locator('h1#sec-kinematics')).toBeVisible({ timeout: 60_000 });
    const lengthTexts = await report.locator('figure.result-fig svg text').evaluateAll((ts) => ts.filter((x) => /^\d+\.\d{2} m$/.test(x.textContent ?? '')).length);
    expect(lengthTexts).toBeGreaterThan(0);
    await expect(report.locator('h1#sec-kinematics')).toBeVisible();
    await expect(report.locator('h1#sec-despiece')).toBeVisible();
    // The model figure, then the loaded structure, the free body, the deformed shape, M, V and N.
    await expect(report.locator('figure.result-fig svg')).toHaveCount(6);
    await expect(report.locator('h1#sec-forces')).toBeVisible();
  });
});
