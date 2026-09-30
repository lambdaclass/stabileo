/**
 * Move nodes: a press that lands on no node does nothing — and throws
 * nothing. It read an undefined variable (`ms`) and raised a ReferenceError
 * on every press off a node.
 */
import { test, expect } from './fixtures';

test.describe('@smoke moving nodes', () => {
  test('a press off every node is ignored without an error', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    const before = await page.evaluate(() => window.__stabileo.modelVersion());
    await page.getByTestId('rb-cmd-move').click();
    await page.getByTestId('move-nodes').click();
    const box = (await page.locator('canvas:not(.axis-gizmo)').first().boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.9);
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => window.__stabileo.modelVersion())).toBe(before);
  });

  test('the pointer button says it is moving nodes, not selecting', async ({ page }) => {
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
    await page.getByTestId('rb-cmd-move').click();
    await page.getByTestId('move-nodes').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.currentTool())).toBe('moveNodes');
    const tip = page.locator('.pm-tip-mode');
    await expect(tip).toHaveText(/Mover nodo|Move node|Mover nó/);
    // Its own drawing: the dashed place the node was.
    await expect(page.getByTestId('pointer-mode').locator('circle[stroke-dasharray]')).toHaveCount(1);
  });
});
