/**
 * Dragging an Explore slider changes the diagram on screen as it goes: no frame between two steps
 * draws the structure without it, and the last frame is the solve of the last value.
 */
import { test, expect } from './fixtures';

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

    await page.getByTestId('rb-cmd-advanced').click();
    await page.locator('button.adv-btn', { hasText: /Explore|Explorar/ }).first().click();
    const panel = page.getByTestId('whatif-panel');
    await expect(panel).toBeVisible();
    await expect.poll(async () => (await frame()).drawn).toBe(true);
    const before = (await frame()).maxMoment!;
    const distributed = () => page.evaluate(() => window.__stabileo.allLoads().find(load => load.type === 'distributed')!.data as { qI: number; qJ: number });
    const original = await distributed();

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
    expect(await distributed()).toMatchObject({ qI: 3 * original.qI, qJ: 3 * original.qJ });
    const last = await frame();
    expect(last.held).toBe(false);
    const fresh = await page.evaluate(() => window.__stabileo.freshMaxMoment());
    expect(fresh).not.toBeNull();
    expect(Math.abs(last.maxMoment! - fresh!)).toBeLessThan(1e-9 * Math.max(1, fresh!));
    expect(last.maxMoment!).toBeGreaterThan(before);
  });
});

test('@slow explore live clears a painted interior peak when live calculation is disabled during an edit', async ({ page }) => {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions);
  await page.evaluate(() => window.__stabileoActions.loadExample('simply-supported'));
  await page.evaluate(() => window.__stabileoActions.setLiveCalc(true));
  await page.evaluate(() => window.__stabileoActions.solve());
  await page.getByTestId('rb-cmd-momentY').click();
  const frame = () => page.evaluate(() => window.__stabileo.screenFrame());
  await expect.poll(async () => (await frame()).maxMoment).toBeCloseTo(10 * 6 ** 2 / 8, 9);
  expect(await page.evaluate(() => window.__stabileo.freshMaxMoment())).toBeCloseTo(10 * 6 ** 2 / 8, 9);
  const held = await page.evaluate(async () => {
    window.__stabileoActions.updateSection(1, { iy: 0.000196 });
    for (let i = 0; i < 10; i++) {
      await new Promise(requestAnimationFrame);
      const painted = window.__stabileo.screenFrame();
      if (painted.held) {
        window.__stabileoActions.setLiveCalc(false);
        return painted;
      }
    }
    return window.__stabileo.screenFrame();
  });
  expect(held).toMatchObject({ drawn: true, held: true, diagram: 'moment' });
  await expect.poll(frame).toMatchObject({ drawn: false, held: false, diagram: 'none', maxMoment: null });
  await page.evaluate(async () => {
    await new Promise(resolve => setTimeout(resolve, 600));
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  expect(await frame()).toMatchObject({ drawn: false, held: false, diagram: 'none', maxMoment: null });
  expect(await page.evaluate(() => window.__stabileo.hasDrawnResults())).toBe(false);
});

test('@slow known wrong result: #1927 — held stress-map strokes and value labels fade together', async ({ page }) => {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions);
  await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
  await page.evaluate(() => window.__stabileoActions.setLiveCalc(true));
  await page.evaluate(() => window.__stabileoActions.solve());
  await page.getByTestId('rb-cmd-stress').click();
  await page.getByRole('combobox').filter({ has: page.locator('option[value="vonMises"]') }).selectOption('vonMises');
  await expect.poll(() => page.evaluate(() => window.__stabileo.diagramType())).toBe('colorMap');
  const samples = await page.evaluate(async () => {
    const proto = CanvasRenderingContext2D.prototype;
    const stroke = proto.stroke, fillText = proto.fillText;
    const strokes: number[] = [], labels: number[] = [];
    proto.stroke = function(...args: [] | [Path2D]) { if (this.lineWidth === 3.5) strokes.push(this.globalAlpha); Reflect.apply(stroke, this, args); };
    proto.fillText = function(...args) {
      if (this.fillStyle === '#e8eef4') labels.push(this.globalAlpha);
      fillText.apply(this, args);
    };
    const schedule = window.setTimeout.bind(window);
    window.setTimeout = ((handler, delay, ...args) => schedule(handler, delay === 120 ? 2000 : delay, ...args)) as typeof window.setTimeout;
    try {
      window.__stabileoActions.updateSection(1, { iy: 0.000196 });
      const start = performance.now();
      while (performance.now() - start < 400) await new Promise(requestAnimationFrame);
      const reference = document.createElement('canvas').getContext('2d')!;
      reference.globalAlpha = 0.45;
      return { held: window.__stabileo.screenFrame().held, strokes, labels, expected: reference.globalAlpha };
    } finally {
      window.setTimeout = schedule;
      proto.stroke = stroke; proto.fillText = fillText;
    }
  });
  expect(samples.held).toBe(true);
  expect([...new Set(samples.strokes)], JSON.stringify(samples.labels)).toContain(samples.expected);
  expect(samples.labels.length).toBeGreaterThan(0);
  expect(samples.labels.at(-1)).toBe(samples.expected);
});

test.skip('@slow known wrong result: #1927 — the point probe reads the moment on the held canvas', async ({ page }) => {
  await page.goto('/app/basic?e2e=1');
  await page.evaluate(() => window.__stabileoActions.loadExample('simply-supported'));
  await page.evaluate(() => window.__stabileoActions.setLiveCalc(true));
  await page.evaluate(() => window.__stabileoActions.solve());
  await page.getByTestId('rb-cmd-momentY').click();
  await expect.poll(() => page.evaluate(() => window.__stabileo.screenFrame().diagram)).toBe('moment');
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T12:00:01Z'));
  const labels = await page.evaluateHandle(() => {
    const captured: string[] = [];
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(...args) {
      if (args[0].startsWith('M = ')) captured.push(args[0]);
      return fillText.apply(this, args);
    };
    return captured;
  });
  const probe = async () => {
    await labels.evaluate(values => { values.length = 0; });
    await page.evaluate(() => {
      const h = window.__stabileo;
      const ends = h.elementEnds(h.elementIds()[0])!;
      const a = h.nodeScreenPos(ends.i)!, b = h.nodeScreenPos(ends.j)!;
      document.querySelector('.viewport2d-wrapper > canvas')!.dispatchEvent(new MouseEvent('mousemove', {
        clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2, bubbles: true,
      }));
    });
    await page.clock.runFor(32);
    return labels.evaluate(values => values.at(-1));
  };
  const fresh = await probe();
  expect(fresh).toMatch(/^M = /);
  await page.evaluate(() => window.__stabileoActions.updateSection(1, { iy: 0.000196 }));
  await page.clock.runFor(16);
  expect(await page.evaluate(() => window.__stabileo.screenFrame().held)).toBe(true);
  expect(await probe()).toBe(fresh);
});
