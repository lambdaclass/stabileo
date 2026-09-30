/**
 * Explore changes the model only for as long as it is open. Leaving the tab
 * closes it, and the tab has to keep the model Explore started from — not
 * the one the sliders had made — or the original values are lost.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { modelStore, tabManager } from '..';
import { whatIf } from '../whatif.svelte';

afterEach(() => { whatIf.abandon(); modelStore.clear(); });

describe('a tab left while Explore is open', () => {
  it.each(['switching', 'opening a new tab'])('keeps the model Explore started from (%s)', async (how) => {
    await modelStore.loadExample('portal-frame');
    tabManager.init();
    const first = tabManager.activeTabId!;
    const [matId, mat] = [...modelStore.materials.entries()][0];
    const e0 = mat.e;

    whatIf.open();
    // What a slider does: the model is rebuilt from the baseline with E×2.
    modelStore.updateMaterial(matId, { e: e0 * 2 });

    if (how === 'switching') {
      tabManager.createTab();
      const other = tabManager.activeTabId!;
      tabManager.switchTab(first);
      tabManager.switchTab(other);
    } else {
      tabManager.createTab();
    }
    tabManager.switchTab(first);
    expect(modelStore.materials.get(matId)!.e).toBe(e0);
  });
});
