import { afterEach, beforeAll, expect, it } from 'vitest';
import { modelStore, uiStore } from '../../store';
import { axesStore } from '../../axes/axes.svelte';
import { allChoices, planeSigns } from '../../axes/frame';
import { initSolver, solve, solve3D, solvePDelta, solvePDelta3D } from '../../engine/wasm-solver';
import { currentWorkbookSheets } from '../../store/project-workbook';
import { parseWorkbook } from '../../excel-import/parse';
import { applyWorkbook } from '../../excel-import/apply';
import { buildSolverInput2D, buildSolverInput3D } from '../../engine/solver-service';

beforeAll(async () => { await initSolver(); });
afterEach(() => { modelStore.clear(); axesStore.reset(); });

for (const space of [false, true]) it('known wrong result: #2259 LoadData round trips physical forces and moments in ' + (space ? '3D' : '2D'), () => {
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
    modelStore.addDistributedLoad3D(e, 2, 3, 5, -7, 0.5, 1.5, 1, { frame: 'projected', qXI: 1, qXJ: 2 });
  } else {
    modelStore.addNodalLoad(b, 5, -7, 11);
    modelStore.addDistributedLoad(e, -5, -7, 30, true);
    modelStore.addDistributedLoad(e, 2, 3, -30, false, 1, 0.5, 1.5);
    modelStore.addPointLoadOnElement(e, 1, -3, { isGlobal: true, angle: -30, my: 7 });
  }
  modelStore.addThermalLoad(e, 2, 3, 1);
  const original = JSON.parse(JSON.stringify(modelStore.loads));
  const build = () => space ? buildSolverInput3D(modelStore.model, false)!.loads : buildSolverInput2D(modelStore.model, false)!.loads;
  const expected = build();
  const analyze = () => {
    const input = space ? buildSolverInput3D(modelStore.model, false)! : buildSolverInput2D(modelStore.model, false)!;
    const linear = space ? solve3D(input as never) : solve(input as never);
    const nonlinear = space ? solvePDelta3D(input as never) : solvePDelta(input as never);
    expect(linear.displacements.length).toBeGreaterThan(0);
    expect(nonlinear.converged).toBe(true);
    return [linear, nonlinear].map(r => ({ displacements: r.displacements, reactions: r.reactions, elementForces: r.elementForces }));
  };
  const answers = analyze();
  for (const choice of allChoices()) {
    axesStore.choice = choice;
    const sheets = Object.fromEntries(currentWorkbookSheets(2, { results: false }).map(s => [s.name, s.rows as unknown[][]]));
    const parsed = parseWorkbook(sheets);
    expect(parsed.unknownSheets).not.toContain('LoadData');
    expect(parsed.problems.filter(p => p.sheet === 'LoadData')).toEqual([]);
    expect(parsed.model.loads).toEqual(original);
    applyWorkbook(sheets);
    expect(build()).toEqual(expected);
    expect(analyze()).toEqual(answers);
  }
});

