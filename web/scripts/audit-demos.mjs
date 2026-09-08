/**
 * Walk every demo, every step, and check the things a reader would notice.
 *
 *   1. the spotlight has something to point at (target exists and is visible)
 *   2. a step that asks for an action can REACH the thing it asks about —
 *      the hole in the overlay has to be over what you must click
 *   3. a step that claims to show a result actually switched to it
 *   4. no page errors anywhere
 */
import { chromium } from 'playwright';

const DEMOS = ['basics-2d', 'basics-3d', 'modelling-2d', 'navigation', 'results', 'kinematics', 'section-analysis', 'settings'];

/** Steps that require the reader to act on the CANVAS, with what they must do. */
const CANVAS_STEPS = new Set(['nodes', 'member', 'supports', 'load', 'pick', 'window-crossing', 'drag']);

/** Steps that claim a result is on screen → what diagramType must be. */
const EXPECT_DIAGRAM = {
  deformed: 'deformed', moment: ['moment', 'momentY'], axial: 'axial',
  shearZ: ['shear', 'shearZ'], stress: 'colorMap',
};

/*
 * The viewport is an argument, because the anchors depend on it.
 *
 * `ANCHORS.ribbonCommand` resolves differently below 768 px — a phone points
 * at `dt-tab-*` inside the data sheet where a desktop points at `rb-cmd-*` —
 * so a walkthrough can be whole at 1500 px and broken at 375 with the audit
 * reporting nothing. It only ever ran the desktop width, which is the one
 * width these repairs were NOT about.
 *
 *   node scripts/audit-demos.mjs              # 1500×950, as before
 *   node scripts/audit-demos.mjs 375 667      # the phone
 */
const [argW, argH] = process.argv.slice(2);
const VIEWPORT = { width: Number(argW) || 1500, height: Number(argH) || 950 };

const b = await chromium.launch();
let problems = 0;
console.log(`viewport ${VIEWPORT.width}×${VIEWPORT.height}`);

for (const id of DEMOS) {
  const c = await b.newContext({
    viewport: VIEWPORT,
    ...(VIEWPORT.width < 768 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
  });
  await c.addInitScript(() => {
    localStorage.setItem('stabileo-lang', 'es');
    localStorage.setItem('stabileo-lang-manual', '1');
  });
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:4258/app/basic?e2e=1', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => !!window.__stabileo, null, { timeout: 60000 });
  await p.waitForFunction(() => window.__stabileo.solverReady?.(), null, { timeout: 60000 });

  await p.locator('[data-testid="hdr-project"]').click();
  await p.waitForTimeout(400);
  await p.locator('[data-testid="demo-menu-toggle"]').click();
  await p.waitForTimeout(300);
  if (!(await p.locator(`[data-testid="demo-${id}"]`).count())) {
    console.log(`\n■ ${id}: NO EXISTE en el menú`);
    await c.close();
    continue;
  }
  await p.locator(`[data-testid="demo-${id}"]`).click();
  await p.waitForTimeout(1500);

  console.log(`\n■ ${id}`);
  const card = p.locator('.tour-card').first();

  for (let i = 0; i < 14; i++) {
    if (!(await card.isVisible().catch(() => false))) break;

    const info = await p.evaluate(() => {
      return window.__stabileo.tourStep();
    });
    const title = ((await card.innerText()).split('\n')[1] ?? '?').slice(0, 30);
    const stepId = info?.id ?? `#${i}`;
    const notes = [];

    // 1 + 2: is there something to point at, and can it be reached?
    if (info && info.target && info.target !== 'none') {
      const n = await p.locator(info.target).count();
      if (n === 0) { notes.push(`❌ target ausente: ${info.target}`); problems++; }
      else if (!(await p.locator(info.target).first().isVisible())) {
        notes.push(`❌ target invisible: ${info.target}`); problems++;
      }
    }

    // 2: a canvas step must let the reader reach the canvas
    if (CANVAS_STEPS.has(stepId)) {
      const spot = await p.evaluate(() => {
        const r = document.querySelector('#tour-spotlight-mask rect[fill="black"]');
        if (!r) return null;
        const g = (a) => Number(r.getAttribute(a));
        return { x: g('x'), y: g('y'), width: g('width'), height: g('height') };
      });
      const canvas = await p.locator('canvas:not(.axis-gizmo)').first().boundingBox();
      const covers = spot && canvas
        && spot.x <= canvas.x + canvas.width * 0.5 && spot.x + spot.width >= canvas.x + canvas.width * 0.5
        && spot.y <= canvas.y + canvas.height * 0.5 && spot.y + spot.height >= canvas.y + canvas.height * 0.5;
      if (!info?.allowInteraction) { notes.push('❌ pide acción pero no deja interactuar'); problems++; }
      else if (!covers) { notes.push('❌ el hueco no está sobre el modelo — no se puede dibujar'); problems++; }
    }

    // 3: a step that claims a result must have switched to it
    const want = EXPECT_DIAGRAM[stepId];
    if (want) {
      const dt = await p.evaluate(() => window.__stabileo.diagramType());
      const ok = Array.isArray(want) ? want.includes(dt) : dt === want;
      if (!ok) { notes.push(`❌ dice mostrar ${stepId} pero diagramType=${dt}`); problems++; }
    }

    console.log(`   ${String(i).padStart(2)} ${stepId.padEnd(16)} ${title.padEnd(31)} ${notes.join('  ') || '✓'}`);

    const next = card.locator('button').filter({ hasText: /Siguiente|→|Calcular|Listo|Finalizar/ }).first();
    if (!(await next.count())) { console.log(`      ⏸ espera acción del lector`); break; }
    await next.click().catch(() => {});
    await p.waitForTimeout(900);
  }
  if (errs.length) { console.log(`   ❌ errores de página: ${errs[0].slice(0, 80)}`); problems++; }
  await c.close();
}

console.log(`\n${problems ? `${problems} problemas` : 'sin problemas'}`);
await b.close();
