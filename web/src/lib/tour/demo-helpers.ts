/**
 * demo-helpers.ts — the moves every guided demo makes.
 *
 * # Why these are shared rather than repeated
 *
 * Seven demos load an example, press solve, wait for a result and point at a
 * ribbon command. Written out seven times, those four things drift: one demo
 * clears the 3D results and another forgets, one waits for the solve and
 * another races it. They are the same act each time, so they are written once.
 *
 * # Anchors
 *
 * A step points at a CSS selector. The ribbon's commands already carry stable
 * `data-testid` attributes — the e2e suite drives the app by them — so the
 * demos use those rather than a second set of attributes that would have to be
 * kept in step with the first. Where a region has no stable hook of its own it
 * gets a `data-tour`, and those are listed in `ANCHORS` below so a reader can
 * see the whole surface a demo may point at without grepping the markup.
 */

import { modelStore, resultsStore, uiStore } from '../store';

/**
 * Which ribbon commands are somewhere ELSE on a phone.
 *
 * The phone arranges the same commands differently — see `Ribbon.svelte`. Two
 * of them stopped being ribbon commands entirely: materials and sections are
 * tabs of the Model data panel there, because those tabs already did exactly
 * what the commands did. A demo that asks for `rb-cmd-sections` on a phone is
 * asking for an id that does not exist, and a tour step whose target is absent
 * darkens the screen and says nothing — the silent failure this whole file's
 * ANCHORS list was written to prevent.
 *
 * So the anchor answers with whatever exists at the width the reader is on.
 */
const PHONE_TAB_FOR: Record<string, string> = {
  materials: 'materials',
  sections: 'sections',
};

/**
 * Diagram commands live inside the Results cluster on a phone, so they exist
 * only while that menu is open. A step pointing at one has to open it first —
 * `openCluster('results')` in `onEnter` — and this list is how a reader of the
 * demos can tell which steps need that.
 */
const PHONE_CLUSTERED = new Set([
  'none', 'deformed', 'axial', 'momentY', 'shearZ',
  'moment', 'shear', 'torsion', 'stress',
]);

/** Every anchor the demos rely on. One list, so a rename has one place to look. */
export const ANCHORS = {
  /**
   * Resolves per width. Called when a demo is BUILT, which is when it starts,
   * so it reflects the screen the reader is actually on.
   */
  ribbonCommand: (id: string) => {
    if (uiStore.isMobile && PHONE_TAB_FOR[id]) {
      return `[data-testid="dt-tab-${PHONE_TAB_FOR[id]}"]`;
    }
    return `[data-testid="rb-cmd-${id}"]`;
  },
  /** True when this command is only reachable through a menu at this width. */
  needsCluster: (id: string) => uiStore.isMobile && PHONE_CLUSTERED.has(id),
  settings: '[data-testid="rb-settings"]',
  pointerMode: '[data-testid="pointer-mode"]',
  /** The right-hand panel a ribbon command opens. Already carries a testid. */
  rightPanel: '[data-testid="basic-panel"]',
  viewport: '.viewport-container',
  /** The "structure changed — recompute" button in the kinematic report. */
  kinematicStale: '[data-testid="kin-stale"]',
  /** The two sliders that move the query along the member and across the section. */
  sectionSliders: '[data-tour="ssp-sliders"]',
  /**
   * A whole ribbon group — `results` is the row of diagrams. On a phone that
   * row is folded behind one button, and the button IS the group there.
   */
  ribbonGroup: (id: string) =>
    uiStore.isMobile && id === 'results'
      ? '[data-testid="rb-cluster-results"]'
      : `[data-group="${id}"]`,
  /** The 3D camera stack: fit, the three preset views, projection, clipping. */
  cameraControls: '[data-tour="camera-controls"]',
} as const;

/**
 * Load an example and frame it.
 *
 * The zoom is deferred by a frame because the viewport measures the model to
 * fit it, and at the moment the store changes there is nothing laid out yet.
 */
export async function loadExample(id: string): Promise<void> {
  await modelStore.loadExample(id);
  resultsStore.clear();
  resultsStore.clear3D();
  setTimeout(() => window.dispatchEvent(new Event('stabileo-zoom-to-fit')), 50);
}

