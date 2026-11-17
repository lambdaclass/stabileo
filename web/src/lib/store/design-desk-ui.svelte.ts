import type { ResizeProgress } from './design-resize';
import type { DeskReport } from './design-desk';
import { designDrafts } from './design-drafts.svelte';
import { tp } from '../i18n';
/**
 * The design desk's view state: whether it is open, the place on screen and the member it is on.
 * View state only; none of it is saved with the project.
 *
 * The member design is on is read from the model's selection (`uiStore.selectedElements`) and
 * picking a member in design selects it in the model, so a member the model deletes leaves design
 * too. What design keeps is only which one it shows when the model has several selected (`focus`).
 * `capture` and `restore` travel with the project tab (`tabs.svelte.ts`).
 */
import { uiStore } from './ui.svelte';

export type DeskTab = 'prepare' | 'designData' | 'plan' | 'frame' | 'column' | 'wall' | 'slab' | 'joist' | 'footing' | 'seismic' | 'joint' | 'levels' | 'list' | 'steel' | 'connections' | 'report' | 'geometry' | 'materials' | 'special' | 'stairs' | 'pt' | 'elements' | 'fire' | 'codes' | 'detailing' | 'budget' | 'collab' | 'arch' | 'site' | 'sheets' | 'listings' | 'documents';

/**
 * How the desk's places are grouped: the project's design data, the steel (its profiles and its
 * connections), the check under another code, the pieces that are not members, the drawings, the
 * specialties that act on the whole building (the seismic data the reinforcement sheets read among
 * them), and the project's own surfaces.
 */
export const DESK_GROUPS = {
  prepare: ['designData'],
  steel: ['steel', 'connections'],
  codes: ['codes'],
  piece: ['joint', 'stairs', 'elements'],
  documents: ['sheets'],
  specialties: ['seismic', 'fire', 'materials'],
  project: ['collab', 'arch', 'site'],
} as const satisfies Record<string, readonly DeskTab[]>;
export type DeskGroup = keyof typeof DESK_GROUPS;
const isDeskTab = (t: unknown): t is DeskTab => Object.values(DESK_GROUPS).some((g) => (g as readonly unknown[]).includes(t));
export const groupOf = (t: DeskTab): DeskGroup => (Object.keys(DESK_GROUPS) as DeskGroup[]).find((g) => (DESK_GROUPS[g] as readonly DeskTab[]).includes(t)) ?? 'steel';

/** The place a new project, or a saved one on a place that no longer exists, opens on. */
export const DESK_HOME: DeskTab = 'steel';

/**
 * «Other code», in one of its two modes: an independent check of the members under another code,
 * which stores nothing, or the equivalences and the design under another code for the report,
 * which are kept with the project.
 */
export type CodesMode = 'verify' | 'memoria';

/** What a project tab keeps of design when another tab takes the screen. */
export interface DeskViewState {
  open: boolean;
  focus: number | null;
  tab: DeskTab;
  codesMode: CodesMode;
}

