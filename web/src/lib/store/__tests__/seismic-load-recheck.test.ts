import { expect, it } from 'vitest';
import { assessProject } from '../../provenance/applicability';
import { stampSolve } from '../../provenance/solve-stamp';
import { RESULTS_VERSION } from '../../provenance/registry';
import { createRecheckStore } from '../recheck.svelte';
import type { FeatureSnapshot } from '../../provenance/model-features';

const id = 'seismic-modal-generation-unavailable';
const staleSeismicReproducer = process.env.RUN_KNOWN_WRONG === '2316' ? it : it.skip;

for (const mode of ['2d', '3d', 'pro']) {
  staleSeismicReproducer(`known wrong result: #2316 a current wind basis keeps the legacy E notice in ${mode}`, async () => {
    const type = mode === '2d' ? 'nodal' : 'nodal3d';
    const legacy = { type, data: { caseId: 1, generatedBy: 'load-plan' } };
    const wind = { type, data: { caseId: 2, generatedBy: 'load-plan' } };
    const snapshot: FeatureSnapshot = {
      analysisMode: mode,
      loadCases: [{ id: 1, type: 'E' }, { id: 2, type: 'W' }],
      loads: [legacy, wind],
      designData: { loadBasis: { resultsVersion: RESULTS_VERSION, derivation: [{ key: 'loadPlan.derivation.wind' }] } },
    };
    for (const analysis of ['linear', 'pdelta'] as const) {
      const solvedWith = stampSolve(analysis, null);
      const store = createRecheckStore();
      const cases = [
        { loads: snapshot.loads, regenerate: true },
        { loads: [{ type, data: { caseId: 1, seismicGeneration: 'unverified' } }, wind], regenerate: true },
        { loads: [{ ...legacy, data: { ...legacy.data, seismicGeneration: 'static' } }, wind], regenerate: false },
        { loads: [wind], regenerate: false },
      ];
      for (const { loads, regenerate } of cases) {
        const saved = { ...snapshot, loads, solvedWith };
        const requiresRegeneration = (changes: ReturnType<typeof assessProject>['changes']) =>
          changes.some(change => change.id === id && change.requiresLoadRegeneration);
        expect.soft(requiresRegeneration(assessProject(saved, solvedWith, mode).changes)).toBe(regenerate);
        store.openProject(saved, mode);
        await store.retry();
        expect.soft(requiresRegeneration(store.assessment!.changes)).toBe(regenerate);
        expect.soft(store.noticeOpen).toBe(regenerate);
        expect.soft(store.assessment!.changes.filter(change => change.id !== id)).toEqual([]);
      }
    }
  });
}

for (const mode of ['2d', '3d', 'pro']) {
  it(`#2319 opening ${mode} flags saved modal seismic loads after a new solve`, async () => {
    const store = createRecheckStore();
    const snapshot: FeatureSnapshot = {
      analysisMode: mode,
      loadCases: [{ id: 1, type: 'E' }],
      loads: [{ type: mode === '2d' ? 'nodal' : 'nodal3d', data: { caseId: 1, generatedBy: 'load-plan' } }],
      designData: { loadBasis: { resultsVersion: 0, derivation: [{ key: 'loadPlan.derivation.modal' }] } },
    };
    store.openProject(snapshot, mode);
    await store.retry();
    expect(store.assessment?.changes.find(change => change.id === id)?.requiresLoadRegeneration).toBe(true);
    for (const analysis of ['linear', 'pdelta', 'plastic'] as const) {
      store.noteSolved(analysis);
      const saved = JSON.parse(JSON.stringify({ ...snapshot, solvedWith: store.capture() }));
      store.reset();
      store.openProject(saved, mode);
      await store.retry();
      expect(store.assessment?.changes.find(change => change.id === id)?.requiresLoadRegeneration).toBe(true);
      expect(store.noticeOpen).toBe(true);
    }
  });
}

it('#2319 recognises legacy modal evidence and verifies new static loads individually', () => {
  const load = (data: Record<string, unknown>) => ({ type: 'nodal3d', data: { caseId: 1, ...data } });
  const model = { loadCases: [{ id: 1, type: 'E' }] };
  const basis = { designData: { loadBasis: { derivation: [{ key: 'loadPlan.derivation.modal' }] } } };
  const dialog = { regulations: { roles: { seismic: { settings: { dialog: { seismicMethod: { method: 'modal' } } } } } } };
  const early = { regulations: { roles: { seismic: { settings: {
    periodSystem: 'concreteMomentFrame', regularity: 'regular', occupancy: 'reduced',
  } } } } };
  const generated = load({ generatedBy: 'load-plan' });
  const current = load({ generatedBy: 'load-plan', seismicGeneration: 'static' });
  const manual = load({});
  const stamp = stampSolve('linear', null);
  const notice = (s: FeatureSnapshot) => assessProject(s, stamp).changes.some(c => c.id === id);

  expect(notice({ ...model, loads: [generated] })).toBe(true);
  expect(notice({ ...model, ...basis, loads: [manual] })).toBe(true);
  expect(notice({ ...model, ...dialog, loads: [manual] })).toBe(true);
  expect(notice({ ...model, ...early, loads: [manual] })).toBe(true);
  expect(notice({ ...model, ...early, loads: [current] })).toBe(false);
  expect(notice({ ...model, loads: [current, generated] })).toBe(true);
  expect(notice({ ...model, ...basis, loads: [current] })).toBe(false);
  expect(notice({ ...model, loads: [manual] })).toBe(false);
  expect(notice({ ...model, ...basis, loads: [] })).toBe(false);
  expect(notice({ loadCases: [{ id: 1, type: 'E', spectral: {} }], ...basis, loads: [generated] })).toBe(false);
});
