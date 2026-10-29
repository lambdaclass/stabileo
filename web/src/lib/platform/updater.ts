/**
 * Updates through the Tauri updater: a check at startup and from Help ▸ Check for Updates.
 *
 * An update is offered with its notes and installed only when the user accepts. Before anything is
 * downloaded, unsaved work in every tab goes through Save / Don't save / Cancel, as for quitting.
 * From then until the restart, new calculations are refused, and the install waits for the ones
 * already running: installing replaces the app, and on Windows closes it.
 */
import { lockForUpdate, updateInProgress } from './update-lock';
import { invoke } from '@tauri-apps/api/core';
import { message } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { i18n } from '../i18n';
import { poolBusy, poolIdle, refuseNewJobs } from '../engine/solver-pool';
import { uiStore } from '../store/ui.svelte';
import { desktopText } from './desktop-text';

const RELEASES_URL = 'https://github.com/lambdaclass/stabileo/releases';

/** What the update flow needs from the rest of the app; replaced in tests. */
export interface UpdaterDeps {
  /** Save / Don't save / Cancel over every tab; true when it is fine to go on. */
  confirmDiscard: () => Promise<boolean>;
  check: () => Promise<Update | null>;
  message: typeof message;
  openUrl: (url: string) => Promise<void>;
  relaunch: () => Promise<void>;
  canSelfUpdate: () => Promise<boolean>;
  poolBusy: () => boolean;
  poolIdle: () => Promise<void>;
  refuseNewJobs: (reason: string | null) => void;
  toast: (text: string) => void;
  locale: () => string;
}

function defaults(confirmDiscard: () => Promise<boolean>): UpdaterDeps {
  return {
    confirmDiscard,
    check: () => check(),
    message,
    openUrl,
    relaunch,
    canSelfUpdate: async () => {
      try {
        return await invoke<boolean>('can_self_update');
      } catch {
        return false;
      }
    },
    poolBusy,
    poolIdle: () => poolIdle(),
    refuseNewJobs,
    toast: (text) => uiStore.toast(text, 'info'),
    locale: () => i18n.locale,
  };
}

let deps: UpdaterDeps | null = null;

function tx(k: Parameters<typeof desktopText>[1]): string {
  return desktopText(deps?.locale() ?? i18n.locale, k);
}

export type OfferOutcome = 'installed' | 'declined' | 'cancelled' | 'busy' | 'link' | 'failed';

/** Offer `update`; install it only after the user accepts and unsaved work is dealt with. */
let offering = false;

export async function offer(update: Update, d: UpdaterDeps): Promise<OfferOutcome> {
  if (offering || updateInProgress()) return 'busy';
  offering = true;
  try {
    return await offerReserved(update, d);
  } finally {
    offering = false;
  }
}

async function offerReserved(update: Update, d: UpdaterDeps): Promise<OfferOutcome> {
  const notes = update.body?.trim() ? `\n\n${update.body.trim()}` : '';
  const head = tx('updateBody').replace('{version}', update.version).replace('{current}', update.currentVersion);
  if (!(await d.canSelfUpdate())) {
    const answer = await d.message(`${head}\n\n${tx('updateDebLinux')}\n${RELEASES_URL}${notes}`, {
      title: tx('updateTitle'), kind: 'info', buttons: { ok: 'GitHub', cancel: tx('close') },
    });
    if (answer === 'GitHub' || answer === 'Ok') await d.openUrl(RELEASES_URL);
    return 'link';
  }
  const answer = await d.message(`${head}${notes}`, {
    title: tx('updateTitle'), kind: 'info', buttons: { ok: tx('updateInstall'), cancel: tx('updateLater') },
  });
  if (answer !== tx('updateInstall') && answer !== 'Ok') return 'declined';
  if (d.poolBusy()) {
    await d.message(tx('updateBusy'), { title: tx('updateTitle'), kind: 'warning' });
    return 'busy';
  }
  if (!(await d.confirmDiscard())) return 'cancelled';
  lockForUpdate(true);
  d.refuseNewJobs(tx('updateRefuseJobs'));
  try {
    d.toast(tx('updateInstalling'));
    await update.download();
    // A calculation that was already running when the user accepted finishes first.
    await d.poolIdle();
    if (!(await d.confirmDiscard())) {
      d.refuseNewJobs(null);
      lockForUpdate(false);
      return 'cancelled';
    }
    await update.install();
    await d.relaunch();
  } catch (err) {
    d.refuseNewJobs(null);
    lockForUpdate(false);
    await d.message(`${tx('updateFailed')}: ${err instanceof Error ? err.message : String(err)}`, {
      title: tx('updateCheckTitle'), kind: 'error',
    });
    return 'failed';
  }
  return 'installed';
}

/** `manual`: asked from the menu, so "up to date" and failures are said, not only logged. */
export async function checkForUpdates(manual: boolean, d: UpdaterDeps | null = deps): Promise<void> {
  if (!d) return;
  let update: Update | null;
  try {
    update = await d.check();
  } catch (err) {
    console.warn('[stabileo] update check:', err);
    if (manual) await d.message(`${tx('updateFailed')}: ${err instanceof Error ? err.message : String(err)}`, { title: tx('updateCheckTitle'), kind: 'error' });
    return;
  }
  if (update) await offer(update, d);
  else if (manual) await d.message(tx('updateNone'), { title: tx('updateCheckTitle'), kind: 'info' });
}

export async function startUpdater(confirmDiscard: () => Promise<boolean>): Promise<void> {
  deps = defaults(confirmDiscard);
  await checkForUpdates(false);
}