/** Solve, the way every other caller does — through the app's own event. */
export function solve(): void {
  window.dispatchEvent(new Event('stabileo-solve'));
}

/**
 * A note on `waitFor`, for whoever writes the next walkthrough.
 *
 * It is evaluated inside an effect, so it must read STORE state and nothing
 * else. Querying the DOM to find out whether a panel opened looks like it
 * works — the value is right the first time it is asked — and then never
 * changes, because nothing tells the effect to ask again. Two steps were
 * written that way and both hung with the reader staring at a condition they
 * had already satisfied.
 */

/** Whether the model on screen has been solved, in whichever mode it is in. */
export function hasResults(): boolean {
  return uiStore.analysisMode === '3d'
    ? resultsStore.results3D !== null
    : resultsStore.results !== null;
}

/** Put the app in a dimension. Loading a 3D example already does this; this is for the rest. */
export function setDimension(d: '2d' | '3d'): void {
  uiStore.analysisMode = d;
  setTimeout(() => window.dispatchEvent(new Event('stabileo-zoom-to-fit')), 80);
}

/**
 * Start from nothing.
 *
 * The modelling demo builds a beam from an empty canvas, and starting on
 * whatever the user had open would make its first instruction — "place a
 * node" — land on top of an existing structure.
 */
export function clearModel(): void {
  modelStore.clear();
  resultsStore.clear();
  resultsStore.clear3D();
}

/** Arm a drawing tool, as the ribbon command would. */
export function armTool(tool: 'node' | 'element' | 'support' | 'load' | 'select' | 'pan'): void {
  uiStore.currentTool = tool;
}

/**
 * Open a right-hand panel.
 *
 * A step that points at a button inside the Advanced panel has nothing to
 * point at while the panel is shut — the audit caught exactly that on two
 * walkthroughs, where the spotlight was aimed at a selector that did not
 * exist yet.
 */
export function openPanel(panel: 'advanced' | 'settings' | 'project' | 'results' | 'data' | 'selection'): void {
  window.dispatchEvent(new CustomEvent('stabileo-open-panel', { detail: panel }));
}

/**
 * Open one of the phone ribbon's cluster menus, or close them with `null`.
 *
 * Same reasoning as `openPanel`: a step pointing at a diagram command has
 * nothing to point at while the Results menu is shut, and on a phone that menu
 * is shut by default. Reaching into the ribbon's own state from a step
 * definition would put a piece of the shell's layout inside a data structure
 * that describes tour cards, so it goes through an event like everything else.
 *
 * A no-op on a desktop, where the commands are on the row and there is no
 * cluster to open — so a step can call it unconditionally.
 */
export function openCluster(id: 'results' | null): void {
  window.dispatchEvent(new CustomEvent('stabileo-open-cluster', { detail: id }));
}

/**
 * Where to put the card when the step is ABOUT the drawing.
 *
 * A results step spotlights its ribbon command, and a card placed under that
 * command lands in the middle of the canvas — on top of the very diagram the
 * card is describing. "Where the frame bends hardest" reads badly over a card
 * covering the place where it bends hardest.
 *
 * Bottom-left is the corner a 2D diagram rarely reaches, and it is clear of
 * the right-hand panel too.
 */
export function asideCard(): { x: number; y: number } {
  const h = typeof window === 'undefined' ? 900 : window.innerHeight;
  return { x: 24, y: Math.max(120, h - 300) };
}

/**
 * Counts the demos wait on, so a step can require "two nodes exist".
 *
 * Each one touches `modelVersion` before reading the collection, and that is
 * not decoration. These are read inside the overlay's auto-advance effect, and
 * the collections are Maps: adding a node calls `.set()`, which this codebase
 * documents as not reliably waking a reader. The step's condition became true
 * and nothing re-evaluated it — the reader placed both nodes and the
 * walkthrough sat there, which is precisely how it was reported.
 */
const version = () => { void modelStore.modelVersion; };

export const count = {
  nodes: () => { version(); return modelStore.nodes.size; },
  elements: () => { version(); return modelStore.elements.size; },
  supports: () => { version(); return modelStore.supports.size; },
  loads: () => { version(); return modelStore.loads.length; },
};
