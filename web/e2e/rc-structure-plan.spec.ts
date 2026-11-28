import { BUILD_FEATURES } from './build-features';
import { test, expect, loadModel, solveModel } from './fixtures';
import type { Locator, Page } from '@playwright/test';
if (BUILD_FEATURES.proRcSheets) {

  /**
   * The seven-storey example with the program's old 25 mm covers stored in it: the notice says where
   * they come from, the table's arithmetic and what its button changes; one click fixes them. Then the
   * beams of a level in plan, and its columns and walls together: every member of the level drawn, its labels clear
   * of each other, its governing check on hover, and a click on it opening its row.
   */
  test.use({ appLocale: 'es' });

  const OLD = { beam: 0.025, column: 0.025, slab: 0.025, wall: 0.025, footing: 0.025 };

  async function noOverlaps(labels: Locator) {
    const boxes = await labels.evaluateAll((xs) => xs.map((x) => { const r = x.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom, t: x.textContent }; }));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!, b = boxes[j]!;
      expect(a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1, `${a.t} / ${b.t}`).toBe(false);
    }
    return boxes.length;
  }

  async function planOf(page: Page, ws: Locator, family: 'beam' | 'vertical', pick: number) {
    await ws.getByTestId(`rc-tab-${family}`).click();
    await ws.getByTestId('rc-struct-view-list').click();
    const select = ws.getByTestId('rc-level-filter').locator('select');
    const options = (await select.locator('option').allTextContents()).slice(1);
    const level = options[Math.min(pick, options.length - 1)]!;
    await select.selectOption({ label: level });
    const keys = await ws.getByTestId('rc-row').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-key')!));
    expect(keys.length).toBeGreaterThan(0);
    await ws.getByTestId('rc-struct-view-plan').click();
    const fig = ws.getByTestId('rc-struct-plan');
    await expect(fig).toHaveAttribute('data-family', family);
    const drawn = (await fig.getAttribute('data-level'))!;
    if (family === 'vertical') expect(level).toBe(`s/${drawn}`);
    else expect(drawn).not.toBe('');
    const items = fig.getByTestId('rc-struct-item');
    expect((await items.evaluateAll((g) => g.map((x) => x.getAttribute('data-key')!))).sort()).toEqual([...keys].sort());
    await expect(fig.getByTestId('rc-struct-unplaced')).toHaveCount(0);
    expect(await noOverlaps(fig.getByTestId('rc-struct-label'))).toBe(keys.length);
    const svg = (await fig.getByTestId('rc-struct-svg').boundingBox())!, box = (await fig.boundingBox())!;
    expect(svg.width).toBeGreaterThan(box.width - 40);
    expect(svg.width).toBeLessThanOrEqual(box.width);
    return { fig, items, keys, level };
  }

  test('@slow the sheets explain old covers and draw the beams, columns and walls of a level in plan', async ({ pro: page }) => {
    test.setTimeout(420_000);
    await loadModel(page, 'pro-edificio-7p');
    const loaded = await page.evaluate((covers) => {
      const f = JSON.parse((window.__stabileo as unknown as { serializeProject(): string }).serializeProject()) as { snapshot: { designData?: Record<string, unknown> } };
      f.snapshot.designData = { ...(f.snapshot.designData ?? { version: 1 }), covers };
      return window.__stabileoActions.loadProject(f as never);
    }, OLD);
    expect(loaded).toBe(true);
    await solveModel(page);
    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-rcSheets').click();
    if (await page.getByTestId('rc-mesh-walls').count()) {
      await page.getByTestId('rc-mesh-walls').click();
      await expect(page.getByTestId('rc-mesh-walls')).toHaveCount(0, { timeout: 120_000 });
    }
    await expect(page.getByTestId('rc-design')).toBeEnabled({ timeout: 120_000 });
    await page.getByTestId('rc-design').click();
    await expect(page.getByTestId('rc-open-beam')).toBeEnabled({ timeout: 90_000 });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByTestId('rc-open-beam').click();
    const ws = page.getByTestId('rc-sheets-workspace');

    const notice = ws.getByTestId('rc-covers-under');
    await expect(notice).toBeVisible();
    const items = notice.getByTestId('rc-covers-item');
    await expect(items.first()).toHaveAttribute('data-origin', 'oldDefault');
    await expect(notice.locator('[data-kind="beam"]')).toHaveText('Vigas: 25 mm (valor por defecto anterior del programa). La tabla pide recubrimiento + estribo ≥ máx(35; db + 5) mm; con estribo Ø8 y barras de hasta Ø25 quedan 25 + 8 = 33 mm, menos que 35 mm. Mínimo: 27 mm.');
    await expect(notice).toContainText('todas las filas que verifican esos recubrimientos dan «No verifica»');
    await expect(notice).toContainText('vigas y columnas de 25 a 30 mm');
    await expect(notice).toContainText('Se deshace en un solo paso con Deshacer.');
    await expect(notice.getByTestId('rc-covers-apply')).toHaveText(/^Pasar a 30 mm \(vigas y columnas\), 55 mm \(zapatas\) y volver a dimensionar$/);
    const failing = ws.locator('[data-testid="rc-row"].st-fail').first();
    await failing.click();
    await ws.getByTestId('rc-span-toggle').first().click();
    const why = ws.getByTestId('rc-check-covers-why').first();
    await expect(why).toHaveText('El recubrimiento de vigas es 25 mm (valor por defecto anterior del programa), menos que los 27 mm de la tabla; el botón lo pasa a 30 mm.');
    await expect(ws.getByTestId('rc-check-covers-apply').first()).toHaveText(await notice.getByTestId('rc-covers-apply').innerText());
    await ws.locator('.rcw-body').evaluate((b) => b.scrollTo(0, 0));
    await page.screenshot({ path: test.info().outputPath('covers-before.png') });
    await why.scrollIntoViewIfNeeded();
    await why.locator('xpath=ancestor::table[1]').screenshot({ path: test.info().outputPath('covers-check-before.png') });

    await notice.getByTestId('rc-covers-apply').click();
    await expect(notice).toHaveCount(0, { timeout: 90_000 });
    await expect(page.getByTestId('rc-stale')).toHaveCount(0, { timeout: 90_000 });
    await expect(ws.getByTestId('rc-row').first()).toBeVisible({ timeout: 90_000 });
    await expect(ws.getByTestId('rc-check-covers-why')).toHaveCount(0);
    const again = ws.locator('[data-testid="rc-row"]').first();
    if (!(await again.getAttribute('class'))!.includes('open')) await again.click();
    await ws.getByTestId('rc-span-toggle').first().click();
    const cover = ws.getByTestId('rc-checks').locator('tr', { hasText: 'Recubrimiento de la armadura principal' }).first();
    await expect(cover).not.toHaveClass(/bad/);
    await ws.locator('.rcw-body').evaluate((b) => b.scrollTo(0, 0));
    await page.screenshot({ path: test.info().outputPath('covers-after.png') });
    await cover.scrollIntoViewIfNeeded();
    await cover.locator('xpath=ancestor::table[1]').screenshot({ path: test.info().outputPath('covers-check-after.png') });

    for (const [family, pick] of [['beam', 2], ['vertical', 0], ['vertical', 2]] as const) {
      const { fig, items: drawn, keys } = await planOf(page, ws, family, pick);
      const first = drawn.first();
      const name = (await first.getAttribute('aria-label'))!.split(' · ')[0]!;
      await first.getByTestId('rc-struct-label').hover();
      await expect(fig.getByTestId('rc-struct-hover')).toContainText(`${name} · `);
      await expect(fig.getByTestId('rc-struct-hover')).toContainText('—');
      await fig.screenshot({ path: test.info().outputPath(`plan-${family}.png`) });
      for (const width of [1280, 1920]) {
        await page.setViewportSize({ width, height: 1000 });
        const spare = async () => (await fig.boundingBox())!.width - (await fig.getByTestId('rc-struct-svg').boundingBox())!.width;
        await expect.poll(spare, { message: `${family} at ${width} px` }).toBeLessThan(40);
        expect(await spare()).toBeGreaterThanOrEqual(0);
        await noOverlaps(fig.getByTestId('rc-struct-label'));
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      const target = keys[keys.length - 1]!;
      await fig.locator(`[data-testid="rc-struct-item"][data-key="${target}"]`).getByTestId('rc-struct-label').click();
      await expect(fig).toHaveCount(0);
      const row = ws.locator(`[data-testid="rc-row"][data-key="${target}"]`);
      await expect(row).toHaveClass(/open/);
      await expect(row).toBeInViewport();
    }
  });
}
