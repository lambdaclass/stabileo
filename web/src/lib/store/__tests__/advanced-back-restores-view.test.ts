/**
 * Closing an advanced function puts the view back exactly as it was before it opened.
 *
 * "← Back" in the Advanced panel and the list's own toggle-off both close a
 * function through its teardown in this store. What they must leave is the
 * view the function found: the static results when the model had been solved
 * (not the function's P-Δ, collapse or train results), none when it had not,
 * and the diagram the reader was looking at. Checked for every function that
 * changes the view, on a solved and an unsolved model, in 2D and in 3D, and
 * for the 2D ↔ 3D switch that must close what the new dimension does not have.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { resultsStore, type DiagramType } from '../results.svelte';
import type { AnalysisResults, InfluenceLineResult } from '../model.svelte';
import type { AnalysisResults3D, FullEnvelope3D } from '../../engine/types-3d';
import type { FullEnvelope } from '../../engine/types';
import type { MovingLoadEnvelope } from '../../engine/moving-loads';
import type {
  PDeltaResult, PDeltaResult3D, ModalResult, ModalResult3D, BucklingResult, BucklingResult3D, PlasticResult,
} from '../../engine/result-types';

type Tagged = { tag: string };
const r2 = (tag: string): AnalysisResults => ({ tag, displacements: [], reactions: [], elementForces: [] } as unknown as AnalysisResults);
const r3 = (tag: string): AnalysisResults3D => ({ tag, displacements: [], reactions: [], elementForces: [] } as unknown as AnalysisResults3D);
const tagOf = (r: unknown): string | null => (r ? (r as Tagged).tag : null);

const pdelta = (): PDeltaResult => ({ results: r2('pdelta'), converged: true, isStable: true, iterations: 3, b2Factor: 1.1 } as unknown as PDeltaResult);
const modal = (): ModalResult => ({ modes: [{ frequency: 1, period: 1 }] } as unknown as ModalResult);
const buckling = (): BucklingResult => ({ modes: [{ loadFactor: 2 }], elementData: [] } as unknown as BucklingResult);
const plastic = (): PlasticResult => ({ steps: [{ results: r2('step1') }, { results: r2('collapse') }], hinges: [], collapseFactor: 1.5, isMechanism: true } as unknown as PlasticResult);
const train = (): MovingLoadEnvelope => ({
  positions: [{ refPosition: 0, results: r2('train0') }, { refPosition: 1, results: r2('train1') }],
  elements: new Map(),
} as unknown as MovingLoadEnvelope);
const line = (): InfluenceLineResult => ({ quantity: 'Rz', targetNodeId: 1, points: [] });
const pdelta3D = (): PDeltaResult3D => ({ results: r3('pdelta3d'), converged: true, isStable: true, iterations: 3, b2Factor: 1.1 } as unknown as PDeltaResult3D);
const modal3D = (): ModalResult3D => ({ modes: [{ frequency: 1, period: 1 }] } as unknown as ModalResult3D);
const buckling3D = (): BucklingResult3D => ({ modes: [{ loadFactor: 2 }], elementData: [] } as unknown as BucklingResult3D);

/** What "the view" is: every field a function may replace. */
function view() {
  const s = resultsStore;
  return {
    results: tagOf(s.results), single: tagOf(s.singleResults),
    results3D: tagOf(s.results3D), single3D: tagOf(s.singleResults3D),
    cases: [...s.perCase.keys()], combos: [...s.perCombo.keys()], envelope: !!s.envelope,
    activeView: s.activeView, caseId: s.activeCaseId, comboId: s.activeComboId,
    diagram: s.diagramType, reactions: s.showReactions,
  };
}

interface Fn { name: string; is3D: boolean; open: () => void; close: () => void; needsResults?: boolean }
const FUNCTIONS: Fn[] = [
  { name: 'P-Δ', is3D: false, open: () => resultsStore.setPDeltaResult(pdelta()), close: () => resultsStore.clearPDelta() },
  { name: 'Dynamic', is3D: false, open: () => resultsStore.setModalResult(modal()), close: () => resultsStore.clearModal() },
  { name: 'Pcr', is3D: false, open: () => resultsStore.setBucklingResult(buckling()), close: () => resultsStore.clearBuckling() },
  { name: 'plastic collapse', is3D: false, open: () => resultsStore.setPlasticResult(plastic()), close: () => resultsStore.clearPlastic() },
  { name: 'moving load', is3D: false, open: () => resultsStore.setMovingLoadEnvelope(train()), close: () => resultsStore.clearMovingLoad() },
  { name: 'influence line', is3D: false, open: () => resultsStore.setInfluenceLine(line()), close: () => resultsStore.clearInfluenceLine(), needsResults: true },
  {
    name: 'free-body view', is3D: false, needsResults: true,
    open: () => { resultsStore.holdView(); resultsStore.diagramType = 'despiece'; resultsStore.showReactions = true; },
    close: () => resultsStore.releaseView(false),
  },
  { name: 'P-Δ 3D', is3D: true, open: () => resultsStore.setPDeltaResult3D(pdelta3D()), close: () => resultsStore.clearPDelta3D() },
  { name: 'Dynamic 3D', is3D: true, open: () => resultsStore.setModalResult3D(modal3D()), close: () => resultsStore.clearModal3D() },
  { name: 'Pcr 3D', is3D: true, open: () => resultsStore.setBucklingResult3D(buckling3D()), close: () => resultsStore.clearBuckling3D() },
  {
    name: 'free-body view 3D', is3D: true, needsResults: true,
    open: () => { resultsStore.holdView(); resultsStore.diagramType = 'despiece'; },
    close: () => resultsStore.releaseView(true),
  },
];

