/**
 * The declaration of the lateral-force-resisting system (`model/lateral-system.ts`), end to end:
 * where it is stated and how it survives (save and open, autosave, undo, a bar split, the
 * physical elements recognised again under new ids, an older project's seismic roles), and that
 * the seismic classifier's guess from the geometry is offered and never read as one.
 */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore } from '..';
import { verificationStore } from '../verification.svelte';
import { designRunStore } from '../design-run.svelte';
import { designData, setDesignData } from '../design-data';
import { physicalGroups } from '../physical';
import { planRecognition, applyRecognition } from '../physical-recognition';
import { groupReferences } from '../group-references';
import { lateralData, lateralReadingFor, setBeamsLateral, setMemberLateral } from '../lateral-system';
import { seismicRoleReadings, setSeismicRole, suggestedSeismicRoles, runSeismicChecks, adoptSuggestedRoles } from '../seismic-design.svelte';
import { acceptAutosavePayload, buildProjectFile, deserializeProject, serializeProject } from '../file';
import { placeFrame } from '../../model/building/build-on-grid';
import { defaultDesignData } from '../../model/design-data';
import { applyTemplate, templateFromProject } from '../office-templates';
import * as wasmSolver from '../../engine/wasm-solver';
import '../../engine/design/adapters/cirsoc201-adapter';
import '../../engine/design/adapters/unsupported-adapter';
import type { StructuralGrid } from '../../model/grid';

const grid: StructuralGrid = {
  axes: [
    { id: 'A', name: 'A', axis: 'x', at: 0 }, { id: 'B', name: 'B', axis: 'x', at: 6 },
    { id: '1', name: '1', axis: 'y', at: 0 }, { id: '2', name: '2', axis: 'y', at: 5 },
  ],
  levels: [{ id: 'N0', name: 'N0', z: 0 }, { id: 'N1', name: 'N1', z: 3 }],
};

/** One storey, one bay each way, as the building tools make it: physical beams and columns. */
function frame(): void {
  modelStore.clear(); historyStore.clear();
  modelStore.setGrid(grid);
  const S = { sectionId: 1, materialId: 1 };
  placeFrame(grid, { x: ['A', 'B'], y: ['1', '2'], levels: ['N0', 'N1'], columns: S, beamsX: S, beamsY: S }, { fixBase: true });
  historyStore.clear();
}
const beams = () => physicalGroups().filter((g) => g.physical.kind === 'beam');

