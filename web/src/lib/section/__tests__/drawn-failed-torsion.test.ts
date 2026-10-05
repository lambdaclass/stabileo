/**
 * A drawn section whose torsion solve fails has no J — not the J of what it was before.
 *
 * The store strips the derived scalars from an edit of a geometry-backed section and mirrored the
 * resolved J back only when there was one, so a re-drawn section whose Saint-Venant solve failed
 * kept the previous drawing's J, and a browsing resolve handed it out as computed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const flags = vi.hoisted(() => ({ failTorsion: false }));
vi.mock('../../engine/wasm-solver', async (orig) => {
  const actual = await orig<typeof import('../../engine/wasm-solver')>();
  return {
    ...actual,
    analyzeSectionTorsion: (...args: Parameters<typeof actual.analyzeSectionTorsion>) => {
      if (flags.failTorsion) throw new Error('torsion failed');
      return actual.analyzeSectionTorsion(...args);
    },
  };
});

import { modelStore } from '../../store/model.svelte';
import { toSectionFields, type SectionChoice } from '../section-choice';
import { analyzeDrawn } from '../drawn-properties';
import { catalogueOutline } from '../canonical';
import { hasCanonicalGeometryExport } from '../../engine/wasm-solver';
import { starterParts } from '../drawn-starters';
import { resolveSectionState } from '../state';
import type { DrawnSection } from '../drawn';

const d = hasCanonicalGeometryExport() ? describe : describe.skip;

function choiceOf(drawn: DrawnSection): SectionChoice {
  const p = analyzeDrawn(drawn, catalogueOutline).properties!;
  return { kind: 'drawn', name: 'D', drawn, props: { a: p.a, iy: p.iy, iz: p.iz, j: p.j, b: p.bbox[2] - p.bbox[0], h: p.bbox[3] - p.bbox[1] } };
}

beforeEach(() => { flags.failTorsion = false; modelStore.clear(); });

d('a drawn section whose J cannot be computed', () => {
  it('stores none, and is unavailable to the solver and to a browsing resolve', () => {
    const drawn: DrawnSection = { version: 1, parts: starterParts('weldedI', catalogueOutline) };
    const id = modelStore.addSection(toSectionFields(choiceOf(drawn), 0) as never);
    expect(modelStore.sections.get(id)!.j).toBeGreaterThan(0);

    flags.failTorsion = true;
    const thicker: DrawnSection = {
      ...drawn,
      parts: drawn.parts.map((p) => (p.id === 2 && p.shape.kind === 'rect' ? { ...p, shape: { ...p.shape, b: 0.016 } } : p)),
    };
    const choice = choiceOf(thicker);
    expect(choice.kind === 'drawn' && choice.props.j).toBeNull();
    modelStore.updateSection(id, toSectionFields(choice, 0) as never);

    const sec = modelStore.sections.get(id)!;
    expect(sec.j).toBeUndefined();
    expect(sec.canonical?.kind === 'geometry-backed' && [sec.canonical.j, sec.canonical.jProvenance]).toEqual([null, 'unavailable']);
    const browsing = resolveSectionState(sec);
    expect(browsing.kind === 'geometry-backed' && [browsing.j, browsing.jProvenance]).toEqual([null, 'unavailable']);
  });
});
