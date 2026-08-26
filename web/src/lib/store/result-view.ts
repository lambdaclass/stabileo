/**
 * result-view.ts — WHICH quantity is on screen, and HOW it is drawn.
 *
 * # Two questions that had become one
 *
 * `diagramType` answers both at once. `'axial'` means the axial force drawn as
 * a diagram; `'axialColor'` means the same quantity drawn as member colour;
 * `'colorMap'` means some quantity — named separately in `colorMapKind` — drawn
 * as a heat map. Three encodings for two independent facts.
 *
 * That worked while member colour existed only for axial. It stops working the
 * moment every quantity can be shown three ways, because every reader of
 * `diagramType` then has to know all the encodings to answer "what is the user
 * actually looking at" — the ribbon needs it to light the right command, the
 * results panel needs it to offer the right choices, and each was deriving it
 * separately.
 *
 * So the pair is read and written through here. Nothing else needs to know
 * that member colour is spelled `axialColor` while a heat map is spelled
 * `colorMap` plus a second field.
 *
 * # Why not just add a field
 *
 * Because `diagramType` is what the viewports switch on, what the store
 * persists, and what a saved model carries. A parallel field would be a second
 * source of truth for the same question and would drift from it — which is the
 * defect this codebase has already paid for more than once.
 */

import { resultsStore } from './results.svelte';
import { showDiagram } from './view-mode';

/** A quantity a member carries, as the ribbon names it. */
export type ResultQuantity =
  | 'axial' | 'moment' | 'shear'                      // 2D
  | 'momentY' | 'momentZ' | 'shearY' | 'shearZ' | 'torsion';  // 3D

/** How that quantity is being drawn. */
export type Representation = 'diagram' | 'memberColour' | 'colourMap';

/**
 * Member colour is red/blue by SIGN — tension or compression — which only
 * means something for a quantity that has a structural sign convention a
 * reader recognises at a glance. That is axial force; a moment's sign is a
 * convention about which fibre is in tension, and painting a beam red for
 * "hogging" would invite exactly the wrong reading.
 */
const SIGNED_QUANTITIES: ReadonlySet<ResultQuantity> = new Set(['axial']);

/** Every representation available for a quantity, in the order they are offered. */
export function representationsFor(q: ResultQuantity): Representation[] {
  return SIGNED_QUANTITIES.has(q)
    ? ['diagram', 'memberColour', 'colourMap']
    : ['diagram', 'colourMap'];
}

/**
 * The quantity currently on screen, or null when what is shown is not one —
 * the deformed shape, a mode shape, a stress-ratio map, nothing at all.
 */
export function activeQuantity(): ResultQuantity | null {
  const dt = resultsStore.diagramType;
  if (dt === 'axialColor') return 'axial';
  if (dt === 'colorMap') {
    const kind = resultsStore.colorMapKind;
    return isQuantity(kind) ? kind : null;
  }
  return isQuantity(dt) ? dt : null;
}

/** How the active quantity is drawn, or null when none is active. */
export function activeRepresentation(): Representation | null {
  const dt = resultsStore.diagramType;
  if (dt === 'axialColor') return 'memberColour';
  if (dt === 'colorMap') return isQuantity(resultsStore.colorMapKind) ? 'colourMap' : null;
  return isQuantity(dt) ? 'diagram' : null;
}

/**
 * Show a quantity in a given representation.
 *
 * Routed through `showDiagram` rather than assigning `diagramType`, so picking
 * a result still disarms an editing tool — the rule that keeps "you are
 * drawing on a moment diagram" from being claimed by the interface.
 */
export function showQuantityAs(q: ResultQuantity, how: Representation): void {
  if (how === 'colourMap') {
    resultsStore.colorMapKind = q as never;
    showDiagram('colorMap');
    return;
  }
  if (how === 'memberColour' && SIGNED_QUANTITIES.has(q)) {
    showDiagram('axialColor' as never);
    return;
  }
  showDiagram(q as never);
}

/**
 * Whether a `diagramType`/`colorMapKind` value names one of the quantities.
 *
 * `colorMapKind` also carries `stressRatio`, `vonMises` and the shell contours,
 * which are derived measures rather than internal forces: they are chosen
 * elsewhere, have their own scales, and must not appear in a per-quantity
 * selector.
 */
function isQuantity(v: string): v is ResultQuantity {
  return v === 'axial' || v === 'moment' || v === 'shear'
    || v === 'momentY' || v === 'momentZ'
    || v === 'shearY' || v === 'shearZ' || v === 'torsion';
}

