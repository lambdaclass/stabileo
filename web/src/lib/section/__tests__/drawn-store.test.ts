/**
 * A drawn section through the store: created from the modal's choice, reopened and edited,
 * solved per piece, stressed per material, and carried by the model code.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { toSectionFields, type SectionChoice } from '../section-choice';
import { analyzeDrawn } from '../drawn-properties';
import { catalogueOutline } from '../canonical';
import { supportsDetailedAnalysis } from '../drawing';
import { sectionStressModel } from '../../engine/member-stresses';
import { modelToCode, codeToModel } from '../../model/code/format';
import { hasCanonicalGeometryExport } from '../../engine/wasm-solver';
import { starterParts } from '../drawn-starters';
import { sectionShearAreas } from '../shear-areas';
import type { DrawnSection } from '../drawn';

const d = hasCanonicalGeometryExport() ? describe : describe.skip;

function choiceOf(drawn: DrawnSection, name = 'Drawn'): SectionChoice {
  const p = analyzeDrawn(drawn, catalogueOutline).properties!;
  return { kind: 'drawn', name, drawn, props: { a: p.a, iy: p.iy, iz: p.iz, j: p.j, b: p.bbox[2] - p.bbox[0], h: p.bbox[3] - p.bbox[1] } };
}
const add = (c: SectionChoice) => modelStore.addSection(toSectionFields(c, 0) as never);

beforeEach(() => modelStore.clear());

d('drawn sections in the model', () => {
  it('a welded I from the modal is geometry-backed with its Saint-Venant J', () => {
    const drawn: DrawnSection = { version: 1, parts: starterParts('weldedI', catalogueOutline) };
    const id = add(choiceOf(drawn));
    const sec = modelStore.sections.get(id)!;
    expect(sec.canonical?.kind).toBe('geometry-backed');
    if (sec.canonical?.kind !== 'geometry-backed') return;
    expect(sec.canonical.jProvenance).toBe('saintVenant');
    const direct = analyzeDrawn(drawn, catalogueOutline).properties!;
    expect(sec.canonical.a).toBeCloseTo(direct.a, 12);
    expect(sec.canonical.j!).toBeCloseTo(direct.j!, 12);
    expect(sec.a).toBeCloseTo(direct.a, 12);
    expect(supportsDetailedAnalysis(sec)).toBe(true);
    // A welded I of three plates is an I to the steel checks, with its plates' thicknesses.
    expect(sec.shape).toBe('I');
    expect(sec.tw).toBeCloseTo(0.008, 12);
  });

  it('editing the parts re-derives the properties; a catalogue pick afterwards drops the parts', () => {
    const drawn: DrawnSection = { version: 1, parts: starterParts('weldedI', catalogueOutline) };
    const id = add(choiceOf(drawn));
    const a0 = modelStore.sections.get(id)!.a;
    const thicker: DrawnSection = { ...drawn, parts: drawn.parts.map((p) => (p.id === 2 && p.shape.kind === 'rect' ? { ...p, shape: { ...p.shape, b: 0.016 } } : p)) };
    modelStore.updateSection(id, toSectionFields(choiceOf(thicker), 0) as never);
    const a1 = modelStore.sections.get(id)!.a;
    expect(a1 - a0).toBeCloseTo(0.008 * (0.5 - 0.032), 9);
    modelStore.updateSection(id, toSectionFields({ kind: 'standard', spec: { profileName: 'IPE 300', arrangement: 'single', gapMm: 0, rotationDeg: 0 } }, 0) as never);
    const after = modelStore.sections.get(id)!;
    expect(after.drawn).toBeUndefined();
    expect(after.a * 1e4).toBeCloseTo(53.8, 0);
  });

  it('two materials: transformed properties, no homogeneous stress panel, per-material member stress', () => {
    const steel = modelStore.materials.values().next().value!;
    const concreteId = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 24 } as never);
    const n = 27000 / steel.e;
    const parts = starterParts('filledTube', catalogueOutline).map((p) => (p.id === 2 ? { ...p, materialId: concreteId, ratio: { e: n, g: n } } : p));
    const drawn: DrawnSection = { version: 1, parts, refMaterialId: steel.id };
    const id = add(choiceOf(drawn));
    const sec = modelStore.sections.get(id)!;
    expect(sec.canonical?.kind === 'geometry-backed' && sec.canonical.composite).toBe(true);
    expect(supportsDetailedAnalysis(sec)).toBe(false);
    const d0 = 0.2191, t = 0.0063;
    const steelA = (Math.PI / 4) * (d0 ** 2 - (d0 - 2 * t) ** 2), coreA = (Math.PI / 4) * (d0 - 2 * t) ** 2;
    expect(Math.abs(sec.a - (steelA + n * coreA)) / sec.a).toBeLessThan(2e-3);
    // Pure compression: the concrete is at n times the steel's stress.
    const model = sectionStressModel(sec)!;
    const r = model(-1000, 0, 0);
    expect(r.min).toBeCloseTo(-1000 / sec.a / 1000, 9);
    expect(r.max).toBeCloseTo((n * -1000) / sec.a / 1000, 9);
  });

  it('a drawn section on the geometric basis shears with the areas of its own outline', () => {
    const drawn: DrawnSection = { version: 1, parts: starterParts('doubleAngle', catalogueOutline) };
    const sec = { ...toSectionFields(choiceOf(drawn), 0)!, id: 1, shearAreas: { basis: 'geometry' } } as never;
    const sa = sectionShearAreas(sec)!;
    const p = analyzeDrawn(drawn, catalogueOutline).properties!;
    // Two separate angles are two pieces: no single shear-flow solve, so no area at all.
    expect(p.shearAreas).toBeNull();
    expect(sa).toBeNull();
    const one: DrawnSection = { version: 1, parts: starterParts('lippedC', catalogueOutline) };
    const c = sectionShearAreas({ ...toSectionFields(choiceOf(one), 0)!, id: 2, shearAreas: { basis: 'geometry' } } as never)!;
    const pc = analyzeDrawn(one, catalogueOutline).properties!;
    expect(c.asY).toBeCloseTo(pc.shearAreas!.asY, 12);
    // The web carries the shear along the depth: about h·t, and well short of the whole area.
    expect(c.asY / (0.2 * 0.002)).toBeGreaterThan(0.7);
    expect(c.asY).toBeLessThan(pc.a);
  });

  it('a filled tube twists with the tube and the core each at its own G', () => {
    const steel = modelStore.materials.values().next().value!;
    const n = 0.12;
    const parts = starterParts('filledTube', catalogueOutline).map((p) => (p.id === 2 ? { ...p, materialId: steel.id + 99, ratio: { e: n, g: n } } : p));
    const p = analyzeDrawn({ version: 1, parts, refMaterialId: steel.id }, catalogueOutline).properties!;
    const d0 = 0.2191, di = d0 - 2 * 0.0063;
    // For concentric circles J is the polar moment, so the homogenised J is exact.
    const expected = (Math.PI / 32) * (d0 ** 4 - di ** 4) + n * (Math.PI / 32) * di ** 4;
    expect(Math.abs(p.j! - expected) / expected).toBeLessThan(5e-3);
  });

  it('the model code carries the parts and reads them back', () => {
    const drawn: DrawnSection = { version: 1, parts: starterParts('doubleAngle', catalogueOutline) };
    const id = add(choiceOf(drawn, '2L 75x8'));
    const code = modelToCode(modelStore.snapshot());
    const back = codeToModel(code);
    expect(back.errors).toEqual([]);
    const sec = (back.snapshot!.sections as Array<[number, { drawn?: DrawnSection }]>).find(([k]) => k === id)![1];
    expect(sec.drawn).toEqual(JSON.parse(JSON.stringify(drawn)));
  });
});
