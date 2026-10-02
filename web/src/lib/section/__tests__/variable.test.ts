/** The section between the ends of a variable member, as geometry. */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { toSectionFields, type SectionChoice } from '../section-choice';
import { computeSectionProperties } from '../../data/section-shapes';
import { variableSectionPlan } from '../variable';
import { hasCanonicalGeometryExport } from '../../engine/wasm-solver';
import { catalogueOutline } from '../canonical';
import { analyzeDrawn } from '../drawn-properties';
import type { DrawnSection } from '../drawn';

const d = hasCanonicalGeometryExport() ? describe : describe.skip;
const rect = (b: number, h: number) => {
  const params = { b, h };
  const props = computeSectionProperties('concrete-rect', params)!;
  return modelStore.addSection(toSectionFields({ kind: 'built', name: `R${h}`, shapeType: 'concrete-rect', params, props, rotationDeg: 0 }, 0) as never);
};
const drawn = (dr: DrawnSection, name: string) => {
  const p = analyzeDrawn(dr, catalogueOutline).properties!;
  const c: SectionChoice = { kind: 'drawn', name, drawn: dr, props: { a: p.a, iy: p.iy, iz: p.iz, j: p.j, b: p.bbox[2] - p.bbox[0], h: p.bbox[3] - p.bbox[1] } };
  return modelStore.addSection(toSectionFields(c, 0) as never);
};
const sec = (id: number) => modelStore.sections.get(id)!;

beforeEach(() => modelStore.clear());

d('variable sections', () => {
  it('a rectangle from 300 to 600 mm: the middle is a 450 mm rectangle, not the mean of the inertias', () => {
    const a = rect(0.3, 0.3), b = rect(0.3, 0.6);
    const plan = variableSectionPlan(sec(a), sec(b));
    expect(plan.ok && plan.mode).toBe('outline');
    if (!plan.ok) return;
    const mid = plan.at(0.5);
    expect(mid.a).toBeCloseTo(0.3 * 0.45, 9);
    expect(mid.iy!).toBeCloseTo((0.3 * 0.45 ** 3) / 12, 9);
    expect(mid.iy! / sec(a).iy!).toBeCloseTo(3.375, 6);
    expect(plan.at(0)).toBe(sec(a));
    expect(plan.at(1)).toBe(sec(b));
    // Cached by the ends' geometry.
    expect(plan.at(0.5)).toBe(mid);
  });

  it('two catalogue profiles of one family go vertex by vertex; an I into a tube is refused', () => {
    const named = (n: string) => modelStore.addSection({ name: n, a: 0.001, iz: 1e-6 } as never);
    const p = variableSectionPlan(sec(named('IPE 300')), sec(named('IPE 600')));
    expect(p.ok).toBe(true);
    if (p.ok) {
      const m = p.at(0.5);
      expect(m.h!).toBeGreaterThan(0.3);
      expect(m.h!).toBeLessThan(0.6);
    }
    const chs = named('CHS 15.88x0.9');
    expect(variableSectionPlan(sec(named('IPE 300')), sec(chs))).toEqual({ ok: false, problem: 'makeUp' });
  });

  it('two drawings of the same parts blend part by part, keeping their materials', () => {
    const steel = [...modelStore.materials.values()][0]!;
    const concrete = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 24 } as never);
    const tube = (dd: number): DrawnSection => ({ version: 1, refMaterialId: steel.id, parts: [
      { id: 1, shape: { kind: 'tube', d: dd, t: 0.006 }, at: [0, 0], rotationDeg: 0 },
      { id: 2, shape: { kind: 'circle', d: dd - 0.012 }, at: [0, 0], rotationDeg: 0, materialId: concrete, ratio: { e: 0.135, g: 0.135 } },
    ] });
    const a = drawn(tube(0.2), 'T200'), b = drawn(tube(0.4), 'T400');
    const plan = variableSectionPlan(sec(a), sec(b));
    expect(plan.ok && plan.mode).toBe('parts');
    if (plan.ok) {
      const mid = plan.at(0.5);
      expect((mid.drawn!.parts[0]!.shape as { d: number }).d).toBeCloseTo(0.3, 9);
      expect(mid.drawn!.parts[1]!.materialId).toBe(concrete);
    }
  });

  it('the same section at both ends, or differently rotated ones, is no variable member', () => {
    const a = rect(0.3, 0.3);
    expect(variableSectionPlan(sec(a), sec(a))).toEqual({ ok: false, problem: 'same' });
    const b = rect(0.3, 0.6);
    modelStore.updateSection(b, { rotation: 90 } as never);
    expect(variableSectionPlan(sec(a), sec(b))).toEqual({ ok: false, problem: 'rotation' });
  });
});
