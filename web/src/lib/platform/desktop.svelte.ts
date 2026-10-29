/**
 * The desktop app's side of the platform layer (`./index.ts`). Loaded only by the desktop build.
 *
 * Files are read and written through Tauri's fs plugin, whose scope holds no path of its own: the
 * dialog plugin adds each file the user picks, and the shell adds a file it was asked to open
 * (`desktop/src-tauri/src/main.rs`).
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { message, open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { buildProjectFile, loadFileText, projectPayload, serializeProject, sessionPayload } from '../store/file';
import { modelStore } from '../store/model.svelte';
import { designDrafts } from '../store/design-drafts.svelte';
import { historyStore } from '../store/history.svelte';
import { tabManager, type TabState } from '../store/tabs.svelte';
import { uiStore } from '../store/ui.svelte';
import { i18n, isDefaultName, t } from '../i18n';
import { desktopText, menuLabels } from './desktop-text';
import { startUpdater, checkForUpdates } from './updater';
import { showAbout, reportProblem } from './about';
import { runSelfCheck } from './self-check';
import { routeExternalLinks } from './external-links';
import { logToFile } from './log';
import { updateInProgress } from './update-lock';
import { DocumentState, hash, type TabDoc } from './document-state';

const DED_FILTERS = [{ name: 'Stabileo', extensions: ['ded', 'json'] }];

/** Each tab's file and saved state (`./document-state.ts`). */
const docs = new DocumentState();
const sessionTabs = new Set<string>();
let sessionPath: string | null = null;

let dirty = $state(false);
let titleName = $state('');

