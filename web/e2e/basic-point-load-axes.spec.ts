/**
 * A point load on an inclined member, in the axes the load tool offers.
 *
 * Fz is global Z (vertical) or perpendicular to the member; Fx is global X
 * (horizontal) or along the member. The pair of axes buttons names the force
 * chosen: Z / ⊥ for Fz, X / ∥ for Fx, none for a couple. Fx used to go along
 * the member whichever button was pressed, and the buttons still read Z / ⊥.
 */
import { test, expect, type Page } from './fixtures';

async function boot(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
  await page.evaluate(() => window.__stabileoActions.loadExample('three-hinge-arch'));
}

/** An inclined member and the screen point at its middle. */
async function inclinedMember(page: Page) {
  return page.evaluate(() => {
    const h = window.__stabileo;
    for (const id of h.elementIds()) {
      const e = h.elementEnds(id)!;
      const a = h.nodePos(e.i)!, b = h.nodePos(e.j)!;
      const dx = b.x - a.x, dz = (b.z ?? b.y) - (a.z ?? a.y);
      if (Math.abs(dx) > 1e-6 && Math.abs(b.y - a.y) + Math.abs(dz) > 1e-6 && Math.abs(b.y - a.y) > 1e-6) {
        const sa = h.nodeScreenPos(e.i)!, sb = h.nodeScreenPos(e.j)!;
        return { id, x: (sa.x + sb.x) / 2, y: (sa.y + sb.y) / 2 };
      }
    }
    return null;
  });
}

test.describe('@smoke a point load on an inclined member', () => {
  test('Fx and Fz in global or member axes, and a couple', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await boot(page);
    const m = (await inclinedMember(page))!;
    expect(m).not.toBeNull();
    await page.getByTestId('rb-cmd-load').click();
    const dir = (label: RegExp) => page.locator('.ft-dir-btn').filter({ hasText: label }).first();
    const place = async () => page.mouse.click(m.x, m.y);
    const last = async () => (await page.evaluate((id) => window.__stabileo.pointLoadsOn(id), m.id)).at(-1)!;

    // Fz, global: vertical.
    await dir(/^F[zj]$/).click();
    await expect(page.getByTestId('load-axes-global')).toHaveText('Z');
    await expect(page.getByTestId('load-axes-member')).toHaveText('⊥');
    await page.getByTestId('load-axes-global').click();
    await place();
    let l = await last();
    expect(l.isGlobal).toBe(true);
    expect(l.angle ?? 0).toBe(0);
    expect(l.p).not.toBe(0);

    // Fz, member axes: perpendicular.
    await page.getByTestId('load-axes-member').click();
    await place();
    l = await last();
    expect(l.isGlobal ?? false).toBe(false);
    expect(l.p).not.toBe(0);

    // Fx, global: horizontal, the global direction turned 90° from Z.
    await dir(/^F[xi]$/).click();
    await expect(page.getByTestId('load-axes-global')).toHaveText('X');
    await expect(page.getByTestId('load-axes-member')).toHaveText('∥');
    await page.getByTestId('load-axes-global').click();
    await place();
    l = await last();
    expect(l.isGlobal).toBe(true);
    expect(l.angle).toBe(90);
    expect(l.px ?? 0).toBe(0);

    // Fx, member axes: along the member.
    await page.getByTestId('load-axes-member').click();
    await place();
    l = await last();
    expect(l.p).toBe(0);
    expect(l.px).not.toBe(0);

    // A couple has no axes to choose.
    await dir(/^My$/).click();
    await expect(page.getByTestId('load-axes-global')).toHaveCount(0);
    await place();
    l = await last();
    expect(l.my).not.toBe(0);
    expect(errors).toEqual([]);
  });
});
