import { test, expect, type Locator, type Page } from '@playwright/test';
import { BATCH_IDS } from '../src/components/tools/batch';
import { TOOL_IDS, formula, format, workedExamples } from '../src/components/tools/calculators';
import { PUBLIC_LOCALES, isComplete } from '../src/lib/i18n/offered';
import { TOOLS, TOPICS } from '../src/components/tools/registry';

const difference = async (agreement: Locator) => {
  const raw = await agreement.getAttribute('data-difference');
  expect(raw).not.toBeNull();
  expect(raw!.trim()).not.toBe('');
  const value = Number(raw);
  expect(Number.isFinite(value)).toBe(true);
  return value;
};
const shown = async (locator: Locator) => Number((await locator.first().textContent())!.replace(/[^0-9.eE+−-]/g, '').replace('−', '-'));
const near = (actual: number, expected: number, relative: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(relative * Math.abs(expected));
const pageOverflow = (page: Page) => page.evaluate(() => [...document.querySelectorAll('main *')].filter(el => {
  for (let parent = el.parentElement; parent && parent.tagName !== 'MAIN'; parent = parent.parentElement) if (getComputedStyle(parent).overflowX !== 'visible') return false;
  const box = el.getBoundingClientRect();
  return box.width > 0 && (box.right > innerWidth + 1 || box.left < -1);
}).map(el => `${el.tagName.toLowerCase()}.${el.className}`));
const DEFAULT_VALUES: Record<string, number> = { 'simply-supported-beam': 0.010546875, 'cantilever-beam': 0.10125, 'column-buckling': 4386.490844928604, 'continuous-beam': 0.0043870585, 'influence-line': 15, 'beam-natural-frequency': 17.453292519943297 };

for (const id of TOOL_IDS) test(`@smoke tools ${id} computes and opens the same model`, async ({ page, request }) => {
  const html = await (await request.get(`/en/tools/${id}/`)).text();
  expect(html).toContain('id="prerender"');
  const snapshot = html.slice(html.indexOf('id="prerender"'), html.indexOf('id="app"'));
  expect(snapshot).toMatch(/<form[^>]*\sinert/);
  expect(snapshot.match(/<input(?![^>]*\sinert)[^>]*>/g) ?? []).toEqual([]);
  for (const p of workedExamples(id)) expect(html).toContain(`data-value="${format(formula(id, p).value)}"`);
  await page.goto(`/en/tools/${id}/?e2e=1`);
  const agreement = page.getByTestId('agreement');
  await expect(agreement).toBeVisible();
  expect(await difference(agreement)).toBeLessThan(id === 'column-buckling' ? 3e-6 : 1e-9);
  near(await shown(page.getByTestId('engine-value')), DEFAULT_VALUES[id], 6e-5);
  await expect(page.getByTestId('validity-warning')).toHaveCount(0);
  await expect(page.getByTestId('worked-example')).toHaveCount(workedExamples(id).length);
  const literal = { 'simply-supported-beam': ['0.010546875', '0.0028125'], 'cantilever-beam': ['0.10125', '0.045'], 'column-buckling': ['17545.9633797', '8952.02213251', '4386.49084493', '1096.62271123'] }[id];
  for (const [j, value] of literal.entries()) near(Number(await page.getByTestId('worked-example').nth(j).getAttribute('data-value')), Number(value), 1e-11);
  for (const [j, p] of workedExamples(id).entries()) await expect(page.getByTestId('worked-example').nth(j)).toHaveAttribute('data-value', format(formula(id, p).value));
  const before = await page.getByTestId('engine-value').textContent();
  await page.getByTestId('e').fill('100000');
  await expect(page.getByTestId('engine-value')).not.toHaveText(before!);
  await expect(agreement).toBeVisible();
  const expectedMembers = id === 'column-buckling' ? 32 : id === 'cantilever-beam' ? 1 : 2;
  await page.getByRole('link', { name: /^Open in Stabileo/ }).click();
  await expect(page).toHaveURL(/\/app\/basic\?e2e=1#data=2\./);
  await expect.poll(() => page.evaluate(() => (window as any).__stabileo?.memberAxialForces()?.length ?? 0), { timeout: 60000 }).toBe(expectedMembers); // slow-ok: The editor initializes WASM and solves the shared calculator model before publishing member forces.
  const materials = await page.evaluate(() => (window as any).__stabileo.entityData('setting', 'materials'));
  expect(materials[0][1].e).toBe(100000);
  const section = await page.evaluate(() => (window as any).__stabileo.entityData('section', 1));
  expect(section.iz).toBe(0.00008);
});

const figuresBelowForm = async (page: Page) => {
  const form = (await page.locator('.tool-inputs form').boundingBox())!;
  const figures = (await page.getByTestId('figures').boundingBox())!;
  return figures.y >= form.y + form.height - 1;
};

for (const [width, height] of [[360, 640], [390, 844], [844, 390], [810, 1080], [1280, 720]]) {
  for (const id of [...TOOL_IDS, ...BATCH_IDS]) test(`@smoke tools ${id} at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`/en/tools/${id}/?e2e=1`);
    await expect(page.getByTestId('agreement')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await pageOverflow(page)).toEqual([]);
    const figures = (await page.getByTestId('figures').boundingBox())!;
    if (width >= 992 || (width >= 704 && height <= 500)) {
      expect(figures.y).toBeLessThan(height / 3);
      const form = (await page.locator('.tool-inputs form').boundingBox())!;
      expect(figures.x).toBeGreaterThan(form.x + form.width);
    } else {
      expect(await figuresBelowForm(page)).toBe(true);
    }
    for (const control of await page.locator('main input, main textarea, main select, main button, main summary, main a, .open-editor').all()) {
      if (!await control.isVisible()) continue;
      const box = (await control.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(await control.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
    }
    for (const label of await page.locator('[data-testid=figures] figcaption > span').all()) {
      const [box, parent] = await label.evaluate(el => [el.getBoundingClientRect().right, el.closest('figure')!.getBoundingClientRect().right]);
      expect(box).toBeLessThanOrEqual(parent + 0.5);
    }
  });
}

const FIGURES: Record<string, string[]> = {
  'simply-supported-beam': ['structure', 'deflection', 'shear', 'moment'],
  'cantilever-beam': ['structure', 'deflection', 'shear', 'moment'],
  'column-buckling': ['structure', 'buckling'],
  'continuous-beam': ['structure', 'deflection', 'shear', 'moment'],
  'influence-line': ['structure', 'influence', 'deflection', 'shear', 'moment'],
  'portal-frame': ['structure', 'deflection', 'moment', 'shear', 'axial'],
  'truss-2d': ['structure', 'axial', 'deflection'],
  'beam-natural-frequency': ['structure', 'mode1', 'mode2', 'mode3'],
  'beam-frame': ['structure', 'moment', 'shear', 'deflection'],
  'slab-on-columns': ['deflection'],
  'earthquake-frame': ['deformed', 'roof', 'ground'],
  'rc-column': ['section', 'elevation', 'interaction'],
  outrigger: ['outrigger', 'driftSweep'],
  tower: ['mode1', 'mode2', 'mode3', 'buckling'],
};

for (const { id } of TOOLS.filter(tool => tool.kind !== 'page')) test(`@smoke tools ${id} draws every result diagram at once, each with its title, unit and largest value, and no tabs`, async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`/en/tools/${id}/?e2e=1`);
  const board = page.getByTestId('figures');
  await expect(board.locator('figure')).toHaveCount(FIGURES[id].length, { timeout: 30000 });
  expect(await board.locator('figure').evaluateAll(els => els.map(el => el.getAttribute('data-testid')))).toEqual(FIGURES[id].map(key => `figure-${key}`));
  await expect(page.locator('main [role=tablist], main [role=tab], main [role=tabpanel]')).toHaveCount(0);
  for (const key of FIGURES[id]) {
    const figure = page.getByTestId(`figure-${key}`);
    await figure.scrollIntoViewIfNeeded();
    await expect(figure).toBeVisible();
    await expect(figure.locator('figcaption .fig-title')).not.toHaveText('');
    await expect(figure.locator('svg').first()).toBeVisible();
    const box = (await figure.locator('svg').first().boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(80);
    if (key === 'structure' || key === 'section' || key === 'elevation') continue;
    const peak = page.getByTestId(`peak-${key}`);
    await expect(peak).toBeVisible();
    expect(Number.isFinite(Number(await peak.getAttribute('data-value')))).toBe(true);
    if (id === 'beam-natural-frequency' && key.startsWith('mode')) continue;
    const dot = figure.locator('[data-testid=chart-point], [data-testid=sketch-peak]');
    await expect(dot).toHaveCount(1);
    const [cx, cy] = (await dot.evaluate(el => [Number(el.getAttribute('cx')), Number(el.getAttribute('cy'))]));
    const svg = (await dot.evaluate(el => { const r = el.ownerSVGElement!.getBoundingClientRect(); return [r.width, r.height]; }));
    expect(cx >= 0 && cx <= svg[0] && cy >= 0 && cy <= svg[1], `${key} dot at ${cx},${cy} in ${svg}`).toBe(true);
  }
});

test('@smoke tools a value typed past a slider\'s span stays, and the slider grows to hold it', async ({ page }) => {
  await page.goto('/en/tools/simply-supported-beam/?e2e=1');
  await expect(page.getByTestId('peak-moment')).toBeVisible();
  await page.getByTestId('load').fill('200');
  await page.getByTestId('length').fill('50');
  await expect.poll(() => peak(page, 'moment')).toBeCloseTo(200 * 50 ** 2 / 8, 6);
  await page.getByTestId('e').fill('150000');
  await expect.poll(() => peak(page, 'deflection')).toBeCloseTo(5 * 200 * 50 ** 4 / (384 * 150000e3 * 0.00008), 3);
  await expect(page.getByTestId('load')).toHaveValue('200');
  await expect(page.getByTestId('length')).toHaveValue('50');
  near(await peak(page, 'moment'), 200 * 50 ** 2 / 8, 1e-9);
  for (const [key, value] of [['load', '200'], ['length', '50']]) {
    const slider = page.getByTestId(`slider-${key}`);
    await expect(slider).toHaveValue(value);
    expect(Number(await slider.getAttribute('max'))).toBeGreaterThanOrEqual(Number(value));
  }
  await slide(page, 'slider-load', 100);
  await expect.poll(() => peak(page, 'moment')).toBeCloseTo(100 * 50 ** 2 / 8, 6);
  await page.goto('/en/tools/portal-frame/?e2e=1');
  await expect(page.getByTestId('peak-moment')).toBeVisible();
  await page.getByTestId('height').fill('40');
  await page.getByTestId('load').fill('500');
  await page.getByTestId('e').fill('150000');
  await expect(page.getByTestId('agreement')).toBeVisible();
  await expect(page.getByTestId('height')).toHaveValue('40');
  await expect(page.getByTestId('load')).toHaveValue('500');
  await expect(page.getByTestId('slider-height')).toHaveValue('40');
});

test('@smoke tools the parameter column stays below the header while the results scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/en/tools/portal-frame/?e2e=1');
  await expect(page.getByTestId('peak-moment')).toBeVisible();
  const box = await page.evaluate(async () => {
    document.querySelector('.landing')!.scrollTo({ top: 900, behavior: 'instant' });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const side = document.querySelector('.tool-side')!.getBoundingClientRect();
    return { top: side.top, bottom: side.bottom, nav: document.querySelector('nav.site-header')!.getBoundingClientRect().bottom, scrolled: document.querySelector('.landing')!.scrollTop };
  });
  expect(box.scrolled).toBeGreaterThan(0);
  expect(box.top).toBeGreaterThanOrEqual(box.nav);
  expect(box.bottom).toBeLessThanOrEqual(720);
});

const slide = (page: Page, testId: string, to: number) => page.getByTestId(testId).evaluate((el: HTMLInputElement, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }, to);
const peak = async (page: Page, key: string) => Number(await page.getByTestId(`peak-${key}`).getAttribute('data-value'));

test('@smoke tools a slider moves every diagram live, and the diagrams never blank between solves', async ({ page }) => {
  await page.goto('/en/tools/simply-supported-beam/?e2e=1');
  await expect(page.getByTestId('peak-moment')).toBeVisible();
  near(await peak(page, 'moment'), 10 * 36 / 8, 1e-9);
  const shown = await page.getByTestId('peak-moment').textContent();
  await page.evaluate(() => {
    const counts: number[] = [];
    const board = () => document.querySelector('[data-testid=figures]');
    new MutationObserver(() => counts.push(board()?.querySelectorAll('figure svg').length ?? 0)).observe(document.querySelector('main')!, { subtree: true, childList: true });
    (window as unknown as { figureCounts: number[] }).figureCounts = counts;
  });
  for (const load of [12, 15, 20, 25, 30]) await slide(page, 'slider-load', load);
  await expect.poll(() => peak(page, 'moment')).toBeCloseTo(30 * 36 / 8, 6);
  await expect(page.getByTestId('peak-moment')).not.toHaveText(shown!);
  near(await peak(page, 'shear'), 30 * 6 / 2, 1e-9);
  near(await peak(page, 'deflection'), 5 * 30 * 6 ** 4 / (384 * 200000e3 * 0.00008), 1e-4);
  expect(await page.evaluate(() => (window as unknown as { figureCounts: number[] }).figureCounts.every(n => n === 4))).toBe(true);
  await expect(page.getByTestId('slider-load')).toHaveValue('30');
  await expect(page.getByTestId('load')).toHaveValue('30');
});

for (const locale of PUBLIC_LOCALES) test(`@smoke tools localized index ${locale}`, async ({ page }) => {
  await page.goto(`/${locale}/tools/`);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('section.topic')).toHaveCount(TOPICS.length);
  await expect(page.locator('.tool-card h3 a')).toHaveCount(TOOLS.length);
  await expect(page.locator('.tool-card')).toHaveCount(TOOLS.length);
  for (const topic of TOPICS) await expect(page.locator(`section.topic[data-topic="${topic}"] .tool-card`)).toHaveCount(TOOLS.filter(tool => tool.topic === topic).length);
  await expect(page.locator('.tool-card .badge')).toHaveCount(0);
  for (const link of await page.locator('.tool-card h3 a').all()) {
    const box = (await link.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await expect(page.locator('nav [data-nav="tools"]')).toBeVisible();
  await expect(page.locator('nav [data-nav="examples"]')).toHaveCount(0);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://stabileo.com/${locale}/tools/`);
  for (const lang of PUBLIC_LOCALES) await expect(page.locator(`link[hreflang="${lang}"]`)).toHaveAttribute('href', `https://stabileo.com/${lang}/tools/`);
  for (const lang of ['de', 'fr', 'tr'].filter((l) => !isComplete(l))) await expect(page.locator(`link[hreflang="${lang}"]`)).toHaveCount(0);
});


for (const id of BATCH_IDS) test(`@smoke tools ${id} prerender and editor handoff`, async ({ page, request }) => {
  const html = await (await request.get(`/en/tools/${id}/`)).text();
  expect(html).toContain('id="prerender"');
  await page.goto(`/en/tools/${id}/?e2e=1`);
  await expect(page.getByTestId('agreement')).toBeVisible();
  expect(await difference(page.getByTestId('agreement'))).toBeLessThan(id === 'portal-frame' ? .002 : .00002);
  if (id in DEFAULT_VALUES) near(await shown(page.getByTestId('engine-value')), DEFAULT_VALUES[id], id === 'beam-natural-frequency' ? 3e-5 : 2e-5);
  if (id === 'portal-frame') near(await shown(page.getByTestId('sway')), 0.0056325, 2e-5);
  if (id === 'truss-2d') await expect(page.getByTestId('axial-force')).toHaveText(['N1: 15 kN', 'N2: 15 kN', 'N3: 15 kN', 'N4: 15 kN', 'N5: -21.2132 kN', 'N6: -20 kN', 'N7: -20 kN', 'N8: -21.2132 kN', /^N9: /, 'N10: -10 kN', /^N11: /, 'N12: 7.07107 kN', 'N13: 7.07107 kN']);
  await expect(page.getByTestId('validity-warning')).toHaveCount(0);
  const before = await page.getByTestId(id === 'portal-frame' ? 'sway' : 'engine-value').first().textContent();
  await page.getByTestId('e').fill('100000');
  await expect(page.getByTestId('agreement')).toBeVisible();
  if (id !== 'influence-line') await expect(page.getByTestId(id === 'portal-frame' ? 'sway' : 'engine-value').first()).not.toHaveText(before!);
  await page.getByRole('link', { name: /^Open in Stabileo/ }).click();
  await expect(page).toHaveURL(/\/app\/basic\?e2e=1#data=2\./);
  await expect.poll(() => page.evaluate(() => (window as any).__stabileo?.memberAxialForces()?.length ?? 0), { timeout: 60000 }).toBeGreaterThan(0); // slow-ok: The editor initializes WASM and solves the shared batch-tool model before publishing member forces.
  const materials = await page.evaluate(() => (window as any).__stabileo.entityData('setting', 'materials'));
  expect(materials[0][1].e).toBe(100000);
});

// Exercise Root's in-place lazy mount separately from the ordinary full-document links.
test('@smoke tools shared model survives a client-side editor transition', async ({ page }) => {
  await page.goto('/en/tools/continuous-beam/?e2e=1');
  const link = page.getByRole('link', { name: /^Open in Stabileo/ });
  await expect(link).toHaveAttribute('href', /#data=2\./);
  const origin = await page.evaluate(() => performance.timeOrigin);
  await page.evaluate(href => {
    history.pushState(null, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, (await link.getAttribute('href'))!);
  await expect.poll(() => page.evaluate(() => (window as any).__stabileo?.memberAxialForces()?.length ?? 0)).toBeGreaterThan(0);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  await expect(page.locator('canvas').first()).toBeVisible();
});

for (const id of [...TOOL_IDS, ...BATCH_IDS]) test(`@smoke tools ${id} shows the build's engine result before the engine downloads, and the engine agrees`, async ({ page }) => {
  const requested: string[] = [];
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(/dedaliano_engine_bg[^/]*\.wasm$/, async route => { requested.push(route.request().url()); await held; await route.continue(); });
  await page.goto(`/en/tools/${id}/?e2e=1`);
  const values = page.locator('#app [data-testid=engine-value]');
  await expect(values.first()).toBeVisible();
  await expect(page.locator('#prerender')).toHaveCount(0);
  await expect(page.locator('#app a.btn-primary[href*="#data=2."]')).toBeVisible();
  const shown = await values.allTextContents();
  const difference = await page.getByTestId('agreement').getAttribute('data-difference');
  expect(shown.every(text => /\d/.test(text))).toBe(true);
  expect(requested).toEqual([]);
  release();
  await page.evaluate(() => document.querySelectorAll('script[data-prerendered-result]').forEach(script => script.remove()));
  const input = page.getByTestId(id === 'influence-line' ? 'load' : 'e');
  const original = await input.inputValue();
  await input.fill(String(Number(original) / 2));
  await expect(values.first()).not.toHaveText(shown[0]);
  await input.fill(original);
  await expect(values).toHaveText(shown);
  if (difference === null) await expect(page.getByTestId('agreement')).not.toHaveAttribute('data-difference');
  else await expect(page.getByTestId('agreement')).toHaveAttribute('data-difference', difference);
  expect(requested).toHaveLength(1);
});

test('@smoke tools warn when the deflection leaves small-deflection theory', async ({ page }) => {
  await page.goto('/en/tools/simply-supported-beam/?e2e=1');
  await expect(page.getByTestId('agreement')).toBeVisible();
  await page.getByTestId('e').fill('1');
  await expect(page.getByTestId('validity-warning')).toContainText('1/50');
  await page.goto('/en/tools/portal-frame/?e2e=1');
  await page.getByTestId('length').fill('0.1');
  await page.getByTestId('height').fill('100');
  await expect(page.getByTestId('validity-warning')).toHaveCount(2);
});

test('@smoke tools refuse a decimal comma in span lists', async ({ page }) => {
  await page.goto('/es/tools/continuous-beam/?e2e=1');
  await expect(page.getByTestId('agreement')).toBeVisible();
  await page.locator('#spans').fill('6,5, 6');
  await expect(page.locator('[role=alert]').filter({ hasText: '6.5' })).toBeVisible();
  await expect(page.getByTestId('agreement')).toHaveCount(0);
});

for (const id of ['simply-supported-beam', 'beam-natural-frequency']) test(`@smoke tools ${id} localized at 390x844 and 844x390`, async ({ page }) => {
  for (const [width, height] of [[390, 844], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`/${PUBLIC_LOCALES.find((l) => l !== 'en')}/tools/${id}/?e2e=1`);
    await expect(page.getByTestId('agreement')).toBeVisible();
    expect(await pageOverflow(page)).toEqual([]);
    if (height <= 400) expect((await page.getByTestId('figures').boundingBox())!.y).toBeLessThan(height - 120);
    else expect(await figuresBelowForm(page)).toBe(true);
    await expect(page.locator('main')).not.toContainText('Dense solver');
    await expect(page.locator('main')).not.toContainText('Residual');
  }
});

test('@smoke a calculator and its research benchmarks link to each other, each in its published language', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/es/tools/truss-2d/?e2e=1');
  const related = page.locator('nav.rs-related');
  await expect(related).toBeVisible();
  await expect(related.locator('a[href="/es/research/metamaterials/grossman-2026/"]')).toHaveCount(1);
  await expect(related.locator('a[href="/es/research/benchmarks/riks-crisfield/"]')).toHaveCount(1);
  await expect(related.locator('a[href="/es/tools/"]').first()).toBeVisible();
  await expect(related.locator('a[href="/es/research/"]')).toHaveCount(1);
  await expect(related.locator('a[href*="/examples"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await related.locator('a[href="/es/research/metamaterials/grossman-2026/"]').click();
  await expect(page).toHaveURL(/\/es\/research\/metamaterials\/grossman-2026\/$/);
  const back = page.locator('nav.rs-related a[href="/es/tools/truss-2d/"]');
  await expect(back).toHaveCount(1);
  await back.click();
  await expect(page).toHaveURL(/\/es\/tools\/truss-2d\/$/);
});
