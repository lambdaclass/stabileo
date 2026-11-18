import { readFileSync } from 'node:fs';
import { setDesignOption } from './design-options';
import { test, expect, loadModel, solveModel } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * What the reinforcement sheets owe a reader before anything leaves them: a prerequisite said in
 * words, the members they leave out named with why, the shapes in the schedule cut to the length
 * their bends take, each section holding its bars, a flat slab's punching in Spanish from a real
 * solve, and every file exported recorded with the state of the model it came from, so that an
 * edit afterwards says those files no longer match, and nothing is exported from sheets out of date.
 */
test.use({ appLocale: 'es' });

async function openPanel(page: Page) {
  await page.getByTestId('pr-stage-analyse').click();
  await page.getByTestId('pr-cmd-rcSheets').click();
  await expect(page.getByTestId('rc-sheets-panel')).toBeVisible();
}

async function design(page: Page) {
  await page.getByTestId('rc-design').click();
  await expect(page.getByTestId('rc-open-beam')).toBeVisible({ timeout: 30_000 }); // slow-ok: every member and combination is designed before the families show
}

test('@smoke the sheets say what they need before they design, and what they leave out after', async ({ pro: page }) => {
  await loadModel(page, 'rc-design-qa-8');
  await openPanel(page);
  await expect(page.getByTestId('rc-sheets-panel')).toContainText('Calculá el modelo para ver las planillas.');
  await expect(page.getByTestId('rc-design')).toHaveCount(0);

  // The columns given a round section: the sheets lay out rectangles only, and must say so rather than drop them.
  await page.evaluate(() => {
    const snap = JSON.parse(window.__stabileo.serializeProject()).snapshot as { nodes: Array<[number, { z?: number }]>; elements: Array<[number, { nodeI: number; nodeJ: number; sectionId: number }]> };
    const z = new Map(snap.nodes.map(([id, n]) => [id, n.z ?? 0]));
    const column = snap.elements.map(([, e]) => e).find((e) => Math.abs(z.get(e.nodeI)! - z.get(e.nodeJ)!) > 1)!;
    window.__stabileoActions.updateSection(column.sectionId, { shape: 'circular', d: 0.4, b: undefined, h: undefined });
  });
  await solveModel(page);
  await expect(page.getByTestId('rc-design')).toBeVisible();
  await expect(page.getByTestId('rc-sheets-panel')).toContainText('No se dimensiona nada hasta que lo pidas.');
  await expect(page.getByTestId('rc-open-beam')).toHaveCount(0);
  await design(page);

  const left = page.getByTestId('rc-left-out');
  await expect(left).toBeVisible();
  await expect(page.getByTestId('rc-left-out-summary')).toHaveText(/^\d+ elementos? de hormigón no lo?s? dimensionan estas planillas$/);
  await page.getByTestId('rc-left-out-summary').click();
  const rows = left.locator('[data-testid="rc-left-out-row"][data-reason="layout"]');
  expect(await rows.count()).toBeGreaterThan(0);
  for (const text of await rows.allTextContents()) expect(text).toMatch(/^.+ \(.+\): sus barras no forman una columna continua que las planillas puedan armar/);
  await expect(page.getByTestId('rc-open-column')).toBeDisabled();
  await expect(page.getByTestId('rc-limits-note')).toContainText('índice de estabilidad de cada piso');

  await page.getByTestId('rc-open-beam').click();
  await expect(page.getByTestId('rc-sheets-workspace').getByTestId('rc-left-out')).toBeVisible();
});

