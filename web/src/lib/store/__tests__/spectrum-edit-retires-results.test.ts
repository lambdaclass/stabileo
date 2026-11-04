/**
 * The project's spectra and time history are analysis inputs: a user spectrum feeds the spectral
 * load cases of the main solve, the time history its own run. Editing them, or undoing the edit,
 * retires the results solved on the old ones.
 *
 * `setDynamics` used to record on the views undo channel, whose restore retires nothing, and the
 * edit itself did not bump the model version: D + Ex solved on a 0.4 g spectrum stayed on screen
 * after the spectrum became 0.8 g, and live calc did not re-run.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import { uiStore } from '../ui.svelte';
import { resultsStore } from '../results.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../active-results';
import { spectralCaseResults } from '../spectral-cases';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); modelStore.setResultScopes(null); resultsStore.clear();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro';
});
afterEach(() => { uiStore.analysisMode = '3d'; });

const spectrum = (sa: number) => ({ spectra: [{ id: 1, name: 'flat', ordinate: 'Sa' as const, unit: 'g' as const, interpolation: 'linear' as const, points: [[0, sa], [5, sa]] as Array<[number, number]> }] });

/** A one-storey 5 × 4 m frame on fixed feet: D on the top nodes, Ex on spectrum 1, D + Ex; solved and published. */
function solved(): number {
  const at = (x: number, y: number, z: number) => modelStore.addNode(x, y, z);
  const f = [at(0, 0, 0), at(5, 0, 0), at(5, 4, 0), at(0, 4, 0)], t = [at(0, 0, 3), at(5, 0, 3), at(5, 4, 3), at(0, 4, 3)];
  for (let i = 0; i < 4; i++) { modelStore.addElement(f[i]!, t[i]!); modelStore.addElement(t[i]!, t[(i + 1) % 4]!); modelStore.addSupport(f[i]!, 'fixed3d' as never); }
  const D = modelStore.model.loadCases[0]!.id;
  for (const n of t) modelStore.addNodalLoad3D(n, 0, 0, -50, 0, 0, 0, D);
  modelStore.setDynamics(spectrum(0.4));
  const ex = modelStore.addLoadCase('Ex', 'E');
  modelStore.updateLoadCaseFields(ex, { spectral: { source: { kind: 'user', spectrumId: 1 }, factors: { x: 1, y: 0, z: 0 }, rule: 'cqc', xi: 0.05, scale: 1 } as never });
  const combo = modelStore.addCombination('D + Ex', [{ caseId: D, factor: 1 }, { caseId: ex, factor: 1 }]);
  publish();
  return combo;
}
function publish() {
  const sp = spectralCaseResults();
  if (typeof sp === 'string') throw new Error(sp);
  const all = modelStore.solve3D(false, false, true);
  if (!all || typeof all === 'string') throw new Error(String(all));
  resultsStore.setResults3D(all);
  const b = modelStore.solveCombinations3D(false, false, true, sp.results);
  if (!b || typeof b === 'string') throw new Error(String(b));
  publishCombinations3D(b);
}

describe('a spectrum edit', () => {
  it('retires the results solved on the old spectrum', () => {
    const combo = solved();
    expect(resultsStore.perCombo3D.has(combo)).toBe(true);
    const v = modelStore.modelVersion;
    modelStore.setDynamics(spectrum(0.8));
    expect(modelStore.modelVersion).toBeGreaterThan(v);
    expect(resultsStore.perCombo3D.has(combo)).toBe(false);
  });

  it('undone, retires the results solved on the edited spectrum, and redone, again', () => {
    const combo = solved();
    modelStore.setDynamics(spectrum(0.8));
    publish();
    historyStore.undo();
    expect(modelStore.model.dynamics?.spectra?.[0]?.points[0]?.[1]).toBe(0.4);
    expect(resultsStore.perCombo3D.has(combo)).toBe(false);
    publish();
    historyStore.redo();
    expect(modelStore.model.dynamics?.spectra?.[0]?.points[0]?.[1]).toBe(0.8);
    expect(resultsStore.perCombo3D.has(combo)).toBe(false);
  });

  it('that changes nothing takes no undo step and keeps the results', () => {
    const combo = solved();
    const steps = historyStore.undoCount, v = modelStore.modelVersion;
    modelStore.setDynamics(spectrum(0.4));
    expect(historyStore.undoCount).toBe(steps);
    expect(modelStore.modelVersion).toBe(v);
    expect(resultsStore.perCombo3D.has(combo)).toBe(true);
  });
});
