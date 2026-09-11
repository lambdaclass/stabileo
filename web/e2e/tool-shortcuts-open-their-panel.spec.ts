/**
 * A tool armed from the keyboard lands where the same tool from the ribbon does.
 *
 * ── The report ─────────────────────────────────────────────────────
 *
 * "presiono N y me pone para definir nodos, pero no me aparece la pestaña
 * derecha de nodos ni la selecciona en la barra superior."
 *
 * Two symptoms, one cause. The keyboard handler set `currentTool` and then
 * tried to click the matching tab button — which only exists while the Data
 * panel is already open, so with the panel shut nothing happened. And the
 * ribbon lights a tool command only while that panel is open, so the command
 * stayed dark for the same reason the tab never appeared.
 *
 * ── What this pins ─────────────────────────────────────────────────
 *
 * Not "the handler dispatches an event" — that is the mechanism, and a
 * mechanism can be replaced. What must not change is that the two routes to
 * the same tool agree: whatever pressing the ribbon button does, the letter
 * does too. So the test presses both and compares the results.
 */

import { test, expect, type Page } from '@playwright/test';

const TOOLS = [
  { key: 'n', cmd: 'node', tab: /Nodos|Nodes|Nós/ },
  { key: 'e', cmd: 'element', tab: /Barras|Elements|Elementos/ },
  { key: 's', cmd: 'support', tab: /Apoyos|Supports|Apoios/ },
  { key: 'l', cmd: 'load', tab: /Cargas|Loads/ },
];

async function openApp(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stabileo-lang', 'es');
      localStorage.setItem('stabileo-lang-manual', '1');
    } catch { /* private mode */ }
  });
  await page.goto('/app/basic?e2e=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
}

test.describe('@smoke a tool shortcut shows its work', () => {
  for (const tool of TOOLS) {
    test(`${tool.key.toUpperCase()} opens the ${tool.cmd} tab and lights the command`, async ({ page }) => {
      await openApp(page);

      /* The panel starts shut, which is the condition the bug needed. */
      await page.keyboard.press(tool.key);
      await page.waitForTimeout(400);

      await expect(
        page.locator('.data-table .tabs'),
        'the data panel is open',
      ).toHaveCount(1);

      await expect(
        page.getByTestId(`rb-cmd-${tool.cmd}`),
        'the ribbon lights the command',
      ).toHaveClass(/active/);
    });
  }

  test('the letter and the ribbon button agree, tool for tool', async ({ page }) => {
    await openApp(page);

    for (const tool of TOOLS) {
      /* By ribbon. */
      await page.getByTestId(`rb-cmd-${tool.cmd}`).click();
      await page.waitForTimeout(300);
      const byRibbon = await page.locator('.data-table .tabs').innerHTML();
      const litByRibbon = await page.getByTestId(`rb-cmd-${tool.cmd}`)
        .evaluate((n) => n.className);

      /* Close it, so the letter has the same work to do the button had. */
      await page.getByTestId(`rb-cmd-${tool.cmd}`).click();
      await page.waitForTimeout(200);

      /* By keyboard. */
      await page.keyboard.press(tool.key);
      await page.waitForTimeout(300);
      const byKey = await page.locator('.data-table .tabs').innerHTML();
      const litByKey = await page.getByTestId(`rb-cmd-${tool.cmd}`)
        .evaluate((n) => n.className);

      expect(byKey, `${tool.key}: same tab strip as the ribbon`).toBe(byRibbon);
      expect(litByKey, `${tool.key}: lit the same way`).toBe(litByRibbon);
    }
  });

  test('pan and select open nothing, because they edit nothing', async ({ page }) => {
    await openApp(page);

    /*
     * The other half of the rule. A tool that owns no table must not conjure
     * one: pressing V should leave the workspace exactly as it found it.
     */
    await page.keyboard.press('v');
    await page.waitForTimeout(350);
    await expect(page.locator('.data-table .tabs')).toHaveCount(0);

    await page.keyboard.press('a');
    await page.waitForTimeout(350);
    await expect(page.locator('.data-table .tabs')).toHaveCount(0);
  });

  test('pressing the same letter twice re-shows rather than hides', async ({ page }) => {
    await openApp(page);

    /*
     * Arming a tool means "show me this", and "show" has no off state — the
     * ribbon's own tool commands pass `toggle: false` for exactly this, and
     * the keyboard has to match or the two routes diverge again.
     */
    await page.keyboard.press('n');
    await page.waitForTimeout(350);
    await expect(page.locator('.data-table .tabs')).toHaveCount(1);

    await page.keyboard.press('n');
    await page.waitForTimeout(350);
    await expect(page.locator('.data-table .tabs')).toHaveCount(1);
  });
});
