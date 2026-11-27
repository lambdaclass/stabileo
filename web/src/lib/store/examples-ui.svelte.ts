export type LibraryView = 'examples' | 'tutorials';
export type ExampleShelf = 'plane' | 'space';

const START_KEY = 'stabileo-start-card';

function startOffStored(): boolean {
  try { return localStorage.getItem(START_KEY) === 'off'; } catch { return false; }
}

let view = $state<LibraryView | null>(null);
let shelf = $state<ExampleShelf | null>(null);
let dismissedTab = $state<string | null | undefined>(undefined);
let startOff = $state(startOffStored());

export const examplesUi = {
  get view(): LibraryView | null { return view; },
  get shelf(): ExampleShelf | null { return shelf; },
  set shelf(v: ExampleShelf | null) { shelf = v; },
  open(v: LibraryView, s: ExampleShelf | null = null): void {
    view = v;
    shelf = s;
  },
  close(): void { view = null; },

  startDismissedFor(tab: string | null): boolean { return dismissedTab === tab; },
  dismissStart(tab: string | null): void { dismissedTab = tab; },
  get startOff(): boolean { return startOff; },
  set startOff(v: boolean) {
    startOff = v;
    try { localStorage.setItem(START_KEY, v ? 'off' : 'on'); } catch { /* private window */ }
  },
};