describe('where the declaration lives and how it survives', () => {
  beforeEach(frame);

  it('declared on a bar of a physical beam, it is the beam\'s, and every bar of it reads it', () => {
    const g = beams()[0]!;
    const bar = g.members.elements![0]!;
    expect(lateralReadingFor(bar)).toEqual({ role: 'undeclared' });
    setMemberLateral([bar], 'gravity');
    expect(lateralData()).toEqual({ members: { [`P${g.id}`]: 'gravity' } });
    for (const id of g.members.elements!) expect(lateralReadingFor(id)).toEqual({ role: 'gravity', source: 'physical' });
    expect(groupReferences(g.id).map((r) => r.place)).toContain('lateral');
  });

  it('one undo takes it back, a redo puts it again, and the solve is not touched', () => {
    const bar = beams()[0]!.members.elements![0]!;
    const version = modelStore.modelVersion;
    setMemberLateral([bar], 'lateral');
    expect(lateralReadingFor(bar).role).toBe('lateral');
    historyStore.undo();
    expect(lateralReadingFor(bar).role).toBe('undeclared');
    expect(designData().lateralSystem).toBeUndefined();
    historyStore.redo();
    expect(lateralReadingFor(bar).role).toBe('lateral');
    expect(modelStore.modelVersion).toBe(version);
  });

  it('is saved and opened with the project (.ded) and autosaved with it', () => {
    const [a, b] = beams();
    setMemberLateral([a!.members.elements![0]!], 'lateral');
    setMemberLateral([b!.members.elements![0]!], 'gravity');
    setBeamsLateral('gravity');
    const stated = lateralData();
    expect(stated).toEqual({ beams: 'gravity', members: { [`P${a!.id}`]: 'lateral', [`P${b!.id}`]: 'gravity' } });
    const text = serializeProject();
    const auto = acceptAutosavePayload(JSON.parse(JSON.stringify(buildProjectFile())))!;
    modelStore.clear();
    expect(designData().lateralSystem).toBeUndefined();
    expect(deserializeProject(text)).toBe(true);
    expect(lateralData()).toEqual(stated);
    modelStore.clear();
    modelStore.restore(auto.snapshot);
    expect(lateralData()).toEqual(stated);
  });

  it('a bar of a declared beam split in two: both halves read the beam\'s declaration', () => {
    const g = beams()[0]!;
    const bar = g.members.elements![0]!;
    setMemberLateral([bar], 'gravity');
    const cut = modelStore.splitElementAtPoint(bar, 0.5)!;
    expect(modelStore.elements.has(bar)).toBe(false);
    for (const id of [cut.elemA, cut.elemB]) expect(lateralReadingFor(id)).toEqual({ role: 'gravity', source: 'physical' });
  });

  it('the physical beams read again under new ids: the declaration moves to the beam that took its bars', () => {
    const g = beams()[0]!;
    setMemberLateral([g.members.elements![0]!], 'lateral');
    // An earlier reading took it for a brace: recognition now proposes a beam, a new element,
    // and the brace hands its references to it (`group-references.ts`).
    modelStore.setGroupData(g.id, { ...(g.data as object), kind: 'brace', provenance: 'inferred' });
    applyRecognition(planRecognition(), () => true);
    const now = beams().find((x) => (x.members.elements ?? []).includes(g.members.elements![0]!))!;
    expect(now.id).not.toBe(g.id);
    expect(lateralData()).toEqual({ members: { [`P${now.id}`]: 'lateral' } });
    for (const id of now.members.elements!) expect(lateralReadingFor(id).role).toBe('lateral');
  });

  it('an older project\'s seismic roles fixed by hand are read as declarations, and kept nowhere else', () => {
    const [a, b] = beams();
    const ea = a!.members.elements![0]!, eb = b!.members.elements![0]!;
    setDesignData({ ...defaultDesignData(), seismic: { roles: { [String(ea)]: 'primary', [String(eb)]: 'secondary' } } as never });
    expect(designData().seismic!.roles).toEqual({});
    expect(lateralData()).toEqual({ members: { [`e${ea}`]: 'lateral', [`e${eb}`]: 'gravity' } });
    expect([lateralReadingFor(ea).role, lateralReadingFor(eb).role]).toEqual(['lateral', 'gravity']);
  });

  it('an office template carries the beams\' default and no member\'s role; applied, it keeps the project\'s own', () => {
    const g = beams()[0]!;
    setMemberLateral([g.members.elements![0]!], 'gravity');
    setBeamsLateral('lateral');
    const tpl = templateFromProject('Oficina');
    frame();
    expect(lateralData()).toEqual({});
    applyTemplate(tpl);
    expect(lateralData()).toEqual({ beams: 'lateral' });
    const h = beams()[1]!;
    setMemberLateral([h.members.elements![0]!], 'gravity');
    applyTemplate(tpl);
    expect(lateralData()).toEqual({ beams: 'lateral', members: { [`P${h.id}`]: 'gravity' } });
  });

  it('the beams\' default applies to the beams that state nothing, and to no column', () => {
    setBeamsLateral('gravity');
    const col = physicalGroups().find((g) => g.physical.kind === 'column')!.members.elements![0]!;
    for (const g of beams()) expect(lateralReadingFor(g.members.elements![0]!)).toEqual({ role: 'gravity', source: 'project' });
    expect(lateralReadingFor(col, 'column').role).toBe('undeclared');
    setBeamsLateral(null);
    expect(designData().lateralSystem).toBeUndefined();
  });
});

