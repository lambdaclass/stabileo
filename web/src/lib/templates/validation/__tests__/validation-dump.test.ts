/**
 * The seven validation models, solved as the app solves them, against their baselines.
 *
 * Each model's maxima (every component, where it occurs and under which result) and its statics
 * (applied, reactions and residual per case and combination) are fixed in `baselines/`, so a
 * change anywhere between the model files and the workbook that moves a result shows here, with
 * the row that moved. A deliberate change re-records them: `STABILEO_UPDATE_BASELINES=1`.
 *
 * With `STABILEO_REF_DIR` set, each model's whole project workbook at 13 stations is written
 * there as CSV (`stabileo/<model>/<sheet>.csv`): every case and combination, every node, every
 * member at 0, L/12 … L. That is what the comparison outside the repository reads.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import { uiStore } from '../../../store/ui.svelte';
import '../../../store';
import { initSolver } from '../../../engine/wasm-solver';
import { solveCombinations3D } from '../../../engine/solver-service';
import { publishCombinations3D } from '../../../store/active-results';
import { currentWorkbookSheets } from '../../../store/project-workbook';
import { toCsv } from '../../../engine/result-tables';
import { VALIDATION_MODELS, loadValidationModel, type ValidationModelId } from '../index';

const REF = process.env.STABILEO_REF_DIR;
const UPDATE = process.env.STABILEO_UPDATE_BASELINES === '1';
const BASELINES = fileURLToPath(new URL('../baselines/', import.meta.url));

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; modelStore.clear(); historyStore.clear(); });

type Cell = string | number;
/** The rows a baseline keeps: Maxima and Statics, header first. */
interface Baseline { maxima: Cell[][]; statics: Cell[][] }

/** Equal to the baseline: text exactly, numbers to 1e-9 of the column's scale. */
function sameRows(label: string, got: Cell[][], want: Cell[][]) {
  expect(got.length, `${label}: rows`).toBe(want.length);
  const scale = (c: number) => Math.max(1e-12, ...want.slice(1).map((r) => (typeof r[c] === 'number' ? Math.abs(r[c] as number) : 0)));
  want.forEach((w, i) => {
    w.forEach((v, c) => {
      const g = got[i]![c];
      if (typeof v === 'number' && typeof g === 'number') expect(Math.abs(g - v), `${label}, row ${i} "${want[0]![c]}": ${g} against ${v}`).toBeLessThanOrEqual(1e-9 * scale(c));
      else expect(g, `${label}, row ${i} "${want[0]![c]}"`).toEqual(v);
    });
  });
}

async function solved(id: ValidationModelId) {
  await loadValidationModel(id);
  if (modelStore.combinations.length > 0) {
    const r = modelStore.solveCombinations3D(true, false, true);
    if (!r || typeof r === 'string') throw new Error(`${id}: ${String(r)}`);
    publishCombinations3D(r);
    return;
  }
  // No combinations of its own (03, 06): its cases, each solved alone, and nothing combined.
  const cases = modelStore.model.loadCases;
  const one = cases.map((c, i) => ({ id: 100000 + i, name: c.name, factors: [{ caseId: c.id, factor: 1 }] }));
  const md = {
    nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports, loads: modelStore.loads,
    materials: modelStore.materials, sections: modelStore.sections, plates: modelStore.plates, quads: modelStore.quads,
    constraints: modelStore.model.constraints, analysis: modelStore.analysis, groups: modelStore.model.groups,
  };
  const r = solveCombinations3D(md as never, cases, one as never, true, false);
  if (!r || typeof r === 'string') throw new Error(`${id}: ${String(r)}`);
  publishCombinations3D({ perCase: r.perCase, perCombo: new Map(), envelope: r.envelope });
}

describe.each(Object.keys(VALIDATION_MODELS) as ValidationModelId[])('%s', (id) => {
  it('matches its baseline' + (REF ? ', and writes its workbook' : ''), async () => {
    await solved(id);
    // The baseline reads the results only, at 5 stations, which is quick for every model.
    const sheets = currentWorkbookSheets(5, { model: false });
    const pick = (name: string) => sheets.find((s) => s.name === name)?.rows ?? [];
    const got: Baseline = { maxima: pick('Maxima'), statics: pick('Statics') };
    const file = join(BASELINES, `${id}.json`);
    if (UPDATE || !existsSync(file)) {
      if (!UPDATE) throw new Error(`${id}: no baseline; record it with STABILEO_UPDATE_BASELINES=1`);
      mkdirSync(BASELINES, { recursive: true });
      writeFileSync(file, JSON.stringify(got) + '\n');
    }
    const want = JSON.parse(readFileSync(file, 'utf8')) as Baseline;
    sameRows(`${id} maxima`, got.maxima, want.maxima);
    sameRows(`${id} statics`, got.statics, want.statics);

    if (REF) {
      const dir = join(REF, 'stabileo', id);
      mkdirSync(dir, { recursive: true });
      for (const s of currentWorkbookSheets(13)) writeFileSync(join(dir, `${s.name}.csv`), toCsv(s.rows[0]!.map(String), s.rows.slice(1)) + '\n');
    }
  }, 600_000);
});
