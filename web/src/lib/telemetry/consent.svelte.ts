export type UsageChoice = 'granted' | 'denied' | 'undecided';

export const USAGE_CONSENT_KEY = 'stabileo-usage-consent';

function read(): UsageChoice {
  try {
    const raw = localStorage.getItem(USAGE_CONSENT_KEY);
    if (!raw) return 'undecided';
    const choice = (JSON.parse(raw) as { choice?: unknown }).choice;
    return choice === 'granted' || choice === 'denied' ? choice : 'undecided';
  } catch {
    return 'undecided';
  }
}

let choice = $state<UsageChoice>(read());
const listeners = new Set<(c: UsageChoice) => void>();

export const usageConsent = {
  get choice() { return choice; },
  get granted() { return choice === 'granted'; },
  get decided() { return choice !== 'undecided'; },

  set(next: 'granted' | 'denied'): void {
    choice = next;
    try {
      localStorage.setItem(USAGE_CONSENT_KEY, JSON.stringify({ choice: next, at: new Date().toISOString() }));
    } catch {
      /* private mode: the choice holds for this visit */
    }
    for (const l of listeners) l(next);
  },

  onChange(listener: (c: UsageChoice) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
