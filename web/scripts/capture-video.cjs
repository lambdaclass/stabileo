/**
 * Capture workflow screenshots of Dedaliano: model → solve → diagrams.
 * Run: node scripts/capture-video.cjs
 *
 * Produces:
 *   public/screenshots/flow-1-model.png
 *   public/screenshots/flow-2-deformed.png
 *   public/screenshots/flow-3-moment.png
 *   public/screenshots/flow-4-shear.png
 *
 * Optionally stitches them into a video via ffmpeg if available.
 */
const { chromium } = require('playwright');
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');

const BASE_URL = 'http://localhost:4000';
const OUT_DIR = path.resolve(__dirname, '../public/screenshots');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  // Ensure output directory exists
  fs.mkdirSync(OUT_DIR, { recursive: true });

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
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  // Dismiss any dialogs
  page.on('dialog', d => d.dismiss());

  // Helper: remove edu-tooltips and click away
  async function dismissTooltips() {
    await page.evaluate(() => {
      document.querySelectorAll('.edu-tooltip').forEach(el => el.remove());
    });
    await page.mouse.click(640, 400);
    await sleep(300);
  }

  // ── 1. Navigate ────────────────────────────────────────────────
  console.log('[1/9] Navigating to app...');
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

  // ── 2. Open EXAMPLES in the sidebar ────────────────────────────
  console.log('[2/9] Opening examples...');
  const exSection = page.locator('[data-tour="examples-section"]');
  const toggle = exSection.locator('button.section-toggle').first();
  await toggle.click();
  await sleep(500);

  // ── 3. Click "Portal Frame" example ────────────────────────────
  console.log('[3/9] Loading Portal Frame example...');
  // Try English first, then Spanish
  const exBtn = exSection.locator('button.example-item:has-text("Portal Frame")').first();
  if (await exBtn.isVisible({ timeout: 2000 })) {
    await exBtn.click();
  } else {
    const exBtnEs = exSection.locator('button.example-item:has-text("Pórtico")').first();
    await exBtnEs.click();
  }
  await sleep(1500);

  // ── 4. Close examples panel ────────────────────────────────────
  console.log('[4/9] Closing examples panel...');
  await toggle.click();
  await sleep(1000);

  await dismissTooltips();
  await sleep(500);

  // ── Screenshot 1: Model ────────────────────────────────────────
  console.log('[5/9] Screenshot: flow-1-model.png');
  await page.screenshot({ path: path.join(OUT_DIR, 'flow-1-model.png'), type: 'png' });

  // ── 5. Click Solve button ──────────────────────────────────────
  console.log('[6/9] Solving...');
  const solveBtn = page.locator('[data-tour="calcular-btn"]');
  await solveBtn.click();
  await page.mouse.move(640, 400);
  await sleep(2000);
  await dismissTooltips();

  // ── Screenshot 2: Deformed shape ───────────────────────────────
  console.log('[7/9] Screenshot: flow-2-deformed.png');
  await page.screenshot({ path: path.join(OUT_DIR, 'flow-2-deformed.png'), type: 'png' });

  // ── 6. Click Moment diagram button ─────────────────────────────
  console.log('[8/9] Switching to Moment diagram...');
  // The diagram buttons have class "diagram-btn". Text varies by locale.
  // Try clicking via keyboard shortcut first (key "1" = moment after solve)
  // Or find by button text
  const momentBtn = page.locator('button.diagram-btn:has-text("Moment"), button.diagram-btn:has-text("Momento")').first();
  if (await momentBtn.isVisible({ timeout: 1500 })) {
    await momentBtn.click();
  } else {
    // Fallback: use keyboard shortcut "1" for moment
    await page.keyboard.press('1');
  }
  await sleep(1000);
  await dismissTooltips();

  // ── Screenshot 3: Moment diagram ───────────────────────────────
  console.log('[8/9] Screenshot: flow-3-moment.png');
  await page.screenshot({ path: path.join(OUT_DIR, 'flow-3-moment.png'), type: 'png' });

  // ── 7. Click Shear diagram button ──────────────────────────────
  console.log('[9/9] Switching to Shear diagram...');
  const shearBtn = page.locator('button.diagram-btn:has-text("Shear"), button.diagram-btn:has-text("Corte")').first();
  if (await shearBtn.isVisible({ timeout: 1500 })) {
    await shearBtn.click();
  } else {
    await page.keyboard.press('2');
  }
  await sleep(1000);
  await dismissTooltips();

  // ── Screenshot 4: Shear diagram ────────────────────────────────
  console.log('[9/9] Screenshot: flow-4-shear.png');
  await page.screenshot({ path: path.join(OUT_DIR, 'flow-4-shear.png'), type: 'png' });

  // ── 8. Click Axial diagram button (bonus) ──────────────────────
  const axialBtn = page.locator('button.diagram-btn:has-text("Axial"), button.diagram-btn:has-text("Axil")').first();
  if (await axialBtn.isVisible({ timeout: 1500 })) {
    await axialBtn.click();
  } else {
    await page.keyboard.press('3');
  }
  await sleep(1000);
  await dismissTooltips();
  await page.screenshot({ path: path.join(OUT_DIR, 'flow-5-axial.png'), type: 'png' });
  console.log('Bonus: flow-5-axial.png saved');

  await browser.close();

  console.log('\nAll screenshots saved to:', OUT_DIR);
  console.log('  flow-1-model.png');
  console.log('  flow-2-deformed.png');
  console.log('  flow-3-moment.png');
  console.log('  flow-4-shear.png');
  console.log('  flow-5-axial.png');

  // ── Try to create video with ffmpeg ────────────────────────────
  try {
    execSync('which ffmpeg', { stdio: 'ignore' });
    console.log('\nffmpeg found — creating video...');

    // Create a concat file for ffmpeg with 2s per frame
    const frames = [
      'flow-1-model.png',
      'flow-2-deformed.png',
      'flow-3-moment.png',
      'flow-4-shear.png',
      'flow-5-axial.png',
    ];
    const concatPath = path.join(OUT_DIR, 'frames.txt');
    const concatContent = frames
      .map(f => `file '${f}'\nduration 2`)
      .join('\n') + `\nfile '${frames[frames.length - 1]}'`;
    fs.writeFileSync(concatPath, concatContent);

    const videoPath = path.join(OUT_DIR, 'workflow.mp4');
    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${concatPath}" -vf "scale=1280:720" -pix_fmt yuv420p -c:v libx264 -r 1 "${videoPath}"`,
      { cwd: OUT_DIR, stdio: 'inherit' }
    );
    fs.unlinkSync(concatPath);
    console.log('Video saved to:', videoPath);
  } catch {
    console.log('\nffmpeg not available — skipping video creation.');
    console.log('Individual frames are ready for use as slides.');
  }
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
