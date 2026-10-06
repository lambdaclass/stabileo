/**
 * Members drawn point to point in 2D, without placing nodes first: a click
 * on empty space makes the node when the member is made, a click on a
 * member splits it (so the new member is really joined), and each member is
 * one undo step.
 */
import { test, expect } from './fixtures';

test.describe('@smoke drawing members in 2D without nodes first', () => {
  test('free points, a chain, a joint on a member, and undo', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
    const nodes = () => page.evaluate(() => window.__stabileo.nodeIds().length);
    const members = () => page.evaluate(() => window.__stabileo.elementIds().length);
    expect(await nodes()).toBe(0);

    await page.getByTestId('rb-cmd-element').click();
    const box = (await page.locator('canvas:not(.axis-gizmo)').first().boundingBox())!;
    const at = (fx: number, fy: number) => page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);

    // The first click makes nothing: no stray node if the chain is abandoned.
    await at(0.3, 0.6);
    expect(await nodes()).toBe(0);
    await at(0.6, 0.6);
    await expect.poll(members).toBe(1);
    expect(await nodes()).toBe(2);
    // Chained from there.
    await at(0.6, 0.35);
    await expect.poll(members).toBe(2);
    expect(await nodes()).toBe(3);

    // A new chain from empty space to the middle of the first member: it
    // splits the member there, so the new one is joined to it.
    await page.keyboard.press('Escape');
    await page.getByTestId('rb-cmd-element').click();
    const [a, b] = await page.evaluate(() => window.__stabileo.nodeIds().slice(0, 2));
    const pa = (await page.evaluate((id) => window.__stabileo.nodeScreenPos(id), a))!;
    const pb = (await page.evaluate((id) => window.__stabileo.nodeScreenPos(id), b))!;
    await at(0.45, 0.85);
    await page.mouse.click((pa.x + pb.x) / 2, (pa.y + pb.y) / 2);
    // Split (one member becomes two) plus the new one; one new free node and the split node.
    await expect.poll(members).toBe(4);
    expect(await nodes()).toBe(5);

    // One undo removes that member, its free node and the split.
    await page.getByRole('button', { name: /Deshacer|Undo|Desfazer/ }).first().click();
    await expect.poll(members).toBe(2);
    expect(await nodes()).toBe(3);
  });

  test('each member is one undo step, and undo and redo walk the drawing back and forth', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
    /** The whole drawing: every node where it is, and every member id. */
    const state = () => page.evaluate(() => JSON.stringify({
      nodes: window.__stabileo.nodeIds().map((id) => [id, window.__stabileo.nodePos(id)]),
      members: window.__stabileo.elementIds(),
    }));
    const census = () => page.evaluate(() => {
      const c = window.__stabileo.modelCensus();
      return { nodes: c.nodes, members: c.elements };
    });
    const undos = () => page.evaluate(() => window.__stabileo.undoCount());
    const nodeAt = async (k: number) => {
      const id = await page.evaluate((i) => window.__stabileo.nodeIds()[i], k);
      return (await page.evaluate((i) => window.__stabileo.nodeScreenPos(i), id))!;
    };

    await page.getByTestId('rb-cmd-element').click();
    const box = (await page.locator('canvas:not(.axis-gizmo)').first().boundingBox())!;
    const at = (fx: number, fy: number) => page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);

    const states = [await state()];
    const u0 = await undos();
    const step = async (draw: () => Promise<void>, expected: { nodes: number; members: number }) => {
      await draw();
      await expect.poll(census).toEqual(expected);
      // One member, however many nodes and splits it took: exactly one step more.
      expect(await undos()).toBe(u0 + states.length);
      states.push(await state());
    };

    // Two free ends: two nodes and the member, together.
    await step(async () => { await at(0.3, 0.6); await at(0.6, 0.6); }, { nodes: 2, members: 1 });
    // Chained: one node more.
    await step(() => at(0.6, 0.3), { nodes: 3, members: 2 });
    // From empty space to the first member's middle: a free node, the split
    // node, the split (one member becomes two) and the new member.
    await page.keyboard.press('Escape');
    await page.getByTestId('rb-cmd-element').click();
    const [a, b] = [await nodeAt(0), await nodeAt(1)];
    await step(async () => {
      await at(0.45, 0.85);
      await page.mouse.click((a.x + b.x) / 2, (a.y + b.y) / 2);
    }, { nodes: 5, members: 4 });
    // From an existing node to a point a quarter along the chained member:
    // no new free node, one split node, the split and the new member.
    await page.keyboard.press('Escape');
    await page.getByTestId('rb-cmd-element').click();
    const [c, d, m] = [await nodeAt(1), await nodeAt(2), await nodeAt(4)];
    await step(async () => {
      await page.mouse.click(a.x, a.y);
      await page.mouse.click(c.x + (d.x - c.x) * 0.25, c.y + (d.y - c.y) * 0.25);
    }, { nodes: 6, members: 6 });

    // Ends already joined, by one member or by a run of split ones: the new
    // member lies on top of them, and the editor asks. Deleting it right away
    // takes the drawing back, so no step is left behind.
    for (const [p, q] of [[m, b], [c, a]]) {
      await page.keyboard.press('Escape');
      await page.getByTestId('rb-cmd-element').click();
      await page.mouse.click(p.x, p.y);
      await page.mouse.click(q.x, q.y);
      await expect(page.getByTestId('connection-prompt')).toContainText(/repite|repeats|superpone|overlaps/);
      await page.getByTestId('connection-accept').click();
      await expect(page.getByTestId('connection-prompt')).toHaveCount(0);
      await expect.poll(census).toEqual({ nodes: 6, members: 6 });
      expect(await undos()).toBe(u0 + 4);
    }
    await page.keyboard.press('Escape');

    // Undo walks back one member at a time, to the empty model.
    for (let k = states.length - 2; k >= 0; k--) {
      await page.keyboard.press('ControlOrMeta+z');
      await expect.poll(state).toBe(states[k]);
    }
    // And redo walks forward again, by keyboard and by the ribbon's button.
    for (let k = 1; k < states.length; k++) {
      if (k % 2) await page.keyboard.press('ControlOrMeta+Shift+z');
      else await page.getByRole('button', { name: /Rehacer|Redo|Refazer/ }).first().click();
      await expect.poll(state).toBe(states[k]);
    }
  });

  test('single line makes one member per two clicks; a polyline ends on its last point', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
    const census = () => page.evaluate(() => {
      const c = window.__stabileo.modelCensus();
      return { nodes: c.nodes, members: c.elements };
    });
    const undos = () => page.evaluate(() => window.__stabileo.undoCount());
    await page.getByTestId('rb-cmd-element').click();
    const box = (await page.locator('canvas:not(.axis-gizmo)').first().boundingBox())!;
    const at = (fx: number, fy: number) => page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    const u0 = await undos();

    await page.getByTestId('member-mode-single').click();
    await at(0.3, 0.6); await at(0.6, 0.6);
    await expect.poll(census).toEqual({ nodes: 2, members: 1 });
    // The third click starts another member instead of continuing this one.
    await at(0.6, 0.3);
    await page.waitForTimeout(200);
    expect(await census()).toEqual({ nodes: 2, members: 1 });
    await at(0.8, 0.3);
    await expect.poll(census).toEqual({ nodes: 4, members: 2 });

    await page.getByTestId('member-mode-polyline').click();
    await at(0.3, 0.8); await at(0.5, 0.8);
    await expect.poll(census).toEqual({ nodes: 6, members: 3 });
    // The last point again ends the chain: the next click starts a new one.
    await at(0.5, 0.8);
    await at(0.7, 0.8);
    await page.waitForTimeout(200);
    expect(await census()).toEqual({ nodes: 6, members: 3 });
    await at(0.85, 0.7);
    await expect.poll(census).toEqual({ nodes: 8, members: 4 });
    // One undo step per member, in both modes.
    expect(await undos()).toBe(u0 + 4);
  });

  test('in 3D the modes string nodes the same way', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
    await page.evaluate(() => window.__stabileoActions.loadExample('3d-portal-frame'));
    const members = () => page.evaluate(() => window.__stabileo.elementIds().length);
    const undos = () => page.evaluate(() => window.__stabileo.undoCount());
    // The base nodes: no member joins them to one another.
    const base = await page.evaluate(() => {
      const ids = window.__stabileo.nodeIds();
      const zs = ids.map((id) => window.__stabileo.nodePos(id)!.z);
      const low = Math.min(...zs);
      return ids.filter((_, k) => Math.abs(zs[k] - low) < 1e-6);
    });
    expect(base.length).toBeGreaterThanOrEqual(3);
    await page.getByTestId('rb-cmd-element').click();
    const click = async (id: number) => {
      const p = (await page.evaluate((n) => window.__stabileo.nodeScreenPos(n), id))!;
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(150);
    };
    const m0 = await members();
    const u0 = await undos();

    // Polyline (the default): three nodes, two members.
    await click(base[0]); await click(base[1]); await click(base[2]);
    await expect.poll(members).toBe(m0 + 2);
    expect(await undos()).toBe(u0 + 2);
    // The last node again ends it.
    await click(base[2]);
    await click(base[0]);
    await page.waitForTimeout(200);
    expect(await members()).toBe(m0 + 2);
    await page.keyboard.press('Escape');

    // Single line: two nodes, one member, and the next click starts over.
    await page.getByTestId('rb-cmd-element').click();
    await page.getByTestId('member-mode-single').click();
    await click(base[0]); await click(base[2]);
    await expect.poll(members).toBe(m0 + 3);
    await click(base[1]);
    await page.waitForTimeout(200);
    expect(await members()).toBe(m0 + 3);
    expect(await undos()).toBe(u0 + 3);
  });

  test('the dimensions switch is one setting, in the member tool and in Settings', async ({ page }) => {
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
    const stored = () => page.evaluate(() => localStorage.getItem('stabileo-member-dims'));
    await page.getByTestId('rb-cmd-element').click();
    const button = page.getByTestId('member-dims');
    await expect(button).toHaveAttribute('aria-pressed', 'true');

    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(await stored()).toBe('false');

    await page.getByTestId('rb-settings').click();
    const box = page.getByTestId('cfg-member-dims');
    await expect(box).not.toBeChecked();
    await box.check();
    expect(await stored()).toBe('true');
    await page.getByTestId('rb-cmd-element').click();
    await expect(page.getByTestId('member-dims')).toHaveAttribute('aria-pressed', 'true');
  });
});
