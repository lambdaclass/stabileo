/**
 * Capture screenshots of Dedaliano structural analysis app.
 * Run: node scripts/capture-screenshots.cjs
 */
const { chromium } = require('playwright');
const path = require('path');

const BASE_URL = 'http://localhost:4000';
const OUT_DIR = path.resolve(__dirname, '../public/screenshots');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--enable-webgl',
      '--enable-webgl2',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-gpu-rasterization',
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2, // retina quality
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  // Dismiss any dialogs
  page.on('dialog', d => d.dismiss());

  // ── Helper: dismiss tooltips ───────────────────────────────────
  async function dismissTooltips() {
    await page.evaluate(() => {
      document.querySelectorAll('.edu-tooltip').forEach(el => el.remove());
    });
    await page.mouse.click(640, 400);
    await sleep(300);
  }

  // ── Helper: collapse examples sidebar section ──────────────────
  async function collapseExamples() {
    const exSection = page.locator('[data-tour="examples-section"]');
    const toggles = exSection.locator('button.section-toggle');
    const count = await toggles.count();
    for (let i = 0; i < count; i++) {
      const text = await toggles.nth(i).textContent();
      if (text && text.includes('\u25BE')) {  // ▾ = expanded
        await toggles.nth(i).click();
        await sleep(200);
      }
    }
  }

  // ── 1. Navigate ────────────────────────────────────────────────
  console.log('1/6 Navigating to app...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await sleep(2000);

  // Close any tour/onboarding overlay
  try {
    const skipBtn = page.locator('button:has-text("Skip"), button:has-text("Saltar"), button:has-text("Cerrar"), button:has-text("Close")');
    if (await skipBtn.first().isVisible({ timeout: 1000 })) {
      await skipBtn.first().click();
      await sleep(500);
    }
  } catch { /* no tour overlay */ }

  // ── 2. Load the portal frame example ───────────────────────────
  console.log('2/6 Loading portal frame example...');
  const exSection = page.locator('[data-tour="examples-section"]');
  const toggle = exSection.locator('button.section-toggle');
  await toggle.click();
  await sleep(500);

  const exBtn = exSection.locator('button.example-item:has-text("Portal Frame")').first();
  if (await exBtn.isVisible({ timeout: 2000 })) {
    await exBtn.click();
  } else {
    const exBtnEs = exSection.locator('button.example-item:has-text("Pórtico")').first();
    await exBtnEs.click();
  }
  await sleep(2000);

  await collapseExamples();
  await dismissTooltips();
  await sleep(500);

  // ── Screenshot 1: Hero 2D ──────────────────────────────────────
  console.log('3/6 Screenshot: hero-2d.png');
  await page.screenshot({ path: path.join(OUT_DIR, 'hero-2d.png'), type: 'png' });

  // ── 3. Solve ───────────────────────────────────────────────────
  console.log('4/6 Solving...');
  const solveBtn = page.locator('[data-tour="calcular-btn"]');
  await solveBtn.click();
  await page.mouse.move(640, 400);
  await sleep(2500);
  await dismissTooltips();

  await page.screenshot({ path: path.join(OUT_DIR, 'hero-2d-solved.png'), type: 'png' });

  // ── 4. Moment diagram ─────────────────────────────────────────
  console.log('5/6 Moment diagram...');
  await page.keyboard.press('3');
  await sleep(1500);
  await dismissTooltips();
  await page.screenshot({ path: path.join(OUT_DIR, 'diagrams.png'), type: 'png' });

  // ── 5. 3D mode with a 3D example ──────────────────────────────
  console.log('6/6 3D mode...');
  // Switch to 3D
  const modeToggle = page.locator('[data-tour="mode-toggle"]');
  const btn3d = modeToggle.locator('button').nth(1);
  await btn3d.click();
  await sleep(2000);

  // Open 3D examples section
  const exSection3D = page.locator('[data-tour="examples-section"]');
  const toggles3D = exSection3D.locator('button.section-toggle');
  const toggleCount = await toggles3D.count();

  // Click the 3D examples toggle (second one)
  if (toggleCount >= 2) {
    await toggles3D.nth(1).click();
  } else {
    await toggles3D.first().click();
  }
  await sleep(500);

  // Load 3D Portal Frame
  const portal3DBtn = exSection3D.locator('button.example-item:has-text("3D Portal")').first();
  try {
    if (await portal3DBtn.isVisible({ timeout: 1500 })) {
      await portal3DBtn.click();
    } else {
      const firstEx = exSection3D.locator('button.example-item').first();
      await firstEx.click();
    }
  } catch {
    const firstEx = exSection3D.locator('button.example-item').first();
    await firstEx.click();
  }
  await sleep(2000);

  // Trigger zoom-to-fit: press F key (keyboard shortcut for zoom-to-fit)
  await page.keyboard.press('f');
  await sleep(2000);

  // Also dispatch the custom event as a fallback
  await page.evaluate(() => {
    window.dispatchEvent(new Event('dedaliano-zoom-to-fit'));
  });
  await sleep(2000);

  // Collapse examples
  await collapseExamples();
  await dismissTooltips();
  await sleep(500);

  await page.screenshot({ path: path.join(OUT_DIR, 'hero-3d.png'), type: 'png' });

  await browser.close();
  console.log('Done! Screenshots saved to', OUT_DIR);
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