/**
 * Whether the ribbon command for `diagram` should light.
 *
 * A command that names a QUANTITY lights whenever that quantity is on screen,
 * in any representation. Without this the ribbon went dark the moment a user
 * switched a diagram to a heat map, as if nothing were being shown.
 *
 * A command that names a NON-quantity view — the deformed shape, a mode shape
 * — has no representations to unify, so it lights only while exactly that view
 * is on screen. (Recognising quantities alone left Deformed permanently dark:
 * `activeQuantity()` is null for it, by the tests above.)
 */
export function commandShowsQuantity(diagram: string): boolean {
  if (!isQuantity(diagram)) return resultsStore.diagramType === diagram;
  const active = activeQuantity();
  if (active === null) return false;
  if (diagram === 'axial') return active === 'axial';
  return diagram === active;
}

// ─────────────────────────────────────────────────────────────────────
// Stress measures
// ─────────────────────────────────────────────────────────────────────

/**
 * The measures computed FROM the internal forces rather than being one.
 *
 * They belong to no ribbon command that names a force, because each of them
 * combines several: Von Mises folds normal and shear together, and the
 * utilisation divides that by the yield strength. So they get a command of
 * their own, and the panel chooses between them.
 *
 * Offered because the section-stress evaluation already produces all four —
 * naming them costs nothing, and normal and shear SEPARATELY are what answer
 * "is this member governed by bending or by shear", a question Von Mises
 * deliberately blurs by design.
 */
export type StressMeasure = 'stressRatio' | 'vonMises' | 'sigmaMax' | 'tauMax';

export const STRESS_MEASURES: StressMeasure[] = ['stressRatio', 'vonMises', 'sigmaMax', 'tauMax'];

/** The measure being painted, or null when the map is showing an internal force. */
export function activeStressMeasure(): StressMeasure | null {
  if (resultsStore.diagramType !== 'colorMap') return null;
  const k = resultsStore.colorMapKind;
  return (STRESS_MEASURES as string[]).includes(k) ? k as StressMeasure : null;
}

/**
 * Everything the measure selector can be showing: the four section-stress
 * measures AND the shell contours.
 *
 * The shells are chosen in the same select, so a gate that knows only the
 * stress measures unmounts the select the moment a shell contour is picked —
 * the control vanishing as a consequence of using it — and leaves the ribbon
 * command dark over a picture it claims to own.
 */
export type MapMeasure = StressMeasure | 'shellVonMises' | 'shellBending';

/** The measure on screen, shells included, or null for an internal force. */
export function activeMapMeasure(): MapMeasure | null {
  if (resultsStore.diagramType !== 'colorMap') return null;
  const k = resultsStore.colorMapKind;
  return (STRESS_MEASURES as string[]).includes(k) || k === 'shellVonMises' || k === 'shellBending'
    ? k as MapMeasure : null;
}

/**
 * Paint a stress measure over the members.
 *
 * Defaults to utilisation — sigma over fy — because it is the one measure that
 * answers a question on its own: a number near 1 means the member is at its
 * limit, whatever its steel and whatever its section. The others are absolute
 * stresses, and an absolute stress means nothing until you know what it is
 * being compared against.
 */
export function showStressMap(measure: MapMeasure = 'stressRatio'): void {
  resultsStore.colorMapKind = measure;
  showDiagram('colorMap');
}

/**
 * A name for exactly what is painted right now.
 *
 * Used to pair the colour-scale legend with its picture. The legend's numbers
 * are published by the drawing code, which only runs while it is drawing —
 * change to a bending diagram and the last map's maximum is still sitting in
 * the store with nothing on screen to explain it. Comparing this signature at
 * render time makes that stale value unusable rather than merely discouraged:
 * there is no path, present or future, that can leave a legend behind.
 */
export function colourScaleSource(): string {
  const dt = resultsStore.diagramType;
  return dt === 'colorMap' ? `colorMap:${resultsStore.colorMapKind}` : String(dt);
}

/**
 * Whether a colour scale is genuinely on screen right now.
 *
 * Both the legend and the switch that shows it ask this, and they have to
 * agree: a checkbox offering to show a legend that cannot appear is a control
 * that does nothing, which reads as a bug in the checkbox.
 */
export function hasLiveColourScale(): boolean {
  const s = resultsStore.colourScale;
  return !!s && s.source === colourScaleSource();
}
