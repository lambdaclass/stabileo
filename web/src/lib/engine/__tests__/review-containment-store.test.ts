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
    expect(resultsStore.fullEnvelope).toBeNull();
    expect(resultsStore.perCase.size).toBe(0);
    expect(resultsStore.perCase.get(1)).toBeUndefined();
    expect(resultsStore.perCombo3D.size).toBe(0);
    expect(resultsStore.perCombo3D.get(2)).toBeUndefined();
    resultsStore.activeView = 'envelope';
    expect(JSON.stringify([resultsStore.results, resultsStore.results3D])).not.toContain('987654');
  } else {
    expect(resultsStore.envelope?.maxAbsResults.displacements[0]!.ux).toBe(987654);
    expect(resultsStore.fullEnvelope?.maxAbsResults.displacements[0]!.ux).toBe(987654);
    expect(resultsStore.perCase.get(1)).toBeTruthy();
    expect(resultsStore.perCombo3D.get(2)).toBeTruthy();
    expect(resultsStore.envelope3D?.maxAbsResults3D.displacements[0]!.ux).toBe(987654);
    expect(resultsStore.fullEnvelope3D).not.toBeNull();
    expect(resultsStore.hasCombinations3D).toBe(true);
  }
});

it.each([false, true])('a refused load case is unavailable through perCase and perCase3D (refused: %s)', bad => {
  const withValue = (r: object) => ({ ...r, displacements: [{ nodeId: 1, ux: 555555, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 }] });
  const env2D = { maxAbsResults: clean };
  const env3D = { maxAbsResults3D: clean };
  resultsStore.setResults(clean as never);
  resultsStore.setCombinationResults(new Map([[1, withValue(bad ? refused : clean)]]) as never, new Map([[2, clean]]) as never, env2D as never);
  resultsStore.setResults3D(clean as never);
  resultsStore.setCombinationResults3D(new Map([[1, withValue(bad ? refused : clean)]]) as never, new Map([[2, clean]]) as never, env3D as never);
  for (const map of [resultsStore.perCase, resultsStore.perCase3D] as Map<number, { displacements: Array<{ ux: number }> }>[]) {
    if (bad) {
      expect(map.size).toBe(0);
      expect(map.get(1)).toBeUndefined();
      expect(JSON.stringify([...map.values()])).not.toContain('555555');
    } else {
      expect(map.get(1)?.displacements[0]!.ux).toBe(555555);
    }
  }
});

it.each([false, true])('an untagged combination over a refused load case is withheld everywhere (refused: %s)', bad => {
  const combo = { ...clean, displacements: [{ nodeId: 1, ux: 777777, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 }] };
  resultsStore.setResults(clean as never);
  resultsStore.setCombinationResults(new Map([[1, bad ? refused : clean]]) as never, new Map([[2, combo]]) as never, { maxAbsResults: clean } as never);
  resultsStore.setResults3D(clean as never);
  resultsStore.setCombinationResults3D(new Map([[1, bad ? refused : clean]]) as never, new Map([[2, combo]]) as never, { maxAbsResults3D: clean } as never);
  resultsStore.activeView = 'combo';
  resultsStore.activeComboId = 2;
  const shown = JSON.stringify([[...resultsStore.perCombo.values()], [...resultsStore.perCombo3D.values()], resultsStore.results, resultsStore.results3D]);
  if (bad) {
    expect(resultsStore.perCombo.size + resultsStore.perCombo3D.size).toBe(0);
    expect(resultsStore.hasCombinations).toBe(false);
    expect(resultsStore.hasCombinations3D).toBe(false);
    expect(shown).not.toContain('777777');
  } else {
    expect(resultsStore.perCombo.get(2)?.displacements[0]!.ux).toBe(777777);
    expect(resultsStore.perCombo3D.get(2)?.displacements[0]!.ux).toBe(777777);
    expect(resultsStore.results?.displacements[0]!.ux).toBe(777777);
    expect(resultsStore.results3D?.displacements[0]!.ux).toBe(777777);
  }
});

