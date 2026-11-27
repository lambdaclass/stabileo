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
    await page.evaluate(() => window.__stabileoActions.loadExample('simply-supported'));
    await page.evaluate(() => window.__stabileoActions.solve());
    await page.getByTestId('rb-cmd-momentY').click();
    const frame = () => page.evaluate(() => window.__stabileo.screenFrame());
    await expect.poll(async () => (await frame()).diagram).toBe('moment');

    await openAdvancedFunction(page, 'whatif');
    const panel = page.getByTestId('whatif-panel');
    await expect(panel).toBeVisible();
    await expect.poll(async () => (await frame()).drawn).toBe(true);
    const before = (await frame()).maxMoment!;
    expect(before).toBeCloseTo(10 * 6 ** 2 / 8, 9);

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
    for (const [i, sample] of samples.entries()) expect(sample.maxMoment!).toBeGreaterThanOrEqual(i ? samples[i - 1]!.maxMoment! : before);
    const distinct = new Set(samples.map((s) => s.maxMoment!.toPrecision(9)));
    expect(distinct.size).toBeGreaterThan(5);

    await expect(panel.locator('.wif-val').first()).toHaveText('3.00×');
    await expect(panel.getByTestId('whatif-diagram-moment')).toHaveClass(/active/);
    const last = await frame();
    expect(last.held).toBe(false);
    const fresh = await page.evaluate(() => window.__stabileo.freshMaxMoment());
    expect(fresh).not.toBeNull();
    expect(Math.abs(last.maxMoment! - fresh!)).toBeLessThan(1e-9 * Math.max(1, fresh!));
    expect(last.maxMoment!).toBeCloseTo(3 * 10 * 6 ** 2 / 8, 9);
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

test('@slow a pending moment diagram never connects its old forces to a moved endpoint', async ({ page, browser }) => {
  await page.addInitScript(() => localStorage.setItem('liveCalc', 'false'));
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions && window.__stabileo.solverReady());
  const canvas = page.locator('.viewport2d-wrapper canvas').first();
  const size = await canvas.evaluate(el => ({ width: (el as HTMLCanvasElement).width, height: (el as HTMLCanvasElement).height }));
  const sizeCanvas = async (target: typeof page) => {
    await target.addStyleTag({ content: `.viewport2d-wrapper { flex: none !important; width: ${size.width}px !important; height: ${size.height}px !important; }` });
    const surface = target.locator('.viewport2d-wrapper canvas').first();
    await expect(surface).toHaveAttribute('width', String(size.width));
    await expect(surface).toHaveAttribute('height', String(size.height));
  };
  await sizeCanvas(page);
  await page.evaluate(() => window.__stabileoActions.loadExample('simply-supported'));
  await page.evaluate(() => window.__stabileoActions.solve());
  await page.getByTestId('rb-cmd-momentY').click();
  await expect.poll(() => page.evaluate(() => window.__stabileo.screenFrame().drawn)).toBe(true);
  const observed = await canvas.evaluate(async element => {
    const canvas = element as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const { moveTo, lineTo, stroke } = ctx;
    let first = NaN, last = NaN, segments = 0;
    const ends: number[][] = [];
    let path: DOMPoint[] = [], middle: DOMPoint | undefined;
    ctx.moveTo = (x, y) => { first = x; segments = 0; path = []; moveTo.call(ctx, x, y); };
    ctx.lineTo = (x, y) => { last = x; segments++; path.push(new DOMPoint(x, y)); lineTo.call(ctx, x, y); };
    ctx.stroke = () => {
      if (ctx.strokeStyle === '#e5482a' && segments > 1 && ctx.lineWidth === 2) {
        ends.push([first, last]);
        middle = ctx.getTransform().transformPoint(path[Math.floor(path.length / 2)]);
      }
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
      if (!middle) throw Error('No painted moment curve');
      const { x, y } = middle;
      const patch = () => Array.from(ctx.getImageData(Math.floor(x) - 2, Math.floor(y) - 2, 5, 5).data).join(',');
      const previousPixels = patch();
      const tip = file.snapshot.nodes.find(([id]: [number]) => id === bar.nodeJ)[1];
      window.__stabileoActions.moveNode(tip.id, tip.x + 1, tip.y, tip.z ?? 0);
      await paint();
      const movedPixels = patch();
      const after = ends.splice(0);
      const frame = window.__stabileo.screenFrame();
      return { changed: movedPixels !== previousPixels, x, y, movedPixels, original, expected, after, frame,
        movedImage: canvas.toDataURL(), node: { id: tip.id, x: tip.x + 1, y: tip.y, z: tip.z ?? 0 } };
    } finally {
      Object.assign(ctx, { moveTo, lineTo, stroke });
    }
  });
  expect(observed.original.length).toBeGreaterThan(0);
  for (const endpoints of observed.original) expect(endpoints).toEqual(observed.expected);
  expect(observed.changed).toBe(true);
  const reference = await browser.newPage({ viewport: page.viewportSize()! });
  try {
    await reference.addInitScript(() => localStorage.setItem('liveCalc', 'false'));
    await reference.goto(page.url());
    await reference.waitForFunction(() => !!window.__stabileoActions && window.__stabileo.solverReady());
    await reference.evaluate(async node => {
      await window.__stabileoActions.loadExample('simply-supported');
      window.__stabileoActions.moveNode(node.id, node.x, node.y, node.z);
    }, observed.node);
    const referenceCanvas = reference.locator('.viewport2d-wrapper canvas').first();
    await sizeCanvas(reference);
    const clean = await referenceCanvas.evaluate(async (el, { x, y }) => {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const canvas = el as HTMLCanvasElement;
      const pixels = canvas.getContext('2d')!.getImageData(Math.floor(x) - 2, Math.floor(y) - 2, 5, 5).data;
      return { patch: Array.from(pixels).join(','), image: canvas.toDataURL(), drawn: window.__stabileo.screenFrame().drawn };
    }, { x: observed.x, y: observed.y });
    expect(clean.drawn).toBe(false);
    expect(observed.movedPixels).toBe(clean.patch);
    expect(observed.movedImage === clean.image).toBe(true);
  } finally {
    await reference.close();
  }
  expect(observed.after).toEqual([]);
  expect(observed.frame).toMatchObject({ held: false, drawn: false });
});

