import { expect, test, type Page } from '@playwright/test';
import { EXPERIMENTS } from '../src/components/research/experiments';

const researchApp = '#app';

async function openResearchPage(page: Page, path: string) {
  await page.goto(`/en${path}/`);
  await expect(page.locator('#prerender')).toHaveCount(0);
  const root = page.locator(researchApp);
  await expect(root.locator('h1').first()).toBeVisible();
  return root;
}

const layouts: Record<string, 'wide' | undefined> = {
  'andreassen-2011': 'wide',
  'zmyslony-2026': 'wide',
};

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
  for (const e of EXPERIMENTS) {
    const layout = layouts[e.paperId] ?? 'split';
    test(`@smoke research shell: ${e.path} uses its ${layout} layout at ${viewport.width}×${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const root = await openResearchPage(page, e.path);
      const app = root.locator('.rs-shell-app');
      const shell = root.locator(layout === 'wide' ? '.rs-shell-grid.rs-wide' : '.rs-shell-wrap.rs-split');
      await expect(shell.locator('.rs-shell-app')).toBeVisible();
      const head = (await root.locator('.rs-shell-head').boundingBox())!;
      const pane = (await app.boundingBox())!;
      const article = (await root.locator('.rs-shell-article').boundingBox())!;
      if (layout === 'wide') {
        expect(pane.y).toBeGreaterThanOrEqual(head.y + head.height);
        expect(article.y).toBeGreaterThanOrEqual(pane.y + pane.height);
        expect(pane.x).toBe(article.x);
      } else {
        expect(Math.abs(pane.y - head.y)).toBeLessThan(2);
        expect(pane.x).toBeGreaterThan(head.x + head.width);
        expect(pane.x).toBeGreaterThan(article.x + article.width);
        expect(article.y).toBeGreaterThanOrEqual(head.y + head.height);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    });
  }
}

test('@smoke research shell: the split grid holds only the head, article and app, and places anything else below them', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let checked = 0;
  for (const e of EXPERIMENTS) {
    if (layouts[e.paperId]) continue;
    const root = await openResearchPage(page, e.path);
    const shell = root.locator('.rs-shell-wrap.rs-split');
    await expect(shell.locator(':scope > .rs-shell-grid')).toHaveCount(1);
    const shape = await shell.evaluate(wrap => {
      const grid = wrap.querySelector(':scope > .rs-shell-grid')!;
      const name = (el: Element) => `${el.tagName.toLowerCase()}.${[...el.classList].filter(c => c.startsWith('rs-shell')).join('.')}`;
      return {
        wrap: [...wrap.children].map(name),
        grid: [...grid.children].map(name),
        display: getComputedStyle(grid).display,
        semantics: [...grid.attributes].map(a => a.name).filter(n => n === 'role' || n.startsWith('aria-')),
      };
    });
    expect(shape, e.path).toEqual({ wrap: ['header.rs-shell-head', 'div.rs-shell-grid'], grid: ['aside.rs-shell-app', 'article.rs-shell-article'], display: 'contents', semantics: [] });
    checked++;
  }
  expect(checked).toBeGreaterThan(0);
  const root = await openResearchPage(page, EXPERIMENTS.find(e => e.paperId === 'heyman-1966')!.path);
  const placed = await root.locator('.rs-shell-wrap.rs-split').evaluate(wrap => {
    const grid = wrap.querySelector(':scope > .rs-shell-grid')!;
    const stray = document.createElement('div');
    stray.className = (grid.firstElementChild as HTMLElement).className.split(' ').filter(c => c.startsWith('svelte-')).join(' ');
    stray.style.height = '40px';
    grid.appendChild(stray);
    const box = (el: Element) => el.getBoundingClientRect();
    const [s, article, app, head] = [stray, grid.querySelector('.rs-shell-article')!, grid.querySelector('.rs-shell-app')!, wrap.querySelector('.rs-shell-head')!].map(box);
    return { column: getComputedStyle(stray).gridColumnStart + '/' + getComputedStyle(stray).gridColumnEnd, left: s.left, width: s.width, top: s.top, below: Math.max(article.bottom, app.bottom), head: head.left, right: app.right };
  });
  expect(placed.column).toBe('1/-1');
  expect(placed.top).toBeGreaterThanOrEqual(placed.below - 1);
  expect(Math.abs(placed.left - placed.head)).toBeLessThan(2);
  expect(Math.abs(placed.left + placed.width - placed.right)).toBeLessThan(2);
});

test('@smoke #2311 layout measurements wait for the live Grossman shell', async ({ page }) => {
  const requested = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  await page.route('**/assets/SpringsPage-*.js', async route => {
    requested.resolve();
    await release.promise;
    await route.continue();
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  const pane = page.locator(researchApp).locator('.rs-shell-wrap.rs-split .rs-shell-app');
  try {
    await page.goto('/en/research/metamaterials/grossman-2026/', { waitUntil: 'domcontentloaded' });
    await requested.promise;
    await expect(page.locator('#prerender .rs-shell-app')).toBeVisible();
    expect(await pane.count()).toBe(0);
  } finally {
    release.resolve();
  }
  await expect(page.locator('#prerender')).toHaveCount(0);
  expect(await pane.boundingBox()).not.toBeNull();
});
