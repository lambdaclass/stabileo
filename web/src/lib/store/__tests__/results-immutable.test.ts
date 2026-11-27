import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ResultsTable from '../../../components/tables/ResultsTable.svelte';
import { modelStore, resultsStore, uiStore } from '../../store';
import { freezeResult, knownIssueDiagnosticsIn, knownIssueResultDisposition } from '../../engine/known-issues';

const refusal = () => ({ code: 'known_issue', severity: 'error', phase: 'BU-BOUND', value: 741, message: 'ENGINE' });
const warning = () => ({ code: 'known_issue', severity: 'warning', phase: 'BU-BOUND', value: 741, message: 'ENGINE' });

function result(ux: number, diagnostics: object[] = []) {
  return {
    displacements: [{ nodeId: 1, ux, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 }],
    reactions: [],
    elementForces: [],
    structuredDiagnostics: diagnostics,
  };
}

function counted(ux: number, diagnostics: object[] = []) {
  const reads = { n: 0 };
  const target = result(ux, diagnostics);
  Object.defineProperty(target, 'findings', { value: Object.freeze([]), enumerable: false });
  const r = new Proxy(target, { get(t, key, receiver) { if (key === 'findings') reads.n++; return Reflect.get(t, key, receiver); } });
  return { r, reads };
}

function readsPerScan() {
  const probe = counted(0);
  knownIssueResultDisposition(probe.r);
  return probe.reads.n;
}

function everyRead() {
  return [
    resultsStore.results3D,
    resultsStore.singleResults3D,
    resultsStore.perCase3D,
    resultsStore.perCombo3D,
    resultsStore.envelope3D,
    resultsStore.fullEnvelope3D,
    resultsStore.hasCombinations3D,
    resultsStore.knownIssues3D,
  ];
}

const shown = () => JSON.stringify([
  resultsStore.results3D,
  resultsStore.singleResults3D,
  [...resultsStore.perCase3D.values()],
  [...resultsStore.perCombo3D.values()],
  resultsStore.envelope3D,
  resultsStore.fullEnvelope3D,
]);

const mode = uiStore.analysisMode;
afterEach(() => { resultsStore.clear3D(); uiStore.analysisMode = mode; });

describe('published 3D results are immutable', () => {
  it('an in-place edit of a published result throws, at any depth', () => {
    const r = result(1, [warning()]);
    resultsStore.setResults3D(r as never);
    expect(resultsStore.results3D).toBe(r);
    expect(() => { (r as { structuredDiagnostics: object[] }).structuredDiagnostics = [refusal()]; }).toThrow(TypeError);
    expect(() => r.structuredDiagnostics.push(refusal())).toThrow(TypeError);
    expect(() => { (r.structuredDiagnostics[0] as { severity: string }).severity = 'error'; }).toThrow(TypeError);
    expect(() => { r.displacements[0]!.ux = 99; }).toThrow(TypeError);
    expect(() => { (r as Record<string, unknown>).diagnostics = [refusal()]; }).toThrow(TypeError);
    expect(r.structuredDiagnostics).toEqual([warning()]);
    expect(resultsStore.knownIssues3D.refused).toBe(false);
  });

  it('an in-place edit of a published combination bundle throws, maps included', () => {
    const single = result(0);
    const c = result(2);
    const k = result(3);
    const env = { maxAbsResults3D: result(4) };
    const perCase = new Map([[1, c]]);
    const perCombo = new Map([[2, k]]);
    resultsStore.setResults3D(single as never);
    resultsStore.setCombinationResults3D(perCase as never, perCombo as never, env as never);
    expect(() => resultsStore.perCase3D.set(5, result(5, [refusal()]) as never)).toThrow(TypeError);
    expect(() => resultsStore.perCombo3D.delete(2)).toThrow(TypeError);
    expect(() => resultsStore.perCombo3D.clear()).toThrow(TypeError);
    expect(() => { c.structuredDiagnostics = [refusal()]; }).toThrow(TypeError);
    expect(() => k.structuredDiagnostics.push(refusal())).toThrow(TypeError);
    expect(() => { env.maxAbsResults3D.structuredDiagnostics = [refusal()]; }).toThrow(TypeError);
    expect(() => { (env as Record<string, unknown>).maxAbsResults3D = result(9, [refusal()]); }).toThrow(TypeError);
    expect(resultsStore.perCase3D.get(1)).toBe(c);
    expect(resultsStore.perCombo3D.get(2)).toBe(k);
    expect(resultsStore.knownIssues3D.refused).toBe(false);
  });

  it('the withheld map cannot be filled in place', () => {
    resultsStore.setResults3D(result(0) as never);
    resultsStore.setCombinationResults3D(new Map([[1, result(1, [refusal()])]]) as never, new Map([[2, result(2)]]) as never, null as never);
    expect(resultsStore.perCase3D.size).toBe(0);
    expect(() => resultsStore.perCase3D.set(1, result(1) as never)).toThrow(TypeError);
    expect(resultsStore.perCase3D.size).toBe(0);
  });

  it('a named envelope shown in place of the active one is frozen too', () => {
    resultsStore.setResults3D(result(0) as never);
    resultsStore.setCombinationResults3D(new Map([[1, result(1)]]) as never, new Map([[2, result(2)]]) as never, { maxAbsResults3D: result(3) } as never);
    const named = { maxAbsResults3D: result(7) };
    resultsStore.viewEnvelope3D(named as never, 'named');
    expect(() => { named.maxAbsResults3D.structuredDiagnostics = [refusal()]; }).toThrow(TypeError);
    expect(resultsStore.fullEnvelope3D).toBe(named);
  });
});

