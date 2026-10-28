/**
 * Codex's review of #663: accepting an update downloaded, installed and relaunched without asking
 * about unsaved work, and a calculation could start while it downloaded. Now the update goes
 * through Save / Don't save / Cancel first, new calculations are refused from then on, and the
 * install waits for the ones already running.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => true) }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ message: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn() }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: vi.fn() }));

import type { Update } from '@tauri-apps/plugin-updater';
import { offer, type UpdaterDeps } from '../updater';
import { destroyPool, poolBusy, poolIdle, refuseNewJobs, setWorkerFactoryForTests, solve2DInWorker, type WorkerLike } from '../../engine/solver-pool';
import { desktopText } from '../desktop-text';

/** Answers a job only when told to, so a calculation can be in flight on purpose. */
class HeldWorker implements WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  static held: Array<() => void> = [];
  postMessage(msg: { type: string; id?: number }): void {
    if (msg.type === 'init') {
      queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } } as MessageEvent));
      return;
    }
    const id = msg.id!;
    HeldWorker.held.push(() => this.onmessage?.({ data: { type: 'result', id, result: { ok: true } } } as MessageEvent));
  }
  terminate(): void { /* nothing to release */ }
}

const en = (k: Parameters<typeof desktopText>[1]) => desktopText('en', k);

function fakeUpdate(log: string[], onDownload?: () => Promise<void>): Update {
  return {
    version: '0.1.0-alpha.3',
    currentVersion: '0.1.0-alpha.2',
    body: 'notes',
    download: vi.fn(async () => {
      log.push('download');
      await onDownload?.();
    }),
    install: vi.fn(async () => void log.push('install')),
  } as unknown as Update;
}

function deps(log: string[], over: Partial<UpdaterDeps> = {}): UpdaterDeps {
  return {
    confirmDiscard: async () => { log.push('confirm'); return true; },
    check: async () => null,
    // The offer is accepted; any later message (busy, failure) is just acknowledged.
    message: vi.fn(async (_m: string, o?: { buttons?: unknown }) => (o?.buttons ? en('updateInstall') : 'Ok')) as unknown as UpdaterDeps['message'],
    openUrl: async () => undefined,
    relaunch: async () => void log.push('relaunch'),
    canSelfUpdate: async () => true,
    poolBusy,
    poolIdle: () => poolIdle(5),
    refuseNewJobs: (r) => { log.push(r === null ? 'accept-jobs' : 'refuse-jobs'); refuseNewJobs(r); },
    toast: () => undefined,
    locale: () => 'en',
    ...over,
  };
}

beforeEach(() => {
  vi.stubEnv('VITE_DESKTOP', '1');
  HeldWorker.held = [];
  setWorkerFactoryForTests(() => new HeldWorker());
});

afterEach(() => {
  refuseNewJobs(null);
  setWorkerFactoryForTests(null);
  destroyPool();
  vi.unstubAllEnvs();
});

describe('desktop updater: installing never loses work or interrupts a calculation', () => {
  it('Cancel in the unsaved-work question stops it: nothing downloaded, calculations still accepted', async () => {
    const log: string[] = [];
    const update = fakeUpdate(log);
    const outcome = await offer(update, deps(log, { confirmDiscard: async () => { log.push('confirm'); return false; } }));
    expect(outcome).toBe('cancelled');
    expect(log).toEqual(['confirm']);
    expect(update.download).not.toHaveBeenCalled();
  });

  it('asks about unsaved work before downloading, refuses new jobs, then installs and relaunches', async () => {
    const log: string[] = [];
    expect(await offer(fakeUpdate(log), deps(log))).toBe('installed');
    expect(log).toEqual(['confirm', 'refuse-jobs', 'download', 'install', 'relaunch']);
  });

  it('a calculation started during the download is refused, with the reason', async () => {
    const log: string[] = [];
    let midDownload: Promise<unknown> | null = null;
    const update = fakeUpdate(log, async () => {
      midDownload = solve2DInWorker({ any: 'model' });
    });
    expect(await offer(update, deps(log))).toBe('installed');
    await expect(midDownload).rejects.toThrow(en('updateRefuseJobs'));
  });

  it('a calculation already running is finished before the install', async () => {
    const log: string[] = [];
    let running: Promise<unknown> | null = null;
    // It starts while the unsaved-work question is open, after the busy check.
    const d = deps(log, {
      confirmDiscard: async () => {
        running = solve2DInWorker({ any: 'model' }).then(() => log.push('calculation done'));
        await new Promise((r) => setTimeout(r, 20));
        return true;
      },
    });
    const done = offer(fakeUpdate(log), d);
    await new Promise((r) => setTimeout(r, 60));
    expect(log).not.toContain('install');
    HeldWorker.held.shift()!();
    expect(await done).toBe('installed');
    await running;
    expect(log.indexOf('calculation done')).toBeLessThan(log.indexOf('install'));
  });

  it('a calculation running when the user accepts: told to wait, nothing downloaded', async () => {
    const log: string[] = [];
    const running = solve2DInWorker({ any: 'model' });
    await new Promise((r) => setTimeout(r, 10));
    expect(poolBusy()).toBe(true);
    const update = fakeUpdate(log);
    expect(await offer(update, deps(log))).toBe('busy');
    expect(update.download).not.toHaveBeenCalled();
    HeldWorker.held.shift()!();
    await running;
  });

  it('a failed download accepts calculations again', async () => {
    const log: string[] = [];
    const update = fakeUpdate(log, async () => { throw new Error('offline'); });
    expect(await offer(update, deps(log))).toBe('failed');
    expect(log).toEqual(['confirm', 'refuse-jobs', 'download', 'accept-jobs']);
  });
});
