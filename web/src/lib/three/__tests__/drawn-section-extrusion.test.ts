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

import { createElementGroup } from '../create-element-mesh';
import { computeSectionProperties } from '../../data/section-shapes';
import { variableSectionPlan } from '../../section/variable';

d('members of variable section in the 3D view', () => {
  it('a rectangle from 0,8 to 0,3 m deep is one loft, 0,8 m at end I and 0,3 m at end J', () => {
    const rect = (h: number) => {
      const params = { b: 0.2, h };
      return modelStore.addSection(toSectionFields({ kind: 'built', name: `R${h}`, shapeType: 'concrete-rect', params, props: computeSectionProperties('concrete-rect', params)!, rotationDeg: 0 }, 0) as never);
    };
    const i0 = rect(0.8), i1 = rect(0.3);
    const plan = variableSectionPlan(modelStore.sections.get(i0), modelStore.sections.get(i1));
    if (!plan.ok) throw new Error('plan ' + plan.problem);
    const g = createElementGroup({ x: 0, y: 0, z: 0 }, { x: 8, y: 0, z: 0 }, {
      elementId: 1, elementType: 'frame', renderMode: 'sections', section: plan.at(0), sectionAt: plan.at, variableSegments: 12,
    });
    const mesh = g.children.find((c) => (c as THREE.Mesh).userData?.variableSection) as THREE.Mesh;
    expect(mesh).toBeDefined();
    const pos = mesh.geometry.getAttribute('position');
    const at = (z: number) => {
      const ys: number[] = [];
      for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getZ(i) - z) < 1e-6) ys.push(pos.getY(i));
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(at(0)).toBeCloseTo(0.8, 6);
    expect(at(8)).toBeCloseTo(0.3, 6);
    expect(at(4)).toBeCloseTo(0.55, 6);
  });
});
