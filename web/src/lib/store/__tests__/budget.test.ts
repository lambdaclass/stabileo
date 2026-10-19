/**
 * The budget through the store: a concrete frame and a stair measured into work items (concrete
 * by kind and material, formwork by kind, the stair's concrete, soffit and bars), a price base
 * with a location factor and prices from a CSV, the summary shares, the workbook sheets and the
 * CSV; the memoria's quantities read the same measurement.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { verificationStore } from '../verification.svelte';
import { placeFrame } from '../../model/building/build-on-grid';
import { saveStair } from '../stairs-pt';
import { budgetCsvText, budgetSheets, currentBudget, importPrices, saveBase, setShares, workItems } from '../budget';
import { memoriaInput } from '../memoria-inputs';
import type { StructuralGrid } from '../../model/grid';
import * as wasmSolver from '../../engine/wasm-solver';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const grid: StructuralGrid = {
  axes: [{ id: 'x0', name: '1', axis: 'x', at: 0 }, { id: 'x1', name: '2', axis: 'x', at: 6 }, { id: 'y0', name: 'A', axis: 'y', at: 0 }, { id: 'y1', name: 'B', axis: 'y', at: 5 }],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }],
};
const tr = (k: string, p?: Record<string, string | number>) => (p ? `${k} ${JSON.stringify(p)}` : k);

describe('takeoff and budget', () => {
  it('measures, prices, shares and exports', () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
    const mat = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
    const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.00213, iz: 0.00213, j: 0.0036, b: 0.4, h: 0.4, shape: 'rect' } as never);
    const bm = modelStore.addSection({ name: '30×60', a: 0.18, iy: 0.0054, iz: 0.00135, j: 0.0037, b: 0.3, h: 0.6, shape: 'rect' } as never);
    placeFrame(grid, { x: ['x0', 'x1'], y: ['y0', 'y1'], levels: ['N0', 'N1'], columns: { sectionId: col, materialId: mat }, beamsX: { sectionId: bm, materialId: mat }, beamsY: { sectionId: bm, materialId: mat } }, { fixBase: true });
    saveStair({ id: 'e1', name: 'E1', riser: 0.175, tread: 0.28, steps: 10, waist: 0.18, width: 1.2, landingBottom: 1, landingTop: 1, ends: 'monolithic', finishes: 1, live: 5 });

    const items = workItems();
    const sum = (code: string) => items.filter((i) => i.code === code).reduce((s, i) => s + i.quantity, 0);
    // Four columns 0,4 × 0,4 × 3 m and four beams 0,3 × 0,6 over 6 and 5 m.
    expect(sum('HOR.COLUMN.H-30')).toBeCloseTo(4 * 0.16 * 3, 9);
    expect(sum('HOR.BEAM.H-30')).toBeCloseTo(0.18 * (6 + 6 + 5 + 5), 9);
    expect(sum('ENC.BEAM')).toBeCloseTo((0.3 + 2 * 0.6) * 22, 9);
    expect(sum('HOR.STAIR')).toBeGreaterThan(0.5);
    expect(items.some((i) => i.code.startsWith('ACE.D') && i.byLevel.E1)).toBe(true);

    saveBase({ id: 'b1', name: 'Rosario 10/2026', location: 'Rosario', currency: 'ARS', date: '2026-10-01', locationFactor: 1.05, prices: {} });
    expect(importPrices('b1', 'HOR.BEAM.H-30;150.000,00\nHOR.COLUMN.H-30;150000\nENC.BEAM;12.500\nnope')).toEqual({ read: 3, skipped: 1 });
    let b = currentBudget();
    const beamLine = b.chapters.find((c) => c.chapter === 'concrete')!.lines.find((l) => l.item.code === 'HOR.BEAM.H-30')!;
    expect(beamLine.unitPrice).toBeCloseTo(157500, 6);
    expect(b.missing).toContain('HOR.STAIR');
    const direct = b.directCost;
    setShares({ overheads: 0.1, financial: 0, profit: 0.1, tax: 0.21 });
    b = currentBudget();
    expect(b.total).toBeCloseTo(direct * 1.1 * 1.1 * 1.21, 4);

    const sheets = budgetSheets(tr);
    expect(sheets.map((s) => s.name)).toEqual(['Budget', 'Takeoff']);
    // Levels as the model names them (no grid stored: N1), and the stair by its name.
    expect(sheets[1]!.rows[0]).toEqual(expect.arrayContaining(['N1', 'E1']));
    expect(budgetCsvText(tr, 'es').split('\n')[0]).toBe('bud.col.chapter;bud.col.code;bud.col.item;bud.col.unit;bud.col.quantity;bud.col.price;bud.col.amount');

    // The memoria's quantities read the same measurement.
    const q = memoriaInput((k) => k, 'en').quantities;
    expect(q.byType.find((t) => t.kind === 'beam')!.concrete).toBeCloseTo(sum('HOR.BEAM.H-30'), 9);
  });
});
