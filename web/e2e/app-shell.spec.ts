import { test, expect, type Page } from '@playwright/test';
import { loadModel, openBasicProjectPanel } from './fixtures';

async function openBasic(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
}

async function sides(page: Page, panel: string) {
  const p = (await page.locator(panel).boundingBox())!;
  const v = (await page.locator('.viewport-container').boundingBox())!;
  return { panelLeftOfModel: p.x + p.width <= v.x + 1, panelRightOfModel: p.x >= v.x + v.width - 1 };
}

test.describe('@smoke the title bar and the panel side', () => {
  test('Basic: the document commands are in the title bar, the mode beside the ribbon', async ({ page }) => {
    await openBasic(page);
    const header = page.locator('.app-header');
    await expect(header.getByTestId('hdr-project')).toBeVisible();
    await expect(header.getByTestId('rb-save')).toBeVisible();
    await expect(header.getByTestId('tb-undo')).toBeVisible();
    await expect(page.getByTestId('ribbon').getByTestId('rb-quick')).toHaveCount(0);
    await expect(page.getByTestId('workspace-switch').locator('.mode-toggle button')).toHaveCount(3);

    await page.getByTestId('workspace-switch').locator('.pro-mode-btn').click();
    await expect(page.getByTestId('pro-ribbon')).toBeVisible();
    await expect(header.getByTestId('pr-project')).toBeVisible();
  });

  test('the panel opens on the left, moves right and remembers it', async ({ page }) => {
    await page.addInitScript(() => {
      try { if (!sessionStorage.getItem('side-seeded')) { sessionStorage.setItem('side-seeded', '1'); localStorage.removeItem('stabileo-panel-side'); } } catch { /* private */ }
    });
    await openBasic(page);
    await openBasicProjectPanel(page);
    expect((await sides(page, '[data-testid="basic-panel"]')).panelLeftOfModel).toBe(true);

    await page.getByTestId('panel-side').click();
    await expect(page.getByTestId('panel-side')).toHaveAttribute('data-side', 'right');
    expect((await sides(page, '[data-testid="basic-panel"]')).panelRightOfModel).toBe(true);

    await page.reload();
    await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
    await expect(page.getByTestId('panel-side')).toHaveAttribute('data-side', 'right');
  });

  test('PRO: the panel follows the same side, and says how wide it is on that side', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('stabileo-panel-side', 'left'); } catch { /* private */ } });
    await page.goto('/app/pro?e2e=1');
    await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
    expect((await sides(page, '.pro-sidebar')).panelLeftOfModel).toBe(true);
    const width = (await page.locator('.pro-sidebar').boundingBox())!.width;
    const read = (name: string) => page.evaluate((n) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n)), name);
    await expect.poll(() => read('--st-left-panel-w')).toBeCloseTo(width, 0);
    expect(await read('--st-right-panel-w')).toBe(0);
    await page.getByTestId('panel-side').click();
    expect((await sides(page, '.pro-sidebar')).panelRightOfModel).toBe(true);
    await expect.poll(() => read('--st-right-panel-w')).toBeCloseTo(width, 0);
    expect(await read('--st-left-panel-w')).toBe(0);
  });

  test('Basic opens on Model data › Nodes, as wide as PRO\'s panel, and stays closed once closed', async ({ page }) => {
    await page.addInitScript(() => {
      try { if (!sessionStorage.getItem('open-seeded')) { sessionStorage.setItem('open-seeded', '1'); localStorage.removeItem('stabileo-panel-open'); localStorage.removeItem('stabileo-panel-width'); } } catch { /* private */ }
    });
    await openBasic(page);
    const panel = page.getByTestId('basic-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('dt-tab-nodes')).toHaveClass(/active/);
    const basicWidth = (await panel.boundingBox())!.width;

    await page.getByTestId('ws-pro').click();
    await expect(page.locator('.pro-sidebar')).toBeVisible();
    expect((await page.locator('.pro-sidebar').boundingBox())!.width).toBeCloseTo(basicWidth, 0);
    await expect(page.getByTestId('pro-panel-title')).toHaveText(/nodes/i);

    await page.getByTestId('ws-plane').click();
    await panel.locator('.bp-close').click();
    await expect(panel).toHaveCount(0);
    await page.reload();
    await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
    await expect(page.getByTestId('basic-panel')).toHaveCount(0);
  });

  for (const width of [1440, 1100]) {
    test(`at ${width} px the model starts at the same height in Basic and in Professional`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openBasic(page);
      const top = async () => Math.round((await page.locator('.viewport-container').boundingBox())!.y);
      await expect(page.getByTestId('tool-options-bar')).toBeVisible();
      const basic = await top();
      await page.getByTestId('ws-pro').click();
      await expect(page.getByTestId('pro-ribbon')).toBeVisible();
      expect(await top()).toBe(basic);
    });
  }

  test('File › New project opens a tab', async ({ page }) => {
    await openBasic(page);
    const tabs = page.locator('.tab-bar .tab');
    const before = await tabs.count();
    await page.getByTestId('tb-file').click();
    await page.getByTestId('tb-file-menu').getByRole('menuitem').first().click();
    await expect(tabs).toHaveCount(before + 1);
  });

  test('the history scrubber walks back to the start and forward again', async ({ page }) => {
    await openBasic(page);
    await loadModel(page, 'two-story-frame');
    const nodes = await page.evaluate(() => window.__stabileo.nodeCount());
    await page.getByTestId('rb-cmd-node').click();
    const canvas = page.locator('.viewport2d-wrapper canvas');
    const box = (await canvas.boundingBox())!;
    await canvas.click({ position: { x: box.width * 0.3, y: box.height * 0.3 } });
    await canvas.click({ position: { x: box.width * 0.6, y: box.height * 0.3 } });
    await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBeGreaterThan(nodes);
    const edited = await page.evaluate(() => window.__stabileo.nodeCount());

    await page.getByTestId('tb-history').click();
    const scrub = page.getByTestId('tb-history-scrub');
    await scrub.fill('0');
    await expect(page.getByTestId('tb-undo')).toBeDisabled();
    await page.getByTestId('tb-history-pop').getByRole('button').last().click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBe(edited);
  });
});