test('@smoke a flat slab on a column: punching from a real solve, in Spanish', async ({ pro: page }) => {
  const N = 6;
  const nodes: Array<{ id: number; x: number; y: number; z: number }> = [];
  const at = (i: number, j: number) => 1 + i * (N + 1) + j;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) nodes.push({ id: at(i, j), x: -3 + i, y: -3 + j, z: 3 });
  const base = nodes.length + 1;
  nodes.push({ id: base, x: 0, y: 0, z: 0 });
  const quads = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) quads.push({ id: quads.length + 1, nodes: [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)], materialId: 2, thickness: 0.2 });
  const supports = [{ id: 1, nodeId: base, type: 'fixed3d' }];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) if (i === 0 || j === 0 || i === N || j === N) supports.push({ id: supports.length + 1, nodeId: at(i, j), type: 'pinned3d' });
  const loads = nodes.filter((n) => n.z === 3).map((n) => ({ type: 'nodal3d', data: { nodeId: n.id, fx: 0, fy: 0, fz: -12, mx: 0, my: 0, mz: 0, caseId: 1 } }));
  await page.evaluate((json) => window.__stabileoActions.loadModelData(json), {
    name: 'Losa sin vigas', nodes, quads, plates: [], constraints: [], supports, loads,
    materials: [{ id: 2, name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 }],
    sections: [{ id: 2, name: '40×40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' }],
    elements: [{ id: 1, type: 'frame', nodeI: base, nodeJ: at(3, 3), materialId: 2, sectionId: 2 }],
    loadCases: [{ id: 1, type: 'D', name: 'Permanente' }],
    combinations: [{ id: 1, name: '1.4D', factors: [{ caseId: 1, factor: 1.4 }] }],
  } as never);
  await solveModel(page);
  await openPanel(page);
  await design(page);
  await expect(page.getByTestId('rc-open-punching')).toBeEnabled();
  await page.getByTestId('rc-open-punching').click();
  const ws = page.getByTestId('rc-sheets-workspace');
  const table = ws.getByTestId('rc-table-punching');
  await expect(table).toBeVisible();
  await expect(table.locator('thead')).toContainText('Posición');
  await expect(ws.getByTestId('rc-punch-position')).toHaveText(['Columna interior']);
  const row = ws.getByTestId('rc-row').first();
  await expect(row.locator('td.stc')).toHaveText(/^(Verifica|Holgada|No verifica)$/);
  await row.click();
  const checks = ws.getByTestId('rc-checks').first();
  await expect(checks.locator('tbody tr').first().locator('td').first()).toHaveText('Punzonado');
  await expect(checks).toContainText('§22.6');
  await expect(ws.getByTestId('rc-punching-figure')).toHaveAttribute('data-position', 'interior');
  await expect(ws.getByTestId('rc-punching-figure')).toContainText('Columna interior: el perímetro rodea toda la columna');
  await ws.locator('summary', { hasText: 'Paso a paso' }).first().click();
  const body = await ws.locator('.rcw-body').innerText();
  expect(body).not.toMatch(/rcSheets\.|detailing\.|\binterior \(/);
});

test('@smoke the schedule cuts each bent bar to what its bends take, and each section holds its bars', async ({ pro: page }) => {
  await loadModel(page, 'rc-design-qa-8');
  await solveModel(page);
  await openPanel(page);
  await design(page);
  await page.getByTestId('rc-open-beam').click();
  const ws = page.getByTestId('rc-sheets-workspace');

  await ws.getByTestId('rc-row').first().click();
  const section = ws.getByTestId('rc-section').first();
  await expect(section.locator('circle').first()).toBeVisible();
  const inside = await section.evaluate((el) => {
    const svg = el.querySelector('svg')!;
    const outline = [...svg.querySelectorAll('rect, polygon, path')].map((x) => x.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0]!;
    return [...svg.querySelectorAll('circle')].map((c) => { const r = c.getBoundingClientRect(); return r.left >= outline.left - 0.5 && r.right <= outline.right + 0.5 && r.top >= outline.top - 0.5 && r.bottom <= outline.bottom + 0.5; });
  });
  expect(inside.length).toBeGreaterThan(3);
  expect(inside.every(Boolean)).toBe(true);

  await ws.getByTestId('rc-tab-schedule').click();
  const view = ws.getByTestId('rc-schedule-view');
  await view.getByTestId('rc-bbs-view-unified').click();
  const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
  const ties = view.getByTestId('rc-bbs-row').filter({ hasText: 'Estribo cerrado' });
  expect(await ties.count()).toBeGreaterThan(0);
  for (const tie of (await ties.all()).slice(0, 4)) {
    const cells = await tie.locator('td').allTextContents();
    const unit = num(cells[cells.length - 4]!);
    const sides = [...new Set((await tie.getByTestId('rc-bbs-sketch-leg').allTextContents()).map(num))].sort((a, b) => b - a);
    expect(sides.length).toBeGreaterThan(0);
    const perimeter = 2 * (sides[0]! + (sides[1] ?? sides[0]!)) / 100;
    expect(unit, `a closed tie is cut longer than its perimeter by its hooks: ${cells.join(' | ')}`).toBeGreaterThan(perimeter + 0.1);
    const count = num(cells[cells.length - 6]!);
    expect(Math.abs(num(cells[cells.length - 3]!) - unit * count), 'the total length is the cut length times the count, to the rounding of the cut length').toBeLessThanOrEqual(count * 0.005 + 0.01);
  }
});

