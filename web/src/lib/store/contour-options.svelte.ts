/**
 * How a shell contour is drawn: at the nodes (averaged) or at each element's centre, over the
 * range the results occupy or one typed in, smooth or in bands, and on the undeformed or the
 * deformed shape. A view setting: it is not saved with the project and does not touch results.
 *
 * Its own store rather than fields of `resultsStore`, which describes results, not how they are
 * painted.
 */
import type { ContourAt } from '../engine/contour-scale';
export type { ContourAt };

function createContourOptions() {
  let at = $state<ContourAt>('nodes');
  let auto = $state(true);
  let min = $state(0);
  let max = $state(0);
  /** 0: a smooth ramp. Otherwise this many bands of one colour each. */
  let bands = $state(0);
  let onDeformed = $state(false);

  return {
    get at() { return at; }, set at(v: ContourAt) { at = v; },
    get auto() { return auto; }, set auto(v: boolean) { auto = v; },
    get min() { return min; }, set min(v: number) { min = v; },
    get max() { return max; }, set max(v: number) { max = v; },
    get bands() { return bands; }, set bands(v: number) { bands = Math.max(0, Math.floor(v)); },
    get onDeformed() { return onDeformed; }, set onDeformed(v: boolean) { onDeformed = v; },
    /** Reads every option, for effects that repaint when any changes. */
    get signature() { return `${at}|${auto}|${min}|${max}|${bands}|${onDeformed}`; },
  };
}

export const contourOptions = createContourOptions();