describe('a refused result is withheld on every read path', () => {
  it('a refused static result replacing a clean one is withheld at once, after the clean verdict was cached', () => {
    uiStore.analysisMode = 'pro';
    resultsStore.setResults3D(result(111111) as never);
    everyRead();
    expect(resultsStore.results3D).not.toBeNull();
    resultsStore.setResults3D(result(222222, [refusal()]) as never);
    expect(resultsStore.results3D).toBeNull();
    expect(resultsStore.singleResults3D).toBeNull();
    expect(resultsStore.knownIssues3D.refused).toBe(true);
    expect(resultsStore.diagramType).toBe('none');
    expect(shown()).not.toContain('222222');
    resultsStore.setResults3D(result(333333) as never);
    expect(resultsStore.results3D?.displacements[0]!.ux).toBe(333333);
    expect(resultsStore.knownIssues3D.refused).toBe(false);
  });

  it.each(['case', 'combination', 'envelope'] as const)('a refused %s replacing a clean bundle withholds every combination read', where => {
    const bundle = (bad: boolean) => [
      new Map([[1, result(444441, bad && where === 'case' ? [refusal()] : [])]]),
      new Map([[2, result(444442, bad && where === 'combination' ? [refusal()] : [])]]),
      { maxAbsResults3D: result(444443, bad && where === 'envelope' ? [refusal()] : []) },
    ] as const;
    resultsStore.setResults3D(result(0) as never);
    resultsStore.setCombinationResults3D(...(bundle(false) as unknown as [never, never, never]));
    everyRead();
    expect(resultsStore.envelope3D).not.toBeNull();
    expect(resultsStore.hasCombinations3D).toBe(true);
    resultsStore.setCombinationResults3D(...(bundle(true) as unknown as [never, never, never]));
    for (const view of ['single', 'combo', 'envelope'] as const) {
      resultsStore.activeView = view;
      expect(resultsStore.envelope3D).toBeNull();
      expect(resultsStore.fullEnvelope3D).toBeNull();
      expect(resultsStore.knownIssues3D.refused).toBe(true);
      if (where !== 'envelope') {
        expect(resultsStore.perCombo3D.size).toBe(0);
        expect(resultsStore.hasCombinations3D).toBe(false);
      }
      if (where === 'case') expect(resultsStore.perCase3D.size).toBe(0);
      expect(JSON.stringify(resultsStore.fullEnvelope3D)).not.toContain('444443');
    }
    resultsStore.setCombinationResults3D(...(bundle(false) as unknown as [never, never, never]));
    expect(resultsStore.envelope3D).not.toBeNull();
    expect(resultsStore.perCombo3D.get(2)?.displacements[0]!.ux).toBe(444442);
    expect(resultsStore.knownIssues3D.refused).toBe(false);
  });

  it('the same diagnostics object published again under a new result keeps its refusal', () => {
    const shared = [refusal()];
    resultsStore.setResults3D(result(1, shared) as never);
    expect(resultsStore.results3D).toBeNull();
    resultsStore.setResults3D(result(2, shared) as never);
    expect(resultsStore.results3D).toBeNull();
  });
});

