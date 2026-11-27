import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ProResultTableModes from '../pro/ProResultTableModes.svelte';
import { resultsStore, uiStore } from '../../lib/store';

afterEach(() => { resultsStore.clear(); uiStore.analysisMode = '2d'; });

it.skip.each(['reactions', 'forces', 'displacements'] as const)('known wrong result: #1928 published PRO %s tables retain the warning in every view', kind => {
  uiStore.analysisMode = 'pro';
  const clean = { displacements: [], reactions: [], elementForces: [], structuredDiagnostics: [] };
  const diagnostic = { code: 'known_issue', phase: 'NUM-INVARIANCE', severity: 'warning', value: 762, message: 'ENGINE' };
  const cautioned = { ...clean, structuredDiagnostics: [diagnostic] };
  const views = ['current', 'all', 'summary', 'envelope'] as const;
  for (const combination of [false, true]) {
    resultsStore.setResults3D((combination ? clean : cautioned) as never);
    if (combination) resultsStore.setCombinationResults3D(new Map(), new Map([[1, cautioned]]) as never, null as never);
    const notice = resultsStore.knownIssues3D;
    expect(notice.refused).toBe(false);
    expect(notice.messages).toHaveLength(1);
    for (const mode of kind === 'forces' ? [...views, 'maxType'] as const : views) {
      const html = render(ProResultTableModes, { props: { kind, mode } }).body;
      expect(html).toContain(notice.messages[0]);
      expect(html).toContain('role="alert"');
    }
    resultsStore.clear();
  }
  resultsStore.setResults3D(clean as never);
  expect(render(ProResultTableModes, { props: { kind } }).body).not.toContain('role="alert"');
});
