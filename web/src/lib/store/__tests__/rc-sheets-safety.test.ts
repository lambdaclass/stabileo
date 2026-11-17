/**
 * What the reinforcement sheets owe a reader before drawings leave: the members they leave out, said
 * with why, and each export stamped with the model it was drawn from, so that an edit afterwards
 * says the files issued no longer match.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore, resultsStore } from '..';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { publishCombinations3D } from '../active-results';
import { buildSheetRows } from '../rc-sheets.svelte';
import { recordSheetsExport, sheetsExports, sheetsStateFingerprint } from '../rc-sheets-exports';
import { exportRecordStore } from '../export-record.svelte';
import { captureProjectProvenance, hydrateProjectProvenance } from '../project-provenance';
import { recognizePhysicalElements } from '../physical';
import { rcSheetsWorkbook } from '../../rc-sheets/workbook';
import es from '../../i18n/locales/es';

beforeAll(async () => { await wasmSolver.initSolver(); });

async function solved(example: string) {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); exportRecordStore.reset(); uiStore.analysisMode = 'pro';
  await modelStore.loadExample(example);
  recognizePhysicalElements(); syncDefinedLoadsForAnalysis();
  resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
  publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
}

describe('the members the sheets leave out', () => {
  it('a frame the sheets design whole leaves nothing out; a column cut from its run is named, with why', async () => {
    await solved('rc-design-qa-8');
    expect(buildSheetRows().left).toEqual([]);
    const col = [...modelStore.elements.values()].find((e) => Math.abs((modelStore.nodes.get(e.nodeI)!.z ?? 0) - (modelStore.nodes.get(e.nodeJ)!.z ?? 0)) > 1)!;
    modelStore.updateElementSection(col.id, modelStore.addSection({ name: 'Ø40', a: 0.1257, iy: 0.00126, iz: 0.00126, j: 0.0025, shape: 'circular', d: 0.4 } as never));
    syncDefinedLoadsForAnalysis();
    resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
    publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
    const rows = buildSheetRows();
    const out = rows.left!.filter((x) => x.reason === 'layout');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'column', members: 1 });
    expect(rows.column.map((r) => r.name)).not.toContain(out[0]!.name);
  }, 300000);

  it('a member of a material that states no strength is designed with the one assumed, and says so', async () => {
    await solved('rc-design-qa-8');
    for (const m of [...modelStore.materials.values()]) modelStore.updateMaterial(m.id, { fc: undefined, fy: undefined } as never);
    syncDefinedLoadsForAnalysis();
    resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
    publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
    const rows = buildSheetRows();
    const assumed = rows.left!.filter((x) => x.reason === 'fcAssumed');
    expect(rows.beam.length + rows.column.length).toBeGreaterThan(0);
    expect(assumed.length).toBeGreaterThan(0);
    for (const x of assumed) expect(x.fc).toBe(25);
  }, 300000);
});

describe('what left the sheets', () => {
  it('each export is stamped with the model; an edit afterwards makes it out of date, and the model put back makes it current again', async () => {
    await solved('rc-design-qa-8');
    const before = sheetsStateFingerprint();
    const r = recordSheetsExport('rcPlans', 'qa8-planos.zip', 'Vigas · N1', '2026-11-17T10:00:00.000Z')!;
    expect(r).toMatchObject({ seriesId: 'rc-sheets', kind: 'rcPlans', filename: 'qa8-planos.zip', fingerprint: before, staleSheets: false, error: null, state: 'ready' });
    expect(sheetsExports().map((x) => [x.filename, x.current])).toEqual([['qa8-planos.zip', true]]);

    const node = [...modelStore.nodes.values()].find((n) => (n.z ?? 0) > 1)!;
    modelStore.updateNode(node.id, node.x + 0.25, node.y, node.z);
    expect(sheetsStateFingerprint()).not.toBe(before);
    expect(sheetsExports()[0]!.current).toBe(false);

    recordSheetsExport('bvbs', 'qa8.abs', 'Por elemento', '2026-11-17T11:00:00.000Z');
    expect(sheetsExports().map((x) => [x.filename, x.current])).toEqual([['qa8.abs', true], ['qa8-planos.zip', false]]);

    modelStore.updateNode(node.id, node.x, node.y, node.z);
    expect(sheetsExports().map((x) => [x.filename, x.current])).toEqual([['qa8.abs', false], ['qa8-planos.zip', true]]);
  }, 300000);

  it('a bar adopted by hand after the export makes the drawings out of date too', async () => {
    await solved('rc-design-qa-8');
    recordSheetsExport('rcWorkbook', 'qa8.xlsx', 'Vigas, Columnas', '2026-11-17T10:00:00.000Z');
    modelStore.setDesignData({ ...(modelStore.designData ?? { version: 1 }), rcSheets: { version: 1, torsion: 'equilibrium', adopted: { 'column:1:0': { nx: 2, ny: 2, corner: 16, dx: 16, dy: 16, tieDia: 8, tieSpacing: 0.15 } } } } as never);
    expect(sheetsExports()[0]!.current).toBe(false);
  }, 300000);

  it('the record travels with the project and is not taken back by undo', async () => {
    await solved('rc-design-qa-8');
    const node = [...modelStore.nodes.values()].find((n) => (n.z ?? 0) > 1)!;
    modelStore.updateNode(node.id, node.x + 0.25, node.y, node.z);
    recordSheetsExport('rcPlans', 'qa8-planos.zip', 'Vigas', '2026-11-17T10:00:00.000Z');
    historyStore.undo();
    expect(sheetsExports().map((x) => x.filename)).toEqual(['qa8-planos.zip']);
    const saved = captureProjectProvenance();
    exportRecordStore.reset();
    expect(sheetsExports()).toEqual([]);
    hydrateProjectProvenance(saved);
    expect(sheetsExports().map((x) => [x.filename, x.scope, x.current])).toEqual([['qa8-planos.zip', 'Vigas', false]]);
  }, 300000);
});

describe('a flat slab\'s punching, as a Spanish reader gets it', () => {
  it('names the column\'s position in words, in the steps and the workbook, never as a code', async () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
    for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
    const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
    const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' } as never);
    const N = 6, id: number[][] = [];
    for (let i = 0; i <= N; i++) { id.push([]); for (let j = 0; j <= N; j++) id[i]!.push(modelStore.addNode(-3 + i, -3 + j, 3)); }
    const D = modelStore.model.loadCases.find((c) => c.type === 'D')!.id;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) modelStore.addSurfaceLoad3D(modelStore.addQuad([id[i]![j]!, id[i + 1]![j]!, id[i + 1]![j + 1]!, id[i]![j + 1]!], conc, 0.2), 12, D);
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) if (i === 0 || j === 0 || i === N || j === N) modelStore.addSupport(id[i]![j]!, 'pinned3d');
    const base = modelStore.addNode(0, 0, 0);
    const c = modelStore.addElement(base, id[3]![3]!, 'frame');
    modelStore.updateElementSection(c, col); modelStore.updateElementMaterial(c, conc);
    modelStore.addSupport(base, 'fixed3d');
    modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
    recognizePhysicalElements();
    resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
    publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
    const t = (k: string) => (es as Record<string, string>)[k] ?? k;
    const rows = buildSheetRows();
    const p = rows.punching[0]!;
    expect(p.position).toBe('interior');
    const labels = p.steps.flatMap((g) => g.steps.map((x) => t(x.label)));
    expect(labels).toContain('Columna interior');
    expect(labels.every((l) => !l.startsWith('rcSheets.'))).toBe(true);
    expect(t(p.verifications[0]!.label)).toBe('Punzonado');
    const sheet = rcSheetsWorkbook(rows, t).find((x) => x.name === 'Punzonado')!;
    expect(sheet.rows.flat()).toContain('Columna interior');
    expect(sheet.rows.flat()).not.toContain('interior');
  }, 300000);
});
