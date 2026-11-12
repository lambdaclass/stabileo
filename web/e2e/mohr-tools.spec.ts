import { test, expect, loadModel } from './fixtures';

type Page = import('@playwright/test').Page;

const number = async (page: Page, testid: string) => Number((await page.getByTestId(testid).first().textContent())!.replace(/[^0-9.eE+−-]/g, '').replace('−', '-'));
const fieldValue = (page: Page, testid: string) => page.getByTestId(testid).inputValue();

function watchAppChunk(page: Page) {
  const loaded: string[] = [];
  page.on('request', (request) => { if (/\/assets\/App-[^/]*\.js$/.test(new URL(request.url()).pathname)) loaded.push(request.url()); });
  return loaded;
}

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => [...document.querySelectorAll('.landing')].every((l) => l.scrollWidth <= l.clientWidth))).toBe(true);
}

test('@smoke the 2D Mohr tool computes, keeps its state in a link and opens the app with it', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const app = watchAppChunk(page);
  await page.goto('/en/tools/mohr-2d/?e2e=1');
  await expect(page.getByTestId('mohr2d')).toBeVisible();
  expect(await number(page, 'mohr2d-s1')).toBeCloseTo(92.43, 2);
  expect(await number(page, 'mohr2d-s2')).toBeCloseTo(7.57, 2);
  expect(await number(page, 'mohr2d-tmax')).toBeCloseTo(42.43, 2);
  expect(await number(page, 'mohr2d-theta1')).toBeCloseTo(22.5, 2);
  await expect(page.getByTestId('mohr2d-circle')).toHaveAttribute('aria-label', /Mohr circle/);

  await page.getByTestId('mohr2d-sx').fill('100');
  await expect(page.getByTestId('mohr2d-s1')).not.toHaveText('92.43');
  expect(await number(page, 'mohr2d-s1')).toBeCloseTo(60 + Math.hypot(40, 30), 2);
  await page.getByTestId('mohr2d-theta-input').fill('90');
  await expect(page.getByTestId('mohr2d-sxr')).toHaveText('20.00');
  await expect(page.getByTestId('mohr2d-syr')).toHaveText('100.00');
  await expect(page.getByTestId('mohr2d-txyr')).toHaveText('-30.00');
  await page.getByTestId('mohr2d-taudown').check();
  await page.getByTestId('mohr2d-unit').selectOption('kN/cm²');
  await expect(page.getByTestId('mohr2d-circle')).toContainText('kN/cm²');

  await page.getByTestId('mohr-copy-link').click();
  await expect(page.getByTestId('mohr-copy-status')).toHaveText('Link copied');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('/en/tools/mohr-2d/?');
  expect(page.url()).toBe(copied);
  await page.goto(copied);
  await expect(page.getByTestId('mohr2d-sx')).toHaveValue('100');
  await expect(page.getByTestId('mohr2d-theta-input')).toHaveValue('90');
  await expect(page.getByTestId('mohr2d-taudown')).toBeChecked();
  await expect(page.getByTestId('mohr2d-unit')).toHaveValue('kN/cm²');
  expect(app).toEqual([]);

  await page.getByTestId('mohr-open-app').click();
  await expect(page).toHaveURL(/\/app\/basic/);
  const dialog = page.getByTestId('mohr-dialog');
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog).toHaveAttribute('data-kind', 'plane');
  expect(await fieldValue(page, 'mohr2d-sx')).toBe('100');
  expect(await fieldValue(page, 'mohr2d-sy')).toBe('20');
  expect(await fieldValue(page, 'mohr2d-txy')).toBe('30');
  await expect(page.getByTestId('mohr2d-taudown')).toBeChecked();
  await expect(page.getByTestId('mohr2d-unit')).toHaveValue('kN/cm²');
  expect(new URL(page.url()).searchParams.has('mohr')).toBe(false);
  await expect(page.getByTestId('mohr-public-link')).toHaveAttribute('href', /\/en\/tools\/mohr-2d\/\?sx=100&sy=20&txy=30&th=90&u=kncm2&tdown=1$/);
});

test('@smoke a degenerate 2D state draws one point with one label', async ({ page }) => {
  await page.goto('/en/tools/mohr-2d/?sx=40&sy=40&txy=0');
  await expect(page.getByTestId('mohr2d-s1-label')).toHaveCount(1);
  await expect(page.getByTestId('mohr2d-s1-label')).toHaveText('σ₁ = σ₂ = 40.00');
  expect(await page.locator('[data-testid="mohr2d"] svg').evaluateAll((svgs) => svgs.every((s) => !s.outerHTML.includes('NaN')))).toBe(true);
});

