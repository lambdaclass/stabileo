import { render } from 'svelte/server';
import { expect, it } from 'vitest';
import ProDesignDataPanel from '../pro/ProDesignDataPanel.svelte';
import { modelStore } from '../../lib/store';
import { patchDesignData } from '../../lib/store/design-data';

it('offers the diameter inputs the design actually reads and the options its profile supports', () => {
  modelStore.clear();
  try {
    patchDesignData({ stirrupDiaMm: 10, wallBarDiaMm: 16 });
    const html = render(ProDesignDataPanel).body;
    const control = (id: string) => html.includes(`data-testid="${id}"`);
    const sheets = !!__PUBLIC_FEATURES__.proRcSheets;
    expect.soft(control('dd-opt-torsion')).toBe(sheets);
    expect.soft(control('design-data-stirrup')).toBe(!__PUBLIC_FEATURES__.proPlatesUnified);
    expect.soft(control('design-data-wall')).toBe(!__PUBLIC_FEATURES__.proPlatesUnified);
    if (!__PUBLIC_FEATURES__.proPlatesUnified) {
      for (const [id, value] of [['design-data-stirrup', 10], ['design-data-wall', 16]]) {
        const options = html.split(`data-testid="${id}"`)[1]?.split('</select>')[0] ?? '';
        expect.soft(options).toContain(`value="${value}" selected`);
      }
    }
    expect.soft(control('design-data-lateral-beams')).toBe(true);
    expect.soft(control('defl-limits')).toBe(true);
  } finally {
    modelStore.clear();
  }
});