test('@smoke every file that leaves the sheets is recorded, and says when the model moved on', async ({ pro: page }) => {
  await loadModel(page, 'rc-design-qa-8');
  await solveModel(page);
  await openPanel(page);
  await design(page);
  await expect(page.getByTestId('rc-exports-outdated')).toHaveCount(0);
  await page.getByTestId('rc-open-beam').click();
  const ws = page.getByTestId('rc-sheets-workspace');

  await ws.getByTestId('rc-plans-export').click();
  const dialog = page.getByTestId('rc-plans-dialog');
  await expect(dialog.getByTestId('rc-export-log-empty')).toBeVisible();
  await expect(dialog.getByTestId('rc-plans-stale')).toHaveCount(0);
  await dialog.getByTestId('rc-plans-pdf').uncheck();
  const [dxf] = await Promise.all([page.waitForEvent('download'), dialog.getByTestId('rc-plans-download').click()]);
  expect(dxf.suggestedFilename()).toMatch(/\.(dxf|zip)$/);
  await expect(dialog).toHaveCount(0);

  await ws.getByTestId('rc-tab-schedule').click();
  const view = ws.getByTestId('rc-schedule-view');
  const [abs] = await Promise.all([page.waitForEvent('download'), view.getByTestId('rc-bbs-bvbs').click()]);
  expect(readFileSync((await abs.path())!, 'utf8')).toMatch(/^BF2D@/);
  const records = view.getByTestId('rc-export-record');
  await expect(records).toHaveCount(2);
  await expect(records.nth(0)).toHaveAttribute('data-kind', 'bvbs');
  await expect(records.nth(1)).toHaveAttribute('data-kind', 'rcPlans');
  await expect(records.nth(1)).toContainText(dxf.suggestedFilename());
  for (const r of await records.all()) {
    await expect(r).toHaveAttribute('data-current', 'true');
    await expect(r.getByTestId('rc-export-state')).toHaveText('coincide con el modelo actual');
  }
  await page.keyboard.press('Escape');

  await setDesignOption(page, 'faces');
  await expect(page.getByTestId('rc-stale')).toBeVisible();
  await expect(page.getByTestId('rc-exports-outdated')).toHaveText(/^2 archivos exportados de estas planillas salieron de un estado anterior del modelo/);
  await expect(page.getByTestId('rc-export-workbook')).toBeDisabled();
  await page.getByTestId('rc-open-beam').click();
  await ws.getByTestId('rc-plans-export').click();
  await expect(dialog.getByTestId('rc-plans-stale')).toBeVisible();
  await expect(dialog.getByTestId('rc-plans-download')).toBeDisabled();
  for (const r of await dialog.getByTestId('rc-export-record').all()) {
    await expect(r).toHaveAttribute('data-current', 'false');
    await expect(r.getByTestId('rc-export-state')).toHaveText('exportado de un estado anterior del modelo');
  }
  await page.keyboard.press('Escape');
  await ws.getByTestId('rc-tab-schedule').click();
  await expect(view.getByTestId('rc-bbs-stale')).toBeVisible();
  await expect(view.getByTestId('rc-bbs-bvbs')).toBeDisabled();
  await expect(view.getByTestId('rc-bbs-csv')).toBeDisabled();

  await ws.getByTestId('rc-redesign').click();
  await expect(ws.getByTestId('rc-stale')).toHaveCount(0, { timeout: 30_000 }); // slow-ok: the sheets design every member again
  await expect(view.getByTestId('rc-bbs-bvbs')).toBeEnabled();
  await expect(view.getByTestId('rc-export-record')).toHaveCount(2);
  await expect(view.locator('[data-testid="rc-export-record"][data-current="true"]')).toHaveCount(0);
  const [csv] = await Promise.all([page.waitForEvent('download'), view.getByTestId('rc-bbs-csv').click()]);
  expect(csv.suggestedFilename()).toMatch(/\.csv$/);
  await expect(view.getByTestId('rc-export-record').first()).toHaveAttribute('data-current', 'true');
  await expect(view.getByTestId('rc-export-record').first()).toHaveAttribute('data-kind', 'rcScheduleCsv');
});
