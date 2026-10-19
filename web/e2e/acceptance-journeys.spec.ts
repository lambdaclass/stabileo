/**
 * Acceptance of the two PRO journeys on one comparable building (two bays of 6 m by one of 5 m,
 * two storeys of 3 m, columns, beams and slabs), driven through the interface:
 *
 *  1. From scratch: grid, building tools, automatic loads, solve, design desk, detailing,
 *     documents (sheets with the bending schedule, memoria, IFC, workbook), a later change,
 *     reopening the project and another language.
 *  2. An existing PRO model: the same building without physical elements or design data, opened
 *     as a project; recognition; then the same path to the same documents.
 *
 * Each step is recorded rather than stopping the run, so one pass says where each journey holds
 * and where it breaks. With `AUDIT_OUT` the record is written as JSON; with `AUDIT_SHOTS` each step
 * leaves a screenshot. It is an audit instrument: its assertions are the record.
 */
import { test, expect, solveModel, setAppLanguage, openDeskStage, ribbonCmd, leaveDesign, designPlace, generateDetailing } from './fixtures';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 900 }, actionTimeout: 20_000 });
test.setTimeout(900_000);

interface StepRecord { journey: string; step: string; ok: boolean; ms: number; error?: string; data?: unknown }
const record: StepRecord[] = [];

async function step(page: Page, journey: string, name: string, fn: () => Promise<unknown>): Promise<boolean> {
  const t0 = Date.now();
  try {
    const data = await fn();
    record.push({ journey, step: name, ok: true, ms: Date.now() - t0, ...(data !== undefined ? { data } : {}) });
    return true;
  } catch (e) {
    record.push({ journey, step: name, ok: false, ms: Date.now() - t0, error: String((e as Error).message).split('\n').slice(0, 4).join(' | ') });
    return false;
  } finally {
    if (process.env.AUDIT_SHOTS) {
      mkdirSync(process.env.AUDIT_SHOTS, { recursive: true });
      await page.screenshot({ path: `${process.env.AUDIT_SHOTS}/${journey}-${String(record.length).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-')}.png` }).catch(() => {});
    }
  }
}

/** The design desk, on its documents. */
async function deskDocs(page: Page): Promise<void> {
  await designPlace(page, 'documents');
}

const census = (page: Page) => page.evaluate(() => window.__stabileo.modelCensus());
const physical = (page: Page) => page.evaluate(() => {
  const s = window.__stabileo as unknown as { serializeProject(): string };
  const f = JSON.parse(s.serializeProject());
  const groups = (f.snapshot?.groups ?? f.model?.groups ?? f.groups ?? []) as Array<[number, { kind?: string; data?: { kind?: string } }]> | Array<{ kind?: string; data?: { kind?: string } }>;
  const list = (Array.isArray(groups) ? groups : []).map((g) => (Array.isArray(g) ? g[1] : g));
  const out: Record<string, number> = {};
  for (const g of list) if (g?.kind === 'physicalMember') { const k = g.data?.kind ?? '?'; out[k] = (out[k] ?? 0) + 1; }
  return out;
});
const detailingTotals = (page: Page) => page.evaluate(() => {
  const a = (window.__stabileo as unknown as { detailingAssemblies(): Array<{ marks?: Array<{ massKg?: number }> }> }).detailingAssemblies();
  return { assemblies: a.length, rebarKg: Math.round(a.reduce((s, x) => s + (x.marks ?? []).reduce((t, m) => t + (m.massKg ?? 0), 0), 0) * 10) / 10 };
});

