/**
 * Every advanced function of Basic, pressed as a user presses it, on many structures.
 *
 * ── What a press must do ───────────────────────────────────────────
 *
 * `pro-advanced-audit.spec.ts` asks PRO's analyses for "a result or a reason, never
 * silence". This asks the same of Basic's Advanced panel, and more of it, because a Basic
 * user arrives with whatever they drew: a model that was never solved, one that was solved
 * and then edited, a mechanism, a frame with no loads, a cantilever carrying nothing but a
 * couple. The dynamic mode shape that did not move without a static solve
 * (`basic-dynamic.spec.ts`) was exactly such a case, and nothing short of pressing the
 * button on that model would have found it.
 *
 * So for every model × function × condition a press has to:
 *  - raise no page error and log no console error;
 *  - ANSWER: the function's running header, a toast, a result in the panel, or a button
 *    held disabled with a stated reason. Doing nothing is the one wrong answer;
 *  - put no `NaN`, `undefined`, `null`, `Infinity` or raw i18n key on screen;
 *  - where the function draws, change the drawing (and a mode shape must MOVE);
 *  - and on "← Back", return to the list with the drawing as it was before the press.
 *
 * Each finding is recorded with `expect.soft`, so one run reports all of them, and every
 * press prints one `SWEEP|…` line — the matrix this suite covered, as data
 * (`e2e/.artifacts/basic-advanced-sweep.log`). A finding that is a KNOWN defect becomes a
 * `known-defect` annotation instead, and is pinned by its own `test.fail` at the end of the
 * file. The numbers follow the audit report; D2, D13, D14 and D15 were found by the first
 * run and no longer reproduce on this branch, so they have no pin.
 *
 * Models are the examples plus generated projects loaded through
 * `__stabileoActions.loadProject`, the same deserializer File → Open uses.
 */
import type { Page, Locator } from '@playwright/test';
import { test, expect } from './fixtures';
import { appendFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';

/* ──────────────────────────── i18n keys ──────────────────────────── */

let I18N: { keys: Set<string>; prefixes: Set<string> } | null = null;
/** Every key the locale files define, and their first segments. */
function i18n(): { keys: Set<string>; prefixes: Set<string> } {
  if (I18N) return I18N;
  const keys = new Set<string>();
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir)) {
      const full = `${dir}/${e}`;
      if (statSync(full).isDirectory()) { if (e !== '__tests__') walk(full); continue; }
      if (!e.endsWith('.ts')) continue;
      for (const m of readFileSync(full, 'utf8').matchAll(/['"]([a-zA-Z][\w]*(?:\.[\w-]+)+)['"]\s*:/g)) keys.add(m[1]);
    }
  };
  walk(new URL('../src/lib/i18n/locales', import.meta.url).pathname);
  I18N = { keys, prefixes: new Set([...keys].map((k) => k.split('.')[0])) };
  return I18N;
}

/** Things on screen no user should ever read. */
function badTokens(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b(NaN|undefined|null|Infinity)\b/g)) out.push(m[1]);
  const { keys, prefixes } = i18n();
  for (const m of text.matchAll(/\b[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+\b/g)) {
    const tok = m[0];
    const [head, ...rest] = tok.split('.');
    if (keys.has(tok) || (prefixes.has(head) && head.length > 2 && /[A-Z]|\./.test(rest.join('.')))) out.push(`key:${tok}`);
  }
  return out;
}

/** What is in `after` and was not in `before`, as multisets. */
function added(before: string[], after: string[]): string[] {
  const left = [...before];
  const out: string[] = [];
  for (const a of after) {
    const k = left.indexOf(a);
    if (k >= 0) left.splice(k, 1); else out.push(a);
  }
  return out;
}

/* ──────────────────────────── generated models ──────────────────────────── */

const MATERIALS = [
  [1, { id: 1, name: 'Acero A36', e: 200000, nu: 0.3, rho: 78.5, fy: 250 }],
  [2, { id: 2, name: 'H.A. H-25', e: 30000, nu: 0.2, rho: 25 }],
];
const SECTIONS = [
  [1, { id: 1, name: 'IPN 300', a: 0.0069, iy: 9.8e-05, iz: 4.51e-06, j: 4.666e-07, b: 0.125, h: 0.3, shape: 'I', tw: 0.0108, tf: 0.0162 }],
  [2, { id: 2, name: 'H.A. 30×30', a: 0.09, iz: 0.000675, iy: 0.000675, b: 0.3, h: 0.3, shape: 'rect' }],
];
const CASES = [
  { id: 1, type: 'D', name: 'Dead Load' }, { id: 2, type: 'L', name: 'Live Load' },
  { id: 3, type: 'W', name: 'Wind' }, { id: 4, type: 'E', name: 'Earthquake' },
];
const FREE = { my: false, mz: false, t: false };
const HINGE = { my: false, mz: true, t: false };

interface Bar { i: number; j: number; truss?: boolean; hingeI?: boolean; hingeJ?: boolean }
interface Gen {
  nodes: Array<[number, number, number?]>; // x, y (2D: y is up) or x, y, z (3D: z is up)
  bars: Bar[];
  supports: Array<[number, string]>; // node (1-based), type
  loads: Array<{ type: string; data: Record<string, unknown> }>;
}

/** A `.ded` project in the shape `buildProjectFile` writes. */
function project(name: string, mode: '2d' | '3d', g: Gen): Record<string, unknown> {
  const nodes = g.nodes.map(([x, y, z], k) => [k + 1, z === undefined ? { id: k + 1, x, y } : { id: k + 1, x, y, z }]);
  const elements = g.bars.map((b, k) => [k + 1, {
    id: k + 1, type: b.truss ? 'truss' : 'frame', nodeI: b.i, nodeJ: b.j, materialId: 1, sectionId: 1,
    releaseI: b.hingeI ? { ...HINGE } : { ...FREE }, releaseJ: b.hingeJ ? { ...HINGE } : { ...FREE },
  }]);
  const supports = g.supports.map(([n, type], k) => [k + 1, { id: k + 1, nodeId: n, type }]);
  const loads = g.loads.map((l, k) => ({ type: l.type, data: { id: k + 1, ...l.data } }));
  return {
    version: '2.0', name, timestamp: '2026-01-01T00:00:00.000Z', analysisMode: mode,
    snapshot: {
      name, localAxisConvention: 'zUpStrongAxis',
      nodes, materials: MATERIALS, sections: SECTIONS, elements, supports, loads,
      loadCases: CASES, combinations: [],
      nextId: {
        node: nodes.length + 1, material: 3, section: 3, element: elements.length + 1,
        support: supports.length + 1, load: loads.length + 1, loadCase: 5, combination: 5,
        plate: 1, quad: 1, group: 1, connector: 1, footing: 1, soilProfile: 1,
      },
    },
  };
}

