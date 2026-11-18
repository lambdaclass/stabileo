import { expect, test } from '@playwright/test';
import { EXPERIMENTS } from '../src/components/research/experiments';

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
  for (const e of EXPERIMENTS) {
    test(`@smoke research shell: ${e.path} starts its experiment pane level with the title at ${viewport.width}×${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`/en${e.path}/`);
      await expect(page.locator('h1').first()).toBeVisible();
      const app = page.locator('.rs-shell-app');
      test.skip(await app.count() === 0, 'this page lays out its own panes');
      test.skip(await page.locator('.rs-shell-grid.rs-wide').count() > 0, 'a wide shell puts the app first, in one column');
      const head = (await page.locator('.rs-shell-head').boundingBox())!;
      const pane = (await app.boundingBox())!;
      const article = (await page.locator('.rs-shell-article').boundingBox())!;
      expect(Math.abs(pane.y - head.y)).toBeLessThan(2);
      expect(pane.x).toBeGreaterThan(head.x + head.width);
      expect(pane.x).toBeGreaterThan(article.x + article.width);
      expect(article.y).toBeGreaterThanOrEqual(head.y + head.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}

test('@smoke research shell: the split grid holds only the head, article and app, and places anything else below them', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let checked = 0;
  for (const e of EXPERIMENTS) {
    await page.goto(`/en${e.path}/`);
    await expect(page.locator('h1').first()).toBeVisible();
    if (await page.locator('.rs-shell-wrap.rs-split').count() === 0) continue;
    const shape = await page.evaluate(() => {
      const wrap = document.querySelector('.rs-shell-wrap.rs-split')!;
      const grid = wrap.querySelector(':scope > .rs-shell-grid')!;
      const name = (el: Element) => `${el.tagName.toLowerCase()}.${[...el.classList].filter(c => c.startsWith('rs-shell')).join('.')}`;
      return {
        wrap: [...wrap.children].map(name),
        grid: [...grid.children].map(name),
        display: getComputedStyle(grid).display,
        semantics: [...grid.attributes].map(a => a.name).filter(n => n === 'role' || n.startsWith('aria-')),
      };
    });
    expect(shape, e.path).toEqual({ wrap: ['header.rs-shell-head', 'div.rs-shell-grid'], grid: ['article.rs-shell-article', 'aside.rs-shell-app'], display: 'contents', semantics: [] });
    checked++;
  }
  expect(checked).toBeGreaterThan(0);
  await page.goto(`/en${EXPERIMENTS.find(e => e.paperId === 'heyman-1966')!.path}/`);
  const placed = await page.evaluate(() => {
    const grid = document.querySelector('.rs-shell-wrap.rs-split > .rs-shell-grid')!;
    const stray = document.createElement('div');
    stray.className = (grid.firstElementChild as HTMLElement).className.split(' ').filter(c => c.startsWith('svelte-')).join(' ');
    stray.style.height = '40px';
    grid.appendChild(stray);
    const box = (el: Element) => el.getBoundingClientRect();
    const [s, article, app, head] = [stray, grid.querySelector('.rs-shell-article')!, grid.querySelector('.rs-shell-app')!, document.querySelector('.rs-shell-head')!].map(box);
    return { column: getComputedStyle(stray).gridColumnStart + '/' + getComputedStyle(stray).gridColumnEnd, left: s.left, width: s.width, top: s.top, below: Math.max(article.bottom, app.bottom), head: head.left, right: app.right };
  });
  expect(placed.column).toBe('1/-1');
  expect(placed.top).toBeGreaterThanOrEqual(placed.below - 1);
  expect(Math.abs(placed.left - placed.head)).toBeLessThan(2);
  expect(Math.abs(placed.left + placed.width - placed.right)).toBeLessThan(2);
});
