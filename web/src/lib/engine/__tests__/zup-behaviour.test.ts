/**
 * The Z-up field contract, by what the code does rather than how it is spelled.
 *
 * `zup-field-names.test.ts` asserted most of this by reading source files for exact lines
 * (`disp.uz ?? disp.uy`, `if (data.fy !== undefined) d.fy = …`, a `$state` declaration). A correct
 * refactor broke those, and a wrong one that kept the line passed. Here each is checked by calling
 * the code: the display helpers, the results store's magnitude, a 3D nodal-load edit, the AI
 * artifact's reaction, the 3D presentation surviving a save and reload.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore, resultsStore, uiStore } from '../../store';
import { get2DDisplayDisplacementVertical, get2DDisplayRotation, hasInvalid2DDisplacements } from '../../geometry/coordinate-system';
import { buildArtifact } from '../../ai/client';
import { serializeProject, deserializeProject } from '../../store/file';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); });
beforeEach(() => { uiStore.analysisMode = '2d'; modelStore.clear(); resultsStore.clear(); });

describe('2D displacements read Z-up first, Y-up as a fallback', () => {
  it('the vertical displacement and the rotation', () => {
    expect(get2DDisplayDisplacementVertical({ uz: 2, uy: 5 })).toBe(2);
    expect(get2DDisplayDisplacementVertical({ uy: 5 })).toBe(5);
    expect(get2DDisplayRotation({ ry: 0.1, rz: 0.4 })).toBe(0.1);
    expect(get2DDisplayRotation({ rz: 0.4 })).toBe(0.4);
  });

  it('a result with a non-finite vertical displacement or rotation is invalid, in either spelling', () => {
    expect(hasInvalid2DDisplacements([{ ux: 0, uz: 0.01, ry: 0 }])).toBe(false);
    expect(hasInvalid2DDisplacements([{ ux: 0, uz: NaN, ry: 0 }])).toBe(true);
    expect(hasInvalid2DDisplacements([{ ux: 0, uy: Infinity, rz: 0 }])).toBe(true);
    expect(hasInvalid2DDisplacements([{ ux: 0, uz: 0, ry: NaN }])).toBe(true);
  });

  it('the results store measures the largest displacement from ux and uz', () => {
    resultsStore.setResults({ displacements: [{ nodeId: 1, ux: 0.03, uz: 0.04, ry: 0 }], reactions: [], elementForces: [] } as never);
    expect(resultsStore.maxDisplacement).toBeCloseTo(0.05, 12);
  });
});

describe('a 3D nodal load keeps each component on its own axis', () => {
  it('an edit writes fy to fy, fz to fz, my to my, mz to mz, and leaves the rest', () => {
    uiStore.analysisMode = '3d';
    const n = modelStore.addNode(0, 0, 0);
    const id = modelStore.addNodalLoad3D(n, 1, 0, 0, 0, 0, 0, 1);
    modelStore.updateLoad(id, { fy: 2, fz: 3, my: 4, mz: 5 });
    const d = () => modelStore.loads.find((l) => (l.data as { id: number }).id === id)!.data as unknown as Record<string, number>;
    expect({ fx: d().fx, fy: d().fy, fz: d().fz, my: d().my, mz: d().mz }).toEqual({ fx: 1, fy: 2, fz: 3, my: 4, mz: 5 });
    modelStore.updateLoad(id, { fz: 7 });
    expect({ fy: d().fy, fz: d().fz }).toEqual({ fy: 2, fz: 7 });
  });
});

describe('the AI artifact reads a plane result by its own names', () => {
  it('a 2D reaction (rx, rz) sets the largest reaction; a 3D one (fx, fz) too', () => {
    const plane = buildArtifact({ displacements: [{ nodeId: 1, ux: 0, uz: 0.002, ry: 0 }], reactions: [{ nodeId: 1, rx: 3, rz: 4, my: 0 }], elementForces: [] } as never, 1, 1);
    expect(plane.fingerprint.maxAbsReaction).toBeCloseTo(5, 12);
    expect(plane.fingerprint.maxAbsDisplacement).toBeCloseTo(0.002, 12);
    const space = buildArtifact({ displacements: [], reactions: [{ nodeId: 1, fx: 6, fy: 0, fz: 8 }], elementForces: [] } as never, 1, 1);
    expect(space.fingerprint.maxAbsReaction).toBeCloseTo(10, 12);
  });
});

describe('the 3D presentation of a plane model is part of the project', () => {
  it('a plane model standing in 3D is still standing after a save and a reload', () => {
    modelStore.addElement(modelStore.addNode(0, 0), modelStore.addNode(0, 3), 'frame');
    uiStore.analysisMode = '3d';
    expect(uiStore.viewportPresentation3D).toBe('upright2dIn3d');
    const saved = serializeProject();
    uiStore.analysisMode = '2d';
    uiStore.viewportPresentation3D = 'native3d';
    expect(deserializeProject(saved)).toBe(true);
    expect(uiStore.analysisMode).toBe('3d');
    expect(uiStore.viewportPresentation3D).toBe('upright2dIn3d');
  });
});