describe('what the cache cannot see is scanned on every read', () => {
  it('a diagnostic list the freeze cannot reach is not cached: an edit to it is seen', () => {
    const list: object[] = [];
    const r = result(1);
    Object.defineProperty(r, 'findings', { value: list, enumerable: false });
    resultsStore.setResults3D(r as never);
    expect(resultsStore.results3D).toBe(r);
    list.push(refusal());
    expect(resultsStore.results3D).toBeNull();
    expect(resultsStore.knownIssues3D.refused).toBe(true);
  });

  it('a diagnostic accessor is not cached: what it returns next is seen', () => {
    let refuse = false;
    const r = result(1);
    Object.defineProperty(r, 'findings', { enumerable: false, get: () => (refuse ? [refusal()] : []) });
    resultsStore.setResults3D(r as never);
    expect(resultsStore.results3D).toBe(r);
    refuse = true;
    expect(resultsStore.results3D).toBeNull();
  });

  it('a Map inside a result is locked, and the native mutator that still reaches it is seen', () => {
    const params = new Map<string, unknown>();
    const r = { ...result(1), params };
    resultsStore.setResults3D(r as never);
    expect(() => params.set('x', refusal())).toThrow(TypeError);
    expect(resultsStore.results3D).toBe(r);
    Map.prototype.set.call(params, 'x', refusal());
    expect(resultsStore.results3D).toBeNull();
  });

  it('a diagnostic list with holes is not cached: what fills a hole is seen', () => {
    const holes: object[] = [];
    holes.length = 2;
    const r = result(1, holes);
    resultsStore.setResults3D(r as never);
    expect(resultsStore.results3D).toBe(r);
    Object.defineProperty(Array.prototype, 0, { value: refusal(), configurable: true, writable: true });
    try {
      expect(resultsStore.results3D).toBeNull();
    } finally {
      delete (Array.prototype as unknown as Record<number, unknown>)[0];
    }
  });

  it('a list with a hole and an extra property is not cached: what fills the hole is seen', () => {
    const holes: object[] = [];
    holes.length = 2;
    Object.defineProperty(holes, 'extra', { value: 1, enumerable: false });
    const r = result(1, holes);
    resultsStore.setResults3D(r as never);
    expect(resultsStore.results3D).toBe(r);
    Object.defineProperty(Array.prototype, 0, { value: refusal(), configurable: true, writable: true });
    try {
      expect(resultsStore.results3D).toBeNull();
    } finally {
      delete (Array.prototype as unknown as Record<number, unknown>)[0];
    }
  });

  it('an inherited diagnostic getter is not cached: what it returns next is seen', () => {
    let refuse = false;
    Object.defineProperty(Object.prototype, 'findings', { get: () => (refuse ? [refusal()] : undefined), configurable: true });
    try {
      const r = result(1);
      resultsStore.setResults3D(r as never);
      expect(resultsStore.results3D).toBe(r);
      refuse = true;
      expect(resultsStore.results3D).toBeNull();
    } finally {
      delete (Object.prototype as Record<string, unknown>).findings;
    }
  });

  it('a proxy that later reports a diagnostic it does not own is seen', () => {
    let list: object[] | undefined;
    const r = new Proxy(result(1), { get: (t, key, receiver) => (key === 'findings' ? list : Reflect.get(t, key, receiver)) });
    resultsStore.setResults3D(r as never);
    expect(resultsStore.results3D).toBe(r);
    expect(resultsStore.results3D).toBe(r);
    list = [refusal()];
    expect(resultsStore.results3D).toBeNull();
    expect(resultsStore.knownIssues3D.refused).toBe(true);
  });

  it('a diagnostic list inherited after the clean verdict was cached is seen', () => {
    const r = result(1);
    resultsStore.setResults3D(r as never);
    expect(resultsStore.results3D).toBe(r);
    Object.defineProperty(Object.prototype, 'findings', { value: [refusal()], configurable: true, writable: true });
    try {
      expect(resultsStore.results3D).toBeNull();
    } finally {
      delete (Object.prototype as Record<string, unknown>).findings;
    }
  });

  it('a combination whose inherited diagnostics change after the bundle was cached is seen', () => {
    resultsStore.setResults3D(result(0) as never);
    resultsStore.setCombinationResults3D(new Map([[1, result(1)]]) as never, new Map([[2, result(2)]]) as never, { maxAbsResults3D: result(3) } as never);
    expect(resultsStore.perCombo3D.size).toBe(1);
    Object.defineProperty(Object.prototype, 'findings', { value: [refusal()], configurable: true, writable: true });
    try {
      expect(resultsStore.perCombo3D.size).toBe(0);
      expect(resultsStore.envelope3D).toBeNull();
    } finally {
      delete (Object.prototype as Record<string, unknown>).findings;
    }
  });

  it('a list with its own iteration method is read by index, cached or not', () => {
    let refuse = false;
    const withForEach = () => {
      const list: object[] = [];
      Object.defineProperty(list, 'forEach', { value: (cb: (d: object) => void) => { if (refuse) cb(refusal()); }, enumerable: false });
      return list;
    };
    const r = result(1, withForEach());
    resultsStore.setResults3D(r as never);
    expect(resultsStore.results3D).toBe(r);
    refuse = true;
    expect(resultsStore.results3D).toBe(r);
    expect(knownIssueResultDisposition(result(1, withForEach())).refused).toBe(false);
  });

  it('a replaced Array.prototype.forEach changes neither the cached verdict nor a fresh scan', () => {
    const r = result(1);
    resultsStore.setResults3D(r as never);
    expect(resultsStore.results3D).toBe(r);
    const forEach = Array.prototype.forEach;
    Array.prototype.forEach = function (this: unknown[], cb: (v: unknown, i: number, a: unknown[]) => void) { cb(refusal(), 0, this); };
    let cached: unknown, fresh: boolean;
    try {
      cached = resultsStore.results3D;
      fresh = knownIssueResultDisposition({ ...r, structuredDiagnostics: [...r.structuredDiagnostics] }).refused;
    } finally {
      Array.prototype.forEach = forEach;
    }
    expect(cached).toBe(r);
    expect(fresh).toBe(false);
    resultsStore.setResults3D(result(2, [refusal()]) as never);
    expect(resultsStore.results3D).toBeNull();
  });

  it('emptying the diagnostics handed out for a frozen result never clears its refusal', () => {
    const r = freezeResult(result(1, [refusal()]));
    expect(knownIssueResultDisposition(r).refused).toBe(true);
    knownIssueDiagnosticsIn(r).length = 0;
    expect(knownIssueResultDisposition(r).refused).toBe(true);
    resultsStore.setResults3D(r as never);
    expect(resultsStore.results3D).toBeNull();
  });

  it('a stateful inherited getter is never read by the check that decides whether to cache', () => {
    let reads = 0;
    Object.defineProperty(Object.prototype, 'findings', { get: () => (reads++ === 0 ? [refusal()] : undefined), configurable: true });
    try {
      resultsStore.setResults3D(result(1) as never);
      expect(resultsStore.results3D).toBeNull();
    } finally {
      delete (Object.prototype as Record<string, unknown>).findings;
    }
  });

  it('a stateful inherited getter added after caching is never read by the check that reuses the cache', () => {
    const r = result(1);
    resultsStore.setResults3D(r as never);
    expect(resultsStore.results3D).toBe(r);
    let reads = 0;
    Object.defineProperty(Object.prototype, 'findings', { get: () => (reads++ === 0 ? [refusal()] : undefined), configurable: true });
    try {
      expect(resultsStore.results3D).toBeNull();
    } finally {
      delete (Object.prototype as Record<string, unknown>).findings;
    }
  });

  it('a case added to the published map through the native mutator is scanned', () => {
    resultsStore.setResults3D(result(0) as never);
    resultsStore.setCombinationResults3D(new Map([[1, result(1)]]) as never, new Map([[2, result(2)]]) as never, { maxAbsResults3D: result(3) } as never);
    expect(resultsStore.perCase3D.size).toBe(1);
    Map.prototype.set.call(resultsStore.perCase3D, 9, freezeResult(result(9, [refusal()])));
    expect(resultsStore.perCase3D.size).toBe(0);
    expect(resultsStore.perCombo3D.size).toBe(0);
    expect(resultsStore.envelope3D).toBeNull();
  });

  it('filling one withheld map never shows in the next', () => {
    resultsStore.setResults3D(result(0) as never);
    resultsStore.setCombinationResults3D(new Map([[1, result(1, [refusal()])]]) as never, new Map([[2, result(2)]]) as never, null as never);
    Map.prototype.set.call(resultsStore.perCase3D, 1, result(777777));
    expect(resultsStore.perCase3D.size).toBe(0);
    expect(resultsStore.perCombo3D.size).toBe(0);
  });
});