/** Grid, frame on both storeys and slabs on both levels, through the building tools. */
async function buildFromScratch(page: Page, j: string): Promise<void> {
  await step(page, j, 'grid', async () => {
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-grid').click();
    await page.getByTestId('grid-bays-x').fill('6; 6');
    await page.getByTestId('grid-generate-x').click();
    await page.getByTestId('grid-bays-y').fill('5');
    await page.getByTestId('grid-generate-y').click();
    await page.getByTestId('grid-heights').fill('3; 3');
    await page.getByTestId('grid-generate-levels').click();
    await page.getByTestId('grid-open-building').click();
  });
  await step(page, j, 'frame defaults', async () => {
    const sel = page.getByTestId('grid-col-section').locator('xpath=ancestor::div[1]').locator('select');
    const pick = (l: import('@playwright/test').Locator) => l.evaluate((e) => (e as HTMLSelectElement).selectedOptions[0]?.textContent ?? '');
    return {
      material: await pick(page.getByTestId('building-material')),
      column: await pick(sel.nth(0)), beamX: await pick(sel.nth(1)), beamY: await pick(sel.nth(2)),
      columnTypology: await page.getByTestId('building-col-typology').locator('[aria-pressed="true"], .on, .active').first().innerText().catch(() => '?'),
    };
  });
  // The concrete typology proposes the concrete and the starter sections by itself.
  await step(page, j, 'typology proposes concrete', async () => {
    const pick = (l: import('@playwright/test').Locator) => l.evaluate((e) => (e as HTMLSelectElement).selectedOptions[0]?.textContent ?? '');
    const sel = page.getByTestId('grid-col-section').locator('xpath=ancestor::div[1]').locator('select');
    const out = { material: await pick(page.getByTestId('building-material')), column: await pick(sel.nth(0)), beam: await pick(sel.nth(1)),
      beamMaterial: await pick(page.getByTestId('building-beam-material')), mismatch: await page.locator('[data-testid^="building-mismatch-"]').count() };
    expect(out.material).toBe('H-30');
    expect(out.column).toMatch(/30\s*[x×]\s*30/);
    expect(out.beam).toMatch(/20\s*[x×]\s*50/);
    expect(out.mismatch).toBe(0);
    return out;
  });
  await step(page, j, 'frame', async () => {
    await page.getByTestId('grid-frame-create').click();
    await expect(page.getByTestId('building-result')).toBeVisible();
    return census(page);
  });
  await step(page, j, 'slabs', async () => {
    await page.getByTestId('building-place-slabs').click();
    await expect(page.getByTestId('building-result')).toBeVisible();
    return census(page);
  });
  await step(page, j, 'physical elements listed', async () => physical(page));
}

/** Automatic loads with the dialog's defaults. */
async function loads(page: Page, j: string): Promise<void> {
  await step(page, j, 'automatic loads', async () => {
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-loads').click();
    await page.getByTestId('pro-auto-loads-btn').click();
    await page.getByTestId('al-preview-btn').click();
    const outcome = await page.getByTestId('al-apply').isEnabled();
    if (!outcome) throw new Error('apply disabled: ' + (await page.getByTestId('al-preview').innerText().catch(() => '')).slice(0, 400));
    await page.getByTestId('al-apply').click();
    const c = await census(page);
    expect(c.loads).toBeGreaterThan(0);
    return c;
  });
}

