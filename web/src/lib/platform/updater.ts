/**
 * Updates through the Tauri updater: a check at startup and from Help ▸ Check for updates. The
 * update is offered with its notes and installed only when the user accepts, and never while the
 * engine is working on a calculation.
 */
import { invoke } from '@tauri-apps/api/core';
import { message } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { i18n } from '../i18n';
import { poolBusy } from '../engine/solver-pool';
import { uiStore } from '../store/ui.svelte';
import { desktopText } from './desktop-text';

const RELEASES_URL = 'https://github.com/lambdaclass/stabileo/releases';

function tx(k: Parameters<typeof desktopText>[1]): string {
  return desktopText(i18n.locale, k);
}

async function selfUpdating(): Promise<boolean> {
  try {
    return await invoke<boolean>('can_self_update');
  } catch {
    return false;
  }
}

async function offer(update: Update): Promise<void> {
  const notes = update.body?.trim() ? `\n\n${update.body.trim()}` : '';
  const head = tx('updateBody').replace('{version}', update.version).replace('{current}', update.currentVersion);
  if (!(await selfUpdating())) {
    const answer = await message(`${head}\n\n${tx('updateDebLinux')}\n${RELEASES_URL}${notes}`, {
      title: tx('updateTitle'), kind: 'info', buttons: { ok: 'GitHub', cancel: tx('close') },
    });
    if (answer === 'GitHub' || answer === 'Ok') await openUrl(RELEASES_URL);
    return;
  }
  const answer = await message(`${head}${notes}`, {
    title: tx('updateTitle'), kind: 'info', buttons: { ok: tx('updateInstall'), cancel: tx('updateLater') },
  });
  if (answer !== tx('updateInstall') && answer !== 'Ok') return;
  if (poolBusy()) {
    await message(tx('updateBusy'), { title: tx('updateTitle'), kind: 'warning' });
    return;
  }
  uiStore.toast(tx('updateInstalling'), 'info');
  await update.downloadAndInstall();
  await relaunch();
}

/** `manual`: asked from the menu, so "up to date" and failures are said, not only logged. */
export async function checkForUpdates(manual: boolean): Promise<void> {
  let update: Update | null;
  try {
    update = await check();
  } catch (err) {
    console.warn('[stabileo] update check:', err);
    if (manual) await message(`${tx('updateFailed')}: ${err instanceof Error ? err.message : String(err)}`, { title: tx('updateCheckTitle'), kind: 'error' });
    return;
  }
  if (update) await offer(update);
  else if (manual) await message(tx('updateNone'), { title: tx('updateCheckTitle'), kind: 'info' });
}

export async function startUpdater(): Promise<void> {
  await checkForUpdates(false);
}