describe('the cached verdict is never stale', () => {
  it('replacing results gives a new object and a new scan', () => {
    const a = counted(1);
    resultsStore.setResults3D(a.r as never);
    expect(resultsStore.results3D).toBe(a.r);
    const afterA = a.reads.n;
    const b = counted(1, [refusal()]);
    resultsStore.setResults3D(b.r as never);
    expect(b.r).not.toBe(a.r);
    expect(resultsStore.results3D).toBeNull();
    expect(b.reads.n).toBeGreaterThan(0);
    expect(a.reads.n).toBe(afterA);
    const c = counted(1);
    resultsStore.setResults3D(c.r as never);
    expect(resultsStore.results3D).toBe(c.r);
    expect(c.reads.n).toBeGreaterThan(0);
  });

  it('an unpublished result is scanned on every read: only frozen results keep a verdict', () => {
    const loose = counted(1);
    for (let i = 0; i < 5; i++) knownIssueResultDisposition(loose.r);
    expect(loose.reads.n).toBe(5 * readsPerScan());
    const frozen = counted(1);
    freezeResult(frozen.r);
    const atFreeze = frozen.reads.n;
    for (let i = 0; i < 5; i++) knownIssueResultDisposition(frozen.r);
    expect(frozen.reads.n - atFreeze).toBe(readsPerScan());
  });

  it('a result that becomes refused in place before it is frozen is refused', () => {
    const r = result(1);
    expect(knownIssueResultDisposition(r).refused).toBe(false);
    r.structuredDiagnostics.push(refusal());
    resultsStore.setResults3D(r as never);
    expect(resultsStore.results3D).toBeNull();
  });
});