test('@smoke the 3D tool solves the presets, picks planes and opens the app with the same tensor', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const app = watchAppChunk(page);
  await page.goto('/en/tools/mohr-3d/?e2e=1');
  await expect(page.getByTestId('mohr3d')).toBeVisible();
  expect(await number(page, 'mohr3d-s1')).toBeCloseTo(92.53, 2);
  expect(await number(page, 'mohr3d-s3')).toBeCloseTo(-37.10, 2);
  expect(await number(page, 'mohr3d-vm')).toBeCloseTo(113.03, 2);

  await page.getByTestId('mohr3d-preset').selectOption('shear');
  await expect(page.getByTestId('mohr3d-s1')).toHaveText('50.00');
  await expect(page.getByTestId('mohr3d-s2')).toHaveText('0.00');
  await expect(page.getByTestId('mohr3d-s3')).toHaveText('-50.00');
  await page.getByTestId('mohr3d-face-x').click();
  await expect(page.getByTestId('mohr3d-n')).toHaveText('(1.000; 0.000; 0.000)');
  await expect(page.getByTestId('mohr3d-sn')).toHaveText('0.00');
  await expect(page.getByTestId('mohr3d-tn')).toHaveText('50.00');

  await page.getByTestId('mohr3d-preset').selectOption('hydrostatic');
  await expect(page.getByTestId('mohr3d-principal-label')).toHaveCount(1);
  await expect(page.getByTestId('mohr3d-principal-label')).toHaveText('σ₁ = σ₂ = σ₃ = -60.00');
  await page.getByTestId('mohr3d-preset').selectOption('general');
  await page.getByTestId('mohr3d-octahedral').click();
  await expect(page.getByTestId('mohr3d-n')).toHaveText('(0.577; 0.577; 0.577)');
  expect(await number(page, 'mohr3d-sn')).toBeCloseTo(46.67, 2);

  const sphere = page.getByTestId('mohr3d-sphere');
  const box = (await sphere.boundingBox())!;
  const before = await page.getByTestId('mohr3d-n').textContent();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * (245 / 520));
  await expect(page.getByTestId('mohr3d-n')).not.toHaveText(before!);

  await page.getByTestId('mohr3d-xy').fill('12.5');
  await page.getByTestId('mohr-copy-link').click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  await page.goto(copied);
  await expect(page.getByTestId('mohr3d-xy')).toHaveValue('12.5');
  await expect(page.getByTestId('mohr3d-xx')).toHaveValue('80');
  const n = await page.getByTestId('mohr3d-n').textContent();
  expect(app).toEqual([]);

  await page.getByTestId('mohr-open-app').click();
  const dialog = page.getByTestId('mohr-dialog');
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog).toHaveAttribute('data-kind', 'space');
  expect(await fieldValue(page, 'mohr3d-xy')).toBe('12.5');
  expect(await fieldValue(page, 'mohr3d-zz')).toBe('-30');
  await expect(page.getByTestId('mohr3d-n')).toHaveText(n!);
  await page.getByTestId('mohr-mode-plane').click();
  await expect(dialog).toHaveAttribute('data-kind', 'plane');
  await page.getByTestId('mohr-close').click();
  await expect(dialog).toHaveCount(0);
});

