import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { adoptStoredProject, buildProjectFile, deserializeProject, onProjectOpened } from '../file';
import { modelStore, type Support } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import { recheckStore } from '../recheck.svelte';
import { tabManager } from '../tabs.svelte';
import { historyStore } from '../history.svelte';
import type { CombinationCase } from '../../engine/loads/combination-cases';
import { migrateSelfWeightIfNeeded } from '../self-weight-migration';
import { compressSnapshot, loadFromShareLink, loadFromURLHash } from '../../utils/url-sharing';
import { assessProject } from '../../provenance/applicability';
import { RESULT_CHANGES } from '../../provenance/full-registry';
import { RESULTS_VERSION } from '../../provenance/registry';
import { stampSolve } from '../../provenance/solve-stamp';
import { initSolver, solvePDelta } from '../../engine/wasm-solver';
import { t } from '../../i18n';
import { readCorpusText } from '../../legacy-projects/legacy';
import { requireStoredProjectInput } from '../../engine/model-input-numbers';
import { deflateSync, inflateSync } from 'fflate';
import LZString from 'lz-string';
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

const legacyNodalEntries = [...entries, 'v1 share', 'undo', 'redo'] as const;

function open(entry: typeof legacyNodalEntries[number], file: ReturnType<typeof buildProjectFile>) {
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
  } else if (entry === 'v1 share') {
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify({
      ...file.snapshot, analysisMode: file.analysisMode,
    }));
    uiStore.includeSelfWeight = file.includeSelfWeight!;
    expect(loadFromShareLink(`https://x/#data=${compressed}`)).toBe(true);
  } else if (entry === 'undo' || entry === 'redo') {
    uiStore.analysisMode = file.analysisMode!;
    uiStore.includeSelfWeight = file.includeSelfWeight!;
    historyStore.setStacks(entry === 'undo' ? [file.snapshot] : [], entry === 'redo' ? [file.snapshot] : []);
    historyStore[entry]();
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

it.each(entries)('known wrong result: #2588 — %s recovers an inclined legacy XZ or YZ frame', async entry => {
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
    const secondOrder = solvePDelta(modelStore.buildSolverInput(false, plane)!);
    expect(secondOrder.results.displacements).toEqual(expect.arrayContaining([expect.objectContaining({ nodeId: tip })]));
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
    if (input) expect.soft(solvePDelta(input).results.displacements).toEqual(secondOrder.results.displacements);
    const combinations = modelStore.solveCombinations();
    expect.soft(combinations && typeof combinations !== 'string' && combinations.perCase.get(1)?.displacements)
      .toEqual(reference && typeof reference !== 'string' && reference.displacements);
  }
});

it.each(entries)('known wrong result: #2588 — %s blocks an ambiguous plane until selected', async entry => {
  await initSolver();
  uiStore.analysisMode = '2d';
  uiStore.drawPlane2D = 'xy';
  const root = modelStore.addNode(0, 0);
  const tip = modelStore.addNode(5, 1, 3);
  modelStore.addElement(root, tip, 'frame');
  modelStore.addSupport(root, 'fixed');
  modelStore.addNodalLoad3D(tip, 0, 0, 0, 0, 10, 0, 1);
  const reference = modelStore.solve(false, 'xz');
  expect(reference).toMatchObject({ displacements: expect.any(Array) });
  const file = buildProjectFile();
  open(entry, { ...file, snapshot: { ...file.snapshot, drawPlane2D: undefined } });

  expect.soft(uiStore.analysisMode).toBe('2d');
  expect.soft(buildProjectFile().snapshot.drawPlane2D).toBeUndefined();
  expect.soft(modelStore.solve(false, 'xz')).toBe(t('svc.savedPlaneRequired'));
  expect.soft(await modelStore.solveAsync(false, 'xz')).toBe(t('svc.savedPlaneRequired'));
  expect.soft(modelStore.solveCombinations(false, 'xz')).toBe(t('svc.savedPlaneRequired'));
  expect.soft(() => modelStore.buildSolverInput(false, 'xz')).toThrow(t('svc.savedPlaneRequired'));

  uiStore.drawPlane2D = 'xz';
  expect(modelStore.solve()).toEqual(reference);
  expect(buildProjectFile().snapshot.drawPlane2D).toBe('xz');
});

