/**
 * The project's placement written into the model: the beams and slabs moved to the level
 * reference, the storeys of a column stack to its fixed point, and a column's clear height, laps
 * and top hook read from where the floor's concrete then stands.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { historyStore } from '../history.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { createPlate, plateEntry, preparePlatesForAnalysis } from '../physical-plates';
import { meshBeforeAnalysis } from '../mesh-policy.svelte';
import { applyPlacement, columnFixedPoint, columnStacks, placementData, setColumnFixedPoint, setLevelReference } from '../placement';
import { buildSheetRows } from '../rc-sheets.svelte';
import { migrateDesignData } from '../../model/design-data';
import { beamDrop, columnShift } from '../../model/placement';
import { stackKey } from '../../rc-sheets/fixed-points';
import { storeyRun, columnStorey, faceSteps, storeyBars } from '../../rc-sheets/column-run';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; modelStore.clear(); historyStore.clear(); resultsStore.clear(); });

/** Two bays of 20 × 50 beams on 30 × 30 columns, 3 m high, a 15 cm slab over the first bay. */
function floor() {
  const conc = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
  const col = modelStore.addSection({ name: '30×30', a: 0.09, iy: 0.3 ** 4 / 12, iz: 0.3 ** 4 / 12, j: 0.1406 * 0.3 ** 4, b: 0.3, h: 0.3, shape: 'rect' } as never);
  const bm = modelStore.addSection({ name: '20×50', a: 0.1, iy: 0.2 * 0.5 ** 3 / 12, iz: 0.5 * 0.2 ** 3 / 12, j: 0.002, b: 0.2, h: 0.5, shape: 'rect' } as never);
  const xy: Array<[number, number]> = [[0, 0], [5, 0], [5, 4], [0, 4]];
  const base = xy.map(([x, y]) => modelStore.addNode(x, y, 0)), top = xy.map(([x, y]) => modelStore.addNode(x, y, 3));
  base.forEach((b, i) => { const c = modelStore.addElement(b, top[i]!, 'frame'); modelStore.updateElementSection(c, col); modelStore.updateElementMaterial(c, conc); modelStore.addSupport(b, 'fixed3d'); });
  const beams = top.map((n, i) => { const e = modelStore.addElement(n, top[(i + 1) % 4]!, 'frame'); modelStore.updateElementSection(e, bm); modelStore.updateElementMaterial(e, conc); return e; });
  const plate = createPlate({ outline: top, materialId: conc, thickness: 0.15 }) as { id: number };
  return { beams, plate: plate.id, conc };
}

const dz = (id: number) => { const o = modelStore.elements.get(id)!.offset; return o?.i?.z ?? 0; };
const plateZ = (id: number) => plateEntry(id)!.surface.offset?.z ?? 0;

