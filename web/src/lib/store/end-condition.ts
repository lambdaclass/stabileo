/**
 * One end of a member as a single choice: free, hinged, sliding, or both.
 *
 * The model stores a hinge (a moment release) and a slide (a translation
 * release) independently, which is right — they release different things and
 * can coexist. Every control that asks about an end asks about it as a whole,
 * because that is how someone thinks of it, so the two fields are folded into
 * one name here and unfolded on the way back. The element editor, the Explore
 * panel and the members table all use this, so an end reads the same in each.
 */
import { NO_RELEASE, type Release, type SlideAxisMode } from './model.svelte';
import { isHinged, releaseAfterEdit } from './end-release';

export type EndKind = 'none' | 'hinge' | 'slideX' | 'slideZ' | 'hingeSlideX' | 'hingeSlideZ';

export const END_KINDS: readonly EndKind[] = ['none', 'hinge', 'slideX', 'slideZ', 'hingeSlideX', 'hingeSlideZ'];

export const END_KIND_LABEL: Record<EndKind, string> = {
  none: 'editor.relNone',
  hinge: 'editor.relHinge',
  slideX: 'editor.relSlideX',
  slideZ: 'editor.relSlideZ',
  hingeSlideX: 'editor.relHingeSlideX',
  hingeSlideZ: 'editor.relHingeSlideZ',
};

export function endKindOf(rel: Release | undefined, is3D: boolean): EndKind {
  const hinge = isHinged(rel, is3D);
  const slide = rel?.slide;
  if (!slide) return hinge ? 'hinge' : 'none';
  if (slide === 'x') return hinge ? 'hingeSlideX' : 'slideX';
  return hinge ? 'hingeSlideZ' : 'slideZ';
}

export function kindHasSlide(kind: EndKind): boolean {
  return kind !== 'none' && kind !== 'hinge';
}

/**
 * The end's release after choosing `kind` (and, for a slide, its axis). The
 * moment flags are rewritten only when the hinge itself changes, so an end
 * that releases one moment only keeps doing so when just its slide is edited.
 */
export function releaseWithKind(rel: Release | undefined, kind: EndKind, axis: SlideAxisMode, is3D: boolean): Release {
  const hinge = kind === 'hinge' || kind.startsWith('hingeSlide');
  const out = releaseAfterEdit(rel ?? NO_RELEASE, hinge, is3D);
  if (!kindHasSlide(kind)) {
    delete out.slide;
    delete out.slideAxis;
  } else {
    out.slide = kind.endsWith('X') ? 'x' : 'z';
    out.slideAxis = axis;
  }
  return out;
}

/** Kinds a control offers: a space solve refuses slides, so in 3D only one already set is kept. */
export function offeredKinds(current: EndKind, is3D: boolean): EndKind[] {
  return END_KINDS.filter((k) => !is3D || !kindHasSlide(k) || k === current);
}
