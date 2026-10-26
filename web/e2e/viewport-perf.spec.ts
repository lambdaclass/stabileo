/**
 * Where the 3D viewport actually spends its time.
 *
 * ── Why this spec is shaped the way it is ────────────────────────────────────
 * The viewport renders ON DEMAND: `Viewport3D.svelte` only re-schedules a frame
 * while something needs one (camera motion, animation, held nav key). When the
 * scene is quiet the render loop STOPS. Two consequences drive everything below.
 *
 * 1. There is no such thing as "idle fps". Zero frames render, so a reading taken
 *    while the scene is quiet is not a measurement of idle — it is whatever the
 *    HUD last flushed, frozen. The earlier version of this spec sampled exactly
 *    that and labelled it `idle`; it was really the tail of model LOAD.
 *
 * 2. A sample must cover a window that lies ENTIRELY inside the gesture. The HUD
 *    flushes every ~250ms, unaligned to when a gesture starts, so the first window
 *    after the gesture begins straddles the boundary and mixes in pre-gesture
 *    frames. `sampleCleanWindow` therefore waits for the HUD's `data-flush`
 *    counter to advance TWICE: edge 1 closes the straddling window, edge 2 closes
 *    the first window fully inside the gesture. That second window is the sample.
 *
 * ── Two kinds of rotation, measured separately ───────────────────────────────
 * They take different code paths, and conflating them hides the thing we care about:
 *
 *   • ARROW KEYS orbit the camera by mutating it directly (Viewport3D ~line 411).
 *     They never fire OrbitControls' `start` event, so the orbit LOD is never even
 *     consulted. Holding a key also keeps the loop continuous. This is the honest
 *     FULL-DETAIL cost of one frame of this model.
 *
 *   • MOUSE DRAG goes through OrbitControls, which fires `start` → `setLowDetail(true)`.
 *
 * NOTE the `orbit:mouse` row is NOT automatically "the LOD row". `applyLowDetail`
 * computes `hideDecor = on && heavy`, so with `heavy === false` it hides NOTHING and
 * the row is just "orbit via OrbitControls, full detail". Whether a model is heavy is
 * `isHeavyModel`: `elements + shells + supports*8 > 3000` (>1200 in `sections` mode).
 * Of the models below only la-bombonera qualifies (2476 + 120 + 205*8 = 4236);
 * 3d-building scores 177 and 3d-tower 56, and their measured ratios are 1.01x and
 * 1.00x — nothing collapsed. Read the printed ratio, do not assume.
 *
 * `setPixelRatio(1)` on orbit start is likewise real in production but INERT here:
 * playwright.config forces `--force-device-scale-factor=1` and `deviceScaleFactor: 1`,
 * so devicePixelRatio is already 1 and dropping it is a no-op. It is not part of any
 * difference this harness can observe.
 *
 * ── Reading the numbers ──────────────────────────────────────────────────────
 * `calls`, `tris` and `geos` come from `renderer.info` as per-frame counts that do
 * not depend on the GPU — trust these across machines. `calls` and `geos` are exact;
 * `tris` is NOT — the HUD prints it as `(tris/1000).toFixed(0)`, so it is quantised
 * to 1000 and anything under ~500 triangles reads as 0k. They do depend on camera
 * framing, since three.js frustum-culls per object.
 *
 * `renderMs` and `syncMs` are measured INSIDE the page around real work, so they
 * are honest costs, but Playwright runs SwiftShader (software GL): treat them as
 * an A/B signal between rows, never as a real-GPU absolute.
 *
 * `fps` needs one more caveat, and it is the easy way to fool yourself here:
 *   • `orbit:fulldet` is SELF-DRIVEN — the key is held and rAF runs the loop, so
 *     its fps is the app's own rate and is meaningful.
 *   • `orbit:mouse` and `zoom` are HARNESS-DRIVEN — each frame needs a
 *     `page.mouse.move`/`wheel` round trip, which costs far more than a frame.
 *     Their fps measures how fast Playwright can dispatch input, NOT how fast the
 *     app renders. Never compare an fps across those two groups. Compare
 *     `renderMs` instead — it is immune to the dispatch rate.
 *
 * ── Tagging ──────────────────────────────────────────────────────────────────
 * `@perf`, deliberately neither `@smoke` nor `@slow`. CI's blocking e2e job runs
 * `--grep @smoke` and its opt-in job runs `--grep @slow` (ci.yml), so nothing here
 * runs in CI. That is on purpose: this is a measuring instrument, not a regression
 * gate, its numbers are only comparable within one machine, and its mouse-driven
 * rows depend on Playwright keeping up with input — under load they stall. The few
 * assertions below are the exceptions that ARE machine-independent, and they are
 * kept deliberately loose.
 *
 * Run: E2E_PORT=<free port> npx playwright test viewport-perf --reporter=list
 */