describe('the level reference', () => {
  it('drops the beams and slabs so every top is on the level, or only the beams to the slabs\' top, or nothing', () => {
    const { beams, plate } = floor();
    setLevelReference('slabTop');
    expect(beams.map(dz)).toEqual(beams.map(() => -0.25));
    expect(plateZ(plate)).toBeCloseTo(-0.075, 9);
    setLevelReference('slabAxis');
    expect(beams.map(dz)).toEqual(beams.map(() => expect.closeTo(0.075 - 0.25, 9)));
    expect(plateZ(plate)).toBe(0);
    setLevelReference('axes');
    expect(beams.map(dz)).toEqual([0, 0, 0, 0]);
    expect(placementData().reference).toBe('axes');
  });

  it('keeps a beam\'s offset across, owning only its height, and is undone in one step', () => {
    const { beams } = floor();
    modelStore.setElementOffset(beams[0]!, { frame: 'global', i: { x: 0, y: 0.05, z: 0 }, j: { x: 0, y: 0.05, z: 0 } });
    historyStore.clear();
    setLevelReference('slabTop');
    expect(modelStore.elements.get(beams[0]!)!.offset!.i).toEqual({ x: 0, y: 0.05, z: -0.25 });
    historyStore.undo();
    expect(modelStore.elements.get(beams[0]!)!.offset!.i).toEqual({ x: 0, y: 0.05, z: 0 });
  });

  it('follows a beam made deeper at the next analysis, and leaves a project that states none as it is', () => {
    const { beams } = floor();
    modelStore.setElementOffset(beams[1]!, { frame: 'global', i: { x: 0, y: 0, z: 0.1 }, j: { x: 0, y: 0, z: 0.1 } });
    expect(applyPlacement()).toBe(0);
    expect(dz(beams[1]!)).toBe(0.1);
    setLevelReference('slabTop');
    const deep = modelStore.addSection({ name: '20×70', a: 0.14, iy: 0.2 * 0.7 ** 3 / 12, iz: 0.7 * 0.2 ** 3 / 12, j: 0.003, b: 0.2, h: 0.7, shape: 'rect' } as never);
    modelStore.updateElementSection(beams[1]!, deep);
    expect(applyPlacement()).toBe(1);
    expect(dz(beams[1]!)).toBeCloseTo(-0.35, 9);
    expect(beamDrop('slabAxis', 0.12, 0.15)).toBe(0);
  });

  it('gives a column the clear height between the floors\' concrete as it stands, and hooks its bars below the top of the floor', () => {
    floor();
    modelStore.addCombination('1.4D', [{ caseId: modelStore.model.loadCases[0]!.id, factor: 1.4 }]);
    const solve = () => {
      meshBeforeAnalysis.value = true;
      expect(preparePlatesForAnalysis().ok).toBe(true);
      recognizePhysicalElements();
      const r = modelStore.solve3D(false, false, true);
      if (!r || typeof r === 'string') throw new Error(String(r));
      resultsStore.setResults3D(r as never);
      publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
      return buildSheetRows().column[0]!;
    };
    const centred = solve();
    expect(centred.demand.lu).toBeCloseTo(3 - 0.25, 6);
    setLevelReference('slabTop');
    const flush = solve();
    expect(flush.demand.lu).toBeCloseTo(3 - 0.5, 6);
    expect(flush.demand.joints).toMatchObject({ top: expect.closeTo(0.5, 9), topRise: expect.closeTo(0, 9) });
    const rows = buildSheetRows().column;
    expect(storeyRun(flush, columnStorey(rows, flush), 'cirsoc201-2025').top).toBeCloseTo(3 - flush.cover, 6);
    expect(buildSheetRows().slab[0]!.demand.mid, 'the slab\'s bars where its concrete hangs').toBeCloseTo(-0.075, 9);
    expect(() => modelStore.buildSolverInput3D(true, false, { expandMemberOffsets: false })).not.toThrow();
    expect(modelStore.buildSolverInput3D(true, false, { expandMemberOffsets: false })!.quads!.size).toBeGreaterThan(0);
  }, 120_000);
});

