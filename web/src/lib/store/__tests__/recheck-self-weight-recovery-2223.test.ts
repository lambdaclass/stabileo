import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { adoptStoredProject, buildProjectFile, deserializeProject, onProjectOpened } from '../file';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import { recheckStore } from '../recheck.svelte';
import { tabManager } from '../tabs.svelte';
import { migrateSelfWeightIfNeeded } from '../self-weight-migration';
import { compressSnapshot, loadFromShareLink, loadFromURLHash } from '../../utils/url-sharing';
import { GRAVITY_SELF_WEIGHT, type SelfWeightLoad } from '../../engine/analysis-settings';
import { deflateSync, inflateSync } from 'fflate';
import '../index';

vi.mock('../../provenance/applicability', () => ({
  assessProject: () => { throw new Error('notice details unavailable'); },
}));

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

const cases: Array<{ name: string; enabled: boolean; rule?: SelfWeightLoad[]; expected: boolean }> = [
  { name: 'legacy on', enabled: true, expected: true },
  { name: 'legacy off', enabled: false, expected: false },
  { name: 'empty rule with toggle on', enabled: true, rule: [], expected: false },
  { name: 'empty rule with toggle off', enabled: false, rule: [], expected: false },
  { name: 'stated rule with toggle on', enabled: true, rule: [{ caseId: 1, ...GRAVITY_SELF_WEIGHT }], expected: true },
  { name: 'stated rule with toggle off', enabled: false, rule: [{ caseId: 1, ...GRAVITY_SELF_WEIGHT }], expected: true },
];

function project(spatial: boolean, enabled: boolean, rule?: SelfWeightLoad[]) {
  const a = modelStore.addNode(0, 0, 0);
  const b = modelStore.addNode(4, 0, spatial ? 3 : 0);
  modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, spatial ? 'fixed3d' : 'fixed');
  modelStore.withoutUndo(() => modelStore.setAnalysis({ selfWeight: rule }));
  uiStore.includeSelfWeight = enabled;
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

for (const entry of entries) {
  for (const spatial of [false, true]) {
    it.skip.each(['file', 'autosave', 'session'].includes(entry) ? cases : cases.filter(c => c.rule === undefined))(`known wrong result: #2223 — ${entry}, ${spatial ? 'spatial' : 'planar'} PRO, $name keeps notice features through migration and recovery`, async ({ enabled, rule, expected }) => {
      const file = project(spatial, enabled, rule);
      open(entry, file);
      await vi.waitFor(() => expect(recheckStore.loadFailed).toBe(true));
      const before = recheckStore.captureNotice()!;
      expect(before).toBeDefined();
      expect(before.features.includes('selfWeight')).toBe(expected);
      expect(recheckStore.stale).toBe(true);
      expect(recheckStore.noticeOpen).toBe(true);
      migrateSelfWeightIfNeeded();
      const saved = JSON.parse(JSON.stringify(buildProjectFile()));
      recheckStore.reset();
      adoptStoredProject(saved.snapshot, saved.name);
      onProjectOpened(saved.snapshot, saved.analysisMode);
      await vi.waitFor(() => expect(recheckStore.loadFailed).toBe(true));
      expect(recheckStore.captureNotice()).toEqual(before);
      expect(recheckStore.stale).toBe(true);
      expect(recheckStore.noticeOpen).toBe(true);
    });
  }
}

for (const mode of ['2d', '3d'] as const) {
  it.skip.each(cases)(`known wrong result: #2223 — Basic ${mode}, $name retains conservative self-weight notice applicability`, async ({ enabled, rule }) => {
    uiStore.analysisMode = mode;
    const file = project(mode === '3d', enabled, rule);
    expect(deserializeProject(JSON.stringify(file))).toBe(true);
    await vi.waitFor(() => expect(recheckStore.loadFailed).toBe(true));
    expect(recheckStore.captureNotice()!.features.includes('selfWeight')).toBe(enabled || !!rule?.length);
    expect(recheckStore.stale).toBe(true);
  });
}