const q = (elementId: number, v: number) => ({ type: 'distributed', data: { elementId, qI: v, qJ: v } });
const f2 = (nodeId: number, fx: number, fz: number, my = 0) => ({ type: 'nodal', data: { nodeId, fx, fz, my } });
const f3 = (nodeId: number, fx: number, fy: number, fz: number) => ({ type: 'nodal3d', data: { nodeId, fx, fy, fz, mx: 0, my: 0, mz: 0 } });
const q3 = (elementId: number, qz: number) => ({ type: 'distributed3d', data: { elementId, qYI: 0, qYJ: 0, qZI: qz, qZJ: qz } });

/** Two storeys, three bays, a hinge in each floor. Node id = level·4 + column + 1. */
function threeBayTwoStorey(): Gen {
  const xs = [0, 5, 10, 15], ys = [0, 3.5, 7];
  const nodes: Gen['nodes'] = [];
  for (const y of ys) for (const x of xs) nodes.push([x, y]);
  const id = (lvl: number, col: number) => lvl * 4 + col + 1;
  const bars: Bar[] = [];
  for (let l = 0; l < 2; l++) for (let c = 0; c < 4; c++) bars.push({ i: id(l, c), j: id(l + 1, c) });
  for (let l = 1; l <= 2; l++) for (let c = 0; c < 3; c++) {
    bars.push({ i: id(l, c), j: id(l, c + 1), hingeJ: l === 1 && c === 0, hingeI: l === 2 && c === 1 });
  }
  const beams = bars.map((_, k) => k + 1).slice(8);
  return {
    nodes, bars,
    supports: [0, 1, 2, 3].map((c) => [id(0, c), 'fixed'] as [number, string]),
    loads: [...beams.map((b) => q(b, -12)), f2(id(1, 0), 8, 0), f2(id(2, 0), 4, 0)],
  };
}

const GENERATED: Record<string, { mode: '2d' | '3d'; g: Gen }> = {
  'gen-gable-frame': { mode: '2d', g: {
    nodes: [[0, 0], [0, 4], [5, 6], [10, 4], [10, 0]],
    bars: [{ i: 1, j: 2 }, { i: 2, j: 3 }, { i: 3, j: 4 }, { i: 4, j: 5 }],
    supports: [[1, 'fixed'], [5, 'fixed']],
    loads: [q(2, -8), q(3, -8), f2(2, 6, 0)],
  } },
  'gen-3bay-2storey-hinged': { mode: '2d', g: threeBayTwoStorey() },
  'gen-irregular-truss': { mode: '2d', g: {
    nodes: [[0, 0], [3, 0], [7, 0], [12, 0], [1.5, 2], [5, 3], [9, 2.5]],
    bars: [[1, 2], [2, 3], [3, 4], [1, 5], [5, 6], [6, 7], [7, 4], [5, 2], [2, 6], [6, 3], [3, 7]]
      .map(([i, j]) => ({ i, j, truss: true })),
    supports: [[1, 'pinned'], [4, 'rollerX']],
    loads: [f2(5, 0, -20), f2(6, 5, -20), f2(7, 0, -20)],
  } },
  'gen-cantilever-moment': { mode: '2d', g: {
    nodes: [[0, 0], [4, 0]], bars: [{ i: 1, j: 2 }], supports: [[1, 'fixed']], loads: [f2(2, 0, 0, 25)],
  } },
  'gen-unloaded-frame': { mode: '2d', g: {
    nodes: [[0, 0], [0, 4], [6, 4], [6, 0]], bars: [{ i: 1, j: 2 }, { i: 2, j: 3 }, { i: 3, j: 4 }],
    supports: [[1, 'fixed'], [4, 'fixed']], loads: [],
  } },
  'gen-mechanism': { mode: '2d', g: {
    nodes: [[0, 0], [0, 4], [6, 4], [6, 0]],
    bars: [{ i: 1, j: 2 }, { i: 2, j: 3, hingeI: true, hingeJ: true }, { i: 3, j: 4 }],
    supports: [[1, 'pinned'], [4, 'pinned']], loads: [q(2, -10), f2(2, 10, 0)],
  } },
  'gen-3d-inclined-frame': { mode: '3d', g: {
    nodes: [[0, 0, 0], [6, 0, 0], [6, 4, 0], [0, 4, 0], [1, 0.5, 4], [5, 0.5, 4], [5, 3.5, 4], [1, 3.5, 4], [3, 2, 5.5]],
    bars: [[1, 5], [2, 6], [3, 7], [4, 8], [5, 6], [6, 7], [7, 8], [8, 5], [5, 9], [6, 9], [7, 9], [8, 9]]
      .map(([i, j]) => ({ i, j })),
    supports: [[1, 'fixed3d'], [2, 'fixed3d'], [3, 'fixed3d'], [4, 'fixed3d']],
    loads: [f3(9, 0, 0, -15), f3(5, 6, 0, 0), q3(5, -5), q3(7, -5)],
  } },
};

/* ──────────────────────────── the page ──────────────────────────── */

interface Ctx {
  page: Page;
  model: string;
  cond: string;
  errors: string[];
  step: { label: string };
  mobile: boolean;
  three: boolean;
}

