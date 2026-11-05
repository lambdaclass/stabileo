import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { EXPERIMENTS } from '../src/components/research/experiments';

const catalog = JSON.parse(readFileSync(new URL('../../research/papers.json', import.meta.url), 'utf8')) as { papers: { id: string }[] };
const runnable = catalog.papers.flatMap(paper => EXPERIMENTS.filter(e => e.paperId === paper.id));
expect(runnable.length).toBe(EXPERIMENTS.length);
expect(runnable.length).toBeGreaterThan(0);
const paths = ['/research', ...runnable.map(e => e.path)];
const APP = ':is(.rs-shell-app, .navier .app)';
const viewports = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 810, height: 1080 },
];

const test = base.extend<{}, { researchPage: Page }>({
  researchPage: [async ({ browser }, use, workerInfo) => {
    const opts = workerInfo.project.use;
    const context = await browser.newContext({
      baseURL: opts.baseURL,
      deviceScaleFactor: opts.deviceScaleFactor,
      colorScheme: opts.colorScheme,
      locale: opts.locale,
      timezoneId: opts.timezoneId,
      storageState: opts.storageState,
      viewport: viewports[0],
      hasTouch: true,
      isMobile: true,
      reducedMotion: 'reduce',
    });
    try {
      await use(await context.newPage());
    } finally {
      await context.close();
    }
  }, { scope: 'worker' }],
});

async function audit(page: Page, state: string) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const issues = await page.evaluate(() => {
    const root = document.querySelector('.research')!;
    const visible = (el: Element) => el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true })
      && el.getClientRects().length > 0 && !el.closest('[hidden], details:not([open]) > :not(summary), .sr-only');
    const scrolls = (el: Element) => {
      for (let a = el.parentElement; a && a !== root; a = a.parentElement) {
        if (['auto', 'scroll'].includes(getComputedStyle(a).overflowX)) return true;
      }
      return false;
    };
    const px = (value: string) => {
      const n = parseFloat(value);
      if (value.trim().endsWith('rem')) return n * parseFloat(getComputedStyle(document.documentElement).fontSize);
      return value.trim().endsWith('px') ? n : NaN;
    };
    const thumbRules = (input: Element) => {
      const sizes: [number, number][] = [];
      const walk = (rules: CSSRuleList) => {
        for (const rule of rules) {
          if (rule instanceof CSSStyleRule) {
            for (const selector of rule.selectorText.split(',')) {
              const base = selector.trim().replace(/::-webkit-slider-thumb$/, '');
              if (base === selector.trim() || !input.matches(base || '*')) continue;
              if (rule.style.width || rule.style.height) sizes.push([px(rule.style.width), px(rule.style.height)]);
            }
          }
          if ('cssRules' in rule && (!(rule instanceof CSSMediaRule) || matchMedia(rule.conditionText).matches)) walk((rule as CSSGroupingRule).cssRules);
        }
      };
      for (const sheet of document.styleSheets) {
        try { walk(sheet.cssRules); } catch { continue; }
      }
      return sizes;
    };
    const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${String(el.getAttribute('class') ?? '')} ${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 90)}`;
    const problems: string[] = [];
    for (const el of [document.documentElement, document.body, root, ...root.querySelectorAll('.rs-shell-app, .navier .app, .rs-panel, [role="tabpanel"], .rs-g-col')]) {
      if (visible(el) && el.scrollWidth > el.clientWidth + 1) problems.push(`overflow ${describe(el)}: ${el.scrollWidth} > ${el.clientWidth}`);
    }
    for (const el of root.querySelectorAll('*')) {
      if (!visible(el) || el.closest('.rs-table-scroll, .rs-table, .sp-checks') || scrolls(el)) continue;
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
        const sizes = thumbRules(el);
        if (!sizes.length || sizes.some(([w, h]) => !(w >= 44 && h >= 44))) problems.push(`slider thumb ${describe(el)}: ${JSON.stringify(sizes)}`);
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

for (const locale of ['en', 'es', 'pt']) {
  test.describe(`@smoke research mobile ${locale}`, () => {
    for (const path of paths) {
      for (const viewport of viewports) {
        test(`${path} ${viewport.width}×${viewport.height}`, async ({ researchPage: page }) => {
          test.setTimeout(45_000);
          // Each viewport has its own smoke budget. Adjacent cases reuse the loaded
          // experiment, but any case can also start cold after a retry or shard split.
          const pathname = `/${locale}${path}/`;
          await page.setViewportSize(viewport);
          if (new URL(page.url(), 'http://localhost').pathname !== pathname) {
            await page.goto(pathname);
          }
          await expect(page.locator('.research h1')).toBeVisible();
          await page.evaluate(() => document.fonts.ready);
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
          await expect(page.locator('.research h1')).toBeVisible();
          const initialTabs: Locator[] = [];
          if (path !== '/research') {
            const canvas = page.locator(`${APP} .sfv-canvas canvas`);
            await expect(canvas).toBeVisible({ timeout: 30_000 });
            await expect.poll(async () => (await canvas.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(280);
            const top = (await canvas.boundingBox())!.y;
            if (viewport.width <= 640 || viewport.height <= 440) {
              expect(top, 'canvas begins within the first 1.5 phone screens, before any scrolling').toBeLessThanOrEqual(viewport.height * 1.5);
            }
            await audit(page, 'initial experiment');
            const camera = page.locator(`${APP} .cam-cube`);
            await camera.click();
            await audit(page, 'camera menu');
            const outside = await page.locator(`${APP} .cam-backdrop`).evaluate((backdrop) => {
              const box = backdrop.getBoundingClientRect();
              for (let y = Math.min(box.bottom, innerHeight) - 2; y > Math.max(box.top, 0); y -= 8) {
                for (let x = Math.max(box.left, 0) + 2; x < Math.min(box.right, innerWidth); x += 8) {
                  if (document.elementFromPoint(x, y) === backdrop) return { x, y };
                }
              }
              return null;
            });
            expect(outside, 'some of the page outside the camera menu closes it').not.toBeNull();
            await page.mouse.click(outside!.x, outside!.y);
            await expect(camera).toHaveAttribute('aria-expanded', 'false');
            const tabs = await page.locator(`${APP} [role="tab"]`).all();
            for (const tab of tabs) {
              if (await tab.getAttribute('aria-selected') === 'true') initialTabs.push(tab);
            }
            for (const tab of tabs) {
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
          await page.getByTestId('nav-lang-button').click();
          for (const tab of initialTabs) {
            await tab.click();
            await expect(tab).toHaveAttribute('aria-selected', 'true');
          }
        });
      }
    }
  });
}
