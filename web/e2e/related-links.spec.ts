import { test, expect, type Page } from '@playwright/test';

const PAGES = ['/en/research/form-finding/pastrana-2026/', '/en/tools/truss-2d/'];
const VIEWPORTS = [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1440, height: 900 }];

function related(page: Page) {
  return page.evaluate(() => {
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
    const lum = (c: string) => {
      const [r, g, b] = rgb(c).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const background = (el: Element | null) => {
      for (; el; el = el.parentElement) {
        const c = getComputedStyle(el).backgroundColor;
        if (rgb(c)[3] !== 0 && c !== 'transparent') return c;
      }
      return 'rgb(255, 255, 255)';
    };
    const nav = document.querySelector('#app nav.rs-related')!;
    const label = nav.querySelector('p')!;
    const links = [...nav.querySelectorAll('a')].map((a) => {
      const style = getComputedStyle(a);
      const [hi, lo] = [lum(style.color), lum(background(a))].sort((x, y) => y - x);
      const box = a.getBoundingClientRect();
      return { text: a.textContent, color: style.color, underline: style.textDecorationLine, bullet: getComputedStyle(a.closest('li')!).listStyleType, contrast: (hi + 0.05) / (lo + 0.05), height: box.height, right: box.right };
    });
    const probe = document.createElement('span');
    probe.style.color = 'var(--lp-slate-2)';
    nav.appendChild(probe);
    const theme = getComputedStyle(probe).color;
    probe.remove();
    return {
      theme,
      labelLeft: label.getBoundingClientRect().left,
      firstLinkLeft: nav.querySelector('a')!.getBoundingClientRect().left,
      h1Left: document.querySelector('#app h1')!.getBoundingClientRect().left,
      links,
      width: document.documentElement.clientWidth,
      overflow: document.querySelector('#app .landing')!.scrollWidth - document.querySelector('#app .landing')!.clientWidth,
    };
  });
}

test.describe('@smoke related research and calculators', () => {
  for (const path of PAGES) {
    for (const viewport of VIEWPORTS) {
      for (const colorScheme of ['dark', 'light'] as const) {
        test(`${path} ${viewport.width}px ${colorScheme}: theme links in the content column`, async ({ page }) => {
          await page.setViewportSize(viewport);
          await page.emulateMedia({ colorScheme });
          await page.goto(path);
          await expect(page.locator('#prerender')).toHaveCount(0);
          await expect(page.locator('#app nav.rs-related a').first()).toBeVisible();
          const r = await related(page);
          expect(r.links.length).toBeGreaterThan(2);
          expect(r.links.map((link) => link.color), 'every related link uses the theme link colour').toEqual(r.links.map(() => r.theme));
          for (const link of r.links) {
            expect(['rgb(0, 0, 238)', 'rgb(85, 26, 139)'], `${link.text} uses the browser's default link colour`).not.toContain(link.color);
            expect(link.contrast, `${link.text}: ${link.color}`).toBeGreaterThanOrEqual(4.5);
            expect(link.underline).toBe('none');
            expect(link.bullet).toBe('none');
            expect(link.height, `${link.text} tap target`).toBeGreaterThanOrEqual(44);
            expect(link.right).toBeLessThanOrEqual(r.width);
          }
          expect(Math.abs(r.labelLeft - r.h1Left), 'the heading lines up with the page title').toBeLessThanOrEqual(1);
          expect(Math.abs(r.firstLinkLeft - r.h1Left), 'the links line up with the page title').toBeLessThanOrEqual(1);
          expect(r.overflow).toBeLessThanOrEqual(0);
        });
      }
    }
  }

  test('a related link shows hover and keyboard focus', async ({ page }) => {
    await page.goto(PAGES[0]);
    await expect(page.locator('#prerender')).toHaveCount(0);
    const link = page.locator('#app nav.rs-related a').first();
    await link.scrollIntoViewIfNeeded();
    const rest = await link.evaluate((a) => getComputedStyle(a).color);
    await link.hover();
    await expect.poll(() => link.evaluate((a) => getComputedStyle(a).color)).not.toBe(rest);
    await page.mouse.move(0, 0);
    await link.focus();
    await expect.poll(() => link.evaluate((a) => getComputedStyle(a).outlineStyle)).toBe('solid');
  });
});
