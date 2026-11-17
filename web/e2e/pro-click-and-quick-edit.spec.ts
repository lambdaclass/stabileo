import { test, expect, loadModel } from './fixtures';
import type { Page } from '@playwright/test';

/*
 * Selecting in PRO by a plain click, as a hand makes it: a few pixels of movement, a few pixels
 * beside the line. And the double-click editor on a node, a member and a shell.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const pos = (page: Page, n: number) => page.evaluate((id) => window.__stabileo.nodeScreenPos(id), n);
const members = (page: Page) => page.evaluate(() => window.__stabileo.selection());

test.describe('@smoke PRO click selection and the quick editor', () => {
  test('a click that wanders a few pixels, or lands beside the member, still takes it', async ({ pro: page }) => {
    await loadModel(page, 'pro-edificio-7p');
    await page.getByTestId('pr-select').click();
    await page.getByTestId('select-mode-elements').click();
    const ids = await page.evaluate(() => window.__stabileo.elementIds());
    let checked = 0;
    for (const id of ids) {
      if (checked >= 4) break;
      const e = await page.evaluate((i) => window.__stabileo.entityData('element', i) as { nodeI: number; nodeJ: number }, id);
      const a = await pos(page, e.nodeI), b = await pos(page, e.nodeJ);
      if (!a || !b) continue;
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L < 40) continue;
      const x = a.x + (b.x - a.x) * 0.5, y = a.y + (b.y - a.y) * 0.5;
      if (x < 20 || x > 880 || y < 160 || y > 860) continue;
      // Down, a 5 px wander, up.
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 4, y + 3); await page.mouse.up();
      await expect.poll(() => members(page)).toEqual([id]);
      await page.mouse.click(10, 870); // away
      // 6 px beside the line.
      const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
      await page.mouse.click(x + nx * 6, y + ny * 6);
      await expect.poll(() => members(page)).toEqual([id]);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  test('double-click a member: section, material, behaviour and ends, written at once', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await page.getByTestId('pr-select').click();
    const a = (await pos(page, 5))!, b = (await pos(page, 6))!;
    await page.mouse.dblclick((a.x + b.x) / 2, (a.y + b.y) / 2);
    const card = page.getByTestId('quick-edit');
    await expect(card).toBeVisible();
    await card.getByTestId('qe-axial').selectOption('truss');
    await expect.poll(() => page.evaluate(() => (window.__stabileo.entityData('element', 5) as { type: string }).type)).toBe('truss');
    await card.getByTestId('qe-axial').selectOption('frame');
    await card.getByTestId('qe-end-end').selectOption('pinned');
    await expect.poll(() => page.evaluate(() => (window.__stabileo.entityData('element', 5) as { releaseJ?: { my?: boolean; mz?: boolean } }).releaseJ))
      .toMatchObject({ my: true, mz: true });
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);

    // A node: its coordinates.
    await page.mouse.dblclick(a.x, a.y);
    await expect(page.getByTestId('qe-node-z')).toBeVisible();
    await page.getByTestId('qe-node-z').fill('3.5');
    await page.getByTestId('qe-node-z').press('Tab');
    await expect.poll(() => page.evaluate(() => window.__stabileo.nodePos(5)?.z)).toBe(3.5);
  });

  test('double-click a quad: its nodes, turning it over, and meshing it', async ({ pro: page }) => {
    await loadModel(page, 'mat-foundation');
    await page.getByTestId('pr-select').click();
    await page.getByTestId('select-mode-shells').click();
    const quads = await page.evaluate(() => window.__stabileo.entityData('setting', 'quads') as Array<[number, { nodes: number[] }]>);
    let target: { id: number; nodes: number[]; x: number; y: number } | null = null;
    for (const [id, q] of quads) {
      const ps = await Promise.all(q.nodes.map((n) => pos(page, n)));
      if (ps.some((p) => !p)) continue;
      const x = ps.reduce((s, p) => s + p!.x, 0) / 4, y = ps.reduce((s, p) => s + p!.y, 0) / 4;
      if (x > 40 && x < 860 && y > 180 && y < 840) { target = { id, nodes: q.nodes, x, y }; break; }
    }
    expect(target).not.toBeNull();
    const t0 = target!;
    await page.mouse.dblclick(t0.x, t0.y);
    const card = page.getByTestId('quick-edit');
    await expect(card.getByTestId('qe-shell-nodes')).toHaveValue(t0.nodes.join(', '));
    await card.getByTestId('qe-flip').click();
    const [n0, n1, n2, n3] = t0.nodes;
    await expect(card.getByTestId('qe-shell-nodes')).toHaveValue([n0, n3, n2, n1].join(', '));
    const before = quads.length;
    await card.getByTestId('qe-mesh-size').fill('0.25');
    await card.getByTestId('qe-mesh').click();
    await expect.poll(async () => (await page.evaluate(() => window.__stabileo.quadIds())).length).toBeGreaterThan(before);
  });

  test("the shells list edits a quad's nodes, and refuses three", async ({ pro: page }) => {
    await loadModel(page, 'mat-foundation');
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-shells').click();
    const q = (await page.evaluate(() => window.__stabileo.entityData('setting', 'quads') as Array<[number, { nodes: number[] }]>))[0]!;
    const input = page.getByTestId(`plate-nodes-q${q[0]}`);
    const [a, b, c, d] = q[1].nodes;
    await input.fill([a, d, c, b].join(', '));
    await input.press('Tab');
    await expect.poll(async () => (await page.evaluate((id) => (window.__stabileo.entityData('setting', 'quads') as Array<[number, { nodes: number[] }]>).find(([k]) => k === id)?.[1].nodes, q[0]))).toEqual([a, d, c, b]);
    await input.fill([a, b, c].join(', '));
    await input.press('Tab');
    await expect(page.getByTestId('plate-nodes-error')).toBeVisible();
  });

  test('drawing a plate shows the cross, as drawing a member does', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-shells').click();
    await page.getByTestId('draw-plate').click();
    const p = (await pos(page, 5))!;
    await page.mouse.move(p.x, p.y);
    const cursor = await page.evaluate(([x, y]) => {
      let el = document.elementFromPoint(x, y) as HTMLElement | null;
      while (el && !(el.getAttribute('style') ?? '').includes('cursor')) el = el.parentElement;
      return el ? getComputedStyle(el).cursor : '';
    }, [p.x, p.y]);
    expect(cursor).toBe('crosshair');
  });
});
