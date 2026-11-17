import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { uiStore } from '../ui.svelte';
import { historyStore } from '../history.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows } from '../rc-sheets.svelte';
import type { AnalysisResults3D } from '../../engine/types-3d';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); resultsStore.clear();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = false;
});
afterEach(() => { uiStore.analysisMode = '3d'; });

function solve(edit: (combos: Map<number, AnalysisResults3D>) => void = () => {}) {
  recognizePhysicalElements();
  const all = modelStore.solve3D(false, false, true); if (!all || typeof all === 'string') throw new Error(String(all));
  resultsStore.setResults3D(all);
  const r = modelStore.solveCombinations3D(false, false, true); if (!r || typeof r === 'string') throw new Error(String(r));
  edit((r as { perCombo: Map<number, AnalysisResults3D> }).perCombo);
  publishCombinations3D(r);
}

const conc = () => modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
const rect = (b: number, h: number) => modelStore.addSection({ name: `${b * 100}×${h * 100}`, a: b * h, iy: b * h ** 3 / 12, iz: h * b ** 3 / 12, j: 0.14 * Math.min(b, h) ** 3 * Math.max(b, h), b, h, shape: 'rect' } as never);

/** A 6 m 30×60 beam on two 40×40 columns, 3 m high, 30 kN/m D under 1.4D and 1.2D. */
function portal() {
  const m = conc(), col = rect(0.4, 0.4), bm = rect(0.3, 0.6);
  const [a, b, c, d] = [[0, 0], [6, 0], [0, 3], [6, 3]].map(([x, z]) => modelStore.addNode(x!, 0, z!));
  for (const n of [a!, b!]) modelStore.addSupport(n, 'fixed3d');
  const set = (e: number, s: number) => { modelStore.updateElementSection(e, s); modelStore.updateElementMaterial(e, m); return e; };
  const cols = [set(modelStore.addElement(a!, c!, 'frame'), col), set(modelStore.addElement(b!, d!, 'frame'), col)];
  const beam = set(modelStore.addElement(c!, d!, 'frame'), bm);
  const D = modelStore.model.loadCases.find((x) => x.type === 'D')!.id;
  modelStore.addDistributedLoad3D(beam, 0, 0, -30, -30, undefined, undefined, D, { frame: 'global' });
  modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
  modelStore.addCombination('1.2D', [{ caseId: D, factor: 1.2 }]);
  return { beam, cols };
}

describe('the forces the sheets read', () => {
  it('fails a beam and a column whose forces one combination lacks, naming it, instead of reading the rest', () => {
    const { beam, cols } = portal();
    solve((combos) => {
      const [id, r] = [...combos][1]!;
      combos.set(id, { ...r, elementForces: r.elementForces.filter((f) => f.elementId !== beam && f.elementId !== cols[0]) });
    });
    const rows = buildSheetRows();
    const b = rows.beam[0]!, line = rows.line[0]!;
    const col = rows.column.find((r) => r.demand.missing)!;
    for (const r of [b, line, col]) {
      const v = r.verifications.find((x) => x.label === 'rcSheets.v.forcesMissing')!;
      expect(v.ok).toBe(false);
      expect(v.demand).toBe('1.2D');
      expect(r.status).toBe('fail');
    }
    expect(rows.column.filter((r) => !r.demand.missing).every((r) => !r.verifications.some((v) => v.label === 'rcSheets.v.forcesMissing'))).toBe(true);
  });

  it('checks a column for a moment between its ends larger than at either', () => {
    const m = conc(), col = rect(0.4, 0.4);
    const a = modelStore.addNode(0, 0, 0), mid = modelStore.addNode(0, 0, 1.5), c = modelStore.addNode(0, 0, 3);
    const e1 = modelStore.addElement(a, mid, 'frame'), e2 = modelStore.addElement(mid, c, 'frame');
    for (const e of [e1, e2]) { modelStore.updateElementSection(e, col); modelStore.updateElementMaterial(e, m); }
    modelStore.toggleHinge3D(e1, 'start');
    modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(c, 'pinned3d');
    const D = modelStore.model.loadCases.find((x) => x.type === 'D')!.id;
    modelStore.addNodalLoad3D(mid, 40, 0, -200, 0, 0, 0, D);
    modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
    solve();
    const r = buildSheetRows().column[0]!;
    const k = r.demand.cases[0]!;
    expect(Math.max(Math.abs(k.mxTop), Math.abs(k.mxBot), Math.abs(k.myTop), Math.abs(k.myBot))).toBeLessThan(1);
    const inner = k.inner![0]!;
    expect(Math.max(Math.abs(inner.mx), Math.abs(inner.my))).toBeCloseTo(1.4 * 40 * 3 / 4, 0);
    expect(r.checks.ratio).toBeGreaterThan(0.05);
  });
});
