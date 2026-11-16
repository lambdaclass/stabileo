import { test, expect } from './fixtures';

test.skip('known wrong result: #1986 @smoke changing global axes preserves a transform centre', async ({ pro: page }) => {
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-transform').click();
  await page.getByTestId('tp-mode-rotate').click();
  await page.getByTestId('tp-px').fill('2');
  await page.getByTestId('tp-py').fill('3');
  await page.getByTestId('tp-pz').fill('4');
  const triad = (await page.getByTestId('axes-open-3d').boundingBox())!;
  await page.mouse.click(triad.x + triad.width / 2, triad.y + triad.height / 2);
  await page.getByTestId('axes-up-+Y').click();
  await page.getByTestId('axes-done').click();
  await expect(page.getByTestId('tp-px')).toHaveValue('2');
  await expect(page.getByTestId('tp-py')).toHaveValue('4');
  await expect(page.getByTestId('tp-pz')).toHaveValue('-3');
});

test.skip('known wrong result: #1986 @smoke an existing offset can switch coordinate frames in both directions', async ({ pro: page }) => {
  await page.evaluate(async () => {
    await window.__stabileoActions.loadExample('3d-portal-frame');
    const saved = JSON.parse(window.__stabileo.serializeProject());
    saved.snapshot.elements[0][1].offset = { frame: 'local', i: { x: 0.1, y: 0.2, z: 0.3 }, j: { x: 0.1, y: 0.2, z: 0.3 } };
    window.__stabileoActions.loadProject(saved);
    window.__stabileoActions.selectElements([1]);
    window.__stabileoActions.openProTab('specifications');
  });
  await page.getByTestId('spec-section-members').click();
  const editor = page.locator('.mo');
  const frame = editor.locator('select');
  await expect(frame).toHaveValue('local');
  await frame.selectOption('global');
  await frame.press('Tab');
  await expect(frame).toHaveValue('global');
  await editor.locator('button').first().click();
  expect((await page.evaluate(() => window.__stabileo.entityData('element', 1)) as any).offset.frame).toBe('global');
  await frame.selectOption('local');
  await frame.press('Tab');
  await expect(frame).toHaveValue('local');
});
