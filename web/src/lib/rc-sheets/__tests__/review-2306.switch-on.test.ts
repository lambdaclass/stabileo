import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import { acceptedClassesAfter } from '../design-options';
import { setLocale, tpn } from '../../i18n';
import { ensureLocale } from '../../i18n/store.svelte';
import { modelStore, historyStore } from '../../store';
import { patchOwnDesignData } from '../../store/design-data';
import ProDesignDataPanel from '../../../components/pro/ProDesignDataPanel.svelte';

describe('the concrete classes an alternative may take', () => {
  const all = [20, 25, 30];

  it('keep the last one ticked: unticking it changes nothing', () => {
    expect(acceptedClassesAfter(all, [25], 25, false)).toEqual({ refused: true });
  });

  it('read every class again as "all" once each is ticked, and list the rest otherwise', () => {
    expect(acceptedClassesAfter(all, [20, 25], 30, true)).toEqual({ refused: false, fcClasses: null });
    expect(acceptedClassesAfter(all, undefined, 30, false)).toEqual({ refused: false, fcClasses: [20, 25] });
  });
});

describe('the design data panel', () => {
  it('says the slab base mesh spacing in round centimetres, without float noise', () => {
    modelStore.clear(); historyStore.clear();
    patchOwnDesignData({ slabBase: { bottomX: { diameter: 8, spacing: 0.15 }, topY: { diameter: 10, spacing: 0.3 } } } as never);
    const html = render(ProDesignDataPanel).body;
    expect(html).toContain('c/15');
    expect(html).not.toMatch(/c\/15\.0000|c\/30\.0000/);
  });
});

describe('the count of bars in 3D', () => {
  it('reads in every language of the sheets', async () => {
    for (const [locale, text] of [['es', '3 barras'], ['en', '3 bars'], ['pt', '3 barras'], ['de', '3 Stäbe'], ['fr', '3 barres']] as const) {
      await ensureLocale(locale);
      setLocale(locale);
      expect(tpn('rcSheets.r3d.bars', 3)).toBe(text);
    }
  });
});
