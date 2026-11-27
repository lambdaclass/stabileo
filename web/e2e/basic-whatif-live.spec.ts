/**
 * Dragging an Explore slider changes the diagram on screen as it goes: no frame between two steps
 * draws the structure without it, and the last frame is the solve of the last value.
 */
import { test, expect } from './fixtures';
import { openAdvancedFunction } from './advanced-panel';

test.describe('@slow explore live', () => {
  test('a dragged load slider keeps the diagram drawn and ends on a fresh solve', async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => { try { localStorage.setItem('liveCalc', 'false'); } catch { /* private mode */ } });
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await page.evaluate(() => window.__stabileoActions.solve());
    await page.getByTestId('rb-cmd-momentY').click();
    const frame = () => page.evaluate(() => window.__stabileo.screenFrame());
    await expect.poll(async () => (await frame()).diagram).toBe('moment');

    await openAdvancedFunction(page, 'whatif');
    const panel = page.getByTestId('whatif-panel');
    await expect(panel).toBeVisible();
    await expect.poll(async () => (await frame()).drawn).toBe(true);
    const before = (await frame()).maxMoment!;

    // A slower machine: each solve then spans frames, so the frames between an edit and its solve are sampled.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 8 });
    const slider = panel.locator('input.wif-range').first();
    const samples = await slider.evaluate(async (el: HTMLInputElement) => {
      const seen: Array<{ drawn: boolean; held: boolean; diagram: string; maxMoment: number | null }> = [];
      let sampling = true;
      const sample = () => { seen.push(window.__stabileo.screenFrame()); if (sampling) requestAnimationFrame(sample); };
      requestAnimationFrame(sample);
      const frameDone = () => new Promise((r) => requestAnimationFrame(r));
      for (let v = 1.1; v <= 3.0001; v += 0.1) {
        el.value = v.toFixed(2);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await frameDone();
        await frameDone();
      }
      const start = performance.now();
      while (window.__stabileo.screenFrame().held && performance.now() - start < 20_000) await frameDone();
      for (let i = 0; i < 10; i++) await frameDone();
      sampling = false;
      return seen;
    });

    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    expect(samples.length).toBeGreaterThan(30);
    expect(samples.filter((s) => !s.drawn || s.diagram !== 'moment')).toEqual([]);
    expect(samples.some((s) => s.held)).toBe(true);
    const distinct = new Set(samples.map((s) => s.maxMoment!.toPrecision(9)));
    expect(distinct.size).toBeGreaterThan(5);

    await expect(panel.locator('.wif-val').first()).toHaveText('3.00×');
    await expect(panel.getByTestId('whatif-diagram-moment')).toHaveClass(/active/);
    const last = await frame();
    expect(last.held).toBe(false);
    const fresh = await page.evaluate(() => window.__stabileo.freshMaxMoment());
    expect(fresh).not.toBeNull();
    expect(Math.abs(last.maxMoment! - fresh!)).toBeLessThan(1e-9 * Math.max(1, fresh!));
    expect(last.maxMoment!).toBeGreaterThan(before);
  });
});

test('@slow the painted and freshly solved simple-span moments include midspan', async ({ page }) => {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions && window.__stabileo.solverReady());
  await page.evaluate(() => window.__stabileoActions.loadExample('simply-supported'));
  await page.evaluate(() => window.__stabileoActions.solve());
  await page.getByTestId('rb-cmd-momentY').click();
  const moment = 10 * 6 ** 2 / 8;
  await expect.poll(() => page.evaluate(() => window.__stabileo.screenFrame().maxMoment)).toBeCloseTo(moment, 9);
  expect(await page.evaluate(() => window.__stabileo.freshMaxMoment())).toBeCloseTo(moment, 9);
});

test('@slow releasing a held diagram clears the idle canvas without a replacement solve', async ({ page }) => {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions && window.__stabileo.solverReady());
  await page.evaluate(() => window.__stabileoActions.loadExample('simply-supported'));
  await page.evaluate(() => window.__stabileoActions.solve());
  await page.getByTestId('rb-cmd-momentY').click();
  await expect.poll(() => page.evaluate(() => window.__stabileo.screenFrame().drawn)).toBe(true);
  await page.evaluate(() => window.__stabileoActions.holdScreen());
  await expect.poll(() => page.evaluate(() => window.__stabileo.screenFrame().held)).toBe(true);
  await expect(page.locator('.viewport2d-wrapper .pending-result')).toBeVisible();
  const canvas = page.locator('.viewport2d-wrapper canvas').first();
  const repainted = await canvas.evaluate(async el => {
    const surface = el as HTMLCanvasElement;
    const context = surface.getContext('2d')!;
    const clear = context.clearRect.bind(context);
    let lastPaint = performance.now();
    context.clearRect = (...bounds) => { lastPaint = performance.now(); clear(...bounds); };
    const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    try {
      while (performance.now() - lastPaint < 350) await frame();
      const heldImage = surface.toDataURL();
      window.__stabileoActions.releaseScreen();
      await frame();
      await frame();
      return surface.toDataURL() !== heldImage;
    } finally {
      context.clearRect = clear;
    }
  });
  expect(repainted).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__stabileo.screenFrame().drawn)).toBe(false);
  await expect(page.locator('.viewport2d-wrapper .pending-result')).toHaveCount(0);
});

test('@slow a pending moment diagram never connects its old forces to a moved endpoint', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('liveCalc', 'false'));
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions && window.__stabileo.solverReady());
  await page.evaluate(() => window.__stabileoActions.loadExample('simply-supported'));
  await page.evaluate(() => window.__stabileoActions.solve());
  await page.getByTestId('rb-cmd-momentY').click();
  await expect.poll(() => page.evaluate(() => window.__stabileo.screenFrame().drawn)).toBe(true);
  const canvas = page.locator('.viewport2d-wrapper canvas').first();
  const observed = await canvas.evaluate(async element => {
    const canvas = element as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const { moveTo, lineTo, stroke } = ctx;
    let first = NaN, last = NaN;
    const ends: number[][] = [];
    ctx.moveTo = (x, y) => { first = x; moveTo.call(ctx, x, y); };
    ctx.lineTo = (x, y) => { last = x; lineTo.call(ctx, x, y); };
    ctx.stroke = () => {
      if (ctx.strokeStyle === '#e5482a') ends.push([first, last]);
      stroke.call(ctx);
    };
    const paint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    try {
      const file = JSON.parse(window.__stabileo.serializeProject());
      const bar = file.snapshot.elements[0][1];
      const expected = [bar.nodeI, bar.nodeJ].map(id => window.__stabileo.nodeScreenPos(id)!.x - canvas.getBoundingClientRect().left);
      window.__stabileoActions.holdScreen();
      await paint();
      const original = ends.splice(0);
      const tip = file.snapshot.nodes.find(([id]: [number]) => id === bar.nodeJ)[1];
      window.__stabileoActions.moveNode(tip.id, tip.x + 1, tip.y, tip.z ?? 0);
      await paint();
      return { original, expected, after: ends, frame: window.__stabileo.screenFrame() };
    } finally {
      Object.assign(ctx, { moveTo, lineTo, stroke });
    }
  });
  expect(observed.original.length).toBeGreaterThan(0);
  for (const endpoints of observed.original) expect(endpoints).toEqual(observed.expected);
  expect(observed.after).toEqual([]);
  expect(observed.frame).toMatchObject({ held: false, drawn: false });
});
