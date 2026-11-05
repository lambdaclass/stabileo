import { test } from '../../e2e/fixtures';
import { mkdirSync } from 'node:fs';

const OUT = process.env.BLOG_SHOTS_OUT ?? 'e2e/.artifacts/blog-shots';
mkdirSync(OUT, { recursive: true });

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

for (const [name, path, scroll] of [
  ['blog-research-phone-paper', '/en/research/form-finding/pastrana-2026/', null],
  ['blog-research-phone-viewer', '/en/research/benchmarks/navier-plate/', '.navier .app'],
] as const) {
  test(`research on a phone: ${name}`, async ({ page }) => {
    await page.goto(path);
    await page.locator('.research h1').waitFor();
    await page.waitForTimeout(8000);
    if (scroll) await page.locator(scroll).first().evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 100));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  });
}
