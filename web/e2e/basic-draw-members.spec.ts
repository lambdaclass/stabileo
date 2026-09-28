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
});
