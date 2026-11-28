import { render } from 'svelte/server';
import { afterEach, expect, it } from 'vitest';
import { resultsStore, uiStore } from '../../lib/store';
import ToolbarAdvanced from '../toolbar/ToolbarAdvanced.svelte';

afterEach(() => { resultsStore.clear(); uiStore.analysisMode = '2d'; });

it.each(['2d', '3d', 'pro'] as const)('known wrong result: #1928 the open %s advanced toolbar retains the published result warning', mode => {
  uiStore.analysisMode = mode;
  const diagnostic = { code: 'known_issue', phase: 'NUM-INVARIANCE', severity: 'warning', value: 762, message: 'ENGINE' };
  const publish = (structuredDiagnostics: typeof diagnostic[]) => {
    const result = { displacements: [], reactions: [], elementForces: [], structuredDiagnostics };
    if (mode === '2d') resultsStore.setResults(result as never);
    else resultsStore.setResults3D(result as never);
  };
  publish([diagnostic]);
  const disposition = mode === '2d' ? resultsStore.knownIssues : resultsStore.knownIssues3D;
  expect(disposition.messages).toHaveLength(1);
  const page = () => render(ToolbarAdvanced, { props: { flat: true } }).body;
  expect(page().includes(disposition.messages[0]!)).toBe(!__PUBLIC_FEATURES__.proPlatesUnified);
  publish([]);
  expect(page()).not.toContain(disposition.messages[0]!);
});