const centre = async (page: Page, testid: string) => {
  const b = (await page.getByTestId(testid).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

test('@smoke dragging X′ around the circle, turning the element and tapping a principal point all set θ', async ({ page }) => {
  await page.goto('/en/tools/mohr-2d/');
  await expect(page.getByTestId('mohr2d')).toBeVisible();
  await expect(page.getByTestId('mohr2d-sxr')).toHaveText('80.00');

  const from = await centre(page, 'mohr2d-drag-x');
  const to = await centre(page, 'mohr2d-go-tmax');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, Math.min(from.y, to.y) - 10, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  expect(Number(await fieldValue(page, 'mohr2d-theta-input'))).toBeCloseTo(-22.5, 0);
  expect(await number(page, 'mohr2d-txyr')).toBeCloseTo(42.43, 1);
  expect(await number(page, 'mohr2d-sxr')).toBeCloseTo(50, 1);
  await expect(page.getByTestId('mohr2d-drag-x')).toHaveAttribute('aria-valuenow', /^-22\.5/);

  await page.getByTestId('mohr2d-go-p1').click();
  await expect(page.getByTestId('mohr2d-theta-input')).toHaveValue('22.5');
  await expect(page.getByTestId('mohr2d-sxr')).toHaveText('92.43');
  await expect(page.getByTestId('mohr2d-txyr')).toHaveText('0.00');
  await expect(page.getByTestId('mohr2d-to-principal')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('mohr2d-to-origin').click();
  await expect(page.getByTestId('mohr2d-theta-input')).toHaveValue('0');
  const element = (await page.getByTestId('mohr2d-element').boundingBox())!;
  const c = { x: element.x + element.width / 2, y: element.y + element.height / 2 };
  const knob = await centre(page, 'mohr2d-element-knob');
  const r = Math.hypot(knob.x - c.x, knob.y - c.y);
  const start = Math.atan2(-(knob.y - c.y), knob.x - c.x);
  await page.mouse.move(knob.x, knob.y);
  await page.mouse.down();
  for (let k = 1; k <= 9; k++) {
    const a = start + (k / 9) * (Math.PI / 2);
    await page.mouse.move(c.x + r * Math.cos(a), c.y - r * Math.sin(a));
  }
  await page.mouse.up();
  expect(Number(await fieldValue(page, 'mohr2d-theta-input'))).toBeCloseTo(90, 0);
  await expect(page.getByTestId('mohr2d-sxr')).toHaveText('20.00');
  await expect(page.getByTestId('mohr2d-syr')).toHaveText('80.00');
  await expect(page.getByTestId('mohr2d-txyr')).toHaveText('-30.00');

  await page.getByTestId('mohr2d-drag-x').focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('mohr2d-theta-input')).toHaveValue('0.5');
});

test('@smoke the 3D circles cut along a principal plane and a plane of maximum shear, and the cube draws the cut', async ({ page }) => {
  await page.goto('/en/tools/mohr-3d/');
  await expect(page.getByTestId('mohr3d')).toBeVisible();
  await expect(page.getByTestId('mohr3d-cut')).toHaveAttribute('points', /\d/);
  const before = await page.getByTestId('mohr3d-cut').getAttribute('points');

  await page.getByTestId('mohr3d-go-s1').click();
  await expect(page.getByTestId('mohr3d-sn')).toHaveText('92.53');
  await expect(page.getByTestId('mohr3d-tn')).toHaveText('0.00');
  await expect(page.getByTestId('mohr3d-cut')).not.toHaveAttribute('points', before!);

  await page.getByTestId('mohr3d-go-tmax').click();
  await expect(page.getByTestId('mohr3d-tn')).toHaveText('64.81');
  expect(await number(page, 'mohr3d-sn')).toBeCloseTo((92.53 - 37.10) / 2, 1);

  await page.getByTestId('mohr3d-preset').selectOption('hydrostatic');
  await expect(page.getByTestId('mohr3d-tn')).toHaveText('0.00');
  expect(await page.locator('[data-testid="mohr3d"] svg').evaluateAll((svgs) => svgs.every((s) => !s.outerHTML.includes('NaN')))).toBe(true);
});

for (const id of ['mohr-2d', 'mohr-3d']) {
  test(`@smoke ${id} fits a 360 × 640 phone`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto(`/en/tools/${id}/`);
    await expect(page.getByTestId(id === 'mohr-2d' ? 'mohr2d' : 'mohr3d')).toBeVisible();
    await noHorizontalScroll(page);
  });
}

test('@smoke the tools index lists both Mohr tools', async ({ page }) => {
  await page.goto('/es/tools/');
  await expect(page.locator('.tool-card').filter({ hasText: 'Círculo de Mohr 2D' })).toHaveCount(1);
  await expect(page.locator('.tool-card').filter({ hasText: 'Estado tensional 3D y círculos de Mohr' })).toHaveCount(1);
});

test('@smoke the advanced list opens the Mohr function, and the section analysis opens it on the picked fibre', async ({ page }) => {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => window.__stabileo?.solverReady() ?? false), { timeout: 30_000 }).toBe(true);
  await loadModel(page, 'simply-supported');
  await page.getByRole('button', { name: 'Solve', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__stabileo.hasResults?.() ?? true), { timeout: 30_000 }).toBeTruthy();
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();

  await page.getByTestId('adv-mohr').click();
  const dialog = page.getByTestId('mohr-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('mohr-from-model')).toHaveCount(0);
  await page.getByTestId('mohr-close').click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole('button', { name: /^Section analysis$/i }).click();
  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  const panel = page.locator('.ssp-panel');
  for (const [fx, fy] of [[0.45, 0.5], [0.4, 0.45], [0.5, 0.55], [0.35, 0.5], [0.55, 0.5], [0.45, 0.4]]) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    if (await panel.isVisible().catch(() => false)) break;
    await page.waitForTimeout(300);
  }
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('stress-open-mohr')).toBeVisible();
  await page.getByTestId('stress-open-mohr').click();
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('mohr-from-model')).toBeVisible();
  expect(await fieldValue(page, 'mohr2d-sy')).toBe('0');
  const sx = Number(await fieldValue(page, 'mohr2d-sx'));
  const txy = Number(await fieldValue(page, 'mohr2d-txy'));
  expect(Number.isFinite(sx) && Number.isFinite(txy)).toBe(true);
  expect(Math.abs(sx) + Math.abs(txy)).toBeGreaterThan(0);
  const s1 = await number(page, 'mohr2d-s1');
  expect(s1).toBeCloseTo(sx / 2 + Math.hypot(sx / 2, txy), 1);
  await page.getByTestId('mohr-close').click();
  await page.locator('.ssp-section-toggle', { hasText: "Mohr's Circle" }).click();
  const panelS1 = Number((await page.locator('.ssp-mohr-val').first().textContent())!.replace(/[^0-9.eE+−-]/g, '').replace('−', '-'));
  expect(Math.abs(panelS1 - s1)).toBeLessThanOrEqual(Math.max(0.011, Math.abs(s1) * 0.01));
});
