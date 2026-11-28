import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Results from '../pro/ProResultsTab.svelte';
import { modelStore, resultsStore, uiStore } from '../../lib/store';
import { t } from '../../lib/i18n';

afterEach(() => { resultsStore.clear(); modelStore.clear(); uiStore.analysisMode = '2d'; });

it('known wrong result: #1928 published analysis results keep the released sections and diagnostics title', () => {
  modelStore.clear();
  uiStore.analysisMode = 'pro';
  const unified = !!__PUBLIC_FEATURES__.proPlatesUnified;
  resultsStore.setResults3D({ displacements: [], reactions: [], elementForces: [] } as never);
  for (const levels of [[], [{ id: 'p1', name: 'Roof', z: 3 }]]) {
    modelStore.setGrid({ axes: [], levels } as never);
    const html = render(Results).body;
    expect.soft(html.includes('data-testid="res-tab-centres"')).toBe(unified);
    expect.soft(html.split('data-testid="res-tab-diagnostics"')[1]?.split('</button>')[0]).toContain(t(unified ? 'pro.elementQualityTitle' : 'pro.diagnosticsTitle'));
    for (const tab of ['deflections', 'drift', 'query']) expect(html).toContain('data-testid="res-tab-' + tab + '"');
  }
});
