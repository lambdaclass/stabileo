import { marketingAdminApi, type Acquisition, type AdsOverview, type Channel, type ConnectionReport, type Display, type MarketingSettings, type MarketingUpdate } from '../lib/api/marketing-admin';
import { adminAuth } from './admin-auth.svelte';

const DISPLAY_KEY = 'stabileo-admin-ads-display';

function storedDisplay(): Display {
  try {
    return localStorage.getItem(DISPLAY_KEY) === 'ARS' ? 'ARS' : 'USD';
  } catch {
    return 'USD';
  }
}

/** A value loaded from the admin API, with the request that last asked for it winning. */
function loader<T, A extends unknown[]>(fetch: (...args: A) => Promise<T>) {
  let value = $state<T | null>(null);
  let loading = $state(false);
  let error = $state<unknown>(null);
  let seq = 0;
  return {
    get value() { return value; },
    get loading() { return loading; },
    get error() { return error; },
    set(next: T) { value = next; },
    async load(...args: A): Promise<void> {
      const mine = ++seq;
      loading = true;
      try {
        const next = await adminAuth.call(() => fetch(...args));
        if (mine !== seq) return;
        value = next;
        error = null;
      } catch (e) {
        if (mine === seq) error = e;
      } finally {
        if (mine === seq) loading = false;
      }
    },
    reset() {
      seq++;
      value = null;
      loading = false;
      error = null;
    },
  };
}

const settingsLoader = loader(() => marketingAdminApi.settings());
let saving = $state(false);
let saveError = $state<unknown>(null);

export const marketingSettings = {
  get settings(): MarketingSettings | null { return settingsLoader.value; },
  get loading() { return settingsLoader.loading; },
  get error() { return settingsLoader.error; },
  get saving() { return saving; },
  get saveError() { return saveError; },
  load: () => settingsLoader.load(),

  async save(update: MarketingUpdate): Promise<boolean> {
    saving = true;
    saveError = null;
    try {
      settingsLoader.set(await adminAuth.call(() => marketingAdminApi.updateSettings(update)));
      return true;
    } catch (e) {
      saveError = e;
      return false;
    } finally {
      saving = false;
    }
  },

  reset() {
    settingsLoader.reset();
    saveError = null;
  },
};

const acquisitionLoader = loader((days: number) => marketingAdminApi.acquisition({ days }));
let acquisitionDays = $state(30);

export const acquisition = {
  get data(): Acquisition | null { return acquisitionLoader.value; },
  get loading() { return acquisitionLoader.loading; },
  get error() { return acquisitionLoader.error; },
  get days() { return acquisitionDays; },
  load(days: number = acquisitionDays) {
    acquisitionDays = days;
    return acquisitionLoader.load(days);
  },
  reset: () => acquisitionLoader.reset(),
};

const overviewLoader = loader((days: number, channel: Channel, display: Display) => marketingAdminApi.adsOverview({ days, channel, display }));
let filters = $state<{ days: number; channel: Channel; display: Display }>({ days: 30, channel: 'all', display: storedDisplay() });
let syncing = $state(false);
let queued = $state<number | null>(null);
const connectionsLoader = loader(() => marketingAdminApi.connections());

export const adsReport = {
  get overview(): AdsOverview | null { return overviewLoader.value; },
  get loading() { return overviewLoader.loading; },
  get error() { return overviewLoader.error; },
  get filters() { return filters; },
  get syncing() { return syncing; },
  get queued() { return queued; },
  get connections(): ConnectionReport[] | null { return connectionsLoader.value; },
  get checking() { return connectionsLoader.loading; },
  get connectionsError() { return connectionsLoader.error; },

  load(next: Partial<typeof filters> = {}) {
    filters = { ...filters, ...next };
    if (next.display) {
      try {
        localStorage.setItem(DISPLAY_KEY, next.display);
      } catch {
        /* the choice holds for this visit */
      }
    }
    return overviewLoader.load(filters.days, filters.channel, filters.display);
  },

  async sync(): Promise<void> {
    syncing = true;
    try {
      queued = await adminAuth.call(() => marketingAdminApi.syncAds());
    } finally {
      syncing = false;
    }
  },

  check: () => connectionsLoader.load(),

  reset() {
    overviewLoader.reset();
    connectionsLoader.reset();
    queued = null;
  },
};
