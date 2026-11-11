import { test, expect, type Page } from '@playwright/test';
import { TOOLS } from '../src/components/tools/registry';

const MODEL_IDS = TOOLS.filter(tool => tool.kind === 'model').map(tool => tool.id);
import { PUBLIC_LOCALES } from '../src/lib/i18n/offered';

const value = async (page: Page, testId: string) => Number(await page.getByTestId(testId).getAttribute('data-value'));
const slide = (page: Page, key: string, to: number) => page.getByTestId(`param-${key}`).evaluate((el: HTMLInputElement, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }, to);
const near = (actual: number, expected: number, relative: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(relative * Math.abs(expected));
const receivesPointer = (el: Element) => {
  const b = el.getBoundingClientRect();
  const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
  return !!hit && (hit === el || el.contains(hit) || (el as HTMLInputElement).labels?.[0]?.contains(hit) === true);
};
const pageOverflow = (page: Page) => page.evaluate(() => [...document.querySelectorAll('main *')].filter(el => {
  for (let parent = el.parentElement; parent && parent.tagName !== 'MAIN'; parent = parent.parentElement) if (getComputedStyle(parent).overflowX !== 'visible') return false;
  const box = el.getBoundingClientRect();
  return box.width > 0 && (box.right > innerWidth + 1 || box.left < -1);
}).map(el => `${el.tagName.toLowerCase()}.${el.className}`));

test('@smoke model tools: a slider re-solves, and the share link and editor carry the model', async ({ page, request }) => {
  const html = await (await request.get('/en/tools/')).text();
  expect(html).toContain('id="prerender"');
  for (const id of MODEL_IDS) expect(html).toContain(`/en/tools/${id}/`);
  expect(html).not.toContain('/en/examples/');
  await page.goto('/en/?e2e=1');
  await page.locator('.hero').getByRole('link', { name: /Tools/ }).click();
  await expect(page).toHaveURL(/\/en\/tools\/?/);
  await expect(page.getByTestId('card-beam-frame')).toBeVisible();
  await page.getByTestId('card-beam-frame').getByRole('heading').getByRole('link').click();
  await expect(page).toHaveURL(/\/en\/tools\/beam-frame\/?(\?|$)/);
  await expect(page.getByTestId('readout-maxMoment')).toBeVisible();
  near(await value(page, 'readout-maxMoment'), 45, 1e-9);
  near(await value(page, 'peak-moment'), 45, 1e-9);
  await expect(page.getByTestId('certificate')).toHaveAttribute('data-status', 'certified');

  await page.getByTestId('param-span').fill('8');
  await expect(page.getByTestId('value-span')).toHaveText('8');
  await expect.poll(() => value(page, 'readout-maxMoment')).toBeCloseTo(80, 6);
  await expect.poll(() => value(page, 'peak-moment')).toBeCloseTo(80, 6);
  near(await value(page, 'reference-maxMoment'), 80, 1e-12);
  const share = await page.getByTestId('share-link').getAttribute('href');
  expect(share).toMatch(/\/en\/tools\/beam-frame\/?\?span=8$/);
  expect(new URL(page.url()).searchParams.get('span')).toBe('8');

  const shared = new URL(share!);
  await page.goto(`${shared.pathname}${shared.search}&e2e=1`);
  await expect(page.getByTestId('value-span')).toHaveText('8');
  await expect.poll(() => value(page, 'readout-maxMoment')).toBeCloseTo(80, 6);

  await page.getByTestId('open-editor').click();
  await expect(page).toHaveURL(/\/app\/basic\?e2e=1#data=2\./);
  await expect.poll(() => page.evaluate(() => (window as any).__stabileo?.memberAxialForces()?.length ?? 0), { timeout: 60000 }).toBe(2); // slow-ok: The editor initializes WASM and solves the shared example model before publishing member forces.
  const nodes: [number, { x: number }][] = await page.evaluate(() => (window as any).__stabileo.entityData('setting', 'nodes'));
  expect(nodes.map(([, n]) => n.x).sort((a, b) => a - b)).toEqual([0, 4, 8]);
});

for (const id of ['beam-frame', 'outrigger', 'tower']) test(`@smoke an old /examples/${id}/ address with its settings lands on the tool, settings kept`, async ({ page }) => {
  const query = id === 'beam-frame' ? '?span=8' : id === 'outrigger' ? '?position=0.9' : '?topMass=100';
  await page.goto(`/en/examples/${id}/${query}&e2e=1`);
  await expect(page).toHaveURL(new RegExp(`/en/tools/${id}/\\?`));
  const [key, expected] = query.slice(1).split('=');
  expect(new URL(page.url()).searchParams.get(key)).toBe(expected);
  expect(new URL(page.url()).searchParams.get('e2e')).toBe('1');
  await expect(page.getByTestId(`value-${key}`)).toHaveText(expected);
  await expect(page.getByTestId('certificate')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://stabileo.com/en/tools/${id}/`);
});

test('@smoke model tools solve a point load on a support with the zero closed-form solution', async ({ page }) => {
  await page.goto('/en/tools/beam-frame/?load=0&point=50&position=0&e2e=1');
  await expect(page.getByTestId('refusal')).toHaveCount(0);
  await expect(page.getByTestId('readout-maxMoment')).toBeVisible();
  expect(await value(page, 'readout-maxMoment')).toBe(0);
  expect(await value(page, 'reference-maxMoment')).toBe(0);
  expect(await value(page, 'readout-maxDeflection')).toBe(0);
  await expect(page.getByTestId('certificate')).toHaveAttribute('data-status', 'certified');
});

test('@smoke model tools report the engine refusing a model with no load', async ({ page }) => {
  await page.goto('/en/tools/beam-frame/?load=0&e2e=1');
  await expect(page.getByTestId('refusal')).toBeVisible();
  await expect(page.getByTestId('readout-maxMoment')).toHaveCount(0);
});

test('@smoke a model the engine refuses says why in place of its drawings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en/tools/rc-column/?barDia=12&e2e=1');
  await expect(page.getByTestId('figure-section').locator('svg')).toBeVisible({ timeout: 30000 });
  await page.getByTestId('param-b').fill('0.45');
  const reason = page.getByTestId('viewer-refusal');
  await expect(reason).toHaveAttribute('data-code', 'needsCrossties');
  await expect(reason).toContainText('needs a crosstie');
  await expect(page.getByTestId('figures')).toHaveCount(0);
  await expect(page.getByTestId('refusal')).toHaveAttribute('data-code', 'needsCrossties');
  await page.getByTestId('param-b').fill('0.4');
  await expect(page.getByTestId('figure-section').locator('svg')).toBeVisible();
  await expect(reason).toHaveCount(0);
});

test('@smoke rc-column solves at its widest section with the default three bars per face', async ({ page }) => {
  await page.goto('/en/tools/rc-column/?e2e=1');
  await expect(page.getByTestId('certificate')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('param-b')).toHaveAttribute('max', '0.45');
  await slide(page, 'b', 0.8);
  await expect(page.getByTestId('value-b')).toHaveText('0.45');
  await expect(page.getByTestId('certificate')).toBeVisible();
  await expect(page.getByTestId('refusal')).toHaveCount(0);
  await expect(page.getByTestId('figure-section').locator('svg')).toBeVisible();
});

const LEGENDS: [string, string, string, string, RegExp][] = [
  ['outrigger', '', 'outrigger', 'deformed', /^deformed ×[\d,.]+$/],
  ['earthquake-frame', '', 'deformed', 'deformed', /^deformed ×[\d,.]+$/],
  ['beam-frame', '?system=1', 'deflection', 'deformed', /^deformed ×[\d,.]+$/],
  ['tower', '', 'mode1', 'mode', /^mode shape, normalised$/],
];
for (const [id, query, figure, shape, second] of LEGENDS) test(`@smoke model tool ${id} labels the undeformed and the ${shape} shape it overlays`, async ({ page }) => {
  await page.goto(`/en/tools/${id}/${query || '?'}${query ? '&' : ''}e2e=1`);
  await expect(page.getByTestId('certificate')).toBeVisible({ timeout: 30000 });
  const legend = page.getByTestId(`figure-${figure}`).getByTestId('viewer-legend');
  await expect(legend).toHaveAttribute('data-shape', shape);
  const items = (await legend.locator('li').allTextContents()).map(text => text.trim());
  expect(items[0]).toBe('undeformed');
  expect(items[1]).toMatch(second);
  if (shape === 'deformed') expect(Number(await legend.getAttribute('data-scale'))).toBeGreaterThan(1);
});

test('@smoke the model tool legend is translated', async ({ page }) => {
  await page.goto('/es/tools/outrigger/?e2e=1');
  const legend = page.getByTestId('figure-outrigger').getByTestId('viewer-legend');
  await expect(legend.locator('li').first()).toHaveText('sin deformar', { timeout: 30000 });
  await expect(legend.locator('li').nth(1)).toHaveText(/^deformada ×/);
});

for (const id of MODEL_IDS) test(`@smoke model tool ${id} draws its figures without tabs or editor chrome, and loads no WebGL viewer`, async ({ page }) => {
  await page.goto(`/en/tools/${id}/?e2e=1`);
  await expect(page.getByTestId('certificate')).toBeVisible({ timeout: 30000 });
  const board = page.getByTestId('figures');
  for (const figure of await board.locator('figure').all()) await expect(figure.locator('figcaption .fig-title')).toHaveCount(1);
  await expect(page.locator('main [role="tablist"], main canvas')).toHaveCount(0);
  await expect(board.locator('.sfv-mark, .sfv-navigation, .sfv-status, .axis-gizmo')).toHaveCount(0);
  await expect(board.getByText(/stabileo viewer/i)).toHaveCount(0);
});

const CERTIFICATE: Record<string, string> = { 'rc-column': 'unavailable' };

for (const id of MODEL_IDS) test(`@smoke model tool ${id} solves in the browser`, async ({ page }) => {
  await page.goto(`/en/tools/${id}/?e2e=1`);
  await expect(page.getByTestId('certificate')).toHaveAttribute('data-status', CERTIFICATE[id] ?? 'certified', { timeout: 30000 });
  await expect(page.getByTestId('figures').locator('svg').first()).toBeVisible();
});

const CLOSED_FORMS: [string, string, string, number][] = [
  ['rc-column', '?b=0.3&h=0.6&fc=30', 'squashLoad', 1e-9],
  ['rc-column', '?b=0.3&h=0.6&fc=30', 'balancedM', 1e-6],
  ['outrigger', '?position=0.3&storeys=30', 'topDrift', 1e-6],
  ['outrigger', '?position=0.3&storeys=30', 'columnForce', 1e-6],
  ['tower', '?topMass=100', 'f1', 1e-4],
  ['tower', '?topMass=100', 'bucklingFactor', 1e-4],
];
for (const [id, query, key, tolerance] of CLOSED_FORMS) test(`@smoke model tool ${id} ${key} matches its closed form in the browser`, async ({ page }) => {
  await page.goto(`/en/tools/${id}/${query}&e2e=1`);
  await expect(page.getByTestId(`reference-${key}`)).toBeVisible({ timeout: 30000 });
  near(await value(page, `readout-${key}`), await value(page, `reference-${key}`), tolerance);
});

test('@smoke the outrigger slider moves the result, its diagrams and the share link', async ({ page }) => {
  await page.goto('/en/tools/outrigger/?e2e=1');
  await expect(page.getByTestId('readout-topDrift')).toBeVisible({ timeout: 30000 });
  const before = await value(page, 'readout-topDrift');
  const drawn = await page.getByTestId('peak-outrigger').textContent();
  await page.getByTestId('param-position').fill('0.9');
  await expect.poll(() => value(page, 'readout-topDrift')).not.toBe(before);
  await expect(page.getByTestId('peak-outrigger')).not.toHaveText(drawn!);
  near(await value(page, 'peak-outrigger'), await value(page, 'readout-topDrift'), 1e-9);
  await expect(page.getByTestId('figures').locator('figure')).toHaveCount(2);
  near(await value(page, 'readout-topDrift'), await value(page, 'reference-topDrift'), 1e-6);
  expect(new URL(page.url()).searchParams.get('position')).toBe('0.9');
});

for (const [width, height] of [[360, 640], [390, 844], [844, 390], [820, 1180], [1280, 720], [1440, 900]]) {
  for (const id of MODEL_IDS) test(`@smoke model tool ${id} at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`/en/tools/${id}/?e2e=1`);
    await expect(page.getByTestId('certificate')).toBeVisible({ timeout: 30000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await pageOverflow(page)).toEqual([]);
    const figures = (await page.getByTestId('figures').boundingBox())!;
    const form = (await page.locator('.tool-inputs form').boundingBox())!;
    if (width >= 992 || height <= 500) expect(figures.y).toBeLessThan(height <= 500 ? height - 120 : height / 3);
    else expect(figures.y).toBeGreaterThanOrEqual(form.y + form.height - 1);
    expect(await page.evaluate((check) => {
      const receives = new Function(`return (${check})`)() as (el: Element) => boolean;
      return [...document.querySelectorAll('main input, main select, main button, main a')].filter(el => {
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.top >= 0 && b.bottom <= innerHeight / 2 && !receives(el);
      }).map(el => el.outerHTML.slice(0, 120));
    }, receivesPointer.toString())).toEqual([]);
    for (const control of await page.locator('main input, main select, main button, main a').all()) {
      if (!await control.isVisible()) continue;
      const box = (await control.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(await control.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
      await control.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      expect(await control.evaluate(receivesPointer), await control.evaluate(el => el.outerHTML.slice(0, 120))).toBe(true);
    }
  });
}

for (const locale of PUBLIC_LOCALES) test(`@smoke the old examples index in ${locale} lands on the tools index, which lists every model`, async ({ page }) => {
  await page.goto(`/${locale}/examples/`);
  await expect(page).toHaveURL(new RegExp(`/${locale}/tools/$`));
  await expect(page.locator('h1')).toBeVisible();
  for (const id of MODEL_IDS) await expect(page.getByTestId(`card-${id}`)).toHaveCount(1);
  await expect(page.locator('#app .site-header [data-nav="tools"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#app .site-header [data-nav="examples"]')).toHaveCount(0);
  expect(await page.title()).toContain('Stabileo');
});
