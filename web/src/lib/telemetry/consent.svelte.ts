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
  /** On by default: anything but an explicit "no" shares. */
  get sharing() { return choice !== 'denied'; },

  set(next: 'granted' | 'denied'): void {
    choice = next;
    try {
      localStorage.setItem(USAGE_CONSENT_KEY, JSON.stringify({ choice: next, at: new Date().toISOString() }));
    } catch {
      /* private mode: the choice holds for this visit */
    }
    for (const l of listeners) l(next);
  },

  /** The signed-in account's recorded choice: a refusal always wins, a grant only fills an undecided browser. */
  adoptAccount(recorded: boolean | null | undefined): void {
    if (recorded === false && choice !== 'denied') this.set('denied');
    else if (recorded === true && choice === 'undecided') this.set('granted');
  },

  onChange(listener: (c: UsageChoice) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
