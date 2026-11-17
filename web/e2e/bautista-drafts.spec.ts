import { test, expect, loadModel } from './fixtures';
import type { Page } from '@playwright/test';

async function reverse(page: Page, hand: 'right' | 'left') {
  const triad = (await page.getByTestId('axes-open-3d').boundingBox())!;
  await page.mouse.click(triad.x + triad.width / 2, triad.y + triad.height / 2);
  await page.getByTestId('axes-up--Y').click();
  await page.getByTestId('axes-right--Z').click();
  await page.getByTestId(`axes-hand-${hand}`).click();
  await page.getByTestId('axes-done').click();
}

async function open(page: Page) {
  await loadModel(page, '3d-portal-frame');
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-loads').click();
  await page.getByTestId('write-load').click();
}

const drafts = [
  { kind: 'nodal', fields: { 'wl-fx': '2', 'wl-fy': '-3', 'wl-fz': '5', 'wl-mx': '-7', 'wl-my': '11', 'wl-mz': '13' } },
  { kind: 'displacement', fields: { 'wl-dx': '2', 'wl-dy': '-3', 'wl-dz': '5', 'wl-drx': '-7', 'wl-dry': '11', 'wl-drz': '13' } },
  ...(['global', 'local'] as const).map(frame => ({ kind: 'point', frame, fields: { 'wl-px': '2', 'wl-py': '-3', 'wl-pz': '5', 'wl-pmx': '-7', 'wl-pmy': '11', 'wl-pmz': '13' } })),
  ...(['global', 'projected', 'local'] as const).map(frame => ({ kind: 'distributed', frame, fields: { 'wl-qxi': '2', 'wl-qyi': '-3', 'wl-qzi': '5', 'wl-qyj': '7' } })),
  { kind: 'distributed', frame: 'global', shape: 'triangle', fields: { 'wl-peak': '-5' } },
  { kind: 'distributed', frame: 'global', shape: 'hydrostatic', fields: { 'wl-w1': '-2', 'wl-w2': '-5' } },
  { kind: 'nodal', inclined: true, fields: { 'wl-inc-f': '7', 'wl-inc-from-x': '2', 'wl-inc-from-y': '-3', 'wl-inc-from-z': '5' } },
];

for (const hand of ['right', 'left'] as const) {
  for (const [index, draft] of drafts.entries()) test(`known wrong result: #2259 @smoke draft ${index} preserves physical loads through reversed ${hand} axes`, async ({ pro: page }) => {
    await open(page);

      await page.getByTestId('wl-kind').selectOption(draft.kind);
      if ('frame' in draft) await page.getByTestId(draft.kind === 'point' ? 'wl-pframe' : 'wl-frame').selectOption(draft.frame!);
      if ('shape' in draft) await page.getByTestId('wl-shape').selectOption(draft.shape!);
      if ('inclined' in draft) {
        await page.getByTestId('wl-inclined').check();
        await page.getByTestId('wl-inc-from-kind').selectOption('point');
      }
      if (draft.kind === 'nodal' || draft.kind === 'displacement') await page.evaluate(() => window.__stabileoActions.selectNodes([1]));
      else await page.evaluate(() => window.__stabileoActions.selectElements([1]));
      for (const [field, value] of Object.entries(draft.fields)) await page.getByTestId(field).fill(value);
      const before = await page.evaluate(() => window.__stabileo.allLoads().length);
      await page.getByTestId('wl-add').click();
      await expect(page.getByTestId('wl-done')).toBeVisible();
      const expected = await page.evaluate(n => window.__stabileo.allLoads().slice(n).map(({ type, data: { id, ...data } }) => ({ type, data })), before);
      expect(expected.length).toBeGreaterThan(0);
      await reverse(page, hand);
      const after = await page.evaluate(() => window.__stabileo.allLoads().length);
      await page.getByTestId('wl-add').click();
      const actual = await page.evaluate(n => window.__stabileo.allLoads().slice(n).map(({ type, data: { id, ...data } }) => ({ type, data })), after);
      expect(actual, JSON.stringify(draft)).toEqual(expected);

  });

  test(`known wrong result: #2259 @smoke range targets retain members and reorder bounds under reversed ${hand} axes`, async ({ pro: page }) => {
    await open(page);
    await page.getByTestId('wl-fx').fill('2');
    await page.getByTestId('load-target-by').selectOption('range');
    await page.getByTestId('load-target-axis').selectOption('X');
    await page.getByTestId('load-target-min').fill('-1');
    await page.getByTestId('load-target-max').fill('2');
    const n = await page.evaluate(() => window.__stabileo.allLoads().length);
    await page.getByTestId('wl-add').click();
    await expect(page.getByTestId('wl-done')).toBeVisible();
    const targets = await page.evaluate(n => window.__stabileo.allLoads().slice(n).map(l => l.data.nodeId), n);
    expect(targets.length).toBeGreaterThan(0);
    await reverse(page, hand);
    await expect(page.getByTestId('load-target-axis')).toHaveValue('Z');
    await expect(page.getByTestId('load-target-min')).toHaveValue('-2');
    await expect(page.getByTestId('load-target-max')).toHaveValue('1');
    const m = await page.evaluate(() => window.__stabileo.allLoads().length);
    await page.getByTestId('wl-add').click();
    expect(await page.evaluate(m => window.__stabileo.allLoads().slice(m).map(l => l.data.nodeId), m)).toEqual(targets);
  });
}

for (const hand of ['right', 'left'] as const) {
  test(`known wrong result: #2259 @smoke support ranges retain their target nodes under reversed ${hand} axes`, async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-supports').click();
    await page.getByTestId('write-support').click();
    await page.getByTestId('load-target-by').selectOption('range');
    await page.getByTestId('load-target-axis').selectOption('X');
    await page.getByTestId('load-target-min').fill('-1');
    await page.getByTestId('load-target-max').fill('2');
    const count = await page.getByTestId('load-target-count').textContent();
    await reverse(page, hand);
    await expect(page.getByTestId('load-target-axis')).toHaveValue('Z');
    await expect(page.getByTestId('load-target-min')).toHaveValue('-2');
    await expect(page.getByTestId('load-target-max')).toHaveValue('1');
    await expect(page.getByTestId('load-target-count')).toHaveText(count!);
    await page.getByTestId('sup-preset-pinned').click();
    await page.getByTestId('write-support-card-submit').click();
    const pinned = await page.evaluate(() => (window.__stabileo.entityData('setting', 'supports') as Array<[number, { nodeId: number; type: string }]>).map(([, s]) => s).filter(s => s.type === 'pinned3d').map(s => s.nodeId));
    expect(pinned.sort()).toEqual([1, 3, 5, 7]);
  });
}
