import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { adoptStoredProject, buildProjectFile, deserializeProject, onProjectOpened } from '../file';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import { recheckStore } from '../recheck.svelte';
import { tabManager } from '../tabs.svelte';
import type { CombinationCase } from '../../engine/loads/combination-cases';
import { migrateSelfWeightIfNeeded } from '../self-weight-migration';
import { compressSnapshot, loadFromShareLink, loadFromURLHash } from '../../utils/url-sharing';
import { assessProject } from '../../provenance/applicability';
import { RESULT_CHANGES } from '../../provenance/full-registry';
import { RESULTS_VERSION } from '../../provenance/registry';
import { stampSolve } from '../../provenance/solve-stamp';
import { initSolver } from '../../engine/wasm-solver';
import { t } from '../../i18n';
import { deflateSync, inflateSync } from 'fflate';
import '../index';

beforeEach(() => {
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  vi.stubGlobal('history', { replaceState: vi.fn() });
  vi.stubGlobal('location', { hash: '', pathname: '/', search: '', origin: 'https://x' });
  vi.stubGlobal('queueMicrotask', (callback: () => void) => callback());
  uiStore.analysisMode = 'pro';
  uiStore.selfWeightCaseId = null;
  modelStore.clear();
  recheckStore.reset();
  recheckStore.restoreStamp(undefined);
});

afterEach(() => {
  recheckStore.reset();
  vi.unstubAllGlobals();
});

function project(mode: '2d' | '3d' | 'pro', analysis: 'linear' | 'nonlinear', version: number) {
  uiStore.analysisMode = mode;
  uiStore.includeSelfWeight = true;
  const a = modelStore.addNode(0, 0, 0);
  modelStore.addSupport(a, mode === '2d' ? 'fixed' : 'fixed3d');
  modelStore.addNodalLoad3D(a, 0, 0, -20, 0, 0, 0, 1);
  modelStore.withoutUndo(() => modelStore.setAnalysis({ selfWeight: undefined }));
  recheckStore.restoreStamp({ ...stampSolve(analysis, null), resultsVersion: version });
  return JSON.parse(JSON.stringify(buildProjectFile())) as ReturnType<typeof buildProjectFile>;
}

const entries = ['file', 'autosave', 'session', 'share', 'embed', 'dataHash', 'embedHash'] as const;

function previousProject(enabled: boolean) {
  uiStore.includeSelfWeight = !enabled;
  uiStore.analysisMode = '2d';
  uiStore.includeSelfWeight = !enabled;
}

function open(entry: typeof entries[number], file: ReturnType<typeof buildProjectFile>) {
  if (entry === 'file') {
    previousProject(file.includeSelfWeight!);
    expect(deserializeProject(JSON.stringify(file))).toBe(true);
  } else if (entry === 'autosave') {
    previousProject(file.includeSelfWeight!);
    adoptStoredProject(file.snapshot, file.name);
    uiStore.analysisMode = file.analysisMode!;
    uiStore.includeSelfWeight = file.includeSelfWeight!;
    onProjectOpened(file.snapshot, file.analysisMode);
  } else if (entry === 'session') {
    tabManager.init();
    tabManager.syncCurrentTab();
    const tab = { ...tabManager.activeTab!, modelSnapshot: file.snapshot };
    previousProject(file.includeSelfWeight!);
    tabManager.restoreSession([tab], tab.id);
  } else {
    const compressed = compressSnapshot({ ...file.snapshot, analysisMode: file.analysisMode });
    const compact = JSON.parse(new TextDecoder().decode(inflateSync(Buffer.from(compressed.slice(2), 'base64url'))));
    compact._ = { includeSelfWeight: file.includeSelfWeight };
    const legacy = '2.' + Buffer.from(deflateSync(new TextEncoder().encode(JSON.stringify(compact)))).toString('base64url');
    const mode = entry === 'embed' || entry === 'embedHash' ? 'embed' : 'data';
    const hash = `#${mode}=${legacy}`;
    previousProject(file.includeSelfWeight!);
    if (entry === 'dataHash' || entry === 'embedHash') {
      vi.stubGlobal('location', { hash, pathname: '/', search: '', origin: 'https://x' });
      expect(loadFromURLHash()).toBe(mode);
    } else {
      expect(loadFromShareLink(`https://x/${hash}`)).toBe(true);
    }
  }
}

const resultantsVersion = RESULT_CHANGES.changes.find(c => c.id === 'planar-nonlinear-resultants')?.resultsVersion ?? RESULTS_VERSION;

