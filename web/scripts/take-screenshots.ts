/**
 * Capture screenshots for the landing page using Playwright.
 *
 * Usage:  npx tsx scripts/take-screenshots.ts
 *
 * Requires dev server running on localhost:4000.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:4000';
const OUT = 'public/screenshots';

// Use a reasonable viewport with 2x DPR for crisp retina images
const VP = { width: 1440, height: 900 };
const DPR = 2;

// Crop region: remove app header (~48px) and status bar (~26px)
// These are CSS pixels; Playwright scales by DPR automatically
const HEADER_H = 48;
const STATUS_H = 26;
const CROP = {
  x: 0,
  y: HEADER_H,
  width: VP.width,
  height: VP.height - HEADER_H - STATUS_H,
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--use-gl=angle',
      '--use-angle=metal',
      '--enable-gpu-rasterization',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
    ],
  });
  const ctx = await browser.newContext({
    viewport: VP,
    deviceScaleFactor: DPR,
    locale: 'en',
  });

  async function freshPage() {
    const page = await ctx.newPage();
    await page.goto(`${BASE}?embed`, { waitUntil: 'networkidle' });
    await sleep(1500);
    return page;
  }

  // ═══ 1. BASIC 2D ═══

  // 1.1 — Portal frame with loads, no results
  // Show sidebar with structure info for context
  {
    const page = await freshPage();
    await page.evaluate(async () => {
      const { modelStore, resultsStore, uiStore } = await import('/src/lib/store/index.ts');
      modelStore.loadExample('portal-frame');
      resultsStore.clear();
      uiStore.leftSidebarOpen = false;
      uiStore.rightSidebarOpen = false;
      setTimeout(() => window.dispatchEvent(new Event('dedaliano-zoom-to-fit')), 100);
    });
    await sleep(1500);
    await page.screenshot({ path: `${OUT}/basic-2d-loads.png`, clip: CROP });
    console.log('✓ basic-2d-loads.png');
    await page.close();
  }

  // 1.2 — Portal frame solved with moment diagram
  {
    const page = await freshPage();
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
    await page.screenshot({ path: `${OUT}/basic-2d-moments.png`, clip: CROP });
    console.log('✓ basic-2d-moments.png');
    await page.close();
  }

  // 1.3 — Section stress analysis — full viewport showing the stress panel + structure
  {
    const page = await freshPage();
    await page.evaluate(async () => {
      const { modelStore, resultsStore, uiStore } = await import('/src/lib/store/index.ts');
      modelStore.loadExample('portal-frame');
      resultsStore.clear();
      uiStore.leftSidebarOpen = false;
      uiStore.rightSidebarOpen = false;
      setTimeout(() => window.dispatchEvent(new Event('dedaliano-zoom-to-fit')), 100);
    });
    await sleep(500);
    await page.evaluate(() => window.dispatchEvent(new Event('dedaliano-solve')));
    await sleep(2000);
    await page.evaluate(async () => {
      const { resultsStore, uiStore, modelStore } = await import('/src/lib/store/index.ts');
      resultsStore.diagramType = 'none';
      uiStore.currentTool = 'select';
      uiStore.selectMode = 'stress';
      const elem = modelStore.elements.get(3);
      if (elem) {
        const nI = modelStore.nodes.get(elem.nodeI);
        const nJ = modelStore.nodes.get(elem.nodeJ);
        if (nI && nJ) {
          resultsStore.stressQuery = {
            elementId: 3,
            t: 0.5,
            worldX: (nI.x + nJ.x) / 2,
            worldY: (nI.y + nJ.y) / 2,
          };
        }
      }
    });
    await sleep(2000);

    // Expand all sections in the stress panel for a richer view
    await page.evaluate(() => {
      document.querySelectorAll('.ssp-panel details:not([open])').forEach(d => (d as HTMLDetailsElement).open = true);
    });
    await sleep(500);

    // Full viewport screenshot (structure + stress panel visible)
    await page.screenshot({ path: `${OUT}/basic-2d-stress.png`, clip: CROP });
    console.log('✓ basic-2d-stress.png');
    await page.close();
  }

  // ═══ 2. BASIC 3D ═══

  // 2.1 — 3D building with loads
  {
    const page = await freshPage();
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
    await page.screenshot({ path: `${OUT}/basic-3d-loads.png`, clip: CROP });
    console.log('✓ basic-3d-loads.png');
    await page.close();
  }

  // 2.2 — Nave industrial with stress ratio color map (σ/fy)
  {
    const page = await freshPage();
    await page.evaluate(async () => {
      const { modelStore, resultsStore, uiStore } = await import('/src/lib/store/index.ts');
      uiStore.analysisMode = '3d';
      uiStore.leftSidebarOpen = false;
      uiStore.rightSidebarOpen = false;
    });
    await sleep(1500);
    await page.evaluate(async () => {
      const { modelStore, resultsStore } = await import('/src/lib/store/index.ts');
      modelStore.loadExample('3d-nave-industrial');
      resultsStore.clear3D();
      setTimeout(() => window.dispatchEvent(new Event('dedaliano-zoom-to-fit')), 200);
    });
    await sleep(2000);
    // Solve
    await page.evaluate(() => window.dispatchEvent(new Event('dedaliano-solve')));
    await sleep(5000);
    // Set color map mode with stress ratio σ/fy
    await page.evaluate(async () => {
      const { resultsStore } = await import('/src/lib/store/index.ts');
      resultsStore.diagramType = 'colorMap';
      resultsStore.colorMapKind = 'stressRatio';
    });
    await sleep(2000);
    await page.screenshot({ path: `${OUT}/basic-3d-deformed.png`, clip: CROP });
    console.log('✓ basic-3d-deformed.png (stress ratio color map)');
    await page.close();
  }

  // ═══ 3. EDUCATIONAL ═══

  // 3.1 — Exercise list panel
  {
    const page = await freshPage();
    await page.evaluate(async () => {
      const { uiStore } = await import('/src/lib/store/index.ts');
      uiStore.analysisMode = 'edu';
    });
    await sleep(1500);
    await page.waitForSelector('.exercise-card', { timeout: 5000 }).catch(() => {});
    await sleep(500);
    await page.screenshot({ path: `${OUT}/edu-exercises.png`, clip: CROP });
    console.log('✓ edu-exercises.png');
    await page.close();
  }

  // 3.2 — First exercise selected (with exercise panel visible)
  {
    const page = await freshPage();
    await page.evaluate(async () => {
      const { uiStore } = await import('/src/lib/store/index.ts');
      uiStore.analysisMode = 'edu';
    });
    await sleep(1500);
    await page.waitForSelector('.exercise-card', { timeout: 5000 }).catch(() => {});
    const cardCount = await page.locator('.exercise-card').count();
    if (cardCount > 0) {
      await page.locator('.exercise-card').first().click();
      await sleep(2000);
    }
    await page.evaluate(() => window.dispatchEvent(new Event('dedaliano-zoom-to-fit')));
    await sleep(500);
    await page.screenshot({ path: `${OUT}/edu-exercise.png`, clip: CROP });
    console.log('✓ edu-exercise.png');
    await page.close();
  }

  // ═══ 4. PRO ═══

  // 4.1 — PRO example solved with results tab
  {
    const page = await freshPage();
    await page.evaluate(async () => {
      const { uiStore } = await import('/src/lib/store/index.ts');
      uiStore.analysisMode = 'pro';
    });
    await sleep(1500);
    await page.waitForSelector('.pro-example-btn', { timeout: 5000 }).catch(() => {});
    const proBtnCount = await page.locator('.pro-example-btn').count();
    if (proBtnCount > 0) {
      await page.locator('.pro-example-btn').click();
      await sleep(3000);
    }
    await page.evaluate(() => window.dispatchEvent(new Event('dedaliano-solve')));
    await sleep(5000);
    const resultsTab = page.locator('button').filter({ hasText: /result/i });
    if (await resultsTab.count() > 0) {
      await resultsTab.first().click();
      await sleep(500);
    }
    await page.evaluate(() => window.dispatchEvent(new Event('dedaliano-zoom-to-fit')));
    await sleep(1000);
    await page.screenshot({ path: `${OUT}/pro-results.png`, clip: CROP });
    console.log('✓ pro-results.png');
    await page.close();
  }

  await browser.close();
  console.log('\n✅ All 8 screenshots captured!');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
