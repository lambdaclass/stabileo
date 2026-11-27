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
  const unified = !!__PUBLIC_FEATURES__.proPlatesUnified;
  const html = () => render(ProDiagnosticsTab).body;
  const nodes = [121, 122];
  expect(html()).not.toContain('DOF 648');
  for (const [index, node] of nodes.entries()) {
    resultsStore.addDiagnostics([{ source: 'solver', severity: 'warning', code: 'DOF_OVERCONSTRAINED',
      message: 'DOF ' + (648 + index) + ' (node ' + node + ') is constrained twice', nodeIds: [node] }], spatial);
    const body = html();
    const folded = [...body.matchAll(/<details\b[^>]*data-testid="diag-group"[^>]*>[\s\S]*?<\/details>/g)].map(match => match[0]);
    expect(folded.some(group => group.includes('DOF'))).toBe(unified && index > 0);
    if (!unified) {
      const actions = [...body.matchAll(/<button\b[^>]*data-tour="diagnostic-item"[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]);
      for (let n = 0; n <= index; n++) expect(actions.some(row => row.includes('DOF ' + (648 + n)) && row.includes('(node ' + nodes[n] + ')'))).toBe(true);
    }
  }
  if (!unified) expect(html()).not.toContain('data-testid="diag-review-count"');
  resultsStore.addDiagnostics([{ source: 'solver', severity: 'error', code: 'known_issue', message: 'Retained solve refusal for node 123', nodeIds: [123] }], spatial);
  expect(html()).toContain('Retained solve refusal for node 123');
});

it.skip.each([false, true])('known wrong result: #1928 a solver refusal retained outside the result notice is visible (spatial %s)', spatial => {
  modelStore.clear();
  uiStore.analysisMode = spatial ? 'pro' : '2d';
  resultsStore.addDiagnostics([{ source: 'solver', severity: 'error', code: 'known_issue', message: 'Retained solve refusal for node 123', nodeIds: [123] }], spatial);
  const html = render(ProDiagnosticsTab).body;
  expect(html).toContain('Retained solve refusal for node 123');
});
