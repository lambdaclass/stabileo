/**
 * Drawing and moving in 2D, the editor notices what touches without being
 * connected and asks: a member drawn across another, a node dropped on a
 * node or on a member. A yes connects them inside the same undo step; a no
 * leaves them apart. A member ending where two cross is joined to both.
 */
import { test, expect, type Page } from './fixtures';

async function boot(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
}
const census = (page: Page) => page.evaluate(() => {
  const c = window.__stabileo.modelCensus();
  return { nodes: c.nodes, members: c.elements };
});
const undos = (page: Page) => page.evaluate(() => window.__stabileo.undoCount());
const pos = (page: Page, k: number) => page.evaluate((i) => {
  const id = window.__stabileo.nodeIds()[i];
  return window.__stabileo.nodeScreenPos(id)!;
}, k);

/** A beam, and a post drawn across it, single-line mode. */
async function drawCross(page: Page) {
  await page.getByTestId('rb-cmd-element').click();
  await page.getByTestId('member-mode-single').click();
  const box = (await page.locator('canvas:not(.axis-gizmo)').first().boundingBox())!;
  const at = (fx: number, fy: number) => page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await at(0.2, 0.55); await at(0.6, 0.55);
  await expect.poll(() => census(page)).toEqual({ nodes: 2, members: 1 });
  await at(0.4, 0.3); await at(0.4, 0.8);
  await expect.poll(() => census(page)).toEqual({ nodes: 4, members: 2 });
  return { box, at };
}

test.describe('@smoke connections in 2D', () => {
  test('a member drawn across another: connect, in the same undo step', async ({ page }) => {
    await boot(page);
    const u0 = await undos(page);
    await drawCross(page);
    const prompt = page.getByTestId('connection-prompt');
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText(/cruza|crosses/);
    await page.getByTestId('connection-accept').click();
    await expect(prompt).toHaveCount(0);
    await expect.poll(() => census(page)).toEqual({ nodes: 5, members: 4 });
    expect(await undos(page)).toBe(u0 + 2);
    // One undo takes back the post and its connection together.
    await page.keyboard.press('Escape');
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => census(page)).toEqual({ nodes: 2, members: 1 });
  });

  test('left unconnected, then a member ending on the crossing joins both', async ({ page }) => {
    await boot(page);
    const { at } = await drawCross(page);
    await page.getByTestId('connection-decline').click();
    await expect(page.getByTestId('connection-prompt')).toHaveCount(0);
    expect(await census(page)).toEqual({ nodes: 4, members: 2 });
    // The crossing: the post's x, the beam's height.
    const beam = await pos(page, 0), post = await pos(page, 2);
    await at(0.75, 0.25);
    await page.mouse.click(post.x, beam.y);
    // Both members split at one new node, plus the new member and its free end.
    await expect.poll(() => census(page)).toEqual({ nodes: 6, members: 5 });
  });

  test('a node dropped on another asks to join them; one undo takes back both', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    const start = await census(page);
    const u0 = await undos(page);
    await page.getByTestId('rb-cmd-move').click();
    await page.getByTestId('move-nodes').click();
    // Drag the first node onto the second.
    const ids = await page.evaluate(() => window.__stabileo.nodeIds());
    const a = (await page.evaluate((id) => window.__stabileo.nodeScreenPos(id), ids[0]))!;
    const b = (await page.evaluate((id) => window.__stabileo.nodeScreenPos(id), ids[ids.length - 1]))!;
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
    await page.mouse.move(b.x + 3, b.y - 2, { steps: 5 });
    await page.mouse.up();
    const prompt = page.getByTestId('connection-prompt');
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText(/encima|on top/);
    await page.getByTestId('connection-accept').click();
    await expect.poll(async () => (await census(page)).nodes).toBe(start.nodes - 1);
    expect(await undos(page)).toBe(u0 + 1);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => census(page)).toEqual(start);
  });

  test('a node dropped on a member asks to split it; no leaves it unconnected', async ({ page }) => {
    await boot(page);
    const { at } = await drawCross(page);
    await page.getByTestId('connection-decline').click();
    // A free node, dropped on the beam at a quarter of its length.
    await page.keyboard.press('Escape');
    await page.getByTestId('rb-cmd-node').click();
    await at(0.8, 0.3);
    await expect.poll(async () => (await census(page)).nodes).toBe(5);
    await page.getByTestId('rb-cmd-move').click();
    await page.getByTestId('move-nodes').click();
    const n = await pos(page, 4), b0 = await pos(page, 0), b1 = await pos(page, 1);
    const q = { x: b0.x + (b1.x - b0.x) * 0.25, y: b0.y };
    await page.mouse.move(n.x, n.y);
    await page.mouse.down();
    await page.mouse.move(q.x, q.y - 20, { steps: 5 });
    await page.mouse.move(q.x, q.y + 1, { steps: 5 });
    await page.mouse.up();
    const prompt = page.getByTestId('connection-prompt');
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText(/sobre la barra|on member/);
    await page.getByTestId('connection-decline').click();
    expect((await census(page)).members).toBe(2);
    // Asked again, the answer is yes: the beam is split at the node.
    await page.mouse.move(q.x, q.y);
    await page.mouse.down();
    await page.mouse.move(q.x + 30, q.y - 30, { steps: 5 });
    await page.mouse.move(q.x, q.y + 1, { steps: 5 });
    await page.mouse.up();
    await page.getByTestId('connection-accept').click();
    await expect.poll(async () => (await census(page)).members).toBe(3);
  });

  test('two crossings, two questions: the card steps through them', async ({ page }) => {
    await boot(page);
    const { at } = await drawCross(page);
    // A second post across the beam, before answering the first question.
    await at(0.5, 0.3); await at(0.5, 0.8);
    await expect.poll(() => census(page)).toEqual({ nodes: 6, members: 3 });
    await expect(page.getByTestId('connection-pos')).toHaveText('2 / 2');
    await expect(page.getByTestId('connection-prompt')).toContainText(/3/);
    await page.getByTestId('connection-prev').click();
    await expect(page.getByTestId('connection-pos')).toHaveText('1 / 2');
    await expect(page.getByTestId('connection-prompt')).toContainText(/2/);
    // Connect the first post; the second question is still there.
    await page.getByTestId('connection-accept').click();
    await expect.poll(() => census(page)).toEqual({ nodes: 7, members: 5 });
    await expect(page.getByTestId('connection-nav')).toHaveCount(0);
    await expect(page.getByTestId('connection-prompt')).toBeVisible();
    await page.getByTestId('connection-accept').click();
    await expect.poll(() => census(page)).toEqual({ nodes: 8, members: 7 });
    await expect(page.getByTestId('connection-prompt')).toHaveCount(0);
  });
});