for (const [analysis, latest, issue] of [
  ['linear', RESULTS_VERSION, 2223],
  ['nonlinear', resultantsVersion, 2539],
] as const) {
  const version = latest - 1;
  for (const entry of entries) {
    it.each(['2d', '3d', 'pro'] as const)(`known wrong result: #${issue} — ${entry} keeps an unrelated older %s ${analysis} project quiet through autosave recovery`, async mode => {
      const file = project(mode, analysis, version);
      open(entry, file);
      await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
      expect(recheckStore.assessment?.changes.map(c => c.id)).toEqual([]);
      expect(recheckStore.noticeOpen).toBe(false);
      expect(recheckStore.stale).toBe(false);
      expect(recheckStore.captureNotice()).toBeUndefined();
      expect(recheckStore.capture()?.resultsVersion).toBe(version);
      if (mode === 'pro') migrateSelfWeightIfNeeded();
      const saved = JSON.parse(JSON.stringify(buildProjectFile()));
      recheckStore.reset();
      adoptStoredProject(saved.snapshot, saved.name);
      onProjectOpened(saved.snapshot, saved.analysisMode);
      await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
      expect(recheckStore.assessment?.changes.map(c => c.id)).toEqual([]);
      expect(recheckStore.noticeOpen).toBe(false);
      expect(recheckStore.stale).toBe(false);
      expect(recheckStore.captureNotice()).toBeUndefined();
      expect(recheckStore.capture()?.resultsVersion).toBe(version);
    });
  }
}

it.each(entries)('opens a legacy XY project with its X load after opening a YZ project via %s', async entry => {
  await initSolver();
  uiStore.analysisMode = '2d';
  uiStore.drawPlane2D = 'xy';
  try {
    const root = modelStore.addNode(0, 0);
    const tip = modelStore.addNode(5, 3);
    modelStore.addElement(root, tip, 'frame');
    modelStore.addSupport(root, 'fixed');
    const fx = 10;
    modelStore.addNodalLoad(tip, fx, 0);
    const project = buildProjectFile();
    const legacy = { ...project, snapshot: { ...project.snapshot, drawPlane2D: undefined } };
    const yz = { ...project, snapshot: { ...project.snapshot, drawPlane2D: 'yz' } };
    const reference = modelStore.solve(false, uiStore.drawPlane2D);
    expect(reference).toMatchObject({ reactions: [{ nodeId: root, rx: expect.any(Number) }] });
    expect(reference && typeof reference !== 'string' && reference.reactions[0]?.rx).toBeCloseTo(-fx);
    expect(deserializeProject(JSON.stringify(yz))).toBe(true);
    expect(uiStore.drawPlane2D).toBe('yz');
    open(entry, legacy);
    expect.soft(uiStore.drawPlane2D).toBe('xy');
    const restored = modelStore.solve(false, uiStore.drawPlane2D);
    expect(restored && typeof restored !== 'string' && restored.reactions[0]?.rx).toBeCloseTo(-fx);
    expect(restored).toEqual(reference);
  } finally {
    uiStore.drawPlane2D = 'xy';
  }
});

const rankingNotice = 'repeated-combination-pattern-ranking';
const flatRoofNote = { key: 'loads.cirsoc101.note.snowAsFlatRoof' };
const implicitSnow = { symbol: 'S', factor: 1 } as const;
const explicitSnow = { ...implicitSnow, snowBasis: 'flatRoof' } as const;
const roofLive = { symbol: 'Lr', factor: 1.5 } as const;
const mixedSnowRule = {
  id: 'mixed-snow', purpose: 'strength' as const, notes: [flatRoofNote],
  terms: [implicitSnow, explicitSnow, roofLive],
};

const mixedSnowCases: CombinationCase[] = [
  { id: 1, type: 'S', name: 'Physical snow', alternatives: 'snow' },
  { id: 2, type: 'S', name: 'Flat-roof snow', alternatives: 'snow', snowBasis: 'flatRoof' },
  { id: 3, type: 'S', name: 'Partial flat-roof snow', alternatives: 'snow', snowBasis: 'flatRoof', pattern: true },
  { id: 4, type: 'Lr', name: 'Roof live', alternatives: 'roof' },
  { id: 5, type: 'Lr', name: 'Partial roof live', alternatives: 'roof', pattern: true },
];

for (const entry of ['file', 'autosave', 'session'] as const) {
  for (const [mode, analysis] of [['2d', 'linear'], ['3d', 'linear'], ['pro', 'nonlinear']] as const) {
    it(`#2569 ${entry} recheck requests regeneration for the mixed legacy snow rule in ${mode} after ${analysis}`, async () => {
      const file = project(mode, analysis, RESULTS_VERSION - 1);
      file.snapshot.combinationRules = [mixedSnowRule];
      file.snapshot.loadCases = mixedSnowCases;
      open(entry, file);
      await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
      expect.soft(recheckStore.captureNotice()?.features).toContain('repeatedCombinationRuleActions');
      const notice = recheckStore.assessment?.changes.find(change => change.id === rankingNotice);
      expect.soft(notice?.requiresLoadRegeneration).toBe(true);
      expect(notice?.prs).toContain(2590);
    });
  }
}

