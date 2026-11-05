/**
 * The plastic panel's layer of the plane canvas, and its taps: what Viewport
 * calls while the plastic collapse is on screen.
 */
import { plasticCourse } from '../store/plastic-course.svelte';
import { resultsStore } from '../store/results.svelte';
import { drawDiagrams } from './draw-diagrams';
import { drawMechanism, drawPlacedHinges, distributionResults, type CourseDrawContext } from './draw-plastic-course';
import { pickHinge } from '../engine/plastic/pick';

type DiagramContext = Parameters<typeof drawDiagrams>[2];

/** Draws the mechanism or the user's mechanism when the panel asks for one; false leaves the step picture to the caller. */
export function drawPlasticCourseLayer(dc: CourseDrawContext, diagram: DiagramContext, opts: { scale: number; values: boolean; towardLocal: boolean }): boolean {
  const view = plasticCourse.view;
  if (view === 'steps') return false;
  if (view === 'mechanism') {
    const m = plasticCourse.collapse;
    if (m) drawMechanism(dc, m);
    return true;
  }
  const input = plasticCourse.input;
  if (!input) return false;
  const u = plasticCourse.user;
  const v = u?.verdict;
  if (u && v?.kind === 'mechanism' && plasticCourse.userShows === 'moments' && v.dist) {
    drawDiagrams(distributionResults(input, u.lm, v.dist.M, v.mech.lambda), 'moment', diagram, opts.scale, opts.values, undefined, undefined, opts.towardLocal);
  } else if (u?.view && (v?.kind === 'mechanism' || v?.kind === 'noWork')) {
    drawMechanism(dc, u.view);
  }
  drawPlacedHinges(dc, input, plasticCourse.hinges, new Set(u?.ignored.map((x) => x.hinge) ?? []));
  return true;
}

/** A tap while hinges are being placed: puts one there, or takes away the one already there. */
export function tapPlasticHinge(x: number, z: number, tol: number): void {
  const input = plasticCourse.input;
  if (!input) return;
  const snaps = (resultsStore.plasticResult?.hinges ?? []).map((h) => ({ member: h.elementId, t: h.position ?? (h.end === 'start' ? 0 : 1) }));
  const h = pickHinge(input, { x, z }, tol, snaps);
  if (h) plasticCourse.toggleHinge(h);
}
