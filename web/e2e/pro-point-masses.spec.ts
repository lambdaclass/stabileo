/**
 * Point masses entered in the mass-source panel reach the engine in the browser (#341).
 *
 * The unit suites check the mass source against the WASM engine in Node; this checks the real
 * path in the app: the panel writes `MassSource.points`, the advanced tab builds the dynamic
 * input, the wire serializer carries `masses`, and the engine's modal analysis uses them. When the
 * point masses dominate, multiplying them by 4 must halve the first frequency.
 */
import { test, expect, loadModel } from './fixtures';

test.use({ viewport: { width: 1280, height: 800 } });

async function firstFrequency(page: import('@playwright/test').Page): Promise<number> {
  await page.getByTestId('adv-run-modal').click();
  const row = page.getByTestId('adv-modal-row-0');
  await expect(row).toBeVisible({ timeout: 30_000 });
  const text = await row.locator('td').nth(1).innerText();
  const f = Number(text.replace(/\s/g, '').replace(',', '.'));
  expect(Number.isFinite(f) && f > 0, `frequency cell "${text}"`).toBe(true);
  return f;
}

test.describe('@smoke PRO point masses', () => {
  test('a point mass entered in the panel changes the modal frequency as the engine computes it', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    // The two highest nodes: the beam's ends.
    const top = await page.evaluate(() => {
      const s = window.__stabileo;
      const ids = s.nodeIds();
      const zmax = Math.max(...ids.map((id) => s.nodePos(id)!.z));
      return ids.filter((id) => Math.abs(s.nodePos(id)!.z - zmax) < 1e-9);
    });
    expect(top.length).toBeGreaterThanOrEqual(2);

    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-advanced').click();
    const bare = await firstFrequency(page);

    const setPoints = async (m: number) => {
      for (let i = 0; i < 2; i++) {
        if (await page.getByTestId(`pm-node-${i}`).count() === 0) await page.getByTestId('pm-add').click();
        const node = page.getByTestId(`pm-node-${i}`);
        await node.fill(String(top[i]));
        await node.dispatchEvent('change');
        const mass = page.getByTestId(`pm-m-${i}`);
        await mass.fill(String(m));
        await mass.dispatchEvent('change');
        await page.getByTestId(`pm-h-${i}`).check();
      }
    };

    await setPoints(500);
    const heavy = await firstFrequency(page);
    // 2 × 500 t on a portal of a few tonnes: far lower.
    expect(heavy).toBeLessThan(0.2 * bare);
    await expect(page.getByTestId('mass-source-summary')).toContainText(/1[\s.,]?000/);

    await setPoints(2000);
    const heavier = await firstFrequency(page);
    // The point masses dominate: f ∝ 1/√m, so 4× the mass halves the frequency.
    expect(heavy / heavier).toBeGreaterThan(1.97);
    expect(heavy / heavier).toBeLessThan(2.01);
  });
});
