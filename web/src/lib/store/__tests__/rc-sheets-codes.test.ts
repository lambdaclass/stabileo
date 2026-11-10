import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { uiStore } from '../ui.svelte';
import { historyStore } from '../history.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows, setAdopted, setSheetCode, sheetCode } from '../rc-sheets.svelte';
import { setForeignCodes } from '../foreign-design';
import { SHEET_CODE_LIST, SHEET_CODES } from '../../rc-sheets/types';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); resultsStore.clear();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = false;
});
afterEach(() => { uiStore.analysisMode = '3d'; });

/** A 6 m 30×60 beam on two 40×40 columns, 3 m high; 30 kN/m D and 10 kN/m L, 1.2D+1.6L. */
function portal() {
  const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
  const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' } as never);
  const bm = modelStore.addSection({ name: '30×60', a: 0.18, iy: 0.3 * 0.6 ** 3 / 12, iz: 0.6 * 0.3 ** 3 / 12, j: 0.0037, b: 0.3, h: 0.6, shape: 'rect' } as never);
  const [a, b, c, d] = [[0, 0], [6, 0], [0, 3], [6, 3]].map(([x, z]) => modelStore.addNode(x!, 0, z!));
  for (const n of [a!, b!]) modelStore.addSupport(n, 'fixed3d');
  const set = (e: number, s: number) => { modelStore.updateElementSection(e, s); modelStore.updateElementMaterial(e, conc); };
  set(modelStore.addElement(a!, c!, 'frame'), col); set(modelStore.addElement(b!, d!, 'frame'), col);
  const beam = modelStore.addElement(c!, d!, 'frame'); set(beam, bm);
  const D = modelStore.model.loadCases.find((x) => x.type === 'D')!.id, L = modelStore.model.loadCases.find((x) => x.type === 'L')!.id;
  modelStore.addDistributedLoad3D(beam, 0, 0, -30, -30, undefined, undefined, D, { frame: 'global' });
  modelStore.addDistributedLoad3D(beam, 0, 0, -10, -10, undefined, undefined, L, { frame: 'global' });
  modelStore.addCombination('1.2D+1.6L', [{ caseId: D, factor: 1.2 }, { caseId: L, factor: 1.6 }]);
  recognizePhysicalElements();
  const all = modelStore.solve3D(false, false, true); if (!all || typeof all === 'string') throw new Error(String(all));
  resultsStore.setResults3D(all);
  const r = modelStore.solveCombinations3D(false, false, true); if (!r || typeof r === 'string') throw new Error(String(r));
  publishCombinations3D(r);
}

describe('the code the sheets design to', () => {
  it('follows the project\'s concrete code until one is chosen for the sheets', () => {
    expect(sheetCode()).toBe('cirsoc201-2025');
    setForeignCodes({ concrete: 'ec2-uk' });
    expect(sheetCode()).toBe('bs-en1992-1-1');
    setSheetCode('ts500-2000');
    expect(sheetCode()).toBe('ts500-2000');
    setForeignCodes({ concrete: 'aci318' });
    expect(sheetCode()).toBe('ts500-2000');
  });

  it('switches between every code with one call, keeping the adopted bars and verifying them again', () => {
    portal();
    const first = buildSheetRows();
    const beam = first.beam[0]!;
    setAdopted(beam.key, beam.proposed);
    for (const code of SHEET_CODE_LIST) {
      setSheetCode(code);
      const rows = buildSheetRows();
      expect(rows.code).toBe(SHEET_CODES[code].name);
      const b = rows.beam.find((r) => r.key === beam.key)!;
      expect(b.isAdopted).toBe(true);
      expect(JSON.stringify(b.adopted.bottom)).toBe(JSON.stringify(beam.proposed.bottom));
      expect(rows.column.length).toBe(first.column.length);
      expect(b.verifications.length).toBeGreaterThan(0);
    }
  });

  it('designs to ACI 318-19 with the provisions CIRSOC 201-2025 adopts from it: the same bars and the same capacities', () => {
    portal();
    setSheetCode('cirsoc201-2025');
    const cirsoc = buildSheetRows();
    setSheetCode('aci318-19');
    const aci = buildSheetRows();
    expect(aci.code).toBe('ACI 318-19');
    expect(aci.beam.map((r) => r.proposed)).toEqual(cirsoc.beam.map((r) => r.proposed));
    expect(aci.beam.map((r) => r.flexure.map((f) => f.phiMn))).toEqual(cirsoc.beam.map((r) => r.flexure.map((f) => f.phiMn)));
    expect(aci.column.map((r) => r.proposed)).toEqual(cirsoc.column.map((r) => r.proposed));
  });
});