describe('scans per open', () => {
  it('a results bundle is scanned at most once per published object, however many reads an open makes', () => {
    const single = counted(1);
    const cases = [counted(2), counted(3)];
    const combos = [counted(4), counted(5), counted(6)];
    const env = counted(7);
    resultsStore.setResults3D(single.r as never);
    resultsStore.setCombinationResults3D(
      new Map(cases.map((c, i) => [i + 1, c.r])) as never,
      new Map(combos.map((c, i) => [i + 10, c.r])) as never,
      { maxAbsResults3D: env.r } as never,
    );
    const all = [single, ...cases, ...combos, env];
    const atPublish = all.map((x) => x.reads.n);
    for (let member = 0; member < 2000; member++) everyRead();
    for (const view of ['combo', 'envelope', 'single'] as const) resultsStore.activeView = view;
    const scans = all.map((x, i) => x.reads.n - atPublish[i]!);
    expect(Math.max(...scans)).toBeLessThanOrEqual(readsPerScan());
    expect(resultsStore.results3D).toBe(single.r);
    expect(resultsStore.perCombo3D.size).toBe(3);
  });
});

it.each(['2d', '3d'] as const)('selects an independent solved combination when another combination is refused in %s', mode => {
  resultsStore.clear();
  resultsStore.clear3D();
  const cases = new Map();
  const combos = new Map([[1, result(1, [refusal()])], [2, result(2)]]);
  if (mode === '3d') resultsStore.setCombinationResults3D(cases, combos as never, null);
  else resultsStore.setCombinationResults(cases, combos as never, null);
  const shown = mode === '3d' ? resultsStore.results3D : resultsStore.results;
  expect(shown?.displacements[0].ux).toBe(2);
  expect(resultsStore.activeComboId).toBe(2);
});