describe('the geometry suggests, it never declares', () => {
  beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 0));
    expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
  });

  /** A 6 m beam between two 40×40 columns and a 1,5 m cantilever past one of them, solved. */
  function cantilever(): { beam: number; tip: number } {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear();
    const mat = modelStore.addMaterial({ name: 'H-30', e: 27500, nu: 0.2, rho: 25, fy: 30, fc: 30 } as never);
    const col = modelStore.addSection({ name: 'Rect 40x40 cm', a: 0.16, iy: 0.00213, iz: 0.00213, j: 0.0036, b: 0.4, h: 0.4, shape: 'rect' } as never);
    const bm = modelStore.addSection({ name: 'Rect 20x50 cm', a: 0.1, iy: 0.00208, iz: 0.000333, j: 0.00093, b: 0.2, h: 0.5, shape: 'rect' } as never);
    const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(0, 0, 3), modelStore.addNode(6, 0, 3), modelStore.addNode(6, 0, 0), modelStore.addNode(7.5, 0, 3)];
    const el = (a: number, b: number, s: number) => { const id = modelStore.addElement(a, b, 'frame'); modelStore.updateElementSection(id, s); modelStore.updateElementMaterial(id, mat); return id; };
    el(n[0]!, n[1]!, col); el(n[3]!, n[2]!, col);
    const beam = el(n[1]!, n[2]!, bm), tip = el(n[2]!, n[4]!, bm);
    modelStore.addSupport(n[0]!, 'fixed3d'); modelStore.addSupport(n[3]!, 'fixed3d');
    for (const id of [beam, tip]) {
      modelStore.addDistributedLoad3D(id, 0, 0, -15, -15, undefined, undefined, 1, { frame: 'global' });
      modelStore.addDistributedLoad3D(id, 0, 0, -6, -6, undefined, undefined, 2, { frame: 'global' });
    }
    const combo = modelStore.solveCombinations3D(true, false, true);
    if (!combo || typeof combo === 'string') throw new Error(String(combo));
    resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
    return { beam, tip };
  }

  it('a cantilever the geometry calls secondary is read primary and not declared, by the design and the seismic checks', () => {
    const { beam, tip } = cantilever();
    expect(suggestedSeismicRoles().get(tip)).toBe('secondary');
    expect(suggestedSeismicRoles().get(beam)).toBe('primary');
    expect(designRunStore.computeDemands().ok).toBe(true);
    // Nothing was written, and no context reads the guess.
    expect(designData().lateralSystem).toBeUndefined();
    for (const id of [beam, tip]) expect(verificationStore.contextFor(id)!.lateral).toEqual({ role: 'undeclared' });
    const read = seismicRoleReadings();
    expect([read.roles.get(tip), read.declared.has(tip)]).toEqual(['primary', false]);
    const rep = runSeismicChecks();
    expect(rep.members.filter((m) => m.kind === 'beam').map((m) => [m.id, m.role, m.assumed === true]).sort())
      .toEqual([[beam, 'primary', true], [tip, 'primary', true]].sort());
  });

  it('adopted on purpose, the suggestion becomes a declaration, and the design reads it', () => {
    const { beam, tip } = cantilever();
    adoptSuggestedRoles([beam, tip]);
    expect(lateralData()).toEqual({ members: { [`e${beam}`]: 'lateral', [`e${tip}`]: 'gravity' } });
    designRunStore.computeDemands();
    expect(verificationStore.contextFor(tip)!.lateral).toEqual({ role: 'gravity', source: 'member' });
    expect(runSeismicChecks().members.find((m) => m.id === tip)).toMatchObject({ role: 'secondary' });
    // A click on the plan declares too; withdrawn, the member is not declared again.
    setSeismicRole([tip], null);
    expect(lateralReadingFor(tip).role).toBe('undeclared');
  });
});
