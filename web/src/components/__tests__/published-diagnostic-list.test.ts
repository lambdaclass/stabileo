import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ProDiagnosticsTab from '../pro/ProDiagnosticsTab.svelte';
import { modelStore, resultsStore, uiStore } from '../../lib/store';
import { setLocale } from '../../lib/i18n';

afterEach(() => { resultsStore.clear(); resultsStore.clear3D(); modelStore.clear(); uiStore.analysisMode = '2d'; });

it.skip.each(['2d', '3d', 'pro'] as const)('known wrong result: #1928 the %s diagnostic list retains each finding and its object', mode => {
  modelStore.clear();
  uiStore.analysisMode = mode;
  setLocale('en');
  const spatial = mode !== '2d';
  const unified = __PUBLIC_FEATURES__.proPlatesUnified;
  const html = () => render(ProDiagnosticsTab).body;
  const nodes = [121, 122];
  expect(html()).not.toContain('DOF 648');
  for (const [index, node] of nodes.entries()) {
    resultsStore.addDiagnostics([{ source: 'solver', severity: 'warning', code: 'DOF_OVERCONSTRAINED',
      message: 'DOF ' + (648 + index) + ' (node ' + node + ') is constrained twice', nodeIds: [node] }], spatial);
    const body = html();
    expect(body.includes('data-testid="diag-group"')).toBe(unified && index > 0);
    if (!unified) {
      const actions = [...body.matchAll(/<button\b[^>]*data-tour="diagnostic-item"[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]);
      for (let n = 0; n <= index; n++) expect(actions.some(row => row.includes('DOF ' + (648 + n)) && row.includes('(node ' + nodes[n] + ')'))).toBe(true);
      expect(body).not.toContain('data-testid="diag-review-count"');
    }
  }
  resultsStore.addDiagnostics([{ source: 'solver', severity: 'error', code: 'known_issue', message: 'Retained solve refusal for node 123', nodeIds: [123] }], spatial);
  expect(html()).toContain('Retained solve refusal for node 123');
});