import { test, expect, loadModel, PRO_URL } from './fixtures';

/** `?perf` switches the HUD on at boot — more robust than seeding localStorage,
 *  which the shared fixture clears before the app boots. */
const PERF_URL = `${PRO_URL}&perf=1`;

interface PerfSample {
  flush: number;
  fps: number;
  renderMs: number;
  syncMs: number;
  calls: number;
  tris: number;
  geos: number;
}

/** Parse the on-screen perf HUD, including its monotonic window counter. */
async function readHud(page: import('@playwright/test').Page): Promise<PerfSample> {
  return page.evaluate(() => {
    const el = document.querySelector('.perf-hud');
    if (!el) throw new Error('perf HUD not present — is ?perf set?');
    const text = el.textContent ?? '';
    const num = (re: RegExp) => {
      const m = text.match(re);
      return m ? parseFloat(m[1]) : NaN;
    };
    return {
      flush: Number(el.getAttribute('data-flush') ?? '0'),
      fps: num(/fps\s*([\d.]+)/),
      renderMs: num(/render\s*([\d.]+)\s*ms/),
      syncMs: num(/sync\s*([\d.]+)\s*ms/),
      calls: num(/draw calls\s*([\d.]+)/),
      tris: num(/tris\s*([\d.]+)k/) * 1000,
      geos: num(/geos\s*([\d.]+)/),
    };
  });
}

/** A row the harness could not drive. Not a failure of the app or of the app's perf. */
class UnavailableRow extends Error {}

/**
 * Drive a gesture until the HUD has closed a window that lies entirely inside it.
 *
 * `step` is called repeatedly to keep the gesture alive; it must be short (~one
 * frame of input) so polling stays fine-grained. Returns the first sample whose
 * window opened after the gesture was already running.
 */
async function sampleCleanWindow(
  page: import('@playwright/test').Page,
  step: (i: number) => Promise<void>,
  label: string,
  required: boolean,
): Promise<PerfSample> {
  const start = await readHud(page);
  const target = start.flush + 2; // edge 1 = straddling window, edge 2 = clean one
  const deadline = Date.now() + 15_000;
  const t0 = Date.now();
  let steps = 0;
  let last = start;
  for (let i = 0; Date.now() < deadline; i++) {
    await step(i);
    steps++;
    last = await readHud(page);
    if (last.flush >= target) return last;
  }
  // Report where it actually got to. "Never advanced" and "advanced but too slowly"
  // have different causes — the first means the gesture never reached the app, the
  // second means the on-demand loop is only rendering a frame per input event.
  const why =
    `${label}: no clean window in ${Date.now() - t0}ms. ` +
    `flush ${start.flush} → ${last.flush} (needed ${target}), ${steps} input steps. ` +
    (last.flush === start.flush
      ? 'Flush never advanced: the gesture is not reaching the viewport at all.'
      : 'Flush advanced but too slowly: the render loop is stopping between input events.');

  // Only the self-driven row is required. The mouse/wheel rows are dispatched BY
  // Playwright, so they can only run as fast as input reaches the page, and that must
  // not void the rows that did measure cleanly.
  //
  // The ~5 s per `mouse.move` once recorded here (3 steps in 15 s on 3d-nave-industrial)
  // was NOT a harness limitation. The render loop used to queue two frames per
  // continuing frame, so the held arrow key of the row before doubled the renders on
  // every tick (up to 65536 in one window). The GPU process was still draining that
  // backlog during the mouse row, and coalesced input waits for a frame. With one frame
  // pending at most (Viewport3D `renderOnce`), a step costs 25–90 ms with five copies
  // of this spec running at once. A row that goes unavailable again is worth a look.
  if (!required) throw new UnavailableRow(why);
  throw new Error(why);
}

