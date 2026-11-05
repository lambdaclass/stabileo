import { marketingAdminApi, type Acquisition, type MarketingSettings } from '../lib/api/marketing-admin';
import { adminAuth } from './admin-auth.svelte';

function loader<T, A extends unknown[]>(fetch: (...args: A) => Promise<T>) {
  let value = $state<T | null>(null);
  let loading = $state(false);
  let error = $state<unknown>(null);
  let seq = 0;
  return {
    get value() { return value; },
    get loading() { return loading; },
    get error() { return error; },
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

export const marketingSettings = {
  get settings(): MarketingSettings | null { return settingsLoader.value; },
  get loading() { return settingsLoader.loading; },
  get error() { return settingsLoader.error; },
  load: () => settingsLoader.load(),
  reset: () => settingsLoader.reset(),
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
