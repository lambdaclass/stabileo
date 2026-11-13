import { test, expect, type Page } from '@playwright/test';

const GROUPS = [
  { head: 'Product', links: [['Open the editor', null], ['Examples', '/en/examples/'], ['Tools', '/en/tools/'], ['Pricing', '/en/#pricing']] },
  { head: 'Verification', links: [['Reliability', '/en/reliability/'], ['Research', '/en/research/'], ['Paper', '/en/paper/'], ['CIRSOC', '/en/cirsoc/'], ['SAP2000 alternative', '/en/sap2000-alternative/'], ['ETABS alternative', '/en/etabs-alternative/']] },
  { head: 'Project', links: [['Blog', '/en/blog/'], ['Changelog', '/en/changelog/'], ['Terms', '/en/terms/'], ['Privacy', '/en/privacy/'], ['Documentation', /^https:\/\//], ['GitHub', 'https://github.com/lambdaclass/stabileo']] },
] as const;

function footerGroups(page: Page) {
  return page.locator('footer.lp-footer .footer-group').evaluateAll((groups) => groups.map((g) => ({
    head: g.querySelector('.footer-head')?.textContent?.trim(),
    links: [...g.querySelectorAll('li > a, li > button')].map((a) => [a.textContent?.trim(), a.getAttribute('href')]),
  })));
}

test.describe('@smoke landing footer sitemap', () => {
  for (const path of ['/en/', '/en/tools/', '/en/blog/']) {
    test(`${path} has the three-group footer`, async ({ page }) => {
      await page.goto(path);
      const groups = await footerGroups(page);
      expect(groups.map((g) => g.head)).toEqual(GROUPS.map((g) => g.head));
      groups.forEach((g, i) => {
        const want = GROUPS[i].links;
        expect(g.links.map(([text]) => text)).toEqual(want.map(([text]) => text));
        g.links.forEach(([, href], j) => {
          const target = want[j][1];
          if (target === null) expect(href).toBeNull();
          else if (typeof target === 'string') expect(href).toBe(target);
          else expect(href).toMatch(target);
        });
      });
    });
  }

  const PAGES = GROUPS.flatMap((g) => g.links.map(([, href]) => href)).flatMap((h) => (typeof h === 'string' && h.startsWith('/en/') && !h.includes('#') ? [h as string] : []));
  for (const href of PAGES) {
    test(`the footer link ${href} opens a real page`, async ({ page }) => {
      await page.goto(href);
      await expect(page).toHaveURL(new RegExp(`${href.replace(/[/.]/g, '\\$&')}$`));
      const h1 = page.locator('#app h1').first();
      await expect(h1).toBeVisible();
      await expect(h1).not.toHaveText('That post does not exist.');
    });
  }

  test('the footer\'s Pricing link scrolls the landing to the pricing section from another page', async ({ page }) => {
    await page.goto('/en/blog/');
    await expect(page.locator('#prerender')).toHaveCount(0);
    await page.locator('footer.lp-footer a[href="/en/#pricing"]').click();
    await expect(page).toHaveURL(/\/en\/#pricing$/);
    await expect(page.locator('#pricing-title')).toBeInViewport();
  });

  test('the editor entry in the footer opens Basic', async ({ page }) => {
    await page.goto('/en/');
    await page.locator('footer.lp-footer .footer-group').first().getByRole('button', { name: 'Open the editor' }).click();
    await expect(page).toHaveURL(/\/app\/basic(\?|$)/);
  });

  test('the sections link to the pages that extend them', async ({ page }) => {
    await page.goto('/en/');
    const link = (section: string, href: string) => page.locator(`section[data-section="${section}"] a[href="${href}"]`);
    await expect(link('basic', '/en/tools/')).toHaveText('Tools');
    await expect(link('pro-calc', '/en/examples/')).toHaveText('Examples');
    await expect(link('verification', '/en/reliability/')).toHaveText('Reliability');
    await expect(link('verification', '/en/research/')).toHaveText('Research');
    await link('verification', '/en/research/').click();
    await expect(page).toHaveURL(/\/en\/research\/$/);
  });

  for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1440, height: 900 }]) {
    test(`footer and section links at ${viewport.width}px: 44px targets, 12px text, no overflow`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/en/');
      await page.locator('footer.lp-footer').scrollIntoViewIfNeeded();
      const links = await page.locator('footer.lp-footer .footer-group :is(a, button), section:is([data-section="fit"], [data-section="basic"], [data-section="pro-calc"]) .link-row a, section[data-section="verification"] .verification-links a').evaluateAll((els) => els.map((el) => {
        const box = el.getBoundingClientRect();
        return { text: el.textContent?.trim(), height: box.height, width: box.width, right: box.right, font: parseFloat(getComputedStyle(el).fontSize) };
      }));
      expect(links.length).toBe(16 + 2 + 1 + 1 + 4);
      for (const l of links) {
        expect(l.height, `${l.text} height`).toBeGreaterThanOrEqual(44);
        expect(l.width, `${l.text} width`).toBeGreaterThanOrEqual(44);
        expect(l.font, `${l.text} font size`).toBeGreaterThanOrEqual(12);
        expect(l.right, `${l.text} overflows`).toBeLessThanOrEqual(viewport.width);
      }
      expect(await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>('.landing')!;
        return el.scrollWidth <= window.innerWidth && document.documentElement.scrollWidth <= window.innerWidth;
      })).toBe(true);
    });
  }
});