/**
 * The three.js canvas specifically. The page has more than one `<canvas>` (the 2D
 * viewport is also one), and `locator('canvas').first()` is not reliably the 3D one
 * — pointing a gesture at the wrong canvas silently measures nothing. Three sets
 * `data-engine` on the renderer's canvas, so key off that.
 */
function gl(page: import('@playwright/test').Page) {
  return page.locator('canvas[data-engine]').first();
}

/** Run an optional row, degrading to `null` when the harness could not drive it. */
async function optional(fn: () => Promise<PerfSample>): Promise<PerfSample | { unavailable: string }> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UnavailableRow) return { unavailable: e.message };
    throw e;
  }
}

/** Sustained mouse drag: the OrbitControls path (which consults the LOD). */
async function orbitByMouse(page: import('@playwright/test').Page): Promise<PerfSample> {
  const box = await gl(page).boundingBox();
  if (!box) throw new Error('no 3D canvas');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  try {
    return await sampleCleanWindow(page, async (i) => {
      await page.mouse.move(cx + Math.cos(i / 3) * 140, cy + Math.sin(i / 3) * 90);
      await page.waitForTimeout(16);
    }, 'orbit(mouse)', false);
  } finally {
    await page.mouse.up();
  }
}

/** Held arrow key: direct camera orbit, full detail, continuous loop, no LOD. */
async function orbitByKeyboard(page: import('@playwright/test').Page): Promise<PerfSample> {
  // No click needed: the nav-key handler is bound to `window`. It only bails when
  // focus sits in an INPUT/TEXTAREA/SELECT, so blur instead of clicking the canvas
  // — a click there would also select an element and change what we are measuring.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.down('ArrowLeft');
  try {
    return await sampleCleanWindow(page, async () => {
      await page.waitForTimeout(16); // the key stays held; the loop drives itself
    }, 'orbit(keyboard)', true);
  } finally {
    await page.keyboard.up('ArrowLeft');
  }
}

/** Wheel zoom in and out: OrbitControls path, but discrete input rather than a drag. */
async function zoom(page: import('@playwright/test').Page): Promise<PerfSample> {
  const box = await gl(page).boundingBox();
  if (!box) throw new Error('no 3D canvas');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  return sampleCleanWindow(page, async (i) => {
    await page.mouse.wheel(0, i % 2 === 0 ? -220 : 180);
    await page.waitForTimeout(16);
  }, 'zoom', false);
}

interface ModelCase {
  name: string;
  /** Upper bound on full-detail draw calls. Set only where the model is large
   *  enough that the number would explode if element batching regressed. */
  maxFullDetailCalls?: number;
}

const MODELS: ModelCase[] = [
  // 2476 elements collapse into ONE batched draw call; measured 7 total. CAUTION: that
  // is at the camera the app boots with, (12, 8, 12) looking at the origin, which on a
  // stadium this size sees almost nothing, because this spec never frames the model.
  // Framed (zoom-to-fit), full detail is ~3300 calls: 205 support gizmos of 7 objects,
  // 1005 node-label sprites, 514 load-value sprites, 240 shell objects. So this bound
  // guards the boot framing, not element batching, and the "814 calls" failure it once
  // reported came from the doubling render loop spinning the camera to a random angle.
  { name: 'la-bombonera', maxFullDetailCalls: 20 },
  // 24 elements, and every drawable object survives culling at this framing, so the
  // total is reproducibly 55 (28 supports + 12 load arrows + 12 node labels + 3).
  // Bounded well above that: the point is to catch an explosion, not to pin 55.
  { name: '3d-tower', maxFullDetailCalls: 90 },
  // No bound on the mid-size models. Their draw calls are dominated by which
  // supports/loads/labels happen to be inside the frustum at the sampled moment,
  // and that swings with camera angle: 3d-nave-industrial measured 102 in one run
  // and 294 in the next. Much of that swing was the doubling render loop turning the
  // camera 0.02 rad per render; since the fix it reads 138–142 run after run, but the
  // angle still depends on how many frames fit in the window, so no bound yet.
  { name: '3d-nave-industrial' },
  { name: '3d-building' },
];

