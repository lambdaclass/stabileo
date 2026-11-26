import { describe, it, expect, beforeAll } from 'vitest';
import { render } from 'svelte/server';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore, resultsStore } from '..';
import { ensurePhysicalModel } from '../plates-from-shells';
import { preparePlatesForAnalysis } from '../physical-plates';
import { meshBeforeAnalysis } from '../mesh-policy.svelte';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { sheetRowsSteps, setSheetCode, type SheetProgress } from '../rc-sheets.svelte';
import { setFoundationSystem } from '../rc-sheets-footings';
import { footingPreview } from '../rc-sheets-footing-preview.svelte';
import { sheetsProgress, sheetsSecondsLeft } from '../rc-sheets-progress.svelte';
import { FOUNDATION_SYSTEMS } from '../../rc-sheets/footing-types';
import { makeFmt } from '../../rc-sheets/format';
import { PRO_EXAMPLES } from '../../data/pro-examples';
import { i18n } from '../../i18n';
import RcSheetsProgress from '../../../components/pro/rc-sheets/RcSheetsProgress.svelte';

describe('the time a sheets run still needs', () => {
  const p = (done: number, total: number): SheetProgress => ({ phase: 'design', done, total });

  it('is the pace so far times what is left', () => {
    expect(sheetsSecondsLeft(p(25, 100), 0, 5000)).toBeCloseTo(15, 9);
  });

  it('is not guessed before the run has a pace, nor once it is done', () => {
    expect(sheetsSecondsLeft(p(25, 100), null, 5000)).toBeNull();
    expect(sheetsSecondsLeft(p(25, 100), 0, 1000)).toBeNull();
    expect(sheetsSecondsLeft(p(2, 100), 0, 5000)).toBeNull();
    expect(sheetsSecondsLeft(p(0, 100), 0, 5000)).toBeNull();
    expect(sheetsSecondsLeft(p(100, 100), 0, 5000)).toBeNull();
  });
});

describe('a sheets run on a building with footings', () => {
  const seen: SheetProgress[] = [];

  beforeAll(async () => {
    await wasmSolver.initSolver();
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
    await PRO_EXAMPLES.find((e) => e.id === 'rc-qa-diagnostic')!.load();
    ensurePhysicalModel();
    meshBeforeAnalysis.value = true;
    preparePlatesForAnalysis();
    syncDefinedLoadsForAnalysis(); recognizePhysicalElements();
    resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
    publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
    setSheetCode('cirsoc201-2025');
    setFoundationSystem(null);
    footingPreview.compare = true;
    const it = sheetRowsSteps(makeFmt(','));
    for (let r = it.next(); !r.done; r = it.next()) seen.push(r.value);
  }, 600_000);

  it('says which foundation layout it compares, one after another, and how far through its footings', () => {
    const feet = seen.filter((p) => p.phase === 'foundations');
    expect(feet.length).toBeGreaterThan(0);
    const order = [...new Set(feet.map((p) => p.layout!.index))];
    expect(order).toEqual(FOUNDATION_SYSTEMS.map((_, i) => i + 1));
    expect(new Set(feet.map((p) => p.layout!.system))).toEqual(new Set(FOUNDATION_SYSTEMS));
    for (const p of feet) {
      expect(p.layout!.count).toBe(FOUNDATION_SYSTEMS.length);
      expect(p.layout!.footing).toBeGreaterThanOrEqual(1);
      expect(p.layout!.footing).toBeLessThanOrEqual(p.layout!.footings);
    }
  });

  it('only moves forward and ends at its total', () => {
    for (let i = 1; i < seen.length; i++) {
      if (seen[i]!.phase === 'demands') continue;
      expect(seen[i]!.done).toBeGreaterThanOrEqual(seen[i - 1]!.phase === 'demands' ? 0 : seen[i - 1]!.done);
      expect(seen[i]!.done).toBeLessThanOrEqual(seen[i]!.total);
    }
    const last = seen.filter((p) => p.phase !== 'demands');
    expect(last.at(-1)!.done).toBe(last[0]!.total);
    expect(last.at(-1)!.phase).toBe('foundations');
  });

  it('shows the layout and the footing on the card, and the time left once the run has a pace', () => {
    i18n.locale = 'en';
    const feet = seen.find((p) => p.phase === 'foundations' && !p.layout!.levelling && p.layout!.index === 2)!;
    sheetsProgress.startedAt = performance.now() - 10_000;
    const html = render(RcSheetsProgress, { props: { progress: { ...feet, done: Math.max(feet.done, Math.ceil(feet.total / 2)) } } }).body;
    expect(html).toContain(`Comparing the foundation layouts: 2 of ${FOUNDATION_SYSTEMS.length}`);
    expect(html).toContain(`Footing ${feet.layout!.footing} of ${feet.layout!.footings}`);
    expect(html).toContain('data-testid="rc-progress-left"');
    sheetsProgress.startedAt = null;
    const quiet = render(RcSheetsProgress, { props: { progress: feet } }).body;
    expect(quiet).not.toContain('data-testid="rc-progress-left"');
    const levelling = render(RcSheetsProgress, { props: { progress: { ...feet, layout: { ...feet.layout!, levelling: true } } } }).body;
    expect(levelling).toContain('Bringing the footings to one founding level');
    const grouping = render(RcSheetsProgress, { props: { progress: { ...feet, layout: { ...feet.layout!, grouping: true } } } }).body;
    expect(grouping).toContain('Grouping footings into combined footings, strips and mats');
  });

  it('says when it groups the footings into strips and mats, between designing them one by one', () => {
    expect(seen.some((p) => p.phase === 'foundations' && p.layout!.grouping)).toBe(true);
  });
});
