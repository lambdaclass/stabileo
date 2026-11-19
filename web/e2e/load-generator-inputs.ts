import type { Page } from '@playwright/test';
import { alSection, designPlace, expect, loadModel } from './fixtures';
import type { DedalFile } from '../src/lib/store/file';

export async function loadSeismicFloor(page: Page): Promise<void> {
  await loadModel(page, 'rc-design-qa-8');
  expect(await page.evaluate(() => {
    const file = JSON.parse(window.__stabileo.serializeProject()) as DedalFile;
    const { snapshot } = file;
    snapshot.quads = [[1, { id: 1, nodes: [5, 6, 8, 7], materialId: 1, thickness: 0.18 }]];
    const gravityCases = new Set(snapshot.loadCases?.filter(c => c.type === 'D' || c.type === 'L').map(c => c.id));
    snapshot.loads = snapshot.loads.filter(l => !gravityCases.has(Number(l.data.caseId)));
    return window.__stabileoActions.loadProject({ ...file });
  })).toBe(true);
}

export async function expectGeneratedSeismicCarriers(page: Page): Promise<void> {
  const cases = await page.evaluate(() => {
    const { snapshot } = JSON.parse(window.__stabileo.serializeProject()) as DedalFile;
    return (snapshot.loadCases ?? []).filter(c => c.type === 'E').map(c => {
      const loads = snapshot.loads.filter(l => l.data.caseId === c.id && l.data.generatedBy);
      return {
        name: c.name,
        types: [...new Set(loads.map(l => l.type))].sort(),
        shells: [...new Set(loads.filter(l => l.type === 'surface3d').map(l => l.data.quadId))],
      };
    });
  });
  expect(cases.length).toBeGreaterThan(0);
  for (const seismicCase of cases) {
    expect(seismicCase.types, seismicCase.name).toEqual(['distributed3d', 'surface3d']);
    expect(seismicCase.shells, seismicCase.name).toEqual([1]);
  }
}

export async function openSeismicLoadGenerator(page: Page): Promise<void> {
  await designPlace(page, 'designData');
  await expect(page.getByTestId('project-regulations')).toBeVisible();
  await page.getByTestId('role-select-seismic').selectOption('inpres103-2018');
  await page.getByTestId('pending-review-in-loads').click();
  await page.getByRole('button', { name: /Auto-generate from code/i }).click();
  await alSection(page, 'seismic');
  await page.getByTestId('al-enable-seismic').check();
}

export async function dwellingFloorLoads(page: Page): Promise<void> {
  const active = page.locator('[data-testid^="al-nav-"][aria-current="page"]');
  await expect(active).toHaveCount(1);
  const section = (await active.getAttribute('data-testid'))!;
  await alSection(page, 'live');
  await page.getByTestId('al-occupancy').selectOption('vivienda');
  await alSection(page, 'roof');
  await page.getByTestId('al-roof').uncheck();
  await page.getByTestId(section).click();
}

export async function expectLoadGenerationRefusal(page: Page, reason: RegExp, issue?: number): Promise<void> {
  const snapshot = () => page.evaluate(() => {
    const s = JSON.parse(window.__stabileo.serializeProject()).snapshot;
    return { loads: s.loads, cases: s.loadCases, combinations: s.combinations, loadBasis: s.designData?.loadBasis };
  });
  const before = await snapshot();
  expect(before.loads.length).toBeGreaterThan(0);
  expect(before.cases.length).toBeGreaterThan(0);
  expect(before.combinations.length).toBeGreaterThan(0);
  await page.getByTestId('al-preview-btn').click();
  await expect(page.getByTestId('al-blocked')).toBeVisible();
  await expect(page.getByTestId('al-preview')).toContainText(reason);
  await expect(page.getByTestId('al-preview')).not.toContainText(/loadPlan\.blocked\./);
  if (issue !== undefined) {
    await expect(page.getByTestId('al-preview').getByRole('link', { name: '#' + issue, exact: true }))
      .toHaveAttribute('href', 'https://github.com/lambdaclass/stabileo/issues/' + issue);
  }
  await expect(page.getByTestId('al-apply')).toBeDisabled();
  await expect(page.getByTestId('al-delta')).toHaveCount(0);
  expect(await snapshot()).toEqual(before);
  await page.getByTestId('al-back').click();
  expect(await snapshot()).toEqual(before);
}
