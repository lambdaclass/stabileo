/**
 * The moves between design and the model, in one place, so every button that makes one makes
 * the same move: «Show in the model», a diagnostics row, a detailing conflict, a command that
 * opens a place of design, a «Prepare» entry that opens a modelling tool, leaving design.
 *
 * ── Framing ─────────────────────────────────────────────────────────
 *
 * Both viewers already frame what is selected on `stabileo-zoom-to-selection`, keeping the
 * camera's direction and fitting its distance to the selection's nodes. A move that changes the
 * layout (design closing gives the viewer the whole body row back) is framed two frames later,
 * once the viewer's ResizeObserver has given the canvas its new size: framed in the same tick,
 * the fit measures the size the canvas is about to stop being.
 */
import { uiStore, modelStore } from '../store';
import { deskUi, type DeskTab } from '../store/design-desk-ui.svelte';

/** Ask the model viewer to frame the current selection, once the layout has settled. */
export function frameSelection(): void {
  if (typeof window === 'undefined') return;
  const fire = () => window.dispatchEvent(new CustomEvent('stabileo-zoom-to-selection'));
  if (typeof requestAnimationFrame === 'undefined') { fire(); return; }
  requestAnimationFrame(() => requestAnimationFrame(fire));
}

/** Select these members in the model and frame them where the viewer is now. */
export function selectAndFrame(ids: readonly number[]): void {
  if (ids.length === 0) return;
  uiStore.setSelection(new Set(), new Set(ids), true);
  frameSelection();
}

/**
 * «Show in the model»: the members selected, design left for the model stage (on its members'
 * table, which lists them selected), and the viewer framing them from where it looks.
 */
export function showInModel(ids: readonly number[]): void {
  if (ids.length > 0) uiStore.setSelection(new Set(), new Set(ids), true);
  deskUi.open = false;
  uiStore.proActiveTab = 'elements';
  uiStore.proPanelVisible = true;
  frameSelection();
}

/**
 * The place of design each panel view of the Design stage names. The concrete list, the steel
 * profiles and connections, the design data and the independent check under another code were
 * panels of their own beside the viewer; they are places of the desk now, and a move that names
 * one of those views (a link inside a panel, a restored session, a test hook) lands on its place.
 * `desk` is the view of every other place: it names the stage and no place in particular.
 */
export const DESK_PLACE_OF_TAB: Record<string, DeskTab | null> = {
  desk: null, design: 'list', steel: 'steel', connections: 'connections', designData: 'designData', otherCodes: 'codes',
};

/**
 * Whether a panel view belongs to the Design stage (and so is shown by the desk). The same views
 * `PRO_TAB_STAGE` maps to Design; `stages-coherence.test.ts` holds the two lists together.
 */
export const isDesignTab = (tab: string): boolean => tab in DESK_PLACE_OF_TAB;

/** The panel view the Design stage keeps while the desk is on `place`, so the stage bar reads Design. */
export function designTabFor(place: DeskTab): string {
  return Object.entries(DESK_PLACE_OF_TAB).find(([, p]) => p === place)?.[0] ?? 'desk';
}

/** The panel view to go back to on leaving design, kept on the way in. */
let returnTab = 'nodes';

/**
 * Enter design (or move inside it) on one of its places, the viewer staying where it is. Every
 * command and every rail entry that opens a place of design makes this move, so the same name
 * always lands on the same place. Without a place, design opens where it was left.
 */
export function openDeskAt(place?: DeskTab): void {
  if (!isDesignTab(uiStore.proActiveTab)) returnTab = uiStore.proActiveTab;
  if (place) deskUi.tab = place;
  const tab = designTabFor(deskUi.tab);
  if (uiStore.proActiveTab !== tab) uiStore.proActiveTab = tab;
  uiStore.proPanelVisible = true;
  deskUi.open = true;
}

/** Leave design for the stage it was entered from (Escape, the phone's close). */
export function leaveDesign(): void {
  deskUi.open = false;
  uiStore.proActiveTab = isDesignTab(returnTab) ? 'nodes' : returnTab;
}

/**
 * Keep the Design stage and the desk saying the same thing, read when the panel view changes. A
 * design view opened from anywhere opens the desk on its place; a view of another stage, or
 * Project, Settings and the assistant, closes it, since the desk takes the body row they are
 * shown in.
 */
export function syncDeskWithTab(tab: string): void {
  if (isDesignTab(tab)) {
    const place = DESK_PLACE_OF_TAB[tab];
    if (place) deskUi.tab = place;
    if (!deskUi.open) deskUi.open = true;
    return;
  }
  if (deskUi.open) deskUi.open = false;
}

/** The desk was opened or closed directly: the panel view follows, so the stage bar agrees. */
export function syncTabWithDesk(open: boolean): void {
  if (open && !isDesignTab(uiStore.proActiveTab)) {
    returnTab = uiStore.proActiveTab;
    uiStore.proActiveTab = designTabFor(deskUi.tab);
  } else if (!open && isDesignTab(uiStore.proActiveTab)) {
    uiStore.proActiveTab = isDesignTab(returnTab) ? 'nodes' : returnTab;
  }
}

/** A modelling tool opened from design's «Prepare»: the model stage, on that tool's panel. */
export function openModelTool(tab: string): void {
  deskUi.open = false;
  uiStore.proActiveTab = tab;
  uiStore.proPanelVisible = true;
  uiStore.currentTool = 'select';
}

/**
 * Whether design has nothing to work on yet: no member it reads (`rows`) and no bars anywhere in
 * the model. Then it offers its two ways in rather than an empty plan.
 */
export function isDesignEmpty(rowCount: number): boolean {
  if (rowCount > 0) return false;
  for (const e of modelStore.elements.values()) if (e.reinforcement) return false;
  return true;
}