it.each(['2d', '3d'] as const)('displays an independently computed envelope after the supplied combinations refuse in %s', async mode => {
  const { initSolver, computeEnvelope, computeEnvelope3D } = await import('../../engine/wasm-solver');
  await initSolver();
  resultsStore.clear();
  resultsStore.clear3D();
  const source = result(17);
  const refused = new Map([[1, result(41, [refusal()])]]);
  if (mode === '3d') {
    const env = computeEnvelope3D([source as never])!;
    expect(env.maxAbsResults3D.displacements[0].ux).toBe(17);
    resultsStore.setCombinationResults3D(new Map(), refused as never, env);
  } else {
    const env = computeEnvelope([{ reactions: [], elementForces: [], displacements: [{ nodeId: 1, ux: 17, uz: 0, ry: 0 }] }])!;
    expect(env.maxAbsResults.displacements[0].ux).toBe(17);
    resultsStore.setCombinationResults(new Map(), refused as never, env);
  }
  expect(resultsStore.activeView).toBe('envelope');
  expect((mode === '3d' ? resultsStore.results3D : resultsStore.results)?.displacements[0].ux).toBe(17);
});

it.each(['2d', '3d'] as const)('a refused case hides only the displayed combinations which use it in %s', mode => {
  modelStore.clear();
  resultsStore.clear();
  uiStore.analysisMode = mode === '3d' ? 'pro' : '2d';
  const unusable = modelStore.addLoadCase('refused', 'L');
  const independent = modelStore.addLoadCase('independent', 'D');
  const bad = modelStore.addCombination('refused source', [{ caseId: unusable, factor: 1 }]);
  const good = modelStore.addCombination('other source', [{ caseId: independent, factor: 1 }, { caseId: unusable, factor: 0 }]);
  const cases = new Map([[unusable, result(41, [refusal()])]]);
  const combos = new Map([[bad, result(7)], [good, result(23)]]);
  if (mode === '3d') resultsStore.setCombinationResults3D(cases as never, combos as never, null);
  else resultsStore.setCombinationResults(cases as never, combos as never, null);
  const displayed = () => mode === '3d' ? resultsStore.results3D : resultsStore.results;
  expect(displayed()?.displacements[0].ux).toBe(23);
  const table = render(ResultsTable).body;
  expect(table).toContain('role="alert"');
  expect(table).toContain('23000.0000');
  expect(resultsStore.activeComboId).toBe(good);
  expect((mode === '3d' ? resultsStore.perCombo3D : resultsStore.perCombo).size).toBe(0);
  resultsStore.activeComboId = bad;
  expect(displayed()).toBeNull();
  resultsStore.activeComboId = good;
  expect(displayed()?.displacements[0].ux).toBe(23);
});

it.each(['2d', '3d'] as const)('keeps the simple-load diagram and preselects the first usable combination in %s', mode => {
  modelStore.clear();
  resultsStore.clear();
  resultsStore.clear3D();
  uiStore.analysisMode = mode;
  const cases = new Map([[1, result(3, [refusal()])], [2, result(5)]]);
  const bad = modelStore.addCombination('blocked', [{ caseId: 1, factor: 1 }]);
  const good = modelStore.addCombination('usable', [{ caseId: 2, factor: 1 }]);
  const combos = new Map([[bad, result(11)], [good, result(13)]]);
  if (mode === '3d') {
    resultsStore.setResults3D(result(7) as never);
    resultsStore.setCombinationResults3D(cases as never, combos as never, null);
  } else {
    resultsStore.setResults(result(7) as never);
    resultsStore.setCombinationResults(cases as never, combos as never, null);
  }
  resultsStore.diagramType = 'axial';
  const shown = () => (mode === '3d' ? resultsStore.results3D : resultsStore.results)?.displacements[0].ux;
  expect(shown()).toBe(7);
  expect.soft(resultsStore.diagramType).toBe('axial');
  resultsStore.activeView = 'combo';
  expect.soft(resultsStore.activeComboId).toBe(good);
  expect(shown()).toBe(13);
});

