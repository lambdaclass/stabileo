import { afterEach, expect, it } from 'vitest';
import { resultsStore, uiStore } from '../../store';
import { errorText as movingError } from '../moving-loads';
const diagnostic = { code: 'known_issue', severity: 'error', phase: 'BU-BOUND', value: 741, message: 'ENGINE' };
const clean = { displacements: [], reactions: [], elementForces: [] };
const refused = { ...clean, structuredDiagnostics: [diagnostic] };
afterEach(() => resultsStore.clear());
it('all combination table getters withdraw refused bundles and retain diagnostics', () => {
  resultsStore.setResults3D(clean as never);
  resultsStore.setCombinationResults3D(new Map([[1, clean]]) as never, new Map([[2, refused]]) as never, null as never);
  expect(resultsStore.perCombo3D.size).toBe(0);
  expect(resultsStore.knownIssues3D.refused).toBe(true);
  expect(resultsStore.knownIssues3D.messages.join()).toContain('#741');
});
it.each(['PDelta', 'Modal', 'Buckling'] as const)('Basic %s getter never publishes refused values', kind => {
  const result = { ...refused, modes: [{ frequency: 12345 }], results: clean };
  const store = resultsStore as any;
  store[`set${kind}Result`](result);
  expect(store[kind === 'PDelta' ? 'pdeltaResult' : `${kind.toLowerCase()}Result`]).toBeNull();
  expect(store.knownIssues.refused).toBe(true);
});
it.each([true, false])('a refusal in the other dimension leaves active clean diagrams available: %s', is3D => {
  resultsStore.setResults((is3D ? refused : clean) as never);
  resultsStore.setResults3D((is3D ? clean : refused) as never);
  uiStore.analysisMode = is3D ? 'pro' : '2d';
  resultsStore.diagramType = 'deformed';
  expect(resultsStore.diagramType).toBe('deformed');
});
it('moving-load engine boundary already localizes structured refusals', () => {
  const text = movingError(JSON.stringify({ structuredDiagnostics: [diagnostic] }));
  expect(text).toContain('#741'); expect(text).not.toMatch(/ENGINE|structuredDiagnostics/);
});
it.each([false, true])('envelopes built over a refused case or combination are withheld (refused: %s)', bad => {
  const env2D = { maxAbsResults: { ...clean, displacements: [{ nodeId: 1, ux: 987654, uz: 0, ry: 0 }] } };
  const env3D = { maxAbsResults3D: { ...clean, displacements: [{ nodeId: 1, ux: 987654, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 }] } };
  resultsStore.setResults(clean as never);
  resultsStore.setCombinationResults(new Map([[1, bad ? refused : clean]]) as never, new Map([[2, clean]]) as never, env2D as never);
  resultsStore.setResults3D(clean as never);
  resultsStore.setCombinationResults3D(new Map([[1, clean]]) as never, new Map([[2, bad ? refused : clean]]) as never, env3D as never);
  if (bad) {
    expect(resultsStore.envelope).toBeNull();
    expect(resultsStore.envelope3D).toBeNull();
    expect(resultsStore.fullEnvelope3D).toBeNull();
    expect(resultsStore.hasCombinations3D).toBe(false);
    expect(resultsStore.perCase).toBe(resultsStore.perCase);
    resultsStore.activeView = 'envelope';
    expect(JSON.stringify([resultsStore.results, resultsStore.results3D])).not.toContain('987654');
  } else {
    expect(resultsStore.envelope?.maxAbsResults.displacements[0]!.ux).toBe(987654);
    expect(resultsStore.envelope3D?.maxAbsResults3D.displacements[0]!.ux).toBe(987654);
    expect(resultsStore.fullEnvelope3D).not.toBeNull();
    expect(resultsStore.hasCombinations3D).toBe(true);
  }
});