function createDesk() {
  let open = $state(false);
  let focus = $state<number | null>(null);
  let tab = $state<DeskTab>(DESK_HOME);
  let codesMode = $state<CodesMode>('verify');
  let levelZ = $state<number | null>(null);
  let filter = $state<DeskFilter>('all');
  let report = $state<DeskReport | null>(null);
  let ask = $state<DeskAsk | null>(null);
  let running = $state<ResizeProgress | null>(null);
  let stopAsked = $state(false);

  /** The member design shows: the focused one while it is selected, else the first selected. */
  function current(): number | null {
    const sel = uiStore.selectedElements;
    if (sel.size === 0) return null;
    if (focus !== null && sel.has(focus)) return focus;
    let first = Infinity;
    for (const id of sel) if (id < first) first = id;
    return first;
  }

  return {
    get open() { return open; },
    set open(v: boolean) { open = v; },
    /** Design's current member, read from the model selection. */
    get selected() { return current(); },
    /** Make `v` design's current member: it becomes the model's selection. */
    set selected(v: number | null) {
      focus = v;
      if (v === null) return;
      const sel = uiStore.selectedElements;
      if (!(sel.size === 1 && sel.has(v))) uiStore.selectElement(v);
    },
    get tab() { return tab; }, set tab(v: DeskTab) { tab = v; },
    get codesMode() { return codesMode; }, set codesMode(v: CodesMode) { codesMode = v; },

    get levelZ() { return levelZ; }, set levelZ(v: number | null) { levelZ = v; },
    get filter() { return filter; }, set filter(v: DeskFilter) { filter = v; },
    get report() { return report; }, set report(v: DeskReport | null) { report = v; },
    get ask() { return ask; }, set ask(v: DeskAsk | null) { ask = v; },
    get running() { return running; }, set running(v: ResizeProgress | null) { running = v; if (!v) stopAsked = false; },
    get stopAsked() { return stopAsked; }, set stopAsked(v: boolean) { stopAsked = v; },
    capture(): DeskViewState {
      return { open, focus, tab, codesMode };
    },
    /** Take a tab's design state back. `reopen` false keeps design closed (a session restored at boot). */
    restore(s: DeskViewState | undefined, reopen = true) {
      if (!s) { this.reset(); return; }
      focus = s.focus; tab = isDeskTab(s.tab) ? s.tab : DESK_HOME;
      codesMode = s.codesMode ?? 'verify';
      open = reopen && s.open;
    },
    /**
     * A new project: the defaults. Design stays open or closed as it is. `keepPlace`: another
     * project opened in this tab (a file, an example), which keeps design on the place it was
     * unless that is a piece, which belonged to the project it was picked in.
     */
    reset(keepPlace = false) {
      focus = null;
      if (!keepPlace || (DESK_GROUPS.piece as readonly DeskTab[]).includes(tab)) tab = DESK_HOME;
    },
  };
}

export const deskUi = createDesk();

/*
 * The height of design's canvas under the viewer when docked, dragged from its top edge and kept
 * for this browser: a per-viewer convenience, so a private window without storage only starts
 * from the default.
 */
const CANVAS_KEY = 'stabileo-desk-canvas-h';
function createDeskLayout() {
  let canvasH = $state(((): number => {
    try { const v = Number(localStorage.getItem(CANVAS_KEY)); if (v > 0) return v; } catch { /* no storage */ }
    return typeof window === 'undefined' ? 360 : Math.round(window.innerHeight * 0.38);
  })());
  return {
    get canvasH() { return canvasH; },
    set canvasH(v: number) { canvasH = Math.max(120, Math.round(v)); },
    remember() { try { localStorage.setItem(CANVAS_KEY, String(canvasH)); } catch { /* no storage */ } },
  };
}
export const deskLayout = createDeskLayout();

export type DeskStep = 'prepare' | 'size' | 'detail' | 'document';

export const DESK_STEPS: readonly DeskStep[] = ['prepare', 'size', 'detail', 'document'];

export type DeskFilter = 'all' | 'fail' | 'warn' | 'ok' | 'unavailable' | 'locked' | 'edited' | 'steel';

export type RunScope = 'all' | 'selection' | 'undesigned';

export interface DeskAsk { scope: RunScope; fromList?: boolean }

export function stepOf(t: DeskTab): DeskStep | null {
  if (t === 'prepare' || t === 'designData') return 'prepare';
  if (t === 'detailing') return 'detail';
  if (t === 'sheets' || t === 'listings' || t === 'documents') return 'document';
  if (t === 'budget' || t === 'collab' || t === 'arch' || t === 'site') return null;
  return 'size';
}

export function announceDrafts(): void {
  const n = designDrafts.count;
  if (n > 0) uiStore.toast(tp('desk.draftsKept', { n }), 'info');
}