it.each(['xz', 'yz'] as const)('known wrong result: #2588 — a global load resolves an otherwise ambiguous %s frame', async plane => {
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

function legacyLoadedCantilever(support: Omit<Support, 'id' | 'nodeId'>) {
  uiStore.analysisMode = '2d';
  uiStore.drawPlane2D = 'xz';
  uiStore.includeSelfWeight = false;
  const root = modelStore.addNode(0, 0);
  const tip = modelStore.addNode(5, 0);
  const member = modelStore.addElement(root, tip, 'frame');
  modelStore.addSupport(root, 'fixed');
  modelStore.addDistributedLoad(member, -10, -10, undefined, false, 1);
  modelStore.addCombination('D', [{ caseId: 1, factor: 1 }]);
  const file = buildProjectFile();
  file.snapshot.supports.push([2, { ...support, id: 2, nodeId: tip }]);
  file.snapshot.nextId.support = 3;
  return { file, tip };
}

it.each(entries)('known wrong result: #2588 — %s requires a plane for a global Z restraint on an X-aligned beam', async entry => {
  await initSolver();
  const { file, tip } = legacyLoadedCantilever({
    type: 'rollerZ', isGlobal: true, dofFrame: 'global',
    dofRestraints: { tx: false, ty: false, tz: true, rx: false, ry: false, rz: false },
  });
  open(entry, file);
  const reference = modelStore.solve();
  expect(reference).toMatchObject({ displacements: expect.arrayContaining([
    expect.objectContaining({ nodeId: tip, uz: expect.any(Number) }),
  ]) });

  const legacy = { ...file, snapshot: { ...file.snapshot, drawPlane2D: undefined } };
  open(entry, legacy);
  expect.soft(buildProjectFile().snapshot.drawPlane2D).toBeUndefined();
  expect.soft(modelStore.solve()).toBe(t('svc.savedPlaneRequired'));
  expect.soft(await modelStore.solveAsync()).toBe(t('svc.savedPlaneRequired'));
  expect.soft(modelStore.solveCombinations()).toBe(t('svc.savedPlaneRequired'));
  expect.soft(() => modelStore.buildSolverInput()).toThrow(t('svc.savedPlaneRequired'));
  expect.soft(assessProject({ ...legacy.snapshot, analysisMode: legacy.analysisMode }, null, '2d').changes.map(change => change.id))
    .toContain('legacy-planar-project-plane');

  uiStore.drawPlane2D = 'xz';
  expect(modelStore.solve()).toEqual(reference);
  expect(buildProjectFile().snapshot.drawPlane2D).toBe('xz');
});

it.each([
  { type: 'rollerZ', isGlobal: true },
  { type: 'rollerY' },
  { type: 'rollerX', angle: 30 },
  { type: 'pinned', dofRestraints: { tx: true, ty: true, tz: false, rx: false, ry: false, rz: false } },
  { type: 'spring', isGlobal: true, ky: 1 },
  { type: 'spring', kz: 1 },
  { type: 'spring', kry: 1 },
  { type: 'spring', curves: { z: [[0, 0], [1, 1]] } },
  { type: 'fixed', dz: 1 },
] satisfies Omit<Support, 'id' | 'nodeId'>[])('known wrong result: #2588 — a directional support %j prevents the XY fallback', support => {
  const { file } = legacyLoadedCantilever(support);
  const snapshot = { ...file.snapshot, analysisMode: file.analysisMode };
  expect(requireStoredProjectInput({ ...snapshot, drawPlane2D: undefined })).toBeUndefined();
  expect(requireStoredProjectInput(snapshot)).toBe('xz');
});

it.each([
  { type: 'rollerX' },
  { type: 'rollerZ', isGlobal: false },
  { type: 'spring', isGlobal: false, ky: 1 },
  { type: 'spring', isGlobal: true, ky: 0, kz: 0, kx: 1 },
] satisfies Omit<Support, 'id' | 'nodeId'>[])('known wrong result: #2588 — a plane-independent support %j keeps the legacy XY solution', async support => {
  await initSolver();
  const { file } = legacyLoadedCantilever(support);
  const xy = { ...file, snapshot: { ...file.snapshot, drawPlane2D: 'xy' as const } };
  open('file', xy);
  const reference = modelStore.solve();
  expect(reference).toMatchObject({ displacements: expect.any(Array) });
  open('file', { ...xy, snapshot: { ...xy.snapshot, drawPlane2D: undefined } });
  expect(buildProjectFile().snapshot.drawPlane2D).toBe('xy');
  expect(modelStore.solve()).toEqual(reference);
});

it.each(entries)('known wrong result: #2588 — %s recovers the archived cantilever with a fixed support angle', async entry => {
  await initSolver();
  uiStore.analysisMode = '2d';
  const file: ReturnType<typeof buildProjectFile> = JSON.parse(readCorpusText('v0.3.0/cantilever.ded'));
  const xy = { ...file, snapshot: { ...file.snapshot, analysisMode: '2d' as const, drawPlane2D: 'xy' as const } };
  open(entry, xy);
  const linear = modelStore.solve();
  expect(linear).toMatchObject({ displacements: expect.any(Array) });
  const combinations = modelStore.solveCombinations();
  expect(combinations).toMatchObject({ perCase: expect.any(Map) });
  const input = modelStore.buildSolverInput()!;
  const nonlinear = solvePDelta(input);
  expect(nonlinear.results.displacements).toEqual(expect.arrayContaining([expect.objectContaining({ nodeId: 2 })]));

  uiStore.drawPlane2D = 'yz';
  const legacy = { ...file, snapshot: { ...file.snapshot, analysisMode: '2d' as const } };
  open(entry, legacy);
  expect.soft(buildProjectFile().snapshot.drawPlane2D).toBe('xy');
  expect.soft(assessProject(legacy.snapshot, null, '2d').changes.map(change => change.id))
    .not.toContain('legacy-planar-project-plane');
  expect.soft(modelStore.solve()).toEqual(linear);
  expect.soft(await modelStore.solveAsync()).toEqual(linear);
  const restoredCombinations = modelStore.solveCombinations();
  expect.soft(typeof restoredCombinations === 'object' && restoredCombinations?.perCase)
    .toEqual(typeof combinations === 'object' && combinations?.perCase);
  const restoredInput = modelStore.buildSolverInput()!;
  expect(restoredInput).toEqual(input);
  expect(solvePDelta(restoredInput).results.displacements).toEqual(nonlinear.results.displacements);
});

it.each([
  { type: 'spring', ky: 1 },
  { type: 'rollerX', dz: -0.01 },
  { type: 'rollerX', dy: -0.01 },
] satisfies Omit<Support, 'id' | 'nodeId'>[])('known wrong result: #2588 — the legacy planar support %j retains its XY input', support => {
  const { file } = legacyLoadedCantilever(support);
  const snapshot = { ...file.snapshot, analysisMode: file.analysisMode };
  expect(requireStoredProjectInput({ ...snapshot, drawPlane2D: undefined })).toBe('xy');
});

it.each([
  { type: 'rollerX', isGlobal: true, dz: -0.01 },
  { type: 'rollerX', angle: 90, dz: -0.01 },
  { type: 'spring', ky: 1, dofFrame: 'global' },
] satisfies Omit<Support, 'id' | 'nodeId'>[])('#2588 requires a plane when %j supplies a directional support field', support => {
  const { file } = legacyLoadedCantilever(support);
  const snapshot = { ...file.snapshot, analysisMode: file.analysisMode };
  expect(requireStoredProjectInput({ ...snapshot, drawPlane2D: undefined })).toBeUndefined();
  expect(requireStoredProjectInput(snapshot)).toBe('xz');
});

it.each(entries)('known wrong result: #2588 — %s checks supports when a legacy nodal force leaves only XY', async entry => {
  await initSolver();
  const { file, tip } = legacyLoadedCantilever({ type: 'spring', ky: 1, kz: 2 });
  modelStore.addNodalLoad(tip, 0, -10, 0, 1);
  file.snapshot.loads = buildProjectFile().snapshot.loads;
  open(entry, file);
  const reference = modelStore.solve();
  expect(reference).toMatchObject({ displacements: expect.any(Array) });
  const secondOrder = solvePDelta(modelStore.buildSolverInput()!);
  expect(secondOrder.results.displacements).toEqual(expect.arrayContaining([expect.objectContaining({ nodeId: tip })]));

  const legacy = { ...file, snapshot: { ...file.snapshot, drawPlane2D: undefined } };
  open(entry, legacy);
  expect.soft(buildProjectFile().snapshot.drawPlane2D).toBeUndefined();
  expect.soft(modelStore.solve()).toBe(t('svc.savedPlaneRequired'));
  expect.soft(await modelStore.solveAsync()).toBe(t('svc.savedPlaneRequired'));
  expect.soft(modelStore.solveCombinations()).toBe(t('svc.savedPlaneRequired'));
  expect.soft(() => modelStore.buildSolverInput()).toThrow(t('svc.savedPlaneRequired'));
  expect.soft(assessProject({ ...legacy.snapshot, analysisMode: legacy.analysisMode }, null, '2d').changes.map(change => change.id))
    .toContain('legacy-planar-project-plane');

  uiStore.drawPlane2D = 'xz';
  expect(modelStore.solve()).toEqual(reference);
  expect(solvePDelta(modelStore.buildSolverInput()!).results.displacements).toEqual(secondOrder.results.displacements);
});

it('keeps the XY solution with a legacy nodal force when the geometry establishes XY', async () => {
  await initSolver();
  const { file, tip } = legacyLoadedCantilever({ type: 'spring', ky: 1, kz: 0 });
  file.snapshot.nodes = file.snapshot.nodes.map(([id, node]) => [id, id === tip ? { ...node, y: 1 } : node]);
  modelStore.addNodalLoad(tip, 0, -10, 0, 1);
  file.snapshot.loads = buildProjectFile().snapshot.loads;
  file.snapshot.drawPlane2D = 'xy';
  open('file', file);
  const reference = modelStore.solve();
  expect(reference).toMatchObject({ displacements: expect.any(Array) });
  open('file', { ...file, snapshot: { ...file.snapshot, drawPlane2D: undefined } });
  expect(buildProjectFile().snapshot.drawPlane2D).toBe('xy');
  expect(modelStore.solve()).toEqual(reference);
});

it.each(entries)('known wrong result: #2588 — %s requires a plane for a legacy guidedX support', async entry => {
  await initSolver();
  const { file, tip } = legacyLoadedCantilever({ type: 'guidedX' });
  for (const plane of ['xy', 'xz'] as const) {
    const explicit = { ...file, snapshot: { ...file.snapshot, drawPlane2D: plane } };
    open(entry, explicit);
    expect(buildProjectFile().snapshot.drawPlane2D).toBe(plane);
    const linear = modelStore.solve();
    expect(linear).toMatchObject({ displacements: expect.arrayContaining([
      expect.objectContaining({ nodeId: tip, uz: 0 }),
    ]) });
    const combinations = modelStore.solveCombinations();
    expect(combinations).toMatchObject({ perCase: expect.any(Map) });
    const input = modelStore.buildSolverInput()!;
    const nonlinear = solvePDelta(input).results;
    expect(nonlinear.displacements).toEqual(expect.arrayContaining([expect.objectContaining({ nodeId: tip, uz: 0 })]));

    const legacy = { ...file, snapshot: { ...file.snapshot, drawPlane2D: undefined } };
    open(entry, legacy);
    expect.soft(buildProjectFile().snapshot.drawPlane2D).toBeUndefined();
    expect.soft(modelStore.solve()).toBe(t('svc.savedPlaneRequired'));
    expect.soft(await modelStore.solveAsync()).toBe(t('svc.savedPlaneRequired'));
    expect.soft(modelStore.solveCombinations()).toBe(t('svc.savedPlaneRequired'));
    expect.soft(() => modelStore.buildSolverInput()).toThrow(t('svc.savedPlaneRequired'));
    expect.soft(assessProject({ ...legacy.snapshot, analysisMode: legacy.analysisMode }, null, '2d').changes.map(c => c.id))
      .toContain('legacy-planar-project-plane');

    uiStore.drawPlane2D = plane;
    expect(modelStore.buildSolverInput()).toEqual(input);
    expect(modelStore.solve()).toEqual(linear);
    expect(await modelStore.solveAsync()).toEqual(linear);
    expect(modelStore.solveCombinations()).toEqual(combinations);
    expect(solvePDelta(modelStore.buildSolverInput()!).results).toEqual(nonlinear);
  }
});

it.each(['xy', 'xz'] as const)('infers %s when the geometry identifies the plane of a guidedX support', async plane => {
  await initSolver();
  const { file, tip } = legacyLoadedCantilever({ type: 'guidedX' });
  file.snapshot.nodes = file.snapshot.nodes.map(([id, node]) =>
    [id, id !== tip ? node : { ...node, [plane === 'xy' ? 'y' : 'z']: 1 }],
  );
  open('file', { ...file, snapshot: { ...file.snapshot, drawPlane2D: plane } });
  const reference = modelStore.solve();
  expect(reference).toMatchObject({ displacements: expect.any(Array) });
  open('file', { ...file, snapshot: { ...file.snapshot, drawPlane2D: undefined } });
  expect(buildProjectFile().snapshot.drawPlane2D).toBe(plane);
  expect(modelStore.solve()).toEqual(reference);
});

it('known wrong result: #2588 — a legacy transverse load cannot select the plane of a guidedX support', () => {
  const { file, tip } = legacyLoadedCantilever({ type: 'guidedX' });
  modelStore.addNodalLoad(tip, 0, -10, 0, 1);
  file.snapshot.loads = buildProjectFile().snapshot.loads;
  expect(requireStoredProjectInput({ ...file.snapshot, drawPlane2D: undefined, analysisMode: '2d' })).toBeUndefined();
});

it.each(['xy', 'xz'] as const)('infers %s from a global load on an X-aligned guidedX beam', async plane => {
  await initSolver();
  const { file } = legacyLoadedCantilever({ type: 'guidedX' });
  const qy = plane === 'xy' ? -10 : 0;
  const qz = plane === 'xz' ? -10 : 0;
  modelStore.addDistributedLoad3D(file.snapshot.elements[0]![0], qy, qy, qz, qz, undefined, undefined, 1, { frame: 'global' });
  file.snapshot.loads = buildProjectFile().snapshot.loads.filter(load => load.type === 'distributed3d');
  open('file', { ...file, snapshot: { ...file.snapshot, drawPlane2D: plane } });
  const reference = modelStore.solve();
  expect(reference).toMatchObject({ displacements: expect.any(Array) });
  open('file', { ...file, snapshot: { ...file.snapshot, drawPlane2D: undefined } });
  expect(buildProjectFile().snapshot.drawPlane2D).toBe(plane);
  expect(modelStore.solve()).toEqual(reference);
});

for (const [component, force, moment] of [
  ['transverse force', -10, 0],
  ['bending moment', 0, -10],
  ['axial force only', 0, 0],
] as const) {
  it.each(legacyNodalEntries)(`known wrong result: #2588 — %s requires a drawing plane for an X-aligned legacy beam with ${component}`, async entry => {
    await initSolver();
    const { file, tip } = legacyLoadedCantilever({ type: 'rollerX' });
    modelStore.addNodalLoad(tip, 1, force, moment, 1);
    file.snapshot.loads = buildProjectFile().snapshot.loads.filter(load => load.type === 'nodal');
    const explicit = { ...file, snapshot: { ...file.snapshot, drawPlane2D: 'xy' as const } };
    open(entry, explicit);
    const linear = modelStore.solve();
    expect(linear).toMatchObject({ displacements: expect.arrayContaining([expect.objectContaining({ nodeId: tip })]) });
    const combinations = modelStore.solveCombinations();
    expect(combinations).toMatchObject({ perCase: expect.any(Map) });
    const input = modelStore.buildSolverInput()!;
    const nonlinear = solvePDelta(input).results;
    expect(nonlinear.displacements).toEqual(expect.arrayContaining([expect.objectContaining({ nodeId: tip })]));

    const legacy = { ...file, snapshot: { ...file.snapshot, drawPlane2D: undefined } };
    open(entry, legacy);
    expect.soft(buildProjectFile().snapshot.drawPlane2D).toBeUndefined();
    expect.soft(modelStore.solve()).toBe(t('svc.savedPlaneRequired'));
    expect.soft(await modelStore.solveAsync()).toBe(t('svc.savedPlaneRequired'));
    expect.soft(modelStore.solveCombinations()).toBe(t('svc.savedPlaneRequired'));
    expect.soft(() => modelStore.buildSolverInput()).toThrow(t('svc.savedPlaneRequired'));
    expect.soft(assessProject({ ...legacy.snapshot, analysisMode: legacy.analysisMode }, null, '2d').changes.map(c => c.id))
      .toContain('legacy-planar-project-plane');

    uiStore.drawPlane2D = 'xy';
    expect(modelStore.buildSolverInput()).toEqual(input);
    expect(modelStore.solve()).toEqual(linear);
    expect(await modelStore.solveAsync()).toEqual(linear);
    expect(modelStore.solveCombinations()).toEqual(combinations);
    expect(solvePDelta(modelStore.buildSolverInput()!).results).toEqual(nonlinear);
  });
}

it('retains a unique XY interpretation for an X-aligned beam with the older fy spelling', async () => {
  await initSolver();
  const { file, tip } = legacyLoadedCantilever({ type: 'rollerX' });
  modelStore.addNodalLoad(tip, 1, -10, 0, 1);
  file.snapshot.loads = buildProjectFile().snapshot.loads.map(load => {
    if (load.type !== 'nodal') return load;
    const data = { ...load.data, fy: load.data.fz };
    Reflect.deleteProperty(data, 'fz');
    return { ...load, data };
  });
  file.snapshot.drawPlane2D = 'xy';
  open('file', file);
  const reference = modelStore.solve();
  expect(reference).toMatchObject({ reactions: expect.arrayContaining([expect.objectContaining({ nodeId: tip, rz: expect.any(Number) })]) });
  open('file', { ...file, snapshot: { ...file.snapshot, drawPlane2D: undefined } });
  expect(buildProjectFile().snapshot.drawPlane2D).toBe('xy');
  expect(modelStore.solve()).toEqual(reference);
});

it.runIf(process.env.REPLAY_2588 === '1').each(legacyNodalEntries)(
  'known wrong result: #2588 — %s keeps conflicting projected point forces and moments from establishing XZ',
  async entry => {
    await initSolver();
    uiStore.analysisMode = '2d';
    uiStore.drawPlane2D = 'xz';
    uiStore.includeSelfWeight = false;
    const root = modelStore.addNode(0, 0);
    const tip = modelStore.addNode(5, 0);
    const member = modelStore.addElement(root, tip, 'frame');
    modelStore.addSupport(root, 'fixed');
    modelStore.addDistributedLoad3D(member, 0, 0, -10, -10, undefined, undefined, 1, { frame: 'global' });
    modelStore.addCombination('D', [{ caseId: 1, factor: 1 }]);
    const file = buildProjectFile();
    const reference = modelStore.solve();
    expect(reference).toMatchObject({ displacements: expect.any(Array) });
    file.snapshot.drawPlane2D = undefined;
    const point = { id: file.snapshot.nextId.load++, elementId: member, a: 2, py: 0, pz: 0, caseId: 1 };
    for (const components of [{ py: -3 }, { mx: 3 }, { mz: 3 }]) {
      file.snapshot.loads = [...modelStore.loads.filter(load => load.type === 'distributed3d'), {
        type: 'pointOnElement3d', data: { ...point, ...components, frame: 'projected' },
      }] as typeof file.snapshot.loads;
      open(entry, file);
      expect.soft(modelStore.snapshot().drawPlane2D).toBeUndefined();
      expect.soft(modelStore.solve()).toBe(t('svc.savedPlaneRequired'));
      expect.soft(await modelStore.solveAsync()).toBe(t('svc.savedPlaneRequired'));
      expect.soft(modelStore.solveCombinations()).toBe(t('svc.savedPlaneRequired'));
      expect.soft(() => modelStore.buildSolverInput()).toThrow(t('svc.savedPlaneRequired'));
    }
    for (const components of [{}, { pz: -3 }, { my: 3 }]) {
      file.snapshot.loads = [...modelStore.loads.filter(load => load.type === 'distributed3d'), {
        type: 'pointOnElement3d', data: { ...point, ...components, frame: 'projected' },
      }] as typeof file.snapshot.loads;
      open(entry, file);
      expect(modelStore.snapshot().drawPlane2D).toBe('xz');
    }
    file.snapshot.loads = modelStore.loads.filter(load => load.type === 'distributed3d');
    open(entry, file);
    expect(modelStore.solve()).toEqual(reference);
  },
);
