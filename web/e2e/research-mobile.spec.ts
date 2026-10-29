import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { EXPERIMENTS } from '../src/components/research/experiments';

const catalog = JSON.parse(readFileSync(new URL('../../research/papers.json', import.meta.url), 'utf8')) as { papers: { id: string }[] };
const runnable = catalog.papers.flatMap(paper => EXPERIMENTS.filter(e => e.paperId === paper.id));
expect(runnable.length).toBe(EXPERIMENTS.length);
expect(runnable.length).toBeGreaterThan(0);
const paths = ['/research', ...runnable.map(e => e.path)];
const viewports = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 810, height: 1080 },
];

async function audit(page: Page, state: string) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const issues = await page.evaluate(() => {
    const root = document.querySelector('.research')!;
    const visible = (el: Element) => el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true })
      && el.getClientRects().length > 0 && !el.closest('[hidden], details:not([open]) > :not(summary)');
    const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${String(el.getAttribute('class') ?? '')} ${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 90)}`;
    const problems: string[] = [];
    for (const el of [document.documentElement, document.body, root, ...root.querySelectorAll('.rs-shell-app, .rs-panel, [role="tabpanel"], .rs-g-col')]) {
      if (visible(el) && el.scrollWidth > el.clientWidth + 1) problems.push(`overflow ${describe(el)}: ${el.scrollWidth} > ${el.clientWidth}`);
    }
    for (const el of root.querySelectorAll('*')) {
      if (!visible(el) || el.closest('.rs-table-scroll, .rs-table, .sp-checks')) continue;
      const box = el.getBoundingClientRect();
      if (box.left < -1 || box.right > root.clientWidth + 1) problems.push(`outside page ${describe(el)}: ${box.left.toFixed(1)}…${box.right.toFixed(1)}`);
    }
    for (const el of root.querySelectorAll('button, [role="tab"], input, select, a, summary')) {
      if (!visible(el)) continue;
      // Only prose links are exempt; cards, social links and button-styled links inside lists are controls.
      if (el.matches('a') && el.closest('p, li') && !el.closest('.rs-g-actions, .rs-g-runbody h3, .rs-g-thumb, .footer-social') && !el.matches('.btn')) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 43.99 || box.height < 43.99) problems.push(`target ${describe(el)}: ${box.width.toFixed(1)}×${box.height.toFixed(1)}`);
      if (el.matches('input[type="range"]')) {
        const thumb = getComputedStyle(el, '::-webkit-slider-thumb');
        if (parseFloat(thumb.width) < 44 || parseFloat(thumb.height) < 44) problems.push(`slider thumb ${describe(el)}: ${thumb.width}×${thumb.height}`);
      }
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const checked = new Set<Element>();
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const el = node.parentElement;
      if (!node.textContent?.trim() || !el || checked.has(el) || el.closest('script, style, option') || !visible(el)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      if (![...range.getClientRects()].some(r => r.width > 0 && r.height > 0)) continue;
      checked.add(el);
      const size = parseFloat(getComputedStyle(el).fontSize);
      const scale = el instanceof SVGGraphicsElement ? Math.hypot(el.getScreenCTM()?.a ?? 1, el.getScreenCTM()?.b ?? 0) : 1;
      if (size * scale < 11.99) problems.push(`text ${describe(el)}: ${(size * scale).toFixed(2)}px`);
    }
    return problems;
  });
  expect(issues, state).toEqual([]);
}

for (const locale of ['en', 'es', 'pt']) for (const viewport of viewports) {
  test.describe(`@smoke research mobile ${locale} ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    for (const path of paths) {
      test(path, async ({ page }) => {
        await page.goto(`/${locale}${path}/`);
        await expect(page.locator('.research h1')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        if (path !== '/research') {
          const canvas = page.locator('.rs-shell-app .sfv-canvas canvas');
          await expect(canvas).toBeVisible({ timeout: 30_000 });
          await expect.poll(async () => (await canvas.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(280);
          const top = (await canvas.boundingBox())!.y;
          if (viewport.width <= 640 || viewport.height <= 440) {
            expect(top, 'canvas begins within the first 1.5 phone screens, before any scrolling').toBeLessThanOrEqual(viewport.height * 1.5);
          }
          await audit(page, 'initial experiment');
          const camera = page.locator('.rs-shell-app .cam-cube');
          await camera.click();
          await audit(page, 'camera menu');
          await camera.click();
          for (const tab of await page.locator('.rs-shell-app [role="tab"]').all()) {
            await tab.click();
            await expect(tab).toHaveAttribute('aria-selected', 'true');
            await audit(page, `tab ${await tab.textContent()}`);
          }
        }
        await audit(page, 'whole page, including below the fold');
        await page.locator('.nav-toggle').click();
        await audit(page, 'navigation menu');
        await page.locator('.nav-toggle').click();
        await page.getByTestId('nav-lang-button').click();
        await audit(page, 'language menu');
      });
    }
  });
}
