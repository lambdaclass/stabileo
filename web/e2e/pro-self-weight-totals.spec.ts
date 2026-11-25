import { test, expect, loadModel } from './fixtures';
import type { DedalFile } from '../src/lib/store/file';

for (const mode of ['direct', 'notional'] as const) {
  test(`@smoke #2565 — PRO isolates ${mode} self-weight totals by case`, async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    const { loaded, missing } = await page.evaluate(mode => {
      const file = JSON.parse(window.__stabileo.serializeProject()) as DedalFile;
      const { snapshot } = file;
      const missing = Math.max(...snapshot.elements.map(([id]) => id)) + 1;
      snapshot.loadCases = [
        { id: 1, type: 'L', name: 'Independent' },
        { id: 2, type: 'D', name: 'Stale weight' },
        { id: 3, type: 'D', name: 'Includes stale weight', includes: [{ caseId: 2, factor: 1 }] },
        { id: 4, type: 'D', name: 'Zero factor', includes: [{ caseId: 2, factor: 0 }] },
        ...(mode === 'notional' ? [{ id: 5, type: 'N', name: 'Notional', notional: { sourceCaseId: 3, ratio: 0.002, dir: '+X' as const } },
          { id: 6, type: 'D', name: 'Includes notional', includes: [{ caseId: 5, factor: 1 }] }] : []),
      ];
      snapshot.combinations = [];
      const nodeId = snapshot.nodes[0]![0];
      snapshot.loads = [{ type: 'nodal3d', data: { id: 1, nodeId, fx: 0, fy: 0, fz: 7, mx: 0, my: 0, mz: 0, caseId: 1 } }];
      snapshot.analysis = { selfWeight: [{ caseId: 2, direction: 'Z', factor: -1, elements: [missing] }] };
      return { loaded: window.__stabileoActions.loadProject({ ...file }), missing };
    }, mode);
    expect(loaded).toBe(true);

    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-loads').click();
    await page.getByTestId('lt-scope-all').click();
    const row = (id: number) => page.getByTestId(`lt-total-${id}`);
    expect.soft((await row(1).allTextContents()).join()).toMatch(/ΣFz 7(?:[.,]0+)? kN/);
    expect.soft((await row(4).allTextContents()).join()).toMatch(/ΣFz 0(?:[.,]0+)? kN/);
    for (const id of mode === 'direct' ? [2, 3] : [2, 3, 5, 6]) {
      expect.soft((await row(id).getByRole('alert').allTextContents()).join()).toMatch(new RegExp(`member.*${missing}.*missing`, 'i'));
      expect.soft((await row(id).allTextContents()).join()).not.toContain('ΣF');
    }

    await page.getByTestId('lt-scope-case').click();
    expect.soft((await row(1).allTextContents()).join()).toMatch(/ΣFz 7(?:[.,]0+)? kN/);
  });
}