function solve(is3D: boolean, diagram: DiagramType): void {
  if (is3D) resultsStore.setResults3D(r3('static3d'));
  else resultsStore.setResults(r2('static'));
  resultsStore.diagramType = diagram;
}

afterEach(() => { resultsStore.clear(); resultsStore.forgetView(); });

describe('closing an advanced function restores the view it found', () => {
  for (const fn of FUNCTIONS) {
    it(`${fn.name}, solved model: the static results and the diagram the reader had`, () => {
      solve(fn.is3D, fn.is3D ? 'momentY' : 'moment');
      const before = view();
      fn.open();
      expect(view(), 'the function changed nothing — the test is not testing it').not.toEqual(before);
      expect(() => fn.close()).not.toThrow();
      expect(view()).toEqual(before);
      expect(resultsStore.holdsView).toBe(false);
    });

    if (fn.needsResults) continue;
    it(`${fn.name}, model never solved: no results after closing, and no diagram hiding the loads`, () => {
      const before = view();
      fn.open();
      fn.close();
      expect(view()).toEqual(before);
      expect(resultsStore.results).toBeNull();
      expect(resultsStore.results3D).toBeNull();
      expect(resultsStore.diagramType).toBe('none');
      expect(resultsStore.hasAnyResults).toBe(false);
    });
  }

  it('the view before the first function wins when a second opens over it', () => {
    solve(false, 'shear');
    const before = view();
    resultsStore.setPlasticResult(plastic());
    resultsStore.setPDeltaResult(pdelta());
    resultsStore.clearPDelta();
    expect(view()).toEqual(before);
  });

  it.each([
    ['P-Δ', () => resultsStore.setPDeltaResult(pdelta())],
    ['plastic collapse', () => resultsStore.setPlasticResult(plastic())],
    ['moving load', () => resultsStore.setMovingLoadEnvelope(train())],
  ])('a mode shape opened over %s reads the static results, not the ones it replaced', (_name, first) => {
    solve(false, 'moment');
    first();
    for (const open of [() => resultsStore.setModalResult(modal()), () => resultsStore.setBucklingResult(buckling())]) {
      open();
      expect(tagOf(resultsStore.results)).toBe('static');
    }
  });

  it('a 3D mode shape opened over 3D P-Δ reads the static results', () => {
    solve(true, 'momentY');
    resultsStore.setPDeltaResult3D(pdelta3D());
    resultsStore.setModalResult3D(modal3D());
    expect(tagOf(resultsStore.results3D)).toBe('static3d');
    resultsStore.setPDeltaResult3D(pdelta3D());
    resultsStore.setBucklingResult3D(buckling3D());
    expect(tagOf(resultsStore.results3D)).toBe('static3d');
  });

  it('a combination on screen comes back after the moving load dropped the combinations', () => {
    resultsStore.setResults(r2('static'));
    resultsStore.setCombinationResults(
      new Map([[1, r2('case1')]]), new Map([[7, r2('combo7')]]),
      { maxAbsResults: r2('env') } as unknown as FullEnvelope,
    );
    resultsStore.activeComboId = 7;
    resultsStore.activeView = 'combo';
    resultsStore.diagramType = 'shear';
    const before = view();
    expect(before.results).toBe('combo7');
    resultsStore.setMovingLoadEnvelope(train());
    expect(resultsStore.perCombo.size).toBe(0);
    resultsStore.clearMovingLoad();
    expect(view()).toEqual(before);
  });

  it('the diagram changed while the function was open is the function\'s, and goes too', () => {
    solve(false, 'deformed');
    resultsStore.setPDeltaResult(pdelta());
    resultsStore.diagramType = 'moment';
    resultsStore.clearPDelta();
    expect(resultsStore.diagramType).toBe('deformed');
    expect(tagOf(resultsStore.results)).toBe('static');
  });

  it('a fresh solve while a function is open becomes the static view to go back to', () => {
    resultsStore.setPDeltaResult(pdelta());
    resultsStore.setResults(r2('solved-later'));
    resultsStore.clearPDelta();
    expect(tagOf(resultsStore.results)).toBe('solved-later');
  });

  it('an edit (clear) while a function is open forgets the view, and the re-solve comes back to the static diagram', () => {
    solve(false, 'moment');
    resultsStore.setModalResult(modal());
    resultsStore.clear();
    expect(resultsStore.holdsView).toBe(false);
    expect(resultsStore.pendingView?.diagram).toBe('moment');
  });

  it('a function with no held view (restored, or opened elsewhere) still closes to the static results', () => {
    solve(false, 'deformed');
    resultsStore.setPlasticResult(plastic());
    // Clearing the 3D workspace forgets the held view and leaves the 2D collapse open.
    resultsStore.clear3D();
    expect(resultsStore.holdsView).toBe(false);
    resultsStore.diagramType = 'plasticHinges';
    expect(tagOf(resultsStore.results)).toBe('collapse');
    resultsStore.clearPlastic();
    expect(tagOf(resultsStore.results)).toBe('static');
    expect(resultsStore.diagramType).toBe('deformed');
  });

  it('the influence line closed with null does not throw', () => {
    solve(false, 'deformed');
    resultsStore.setInfluenceLine(line());
    expect(() => resultsStore.setInfluenceLine(null)).not.toThrow();
    expect(resultsStore.influenceLine).toBeNull();
    expect(resultsStore.diagramType).toBe('deformed');
  });

  it('a moving load opens on the envelope it announced, when there is one', () => {
    solve(false, 'deformed');
    resultsStore.setMovingLoadEnvelope({ ...train(), fullEnvelope: { maxAbsResults: r2('env') } as unknown as FullEnvelope });
    expect(resultsStore.movingLoadShowEnvelope).toBe(true);
    expect(resultsStore.diagramType).toBe('moment');
    resultsStore.clearMovingLoad();
    expect(resultsStore.movingLoadShowEnvelope).toBe(false);
    expect(resultsStore.diagramType).toBe('deformed');
  });
});