async function boot(page: Page, mobile = false): Promise<Ctx> {
  const ctx: Ctx = { page, model: '', cond: '', errors: [], step: { label: 'boot' }, mobile, three: false };
  page.on('pageerror', (e) => ctx.errors.push(`[${ctx.step.label}] pageerror: ${String(e)}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/SwiftShader|WebGL|GroupMarkerNotSet|Automatic fallback|GPU stall/i.test(text)) return;
    ctx.errors.push(`[${ctx.step.label}] console.error: ${text.slice(0, 400)}`);
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stabileo-lang', 'en');
      localStorage.setItem('stabileo-lang-manual', '1');
    } catch { /* private mode */ }
    /*
     * Every toast ever shown, kept after it fades: a toast lives four seconds, and a
     * press that answers only with one must not read as silence because the poll was late.
     */
    const w = window as unknown as { __toastNodes: HTMLElement[] };
    w.__toastNodes = [];
    const watch = (): void => {
      new MutationObserver((muts) => {
        for (const m of muts) for (const n of m.addedNodes) {
          if (!(n instanceof HTMLElement)) continue;
          const found = n.matches('.toast') ? [n] : [...n.querySelectorAll<HTMLElement>('.toast')];
          w.__toastNodes.push(...found);
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    };
    if (document.documentElement) watch(); else document.addEventListener('DOMContentLoaded', watch);
    /*
     * Every string the canvases paint. The 2D view and the 3D labels draw their text with
     * `fillText`, where no DOM scan can read it — an influence-line caption reading
     * "Node null" is invisible to `innerText` and plain to the user.
     */
    const painted = new Set<string>();
    (window as unknown as { __canvasTexts: Set<string> }).__canvasTexts = painted;
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text: string, ...rest: [number, number, number?]) {
      if (painted.size < 20_000) painted.add(String(text));
      return fill.call(this, text, ...rest);
    };
  });
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
  await expect.poll(() => page.evaluate(() => window.__stabileo.solverReady()), { timeout: 60_000 }).toBe(true);
  return ctx;
}

async function toastCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __toastNodes: HTMLElement[] }).__toastNodes.length);
}
async function toastsSince(page: Page, from: number): Promise<Array<{ kind: string; text: string }>> {
  return page.evaluate((k) => (window as unknown as { __toastNodes: HTMLElement[] }).__toastNodes.slice(k).map((n) => ({
    kind: (n.className.match(/toast-(success|error|info)/) ?? [])[1] ?? '?',
    text: (n.querySelector('span')?.textContent ?? n.textContent ?? '').trim(),
  })), from);
}

async function is3D(page: Page): Promise<boolean> {
  return page.locator('.viewport3d-wrapper').first().isVisible();
}

function viewport(page: Page, three: boolean): Locator {
  return three ? page.locator('.viewport3d-wrapper').first() : page.locator('canvas:not(.axis-gizmo)').first();
}

/** The model view as an image, without the toasts that float over it. */
async function shot(page: Page): Promise<string> {
  const three = await is3D(page);
  /*
   * Rest the pointer on an empty corner OF the view, not outside it: the hover card a
   * member or node shows stays up when the pointer leaves the canvas, and a card left
   * over from the last click reads as a drawing the function left behind.
   */
  const box = await viewport(page, three).boundingBox();
  if (box) await page.mouse.move(box.x + box.width - 24, box.y + box.height - 24);
  await page.waitForTimeout(three ? 500 : 250);
  const buf = await viewport(page, three).screenshot({
    style: '.toast-container, .live-calc-error { visibility: hidden !important; }',
    animations: 'disabled',
  });
  return buf.toString('base64');
}

/** Pixels that differ between two images, and how many there are. */
async function diff(page: Page, a: string, b: string): Promise<{ changed: number; total: number }> {
  return page.evaluate(async ([a, b]) => {
    const load = (src: string) => new Promise<HTMLImageElement>((res) => { const i = new Image(); i.onload = () => res(i); i.src = `data:image/png;base64,${src}`; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { changed: ia.width * ia.height, total: ia.width * ia.height };
    const read = (img: HTMLImageElement) => {
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const cx = cv.getContext('2d')!; cx.drawImage(img, 0, 0); return cx.getImageData(0, 0, img.width, img.height).data;
    };
    const da = read(ia), db = read(ib);
    let n = 0;
    for (let k = 0; k < da.length; k += 4) {
      if (Math.abs(da[k] - db[k]) + Math.abs(da[k + 1] - db[k + 1]) + Math.abs(da[k + 2] - db[k + 2]) > 60) n++;
    }
    return { changed: n, total: ia.width * ia.height };
  }, [a, b]);
}

/**
 * Frames a moment apart: a mode in motion moves whole members. Three frames at uneven
 * intervals, the largest difference of any pair — two frames a fixed interval apart can
 * land on the same phase of the oscillation and read a moving mode as still (tower-3d-2
 * read 613 px on one run and 80 on the next).
 */
async function motion(page: Page): Promise<number> {
  const a = await shot(page);
  await page.waitForTimeout(330);
  const b = await shot(page);
  await page.waitForTimeout(470);
  const c = await shot(page);
  const d = await Promise.all([diff(page, a, b), diff(page, b, c), diff(page, a, c)]);
  return Math.max(...d.map((x) => x.changed));
}

/** Keep the two images a failed comparison was made from, for the report. */
function keep(tag: string, images: Record<string, string>): string {
  const dir = new URL('./.artifacts/sweep-shots/', import.meta.url).pathname;
  const base = tag.replace(/[^a-zA-Z0-9@-]+/g, '_');
  try {
    mkdirSync(dir, { recursive: true });
    for (const [k, v] of Object.entries(images)) writeFileSync(`${dir}${base}.${k}.png`, Buffer.from(v, 'base64'));
  } catch { /* diagnostics only */ }
  return `${dir}${base}.*.png`;
}

async function press(ctx: Ctx, target: Locator): Promise<void> {
  if (ctx.mobile) await target.tap(); else await target.click();
}

/** What the page shows in its DOM, plus every string the canvases have painted so far. */
async function visibleText(page: Page): Promise<string> {
  return page.evaluate(() => `${document.body.innerText}\n${[...(window as unknown as { __canvasTexts: Set<string> }).__canvasTexts].join('\n')}`);
}

async function panelText(page: Page): Promise<string> {
  const p = page.getByTestId('basic-panel');
  return (await p.count()) ? (await p.first().innerText()).trim() : '';
}

/** Show the list of advanced functions, whatever was open. */
async function openList(ctx: Ctx): Promise<boolean> {
  const { page } = ctx;
  if (await page.locator('.s2d').isVisible()) await press(ctx, page.getByTestId('s2d-cancel'));
  if (await page.locator('[data-testid="basic-panel"][data-panel="advanced"]').count() === 0) {
    await press(ctx, page.getByTestId('rb-cmd-advanced'));
  }
  let stuck: string | null = null;
  for (let k = 0; k < 4; k++) {
    if (await page.getByTestId('adv-running').isVisible()) {
      stuck = await page.getByTestId('adv-running').getAttribute('data-adv');
      await press(ctx, page.getByTestId('adv-close'));
      await page.waitForTimeout(150);
    } else if (await page.getByTestId('steps-catalog-back').isVisible()) await press(ctx, page.getByTestId('steps-catalog-back'));
    else if (await page.getByTestId('steps-back').isVisible()) await press(ctx, page.getByTestId('steps-back'));
    else { stuck = null; break; }
  }
  if (stuck) {
    /*
     * "← Back" pressed four times and the function is still running: the panel is frozen.
     * Reported, then the page is reloaded so the rest of the matrix still runs.
     */
    flag(ctx, stuck, 'stuck', false, `${ctx.model} [${ctx.cond}] ${stuck}: "← Back" does not leave the function (pressed 4 times)`);
    await page.reload();
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
    await expect.poll(() => page.evaluate(() => window.__stabileo.solverReady()), { timeout: 60_000 }).toBe(true);
    await loadNamed(ctx, ctx.model);
    await press(ctx, page.getByTestId('rb-cmd-advanced'));
  }
  await expect(page.getByTestId('adv-group-structure'), 'the list of advanced functions is showing').toBeVisible();
  return !!stuck;
}

/* ──────────────────────────── the functions ──────────────────────────── */

interface Fn {
  key: string;
  /**
   * "← Back" may leave the static results drawn. Only What-if: its close is documented as
   * "the model as it was, and live calc as it was — with results" (`whatif.svelte.ts`).
   */
  keepsResults?: boolean;
  /** How the entry is found in the list. */
  find: (page: Page) => Locator;
  /** 2D only: disabled in 3D, with a reason. */
  only2d?: boolean;
  /** Draws on the model view when it runs. */
  draws?: boolean;
  /** …unless its answer says there is nothing to draw. */
  drawsUnless?: RegExp;
  /** What a user does next once the function is running. */
  follow?: (ctx: Ctx) => Promise<string | null>;
  /** What must be on screen once it is running. */
  shows?: (page: Page) => Locator;
}

const entry = (label: RegExp) => (page: Page) => page.locator('.advanced-grid .adv-btn').filter({ hasText: label }).first();

/** The screen position of the middle of the longest member. */
async function memberMiddle(page: Page): Promise<{ x: number; y: number } | null> {
  return page.evaluate(() => {
    const h = window.__stabileo as unknown as {
      elementIds(): number[]; elementEnds(id: number): { i: number; j: number } | null;
      nodeScreenPos(id: number): { x: number; y: number } | null;
    };
    let best: { x: number; y: number } | null = null, len = -1;
    for (const id of h.elementIds()) {
      const e = h.elementEnds(id); if (!e) continue;
      const a = h.nodeScreenPos(e.i), b = h.nodeScreenPos(e.j); if (!a || !b) continue;
      const l = Math.hypot(a.x - b.x, a.y - b.y);
      if (l > len) { len = l; best = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
    }
    return best;
  });
}

async function clickOnModel(ctx: Ctx, p: { x: number; y: number }): Promise<void> {
  if (ctx.mobile) await ctx.page.touchscreen.tap(p.x, p.y);
  else await ctx.page.mouse.click(p.x, p.y);
}

const FUNCTIONS: Fn[] = [
  { key: 'kinematic', find: (p) => p.getByTestId('adv-kinematic'), only2d: true, shows: (p) => p.locator('.kp-panel') },
  { key: 'despiece', find: entry(/^Free-body view/), draws: true },
  {
    key: 'stress', find: (p) => p.getByTestId('adv-stress'),
    follow: async (ctx) => {
      const m = await memberMiddle(ctx.page);
      if (!m) return 'no member on screen';
      const before = await panelText(ctx.page);
      await clickOnModel(ctx, m);
      await expect.poll(() => panelText(ctx.page), { timeout: 5_000 }).not.toBe(before).catch(() => undefined);
      return (await panelText(ctx.page)) === before ? 'clicking a member showed nothing' : null;
    },
  },
  { key: 'pdelta', find: entry(/^P-Δ/), shows: (p) => p.getByTestId('pdelta-result') },
  { key: 'buckling', find: entry(/^Pcr/), draws: true, shows: (p) => p.locator('.adv-result-info').filter({ hasText: /λ_cr = \d/ }) },
  { key: 'modal', find: entry(/^Dynamic$/), draws: true, shows: (p) => p.locator('.adv-result-info').filter({ hasText: /f = [\d.]+ Hz/ }) },
  { key: 'plastic', find: entry(/^Plastic collapse/), only2d: true, draws: true, drawsUnless: /No collapse/, shows: (p) => p.getByTestId('plastic-verdict') },
  {
    key: 'influenceLine', find: entry(/^Influence line/), only2d: true,
    follow: async (ctx) => {
      const m = await memberMiddle(ctx.page);
      if (!m) return 'no member on screen';
      const from = await toastCount(ctx.page);
      const before = await shot(ctx.page);
      await clickOnModel(ctx, m);
      await expect.poll(async () => (await toastsSince(ctx.page, from)).length, { timeout: 5_000 }).toBeGreaterThan(0).catch(() => undefined);
      const ts = await toastsSince(ctx.page, from);
      if (ts.length === 0) return 'clicking a member said nothing';
      if (ts.some((t) => t.kind === 'success')) {
        const d = await diff(ctx.page, before, await shot(ctx.page));
        if (d.changed < 300) return `influence line computed ("${ts[0].text}") but nothing new was drawn (${d.changed} px)`;
      }
      return null;
    },
  },
  {
    key: 'trainLoad', find: entry(/^Moving load/), only2d: true,
    follow: async (ctx) => {
      const sel = ctx.page.locator('.adv-select').first();
      if (!(await sel.isVisible())) return 'no train selector';
      const from = await toastCount(ctx.page);
      const before = await shot(ctx.page);
      await sel.selectOption({ index: 1 });
      await expect.poll(async () => (await toastsSince(ctx.page, from)).length, { timeout: 90_000 }).toBeGreaterThan(0).catch(() => undefined);
      await expect(ctx.page.locator('.moving-load-progress')).toHaveCount(0, { timeout: 90_000 }).catch(() => undefined);
      const ts = await toastsSince(ctx.page, from);
      if (ts.length === 0) return 'choosing a train said nothing';
      if (ts.some((t) => t.kind === 'success')) {
        const d = await diff(ctx.page, before, await shot(ctx.page));
        if (d.changed < 300) return `moving load solved ("${ts[0].text}") but nothing new was drawn (${d.changed} px)`;
      }
      return null;
    },
  },
  {
    key: 'whatif', keepsResults: true, find: entry(/^Explore/), shows: (p) => p.getByTestId('whatif-panel'),
    follow: async (ctx) => {
      const r = ctx.page.locator('.wif-range').first();
      if (!(await r.isVisible())) return null;
      await r.focus();
      for (let k = 0; k < 6; k++) await ctx.page.keyboard.press('ArrowRight');
      await ctx.page.waitForTimeout(600);
      return null;
    },
  },
  { key: 'steps', find: (p) => p.getByTestId('adv-steps'), shows: (p) => p.getByTestId('steps-catalog') },
  { key: 'cirsocFlex', find: (p) => p.getByTestId('adv-flex'), shows: (p) => p.getByTestId('flex-panel') },
];

/* ──────────────────────────── known defects ──────────────────────────── */

type Kind = 'silent' | 'restore' | 'badtext' | 'drawn' | 'motion' | 'follow' | 'shows' | 'stuck' | 'error' | 'mode';

/**
 * Defects this sweep found, each pinned by its own `test.fail` in "known defects" below.
 *
 * A finding that matches one of these is recorded as a `known-defect` annotation instead of
 * failing the sweep, so the sweep stays a detector of NEW defects rather than a wall of red
 * that says the same fifteen things forty times. When a defect is fixed its pinned test
 * starts passing, Playwright reports that as a failure of a `test.fail`, and whoever fixed
 * it removes both the pin and the entry here — the sweep then guards the fix.
 */
interface Known {
  id: string;
  fn: string;
  kind: Kind;
  /** Where it applies; everywhere when absent. */
  when?: (c: { model: string; cond: string; three: boolean }) => boolean;
  /** For `error`: the message it shows. */
  text?: RegExp;
}
const BEAMS_ON_SUPPORTS = new Set(['simply-supported', 'continuous-beam', 'settlement', 'bridge-moving-load']);
const KNOWN: Known[] = [
  // Every defect this sweep found has been fixed; their pins below stay as regression tests.
];

function known(ctx: Ctx, fn: string, kind: Kind, text = ''): Known | undefined {
  return KNOWN.find((k) => (k.fn === fn || k.fn === '*') && k.kind === kind
    && (!k.when || k.when({ model: ctx.model, cond: ctx.cond, three: ctx.three }))
    && (!k.text || k.text.test(text)));
}

/** A finding: a soft failure, or a `known-defect` annotation when it is one of `KNOWN`. */
function flag(ctx: Ctx, fn: string, kind: Kind, ok: boolean, message: string): void {
  if (ok) return;
  const k = known(ctx, fn, kind, message);
  if (k) {
    test.info().annotations.push({ type: 'known-defect', description: `${k.id} · ${message}` });
    return;
  }
  expect.soft(false, message).toBe(true);
}

/* ──────────────────────────── one press ──────────────────────────── */

type Outcome = 'running' | 'toast' | 'panel' | 'refused' | 'silent';
interface PressRecord { fn: string; outcome: Outcome; detail: string; drawn?: number; moved?: number; restored?: number }

/**
 * Press one function, check its answer, then go back and check the drawing.
 *
 * `restore` is the budget of pixels the view may differ by after "← Back"; the drawing a
 * function leaves behind is the defect this is looking for, but a view is not bit-exact
 * across two captures (anti-aliasing on a fresh frame).
 */
async function pressOne(ctx: Ctx, fn: Fn, opts: { checkPixels: boolean }): Promise<PressRecord> {
  const { page } = ctx;
  const tag = `${ctx.model} [${ctx.cond}] ${fn.key}`;
  ctx.step.label = tag;
  await openList(ctx);
  const three = await is3D(page);
  ctx.three = three;
  const btn = fn.find(page);
  await btn.scrollIntoViewIfNeeded();
  await expect(btn, `${tag}: the entry is listed`).toBeVisible();

  const before = opts.checkPixels ? await shot(page) : '';
  const textBefore = badTokens(await visibleText(page));
  const panelBefore = await panelText(page);
  const from = await toastCount(page);

  if (await btn.isDisabled()) {
    const reason = (await btn.getAttribute('title')) ?? '';
    expect.soft(reason.trim().length, `${tag}: disabled with no stated reason`).toBeGreaterThan(0);
    if (fn.only2d) expect.soft(three, `${tag}: disabled in 2D`).toBe(true);
    return { fn: fn.key, outcome: 'refused', detail: `disabled: ${reason}` };
  }
  if (fn.only2d && three) expect.soft(false, `${tag}: a 2D-only function is enabled in 3D`).toBe(true);

  await press(ctx, btn);

  /* Come to rest: something answered, and the panel stopped changing. */
  let prev = '';
  let stable = 0;
  let outcome: Outcome = 'silent';
  for (let waited = 0; waited < 20_000; waited += 200) {
    await page.waitForTimeout(200);
    const running = await page.getByTestId('adv-running').isVisible();
    const catalog = await page.getByTestId('steps-catalog').isVisible();
    const ts = await toastsSince(page, from);
    const now = await panelText(page);
    const answered = running || catalog || ts.length > 0 || now !== panelBefore;
    stable = now === prev ? stable + 1 : 0;
    prev = now;
    if (answered && stable >= 2) {
      outcome = running || catalog ? 'running' : ts.length > 0 ? 'toast' : 'panel';
      break;
    }
  }
  const toasts = await toastsSince(page, from);
  let detail = toasts.map((t) => `${t.kind}:${t.text}`).join(' / ');
  flag(ctx, fn.key, 'silent', outcome !== 'silent', `${tag}: the press said nothing`);

  const rec: PressRecord = { fn: fn.key, outcome, detail };
  if (outcome === 'running') {
    const header = page.getByTestId('adv-running');
    if (await header.isVisible()) {
      expect.soft(await header.getAttribute('data-adv'), `${tag}: the running header names another function`).toBe(fn.key);
    }
    if (fn.shows) {
      const shown = await fn.shows(page).waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false);
      flag(ctx, fn.key, 'shows', shown, `${tag}: its result is not on screen`);
    }
    if (fn.follow) {
      const problem = await fn.follow(ctx);
      flag(ctx, fn.key, 'follow', !problem, `${tag}: ${problem}`);
      if (problem) detail += ` | follow: ${problem}`;
    }
    if (opts.checkPixels && fn.draws && !(fn.drawsUnless && toasts.some((t) => fn.drawsUnless!.test(t.text)))) {
      const now = await shot(page);
      const d = await diff(page, before, now);
      rec.drawn = d.changed;
      if (d.changed <= 300) detail += ` | shots: ${keep(`${tag}-drawn`, { before, now })}`;
      /* The mode shapes move: two frames of the same one must differ, which also proves it is drawn. */
      if (fn.key === 'modal') {
        rec.moved = await motion(page);
        flag(ctx, fn.key, 'motion', rec.moved > 400, `${tag}: the mode shape does not move (${rec.moved} px between frames)`);
      } else {
        flag(ctx, fn.key, 'drawn', d.changed > 300, `${tag}: running, and nothing new is drawn (${d.changed} px)`);
      }
    }
  }

  const bad = added(textBefore, [...badTokens(await visibleText(page)), ...toasts.flatMap((t) => badTokens(t.text))]);
  flag(ctx, fn.key, 'badtext', bad.length === 0, `${tag}: bad text on screen: ${bad.join(', ')}`);
  if (bad.length) detail += ` | BAD: ${bad.join(',')}`;

  /* Back to the list, and the drawing as it was. */
  const recovered = await openList(ctx);
  if (opts.checkPixels && !fn.keepsResults && !recovered) {
    const after = await shot(page);
    const d = await diff(page, before, after);
    rec.restored = d.changed;
    const budget = Math.max(400, d.total * 0.002);
    if (d.changed >= budget) detail += ` | shots: ${keep(`${tag}-back`, { before, after })}`;
    flag(ctx, fn.key, 'restore', d.changed < budget, `${tag}: after "← Back" the drawing is not what it was (${d.changed} px differ)`);
  }
  rec.detail = detail;
  return rec;
}

/**
 * One line per press, to stdout and to `e2e/.artifacts/basic-advanced-sweep.log` — the
 * matrix as it actually ran, which the list reporter's redrawn output does not keep.
 */
function note(line: string): void {
  console.log(line);
  const dir = new URL('./.artifacts/', import.meta.url).pathname;
  try { mkdirSync(dir, { recursive: true }); appendFileSync(`${dir}basic-advanced-sweep.log`, `${line}\n`); } catch { /* diagnostics only */ }
}

function log(ctx: Ctx, r: PressRecord): void {
  note(`SWEEP|${ctx.model}|${ctx.cond}|${r.fn}|${r.outcome}|drawn=${r.drawn ?? '-'}|moved=${r.moved ?? '-'}|restored=${r.restored ?? '-'}|${r.detail.slice(0, 220)}`);
}

/**
 * Every function once, each on a FRESH copy of the condition: `prepare` reloads the model
 * and brings it back to the state under test before every press. Without it the presses
 * leak into one another — P-Δ fills the static results, so every function after it on an
 * "unsolved" model was in fact pressed on a solved one. What a function leaves behind is
 * still measured, by the "← Back" comparison.
 */
async function sweep(ctx: Ctx, cond: string, prepare: () => Promise<void>, opts = { checkPixels: true }, fns = FUNCTIONS): Promise<PressRecord[]> {
  const out: PressRecord[] = [];
  for (const fn of fns) {
    await test.step(`${cond} · ${fn.key}`, async () => {
      await prepare();
      ctx.cond = cond;
      const r = await pressOne(ctx, fn, opts);
      log(ctx, r);
      out.push(r);
    });
  }
  return out;
}

/* ──────────────────────────── model actions ──────────────────────────── */

async function loadNamed(ctx: Ctx, name: string): Promise<void> {
  const { page } = ctx;
  ctx.model = name;
  ctx.step.label = `${name} load`;
  const [base, variant] = name.split('@');
  if (GENERATED[base]) {
    const g = GENERATED[base];
    const ok = await page.evaluate((f) => window.__stabileoActions.loadProject(f), project(base, g.mode, g.g));
    expect(ok, `${base}: the generated project is accepted by File → Open`).toBe(true);
  } else {
    await page.evaluate((n) => window.__stabileoActions.loadExample(n), base);
  }
  await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length)).toBeGreaterThan(0);
  if (variant === '3d' && !(await is3D(page))) {
    await page.getByTestId('rb-cmd-dim').click();
    await expect.poll(() => is3D(page)).toBe(true);
  }
  await page.waitForTimeout(400);
}

/** Solve from the ribbon, as a user does. Returns what the solve said. */
async function solveFromRibbon(ctx: Ctx): Promise<string> {
  const { page } = ctx;
  ctx.step.label = `${ctx.model} solve`;
  const before = await page.evaluate(() => window.__stabileo.solveCount());
  const from = await toastCount(page);
  await press(ctx, page.getByTestId('rb-cmd-solve'));
  await expect.poll(async () => (await page.evaluate(() => window.__stabileo.solveCount())) > before
    || (await toastsSince(page, from)).length > 0, { timeout: 30_000 }).toBe(true);
  await page.waitForTimeout(300);
  const ts = await toastsSince(page, from);
  return ts.map((t) => `${t.kind}:${t.text}`).join(' / ') || 'solved';
}

/**
 * Move a node with the Move tool, as a user drags it. A free node if there is one.
 * Returns false when the node did not move — the edit could not be made this way.
 */
async function dragANode(ctx: Ctx): Promise<boolean> {
  const { page } = ctx;
  ctx.step.label = `${ctx.model} edit`;
  const pick = await page.evaluate(() => {
    const h = window.__stabileo as unknown as { nodeIds(): number[]; entityData(k: string, key: string): unknown };
    const held = new Set(((h.entityData('setting', 'supports') ?? []) as Array<[number, { nodeId: number }]>).map(([, s]) => s.nodeId));
    const ids = h.nodeIds();
    return ids.find((id) => !held.has(id)) ?? ids[ids.length - 1];
  });
  const before = await page.evaluate((n) => window.__stabileo.nodePos(n), pick);
  await page.getByTestId('rb-cmd-move').click();
  await page.getByTestId('move-nodes').click();
  const p = (await page.evaluate((n) => window.__stabileo.nodeScreenPos(n), pick))!;
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 45, p.y - 30, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.getByTestId('rb-cmd-select').click();
  const after = await page.evaluate((n) => window.__stabileo.nodePos(n), pick);
  return JSON.stringify(before) !== JSON.stringify(after);
}

/** Page and console errors, each attributed to the press that raised it. */
function finish(ctx: Ctx): void {
  const unknown: string[] = [];
  for (const e of ctx.errors) {
    const fn = /\] ([a-zA-Z]+)\]/.exec(e)?.[1] ?? '';
    const k = KNOWN.find((x) => x.kind === 'error' && (x.fn === fn || x.fn === '*') && x.text?.test(e));
    if (k) test.info().annotations.push({ type: 'known-defect', description: `${k.id} · ${e}` });
    else unknown.push(e);
  }
  expect.soft(unknown, `page/console errors:\n${unknown.join('\n')}`).toEqual([]);
}

/* ──────────────────────────── the matrix ──────────────────────────── */

const EXAMPLES_2D = [
  'simply-supported', 'continuous-beam', 'portal-frame', 'two-story-frame', 'truss', 'three-hinge-arch',
  'gerber-beam', 'spring-support', 'settlement', 'thermal', 'bridge-moving-load',
];
const EXAMPLES_3D = ['3d-portal-frame', '3d-space-truss', 'grid-beams', 'tower-3d-2'];
const GENERATED_RUNS = [...Object.keys(GENERATED), 'gen-gable-frame@3d', 'portal-frame@3d', 'truss@3d'];

/** Load, and optionally solve and edit: one of the three conditions every function is pressed in. */
function condition(ctx: Ctx, name: string, cond: 'unsolved' | 'solved' | 'edited'): () => Promise<void> {
  let reported = false;
  return async () => {
    await loadNamed(ctx, name);
    if (cond === 'unsolved') return;
    const solved = await solveFromRibbon(ctx);
    if (cond === 'edited') {
      const moved = await dragANode(ctx);
      if (!reported) note(`EDIT|${name}|${moved ? 'node moved' : 'node did NOT move'}`);
      /* Not a finding of this suite: the edit is the setup, and without it the press is the solved case again. */
      if (!moved && !reported) test.info().annotations.push({ type: 'not-tested', description: `${name}: the drag did not move a node, so "edited" repeats "solved"` });
    } else if (!reported) note(`SOLVE|${name}|${solved}`);
    reported = true;
  };
}

test.describe('@slow Basic advanced sweep — examples: unsolved, solved, edited', () => {
  test.setTimeout(15 * 60_000);
  for (const name of [...EXAMPLES_2D, ...EXAMPLES_3D]) {
    test(name, async ({ page }) => {
      const ctx = await boot(page);
      /*
       * The edit is a node dragged with the Move tool, a 2D gesture: in 3D the same drag
       * orbits the camera, so the 3D examples are swept unsolved and solved only.
       */
      const conds = EXAMPLES_3D.includes(name) ? ['unsolved', 'solved'] as const : ['unsolved', 'solved', 'edited'] as const;
      for (const cond of conds) await sweep(ctx, cond, condition(ctx, name, cond));
      finish(ctx);
    });
  }
});

test.describe('@slow Basic advanced sweep — models outside the examples', () => {
  test.setTimeout(12 * 60_000);
  for (const name of GENERATED_RUNS) {
    test(name, async ({ page }) => {
      const ctx = await boot(page);
      for (const cond of ['unsolved', 'solved'] as const) await sweep(ctx, cond, condition(ctx, name, cond));
      finish(ctx);
    });
  }
});

/* ──────────────────────────── 2D ↔ 3D with a function open ──────────────────────────── */

/** Press the ribbon's 2D/3D switch and wait for the other view. */
async function flipDimension(ctx: Ctx, to3d: boolean): Promise<void> {
  await ctx.page.getByTestId('rb-cmd-dim').click();
  /* A plane model comes back without the "Switch to 2D" dialog; a real 3D one would ask. */
  await expect.poll(() => is3D(ctx.page)).toBe(to3d);
  await ctx.page.waitForTimeout(400);
}

async function runningKey(page: Page): Promise<string | null> {
  const h = page.getByTestId('adv-running');
  if (await h.isVisible()) return h.getAttribute('data-adv');
  return (await page.getByTestId('steps-catalog').isVisible()) ? 'steps' : null;
}

test.describe('@slow Basic advanced sweep — switching 2D ↔ 3D with a function open', () => {
  test.setTimeout(12 * 60_000);
  for (const name of ['portal-frame', 'gen-gable-frame']) {
    test(name, async ({ page }) => {
      const ctx = await boot(page);
      for (const fn of FUNCTIONS) {
        await test.step(fn.key, async () => {
          await loadNamed(ctx, name);
          await solveFromRibbon(ctx);
          ctx.cond = 'switch';
          ctx.step.label = `${name} [switch] ${fn.key}`;
          /*
           * The plain views are taken AFTER one round trip: a round trip by itself changes
           * the 2D view (the solved drawing does not come back — see D17), and measuring
           * a function against a view the switch itself changed would blame the function.
           */
          await openList(ctx);
          await flipDimension(ctx, true);
          await flipDimension(ctx, false);
          await openList(ctx);
          const base2d = await shot(page);
          await flipDimension(ctx, true);
          await openList(ctx);
          const base3d = await shot(page);
          await flipDimension(ctx, false);
          await openList(ctx);
          const again = await diff(page, base2d, await shot(page));
          if (again.changed > Math.max(400, again.total * 0.002)) {
            note(`SWITCH|${name}|${fn.key}|plain 2D view not reproducible after a round trip (${again.changed} px), skipped`);
            return;
          }

          const btn = fn.find(page);
          await btn.scrollIntoViewIfNeeded();
          if (await btn.isDisabled()) return;
          await press(ctx, btn);
          await page.waitForTimeout(600);
          if (fn.follow && await runningKey(page)) await fn.follow(ctx);
          const running2d = await runningKey(page);

          await flipDimension(ctx, true);
          ctx.three = true;
          const running3d = await runningKey(page);
          const view3d = await shot(page);
          const d3 = await diff(page, base3d, view3d);
          const only2d = !!FUNCTIONS.find((f) => f.key === running3d)?.only2d;
          flag(ctx, running3d ?? fn.key, 'mode', !only2d, `${name} ${fn.key}: in 3D the header says a 2D-only function (${running3d}) is still running`);
          const stale3d = !running3d && d3.changed >= Math.max(400, d3.total * 0.002);
          if (stale3d) keep(`${name}-switch-${fn.key}-3d`, { plain: base3d, now: view3d });
          flag(ctx, fn.key, 'restore', !stale3d, `${name} ${fn.key}: switched to 3D, nothing is running and the view is not the plain 3D view (${d3.changed} px) — a stale drawing`);
          const bad = badTokens(await visibleText(page));
          flag(ctx, fn.key, 'badtext', bad.length === 0, `${name} ${fn.key} in 3D: bad text ${bad.join(',')}`);
          await openList(ctx);

          await flipDimension(ctx, false);
          ctx.three = false;
          const back2d = await runningKey(page);
          let d2 = -1;
          if (!back2d) {
            await openList(ctx);
            const view2d = await shot(page);
            const r = await diff(page, base2d, view2d);
            d2 = r.changed;
            const stale2d = r.changed >= Math.max(400, r.total * 0.002);
            if (stale2d) keep(`${name}-switch-${fn.key}-2d`, { plain: base2d, now: view2d });
            flag(ctx, fn.key, 'restore', !stale2d, `${name} ${fn.key}: back in 2D, nothing is running and the view is not the plain 2D view (${r.changed} px) — a stale drawing`);
          }
          note(`SWITCH|${name}|${fn.key}|2d=${running2d ?? '-'}|3d=${running3d ?? '-'}|d3=${d3.changed}|back2d=${back2d ?? '-'}|d2=${d2}`);
          await openList(ctx);
        });
      }
      finish(ctx);
    });
  }
});

/* ──────────────────────────── on a phone ──────────────────────────── */

test.describe('@slow Basic advanced sweep — on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test.setTimeout(8 * 60_000);
  for (const name of ['portal-frame', '3d-portal-frame']) {
    test(name, async ({ page }) => {
      const ctx = await boot(page, true);
      /* The sheet covers part of the model on a phone, so the drawing is not compared here. */
      await sweep(ctx, 'phone-unsolved', condition(ctx, name, 'unsolved'), { checkPixels: false });
      await sweep(ctx, 'phone-solved', condition(ctx, name, 'solved'), { checkPixels: false });
      finish(ctx);
    });
  }
});

/* ──────────────────────────── known defects, pinned ──────────────────────────── */

/**
 * One test per defect in `KNOWN`, each the shortest way a user meets it, each `test.fail`:
 * red is the expected state until the defect is fixed. The first run after a fix reports
 * the pin as "expected to fail, passed" — the signal to delete the pin and its `KNOWN`
 * entries, so the sweep above takes over guarding the fix.
 */

async function runFn(ctx: Ctx, key: string): Promise<void> {
  await openList(ctx);
  const fn = FUNCTIONS.find((f) => f.key === key)!;
  await press(ctx, fn.find(ctx.page));
  await ctx.page.waitForTimeout(700);
}

async function diagram(page: Page): Promise<string> {
  return page.evaluate(() => window.__stabileo.diagramType());
}

async function pressBack(page: Page): Promise<void> {
  await page.getByTestId('adv-close').click();
  await page.waitForTimeout(400);
}

test.describe('@slow Basic advanced — defects found by this sweep, now regression tests', () => {
  test('D1 influence line: "← Back" throws and leaves the line drawn', async ({ page }) => {
    const ctx = await boot(page);
    await loadNamed(ctx, 'portal-frame');
    await solveFromRibbon(ctx);
    await runFn(ctx, 'influenceLine');
    await clickOnModel(ctx, (await memberMiddle(page))!);
    await expect(page.locator('.toast-success').filter({ hasText: /Influence line/ })).toBeVisible();
    await pressBack(page);
    expect(ctx.errors).toEqual([]);
    expect(await diagram(page)).not.toBe('influenceLine');
  });

  test('D3 P-Δ: "← Back" on a model never solved leaves second-order results as the static ones', async ({ page }) => {
    const ctx = await boot(page);
    await loadNamed(ctx, 'portal-frame');
    await runFn(ctx, 'pdelta');
    await pressBack(page);
    expect((await page.evaluate(() => window.__stabileo.viewportPick())).hasResults).toBe(false);
  });

  test('D4 plastic collapse: after "← Back" the solved view shows the collapse state', async ({ page }) => {
    const ctx = await boot(page);
    await loadNamed(ctx, 'portal-frame');
    await solveFromRibbon(ctx);
    await openList(ctx);
    const before = await shot(page);
    await runFn(ctx, 'plastic');
    await pressBack(page);
    const d = await diff(page, before, await shot(page));
    expect(d.changed).toBeLessThan(Math.max(400, d.total * 0.002));
  });

  test('D5 free-body view: "← Back" drops the diagram the user was looking at', async ({ page }) => {
    const ctx = await boot(page);
    await loadNamed(ctx, 'portal-frame');
    await solveFromRibbon(ctx);
    const before = await diagram(page);
    await runFn(ctx, 'despiece');
    await pressBack(page);
    expect(await diagram(page)).toBe(before);
  });

  test('D6 moving load: "← Back" leaves the moment diagram the run switched to', async ({ page }) => {
    const ctx = await boot(page);
    await loadNamed(ctx, 'portal-frame');
    await solveFromRibbon(ctx);
    const before = await diagram(page);
    await runFn(ctx, 'trainLoad');
    await FUNCTIONS.find((f) => f.key === 'trainLoad')!.follow!(ctx);
    await pressBack(page);
    expect(await diagram(page)).toBe(before);
  });

  test('D7 explained step by step: opening the catalog and going back re-frames the model view', async ({ page }) => {
    const ctx = await boot(page);
    await loadNamed(ctx, 'portal-frame');
    await openList(ctx);
    const before = await shot(page);
    await page.getByTestId('adv-steps').click();
    await expect(page.getByTestId('steps-catalog')).toBeVisible();
    await page.getByTestId('steps-catalog-back').click();
    const d = await diff(page, before, await shot(page));
    expect(d.changed).toBeLessThan(Math.max(400, d.total * 0.002));
  });

  test('D8 3D Dynamic: "← Back" on a model never solved hides its loads', async ({ page }) => {
    const ctx = await boot(page);
    await loadNamed(ctx, '3d-portal-frame');
    await openList(ctx);
    const before = await shot(page);
    await runFn(ctx, 'modal');
    await pressBack(page);
    const d = await diff(page, before, await shot(page));
    expect(d.changed).toBeLessThan(Math.max(400, d.total * 0.002));
  });

  test('D9 3D section analysis: "← Back" leaves the picked member selected', async ({ page }) => {
    const ctx = await boot(page);
    await loadNamed(ctx, '3d-portal-frame');
    await solveFromRibbon(ctx);
    await runFn(ctx, 'stress');
    await clickOnModel(ctx, (await memberMiddle(page))!);
    await page.waitForTimeout(500);
    await pressBack(page);
    expect((await page.evaluate(() => window.__stabileo.selectionByKind())).elements).toEqual([]);
  });

  test('D10 3D section analysis on a section with no shape: an error, and "← Back" stops working', async ({ page }) => {
    const ctx = await boot(page);
    await loadNamed(ctx, '3d-space-truss');
    await solveFromRibbon(ctx);
    await runFn(ctx, 'stress');
    await clickOnModel(ctx, (await memberMiddle(page))!);
    await page.waitForTimeout(600);
    await pressBack(page);
    expect(ctx.errors).toEqual([]);
    await expect(page.getByTestId('adv-running')).toBeHidden();
  });

  test('D11 Dynamic: the mode shape of a beam whose nodes are all supported does not move', async ({ page }) => {
    const ctx = await boot(page);
    await loadNamed(ctx, 'simply-supported');
    await runFn(ctx, 'modal');
    await expect(page.getByTestId('adv-running')).toBeVisible();
    expect(await motion(page)).toBeGreaterThan(400);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test('D12 a tap on the model logs "Unable to preventDefault inside passive event listener"', async ({ page }) => {
      const ctx = await boot(page, true);
      await loadNamed(ctx, 'portal-frame');
      await solveFromRibbon(ctx);
      await runFn(ctx, 'stress');
      await clickOnModel(ctx, (await memberMiddle(page))!);
      await page.waitForTimeout(500);
      expect(ctx.errors).toEqual([]);
    });
  });

  test('D16 moving load on an unloaded frame never solved: "envelope computed", and nothing is drawn', async ({ page }) => {
    const ctx = await boot(page);
    await loadNamed(ctx, 'gen-unloaded-frame');
    await runFn(ctx, 'trainLoad');
    expect(await FUNCTIONS.find((f) => f.key === 'trainLoad')!.follow!(ctx)).toBeNull();
  });

  test('D17 a 2D → 3D → 2D round trip discards the solve', async ({ page }) => {
    test.fail(!process.env.SWEEP_PINS_STRICT, 'the solved drawing does not come back: the model is shown unsolved. May be intended (the solve belongs to one workspace), but nothing says so');
    const ctx = await boot(page);
    await loadNamed(ctx, 'portal-frame');
    await solveFromRibbon(ctx);
    await openList(ctx);
    const before = await shot(page);
    await flipDimension(ctx, true);
    await flipDimension(ctx, false);
    await openList(ctx);
    const d = await diff(page, before, await shot(page));
    expect(d.changed).toBeLessThan(Math.max(400, d.total * 0.002));
  });

  test('D18 Kinematic analysis stays open after switching to 3D, where it is disabled', async ({ page }) => {
    const ctx = await boot(page);
    await loadNamed(ctx, 'portal-frame');
    await runFn(ctx, 'kinematic');
    await expect(page.getByTestId('adv-running')).toHaveAttribute('data-adv', 'kinematic');
    await flipDimension(ctx, true);
    expect(await runningKey(page)).not.toBe('kinematic');
  });

  test('D19 Dynamic opened in 2D, then 3D: nothing is running and the loads are gone', async ({ page }) => {
    const ctx = await boot(page);
    await loadNamed(ctx, 'portal-frame');
    await openList(ctx);
    await flipDimension(ctx, true);
    await openList(ctx);
    const plain = await shot(page);
    await flipDimension(ctx, false);
    await runFn(ctx, 'modal');
    await flipDimension(ctx, true);
    expect(await runningKey(page)).toBeNull();
    const d = await diff(page, plain, await shot(page));
    expect(d.changed).toBeLessThan(Math.max(400, d.total * 0.002));
  });
});
