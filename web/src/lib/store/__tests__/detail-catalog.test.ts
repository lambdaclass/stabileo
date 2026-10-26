/**
 * F7's closing criterion: the construction details chosen from the catalogue land on the sheet of
 * their kind in the drawing set, each at its own scale, drawn with the project's sections, covers
 * and lengths; the ones the set has no sheet for are listed, and the defaults hold until a choice.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { designRunStore } from '../design-run.svelte';
import { verificationStore } from '../verification.svelte';
import { placeFrame } from '../../model/building/build-on-grid';
import { patchSheetSettings, projectSheetSet, setSheetEntries, unplacedDetails } from '../sheet-set';
import { chosenDetails, projectDetailValues, setChosenDetails, setDetailTarget, toggleDetail } from '../detail-catalog';
import { patchDesignData } from '../design-data';
import { isSeismicProject } from '../seismic-design.svelte';
import { barLengths } from '../../sheets/details/values';
import type { StructuralGrid } from '../../model/grid';
import type { Primitive } from '../../sheets/primitives';
import * as wasmSolver from '../../engine/wasm-solver';
import { stateSuiteLateral } from './suite-lateral';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const grid: StructuralGrid = {
  axes: [{ id: 'x0', name: '1', axis: 'x', at: 0 }, { id: 'x1', name: '2', axis: 'x', at: 5 }, { id: 'y0', name: 'A', axis: 'y', at: 0 }],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }],
};

function project() {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
  stateSuiteLateral();
  const conc = modelStore.addMaterial({ name: 'H-30', e: 25000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
  const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' } as never);
  const beam = modelStore.addSection({ name: '25×55', a: 0.1375, iy: 0.25 * 0.55 ** 3 / 12, iz: 0.55 * 0.25 ** 3 / 12, j: 0.0012, b: 0.25, h: 0.55, shape: 'rect' } as never);
  placeFrame(grid, { x: ['x0', 'x1'], y: ['y0', 'y0'], levels: ['N0', 'N1'], columns: { sectionId: col, materialId: conc }, beamsX: { sectionId: beam, materialId: conc }, beamsY: null }, { fixBase: true });
  const beams = [...modelStore.elements.values()].filter((e) => { const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!; return Math.abs((a.z ?? 0) - (b.z ?? 0)) < 1e-6; });
  for (const e of beams) modelStore.addDistributedLoad3D(e.id, 0, 0, -20, -20, undefined, undefined, 1);
  const combo = modelStore.solveCombinations3D(false, false, true);
  if (!combo || typeof combo === 'string') throw new Error(String(combo));
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
  expect(designRunStore.computeDemands().ok).toBe(true);
  expect(designRunStore.autoDesign([...verificationStore.contexts.keys()]).ok).toBe(true);
  patchDesignData({ covers: { beam: 0.03, column: 0.035, slab: 0.02, wall: 0.025, footing: 0.05 } });
}

const texts = (ps: readonly Primitive[]) => ps.flatMap((p) => (p.kind === 'text' ? [p.text] : p.kind === 'dimension' && p.text ? [p.text] : []));

describe('the detail catalogue in the drawing set', () => {
  it('reads the project: its sections, covers and materials, and says which kinds are typical', () => {
    project();
    const v = projectDetailValues(null);
    expect(v.size.beam).toEqual({ b: 250, h: 550 });
    expect(v.size.column).toEqual({ b: 400, h: 400 });
    expect(v.cover.beam).toBe(30);
    expect(v.cover.column).toBe(35);
    expect(v.fc).toBe(30);
    expect(v.concrete).toBe('H-30');
    // Nothing of these kinds designed: typical values, and said so.
    expect(v.typical).toEqual(expect.arrayContaining(['slab', 'wall', 'footing', 'stair']));
  });

  it('puts each chosen detail on its kind’s sheet at its own scale, the rest on the details sheet', () => {
    project();
    setSheetEntries([{ id: 'beams', kind: 'beams', scale: 50 }, { id: 'columns', kind: 'columns' }, { id: 'details', kind: 'details' }]);
    patchSheetSettings({ format: 'A1' });
    // Before choosing: the basic details and the anchorage table on the details sheet, and as the
    // frame carries an earthquake case, the joint, beam and column in their seismic variant.
    expect(isSeismicProject()).toBe(true);
    expect(chosenDetails().map((c) => c.id)).toEqual(['hooks', 'tie', 'lap', 'starters', 'slab-edge', 'joint-interior-seismic', 'beam-seismic', 'column-seismic', 'chars-anchorage']);
    expect(chosenDetails().every((c) => c.target === 'details')).toBe(true);
    let set = projectSheetSet(null, 'Obra');
    const keys = set.flatMap((s) => s.drawings);
    expect(keys).toEqual(expect.arrayContaining(['details:detail-hooks', 'details:detail-joint-interior-seismic', 'details:detail-chars-anchorage']));

    // Chosen: the seismic beam on the beams sheet, the column ties on the columns one, a raft
    // (no foundations sheet in the set: it goes to details), the beams' characteristics table.
    toggleDetail('beam-seismic', false);
    toggleDetail('beam-seismic', true);
    toggleDetail('column-ties', true);
    toggleDetail('raft', true);
    toggleDetail('chars-beam', true);
    expect(chosenDetails().find((c) => c.id === 'raft')!.target).toBe('foundations');
    expect(unplacedDetails()).toEqual([]);
    set = projectSheetSet(null, 'Obra');
    const where = (k: string) => set.find((s) => s.drawings.includes(k));
    expect(where('beams:detail-beam-seismic')).toBeTruthy();
    expect(where('columns:detail-column-ties')).toBeTruthy();
    expect(where('details:detail-raft')).toBeTruthy();
    expect(where('beams:detail-chars-beam')).toBeTruthy();
    // On the beams sheet, at the detail's own 1:25, not the entry's 1:50.
    const placed = where('beams:detail-beam-seismic')!.placed!.find((p) => p.key === 'beams:detail-beam-seismic')!;
    expect(placed.scale).toBe(25);

    // Drawn with the project: the section's 550 mm gives 2h = 1100; the cover and lengths of H-30.
    const sheetTexts = texts(where('beams:detail-beam-seismic')!.primitives);
    expect(sheetTexts).toContain('2h = 1100');
    const beamTable = texts(where('beams:detail-chars-beam')!.primitives);
    const v = projectDetailValues(null), d = v.bars.beam[0]!;
    expect(beamTable.some((s) => s.includes('30 mm'))).toBe(true);
    expect(beamTable).toContain(String(barLengths(v, d).lap));
    expect(v.typical).not.toContain('beam');

    // Moved to another sheet; then a set without a details sheet lists what has nowhere to go.
    setDetailTarget('raft', 'columns');
    expect(projectSheetSet(null, 'Obra').some((s) => s.drawings.includes('columns:detail-raft'))).toBe(true);
    setSheetEntries([{ id: 'beams', kind: 'beams' }]);
    expect(unplacedDetails().map((c) => c.id)).toEqual(expect.arrayContaining(['raft', 'column-ties', 'hooks']));
    // Back to the defaults.
    setChosenDetails(undefined);
    expect(chosenDetails().map((c) => c.id)).toContain('joint-interior-seismic');
  });
});