function tx(key: Parameters<typeof desktopText>[1]): string {
  return desktopText(i18n.locale, key);
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function liveFingerprint(): number {
  const { timestamp, version, appMode, ...persisted } = buildProjectFile();
  if (designDrafts.count) sessionTabs.add(activeTab());
  return hash(JSON.stringify({ ...persisted, drafts: designDrafts.capture() }));
}

function storedFingerprint(tab: TabState): number {
  return hash(JSON.stringify({ name: tab.name, snapshot: tab.modelSnapshot, analysisMode: tab.analysisMode, axisConvention3D: tab.axisConvention3D, viewportPresentation3D: tab.viewportPresentation3D, includeSelfWeight: tab.includeSelfWeight, selfWeightCaseId: tab.selfWeightCaseId ?? null, drafts: tab.design?.drafts ?? { frames: [] } }));
}

function activeTab(): string {
  return tabManager.activeTabId ?? '';
}

function tabDocs(): TabDoc[] {
  const active = activeTab();
  return tabManager.tabs.map((tab) => ({
    id: tab.id,
    fingerprint: tab.id === active ? liveFingerprint : () => storedFingerprint(tab),
  }));
}

function activeDoc(): TabDoc {
  return { id: activeTab(), fingerprint: liveFingerprint };
}

/** The tabs with changes their file does not have, decided from their content now. */
export function unsavedTabs(): string[] {
  return docs.unsaved(tabDocs()).map((d) => d.id);
}

function refreshState(): void {
  const tab = activeTab();
  dirty = docs.isUnsaved(activeDoc());
  const path = docs.path(tab);
  const name = modelStore.model.name;
  // A default name, saved in whatever language (or as its bare key), reads in the current one.
  titleName = path ? baseName(path) : !name ? tx('untitled') : isDefaultName(name) ? t('tabBar.newStructure') : name;
}

let checkTimer: ReturnType<typeof setTimeout> | null = null;

function watchChanges(): void {
  $effect.root(() => {
    $effect(() => {
      // New tabs get their baseline when they appear, closed ones are forgotten.
      void tabManager.tabs.length;
      docs.prune(tabDocs());
      refreshState();
    });
    $effect(() => {
      // The title's dot follows edits after a pause; the save questions never wait for it.
      void modelStore.modelVersion;
      void historyStore.undoCount;
      void historyStore.redoCount;
      dirty = true;
      if (checkTimer) clearTimeout(checkTimer);
      checkTimer = setTimeout(refreshState, 800);
    });
    $effect(() => {
      void modelStore.model.name;
      void i18n.locale;
      refreshState();
    });
    $effect(() => {
      const labels = menuLabels(i18n.locale);
      void invoke('set_menu_labels', { labels }).catch((err) => console.warn('[stabileo] menu labels:', err));
    });
    $effect(() => {
      const title = `${dirty ? '• ' : ''}${titleName} — Stabileo`;
      void getCurrentWindow().setTitle(title);
    });
  });
}

async function noteRecent(path: string): Promise<void> {
  try {
    await invoke('note_recent', { path });
  } catch (err) {
    console.warn('[stabileo] recent files:', err);
  }
}

/**
 * Save / Don't save / Cancel, for unsaved changes in any tab (the inactive ones too) about to be
 * replaced or closed. True when it is fine to go on.
 */
export async function confirmDiscard(): Promise<boolean> {
  const unsaved = unsavedTabs();
  if (unsaved.length === 0) return true;
  const answer = await message(tx('unsavedBody'), {
    title: tx('unsavedTitle'),
    kind: 'warning',
    buttons: { yes: tx('save'), no: tx('dontSave'), cancel: tx('cancel') },
  });
  if (answer === tx('save') || answer === 'Yes') {
    if (unsaved.length === 1 && unsaved[0] === activeTab()) return await saveActive() && unsavedTabs().length === 0;
    return await saveSessionAs() && unsavedTabs().length === 0;
  }
  return answer === tx('dontSave') || answer === 'No';
}

function workspaceFingerprint(): string {
  return JSON.stringify([activeTab(), tabDocs().map(doc => [doc.id, doc.fingerprint()])]);
}

export async function openPath(path: string): Promise<void> {
  try {
    const before = workspaceFingerprint();
    const text = await readTextFile(path);
    if (updateInProgress()) return;
    if (before !== workspaceFingerprint()) throw new Error(tx('openChanged'));
    if (!(await confirmDiscard())) return;
    if (before !== workspaceFingerprint()) throw new Error(tx('openChanged'));
    const result = loadFileText(text);
    historyStore.clear();
    if (result.type === 'session') {
      uiStore.toast(t('toast.sessionRestored').replace('{n}', String(result.count)), 'success');
      sessionTabs.clear();
      sessionPath = path;
      docs.replaceAll(tabDocs());
    } else {
      sessionPath = null;
      docs.generation++;
      sessionTabs.delete(activeTab());
      docs.markSaved(activeDoc(), path);
    }
    refreshState();
    await noteRecent(path);
  } catch (err) {
    uiStore.toast(`${t('toast.loadFileError')}: ${err instanceof Error ? err.message : String(err)}`, 'error');
  }
}

export async function openProjectDialog(): Promise<void> {
  const path = await open({ multiple: false, directory: false, filters: DED_FILTERS });
  if (typeof path === 'string') await openPath(path);
}

async function writeTo(path: string, content: string): Promise<boolean> {
  try {
    await invoke('atomic_save', { path, content });
    await noteRecent(path);
    uiStore.toast(`${tx('saved')} ${baseName(path)}`, 'success');
    return true;
  } catch (err) {
    uiStore.toast(`${tx('saveFailed')}: ${err instanceof Error ? err.message : String(err)}`, 'error');
    return false;
  }
}

function captured(doc: TabDoc): TabDoc {
  const fingerprint = doc.fingerprint();
  return { id: doc.id, fingerprint: () => fingerprint, generation: docs.generation };
}

/** Save the active tab to its file, or ask where when it has none. */
export async function saveActive(): Promise<boolean> {
  if (sessionPath) return saveSession(sessionPath);
  if (designDrafts.count || sessionTabs.has(activeTab())) return saveSessionAs();
  const path = docs.path(activeTab());
  if (!path) return saveActiveAs();
  const doc = captured(activeDoc());
  if (!(await writeTo(path, serializeProject()))) return false;
  docs.markSaved(doc, path);
  refreshState();
  return true;
}

export async function saveActiveAs(): Promise<boolean> {
  if (sessionPath || designDrafts.count || sessionTabs.has(activeTab())) return saveSessionAs();
  const doc = captured(activeDoc());
  const { content, filename } = projectPayload();
  const picked = await save({ defaultPath: docs.path(activeTab()) ?? filename, filters: DED_FILTERS });
  if (!picked) return false;
  const path = picked;
  if (!(await writeTo(path, content))) return false;
  docs.markSaved(doc, path);
  refreshState();
  return true;
}

/** Every tab in one file. */
export async function saveSessionAs(): Promise<boolean> {
  return saveSession(null);
}

async function saveSession(path: string | null): Promise<boolean> {
  const generation = docs.generation;
  const { content, filename } = sessionPayload();
  const saved = tabDocs().map(captured);
  const picked = path ?? await save({ defaultPath: sessionPath ?? filename, filters: DED_FILTERS });
  if (!picked) return false;
  if (!(await writeTo(picked, content))) return false;
  if (generation === docs.generation) sessionPath = picked;
  for (const doc of saved) docs.markSaved(doc);
  refreshState();
  return true;
}

/** `saveTextTo` on the desktop: always a native Save dialog. */
export async function saveTextAs(content: string, filename: string): Promise<'saved' | 'cancelled'> {
  let scope: unknown;
  try { scope = JSON.parse(content); } catch { /* Exported text need not be a project. */ }
  if (scope && typeof scope === 'object' && 'snapshot' in scope) return await saveActiveAs() ? 'saved' : 'cancelled';
  if (scope && typeof scope === 'object' && 'type' in scope && scope.type === 'session') return await saveSessionAs() ? 'saved' : 'cancelled';
  const picked = await save({ defaultPath: filename, filters: DED_FILTERS });
  if (!picked) return 'cancelled';
  return (await writeTo(picked, content)) ? 'saved' : 'cancelled';
}

function newProject(): void {
  tabManager.createTab();
  docs.track(tabDocs());
  refreshState();
}

let closing = false;

async function quit(): Promise<void> {
  if (closing || updateInProgress()) return;
  closing = true;
  try {
    if (await confirmDiscard()) {
      await invoke('exit_app');
    }
  } finally {
    closing = false;
  }
}

/**
 * One command at a time, and the same one only once: the native menu's accelerator and the page's
 * own shortcut can both fire for one key press, depending on the system's webview.
 */
let running: string | null = null;
let fileCommands: Promise<unknown> = Promise.resolve();

function enqueue(action: () => Promise<unknown>): Promise<unknown> {
  const result = fileCommands.then(action, action);
  fileCommands = result.catch(() => undefined);
  return result;
}
let lastRun = { cmd: '', at: 0 };

export function runCommand(cmd: string): void {
  const now = Date.now();
  if (updateInProgress() || running || (lastRun.cmd === cmd && now - lastRun.at < 400)) return;
  lastRun = { cmd, at: now };
  const go = async (): Promise<unknown> => {
    switch (cmd) {
      case 'new': return newProject();
      case 'open': return openProjectDialog();
      case 'save': return saveActive();
      case 'save_as': return saveActiveAs();
      case 'save_session': return saveSessionAs();
      case 'quit': return quit();
      case 'about': return showAbout();
      case 'report': return reportProblem();
      case 'check_updates': return checkForUpdates(true);
      default: return undefined;
    }
  };
  running = cmd;
  void enqueue(go)
    .catch((err) => uiStore.toast(err instanceof Error ? err.message : String(err), 'error'))
    .finally(() => { running = null; lastRun.at = Date.now(); });
}

let pendingDrain: Promise<void> = Promise.resolve();

export function takePendingFiles(): Promise<void> {
  pendingDrain = pendingDrain.then(() => enqueue(drainPendingFiles), () => enqueue(drainPendingFiles)).then(() => undefined);
  return pendingDrain;
}

async function drainPendingFiles(): Promise<void> {
  if (updateInProgress()) return;
  const paths = await invoke<string[]>('take_pending_files');
  for (const path of paths) {
    await openPath(path);
  }
}

/**
 * The page's own file controls, routed to the native ones. The web components stay as they are
 * (stabileo.com's bundle does not change): a project file input asks for the native Open dialog
 * instead of the webview's picker, and the file shortcuts run the same commands as the menu (whose
 * accelerators may fire too; `runCommand` runs a command once).
 */

export function routePageFileControls(): void {
  document.addEventListener(
    'click',
    (e) => {
      const input = e.target as HTMLInputElement | null;
      if (input?.tagName === 'INPUT' && input.type === 'file' && input.hasAttribute('data-project-input')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        runCommand('open');
      }
    },
    true,
  );
  window.addEventListener(
    'keydown',
    (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      const cmd = key === 's' ? (e.shiftKey ? 'save_as' : 'save') : key === 'o' && !e.shiftKey ? 'open' : key === 'n' && !e.shiftKey ? 'new' : null;
      if (!cmd) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      runCommand(cmd);
    },
    true,
  );
  // No AI button until its service is wired in the desktop app (phase 2 of docs/desktop).
  const style = document.createElement('style');
  style.textContent = '.btn-ai { display: none !important; }';
  document.head.appendChild(style);
}

export function trackDocuments(): void {
  docs.replaceAll(tabDocs());
  tabManager.onCreated(() => { docs.track(tabDocs()); });
  tabManager.onDeactivated((tab) => docs.rebase(tab.id, liveFingerprint(), storedFingerprint(tab)));
  tabManager.onActivated((tab) => docs.rebase(tab.id, storedFingerprint(tab), liveFingerprint()));
}

let started = false;

export async function startDesktop(): Promise<void> {
  if (started) return;
  started = true;
  logToFile();
  routeExternalLinks();
  routePageFileControls();
  trackDocuments();
  watchChanges();
  await listen<string>('desktop://menu', (e) => runCommand(e.payload));
  await listen('desktop://open-pending', () => void takePendingFiles());
  await getCurrentWindow().onCloseRequested(async (event) => {
    event.preventDefault();
    await quit();
  });
  await takePendingFiles();
  if (!(await runSelfCheck())) {
    uiStore.toast(tx('selfCheckFailed'), 'error');
    await message(tx('selfCheckFailed'), { kind: 'error' });
  }
  void startUpdater(confirmDiscard);
}
