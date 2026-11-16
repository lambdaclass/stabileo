import { test, expect } from '@playwright/test';

const PAGE = '/en/research/mechanics/heyman-1966/';

test('@smoke research masonry arch: the replay ends on the five-hinge least thickness and its mechanism', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  const app = page.locator('.arch-app');
  await expect(app).toHaveAttribute('data-source', 'replay');
  await expect(page.locator('.sfv canvas').first()).toBeVisible();
  await expect(app).toHaveAttribute('data-kind', 'mechanism');
  await expect(app.locator('.summary')).toContainText('0.107451');
  await expect(app.locator('.summary')).toContainText('0.0° extrados, 35.6° intrados, 89.1° extrados, 144.4° intrados, 180.0° extrados');
  await page.getByRole('button', { name: 'Watch the bisection' }).click();
  await expect(app).toHaveAttribute('data-kind', 'bisection');
  await expect(app).toContainText('no thrust line fits');
  await expect(page.locator('table.checks')).toContainText('0.107478');
});

test('@smoke research masonry arch: a live recompute of a flatter arch and of the ring', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  const app = page.locator('.arch-app');
  await page.getByRole('button', { name: 'Try α = 60°' }).click();
  await expect(app).toHaveAttribute('data-source', 'live', { timeout: 30000 }); // slow-ok: the arch WASM worker loads and bisects in the browser.
  await expect(app).toHaveAttribute('data-alpha', '60');
  await expect(app.locator('.summary')).toContainText('0.0228');
  await app.getByRole('button', { name: 'Back to the reference case' }).click();
  await expect(app).toHaveAttribute('data-source', 'replay');
  await page.locator('#rs-tab-load').click();
  await expect(app).toHaveAttribute('data-tab', 'load');
  await expect(app.locator('.summary')).toContainText('3.7441 kN');
  await page.locator('#arch-ring-voussoirs').fill('20');
  await page.locator('#arch-ring-voussoirs').dispatchEvent('change');
  await expect(app).toHaveAttribute('data-source', 'live', { timeout: 30000 }); // slow-ok: the arch WASM worker loads and enumerates every mechanism.
  await expect(app).toHaveAttribute('data-n', '20');
  await expect(app.locator('.summary')).toContainText('3.7497 kN');
  await page.locator('#arch-thickness').fill('0.2');
  await page.locator('#arch-thickness').dispatchEvent('change');
  await expect(app).toContainText('too thin to stand under its own weight');
  await expect(app).toHaveAttribute('data-stale', 'true');
});

test('@smoke research masonry arch: the figure keeps its legend off the model and sits under limit analysis', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  await expect(page.locator('.rs-crumb')).toContainText('Limit analysis and masonry');
  const canvas = page.locator('.arch-app .sfv-canvas');
  await expect(canvas.locator('canvas')).toBeVisible();
  await expect(page.locator('.arch-app .shell-legend')).toHaveCount(0);
  const legend = page.locator('.arch-app ul.legend');
  await expect(legend).toContainText('Line of thrust');
  await expect(legend).toContainText('Hinge, on the face where it forms');
  const [box, key] = [await canvas.boundingBox(), await legend.boundingBox()];
  expect(key!.y).toBeGreaterThanOrEqual(box!.y + box!.height);
});

test('@smoke research masonry arch: tabs, live results and refusals stay with their own case', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  const app = page.locator('.arch-app');
  await page.locator('#rs-tab-load').click();
  await expect(app).toHaveAttribute('data-kind', 'mechanism');
  await expect(app).toHaveAttribute('data-step', '40');
  await page.locator('#rs-tab-weight').click();
  await page.locator('#arch-alpha').fill('160');
  await page.locator('#arch-alpha').dispatchEvent('change');
  await expect(app).toHaveAttribute('data-issue', 'infeasible', { timeout: 30000 }); // slow-ok: the arch WASM worker loads and bisects in the browser.
  await expect(app).toContainText('No thickness up to t/r = 1.99 lets this arch stand');
  await expect(app).toHaveAttribute('data-stale', 'true');
  await page.locator('#rs-tab-load').click();
  await expect(app).toHaveAttribute('data-issue', '');
  await expect(app).toHaveAttribute('data-stale', 'false');
  await expect(app.locator('.result-stale')).toHaveCount(0);
  await page.locator('#arch-ring-voussoirs').fill('7');
  await page.locator('#arch-ring-voussoirs').dispatchEvent('change');
  await expect(app).toHaveAttribute('data-n', '7', { timeout: 30000 }); // slow-ok: the arch WASM worker loads in the browser.
  await page.locator('#arch-thickness').fill('0.6');
  await page.locator('#arch-thickness').dispatchEvent('change');
  await page.locator('#arch-position').fill('0.5');
  await page.locator('#arch-position').dispatchEvent('change');
  await expect(app).toHaveAttribute('data-issue', 'unbounded', { timeout: 30000 }); // slow-ok: the arch WASM worker loads in the browser.
  await expect(app).toContainText('no load at this position collapses the ring');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.locator('#rs-tab-weight').click();
  await expect(app).toHaveAttribute('data-issue', 'infeasible');
});

test('@smoke research masonry arch: Restart keeps a running computation, and article links return to the reference case', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  const app = page.locator('.arch-app');
  await page.locator('#arch-voussoirs').fill('41');
  await page.locator('#arch-voussoirs').dispatchEvent('change');
  await app.getByRole('button', { name: 'Restart' }).click();
  await expect(app).toHaveAttribute('data-source', 'live', { timeout: 30000 }); // slow-ok: the arch WASM worker loads and bisects in the browser.
  await expect(app).toHaveAttribute('data-n', '41');
  await page.getByRole('button', { name: 'Watch the bisection' }).click();
  await expect(app).toHaveAttribute('data-source', 'replay');
  await expect(app).toHaveAttribute('data-stale', 'false');
  await expect(app).toHaveAttribute('data-step', '0');
  await expect(app.locator('.status')).toHaveText('Showing the reference case.');
});

test('@smoke research masonry arch: the weight model is a radio group driven by the arrow keys', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  const app = page.locator('.arch-app');
  const group = app.getByRole('radiogroup', { name: 'Weight' });
  await group.getByRole('radio', { name: 'True weights' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(group.getByRole('radio', { name: 'On the centreline' })).toHaveAttribute('aria-checked', 'true');
  await expect(group.getByRole('radio', { name: 'On the centreline' })).toBeFocused();
  await expect(app.locator('.result-settings')).toContainText('on the centreline', { timeout: 30000 }); // slow-ok: the arch WASM worker loads and bisects in the browser.
});

test('@smoke research masonry arch: a solver that cannot load keeps the previous result and says so', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/research-wasm/heyman-1966/build.json', route => route.abort());
  await page.goto(PAGE);
  const app = page.locator('.arch-app');
  await page.locator('#arch-voussoirs').fill('51');
  await page.locator('#arch-voussoirs').dispatchEvent('change');
  await expect(page.getByRole('alert')).toContainText('The solver could not load or complete', { timeout: 30000 }); // slow-ok: the worker's fetch has to fail first.
  await expect(app).toHaveAttribute('data-source', 'replay');
  await expect(app).toHaveAttribute('data-stale', 'true');
  await expect(app.getByRole('button', { name: 'Recompute live' })).toBeEnabled();
});
