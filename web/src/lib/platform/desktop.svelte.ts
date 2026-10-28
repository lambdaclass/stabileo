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
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { buildProjectFile, loadFile, projectPayload, serializeProject, sessionPayload } from '../store/file';
import { modelStore } from '../store/model.svelte';
import { historyStore } from '../store/history.svelte';
import { tabManager } from '../store/tabs.svelte';
import { uiStore } from '../store/ui.svelte';
import { i18n, isDefaultName, t } from '../i18n';
import { desktopText, menuLabels } from './desktop-text';
import { startUpdater, checkForUpdates } from './updater';
import { showAbout, reportProblem } from './about';
import { runSelfCheck } from './self-check';
import { routeExternalLinks } from './external-links';
import { logToFile } from './log';

const DED_FILTERS = [{ name: 'Stabileo', extensions: ['ded', 'json'] }];

/** The file each tab was opened from or last saved to. */
const tabPaths = new Map<string, string>();
/** Each tab's content when it was opened or saved, as a hash. */
const baselines = new Map<string, number>();
/** Tabs that may differ from their file; cleared only by a check that finds them equal. */
const changed = new Set<string>();

let dirty = $state(false);
let titleName = $state('');

function tx(key: Parameters<typeof desktopText>[1]): string {
  return desktopText(i18n.locale, key);
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** cyrb53: enough to tell a project from its saved copy without keeping the text. */
function hash(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function fingerprint(): number {
  const file = buildProjectFile();
  file.timestamp = '';
  return hash(JSON.stringify(file));
}

function activeTab(): string {
  return tabManager.activeTabId ?? '';
}

function markClean(tab = activeTab()): void {
  baselines.set(tab, fingerprint());
  changed.delete(tab);
  refreshState();
}

/** Compare the active tab with its file now; true when they differ. */
function checkActive(): boolean {
  const tab = activeTab();
  const base = baselines.get(tab);
  if (base === undefined) {
    baselines.set(tab, fingerprint());
    changed.delete(tab);
  } else if (fingerprint() === base) {
    changed.delete(tab);
  } else {
    changed.add(tab);
  }
  refreshState();
  return changed.has(tab);
}

function anyUnsaved(): boolean {
  checkActive();
  return changed.size > 0;
}

function refreshState(): void {
  const tab = activeTab();
  dirty = changed.has(tab);
  const path = tabPaths.get(tab);
  const name = modelStore.model.name;
  // A default name, saved in whatever language (or as its bare key), reads in the current one.
  titleName = path ? baseName(path) : !name ? tx('untitled') : isDefaultName(name) ? t('tabBar.newStructure') : name;
}

let checkTimer: ReturnType<typeof setTimeout> | null = null;

function watchChanges(): void {
  $effect.root(() => {
    $effect(() => {
      void modelStore.modelVersion;
      void historyStore.undoCount;
      void historyStore.redoCount;
      const tab = activeTab();
      if (baselines.has(tab)) changed.add(tab);
      refreshState();
      if (checkTimer) clearTimeout(checkTimer);
      checkTimer = setTimeout(checkActive, 800);
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

/** Save / Don't save / Cancel, for unsaved changes about to be replaced or closed. */
async function confirmDiscard(): Promise<boolean> {
  if (!anyUnsaved()) return true;
  const answer = await message(tx('unsavedBody'), {
    title: tx('unsavedTitle'),
    kind: 'warning',
    buttons: { yes: tx('save'), no: tx('dontSave'), cancel: tx('cancel') },
  });
  if (answer === tx('save') || answer === 'Yes') {
    if (changed.size > (changed.has(activeTab()) ? 1 : 0)) {
      return saveSessionAs();
    }
    return saveActive();
  }
  return answer === tx('dontSave') || answer === 'No';
}

async function openPath(path: string): Promise<void> {
  try {
    const text = await readTextFile(path);
    const result = await loadFile(new File([text], baseName(path), { type: 'application/json' }));
    if (result.type === 'session') {
      uiStore.toast(t('toast.sessionRestored').replace('{n}', String(result.count)), 'success');
      for (const tab of tabManager.tabs) markClean(tab.id);
    } else {
      tabPaths.set(activeTab(), path);
      markClean();
    }
    await noteRecent(path);
  } catch (err) {
    uiStore.toast(`${t('toast.loadFileError')}: ${err instanceof Error ? err.message : String(err)}`, 'error');
  }
}

export async function openProjectDialog(): Promise<void> {
  if (!(await confirmDiscard())) return;
  const path = await open({ multiple: false, directory: false, filters: DED_FILTERS });
  if (typeof path === 'string') await openPath(path);
}

async function writeTo(path: string, content: string): Promise<boolean> {
  try {
    await writeTextFile(path, content);
    await noteRecent(path);
    uiStore.toast(`${tx('saved')} ${baseName(path)}`, 'success');
    return true;
  } catch (err) {
    uiStore.toast(`${tx('saveFailed')}: ${err instanceof Error ? err.message : String(err)}`, 'error');
    return false;
  }
}

function withDed(path: string): string {
  return /\.(ded|json)$/i.test(path) ? path : `${path}.ded`;
}

/** Save the active tab to its file, or ask where when it has none. */
export async function saveActive(): Promise<boolean> {
  const path = tabPaths.get(activeTab());
  if (!path) return saveActiveAs();
  if (!(await writeTo(path, serializeProject()))) return false;
  markClean();
  return true;
}

export async function saveActiveAs(): Promise<boolean> {
  const { content, filename } = projectPayload();
  const picked = await save({ defaultPath: tabPaths.get(activeTab()) ?? filename, filters: DED_FILTERS });
  if (!picked) return false;
  const path = withDed(picked);
  if (!(await writeTo(path, content))) return false;
  tabPaths.set(activeTab(), path);
  markClean();
  return true;
}

/** Every tab in one file. */
export async function saveSessionAs(): Promise<boolean> {
  const { content, filename } = sessionPayload();
  const picked = await save({ defaultPath: filename, filters: DED_FILTERS });
  if (!picked) return false;
  if (!(await writeTo(withDed(picked), content))) return false;
  for (const tab of tabManager.tabs) {
    if (tab.id === activeTab()) markClean(tab.id);
    else changed.delete(tab.id);
  }
  refreshState();
  return true;
}

/** `saveTextTo` on the desktop: always a native Save dialog. */
export async function saveTextAs(content: string, filename: string): Promise<'saved' | 'cancelled'> {
  const picked = await save({ defaultPath: filename, filters: DED_FILTERS });
  if (!picked) return 'cancelled';
  return (await writeTo(withDed(picked), content)) ? 'saved' : 'cancelled';
}

function newProject(): void {
  tabManager.createTab();
  markClean();
}

let closing = false;

async function quit(): Promise<void> {
  if (closing) return;
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
let lastRun = { cmd: '', at: 0 };

export function runCommand(cmd: string): void {
  const now = Date.now();
  if (running || (lastRun.cmd === cmd && now - lastRun.at < 400)) return;
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
  void go()
    .catch((err) => uiStore.toast(err instanceof Error ? err.message : String(err), 'error'))
    .finally(() => { running = null; lastRun.at = Date.now(); });
}

async function takePendingFiles(): Promise<void> {
  const paths = await invoke<string[]>('take_pending_files');
  for (const path of paths) {
    if (await confirmDiscard()) await openPath(path);
  }
}

/**
 * The page's own file controls, routed to the native ones. The web components stay as they are
 * (stabileo.com's bundle does not change): a project file input asks for the native Open dialog
 * instead of the webview's picker, and the file shortcuts run the same commands as the menu (whose
 * accelerators may fire too; `runCommand` runs a command once).
 */
const PROJECT_ACCEPT = '.ded,.json';

function routePageFileControls(): void {
  document.addEventListener(
    'click',
    (e) => {
      const input = e.target as HTMLInputElement | null;
      if (input?.tagName === 'INPUT' && input.type === 'file' && input.accept === PROJECT_ACCEPT) {
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

let started = false;

export async function startDesktop(): Promise<void> {
  if (started) return;
  started = true;
  logToFile();
  routeExternalLinks();
  routePageFileControls();
  watchChanges();
  await listen<string>('desktop://menu', (e) => runCommand(e.payload));
  await listen('desktop://open-pending', () => void takePendingFiles());
  await getCurrentWindow().onCloseRequested(async (event) => {
    event.preventDefault();
    await quit();
  });
  await takePendingFiles();
  void runSelfCheck();
  void startUpdater();
}
