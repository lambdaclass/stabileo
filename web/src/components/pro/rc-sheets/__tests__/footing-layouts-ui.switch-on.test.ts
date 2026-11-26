import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'svelte/server';
import { modelStore, historyStore } from '../../../../lib/store';
import { i18n } from '../../../../lib/i18n';
import type { FoundationLayout } from '../../../../lib/rc-sheets/footing-layouts';
import RcFootingLayouts from '../RcFootingLayouts.svelte';

const layout = (system: FoundationLayout['system']): FoundationLayout => ({
  system, rows: [], summary: { share: 0.3, concrete: 10, steel: 500, count: { footing: 4, strip: 0, mat: 0, cap: system === 'piles' ? 4 : 0 }, failing: 0, needs: null } as never,
});
const layouts = (['auto', 'footings', 'strips', 'mat', 'piles'] as const).map(layout);

beforeEach(() => { modelStore.clear(); historyStore.clear(); i18n.locale = 'en'; });

describe('the foundation layouts', () => {
  it('are picked by their name, with no radio beside them, and say which one is shown', () => {
    const html = render(RcFootingLayouts, { props: { layouts, adopted: null, preview: 'mat' } }).body;
    expect(html).not.toContain('type="radio"');
    expect(html).toMatch(/aria-pressed="true"[^>]*data-testid="rc-foundation-view-mat"/);
    expect(html).toContain('data-testid="rc-foundation-shown-tag"');
    expect(html).not.toContain('data-testid="rc-foundation-adopted-tag"');
  });

  it('mark the adopted one, and offer to adopt any other instead', () => {
    const html = render(RcFootingLayouts, { props: { layouts, adopted: 'footings', preview: 'auto' } }).body;
    expect(html).toContain('data-testid="rc-foundation-adopted-tag"');
    expect(html).not.toContain('data-testid="rc-foundation-adopt-footings"');
    expect(html).toContain('data-testid="rc-foundation-adopt-mat"');
  });

  it('ask for the piles\' data only when the pile layout is the one shown, and always for the founding depth', () => {
    expect(render(RcFootingLayouts, { props: { layouts, adopted: null, preview: 'auto' } }).body).not.toContain('rc-foundation-pile-diameter');
    const piles = render(RcFootingLayouts, { props: { layouts, adopted: null, preview: 'piles' } }).body;
    expect(piles).toContain('rc-foundation-pile-diameter');
    expect(piles).toContain('data-testid="rc-foundation-depth"');
  });

  it('offer to go back to designing only the layout shown once all five are compared', async () => {
    const { footingPreview } = await import('../../../../lib/store/rc-sheets-footing-preview.svelte');
    footingPreview.compare = true;
    try {
      const html = render(RcFootingLayouts, { props: { layouts, adopted: null, preview: 'auto' } }).body;
      expect(html).toContain('data-testid="rc-foundation-compare-off"');
      expect(html).not.toContain('data-testid="rc-foundation-compare"');
      expect(html).not.toMatch(/<tr[^>]*onclick/);
    } finally { footingPreview.compare = false; }
  });
});
