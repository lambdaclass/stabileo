/**
 * Basic put self-weight in every dead-load case; it now goes in one (the case chosen under
 * Loads › Combinations, else the first dead-load case). That is the intended rule, but a project
 * written before it, with two or more dead-load cases, reopens with different combinations: a
 * cantilever with D1 = 10 kN, D2 = 5 kN and U = 1.2·D1 + 1.2·D2 went from about 23.2 kN to
 * 20.6 kN, and nothing said so. PRO says it (`selfWeight.migratedMany`); Basic now says it once,
 * from every way a project comes back — a file, a tab, a link, an autosave.
 *
 * A newer project states the case, `null` for "the first dead-load case", so the key's absence is
 * what marks the older one; and a case that no longer exists is not written.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { deflateSync, inflateSync } from 'fflate';
import { generateShareURL, loadFromShareLink } from '../../utils/url-sharing';
import { buildProjectFile, deserializeProject, noteBasicSelfWeightRuleIfNeeded, type DedalFile } from '../file';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import { historyStore } from '../history.svelte';
import { tabManager } from '../tabs.svelte';
import '../index';
import { t } from '../../i18n';

const notice = () => t('selfWeight.migratedMany').split('{')[0]!.trim();
const toasts = () => uiStore.toasts.map((x) => x.message);
const noticed = () => toasts().some((m) => m.startsWith(notice()));

/** The cantilever of the review: two dead-load cases and U = 1.2·D1 + 1.2·D2. */
function cantilever(): { d1: number; d2: number } {
  modelStore.clear();
  const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0);
  modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, 'fixed');
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  for (const c of [...modelStore.model.loadCases]) modelStore.removeLoadCase(c.id);
  const d1 = modelStore.addLoadCase('D1', 'D'), d2 = modelStore.addLoadCase('D2', 'D');
  modelStore.addNodalLoad(b, 0, -10, 0, d1);
  modelStore.addNodalLoad(b, 0, -5, 0, d2);
  modelStore.addCombination('U', [{ caseId: d1, factor: 1.2 }, { caseId: d2, factor: 1.2 }]);
  historyStore.clear();
  return { d1, d2 };
}

/** The same project as a file written before the case was saved: no key at all. */
function olderFile(): string {
  const file = buildProjectFile() as Partial<DedalFile>;
  delete file.selfWeightCaseId;
  return JSON.stringify(file);
}

beforeEach(() => {
  uiStore.analysisMode = '2d';
  uiStore.includeSelfWeight = true;
  uiStore.selfWeightCaseId = null;
  uiStore.toasts.splice(0);
});

describe('an older Basic project with two dead-load cases', () => {
  it('opening the file says the self-weight now goes in one case, naming it and the count', () => {
    cantilever();
    const text = olderFile();
    uiStore.toasts.splice(0);
    expect(deserializeProject(text)).toBe(true);
    expect(noticed()).toBe(true);
    const msg = toasts().find((m) => m.startsWith(notice()))!;
    expect(msg).toContain('D1');
    // Both counts replaced, not only the first.
    expect(msg).not.toContain('{n}');
    expect(msg).toContain('2');
  });

  it('a project saved now says nothing when reopened, and neither does a single dead-load case', () => {
    cantilever();
    const text = JSON.stringify(buildProjectFile());
    expect(JSON.parse(text)).toHaveProperty('selfWeightCaseId', null);
    uiStore.toasts.splice(0);
    expect(deserializeProject(text)).toBe(true);
    expect(noticed()).toBe(false);

    const { d2 } = cantilever();
    modelStore.removeLoadCase(d2);
    const single = olderFile();
    uiStore.toasts.splice(0);
    expect(deserializeProject(single)).toBe(true);
    expect(noticed()).toBe(false);
  });

  it('nothing to say when self-weight is off, or in PRO, which has its own migration', () => {
    cantilever();
    uiStore.includeSelfWeight = false;
    const off = olderFile();
    uiStore.toasts.splice(0);
    deserializeProject(off);
    expect(noticed()).toBe(false);

    uiStore.includeSelfWeight = true;
    uiStore.toasts.splice(0);
    noteBasicSelfWeightRuleIfNeeded(false, 'pro');
    expect(noticed()).toBe(false);
  });

  it('a tab restored from an older session says it too, once', () => {
    cantilever();
    tabManager.init();
    tabManager.syncCurrentTab();
    // The active tab's state as an older session kept it: no case key.
    const { selfWeightCaseId: _dropped, ...older } = tabManager.activeTab!;
    uiStore.toasts.splice(0);
    tabManager.restoreSession([older], older.id);
    expect(noticed()).toBe(true);
    // Captured again now, it carries the key, and restoring it says nothing more.
    tabManager.syncCurrentTab();
    expect(tabManager.activeTab).toHaveProperty('selfWeightCaseId', null);
    uiStore.toasts.splice(0);
    tabManager.restoreSession([tabManager.activeTab!], tabManager.activeTabId!);
    expect(noticed()).toBe(false);
  });

  it('a link written before says it too; one written now does not', () => {
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    vi.stubGlobal('location', { hash: '', pathname: '/', search: '', origin: 'https://x' });
    vi.stubGlobal('queueMicrotask', (callback: () => void) => callback());
    try {
      cantilever();
      const url = generateShareURL()!.url;
      const data = url.slice(url.indexOf('#data=') + 6);
      // The same link without the case, as a link made before carried it.
      const compact = JSON.parse(new TextDecoder().decode(inflateSync(Buffer.from(data.slice(2), 'base64url'))));
      expect(compact._).toHaveProperty('selfWeightCaseId', null);
      delete compact._.selfWeightCaseId;
      const older = '2.' + Buffer.from(deflateSync(new TextEncoder().encode(JSON.stringify(compact)))).toString('base64url');

      uiStore.toasts.splice(0);
      expect(loadFromShareLink(url)).toBe(true);
      expect(noticed()).toBe(false);
      uiStore.toasts.splice(0);
      expect(loadFromShareLink(`https://x/#data=${older}`)).toBe(true);
      expect(noticed()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a case that was deleted is not written to the file', () => {
    const { d2 } = cantilever();
    uiStore.selfWeightCaseId = d2;
    expect(buildProjectFile().selfWeightCaseId).toBe(d2);
    modelStore.removeLoadCase(d2);
    expect(buildProjectFile().selfWeightCaseId).toBeNull();
  });
});
