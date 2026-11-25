import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { adoptStoredProject, buildProjectFile, deserializeProject, onProjectOpened } from '../file';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import { recheckStore } from '../recheck.svelte';
import { tabManager } from '../tabs.svelte';
import { migrateSelfWeightIfNeeded } from '../self-weight-migration';
import { compressSnapshot, loadFromShareLink, loadFromURLHash } from '../../utils/url-sharing';
import { RESULT_CHANGES } from '../../provenance/full-registry';
import { RESULTS_VERSION } from '../../provenance/registry';
import { stampSolve } from '../../provenance/solve-stamp';
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
