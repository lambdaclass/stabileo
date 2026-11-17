import { defaultDesignData } from '../../model/design-data';
import { withCirsocCovers } from '../../rc-sheets/cover-data';
/**
 * Under the seismic provisions the sheets grow a column's bars, within the 6 % chapter 18 allows,
 * until the joints it frames hold ΣMnc ≥ 1.2·ΣMnb with the beams' bars as the joint check reads them
 * (§18.7.3.2); a column that cannot within it fails and says the section is to grow.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { uiStore } from '../ui.svelte';
import { historyStore } from '../history.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows, redesignerOf, setRcOption, setSheetCode } from '../rc-sheets.svelte';
import { resizeHints } from '../rc-sheets-resize';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); resultsStore.clear();
  modelStore.setDesignData(withCirsocCovers(defaultDesignData()));
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = false;
});
afterEach(() => { uiStore.analysisMode = '3d'; });

/** Two storeys of a two-bay frame: `col` m square columns, 30×70 beams carrying `q` kN/m of D, an earthquake case pushing each floor sideways. */
function frame(col: number, q: number) {
  const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
  const cs = modelStore.addSection({ name: 'C', a: col * col, iy: col ** 4 / 12, iz: col ** 4 / 12, j: 0.1406 * col ** 4, b: col, h: col, shape: 'rect' } as never);
  const bm = modelStore.addSection({ name: '30×70', a: 0.21, iy: 0.3 * 0.7 ** 3 / 12, iz: 0.7 * 0.3 ** 3 / 12, j: 0.005, b: 0.3, h: 0.7, shape: 'rect' } as never);
  const xs = [0, 6, 12], zs = [0, 3, 6];
  const node = zs.map((z) => xs.map((x) => modelStore.addNode(x, 0, z)));
  const D = modelStore.model.loadCases.find((c) => c.type === 'D')!.id;
  const E = modelStore.addLoadCase('E', 'E');
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < 3; i++) { const c = modelStore.addElement(node[k]![i]!, node[k + 1]![i]!, 'frame'); modelStore.updateElementSection(c, cs); modelStore.updateElementMaterial(c, conc); }
    for (let i = 0; i < 2; i++) {
      const b = modelStore.addElement(node[k + 1]![i]!, node[k + 1]![i + 1]!, 'frame');
      modelStore.updateElementSection(b, bm); modelStore.updateElementMaterial(b, conc);
      modelStore.addDistributedLoad3D(b, 0, 0, -q, -q, undefined, undefined, D);
    }
    modelStore.addNodalLoad3D(node[k + 1]![0]!, 60 * (k + 1), 0, 0, 0, 0, 0, E);
  }
  for (const n of node[0]!) modelStore.addSupport(n, 'fixed3d');
  modelStore.addCombination('1.2D + E', [{ caseId: D, factor: 1.2 }, { caseId: E, factor: 1 }]);
  modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
  recognizePhysicalElements();
  resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
  publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
  setSheetCode('cirsoc201-2025');
  setRcOption('seismic', true);
}

const scwb = (r: { verifications: Array<{ label: string; ok: boolean }> }) => r.verifications.find((v) => v.label === 'rcSheets.v.seisScwb');

describe('strong column, weak beam in the column proposal', () => {
  it('grows the columns at every joint below the roof until ΣMnc ≥ 1.2·ΣMnb', () => {
    frame(0.4, 60);
    const rows = buildSheetRows();
    const checked = rows.column.filter((r) => scwb(r));
    expect(checked.length).toBeGreaterThan(0);
    for (const r of checked) expect(scwb(r)!.ok, `${r.name} ${r.level}`).toBe(true);
    expect(rows.column.every((r) => r.checks.area <= 0.06 * r.b * r.h * 1e4 + 1e-6)).toBe(true);
  });

  it('fails a column that cannot within 6 % and points to a larger section', () => {
    frame(0.3, 80);
    const rows = buildSheetRows();
    const short = rows.column.filter((r) => r.verifications.some((v) => v.label === 'rcSheets.v.seisColMn' && !v.ok));
    expect(short.length).toBeGreaterThan(0);
    for (const r of short) {
      expect(r.status).toBe('fail');
      const hint = resizeHints(r).find((h) => h.what === 'column');
      expect(hint?.direction).toBe('grow');
      expect(hint!.to).not.toBeNull();
      expect(Math.min(...hint!.to!)).toBeGreaterThan(0.3);
    }
  });

  it('sizes a column whose joint fails in shear with the joint checked, not the column alone', () => {
    frame(0.3, 80);
    const rows = buildSheetRows();
    const joint = rows.column.filter((r) => r.verifications.some((v) => v.label === 'rcSheets.v.seisJoint' && !v.ok));
    expect(joint.length).toBeGreaterThan(0);
    for (const r of joint) {
      const hint = resizeHints(r).find((h) => h.what === 'column')!;
      expect(hint.to).not.toBeNull();
      const [b, h] = hint.to!;
      const grown = redesignerOf(r.key)!({ ...r.demand, b, h } as never) as typeof r;
      expect(grown.verifications.find((v) => v.label === 'rcSheets.v.seisJoint')?.ok, `${r.name} ${r.level} at ${b} × ${h}`).toBe(true);
    }
  });
});
