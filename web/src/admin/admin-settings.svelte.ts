import { adminApi, type AdminSettings } from '../lib/api/admin';
import { adminAuth } from './admin-auth.svelte';

let settings = $state<AdminSettings | null>(null);
let loading = $state(false);
let loadError = $state<unknown>(null);
let pending = $state<boolean | null>(null);
let saveError = $state<unknown>(null);
let savedAt = $state<number | null>(null);
let loadSeq = 0;

export const adminSettings = {
  get settings() { return settings; },
  get loading() { return loading; },
  get loadError() { return loadError; },
  get saving() { return pending !== null; },
  get saveError() { return saveError; },
  get savedAt() { return savedAt; },
  get userLoginEnabled() { return pending ?? settings?.user_login_enabled ?? false; },

  async load(): Promise<void> {
    const seq = ++loadSeq;
    loading = true;
    try {
      const next = await adminAuth.call(() => adminApi.getSettings());
      if (seq !== loadSeq) return;
      settings = next;
      loadError = null;
    } catch (e) {
      if (seq !== loadSeq) return;
      loadError = e;
    } finally {
      if (seq === loadSeq) loading = false;
    }
  },

  async setUserLoginEnabled(value: boolean): Promise<boolean> {
    if (pending !== null || !settings) return false;
    pending = value;
    saveError = null;
    try {
      settings = await adminAuth.call(() => adminApi.updateSettings({ ...settings!, user_login_enabled: value }));
      savedAt = Date.now();
      return true;
    } catch (e) {
      saveError = e;
      return false;
    } finally {
      pending = null;
    }
  },

  reset(): void {
    loadSeq++;
    settings = null;
    loading = false;
    loadError = null;
    pending = null;
    saveError = null;
    savedAt = null;
  },
};
