/**
 * Dynamic analysis draws its mode shape, animated, whether or not the model
 * has had a static solve first.
 *
 * In 2D the mode was drawn inside the block that needs static results, so
 * Dynamic on a model not yet solved listed its modes and left the structure
 * standing still. In 3D the amplitude divided the deformed view's scale by
 * 100, from when that scale started at 100; since it starts at 1 a mode moved
 * 0.15 % of the structure. Two frames of the model view a moment apart must
 * differ over whole members, not a few edge pixels.
 */
import { test, expect, type Page } from './fixtures';

async function boot(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
}
async function runDynamic(page: Page) {
  if (!(await page.getByTestId('adv-steps').isVisible())) await page.getByTestId('rb-cmd-advanced').click();
  await page.getByRole('button', { name: /^(Dynamic|Dinámico|Dinâmico)$/ }).first().click();
}
/**
 * How many pixels of the model view change between two frames a moment apart:
 * a mode shape in motion moves whole members, a mode that barely moves changes
 * a handful of pixels along its edges.
 */
async function pixelsMoved(page: Page, selector: string): Promise<number> {
  const c = page.locator(selector).first();
  await page.waitForTimeout(400);
  const a = (await c.screenshot()).toString('base64');
  await page.waitForTimeout(700);
  const b = (await c.screenshot()).toString('base64');
  return page.evaluate(async ([a, b]) => {
    const load = (src: string) => new Promise<HTMLImageElement>((res) => { const i = new Image(); i.onload = () => res(i); i.src = `data:image/png;base64,${src}`; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const read = (img: HTMLImageElement) => {
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const cx = cv.getContext('2d')!; cx.drawImage(img, 0, 0); return cx.getImageData(0, 0, img.width, img.height).data;
    };
    const da = read(ia), db = read(ib);
    let n = 0;
    for (let k = 0; k < da.length; k += 4) {
      if (Math.abs(da[k] - db[k]) + Math.abs(da[k + 1] - db[k + 1]) + Math.abs(da[k + 2] - db[k + 2]) > 60) n++;
    }
    return n;
  }, [a, b]);
}

test.describe('@smoke dynamic analysis in Basic', () => {
  test('2D: the mode shape moves without a static solve first', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await boot(page);
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await runDynamic(page);
    await expect(page.getByTestId('adv-running')).toBeVisible();
    expect(await pixelsMoved(page, 'canvas:not(.axis-gizmo)')).toBeGreaterThan(400);
    expect(errors).toEqual([]);
  });

  test('3D: the mode shape moves visibly at the default scale', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await boot(page);
    await page.getByTestId('rb-cmd-dim').click();
    await page.evaluate(() => window.__stabileoActions.loadExample('3d-portal-frame'));
    await runDynamic(page);
    await expect(page.getByTestId('adv-running')).toBeVisible();
    expect(await pixelsMoved(page, '.viewport3d-wrapper')).toBeGreaterThan(400);
    expect(errors).toEqual([]);
  });
});