/** From a solved model to the documents, all of it in the design desk: design, detail, documents. */
async function designAndDocument(page: Page, j: string): Promise<void> {
  await step(page, j, 'solve', async () => { await solveModel(page); });
  await step(page, j, 'desk design', async () => {
    await openDeskStage(page);
    await page.getByTestId('desk-design').click();
    // The slabs too: frames are the default, a building has floors.
    await page.getByTestId('desk-run-family-slab').check();
    await page.getByTestId('desk-run').click();
    await expect(page.getByTestId('desk-report')).toBeVisible({ timeout: 180_000 });
    const counts = await page.evaluate(() => window.__stabileo.runCounts());
    expect(counts?.verified, 'every member verified').toBe(counts?.total);
    return { report: await page.getByTestId('desk-report').innerText(), counts };
  });
  await step(page, j, 'desk views reachable', async () => {
    const views = await page.locator('[data-testid="desk-rail"] [data-testid^="desk-"], [data-testid="desk-process"] [data-testid^="desk-"]').evaluateAll((els) => els.map((e) => {
      const r = (e as HTMLElement).getBoundingClientRect();
      return { id: e.getAttribute('data-testid'), visible: r.right <= window.innerWidth && r.bottom <= window.innerHeight && r.width > 0 };
    }));
    expect(views.filter((v) => !v.visible)).toEqual([]);
    return { total: views.length };
  });
  await step(page, j, 'detailing', async () => {
    // Detail what was designed, then read it in the documents (the old «Detail» did both).
    await generateDetailing(page);
    await designPlace(page, 'documents');
    await expect.poll(() => detailingTotals(page).then((x) => x.assemblies), { timeout: 60_000 }).toBeGreaterThan(0);
    const coverage = await page.evaluate(() => {
      const a = (window.__stabileo as unknown as { detailingAssemblies(): Array<{ elementIds: number[] }> }).detailingAssemblies();
      const covered = new Set(a.flatMap((x) => x.elementIds));
      const f = JSON.parse((window.__stabileo as unknown as { serializeProject(): string }).serializeProject());
      const ids = ((f.snapshot?.elements ?? []) as Array<[number, unknown]>).map(([id]) => id);
      return { covered: ids.filter((id) => covered.has(id)).length, elements: ids.length };
    });
    expect(coverage.covered, 'every bar of the frame is detailed').toBe(coverage.elements);
    return { ...(await detailingTotals(page)), ...coverage };
  });
  await step(page, j, 'sheets with bending schedule', async () => {
    await expect(page.getByTestId('desk-step-document')).toHaveAttribute('data-open', 'true');
    const desk = page.getByTestId('design-desk');
    await desk.getByTestId('sheets-build').click();
    const list = desk.getByTestId('sheets-list');
    await expect(list).toContainText(/bending schedule|Planilla de doblado/i);
    const text = await list.innerText();
    expect(text, 'beam elevations on the sheets').toMatch(/elevation|alzado|Vigas|Beams/i);
    const [pdf] = await Promise.all([page.waitForEvent('download'), desk.getByTestId('sheets-pdf').click()]);
    const bytes = readFileSync(await pdf.path());
    return { sheets: await desk.getByTestId('sheets-count').innerText(), pdf: bytes.subarray(0, 5).toString(), list: text.split('\n').slice(0, 60) };
  });
  await step(page, j, 'memoria', async () => {
    await page.getByTestId('design-desk').getByTestId('memoria-open').first().click();
    const count = await page.getByTestId('memoria-count').innerText();
    await page.getByTestId('memoria-close').click();
    return count;
  });
  await step(page, j, 'IFC and workbook', async () => {
    const panel = page.getByTestId('design-desk').getByTestId('exchange-panel').first();
    const [ifc] = await Promise.all([page.waitForEvent('download'), panel.getByTestId('exchange-ifc').click()]);
    const text = readFileSync(await ifc.path(), 'utf8');
    const [xlsx] = await Promise.all([page.waitForEvent('download'), panel.getByTestId('exchange-xlsx').click()]);
    return { ifcColumns: (text.match(/IFCCOLUMN\(/g) ?? []).length, ifcBeams: (text.match(/IFCBEAM\(/g) ?? []).length, ifcSlabs: (text.match(/IFCSLAB\(/g) ?? []).length, outdatedBars: (text.match(/OUTDATED/g) ?? []).length, xlsx: xlsx.suggestedFilename() };
  });
  await step(page, j, 'leave desk', async () => { await leaveDesign(page); });
}

test.describe('@slow acceptance of the two journeys', () => {
  test('journey 1: a building from scratch, changed, reopened, in another language', async ({ pro: page }) => {
    const j = 'J1';
    await buildFromScratch(page, j);
    await loads(page, j);
    await designAndDocument(page, j);
    // A later change: the beams' section goes from 20 × 50 to 20 × 60.
    await step(page, j, 'later change', async () => {
      const sid = await page.evaluate(() => {
        const f = JSON.parse((window.__stabileo as unknown as { serializeProject(): string }).serializeProject());
        const secs = (f.snapshot?.sections ?? f.model?.sections ?? []) as Array<[number, { name: string }]>;
        return secs.find(([, x]) => /20\s*[x×]\s*50/.test(x.name))?.[0] ?? null;
      });
      if (sid == null) throw new Error('beam section not found');
      const before = await detailingTotals(page);
      await page.evaluate((id) => window.__stabileoActions.updateSection(id, { name: 'R 20x60', b: 0.2, h: 0.6, a: 0.12, iz: 0.2 * 0.6 ** 3 / 12, iy: 0.6 * 0.2 ** 3 / 12 }), sid);
      await deskDocs(page);
      const desk = page.getByTestId('design-desk');
      // The bars stay (they are the person's), and every output built from them says it is out of date.
      await expect(desk.getByTestId('documents-outdated')).toBeVisible();
      await expect(desk.getByTestId('sheets-detailing-outdated')).toBeVisible();
      return { detailingBefore: before, detailingAfter: await detailingTotals(page), deskSaysSolve: /solve|calcul/i.test(await desk.innerText()) };
    });
    await step(page, j, 'after the change: solve, design and detail again', async () => {
      await leaveDesign(page);
      await solveModel(page);
      await openDeskStage(page);
      await page.getByTestId('desk-design').click();
      await page.getByTestId('desk-run').click();
      await expect(page.getByTestId('desk-report')).toBeVisible({ timeout: 180_000 });
      const report = await page.getByTestId('desk-report').innerText();
      await generateDetailing(page);
      await designPlace(page, 'documents');
      await expect(page.getByTestId('design-desk').getByTestId('documents-outdated')).toHaveCount(0);
      const counts = await page.evaluate(() => window.__stabileo.runCounts());
      await leaveDesign(page);
      return { report: report.slice(0, 500), counts, detailing: await detailingTotals(page) };
    });
    await step(page, j, 'reopen', async () => {
      const file = await page.evaluate(() => JSON.parse((window.__stabileo as unknown as { serializeProject(): string }).serializeProject()));
      const before = { physical: await physical(page), census: await census(page), detailing: await detailingTotals(page) };
      const ok = await page.evaluate((f) => window.__stabileoActions.loadProject(f), file);
      const after = { physical: await physical(page), census: await census(page), detailing: await detailingTotals(page) };
      expect(after).toEqual(before);
      return { ok, before, after };
    });
    await step(page, j, 'documents after reopening', async () => {
      await deskDocs(page);
      const desk = page.getByTestId('design-desk');
      await expect(desk.getByTestId('recheck-notice')).toBeVisible();
      await desk.getByTestId('memoria-open').first().click();
      const beforeSolve = await page.getByTestId('memoria-count').innerText();
      await page.getByTestId('memoria-close').click();
      await desk.getByTestId('recheck-run').click();
      await expect(desk.getByTestId('recheck-notice')).toHaveCount(0, { timeout: 60_000 });
      await desk.getByTestId('memoria-open').first().click();
      const afterSolve = await page.getByTestId('memoria-count').innerText();
      await page.getByTestId('memoria-close').click();
      await expect(desk.getByTestId('documents-outdated')).toHaveCount(0);
      return { beforeSolve, afterSolve, detailing: await detailingTotals(page) };
    });
    await step(page, j, 'other language', async () => {
      await leaveDesign(page);
      await setAppLanguage(page, 'pt');
      await deskDocs(page);
      const desk = page.getByTestId('design-desk');
      const text = await desk.innerText();
      expect(text).toMatch(/Mesa de projeto/);
      await desk.getByTestId('sheets-build').click();
      const sheetsPt = await desk.getByTestId('sheets-list').innerText();
      await leaveDesign(page);
      await setAppLanguage(page, 'es');
      await deskDocs(page);
      await page.getByTestId('design-desk').getByTestId('sheets-build').click();
      const sheetsEs = await page.getByTestId('design-desk').getByTestId('sheets-list').innerText();
      await leaveDesign(page);
      return { desk: text.slice(0, 300), sheetsPt: sheetsPt.slice(0, 300), sheetsEs: sheetsEs.slice(0, 300) };
    });
    if (process.env.AUDIT_OUT) writeFileSync(`${process.env.AUDIT_OUT}-J1.json`, JSON.stringify(record.filter((r) => r.journey === j), null, 2));
  });

  test('journey 2: the same building as an existing PRO model, recognised and designed', async ({ pro: page }) => {
    const j = 'J2';
    await buildFromScratch(page, 'J2-setup');
    await loads(page, 'J2-setup');
    // The same model without physical elements or design data: a PRO model made with bars and shells.
    await step(page, j, 'open as existing model', async () => {
      const file = await page.evaluate(() => JSON.parse((window.__stabileo as unknown as { serializeProject(): string }).serializeProject()));
      const strip = (o: Record<string, unknown>) => {
        const groups = o.groups as Array<[number, { kind?: string }]> | undefined;
        if (Array.isArray(groups)) o.groups = groups.filter((g) => (Array.isArray(g) ? g[1]?.kind : (g as { kind?: string }).kind) !== 'physicalMember');
        delete o.designData;
        delete o.grid;
      };
      for (const k of ['snapshot', 'model']) if (file[k] && typeof file[k] === 'object') strip(file[k]);
      strip(file);
      const ok = await page.evaluate((f) => window.__stabileoActions.loadProject(f), file);
      return { ok, physical: await physical(page), census: await census(page) };
    });
    await step(page, j, 'desk without axes', async () => {
      await openDeskStage(page);
      const text = await page.getByTestId('design-desk').innerText();
      const levels = await page.locator('[data-testid="design-desk"] select').first().evaluate((e) => [...(e as HTMLSelectElement).options].map((o) => o.textContent)).catch(() => null);
      await leaveDesign(page);
      return { levels, sample: text.slice(0, 400) };
    });
    await step(page, j, 'axes from the model', async () => {
      await page.getByTestId('pr-stage-model').click();
      await page.getByTestId('pr-cmd-grid').click();
      await page.getByTestId('grid-from-model').click();
      return page.locator('[data-testid^="grid-level-"]').count();
    });
    await step(page, j, 'recognise', async () => {
      await page.getByTestId('pr-stage-model').click();
      await ribbonCmd(page, 'physical');
      await page.getByTestId('physical-recognize').click();
      await page.getByTestId('recognition-apply').click();
      await expect(page.getByTestId('physical-table')).toBeVisible();
      return physical(page);
    });
    await designAndDocument(page, j);
    if (process.env.AUDIT_OUT) writeFileSync(`${process.env.AUDIT_OUT}-J2.json`, JSON.stringify(record.filter((r) => r.journey.startsWith('J2')), null, 2));
  });
});
