/**
 * Editing a designed and detailed building keeps the pace of the analytical model: a node moved
 * on the 7-storey example, in the wireframe view and in the physical geometry, each edit timed
 * until the viewer has drawn it. The physical view stays within a small multiple of the
 * wireframe one and under a frame budget a person feels as immediate.
 */
import { test, expect, designAll, loadModel, designPlace } from './fixtures';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 1400, height: 900 } });

/** Median time of `n` edits, each until two frames have been drawn after it, ms. */
async function editTimes(page: Page, n = 8): Promise<number> {
  const times = await page.evaluate(async (count) => {
    const ids = window.__stabileo.nodeIds() as number[];
    const pos = (id: number) => window.__stabileo.nodePosition(id) as { x: number; y: number; z: number };
    const id = ids.find((i) => pos(i).z > 3) ?? ids[0]!;
    const p0 = pos(id), out: number[] = [];
    for (let i = 0; i < count; i++) {
      const t0 = performance.now();
      window.__stabileoActions.moveNode(id, p0.x + (i % 2 ? 0 : 0.01), p0.y, p0.z);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      out.push(performance.now() - t0);
    }
    return out;
  }, n);
  const s = [...times].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

test.describe('@slow model fluidity with design', () => {
  test('a node moved on the detailed 7-storey building, wireframe and physical', async ({ pro: page }) => {
    test.setTimeout(600_000);
    await loadModel(page, 'pro-edificio-7p');
    await designAll(page);
    await designPlace(page, 'detailing');
    await page.getByTestId('cmd-generate-detailing').click();
    await expect.poll(async () => page.evaluate(() =>
      (window.__stabileo as unknown as { detailingAssemblies(): unknown[] }).detailingAssemblies().length), { timeout: 120_000 }).toBeGreaterThan(0);
    await page.keyboard.press('Escape');

    const wire = await editTimes(page);
    await page.getByTestId('cam-menu').click();
    await page.getByTestId('cam-menu-pop').getByText(/physical geometry|geometr[ií]a f[ií]sica/i).click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.renderMode3D())).toBe('physical');
    const physical = await editTimes(page);
    console.log(`FLUIDITY wireframe ${wire.toFixed(0)} ms · physical ${physical.toFixed(0)} ms`);
    test.info().annotations.push({ type: 'fluidity', description: `wireframe ${wire.toFixed(0)} ms, physical ${physical.toFixed(0)} ms` });
    expect(physical, 'an edit in the physical view, drawn').toBeLessThan(Math.max(250, 4 * wire));
  });
});