test('@slow disabling live calculation cancels the queued edit solve', async ({ page }) => {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions && window.__stabileo.solverReady());
  await page.evaluate(() => window.__stabileoActions.loadExample('simply-supported'));
  await page.evaluate(() => window.__stabileoActions.solve());
  await page.clock.install();
  const starts = () => page.evaluate(() => window.__stabileo.solveCount());
  const before = await starts();
  await page.evaluate(async () => {
    const actions = window.__stabileoActions;
    actions.setLiveCalc(true);
    const file = JSON.parse(window.__stabileo.serializeProject());
    const node = file.snapshot.nodes[1][1];
    actions.moveNode(node.id, node.x + 1, node.y, node.z ?? 0);
    await Promise.resolve();
    actions.setLiveCalc(false);
  });
  await page.clock.runFor(500);
  expect(await starts()).toBe(before);
  expect(await page.evaluate(() => window.__stabileo.viewportPick().hasResults)).toBe(false);
  await page.evaluate(() => {
    const actions = window.__stabileoActions;
    actions.setLiveCalc(true);
    const node = JSON.parse(window.__stabileo.serializeProject()).snapshot.nodes[1][1];
    actions.moveNode(node.id, node.x + 1, node.y, node.z ?? 0);
  });
  await page.clock.runFor(500);
  await expect.poll(starts).toBeGreaterThan(before);
});

