import { afterEach, beforeAll, expect, it } from 'vitest';
import { modelStore, uiStore } from '../../store';
import { axesStore } from '../../axes/axes.svelte';
import { allChoices } from '../../axes/frame';
import { initSolver } from '../../engine/wasm-solver';
import { currentWorkbookSheets } from '../../store/project-workbook';
import { parseWorkbook } from '../../excel-import/parse';
import { applyWorkbook } from '../../excel-import/apply';
import { buildSolverInput2D, buildSolverInput3D } from '../../engine/solver-service';

beforeAll(async () => { await initSolver(); });
afterEach(() => { modelStore.clear(); axesStore.reset(); });

for (const space of [false, true]) it.skip('known wrong result: #2259 LoadData round trips physical forces and moments in ' + (space ? '3D' : '2D'), () => {
  uiStore.analysisMode = space ? 'pro' : '2d';
  uiStore.includeSelfWeight = false;
  modelStore.clear();
  const a = modelStore.addNode(0, 0, ...(space ? [0] : [])), b = modelStore.addNode(4, 2, ...(space ? [3] : []));
  const e = modelStore.addElement(a, b);
  modelStore.addSupport(a, space ? 'fixed3d' : 'fixed');
  if (space) {
    modelStore.addNodalLoad3D(b, 5, 2, -1, 3, -7, 11);
    modelStore.addDistributedLoad3D(e, 2, 3, -5, -7, undefined, undefined, undefined, { frame: 'global', qXI: 11, qXJ: 13 });
    modelStore.addDistributedLoad3D(e, -2, 3, 5, -7);
  } else {
    modelStore.addNodalLoad(b, 5, -7, 11);
    modelStore.addDistributedLoad(e, -5, -7, 30, true);
    modelStore.addDistributedLoad(e, 2, 3, -30, false);
    modelStore.addPointLoadOnElement(e, 1, -3, { isGlobal: true, angle: -30, my: 7 });
  }
  const original = JSON.parse(JSON.stringify(modelStore.loads));
  const build = () => space ? buildSolverInput3D(modelStore.model, false)!.loads : buildSolverInput2D(modelStore.model, false)!.loads;
  const expected = build();
  for (const choice of allChoices()) {
    axesStore.choice = choice;
    const sheets = Object.fromEntries(currentWorkbookSheets(2, { results: false }).map(s => [s.name, s.rows as unknown[][]]));
    const parsed = parseWorkbook(sheets);
    expect(parsed.unknownSheets).not.toContain('LoadData');
    expect(parsed.problems.filter(p => p.sheet === 'LoadData')).toEqual([]);
    expect(parsed.model.loads).toEqual(original);
    applyWorkbook(sheets);
    expect(build()).toEqual(expected);
  }
});
