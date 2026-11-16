import { test, expect } from './fixtures';

test('known wrong result: #1986 @smoke changing global axes preserves a transform centre', async ({ pro: page }) => {
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

test('known wrong result: #1986 @smoke an existing offset can switch coordinate frames in both directions', async ({ pro: page }) => {
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

for (const [label, width, height] of [['phone', 390, 844], ['tablet', 768, 1024]] as const) {
  test(`known wrong result: #2090 @smoke the landing figure controls are readable and tappable on ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const { bootLanding } = await import('./landing-helpers');
    await bootLanding(page);
    const figure = page.locator('.landing .hero-figure');
    await expect(figure.locator('svg')).toBeVisible();
    const box = (await figure.boundingBox())!;
    expect(box.y + 100).toBeLessThan(height);
    const sticky = page.locator('.landing .mobile-sticky');
    const footer = await sticky.isVisible() ? (await sticky.boundingBox())!.height : 0;
    expect(box.y + box.height).toBeLessThanOrEqual(height - footer);
    const size = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, view: innerWidth }));
    expect(size.page).toBeLessThanOrEqual(size.view);
    for (const button of await figure.locator('.hero-fig-switch button').all()) {
      const b = (await button.boundingBox())!;
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    const textSize = await figure.locator('.hero-fig-switch button.on').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(textSize).toBeGreaterThanOrEqual(12);
    await page.screenshot({ path: `../.handoff-assets/bautista-${label}-landing.png` });
  });

  test(`known wrong result: #1986 @smoke the axes picker fits and the viewer remains available on ${label}`, async ({ pro: page }) => {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.__stabileoActions.openProTab('nodes'));
    const triad = (await page.getByTestId('axes-open-3d').boundingBox())!;
    expect(triad.y + triad.height).toBeLessThanOrEqual(height);
    await page.mouse.click(triad.x + triad.width / 2, triad.y + triad.height / 2);
    const picker = page.getByTestId('axes-picker');
    const box = (await picker.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    await expect(picker.getByTestId('axes-done')).toBeVisible();
    for (const button of await picker.locator('.ax-opt, .ax-chip, .ax-btn').all()) {
      const target = (await button.boundingBox())!;
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: `../.handoff-assets/bautista-${label}-axes.png` });
    await picker.getByTestId('axes-done').click();
    await expect(page.locator('canvas:not(.axis-gizmo)').first()).toBeVisible();
  });
}

for (const dirMode of ['global', 'projected']) for (const change of ['hand', 'right', 'up']) {
  test(`known wrong result: #2259 @smoke changing ${change} clears a drafted ${dirMode} shell load`, async ({ pro: page }) => {
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-loads').click();
    await page.getByTestId('write-load').click();
    await page.getByTestId('wl-kind').selectOption('surface');
    await page.getByTestId('wl-sl-dir').selectOption(dirMode);
    await page.getByTestId('wl-sl-axis').selectOption('X');
    await page.getByTestId('wl-sq').fill('7');
    const triad = (await page.getByTestId('axes-open-3d').boundingBox())!;
    await page.mouse.click(triad.x + triad.width / 2, triad.y + triad.height / 2);
    await page.getByTestId(change === 'hand' ? 'axes-hand-left' : change === 'right' ? 'axes-right--X' : 'axes-up--Y').click();
    await page.getByTestId('axes-done').click();
    await expect(page.getByTestId('wl-sq')).toHaveValue('');
    await page.getByTestId('wl-sq').fill('0');
    await expect(page.getByTestId('wl-sq')).toHaveValue('0');
  });
}

test('known wrong result: #2259 @smoke a solved automatic modal note follows the current axes', async ({ pro: page }) => {
  await page.evaluate(async () => {
    await window.__stabileoActions.loadExample('3d-portal-frame');
    window.__stabileoActions.openProTab('advanced');
  });
  await page.getByTestId('modal-auto').check();
  await page.getByTestId('adv-run-modal').click();
  const note = page.getByTestId('modal-auto-note');
  await expect(note).toBeVisible();
  const before = (await note.textContent())!;
  expect(before).toContain('Y');
  const triad = (await page.getByTestId('axes-open-3d').boundingBox())!;
  await page.mouse.click(triad.x + triad.width / 2, triad.y + triad.height / 2);
  await page.getByTestId('axes-up-+Y').click();
  await page.getByTestId('axes-done').click();
  await expect(note).toHaveText(before.replace(/\bY\b/g, 'Z'));
});

for (const hand of ['right', 'left'] as const) {
  test(`@smoke #2259 the distributed tool stores the reflected ${hand}-handed vertical direction`, async ({ page }) => {
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions);
    await page.evaluate(() => window.__stabileoActions.loadExample('3d-portal-frame'));
    const triad = (await page.getByTestId('axes-open-3d').boundingBox())!;
    await page.mouse.click(triad.x + triad.width / 2, triad.y + triad.height / 2);
    await page.getByTestId('axes-up--Y').click();
    await page.getByTestId(`axes-hand-${hand}`).click();
    await page.getByTestId('axes-done').click();
    await page.getByTestId('rb-cmd-load').click();
    await page.getByRole('button', { name: /Distributed/ }).first().click();
    await page.getByTestId('dist-frame-global').click();
    await page.locator('label.ft-input-group').filter({ hasText: 'qYI:' }).locator('input').fill('7');
    await page.locator('label.ft-input-group').filter({ hasText: 'qYJ:' }).locator('input').fill('11');
    const m = await page.evaluate(() => {
      const e = window.__stabileo.elementEnds(5)!;
      const a = window.__stabileo.nodeScreenPos(e.i)!, b = window.__stabileo.nodeScreenPos(e.j)!;
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    });
    const before = await page.evaluate(() => window.__stabileo.allLoads().length);
    await page.mouse.click(m.x + 4, m.y + 4);
    await expect.poll(() => page.evaluate(() => window.__stabileo.allLoads().length)).toBe(before + 1);
    const last = await page.evaluate(() => window.__stabileo.allLoads().at(-1));
    expect(last).toMatchObject({ type: 'distributed3d', data: { elementId: 5, frame: 'global', qZI: -7, qZJ: -11 } });
  });
}
