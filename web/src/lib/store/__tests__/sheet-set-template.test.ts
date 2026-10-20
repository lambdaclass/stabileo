/**
 * A sheet set arranged as a list (a kind twice with two configurations, a fixed scale, a level, its
 * tables left out), its display and its title block template, saved as a template: applied to
 * another project with the same frame, it generates the same sheets. And the kinds the set lacked
 * draw: setting-out with its coordinates, loads on the foundation, loads by floor, column elevations.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { designRunStore } from '../design-run.svelte';
import { verificationStore } from '../verification.svelte';
import { placeFrame } from '../../model/building/build-on-grid';
import { applySetTemplate, projectSheetSet, setSheetEntries, setTemplateFromProject, patchSheetSettings, sheetEntries } from '../sheet-set';
import { planContext, workDrawings } from '../work-drawings';
import { duplicateEntry, patchEntry, parseSetTemplate } from '../../sheets/sheet-entries';
import type { StructuralGrid } from '../../model/grid';
import * as wasmSolver from '../../engine/wasm-solver';
import { stateSuiteLateral } from './suite-lateral';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const grid: StructuralGrid = {
  axes: [
    { id: 'x0', name: '1', axis: 'x', at: 0 }, { id: 'x1', name: '2', axis: 'x', at: 5 }, { id: 'x2', name: '3', axis: 'x', at: 9 },
    { id: 'y0', name: 'A', axis: 'y', at: 0 },
  ],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }, { id: 'N2', name: 'P2', z: 6 }],
};

function project() {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
  stateSuiteLateral();
  const conc = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
  const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' } as never);
  const beam = modelStore.addSection({ name: '20×50', a: 0.1, iy: 0.00208, iz: 0.000333, j: 0.00093, b: 0.2, h: 0.5, shape: 'rect' } as never);
  placeFrame(grid, { x: ['x0', 'x2'], y: ['y0', 'y0'], levels: ['N0', 'N2'], columns: { sectionId: col, materialId: conc }, beamsX: { sectionId: beam, materialId: conc }, beamsY: null }, { fixBase: true });
  const beams = [...modelStore.elements.values()].filter((e) => { const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!; return Math.abs((a.z ?? 0) - (b.z ?? 0)) < 1e-6; });
  for (const e of beams) modelStore.addDistributedLoad3D(e.id, 0, 0, -25, -25, undefined, undefined, 1);
  const combo = modelStore.solveCombinations3D(false, false, true);
  if (!combo || typeof combo === 'string') throw new Error(String(combo));
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
  expect(designRunStore.computeDemands().ok).toBe(true);
  expect(designRunStore.autoDesign([...verificationStore.contexts.keys()]).ok).toBe(true);
}

const shape = (ss: ReturnType<typeof projectSheetSet>) => ss.map((s) => [s.number, s.title, s.format, s.drawings.join(',')]);

describe('a sheet set kept as a template', () => {
  it('generates the same sheets in another project', () => {
    project();
    // The office's arrangement: loads by floor first, the formwork twice (all levels, then the
    // first floor alone at 1:50 under its own name), the setting-out without its table.
    let entries = [{ id: 'loads', kind: 'loads' }, { id: 'formwork', kind: 'formwork' }, { id: 'setout', kind: 'setout' }, { id: 'columns', kind: 'columns' }];
    entries = duplicateEntry(entries, 'formwork');
    entries = patchEntry(entries, 'formwork-2', { label: 'Encofrado P1', scale: 50, levels: [3] });
    entries = patchEntry(entries, 'setout', { tables: false });
    setSheetEntries(entries);
    patchSheetSettings({ format: 'A2', prefix: 'S-', display: { colorByDiameter: true }, titleBlock: { layout: 'standard', lines: ['{obra} · {expediente}'], values: { expediente: 'EX-7' } } });
    const a = projectSheetSet(null, 'Obra A');
    const tpl = parseSetTemplate(JSON.stringify(setTemplateFromProject('Estudio')));

    // Another project: the same frame, no sheet settings of its own.
    project();
    expect(sheetEntries().map((e) => e.id)).not.toEqual(entries.map((e) => e.id));
    applySetTemplate(tpl);
    expect(sheetEntries()).toEqual(entries);
    const b = projectSheetSet(null, 'Obra A');
    expect(shape(b)).toEqual(shape(a));
    // The duplicated formwork stands on its own, at its fixed scale, with its own name.
    const p1 = b.find((s) => s.drawings.some((d) => d.startsWith('formwork-2:')))!;
    expect(p1.drawings).toHaveLength(1);
    expect(b.filter((s) => s.drawings.some((d) => d.startsWith('formwork:'))).length).toBeGreaterThan(0);
    expect(p1.primitives.some((p) => p.kind === 'text' && /1:50/.test(p.text))).toBe(true);
    // The title block carries the template's line, filled.
    expect(b[1]!.primitives.some((p) => p.kind === 'text' && p.text === 'Obra A · EX-7')).toBe(true);
    // The setting-out came without its table.
    expect(b.flatMap((s) => s.drawings).some((d) => d.startsWith('setout:') && d.endsWith('-table'))).toBe(false);
  });

  it('the kinds the set lacked draw from the model', () => {
    project();
    const got = workDrawings(null, new Set(['setout', 'fdnLoads', 'loads', 'colElev'] as const), planContext('es', 'A1'));
    expect(got.get('setout')!.map((d) => d.key)).toEqual(['setout-arranque', 'setout-arranque-table']);
    // Three columns, one load case: three rows of reactions.
    expect(got.get('fdnLoads')!.length).toBe(1);
    expect(got.get('loads')!.map((d) => d.key)).toEqual(['loads-N1', 'loads-N2']);
    expect(got.get('colElev')!.length).toBe(6);
  });
});