it('LoadData refuses malformed loads as a whole and preserves a valid zero load', () => {
  uiStore.analysisMode = 'pro'; modelStore.clear(); axesStore.reset();
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(1, 2, 3);
  modelStore.addElement(a, b);
  modelStore.addNodalLoad3D(b, 0, 0, 0, 0, 0, 0, 1);
  const sheets = Object.fromEntries(currentWorkbookSheets(2, { results: false }).map(s => [s.name, s.rows as unknown[][]]));
  const original = sheets.LoadData!;
  const copy = () => original.map(row => [...row]);
  const check = (rows: unknown[][]) => parseWorkbook({ ...sheets, LoadData: rows });
  expect(check(original).problems.filter(p => p.sheet === 'LoadData')).toEqual([]);
  expect(check(original).model.loads).toEqual(modelStore.loads);
  for (const mutation of [
    (r: unknown[][]) => { r.push([...r[1]!]); },
    (r: unknown[][]) => { r.splice(1, 1); },
    (r: unknown[][]) => { r[1]![7] = 'bad'; },
    (r: unknown[][]) => { r[1]![7] = Infinity; },
    (r: unknown[][]) => { r[1]![8] = 'm'; },
    (r: unknown[][]) => { r[1]![8] = ''; },
    (r: unknown[][]) => { r[1]![6] = 'unexpected'; },
    (r: unknown[][]) => { r[1]![2] = 'pointOnElement3d'; },
    ...['constructor', '__proto__', 'toString'].map(type => (r: unknown[][]) => { r[1]![2] = type; }),
    (r: unknown[][]) => { r[1]![3] = 999; },
    (r: unknown[][]) => { r[1]![1] = 999; },
    (r: unknown[][]) => { r[1]![0] = 0; },
    (r: unknown[][]) => { r[1]![0] = -1; },
    (r: unknown[][]) => { r[1]![0] = Number.MAX_SAFE_INTEGER + 1; },
    (r: unknown[][]) => { r[0]![0] = 'case'; },
  ]) {
    const rows = copy(); mutation(rows);
    const parsed = check(rows);
    expect(parsed.problems.some(p => p.sheet === 'LoadData')).toBe(true);
    expect(parsed.model.loads).toEqual([]);
  }
  for (const id of [1, Number.MAX_SAFE_INTEGER]) {
    const rows = copy(); rows.slice(1).forEach(r => { r[0] = id; });
    expect(check(rows).model.loads[0]!.data.id).toBe(id);
    expect(check(rows).problems.filter(p => p.sheet === 'LoadData')).toEqual([]);
  }
  const units = copy(); units[1]![7] = 2000; units[1]![8] = 'N';
  expect(check(units).model.loads[0]!.data.fx).toBe(2);
  const both = parseWorkbook({ ...sheets, Loads: [['type'], ['nodal3d']] });
  expect(both.problems.some(p => p.sheet === 'LoadData')).toBe(true);
  expect(both.model.loads).toEqual([]);
});

it('a framed 2D workbook keeps the empty depth column and round trips independent plane spring stiffnesses', () => {
  uiStore.analysisMode = '2d';
  modelStore.clear();
  const node = modelStore.addNode(2, 3, 0);
  modelStore.addSupport(node, 'spring', { kx: 13, ky: 17, kz: 19 }, { dx: 0.002, dz: -0.003, dry: 0.004 });
  const original = [...modelStore.supports.values()][0]!;
  for (const choice of allChoices()) {
    axesStore.choice = choice;
    if (axesStore.frame.identity) continue;
    const sheets = Object.fromEntries(currentWorkbookSheets(2, { results: false }).map(s => [s.name, s.rows as unknown[][]]));
    const plane = planeSigns(axesStore.frame);
    const depth = sheets.Nodes![0]!.indexOf(`${plane.n.toLowerCase()} [m]`);
    expect(sheets.Nodes![1]![depth]).toBe('');
    const result = parseWorkbook(sheets);
    expect(result.model.nodes[0]).toMatchObject({ x: 2, y: 3, z: 0 });
    expect(result.model.supports[0]).toMatchObject({
      type: 'spring', kx: original.kx, ky: original.ky, kz: original.kz,
      dx: original.dx, dz: original.dz, dry: original.dry,
    });
  }
});

it.each([undefined, false, true])('round trips the material selection and signed coefficients with userDefined=%s', userDefined => {
  modelStore.clear();
  const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0);
  const member = modelStore.addElement(a, b);
  for (const alpha of [undefined, -5e-6, 0, 7e-6]) {
    const material = modelStore.addMaterial({ name: 'Specimen', e: 173219, nu: 0.27, rho: 76, gradeId: 'iram-f36', userDefined, alpha });
    modelStore.updateElementMaterial(member, material);
    const sheets = Object.fromEntries(currentWorkbookSheets(2, { results: false }).map(s => [s.name, s.rows]));
    expect(applyWorkbook(sheets).problems).toEqual([]);
    const saved = modelStore.materials.get(modelStore.elements.get(member)!.materialId)!;
    expect([saved.gradeId, saved.userDefined, saved.alpha]).toEqual(['iram-f36', userDefined, alpha]);
  }
});

it.each([-0.001, 0.001, 'bad'])('refuses an invalid workbook coefficient %s before replacing the model', alpha => {
  modelStore.clear();
  const node = modelStore.addNode(7, 11);
  const sheets = { Nodes: [['id', 'x', 'y', 'z'], [1, 0, '', 0]],
    Materials: [['id', 'name', 'E', 'nu', 'alpha [1/°C]'], [1, 'Test', 173219, 0.27, alpha]] };
  expect(applyWorkbook(sheets).problems).toContainEqual(expect.objectContaining({ sheet: 'Materials', column: 'alpha', blocking: true }));
  expect(modelStore.nodes.get(node)?.x).toBe(7);
});
