/**
 * The project's design data, each datum where it is used: design, check, detailing, the shell
 * families, footings, templates. And the table its covers are held against.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore, resultsStore } from '../index';
import { verificationStore } from '../verification.svelte';
import { designData, designContextOptions, patchDesignData, patchOwnDesignData, setDesignData, verifyOptions } from '../design-data';
import { setColumnEndZones, setRcOption, setTorsionMode } from '../rc-sheets.svelte';
import { coversUnderMinimum, concreteFc, defaultDesignData, largestBar, migrateDesignData, migrateStoredDesignData, minimumCover, withCirsocCovers } from '../../model/design-data';
import { buildMemberContext, DEFAULT_REBAR_FY, DEFAULT_STIRRUP_DIA } from '../../engine/design/member-context';
import { buildRegionOptions } from '../../engine/design/candidate-enumerate-beam';
import { syntheticBeamContext } from '../../engine/design/__tests__/helpers';
import { wallBarDiameterMm } from '../detailing-project-inputs';
import { resolveConcreteProperties } from '../concrete-properties';
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

  it('states nothing: the steel the code always used, and the covers of Table 20.5.1.3.1', () => {
    expect(designContextOptions()).toMatchObject({ stirrupDia: DEFAULT_STIRRUP_DIA, rebarFy: DEFAULT_REBAR_FY });
    expect(designContextOptions().coverFor('beam')).toBe(0.03);
    expect(verifyOptions()).toEqual({ rebarFy: 420, cover: 0.03, columnCover: 0.03, stirrupDia: 8 });
    expect(wallBarDiameterMm()).toBe(12);
    expect(defaultDesignData().covers).toEqual({ beam: 0.03, column: 0.03, slab: 0.025, wall: 0.025, footing: 0.055 });
    expect(withCirsocCovers(defaultDesignData()).covers).toEqual(defaultDesignData().covers);
    expect(coversUnderMinimum(defaultDesignData())).toEqual([]);
  });

  it('a saved project keeps the covers it stored; one that stored none takes the new defaults', () => {
    const saved = JSON.parse(JSON.stringify({ ...defaultDesignData(), covers: { beam: 0.025, column: 0.025, slab: 0.025, wall: 0.025, footing: 0.025 } }));
    modelStore.setDesignData(migrateDesignData(saved));
    expect(designContextOptions().coverFor('beam')).toBe(0.025);
    expect(designData().covers.footing).toBe(0.025);
    modelStore.setDesignData(migrateDesignData(JSON.parse(JSON.stringify({ rebarFy: 500 }))));
    expect(designData().covers).toEqual(defaultDesignData().covers);
    modelStore.setDesignData(null);
    expect(verifyOptions().cover).toBe(0.03);
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

describe('what the project stores of it', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('touching a sheets option stores that option and leaves the covers and the steel to the defaults', () => {
    setRcOption('seismic', true);
    setTorsionMode('compatibility');
    setColumnEndZones(true);
    patchOwnDesignData({ frameToleranceMm: 10 });
    patchDesignData({ rebarFy: 500 });
    const stored = modelStore.designData as Record<string, unknown>;
    expect(stored.covers).toBeUndefined();
    expect(stored.exposure).toBeUndefined();
    expect(stored.longDiametersMm).toBeUndefined();
    expect(stored).toMatchObject({ rebarFy: 500, columnEndZones: true, frameToleranceMm: 10, designOptions: { seismic: true, torsion: 'compatibility' } });
    expect(designData().covers).toEqual(defaultDesignData().covers);
  });

  it('a cover set by hand is stored alone, its kind\'s, and survives a save and reopen without the others', () => {
    patchDesignData({ covers: { beam: 0.04 } });
    const reopened = migrateStoredDesignData(JSON.parse(JSON.stringify(modelStore.snapshot().designData)));
    expect(reopened?.covers).toEqual({ beam: 0.04 });
    modelStore.setDesignData(reopened ?? null);
    expect(designData().covers).toEqual({ ...defaultDesignData().covers, beam: 0.04 });
  });

  it('reading a stored shape keeps only what it states', () => {
    expect(migrateStoredDesignData({ rcSheets: { adopted: {} }, covers: { column: 0.035, slab: 'x' } })).toEqual({ version: 1, rcSheets: { version: 1, adopted: {} }, covers: { column: 0.035 } });
    expect(migrateStoredDesignData(null)).toBeUndefined();
  });
});

describe('covers against CIRSOC 201-2025 Table 20.5.1.3.1', () => {
  it('knows the minimum by kind, exposure and bar, under execution control or not', () => {
    expect(minimumCover('beam', 'interior', 25, { stirrupMm: 8 })).toBe(0.027);
    expect(minimumCover('beam', 'interior', 32, { stirrupMm: 6 })).toBe(0.031);
    expect(minimumCover('beam', 'interior', 16, { stirrupMm: 12 })).toBe(0.025);
    expect(minimumCover('column', 'interior', 25)).toBe(0.035);
    expect(minimumCover('beam', 'interior', 25, { stirrupMm: 8, control: false })).toBe(0.032);
    expect(minimumCover('slab', 'interior', 16)).toBe(0.025);
    expect(minimumCover('slab', 'interior', 25)).toBe(0.03);
    expect(minimumCover('slab', 'interior', 16, { control: false })).toBe(0.03);
    expect(minimumCover('wall', 'interior', 40)).toBe(0.045);
    expect(minimumCover('slab', 'exterior', 16)).toBe(0.035);
    expect(minimumCover('column', 'exterior', 20)).toBe(0.04);
    expect(minimumCover('column', 'ground', 20, { control: false })).toBe(0.045);
    expect(minimumCover('footing', 'ground', 16)).toBe(0.055);
    expect(minimumCover('footing', 'interior', 16, { control: false })).toBe(0.06);
  });

  it('says which covers are under it, and the preset sets them all to it, rounded up to 5 mm', () => {
    const d = { ...defaultDesignData(), covers: { beam: 0.025, column: 0.025, slab: 0.025, wall: 0.025, footing: 0.025 } };
    expect(coversUnderMinimum(d).map((x) => x.kind)).toEqual(['beam', 'column', 'footing']);
    const p = withCirsocCovers(d);
    expect(p.covers).toEqual({ beam: 0.03, column: 0.03, slab: 0.025, wall: 0.025, footing: 0.055 });
    expect(coversUnderMinimum(p)).toEqual([]);
    expect(coversUnderMinimum({ ...p, executionControl: false }).map((x) => x.kind)).toEqual(['beam', 'column', 'slab', 'wall', 'footing']);
    expect(largestBar(p, 'slab')).toBe(16);
    expect(largestBar(p, 'beam')).toBe(25);
    expect(largestBar(p, 'column')).toBe(32);
    expect(largestBar({ ...p, longDiametersMm: [32] }, 'beam')).toBe(32);
    expect(migrateDesignData(JSON.parse(JSON.stringify({ executionControl: false }))).executionControl).toBe(false);
    expect(migrateDesignData({ executionControl: true }).executionControl).toBeUndefined();
  });

  it('a stored shape is read back, and anything it does not state or states wrong is the default', () => {
    expect(migrateDesignData({ rebarFy: -1, longDiametersMm: [16, 99, 12], exposure: { beam: 'outer' } })).toMatchObject({
      rebarFy: 420, longDiametersMm: [12, 16], exposure: { beam: 'interior' },
    });
  });

  it('the exchange option, the frame tolerance and a member\'s own cover survive a save and reopen', () => {
    // The IFC column-top option was dropped here: chosen in the exchange panel, gone on the next read.
    const back = migrateDesignData(JSON.parse(JSON.stringify({ exchange: { ifcColumnTop: 'slabSoffit' }, frameToleranceMm: 20, coverByElement: { '7': 0.05, '8': -1 } })));
    expect(back.exchange).toEqual({ ifcColumnTop: 'slabSoffit' });
    expect(back.frameToleranceMm).toBe(20);
    expect(back.coverByElement).toEqual({ '7': 0.05 });
    expect(migrateDesignData({ exchange: { ifcColumnTop: 'roof' } }).exchange).toBeUndefined();
  });

  it('f\'c is the material\'s own, else the fy older projects kept it in', () => {
    expect(concreteFc({ fc: 30, fy: 25 })).toBe(30);
    expect(concreteFc({ fy: 25 })).toBe(25);
  });
});