it('selects the checked named envelope or the independently checked base with its matching name', async () => {
  const { initSolver, computeEnvelope3D } = await import('../../engine/wasm-solver');
  await initSolver();
  resultsStore.clear3D();
  const base = computeEnvelope3D([result(3) as never])!;
  const good = result(7);
  const bad = result(11, [refusal()]);
  const named = computeEnvelope3D([good as never])!;
  const refused = { ...named, maxAbsResults3D: bad as never };
  resultsStore.setCombinationResults3D(new Map(), new Map([[1, good], [2, bad]]) as never, base);
  resultsStore.activeView = 'envelope';
  for (const [selection, expected, name] of [[named, 7, 'Selected'], [refused, 3, null],
    [structuredClone(named), 3, null]] as const) {
    resultsStore.viewEnvelope3D(selection, 'Selected');
    expect.soft(resultsStore.results3D?.displacements[0].ux).toBe(expected);
    expect.soft(resultsStore.fullEnvelope3D?.maxAbsResults3D.displacements[0].ux).toBe(expected);
    expect.soft(resultsStore.viewedEnvelopeName).toBe(name);
  }
});

it('retains the checked base diagram when only the requested named envelope refuses', async () => {
  const { initSolver, computeEnvelope3D } = await import('../../engine/wasm-solver');
  await initSolver();
  resultsStore.clear3D();
  uiStore.analysisMode = '3d';
  const base = computeEnvelope3D([result(5) as never])!;
  resultsStore.setCombinationResults3D(new Map(), new Map(), base);
  resultsStore.viewEnvelope3D({ ...base, maxAbsResults3D: result(9, [refusal()]) as never }, 'Refused');
  resultsStore.activeView = 'envelope';
  resultsStore.diagramType = 'axial';
  expect(resultsStore.viewedEnvelopeName).toBeNull();
  expect(resultsStore.results3D?.displacements[0].ux).toBe(5);
  expect(resultsStore.diagramType).toBe('axial');
  expect(resultsStore.screen.diagram).toBe('axial');
  expect(resultsStore.knownIssues3D.refused).toBe(true);
});

it.skip.each(['2d', '3d'] as const)('known wrong result: #2491 — retires an envelope when its independent contributor subsequently refuses in %s', async mode => {
  const { initSolver, computeEnvelope, computeEnvelope3D } = await import('../../engine/wasm-solver');
  await initSolver();
  resultsStore.clear();
  resultsStore.clear3D();
  uiStore.analysisMode = mode;
  const source = result(11);
  if (mode === '3d') {
    const base = computeEnvelope3D([result(5) as never])!;
    const named = computeEnvelope3D([source as never])!;
    resultsStore.setCombinationResults3D(new Map(), new Map(), base);
    resultsStore.viewEnvelope3D(named, 'Selected');
    resultsStore.activeView = 'envelope';
    expect(resultsStore.results3D?.displacements[0].ux).toBe(11);
    source.structuredDiagnostics.push(refusal());
    expect.soft(resultsStore.viewedEnvelopeName).toBeNull();
    expect.soft(resultsStore.fullEnvelope3D).toBe(base);
    expect(resultsStore.results3D?.displacements[0].ux).toBe(5);
    expect(resultsStore.knownIssues3D.refused).toBe(true);
  } else {
    const plane = { ...source, displacements: [{ nodeId: 1, ux: 11, uz: 0, ry: 0 }] };
    const base = computeEnvelope([plane as never])!;
    resultsStore.setCombinationResults(new Map(), new Map(), base);
    resultsStore.activeView = 'envelope';
    expect(resultsStore.results?.displacements[0].ux).toBe(11);
    source.structuredDiagnostics.push(refusal());
    expect.soft(resultsStore.fullEnvelope).toBeNull();
    expect(resultsStore.results).toBeNull();
    expect(resultsStore.knownIssues.refused).toBe(true);
  }
});
