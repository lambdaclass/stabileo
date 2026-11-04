import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { modelStore, resultsStore, uiStore } from '../../store/index';
import { currentWorkbookParts, streamWorkbookZip, workbookEstimate } from '../../store/project-workbook';
import { initSolver } from '../../engine/wasm-solver';
import { toCsv } from '../../engine/result-tables';
import { isStreamed, materialize, partSize } from '../workbook-cells';
import { assertExportCurrent, captureProvenanceToken, ExportChangedError } from '../../store/result-provenance';

beforeAll(async () => { await initSolver(); });

/** A portal under a slab of four quads, with two cases and two combinations, solved. */
function solvedPortalWithSlab(): void {
  uiStore.analysisMode = 'pro';
  modelStore.clear(); resultsStore.clear();
  for (const c of [...modelStore.model.combinations]) modelStore.removeCombination(c.id);
  for (const c of [...modelStore.model.loadCases].filter((c) => c.id > 1)) modelStore.removeLoadCase(c.id);
  const w = modelStore.addLoadCase('W', 'W');
  const at = new Map<string, number>();
  for (const z of [0, 3]) for (const [x, y] of [[0, 0], [4, 0], [4, 4], [0, 4]]) at.set(`${x},${y},${z}`, modelStore.addNode(x, y, z));
  for (const [x, y] of [[0, 0], [4, 0], [4, 4], [0, 4]]) {
    modelStore.addElement(at.get(`${x},${y},0`)!, at.get(`${x},${y},3`)!);
    modelStore.addSupport(at.get(`${x},${y},0`)!, 'fixed3d' as never);
  }
  const top = [[0, 0], [4, 0], [4, 4], [0, 4]].map(([x, y]) => at.get(`${x},${y},3`)!);
  for (let i = 0; i < 4; i++) modelStore.addElement(top[i]!, top[(i + 1) % 4]!);
  const mid = modelStore.addNode(2, 2, 3), e1 = modelStore.addNode(2, 0, 3), e2 = modelStore.addNode(4, 2, 3), e3 = modelStore.addNode(2, 4, 3), e4 = modelStore.addNode(0, 2, 3);
  const mat = [...modelStore.materials.keys()][0]!;
  modelStore.addQuad([top[0]!, e1, mid, e4], mat, 0.12);
  modelStore.addQuad([e1, top[1]!, e2, mid], mat, 0.12);
  modelStore.addQuad([mid, e2, top[2]!, e3], mat, 0.12);
  modelStore.addQuad([e4, mid, e3, top[3]!], mat, 0.12);
  modelStore.addNodalLoad3D(mid, 0, 0, -20, 0, 0, 0, 1);
  modelStore.addNodalLoad3D(top[0]!, 8, 0, 0, 0, 0, 0, w);
  modelStore.addCombination('1.4 D', [{ caseId: 1, factor: 1.4 }]);
  modelStore.addCombination('1.2 D + 1.6 W', [{ caseId: 1, factor: 1.2 }, { caseId: w, factor: 1.6 }]);
  const r = modelStore.solveCombinations3D(false, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  resultsStore.setCombinationResults3D(r.perCase, r.perCombo, r.envelope);
  const single = modelStore.solve3D(false, false, true);
  if (!single || typeof single === 'string') throw new Error(String(single));
}

describe('the workbook written as it is produced', () => {
  beforeEach(solvedPortalWithSlab);

  it('the zip holds, sheet by sheet, the same CSV the sheets give', async () => {
    const parts = currentWorkbookParts(5);
    const sheets = parts.map(materialize);
    const files = unzipSync(new Uint8Array(await (await streamWorkbookZip(parts)).arrayBuffer()));
    const names = Object.keys(files).sort();
    expect(names.length).toBe(sheets.length);
    sheets.forEach((s, i) => {
      const file = names[i]!;
      expect(file).toBe(`${String(i + 1).padStart(2, '0')}-${s.name}.csv`);
      expect(strFromU8(files[file]!)).toBe(toCsv(s.rows[0]!.map(String), s.rows.slice(1)));
    });
    expect(names.some((n) => n.endsWith('ShellCentres.csv'))).toBe(true);
  });

  it('an edit while the rows are written abandons the zip instead of mixing two states', async () => {
    const token = captureProvenanceToken();
    const long = { name: 'Long', header: ['n'], count: () => 50_000, body: function* () { for (let i = 0; i < 50_000; i++) yield [i]; } };
    const section = [...modelStore.sections.keys()][0]!;
    setTimeout(() => modelStore.updateSection(section, { a: 0.5 }), 0);
    await expect(streamWorkbookZip([long as never], (last) => assertExportCurrent(token, !last))).rejects.toBeInstanceOf(ExportChangedError);
  });

  it('an unchanged project writes the whole zip with the check on', async () => {
    const token = captureProvenanceToken();
    const long = { name: 'Long', header: ['n'], count: () => 50_000, body: function* () { for (let i = 0; i < 50_000; i++) yield [i]; } };
    const files = unzipSync(new Uint8Array(await (await streamWorkbookZip([long as never], (last) => assertExportCurrent(token, !last))).arrayBuffer()));
    expect(strFromU8(files['01-Long.csv']!).split('\n')).toHaveLength(50_001);
  });

  it('counts the streamed sheets exactly before producing them, and the deferred ones from above', () => {
    for (const p of currentWorkbookParts(5)) {
      if (!isStreamed(p)) continue;
      const rows = [...p.body()].length;
      if (p.name === 'Maxima' || p.name === 'Envelope') expect(p.count(), p.name).toBeGreaterThanOrEqual(rows);
      else expect(p.count(), p.name).toBe(rows);
    }
  });

  it('estimates without producing a row, and calls an xlsx what fits in one', () => {
    let produced = 0;
    const parts = currentWorkbookParts(5);
    for (const p of parts) if (isStreamed(p)) { const body = p.body; p.body = function* () { produced++; yield* body.call(p); }; }
    parts.reduce((n, p) => n + partSize(p).cells, 0);
    expect(produced).toBe(0);
    const est = workbookEstimate(5);
    expect(est.cells).toBeGreaterThan(0);
    expect(est.xlsx).toBe(true);
  });
});