describe('a 2D ↔ 3D switch closes what the new dimension does not have', () => {
  it('Dynamic opened in 2D on a model never solved: in 3D nothing runs and the loads are shown', () => {
    resultsStore.setModalResult(modal());
    resultsStore.leaveDimension(true);
    expect(resultsStore.modalResult).toBeNull();
    expect(resultsStore.modalResult3D).toBeNull();
    expect(resultsStore.diagramType).toBe('none');
    expect(resultsStore.hasAnyResults).toBe(false);
  });

  for (const [name, open] of [
    ['plastic collapse', () => resultsStore.setPlasticResult(plastic())],
    ['moving load', () => resultsStore.setMovingLoadEnvelope(train())],
    ['influence line', () => resultsStore.setInfluenceLine(line())],
    ['P-Δ', () => resultsStore.setPDeltaResult(pdelta())],
    ['Pcr', () => resultsStore.setBucklingResult(buckling())],
  ] as const) {
    it(`${name} opened on a solved 2D model: closed in 3D, the 2D static view handed back as it was`, () => {
      solve(false, 'shear');
      open();
      resultsStore.leaveDimension(true);
      expect(resultsStore.plasticResult).toBeNull();
      expect(resultsStore.movingLoadEnvelope).toBeNull();
      expect(resultsStore.influenceLine).toBeNull();
      expect(resultsStore.pdeltaResult).toBeNull();
      expect(resultsStore.bucklingResult).toBeNull();
      expect(tagOf(resultsStore.results)).toBe('static');
      // No 3D results yet: nothing to draw in 3D.
      expect(resultsStore.diagramType).toBe('none');
      expect(resultsStore.holdsView).toBe(false);
    });
  }

  it('Pcr opened in 3D, then 2D: the 3D result goes and the mode diagram with it', () => {
    resultsStore.setBucklingResult3D(buckling3D());
    resultsStore.leaveDimension(false);
    expect(resultsStore.bucklingResult3D).toBeNull();
    expect(resultsStore.diagramType).toBe('none');
  });

  it('a diagram the new dimension can draw is kept', () => {
    solve(true, 'deformed');
    resultsStore.setResults(r2('static'));
    resultsStore.diagramType = 'axial';
    resultsStore.leaveDimension(true);
    expect(resultsStore.diagramType).toBe('axial');
  });

  it('an edit pending a re-solve comes back to the static diagram, not a mode shape', () => {
    solve(false, 'moment');
    resultsStore.setModalResult(modal());
    resultsStore.leaveDimension(true);
    resultsStore.clear();
    expect(resultsStore.pendingView?.diagram).toBe('moment');
  });

  it('a 3D envelope survives a 3D function opened and closed', () => {
    resultsStore.setResults3D(r3('static3d'));
    resultsStore.setCombinationResults3D(new Map(), new Map([[2, r3('combo3d')]]), { maxAbsResults3D: r3('env3d') } as unknown as FullEnvelope3D);
    resultsStore.activeView = 'envelope';
    const before = view();
    resultsStore.setModalResult3D(modal3D());
    resultsStore.clearModal3D();
    expect(view()).toEqual(before);
  });
});
