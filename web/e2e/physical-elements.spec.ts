/**
 * The physical elements of a model: read off it by themselves, listed, corrected.
 */
import { test, expect, loadModel, ribbonCmd } from './fixtures';

test.describe('@smoke physical elements', () => {
  test('are read off the model with nothing to press: columns and beams listed, a corrected kind declared and kept', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await page.getByTestId('pr-stage-model').click();
    await ribbonCmd(page, 'physical');
    await expect(page.getByTestId('physical-panel')).toBeVisible();
    await expect(page.getByTestId('physical-recognize')).toHaveCount(0);
    const table = page.getByTestId('physical-table');
    await expect(table).toBeVisible();
    await expect(page.getByTestId('physical-filter-column')).toBeVisible();
    await expect(page.getByTestId('physical-filter-beam')).toBeVisible();
    await expect(page.getByTestId('physical-pending')).toHaveCount(0);
    const rows = await page.locator('[data-testid^="physical-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    // Correct one element's kind: it becomes declared, and reading the model again leaves it so.
    const firstKind = table.locator('select[data-testid^="physical-kind-"]').first();
    const id = (await firstKind.getAttribute('data-testid'))!.replace('physical-kind-', '');
    await firstKind.selectOption('brace');
    await expect(page.getByTestId(`physical-row-${id}`)).toContainText(/declared|declarado/);
    // A column of another member leant by moving its top: read again, it is a brace; the declared kind stays.
    const leant = await page.evaluate((declared) => {
      const s = window.__stabileo;
      const mine = new Set(s.physicalMembers().find((m) => m.id === declared)!.elements);
      const column = s.physicalMembers().find((m) => m.kind === 'column' && m.elements.every((e) => !mine.has(e)))!;
      const pieces = column.elements.map((e) => { const ends = s.elementEnds(e)!; return { e, ends: [ends.i, ends.j].map((n) => ({ n, p: s.nodePosition(n)! })) }; });
      const highest = pieces.reduce((x, y) => (Math.max(...y.ends.map((q) => q.p.z)) > Math.max(...x.ends.map((q) => q.p.z)) ? y : x));
      const top = highest.ends[0]!.p.z > highest.ends[1]!.p.z ? highest.ends[0]! : highest.ends[1]!;
      window.__stabileoActions.moveNode(top.n, top.p.x + 1, top.p.y, top.p.z);
      return highest.e;
    }, Number(id));
    await expect.poll(() => page.evaluate((e) => window.__stabileo.physicalMembers().find((m) => m.elements.includes(e))?.kind, leant)).toBe('brace');
    await expect(page.getByTestId(`physical-kind-${id}`)).toHaveValue('brace');
    await expect(page.getByTestId(`physical-row-${id}`)).toContainText(/declared|declarado/);
    expect(rows).toContain(`physical-row-${id}`);
  });
});
