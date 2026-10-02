/**
 * The model with sections draws a drawn section as it was drawn: the canonical outline, about the
 * centroid, holes inside the solids. It used to fall to the default branch and draw a plain I.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { toSectionFields } from '../../section/section-choice';
import { analyzeDrawn } from '../../section/drawn-properties';
import { catalogueOutline } from '../../section/canonical';
import { starterParts } from '../../section/drawn-starters';
import { hasCanonicalGeometryExport } from '../../engine/wasm-solver';
import { createSectionShapes } from '../section-profiles';
import type { DrawnSection } from '../../section/drawn';
import * as THREE from 'three';

const d = hasCanonicalGeometryExport() ? describe : describe.skip;

function add(drawn: DrawnSection): number {
  const p = analyzeDrawn(drawn, catalogueOutline).properties!;
  return modelStore.addSection(toSectionFields({ kind: 'drawn', name: 'D', drawn, props: { a: p.a, iy: p.iy, iz: p.iz, j: p.j, b: p.bbox[2] - p.bbox[0], h: p.bbox[3] - p.bbox[1] } }, 0) as never);
}
const area = (s: THREE.Shape) => {
  const { shape, holes } = s.extractPoints(1);
  return Math.abs(THREE.ShapeUtils.area(shape)) - holes.reduce((t, h) => t + Math.abs(THREE.ShapeUtils.area(h)), 0);
};

beforeEach(() => modelStore.clear());

d('drawn sections in the 3D view', () => {
  it('a cover-plated I is drawn with its plate, the area and depth of the drawing', () => {
    const id = add({ version: 1, parts: starterParts('coverPlated', catalogueOutline) });
    const sec = modelStore.sections.get(id)!;
    const shapes = createSectionShapes(sec);
    expect(shapes.length).toBeGreaterThan(0);
    const total = shapes.reduce((t, s) => t + area(s), 0);
    expect(Math.abs(total - sec.a) / sec.a).toBeLessThan(1e-3);
    const ys = shapes.flatMap((s) => s.getPoints().map((p) => p.y));
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(sec.h!, 6);
  });

  it('a box keeps its hole', () => {
    const id = add({ version: 1, parts: starterParts('box', catalogueOutline) });
    const sec = modelStore.sections.get(id)!;
    const shapes = createSectionShapes(sec);
    expect(shapes.some((s) => s.holes.length > 0)).toBe(true);
    expect(Math.abs(shapes.reduce((t, s) => t + area(s), 0) - sec.a) / sec.a).toBeLessThan(1e-3);
  });
});