test.describe('@smoke examples and tutorials', () => {
  test('an empty tab offers examples with previews, and one loads from the card', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('stabileo-start-card', 'on'); } catch { /* private */ } });
    await openBasic(page);
    const card = page.getByTestId('start-card');
    await expect(card).toBeVisible();
    await expect(card.locator('[data-testid^="start-example-"]')).toHaveCount(3);
    await expect.poll(() => card.locator('svg[data-preview]:has(path.xp-member)').count()).toBe(3);
    await card.getByTestId('start-example-portal-frame').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBeGreaterThan(0);
    await expect(card).toHaveCount(0);
  });

  test('"Don\'t show at start" is remembered', async ({ page }) => {
    await page.addInitScript(() => {
      try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('stabileo-start-card', 'on'); } } catch { /* private */ }
    });
    await openBasic(page);
    await page.getByTestId('start-off').click();
    await expect(page.getByTestId('start-card')).toHaveCount(0);
    await page.reload();
    await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
    await expect(page.getByTestId('start-card')).toHaveCount(0);
  });

  test('File › Open example opens the gallery with previews, and a 3D example loads', async ({ page }) => {
    await openBasic(page);
    await page.getByTestId('tb-file').click();
    await page.getByTestId('tb-open-example').click();
    const dialog = page.getByTestId('examples-dialog');
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.locator('svg[data-preview] path.xp-member').count()).toBeGreaterThan(10);
    await dialog.getByTestId('ex-group-3d').click();
    await dialog.getByTestId('example-3d-portal-frame').click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBeGreaterThan(0);
  });

  test('File › View tutorials lists every walkthrough and links the YouTube channel', async ({ page }) => {
    await openBasic(page);
    await page.getByTestId('tb-file').click();
    await page.getByTestId('tb-tutorials').click();
    const dialog = page.getByTestId('tutorials-dialog');
    await expect(dialog.locator('[data-testid^="demo-"]')).toHaveCount(8);
    await expect(dialog.getByTestId('tutorials-youtube')).toHaveAttribute('href', 'https://www.youtube.com/@stabileoapp');
    await expect(dialog.getByTestId('tutorials-youtube')).toHaveAttribute('target', '_blank');
  });

  test('Project no longer holds the examples or the tutorials', async ({ page }) => {
    await openBasic(page);
    await openBasicProjectPanel(page);
    const panel = page.getByTestId('basic-panel');
    await expect(panel.getByTestId('ex-group-2d')).toHaveCount(0);
    await expect(panel.getByTestId('demo-menu-toggle')).toHaveCount(0);
  });
});

