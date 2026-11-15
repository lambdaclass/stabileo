import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { test, expect, loadModel, solveModel } from './fixtures';

/**
 * The reinforcement drawings exported from the sheets workspace on the seven-storey example: a
 * beam's drawings on A3 as a zip of DXF 2004 sheets (millimetres, the reinforcement layers,
 * DIMENSION entities) and a PDF at A3, then the same beam as a lone PDF on A1.
 */
test.use({ appLocale: 'es' });

const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');
const mediaBoxes = (pdf: string) => [...pdf.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
const pt = (mm: number) => (mm * 72) / 25.4;

test('@slow the sheets export a beam\'s reinforcement drawings to scale as DXF and PDF', async ({ pro: page }) => {
  test.setTimeout(180_000);
  await loadModel(page, 'pro-edificio-7p');
  await solveModel(page);
  await page.getByTestId('pr-stage-analyse').click();
  await page.getByTestId('pr-cmd-rcSheets').click();
  await expect(page.getByTestId('rc-design')).toBeEnabled({ timeout: 60_000 });
  await page.getByTestId('rc-design').click();
  await expect(page.getByTestId('rc-open-beam')).toBeEnabled({ timeout: 60_000 });
  await page.getByTestId('rc-open-beam').click();

  const ws = page.getByTestId('rc-sheets-workspace');
  const beam = ws.getByTestId('rc-row').first();
  const name = (await beam.locator('td').first().textContent())!.trim();
  await beam.click();
  await expect(ws.getByTestId('rc-line-svg')).toBeVisible();

  await ws.getByTestId('rc-plans-export').click();
  const dialog = ws.getByTestId('rc-plans-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('rc-plans-scope-current')).toBeChecked();
  await expect(dialog).toContainText(name.replace(/P$/, ''));
  await expect(dialog.getByTestId('rc-plans-format')).toHaveValue('A3');
  await expect(dialog.getByTestId('rc-plans-scale-elevation')).toHaveValue('20');
  await expect(dialog.getByTestId('rc-plans-scale-plan')).toHaveValue('50');
  await dialog.getByTestId('rc-plans-licence').fill('MP 1234');

  const [zip] = await Promise.all([page.waitForEvent('download'), dialog.getByTestId('rc-plans-download').click()]);
  expect(zip.suggestedFilename()).toMatch(/-planos\.zip$/);
  await expect(dialog).toHaveCount(0);
  const files = unzipSync(readFileSync((await zip.path())!));
  const names = Object.keys(files);
  const dxfs = names.filter((n) => n.endsWith('.dxf'));
  expect(dxfs.length).toBeGreaterThan(0);
  expect(names.filter((n) => n.endsWith('.pdf'))).toHaveLength(1);
  const dxf = dxfs.map((n) => latin1(files[n]!)).join('\n');
  expect(dxf).toContain('$ACADVER\r\n1\r\nAC1018');
  expect(dxf).toContain('$INSUNITS\r\n70\r\n4');
  for (const layer of ['ST-HORM', 'ST-COTA', 'ST-TEXTO', 'ST-EJES']) expect(dxf).toContain(`\r\n2\r\n${layer}\r\n`);
  expect(dxf).toMatch(/\r\n2\r\nST-ARM-(SUP|INF)-Ø\d+\r\n/);
  expect(dxf).toMatch(/\r\n2\r\nST-ARM-EST-Ø\d+\r\n/);
  expect(dxf.split('\r\n0\r\nDIMENSION\r\n').length - 1).toBeGreaterThan(5);
  const pdf = latin1(files[names.find((n) => n.endsWith('.pdf'))!]!);
  expect(pdf.startsWith('%PDF-1.4')).toBe(true);
  const boxes = mediaBoxes(pdf);
  expect(boxes).toHaveLength(dxfs.length);
  for (const [w, h] of boxes) { expect(w).toBeCloseTo(pt(420), 1); expect(h).toBeCloseTo(pt(297), 1); }
  expect(pdf).toContain('MP 1234');
  expect(pdf).toContain(`(${name.replace(/P$/, '')}`);

  await ws.getByTestId('rc-plans-export').click();
  await dialog.getByTestId('rc-plans-format').selectOption('A1');
  await dialog.getByTestId('rc-plans-dxf').uncheck();
  const [lone] = await Promise.all([page.waitForEvent('download'), dialog.getByTestId('rc-plans-download').click()]);
  expect(lone.suggestedFilename()).toMatch(/-planos\.pdf$/);
  const a1 = latin1(readFileSync((await lone.path())!));
  for (const [w, h] of mediaBoxes(a1)) { expect(w).toBeCloseTo(pt(841), 1); expect(h).toBeCloseTo(pt(594), 1); }
});
