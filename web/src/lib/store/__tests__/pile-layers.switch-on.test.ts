import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'svelte/server';
import { modelStore, historyStore } from '..';
import { patchDesignData } from '../design-data';
import { pileSpec } from '../rc-sheets-footings';
import { presumedPileOf } from '../../model/design-data';
import { i18n } from '../../i18n';
import RcFootingLayouts from '../../../components/pro/rc-sheets/RcFootingLayouts.svelte';

beforeEach(() => { modelStore.clear(); historyStore.clear(); i18n.locale = 'en'; });

describe('a pile read from the ground by depth', () => {
  it('carries its tip pressure on its section and each layer\'s friction on its skin, allowables as given', () => {
    patchDesignData({ presumedPile: { diameter: 0.5, length: 12, capacity: 600, layers: [{ to: 4, shaft: 20, tip: 800 }, { to: 20, shaft: 50, tip: 2000 }] } });
    const p = pileSpec();
    const skin = Math.PI * 0.5, area = Math.PI * 0.25 / 4;
    expect(p.source).toBe('layers');
    expect(p.capacity).toBeCloseTo(20 * skin * 4 + 50 * skin * 8 + 2000 * area, 6);
  });

  it('takes one layer for the whole length', () => {
    patchDesignData({ presumedPile: { diameter: 0.6, length: 10, capacity: 600, layers: [{ to: 50, shaft: 40, tip: 1500 }] } });
    expect(pileSpec().capacity).toBeCloseTo(40 * Math.PI * 0.6 * 10 + 1500 * Math.PI * 0.36 / 4, 6);
  });

  it('keeps layers that stop short of the tip, for the cap to say its piles go past them, and drops a layer out of range', () => {
    patchDesignData({ presumedPile: { diameter: 0.5, length: 12, capacity: 700, layers: [{ to: 6, shaft: 20, tip: 800 }] } });
    expect(pileSpec()).toMatchObject({ source: 'layers', capacity: Math.PI * 0.5 * 20 * 6 });
    expect(pileSpec().strata).toHaveLength(1);
    expect(presumedPileOf({ diameter: 0.5, length: 12, capacity: 600, layers: [{ to: 5, shaft: -1, tip: 10 }, { to: 8, shaft: 10, tip: 10 }] }).layers).toEqual([{ to: 8, shaft: 10, tip: 10 }]);
  });
});

describe('the pile block', () => {
  it('lets the ground be entered by layer, and says the load one pile takes', () => {
    patchDesignData({ presumedPile: { diameter: 0.5, length: 12, capacity: 600, layers: [{ to: 30, shaft: 30, tip: 1500 }] } });
    const html = render(RcFootingLayouts, { props: { layouts: [], adopted: null, preview: 'piles' } }).body;
    expect(html).toContain('data-testid="rc-foundation-pile-layer"');
    expect(html).not.toContain('data-testid="rc-foundation-pile-capacity"');
    expect(html).toContain('data-testid="rc-foundation-pile-capacity-read"');
  });
});
