import { test, expect, type Page } from '@playwright/test';

const PAPERS = ['/research/benchmarks/lee-frame-1968', '/research/optimization/andreassen-2011'];
const VIEWPORTS = [{ width: 390, height: 844 }, { width: 1440, height: 900 }];

async function sampleScroll(page: Page, ms: number) {
  return page.evaluate(async (duration) => {
    const samples: number[] = [];
    const end = performance.now() + duration;
    while (performance.now() < end) {
      const scroller = document.querySelector<HTMLElement>('#app .landing');
      samples.push(Math.max(window.scrollY, document.scrollingElement?.scrollTop ?? 0, scroller?.scrollTop ?? 0));
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return samples;
  }, ms);
}

for (const viewport of VIEWPORTS) {
  for (const paper of PAPERS) {
    test(`@smoke ${paper} opens at the top and stays there through autoplay at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(`/en${paper}/`);
      await expect(page.locator('#app .landing h1').first()).toBeVisible();
      await expect(page.locator('#app .landing canvas').first()).toBeVisible();
      const samples = await sampleScroll(page, 4000);
      expect(Math.max(...samples), `scroll samples: ${samples}`).toBe(0);
    });

    test(`@smoke ${paper} opened from a scrolled gallery starts at the top at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/en/research/');
      const card = page.locator(`#app .landing a[href$="${paper}/"]`).first();
      await page.locator('#app .landing').evaluate((el, selector) => {
        const target = el.querySelector<HTMLElement>(selector)!;
        el.scrollTo({ top: Math.max(0, target.getBoundingClientRect().top + el.scrollTop - 200), behavior: 'instant' });
      }, `a[href$="${paper}/"]`);
      expect(await page.locator('#app .landing').evaluate(el => el.scrollTop)).toBeGreaterThan(100);
      await card.click();
      await expect(page).toHaveURL(new RegExp(`/en${paper}/$`));
      await expect(page.locator('#app .landing canvas').first()).toBeVisible();
      const samples = await sampleScroll(page, 4000);
      expect(Math.max(...samples), `scroll samples: ${samples}`).toBe(0);
    });
  }

  test(`@smoke the public header has the same typography on every public page at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const read = async (path: string) => {
      await page.goto(`/en${path}`);
      await expect(page.locator('#app .landing h1').first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      return page.locator('#app nav.site-header').evaluate(header => ({
        height: header.getBoundingClientRect().height,
        items: Array.from(header.querySelectorAll<HTMLElement>('a, button, .nav-name'), el => {
          const style = getComputedStyle(el);
          return `${el.tagName} ${style.fontFamily} ${style.fontSize}/${style.lineHeight} ${style.fontWeight}`;
        }),
      }));
    };
    const landing = await read('/');
    expect(landing.height).toBe(58);
    for (const path of ['/blog/', '/research/', `${PAPERS[0]}/`, '/tools/', '/tools/simply-supported-beam/']) {
      expect(await read(path), path).toEqual(landing);
    }
  });
}