it('#2569 recheck keeps separate snow actions and zero factors out of the ranking notice', () => {
  const controls = [
    { ...mixedSnowRule, notes: [] },
    { ...mixedSnowRule, terms: [{ ...implicitSnow, group: 'north roof' }, explicitSnow, roofLive] },
    { ...mixedSnowRule, terms: [implicitSnow, { ...explicitSnow, factor: 0 }, roofLive] },
  ];
  for (const rule of controls) {
    const assessment = assessProject({ combinationRules: [rule] }, null, 'pro');
    expect(assessment.changes.map(change => change.id)).not.toContain(rankingNotice);
  }
});

it.skip.each(entries)('known wrong result: #2588 — %s recovers an inclined legacy XZ or YZ frame', async entry => {
  await initSolver();
  for (const plane of ['xz', 'yz'] as const) {
    uiStore.analysisMode = '2d';
    uiStore.drawPlane2D = plane;
    modelStore.clear();
    const root = modelStore.addNode(0, 0);
    const tip = modelStore.addNode(plane === 'xz' ? 5 : 0, plane === 'yz' ? 5 : 0, 3);
    modelStore.addElement(root, tip, 'frame');
    modelStore.addSupport(root, 'fixed');
    modelStore.addNodalLoad3D(tip, 0, 0, -10, 0, 0, 0, 1);
    modelStore.addCombination('D', [{ caseId: 1, factor: 1 }]);
    const file = buildProjectFile();
    const reference = modelStore.solve(false, plane);
    expect(reference).toMatchObject({ displacements: expect.arrayContaining([
      expect.objectContaining({ nodeId: tip, uz: expect.any(Number) }),
    ]) });

    uiStore.drawPlane2D = 'xy';
    open(entry, { ...file, snapshot: { ...file.snapshot, drawPlane2D: undefined } });
    expect.soft(uiStore.analysisMode).toBe('2d');
    expect.soft(uiStore.drawPlane2D).toBe(plane);
    expect.soft(modelStore.solve()).toEqual(reference);
    expect.soft(await modelStore.solveAsync()).toEqual(reference);
    const input = modelStore.buildSolverInput();
    expect.soft(input?.nodes.get(tip)).toMatchObject({ x: 5, z: 3 });
    const combinations = modelStore.solveCombinations();
    expect.soft(combinations && typeof combinations !== 'string' && combinations.perCase.get(1)?.displacements)
      .toEqual(reference && typeof reference !== 'string' && reference.displacements);
  }
});

it.skip.each(['file', 'share'] as const)('known wrong result: #2588 — %s blocks an ambiguous plane until selected', async entry => {
  await initSolver();
  uiStore.analysisMode = '2d';
  uiStore.drawPlane2D = 'xy';
  const root = modelStore.addNode(0, 0);
  const tip = modelStore.addNode(5, 1, 3);
  modelStore.addElement(root, tip, 'frame');
  modelStore.addSupport(root, 'fixed');
  modelStore.addNodalLoad3D(tip, 10, 0, 0, 0, 0, 0, 1);
  const reference = modelStore.solve(false, 'xy');
  expect(reference).toMatchObject({ displacements: expect.any(Array) });
  const file = buildProjectFile();
  open(entry, { ...file, snapshot: { ...file.snapshot, drawPlane2D: undefined } });

  expect.soft(uiStore.analysisMode).toBe('2d');
  expect.soft(buildProjectFile().snapshot.drawPlane2D).toBeUndefined();
  expect.soft(modelStore.solve(false, 'xy')).toBe(t('svc.savedPlaneRequired'));
  expect.soft(await modelStore.solveAsync(false, 'xy')).toBe(t('svc.savedPlaneRequired'));
  expect.soft(modelStore.solveCombinations(false, 'xy')).toBe(t('svc.savedPlaneRequired'));
  expect.soft(() => modelStore.buildSolverInput(false, 'xy')).toThrow(t('svc.savedPlaneRequired'));

  uiStore.drawPlane2D = 'xy';
  expect(modelStore.solve()).toEqual(reference);
  expect(buildProjectFile().snapshot.drawPlane2D).toBe('xy');
});

it.skip.each(['xz', 'yz'] as const)('known wrong result: #2588 — a global load resolves an otherwise ambiguous %s frame', async plane => {
  await initSolver();
  uiStore.analysisMode = '2d';
  uiStore.drawPlane2D = plane;
  const root = modelStore.addNode(0, 0);
  const tip = modelStore.addNode(plane === 'xz' ? 5 : 0, plane === 'yz' ? 5 : 0);
  modelStore.addElement(root, tip, 'frame');
  modelStore.addSupport(root, 'fixed');
  modelStore.addNodalLoad3D(tip, 0, 0, -10, 0, 0, 0, 1);
  const reference = modelStore.solve(false, plane);
  expect(reference).toMatchObject({ displacements: expect.any(Array) });
  const file = buildProjectFile();
  open('file', { ...file, snapshot: { ...file.snapshot, drawPlane2D: undefined } });
  expect.soft(uiStore.drawPlane2D).toBe(plane);
  expect(modelStore.solve()).toEqual(reference);
});