it.each([false, true])('a refused single solve reaches no viewport getter (3D: %s)', is3D => {
  const v = 444444;
  const solved = is3D
    ? {
      displacements: [{ nodeId: 1, ux: v, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 }],
      reactions: [{ nodeId: 1, fx: v, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 }],
      elementForces: [{ elementId: 1, nStart: v, nEnd: v, vyStart: v, vyEnd: v, vzStart: 0, vzEnd: 0, mxStart: 0, mxEnd: 0, myStart: v, myEnd: v, mzStart: 0, mzEnd: 0 }],
      constraintForces: [{ nodeId: 1, dof: 'ux', force: v }],
    }
    : {
      displacements: [{ nodeId: 1, ux: v, uz: 0, ry: 0 }],
      reactions: [{ nodeId: 1, rx: v, rz: 0, my: 0 }],
      elementForces: [{ elementId: 1, nStart: v, nEnd: v, vStart: v, vEnd: v, mStart: v, mEnd: v }],
      constraintForces: [{ nodeId: 1, dof: 'ux', force: v }],
    };
  uiStore.analysisMode = is3D ? 'pro' : '2d';
  const store = resultsStore as any;
  const publish = (r: object) => is3D ? resultsStore.setResults3D(r as never) : resultsStore.setResults(r as never);
  const read = () => is3D
    ? [store.results3D, store.singleResults3D, store.getDisplacement3D(1), store.getReaction3D(1), store.getElementForces3D(1), store.constraintForces3D, store.maxDisplacement3D]
    : [store.results, store.singleResults, store.getDisplacement(1), store.getReaction(1), store.getElementForces(1), store.constraintForces, store.maxDisplacement, store.maxMoment, store.maxShear];
  publish(solved);
  resultsStore.diagramType = 'deformed';
  expect(JSON.stringify(read())).toContain(String(v));
  publish({ ...solved, structuredDiagnostics: [diagnostic] });
  resultsStore.diagramType = 'deformed';
  expect(resultsStore.diagramType).toBe('none');
  expect(JSON.stringify(read())).not.toContain(String(v));
});
it('an envelope carrying its own refusal is withheld with clean constituents', () => {
  const env2D = { maxAbsResults: { ...refused, displacements: [{ nodeId: 1, ux: 987654, uz: 0, ry: 0 }] } };
  const env3D = { maxAbsResults3D: { ...refused, displacements: [{ nodeId: 1, ux: 987654, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 }] } };
  resultsStore.setResults(clean as never);
  resultsStore.setCombinationResults(new Map([[1, clean]]) as never, new Map([[2, clean]]) as never, env2D as never);
  resultsStore.setResults3D(clean as never);
  resultsStore.setCombinationResults3D(new Map([[1, clean]]) as never, new Map([[2, clean]]) as never, env3D as never);
  expect(resultsStore.envelope).toBeNull();
  expect(resultsStore.fullEnvelope).toBeNull();
  expect(resultsStore.envelope3D).toBeNull();
  expect(resultsStore.fullEnvelope3D).toBeNull();
  expect(resultsStore.knownIssues.refused).toBe(true);
  expect(resultsStore.knownIssues3D.refused).toBe(true);
  resultsStore.activeView = 'envelope';
  expect(JSON.stringify(resultsStore.results ?? null)).not.toContain('987654');
});
it('an expired refused named envelope does not hide a later valid solve', () => {
  const env = (r: object) => ({ maxAbsResults3D: { ...clean, ...r, displacements: [{ nodeId: 1, ux: 4.5, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 }] } });
  resultsStore.setResults3D(clean as never);
  resultsStore.setCombinationResults3D(new Map([[1, clean]]) as never, new Map([[2, clean]]) as never, env({}) as never);
  const active = resultsStore.envelope3D;
  resultsStore.viewEnvelope3D(env(refused) as never, 'named');
  expect(resultsStore.fullEnvelope3D).toBeNull();
  expect(resultsStore.envelope3D).toBe(active);
  expect(active).not.toBeNull();
  resultsStore.activeView = 'envelope';
  expect(resultsStore.results3D).toBeNull();
  expect(resultsStore.knownIssues3D.refused).toBe(true);
  const fresh = env({});
  resultsStore.setCombinationResults3D(new Map([[1, clean]]) as never, new Map([[2, clean]]) as never, fresh as never);
  expect(resultsStore.envelope3D).toBe(fresh);
  expect(resultsStore.fullEnvelope3D).toBe(fresh);
  expect(resultsStore.knownIssues3D.refused).toBe(false);
});

it.each(['2D', '3D'] as const)('a %s overlay warning reaches the workspace disposition', dim => {
  const warned = { ...clean, structuredDiagnostics: [{ ...diagnostic, severity: 'warning' }] };
  if (dim === '2D') { resultsStore.setResults(clean as never); resultsStore.setOverlay(warned as never, 'other'); }
  else { resultsStore.setResults3D(clean as never); resultsStore.setOverlay3D(warned as never, 'other'); }
  const disposition = dim === '2D' ? resultsStore.knownIssues : resultsStore.knownIssues3D;
  expect(disposition.refused).toBe(false);
  expect(disposition.messages.join()).toContain('#741');
});