test.describe('@perf 3D viewport cost', () => {
  for (const { name, maxFullDetailCalls } of MODELS) {
    test(`${name}: full-detail orbit / mouse orbit / zoom`, async ({ page }) => {
      await page.goto(PERF_URL);
      await expect.poll(() => page.evaluate(() => !!window.__stabileo)).toBe(true);

      const ids = await loadModel(page, name);
      const counts = await page.evaluate(() => window.__stabileo.counts());

      // Order matters: keyboard first, while the scene is still at full detail and
      // the camera has not been through an OrbitControls cycle.
      const keys = await orbitByKeyboard(page);
      const mouse = await optional(() => orbitByMouse(page));
      const wheel = await optional(() => zoom(page));

      // fps is printed ONLY for the self-driven row. For harness-driven rows it
      // measures Playwright's input dispatch rate, and with discrete wheel input it
      // goes further and becomes nonsense: observed 6, 225, 1099 across repeats of
      // the same zoom. Printing it would just invite the next reader to trust it.
      const row = (label: string, s: PerfSample, selfDriven = false) =>
        `  ${label.padEnd(14)} fps ${(selfDriven ? String(Math.round(s.fps)) : '  n/a').padStart(4)}` +
        ` | render ${s.renderMs.toFixed(2).padStart(7)}ms` +
        ` | sync ${s.syncMs.toFixed(2).padStart(7)}ms` +
        ` | calls ${String(s.calls).padStart(5)}` +
        ` | tris ${String(Math.round(s.tris / 1000)).padStart(5)}k` +
        ` | geos ${String(s.geos).padStart(5)}`;
      const optionalRow = (label: string, r: PerfSample | { unavailable: string }) =>
        'unavailable' in r ? `  ${label.padEnd(14)} UNAVAILABLE — ${r.unavailable}` : row(label, r);

      console.log(`\n=== ${name} — ${ids.length} elements, counts: ${JSON.stringify(counts)}`);
      console.log(row('orbit:fulldet', keys, true));
      console.log(optionalRow('orbit:mouse', mouse));
      console.log(optionalRow('zoom', wheel));
      if (!('unavailable' in mouse)) {
        // Informational ONLY, and weaker than it looks: the two rows are sampled at
        // different camera angles, so this ratio mixes any LOD effect with plain
        // frustum-culling differences. 3d-nave-industrial is below the heavy threshold
        // — the LOD cannot have engaged — yet it printed 0.32x purely from framing.
        // Never read a low ratio as proof the LOD did something.
        const lodRatio = mouse.calls / Math.max(1, keys.calls);
        console.log(`  draw calls, orbit:mouse / orbit:fulldet: ${lodRatio.toFixed(2)}×` +
          ` (framing-sensitive — not a measurement of the LOD)`);
      }

      // Only the self-driven row is asserted. `sampleCleanWindow` already throws if
      // it never closed a window, so reaching here means this is a real live sample.
      expect(keys.calls).toBeGreaterThan(0);

      // The one machine-independent guard: draw calls come from `renderer.info`, so
      // this holds on any GPU. Culling can only ever REDUCE the count, so an upper
      // bound stays valid whatever the camera happens to be framing.
      if (maxFullDetailCalls !== undefined) {
        expect(keys.calls, `${name}: elements should stay batched`).toBeLessThanOrEqual(maxFullDetailCalls);
      }
    });
  }
});