test.describe('@smoke examples on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Project carries the doors a phone has no title bar for', async ({ page }) => {
    await openBasic(page);
    await page.getByTestId('hdr-project').click();
    await page.getByTestId('lib-open-examples').click();
    await expect(page.getByTestId('examples-dialog')).toBeVisible();
    await page.getByTestId('pp-gallery-close').click();
    await page.getByTestId('lib-open-tutorials').click();
    await expect(page.getByTestId('tutorials-youtube')).toBeVisible();
  });
});

test.describe('@smoke the project’s properties, apart from saving and exporting', () => {
  test('File › Project properties holds the data, the regulations and the templates', async ({ page }) => {
    await page.goto('/app/pro?e2e=1');
    await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
    await page.getByTestId('pr-project').click();
    const panel = page.getByTestId('pro-project-tab');
    await expect(panel.getByTestId('pp-save')).toBeVisible();
    await expect(panel.getByTestId('project-info')).toHaveCount(0);
    await expect(panel.getByTestId('office-templates')).toHaveCount(0);
    await expect(panel.getByTestId('project-regulations')).toHaveCount(0);

    await page.getByTestId('tb-file').click();
    await page.getByTestId('tb-project-settings').click();
    const dialog = page.getByTestId('project-settings');
    await expect(dialog.getByTestId('project-info')).toBeVisible();
    await dialog.getByTestId('pi-job').fill('Nave Norte');
    await dialog.getByTestId('pi-job').blur();
    expect(await page.evaluate(() => (window.__stabileo.entityData('setting', 'projectInfo') as { job?: string })?.job)).toBe('Nave Norte');

    await dialog.getByTestId('ps-page-regulations').click();
    await expect(dialog.getByTestId('project-regulations')).toBeVisible();
    await dialog.getByTestId('ps-page-templates').click();
    await expect(dialog.getByTestId('office-templates')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('a way out of the regulations to the side panel closes the dialog', async ({ page }) => {
    await page.goto('/app/pro?e2e=1');
    await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
    await page.getByTestId('tb-file').click();
    await page.getByTestId('tb-project-settings').click();
    await page.getByTestId('ps-page-regulations').click();
    await page.getByTestId('regs-edit-materials').click();
    await expect(page.getByTestId('project-settings')).toHaveCount(0);
  });
});

test.describe('@smoke reaching us from the title bar', () => {
  test('Discord opens the community, and with sign-in off there is no comment button to fail', async ({ page }) => {
    await openBasic(page);
    await expect(page.getByTestId('report-bug')).toHaveCount(0);
    const discord = page.getByTestId('tb-discord');
    await expect(discord).toBeVisible();
    await expect(discord).toHaveAttribute('href', 'https://discord.gg/Q53rp7FKXA');
    await expect(discord).toHaveAttribute('target', '_blank');
    await expect(page.getByTestId('tb-feedback')).toHaveCount(0);
  });
});

async function hintUnderItsBox(page: Page, testid: string) {
  return page.getByTestId(testid).evaluate((box) => {
    const row = box.closest('label')!, hint = row.nextElementSibling as HTMLElement, panel = row.closest('.cfg')!;
    const r = row.getBoundingClientRect(), h = hint.getBoundingClientRect(), p = panel.getBoundingClientRect();
    return { below: h.top >= r.bottom - 1, wide: h.width > p.width * 0.7, short: h.height < 40 };
  });
}

test.describe('@smoke settings in every mode', () => {
  test('sections in order, and each explanation under its box at full width', async ({ page }) => {
    await openBasic(page);
    await page.getByTestId('rb-settings').click();
    const headings = () => page.locator('.cfg .cfg-heading').allInnerTexts();
    expect((await headings()).map((h) => h.toLowerCase())).toEqual(['view', 'grid', 'model', 'results', 'general']);
    expect(await hintUnderItsBox(page, 'cfg-edu-in-basic')).toEqual({ below: true, wide: true, short: true });

    await page.getByTestId('ws-space').click();
    await expect(page.getByTestId('cfg-grid-extent')).toBeVisible();
    await expect(page.getByTestId('cfg-node-style')).toBeVisible();

    await page.getByTestId('ws-pro').click();
    await page.getByTestId('pro-settings').click();
    expect((await headings()).map((h) => h.toLowerCase())).toEqual(['view', 'grid', 'model', 'results', 'general']);
    for (const id of ['cfg-inline-help', 'cfg-design-in-pro']) {
      expect(await hintUnderItsBox(page, id), id).toEqual({ below: true, wide: true, short: true });
    }
    await page.getByTestId('cfg-live-calc').check();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('liveCalc'))).toBe('true');
  });
});

test.describe('@smoke one tab, three modes', () => {
  const tabs = (page: Page) => page.locator('.tab-bar .tab');
  const members = (page: Page) => page.evaluate(() => window.__stabileo.elementIds().length);

  test('a model goes 2D → 3D → Professional and back down unchanged, with no question', async ({ page }) => {
    await openBasic(page);
    await expect(page.getByTestId('workspace-switch').locator('button')).toHaveCount(3);
    await loadModel(page, 'portal-frame');
    const before = await members(page);

    await page.getByTestId('ws-space').click();
    await expect(tabs(page).first()).toHaveAttribute('data-mode', '3D');
    await page.getByTestId('ws-pro').click();
    await expect(page).toHaveURL(/\/app\/pro/);
    await expect(tabs(page).first()).toHaveAttribute('data-mode', 'PRO');
    expect(await members(page)).toBe(before);

    await page.getByTestId('ws-plane').click();
    await expect(page.getByTestId('pro-to-basic')).toHaveCount(0);
    await expect(page).toHaveURL(/\/app\/basic/);
    await expect(tabs(page).first()).toHaveAttribute('data-mode', '2D');
    expect(await members(page)).toBe(before);
    await expect(tabs(page)).toHaveCount(1);
  });

  test('a Professional model with shells goes to Basic as a copy, and the PRO tab stays', async ({ page }) => {
    await page.goto('/app/pro?e2e=1');
    await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
    await loadModel(page, 'mat-foundation');
    const before = await members(page);

    await page.getByTestId('ws-space').click();
    const dialog = page.getByTestId('pro-to-basic');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('pro-to-basic-drops')).toContainText(/56/);

    await dialog.getByTestId('pro-to-basic-stay').click();
    await expect(dialog).toHaveCount(0);
    await expect(tabs(page)).toHaveCount(1);
    await expect(tabs(page).first()).toHaveAttribute('data-mode', 'PRO');

    await page.getByTestId('ws-space').click();
    await page.getByTestId('pro-to-basic-copy').click();
    await expect(tabs(page)).toHaveCount(2);
    await expect(tabs(page).nth(1)).toHaveAttribute('data-mode', '3D');
    await expect(page).toHaveURL(/\/app\/basic/);
    expect(await members(page)).toBe(before);

    await tabs(page).nth(0).click();
    await expect(tabs(page).nth(0)).toHaveAttribute('data-mode', 'PRO');
    await expect(page).toHaveURL(/\/app\/pro/);
  });
});
