import { clearAdCookies } from './visit';

export type AdConsentState = 'granted' | 'denied' | null;

const KEY = 'stb_ad_consent';

function read(): AdConsentState {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}

let state = $state<AdConsentState>(read());
let available = $state(false);
let asking = $state(false);
const onGrant = new Set<() => void>();

export const adConsent = {
  get state() { return state; },
  get granted() { return state === 'granted'; },
  get available() { return available; },
  get asking() { return asking && state === null; },

  offer(grant: () => void): void {
    available = true;
    onGrant.add(grant);
    if (state === 'granted') grant();
    else if (state === null) asking = true;
  },

  decide(next: 'granted' | 'denied'): void {
    const before = state;
    state = next;
    asking = false;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* the choice holds for this page only */
    }
    if (next === 'granted' && before !== 'granted') for (const grant of onGrant) grant();
    if (next === 'denied' && before === 'granted') {
      clearAdCookies();
      // A loaded pixel or GTM container cannot be unloaded; only a new page is free of them.
      location.reload();
    }
  },

  reopen(): void {
    if (!available) return;
    state = null;
    asking = true;
  },

  resetForTests(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* no storage */
    }
    state = null;
    available = false;
    asking = false;
    onGrant.clear();
  },
};
