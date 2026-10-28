import { test, expect } from './fixtures';
import { buildDxf, dxfCircle, dxfLine, dxfText } from '../src/lib/cad/__tests__/dxf-fixture';

test.use({ viewport: { width: 1440, height: 900 } });

/*
 * One DXF with two plans side by side (cm): each one's frame on VIGAS, columns as circles on
 * PILARES, a label on TEXTOS. Offered as two regions, laid at two levels by their lower-left
 * corners, one converted into members at its level; saved and opened, the templates are back.
 */
const plan = (x0: number) => [
  dxfLine('VIGAS', x0, 0, x0 + 600, 0), dxfLine('VIGAS', x0 + 600, 0, x0 + 600, 500),
  dxfLine('VIGAS', x0 + 600, 500, x0, 500), dxfLine('VIGAS', x0, 500, x0, 0),
  dxfCircle('PILARES', x0, 0, 15), dxfCircle('PILARES', x0 + 600, 0, 15), dxfCircle('PILARES', x0 + 600, 500, 15), dxfCircle('PILARES', x0, 500, 15),
  dxfText('TEXTOS', x0 + 300, 250, 'ESTAR'),
];
const DXF = buildDxf({ insunits: 5, layers: ['VIGAS', 'PILARES', 'TEXTOS'], entities: [...plan(0), ...plan(1000)].join('\n') });

test('@smoke two plans of one DXF become templates at two levels, and one is converted', async ({ pro: page }) => {
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-grid').click();
  await page.getByTestId('grid-heights').fill('3; 3');
  await page.getByTestId('grid-generate-levels').click();
  await page.getByTestId('underlay-file').setInputFiles({ name: 'dos.dxf', mimeType: 'application/dxf', buffer: Buffer.from(DXF) });
  await expect(page.getByTestId('underlay-setup')).toBeVisible();
  await page.getByTestId('underlay-unit').selectOption('cm');
  // Two regions, each to its own level.
  await expect(page.getByTestId('underlay-regions').locator('tbody tr')).toHaveCount(2);
  await page.getByTestId('underlay-level').selectOption({ label: 'N1' });
  await page.getByTestId('underlay-level-1').selectOption({ label: 'N2' });
  await page.getByTestId('underlay-lay').click();
  await expect(page.getByTestId('underlay-note')).toContainText('2');
  await expect(page.getByTestId('underlay-row-dos · 1')).toBeVisible();
  await expect(page.getByTestId('underlay-row-dos · 2')).toBeVisible();
  expect((await page.evaluate(() => window.__stabileo.modelCensus())).nodes).toBe(0);

  // The second one, converted at its level.
  await page.getByTestId('underlay-open-dos · 2').click();
  await expect(page.getByTestId('underlay-summary-dos · 2')).toContainText('cm');
  await page.getByTestId('underlay-convert-dos · 2').click();
  const dlg = page.getByTestId('underlay-convert-dialog');
  await expect(dlg).toBeVisible();
  await expect(page.getByTestId('convert-plan')).toContainText('4');
  await page.getByTestId('convert-apply').click();
  await expect(page.getByTestId('convert-result')).toBeVisible();
  const census = await page.evaluate(() => window.__stabileo.modelCensus());
  // Four members on its frame and four columns down to the level below.
  expect(census.elements).toBe(8);
  // Applied again, nothing is added.
  await expect(page.getByTestId('convert-apply')).toBeDisabled();

  // Saved and opened: the templates are back with their levels.
  const text = await page.evaluate(() => window.__stabileo.serializeProject());
  await page.evaluate((t) => window.__stabileoActions.loadProject(JSON.parse(t)), text);
  await expect(page.getByTestId('underlay-row-dos · 1')).toBeVisible();
  expect((await page.evaluate(() => window.__stabileo.modelCensus())).elements).toBe(8);
});