test('@slow axial paint shows the opposite forces on a fixed bar under a central axial load', async ({ page }) => {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions && window.__stabileo.solverReady());
  await page.evaluate(async () => {
    await window.__stabileoActions.loadExample('simply-supported');
    const file = JSON.parse(window.__stabileo.serializeProject());
    for (const [, support] of file.snapshot.supports) support.type = 'fixed';
    const [id] = file.snapshot.elements[0];
    file.snapshot.loads = [{ type: 'pointOnElement', data: { id: 1, elementId: id, a: 3, px: 10, p: 0 } }];
    if (!window.__stabileoActions.loadProject(file)) throw Error('Bar reopen failed');
    await window.__stabileoActions.solve();
  });
  await openAdvancedFunction(page, 'whatif');
  const labels = await page.locator('.viewport2d-wrapper canvas').first().evaluateHandle(el => {
    const ctx = (el as HTMLCanvasElement).getContext('2d')!;
    const texts = new Set<string>();
    const draw = ctx.fillText.bind(ctx);
    ctx.fillText = (label, ...args) => { texts.add(label); draw(label, ...args); };
    return texts;
  });
  await page.getByTestId('whatif-paint-axial').click();
  await expect.poll(() => labels.evaluate(s => [...s].some(label => /-5\.0.*\+5\.0|\+5\.0.*-5\.0/.test(label)))).toBe(true);
});

test('@slow a pending Explore result keeps the solved hinge until the edited member is solved', async ({ page }) => {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions && window.__stabileo.solverReady());
  await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
  await page.evaluate(() => window.__stabileoActions.solve());
  await page.getByTestId('rb-cmd-momentY').click();
  await openAdvancedFunction(page, 'whatif');
  await page.getByTestId('whatif-tab-members').click();
  await page.getByTestId('whatif-member-1').getByRole('button').first().click();
  const end = page.getByTestId('whatif-end-1-j');
  await expect(end).toHaveValue('none');
  await expect.poll(() => page.evaluate(() => window.__stabileo.screenFrame())).toMatchObject({ drawn: true, held: false });
  const observed = await end.evaluate(async sel => {
    const canvas = document.querySelector<HTMLCanvasElement>('.viewport2d-wrapper canvas')!;
    const ctx = canvas.getContext('2d')!;
    const { fill, arc } = ctx;
    let circle = false, hinges = 0;
    ctx.arc = function (...args) { circle = true; arc.apply(this, args); };
    ctx.fill = new Proxy(fill, {
      apply(target, receiver, args) {
        if (circle && ctx.fillStyle === '#0a0a1e') hinges++;
        circle = false;
        return Reflect.apply(target, receiver, args);
      },
    });
    const next = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const schedule = window.setTimeout.bind(window);
    const queued: Array<() => void> = [];
    try {
      window.setTimeout = (handler, delay, ...args) => {
        if (delay !== 0 || typeof handler !== 'function') return schedule(handler, delay, ...args);
        queued.push(() => handler(...args));
        return -queued.length;
      };
      const select = sel as HTMLSelectElement;
      select.value = 'hinge';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      for (let i = 0; i < 5; i++) await next();
      const held = window.__stabileo.screenFrame().held;
      const edited = window.__stabileo.memberStatement(1)?.releaseJ?.mz;
      const pendingHinges = hinges;
      window.setTimeout = schedule;
      for (const run of queued) run();
      for (let i = 0; i < 120 && (window.__stabileo.screenFrame().held || hinges === pendingHinges); i++) await next();
      return { held, edited, pendingHinges, finalHinges: hinges - pendingHinges, final: window.__stabileo.screenFrame() };
    } finally {
      window.setTimeout = schedule;
      Object.assign(ctx, { arc, fill });
    }
  });
  expect(observed).toMatchObject({ held: true, edited: true, pendingHinges: 0, final: { held: false, drawn: true } });
  expect(observed.finalHinges).toBeGreaterThan(0);
});

test('@slow inspecting Explore preserves verification and the solved model', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('liveCalc', 'false'));
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions && window.__stabileo.solverReady());
  await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
  await page.evaluate(() => window.__stabileoActions.solve());
  const publication = () => page.evaluate(() => [
    window.__stabileo.analysisRevision(), window.__stabileo.modelVersion(), window.__stabileo.solveCount(),
  ]);
  const original = await publication();
  await openAdvancedFunction(page, 'whatif');
  await expect(page.getByTestId('whatif-response')).toBeVisible();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await publication()).toEqual(original);
  await page.getByTestId('adv-close').click();
  expect(await publication()).toEqual(original);
});
