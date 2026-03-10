/**
 * Capture updated screenshots for the landing page using Playwright.
 *
 * Usage:  npx tsx scripts/take-screenshots.ts
 *
 * Requires dev server running on localhost:4000.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:4000';
const OUT = 'public/screenshots';
const VP = { width: 2560, height: 1440 };

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  // Use headed mode for WebGL support (Three.js needs real GPU)
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--use-gl=angle',
      '--use-angle=metal',        // macOS Metal backend
      '--enable-gpu-rasterization',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
    ],
  });
  const ctx = await browser.newContext({
    viewport: VP,
    deviceScaleFactor: 1,
    locale: 'es',
  });

  // ─── 1. hero-2d.png — Portal frame, no results ───
  {
    const page = await ctx.newPage();
    await page.goto(`${BASE}?embed`, { waitUntil: 'networkidle' });
    await sleep(1500);

    await page.evaluate(async () => {
      const { modelStore, resultsStore, uiStore } = await import('/src/lib/store/index.ts');
      modelStore.loadExample('portal-frame');
      resultsStore.clear();
      uiStore.leftSidebarOpen = false;
      uiStore.rightSidebarOpen = false;
      setTimeout(() => window.dispatchEvent(new Event('dedaliano-zoom-to-fit')), 100);
    });
    await sleep(1000);

    await page.screenshot({ path: `${OUT}/hero-2d.png` });
    console.log('✓ hero-2d.png');
    await page.close();
  }

  // ─── 2. hero-2d-solved.png — Portal frame with moment diagram ───
  {
    const page = await ctx.newPage();
    await page.goto(`${BASE}?embed`, { waitUntil: 'networkidle' });
    await sleep(1500);

    await page.evaluate(async () => {
      const { modelStore, resultsStore, uiStore } = await import('/src/lib/store/index.ts');
      modelStore.loadExample('portal-frame');
      resultsStore.clear();
      uiStore.leftSidebarOpen = true;
      uiStore.rightSidebarOpen = false;
      setTimeout(() => window.dispatchEvent(new Event('dedaliano-zoom-to-fit')), 100);
    });
    await sleep(500);

    await page.evaluate(() => window.dispatchEvent(new Event('dedaliano-solve')));
    await sleep(2000);

    await page.evaluate(async () => {
      const { resultsStore } = await import('/src/lib/store/index.ts');
      resultsStore.diagramType = 'moment';
    });
    await sleep(500);

    await page.screenshot({ path: `${OUT}/hero-2d-solved.png` });
    console.log('✓ hero-2d-solved.png');
    await page.close();
  }

  // ─── 3. diagrams.png — Continuous beam with moment diagram ───
  {
    const page = await ctx.newPage();
    await page.goto(`${BASE}?embed`, { waitUntil: 'networkidle' });
    await sleep(1500);

    await page.evaluate(async () => {
      const { modelStore, resultsStore, uiStore } = await import('/src/lib/store/index.ts');
      modelStore.loadExample('continuous-beam');
      resultsStore.clear();
      uiStore.leftSidebarOpen = true;
      uiStore.rightSidebarOpen = false;
      setTimeout(() => window.dispatchEvent(new Event('dedaliano-zoom-to-fit')), 100);
    });
    await sleep(500);

    await page.evaluate(() => window.dispatchEvent(new Event('dedaliano-solve')));
    await sleep(2000);

    await page.evaluate(async () => {
      const { resultsStore } = await import('/src/lib/store/index.ts');
      resultsStore.diagramType = 'moment';
    });
    await sleep(500);

    await page.screenshot({ path: `${OUT}/diagrams.png` });
    console.log('✓ diagrams.png');
    await page.close();
  }

  // ─── 4. hero-3d.png — 3D building (needs GPU) ───
  {
    const page = await ctx.newPage();
    await page.goto(`${BASE}?embed`, { waitUntil: 'networkidle' });
    await sleep(1500);

    await page.evaluate(async () => {
      const { modelStore, resultsStore, uiStore } = await import('/src/lib/store/index.ts');
      uiStore.analysisMode = '3d';
      uiStore.leftSidebarOpen = false;
      uiStore.rightSidebarOpen = false;
    });
    await sleep(1500);

    await page.evaluate(async () => {
      const { modelStore, resultsStore } = await import('/src/lib/store/index.ts');
      modelStore.loadExample('3d-building');
      resultsStore.clear3D();
      setTimeout(() => window.dispatchEvent(new Event('dedaliano-zoom-to-fit')), 200);
    });
    await sleep(3000);

    await page.screenshot({ path: `${OUT}/hero-3d.png` });
    console.log('✓ hero-3d.png');
    await page.close();
  }

  // ─── 5. edu-exercise.png — EDU mode with first exercise loaded ───
  {
    const page = await ctx.newPage();
    await page.goto(`${BASE}?embed`, { waitUntil: 'networkidle' });
    await sleep(1500);

    await page.evaluate(async () => {
      const { uiStore, resultsStore } = await import('/src/lib/store/index.ts');
      uiStore.analysisMode = 'edu';
      resultsStore.showReactions = false;
      resultsStore.diagramType = 'none';
    });
    await sleep(1000);

    await page.waitForSelector('.exercise-card', { timeout: 5000 }).catch(() => {});
    const cardCount = await page.locator('.exercise-card').count();
    if (cardCount > 0) {
      await page.locator('.exercise-card').first().click();
      await sleep(2000);
    }

    await page.evaluate(() => window.dispatchEvent(new Event('dedaliano-zoom-to-fit')));
    await sleep(500);

    await page.screenshot({ path: `${OUT}/edu-exercise.png` });
    console.log('✓ edu-exercise.png');
    await page.close();
  }

  // ─── 6. pro-results.png — PRO mode, building solved, results tab ───
  {
    const page = await ctx.newPage();
    await page.goto(`${BASE}?embed`, { waitUntil: 'networkidle' });
    await sleep(1500);

    await page.evaluate(async () => {
      const { uiStore } = await import('/src/lib/store/index.ts');
      uiStore.analysisMode = 'pro';
    });
    await sleep(1500);

    // Click PRO example button
    await page.waitForSelector('.pro-example-btn', { timeout: 5000 }).catch(() => {});
    const proBtnCount = await page.locator('.pro-example-btn').count();
    if (proBtnCount > 0) {
      await page.locator('.pro-example-btn').click();
      await sleep(3000);
    }

    // Solve
    await page.evaluate(() => window.dispatchEvent(new Event('dedaliano-solve')));
    await sleep(5000);

    // Click Results tab
    const resultsTab = page.locator('button').filter({ hasText: /resultado/i });
    if (await resultsTab.count() > 0) {
      await resultsTab.first().click();
      await sleep(500);
    }

    await page.evaluate(() => window.dispatchEvent(new Event('dedaliano-zoom-to-fit')));
    await sleep(1000);

    await page.screenshot({ path: `${OUT}/pro-results.png` });
    console.log('✓ pro-results.png');
    await page.close();
  }

  await browser.close();
  console.log('\n✅ All screenshots captured!');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