describe('the column fixed points', () => {
  it('move each storey above so its point falls on the lowest storey\'s, and read the fixed points the sheets kept', () => {
    const big = modelStore.addSection({ name: '40×40', a: 0.16, iy: 1, iz: 1, j: 1, b: 0.4, h: 0.4, shape: 'rect' } as never);
    const small = modelStore.addSection({ name: '30×30', a: 0.09, iy: 1, iz: 1, j: 1, b: 0.3, h: 0.3, shape: 'rect' } as never);
    const n = [0, 3, 6].map((z) => modelStore.addNode(2, 1, z));
    const low = modelStore.addElement(n[0]!, n[1]!, 'frame'), up = modelStore.addElement(n[1]!, n[2]!, 'frame');
    modelStore.updateElementSection(low, big); modelStore.updateElementSection(up, small);
    const key = stackKey([2, 1]);
    expect(columnStacks()).toEqual([{ key, storeys: [low, up] }]);
    setColumnFixedPoint(key, 'px');
    expect(modelStore.elements.get(up)!.offset!.i).toEqual({ x: 0.05, y: 0, z: 0 });
    expect(modelStore.elements.get(low)!.offset).toBeUndefined();
    setColumnFixedPoint(null, 'nxny');
    expect(modelStore.elements.get(up)!.offset!.i).toEqual({ x: -0.05, y: -0.05, z: 0 });
    setColumnFixedPoint(key, 'c');
    expect(modelStore.elements.get(up)!.offset).toBeUndefined();
    expect(columnFixedPoint(key)).toBe('c');
    expect(columnShift('py', { b: 0.4, h: 0.6, rotDeg: 90, offset: [0, 0] }, { b: 0.3, h: 0.4, rotDeg: 90 })).toEqual([-0.1, 0]);
    expect(migrateDesignData({ rcSheets: { adopted: {}, fixedPoints: { '1,2': 'px' } } }).placement).toEqual({ columns: { '1,2': 'px' } });
    expect(migrateDesignData({ placement: { reference: 'slabTop', columns: { '1,2': 'ny', '3,4': 'up' } } }).placement).toEqual({ reference: 'slabTop', columns: { '1,2': 'ny' } });
  });

  it('step the storey above face by face: flush on the fixed face, its bars cranked by a bar only there and by the whole step on the other', async () => {
    const conc = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
    const big = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' } as never);
    const small = modelStore.addSection({ name: '30×30', a: 0.09, iy: 0.3 ** 4 / 12, iz: 0.3 ** 4 / 12, j: 0.1406 * 0.3 ** 4, b: 0.3, h: 0.3, shape: 'rect' } as never);
    const bm = modelStore.addSection({ name: '20×50', a: 0.1, iy: 0.2 * 0.5 ** 3 / 12, iz: 0.5 * 0.2 ** 3 / 12, j: 0.002, b: 0.2, h: 0.5, shape: 'rect' } as never);
    const cols: number[][] = [];
    for (const x of [0, 5]) {
      const n = [0, 3, 6].map((z) => modelStore.addNode(x, 0, z));
      modelStore.addSupport(n[0]!, 'fixed3d');
      cols.push(n);
      [[0, big], [1, small]].forEach(([k, sec]) => { const e = modelStore.addElement(n[k]!, n[k + 1]!, 'frame'); modelStore.updateElementSection(e, sec); modelStore.updateElementMaterial(e, conc); });
    }
    for (const k of [1, 2]) { const e = modelStore.addElement(cols[0]![k]!, cols[1]![k]!, 'frame'); modelStore.updateElementSection(e, bm); modelStore.updateElementMaterial(e, conc); modelStore.addDistributedLoad3D(e, 0, 0, -40, -40, undefined, undefined, modelStore.model.loadCases[0]!.id); }
    modelStore.addCombination('1.4D', [{ caseId: modelStore.model.loadCases[0]!.id, factor: 1.4 }]);
    setColumnFixedPoint(null, 'nx');
    recognizePhysicalElements();
    resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
    publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
    const rows = buildSheetRows().column, low = rows.find((r) => r.b === 0.4)!;
    expect(low.demand.shift ?? [0, 0]).toEqual([0, 0]);
    const up = rows.find((r) => r.b === 0.3 && Math.abs((modelStore.nodes.get(r.demand.nodes!.bottom)!.x) - modelStore.nodes.get(low.demand.nodes!.bottom)!.x) < 1e-9)!;
    expect(up.demand.shift).toEqual([-0.05, 0]);
    expect(faceSteps(low, up)).toEqual({ pb: 0.1, nb: 0, ph: 0.05, nh: 0.05 });
    const st = columnStorey(rows, low);
    expect(st.e).toBeCloseTo(0.1, 9);
    expect(st.hooked).toBe(true);
    const flush = storeyBars(low, { ...st, cranked: true, hooked: false, up });
    const negFace = flush.filter((b) => b.bar.x < -0.1), posFace = flush.filter((b) => b.bar.x > 0.1);
    expect(Math.max(...negFace.map((b) => Math.abs(b.e * b.toward[0])))).toBeLessThan(0.03);
    expect(Math.min(...posFace.map((b) => Math.abs(b.e * b.toward[0])))).toBeGreaterThan(0.1);
  }, 120_000);
});

