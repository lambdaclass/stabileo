/**
 * The project's design data, each datum where it is used: design, check, detailing, the shell
 * families, footings, templates. And the table its covers are held against.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore, resultsStore } from '../index';
import { verificationStore } from '../verification.svelte';
import { designData, designContextOptions, patchDesignData, setDesignData, verifyOptions } from '../design-data';
import { coversUnderMinimum, concreteFc, defaultDesignData, migrateDesignData, minimumCover, withCirsocCovers } from '../../model/design-data';
import { buildMemberContext, DEFAULT_COVER, DEFAULT_REBAR_FY, DEFAULT_STIRRUP_DIA } from '../../engine/design/member-context';
import { buildRegionOptions } from '../../engine/design/candidate-enumerate-beam';
import { syntheticBeamContext } from '../../engine/design/__tests__/helpers';
import { resolveConcreteProperties, wallBarDiameterMm } from '../detailing-project-inputs';
import { applyTemplate, templateFromProject } from '../office-templates';

const model = {
  nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: 3 }], [3, { id: 3, x: 5, y: 0, z: 3 }]]),
  elements: new Map([
    [1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, type: 'frame' }],
    [2, { id: 2, nodeI: 2, nodeJ: 3, sectionId: 1, materialId: 1, type: 'frame' }],
  ]),
  sections: new Map([[1, { id: 1, name: '30x50', b: 0.3, h: 0.5 }]]),
  materials: new Map([[1, { id: 1, name: 'H-30', fy: 30, fc: 30 }]]),
} as never;

describe('the project design data', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('states nothing: the values the code always used', () => {
    expect(designContextOptions()).toMatchObject({ stirrupDia: DEFAULT_STIRRUP_DIA, rebarFy: DEFAULT_REBAR_FY });
    expect(designContextOptions().coverFor('beam')).toBe(DEFAULT_COVER);
    expect(verifyOptions()).toEqual({ rebarFy: 420, cover: 0.025, columnCover: 0.025, stirrupDia: 8 });
    expect(wallBarDiameterMm()).toBe(12);
  });

  it('the steel and the covers reach the member contexts, a column\'s and a beam\'s apart', () => {
    patchDesignData({ rebarFy: 500, stirrupDiaMm: 10, covers: { ...defaultDesignData().covers, beam: 0.03, column: 0.04 } });
    const o = designContextOptions();
    const beam = buildMemberContext(2, model, o)!, col = buildMemberContext(1, model, o)!;
    expect(beam.material).toMatchObject({ fy: 500, cover: 0.03, stirrupDia: 10, fc: 30 });
    expect(col.material.cover).toBe(0.04);
  });

  it('the diameters it allows are the only ones the design chooses from', () => {
    const ctx = syntheticBeamContext();
    const all = new Set(buildRegionOptions(ctx, 8e-4).map((x) => x.dia));
    expect(all.size).toBeGreaterThan(1);
    const only = buildRegionOptions(syntheticBeamContext({ material: { ...ctx.material, longDiametersMm: [16] } }), 8e-4);
    expect(only.length).toBeGreaterThan(0);
    expect(new Set(only.map((x) => x.dia))).toEqual(new Set([16]));
  });

  it('the check takes the steel and the covers', () => {
    patchDesignData({ rebarFy: 500, covers: { ...defaultDesignData().covers, beam: 0.035, column: 0.045 } });
    expect(verifyOptions()).toEqual({ rebarFy: 500, cover: 0.035, columnCover: 0.045, stirrupDia: 8 });
  });

  it('the slab, wall and footing families take the steel, the slab cover and the wall bar, and an f\'c only from concretes', () => {
    modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
    patchDesignData({ rebarFy: 500, wallBarDiaMm: 10, covers: { ...defaultDesignData().covers, slab: 0.02 } });
    // The model's default A36 (fy 250) is not a concrete and does not set f'c.
    expect(resolveConcreteProperties()).toEqual({ fc: 25, fy: 500, cover: 0.02 });
    expect(wallBarDiameterMm()).toBe(10);
  });

  it('a new footing takes the footing cover', () => {
    patchDesignData({ covers: { ...defaultDesignData().covers, footing: 0.075 } });
    const n = modelStore.addNode(0, 0, 0);
    const id = modelStore.addFooting(n);
    expect(modelStore.model.footings.get(id)!.cover).toBe(0.075);
  });

  it('changing it keeps the solve, retires the design, and undoes', () => {
    resultsStore.setResults3D({ displacements: [], reactions: [], elementForces: [] } as never);
    const before = verificationStore.demandRevision;
    patchDesignData({ rebarFy: 500 });
    expect(verificationStore.demandRevision).toBe(before + 1);
    expect(resultsStore.results3D).not.toBeNull();
    historyStore.undo();
    expect(designData().rebarFy).toBe(420);
  });

  it('is saved with the project and carried by an office template', () => {
    patchDesignData({ rebarFy: 500, wallBarDiaMm: 10 });
    const snap = modelStore.snapshot();
    expect(snap.designData?.rebarFy).toBe(500);
    const tpl = templateFromProject('Oficina');
    modelStore.clear();
    expect(designData().rebarFy).toBe(420);
    applyTemplate(tpl);
    expect(designData()).toMatchObject({ rebarFy: 500, wallBarDiaMm: 10 });
    setDesignData(null);
    expect(designData()).toEqual(defaultDesignData());
  });
});

describe('covers against CIRSOC 201-2025 Table 20.5.1.3.1', () => {
  it('knows the minimum by kind, exposure and bar', () => {
    expect(minimumCover('beam', 'interior', 25)).toBe(0.04);
    expect(minimumCover('slab', 'interior', 16)).toBe(0.02);
    expect(minimumCover('slab', 'exterior', 16)).toBe(0.04);
    expect(minimumCover('column', 'exterior', 20)).toBe(0.05);
    expect(minimumCover('footing', 'interior', 16)).toBe(0.075);
  });

  it('says which covers are under it, and the preset sets them all to it', () => {
    const d = defaultDesignData();
    // The usual 25 mm is under the table for beams, columns and footings; slabs and walls take 20 mm.
    expect(coversUnderMinimum(d).map((x) => x.kind)).toEqual(['beam', 'column', 'footing']);
    const p = withCirsocCovers(d);
    expect(p.covers).toEqual({ beam: 0.04, column: 0.04, slab: 0.02, wall: 0.02, footing: 0.075 });
    expect(coversUnderMinimum(p)).toEqual([]);
  });

  it('a stored shape is read back, and anything it does not state or states wrong is the default', () => {
    expect(migrateDesignData({ rebarFy: -1, longDiametersMm: [16, 99, 12], exposure: { beam: 'outer' } })).toMatchObject({
      rebarFy: 420, longDiametersMm: [12, 16], exposure: { beam: 'interior' },
    });
  });

  it('f\'c is the material\'s own, else the fy older projects kept it in', () => {
    expect(concreteFc({ fc: 30, fy: 25 })).toBe(30);
    expect(concreteFc({ fy: 25 })).toBe(25);
  });
});
