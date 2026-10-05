/**
 * The section between the ends of a variable member, as geometry: only between two sections of one
 * kind (a template, a catalogue family), whatever their outlines' vertex counts; and each station
 * with the settings of its own pair.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { toSectionFields, type SectionChoice } from '../section-choice';
import { computeSectionProperties } from '../../data/section-shapes';
import { variableSectionPlan } from '../variable';
import { hasCanonicalGeometryExport } from '../../engine/wasm-solver';
import { catalogueOutline } from '../canonical';
import { analyzeDrawn } from '../drawn-properties';
import type { DrawnSection } from '../drawn';
import { ALL_PROFILES } from '../../data/steel-profiles';

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

  it('two templates or two catalogue families are refused, though their outlines count alike', () => {
    const built = (shapeType: string, params: Record<string, number>) =>
      modelStore.addSection(toSectionFields({ kind: 'built', name: shapeType, shapeType, params, props: computeSectionProperties(shapeType as never, params)!, rotationDeg: 0 } as never, 0) as never);
    const pairs: Array<[number, number]> = [
      [built('C-custom', { h: 0.2, b: 0.08, tw: 0.002, tf: 0.002, c: 0.02, tl: 0.002 }), built('I-custom', { h: 0.3, b: 0.2, tw: 0.01, tf: 0.015 })],
      [built('concrete-rect', { b: 0.2, h: 0.5 }), built('rect', { b: 0.2, h: 0.4 })],
      [built('circular', { d: 0.3 }), built('concrete-circular', { d: 0.4 })],
      [built('T-custom', { h: 0.3, bf: 0.2, tw: 0.01, tf: 0.015 }), built('U-custom', { h: 0.3, b: 0.1, tw: 0.01, tf: 0.015 })],
    ];
    for (const [a, b] of pairs) expect(variableSectionPlan(sec(a), sec(b))).toEqual({ ok: false, problem: 'makeUp' });

    // One profile of every catalogue family: no two families blend, the IPE and the W, the C and
    // the UPN, the RHS and the SHS included; two of one family still do.
    const named = (n: string) => modelStore.addSection({ name: n, a: 0.001, iz: 1e-6 } as never);
    const first = new Map<string, number>();
    for (const p of ALL_PROFILES) if (!first.has(p.family)) first.set(p.family, named(p.name));
    const outlined = [...first].filter(([, id]) => sec(id).canonical?.kind === 'geometry-backed');
    expect(outlined.length).toBeGreaterThan(10);
    const accepted = outlined.flatMap(([fa, a]) => outlined.filter(([fb]) => fa < fb).filter(([, b]) => variableSectionPlan(sec(a), sec(b)).ok).map(([fb]) => `${fa}>${fb}`));
    expect(accepted).toEqual([]);
    expect(variableSectionPlan(sec(named('HEB 200')), sec(named('HEB 400'))).ok).toBe(true);
  });

  it('two pairs alike in outline but not in shear areas or modular ratio do not share a station', () => {
    const a1 = rect(0.3, 0.3), b1 = rect(0.3, 0.6), a2 = rect(0.3, 0.3), b2 = rect(0.3, 0.6);
    modelStore.updateSection(a2, { shearAreas: { basis: 'declared', asY: 0.01, asZ: 0.02 } } as never);
    const p1 = variableSectionPlan(sec(a1), sec(b1)), p2 = variableSectionPlan(sec(a2), sec(b2));
    if (!p1.ok || !p2.ok) throw new Error('both pairs blend');
    expect(p1.at(0.5).shearAreas).toBeUndefined();
    expect(p2.at(0.5).shearAreas).toEqual({ basis: 'declared', asY: 0.01, asZ: 0.02 });

    const steel = [...modelStore.materials.values()][0]!;
    const concrete = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 24 } as never);
    const filled = (dd: number, n: number): DrawnSection => ({ version: 1, refMaterialId: steel.id, parts: [
      { id: 1, shape: { kind: 'tube', d: dd, t: 0.006 }, at: [0, 0], rotationDeg: 0 },
      { id: 2, shape: { kind: 'circle', d: dd - 0.012 }, at: [0, 0], rotationDeg: 0, materialId: concrete, ratio: { e: n, g: n } },
    ] });
    const ids = [drawn(filled(0.2, 0.135), 'A'), drawn(filled(0.4, 0.135), 'B'), drawn(filled(0.2, 0.2), 'C'), drawn(filled(0.4, 0.2), 'D')];
    const q1 = variableSectionPlan(sec(ids[0]!), sec(ids[1]!)), q2 = variableSectionPlan(sec(ids[2]!), sec(ids[3]!));
    if (!q1.ok || !q2.ok) throw new Error('both pairs blend');
    expect(q2.at(0.5).drawn!.parts[1]!.ratio!.e).toBeCloseTo(0.2, 12);
    expect(q2.at(0.5).iy!).toBeGreaterThan(q1.at(0.5).iy!);
  });

  it('the same section at both ends, or differently rotated ones, is no variable member', () => {
    const a = rect(0.3, 0.3);
    expect(variableSectionPlan(sec(a), sec(a))).toEqual({ ok: false, problem: 'same' });
    const b = rect(0.3, 0.6);
    modelStore.updateSection(b, { rotation: 90 } as never);
    expect(variableSectionPlan(sec(a), sec(b))).toEqual({ ok: false, problem: 'rotation' });
  });
});
