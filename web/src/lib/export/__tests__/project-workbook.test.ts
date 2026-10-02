/**
 * The project workbook against the results it records.
 *
 * A portal frame with a dead and a wind case and two combinations is solved as the app solves it,
 * and its workbook read back: every result at full precision and with the solver's sign, the
 * stations at the ends equal to the end forces, the envelope naming the combination that
 * governs, the statics balanced, no text cell a spreadsheet would take for a formula, and the
 * model sheets readable by the importer. A simply supported beam checks the deflection sheet
 * against 5qL⁴/384EI, and a sheet past the xlsx limit goes to the zip.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import { resultsStore } from '../../store/results.svelte';
import '../../store/index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../../store/active-results';
import { currentWorkbookSheets, workbookZip } from '../../store/project-workbook';
import { eiOf } from '../../engine/member-deflection';
import { parseWorkbook } from '../../excel-import/parse';
import { fitsInXlsx, safeText, XLSX_MAX_ROWS, XLSX_MAX_CELLS, type WorkbookSheet } from '../workbook-cells';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; modelStore.clear(); });

const sheet = (sheets: WorkbookSheet[], name: string) => {
  const s = sheets.find((x) => x.name === name);
  if (!s) throw new Error(`no sheet ${name}: ${sheets.map((x) => x.name).join(', ')}`);
  return s;
};
/** A sheet's rows as objects keyed by header. */
const records = (s: WorkbookSheet) => s.rows.slice(1).map((r) => Object.fromEntries(s.rows[0]!.map((h, i) => [String(h), r[i]])));

function portal() {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3), c = modelStore.addNode(4, 0, 3), d = modelStore.addNode(4, 0, 0);
  modelStore.addElement(a, b, 'frame');
  const beam = modelStore.addElement(b, c, 'frame');
  modelStore.addElement(d, c, 'frame');
  modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(d, 'fixed3d');
  for (const x of [...modelStore.combinations]) modelStore.removeCombination(x.id);
  const dead = modelStore.addLoadCase('D', 'D'), wind = modelStore.addLoadCase('+W', 'W');
  modelStore.addDistributedLoad3D(beam, 0, 0, -10, -10, undefined, undefined, dead);
  modelStore.addNodalLoad3D(b, 5, 0, 0, 0, 0, 0, wind);
  const c1 = modelStore.addCombination('1.2 D + 1.6 W', [{ caseId: dead, factor: 1.2 }, { caseId: wind, factor: 1.6 }]);
  const c2 = modelStore.addCombination('-1.0 W + 0.9 D', [{ caseId: dead, factor: 0.9 }, { caseId: wind, factor: -1 }]);
  const r = modelStore.solveCombinations3D(uiStore.includeSelfWeight, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  publishCombinations3D(r);
  return { beam, dead, wind, c1, c2 };
}

describe('the project workbook', () => {
  it('has a cover, the conventions, the model and every result, in that order', () => {
    portal();
    const names = currentWorkbookSheets(5).map((s) => s.name);
    expect(names.slice(0, 2)).toEqual(['Cover', 'Conventions']);
    for (const n of ['Nodes', 'Members', 'Materials', 'Sections', 'Supports', 'LoadCases', 'LoadData', 'Combinations',
      'Reactions', 'Displacements', 'EndForces', 'Stations', 'Deflections', 'Maxima', 'Envelope', 'Statics']) expect(names).toContain(n);
    expect(names.indexOf('Combinations')).toBeLessThan(names.indexOf('Reactions'));
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n.length).toBeLessThanOrEqual(31);
  });

  it('records every case and combination at full precision, with the solver\'s sign', () => {
    const { c1 } = portal();
    const sheets = currentWorkbookSheets(5);
    const solved = resultsStore.perCombo3D.get(c1)!;
    const ends = records(sheet(sheets, 'EndForces')).filter((r) => r.source === 'combination' && r.sourceId === c1);
    expect(ends).toHaveLength(2 * solved.elementForces.length);
    for (const f of solved.elementForces) {
      const i = ends.find((r) => r.member === f.elementId && r.end === 'i')!;
      const j = ends.find((r) => r.member === f.elementId && r.end === 'j')!;
      expect([i['N [kN]'], i['My [kN·m]'], i['Mz [kN·m]'], i['T [kN·m]']]).toEqual([f.nStart, f.myStart, f.mzStart, f.mxStart]);
      expect([j['Vy [kN]'], j['My [kN·m]'], j['Mz [kN·m]']]).toEqual([f.vyEnd, f.myEnd, f.mzEnd]);
    }
    const reactions = records(sheet(sheets, 'Reactions')).filter((r) => r.sourceId === c1 && r.source === 'combination');
    for (const x of solved.reactions) expect(reactions.find((r) => r.node === x.nodeId)!['My [kN·m]']).toBe(x.my);
    // Each case too.
    expect(new Set(records(sheet(sheets, 'Reactions')).map((r) => `${r.source}:${r.sourceId}`)).size).toBe(resultsStore.perCase3D.size + resultsStore.perCombo3D.size);
  });

  it('reads members at the stations asked for, the ends equal to the end forces', () => {
    const { beam, c1 } = portal();
    const f = resultsStore.perCombo3D.get(c1)!.elementForces.find((x) => x.elementId === beam)!;
    for (const [spec, count] of [[5, 5], [13, 13]] as const) {
      const st = records(sheet(currentWorkbookSheets(spec), 'Stations')).filter((r) => r.sourceId === c1 && r.source === 'combination' && r.member === beam);
      expect(st).toHaveLength(count);
      expect(st[0]!['Mz [kN·m]']).toBeCloseTo(f.mzStart, 9);
      expect(st[count - 1]!['My [kN·m]']).toBeCloseTo(f.myEnd, 9);
      expect(st[count - 1]!['x [m]']).toBeCloseTo(4, 12);
    }
    // Critical: the quarters at least, and the zero-shear point of the uniform load.
    const critical = records(sheet(currentWorkbookSheets('critical'), 'Stations')).filter((r) => r.sourceId === c1 && r.source === 'combination' && r.member === beam);
    expect(critical.length).toBeGreaterThanOrEqual(5);
  });

  it('envelopes each member end with the combination that governs it', () => {
    const { c1, c2 } = portal();
    const env = records(sheet(currentWorkbookSheets(5), 'Envelope')).filter((r) => r.table === 'reactions' && r.component === 'Fx');
    for (const row of env) {
      const node = row.entity as number;
      const values = [c1, c2].map((id) => resultsStore.perCombo3D.get(id)!.reactions.find((x) => x.nodeId === node)!.fx);
      expect(row.max).toBe(Math.max(...values));
      expect(row.maxSourceId).toBe([c1, c2][values.indexOf(Math.max(...values))]);
      expect(row.min).toBe(Math.min(...values));
    }
  });

  it('balances the statics of every case and combination', () => {
    portal();
    const st = records(sheet(currentWorkbookSheets(5), 'Statics'));
    expect(st.length).toBeGreaterThan(0);
    for (const r of st) expect(r.worstRelative as number).toBeLessThan(1e-6);
  });

  it('writes no text cell a spreadsheet would read as a formula', () => {
    portal();
    for (const s of currentWorkbookSheets(5)) {
      for (const row of s.rows) for (const c of row) if (typeof c === 'string') expect(/^[+\-=@]/.test(c), `${s.name}: "${c}"`).toBe(false);
    }
    expect(safeText('-1.0 W')).toBe('−1.0 W');
    expect(safeText('+W')).toBe(' +W');
  });

  it('writes the model sheets as the importer reads them', () => {
    portal();
    const sheets = currentWorkbookSheets(5);
    const back = parseWorkbook(Object.fromEntries(sheets.map((s) => [s.name, s.rows])));
    // The columns it does not know it names once, on the header row, and skips; anything else is a failure.
    const own = (n: string) => back.problems.filter((p) => p.sheet === n && !(p.row === 1 && p.column));
    expect(back.problems.filter((p) => p.row === 1 && p.column).every((p) => sheets.find((s) => s.name === p.sheet)!.rows[0]!.some((h) => String(h).toLowerCase().startsWith(p.column!)))).toBe(true);
    for (const n of ['Nodes', 'Members', 'Materials', 'Sections', 'LoadCases', 'Combinations', 'Supports']) expect(own(n), n).toEqual([]);
    expect(back.model.nodes).toHaveLength(modelStore.nodes.size);
    expect(back.model.elements).toHaveLength(modelStore.elements.size);
    expect(back.model.combinations).toHaveLength(modelStore.combinations.length);
    for (const n of back.model.nodes) {
      const m = modelStore.nodes.get(n.id)!;
      expect([n.x, n.y, n.z]).toEqual([m.x, m.y, m.z ?? 0]);
    }
  });

  it('measures a simply supported beam\'s deflection as 5qL⁴/384EI', () => {
    const L = 6, q = 10;
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'custom3d', undefined, { dofRestraints: { tx: true, ty: true, tz: true, rx: true, ry: false, rz: false } });
    modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { tx: false, ty: true, tz: true, rx: false, ry: false, rz: false } });
    const dead = modelStore.model.loadCases[0]!.id;
    modelStore.addDistributedLoad3D(e, 0, 0, -q, -q, undefined, undefined, dead);
    for (const x of [...modelStore.combinations]) modelStore.removeCombination(x.id);
    modelStore.addCombination('1.0 D', [{ caseId: dead, factor: 1 }]);
    const r = modelStore.solveCombinations3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    publishCombinations3D(r);
    const elem = modelStore.elements.get(e)!;
    const ei = eiOf(modelStore.materials.get(elem.materialId), modelStore.sections.get(elem.sectionId))!;
    const mid = records(sheet(currentWorkbookSheets(5), 'Deflections')).find((x) => x.source === 'combination' && x.member === e && x.station === 3)!;
    expect(mid['x [m]']).toBeCloseTo(L / 2, 12);
    const EI = Math.abs(mid['w [m]'] as number) > Math.abs(mid['v [m]'] as number) ? ei.EIy : ei.EIz;
    const exact = (5 * q * L ** 4) / (384 * EI);
    expect(Math.abs(mid['total [m]'] as number - exact) / exact).toBeLessThan(1e-6);
  });

  it('goes to a zip of CSVs past the rows an xlsx holds', () => {
    const big: WorkbookSheet = { name: 'Big', rows: Array.from({ length: XLSX_MAX_ROWS + 1 }, (_, i) => (i === 0 ? ['n'] : [i])) };
    expect(fitsInXlsx([big])).toBe(false);
    expect(fitsInXlsx([{ name: 'Small', rows: [['n'], [1]] }])).toBe(true);
    // Under the row limit but past the cell budget: rows of ten cells, enough of them.
    const wide: WorkbookSheet = { name: 'Wide', rows: Array.from({ length: XLSX_MAX_CELLS / 10 + 1 }, () => Array(10).fill(0)) };
    expect(wide.rows.length).toBeLessThan(XLSX_MAX_ROWS);
    expect(fitsInXlsx([wide])).toBe(false);
    portal();
    const sheets = currentWorkbookSheets(5);
    const files = unzipSync(workbookZip(sheets));
    expect(Object.keys(files)).toHaveLength(sheets.length);
    const ends = sheets.find((s) => s.name === 'EndForces')!;
    const csv = strFromU8(files[Object.keys(files).find((k) => k.endsWith('-EndForces.csv'))!]!);
    expect(csv.split('\n')).toHaveLength(ends.rows.length);
  });

  it('records a wall\'s shells at their centres, in global axes as statics has them', () => {
    // A wall 4 m long and 3 m high in the XZ plane, 0.2 m thick, in 8 × 6 quads, held along its
    // foot and pressed down by 40 kN/m along its head: away from the edges σzz = −40/0.2.
    const nx = 8, nz = 6, L = 4, H = 3, t = 0.2, q = 40;
    const id: number[][] = [];
    for (let i = 0; i <= nx; i++) { id.push([]); for (let k = 0; k <= nz; k++) id[i]!.push(modelStore.addNode((L * i) / nx, 0, (H * k) / nz)); }
    const mat = [...modelStore.materials.keys()][0]!;
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) modelStore.addQuad([id[i]![k]!, id[i + 1]![k]!, id[i + 1]![k + 1]!, id[i]![k + 1]!], mat, t);
    for (let i = 0; i <= nx; i++) modelStore.addSupport(id[i]![0]!, 'custom3d', undefined, { dofRestraints: { tx: i === 0, ty: true, tz: true, rx: true, ry: false, rz: true } });
    const dead = modelStore.model.loadCases[0]!.id;
    for (let i = 0; i <= nx; i++) modelStore.addNodalLoad3D(id[i]![nz]!, 0, 0, (-q * L) / nx * (i === 0 || i === nx ? 0.5 : 1), 0, 0, 0, dead);
    for (const x of [...modelStore.combinations]) modelStore.removeCombination(x.id);
    modelStore.addCombination('1.4 D', [{ caseId: dead, factor: 1.4 }]);
    const r = modelStore.solveCombinations3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    publishCombinations3D(r);
    const sheets = currentWorkbookSheets(5);
    const centres = records(sheet(sheets, 'ShellCentres'));
    const combo = centres.filter((x) => x.source === 'combination');
    expect(combo).toHaveLength(nx * nz);
    // The middle of the wall: columns 3–4 of 8, rows 2–3 of 6.
    const middle = combo.filter((x) => { const k = (x.id as number) - 1; const i = Math.floor(k / nz), j = k % nz; return i >= 3 && i <= 4 && j >= 2 && j <= 3; });
    for (const x of middle) {
      expect(Math.abs((x['SZZ [kN/m²]'] as number) - (-1.4 * q) / t) / ((1.4 * q) / t)).toBeLessThan(0.02);
      expect(Math.abs(x['SYY [kN/m²]'] as number)).toBeLessThan(1e-6);
    }
    expect(sheet(sheets, 'ShellNodes').rows.length).toBeGreaterThan(1);
    const maxima = records(sheet(sheets, 'Maxima')).filter((x) => x.table === 'shells');
    expect(maxima.some((x) => x.component === 'membraneVonMises' && x.extreme === 'max')).toBe(true);
  });
});

describe('the sheets of 18/18', () => {
  it('lists the model\'s specifications, one row per value with the entities that hold it', () => {
    const { beam } = portal();
    modelStore.updateElement(beam, { releaseJ: { my: false, mz: true, t: false } } as never);
    const specs = records(sheet(currentWorkbookSheets(5), 'Specifications'));
    const row = specs.find((r) => r.entity === 'member' && String(r.value) === 'Mz')!;
    expect(row).toBeDefined();
    expect(row.count).toBe(1);
    expect(String(row.ids)).toBe(String(beam));
    // Without the model, no Specifications sheet: it describes the model.
    expect(currentWorkbookSheets(5, { model: false }).some((s) => s.name === 'Specifications')).toBe(false);
  });

  it('gives each cable its tension, thrust, sag and modulus, per result', () => {
    // A tripod of cables holding a node: statically determinate, each at P / (3 sin θ).
    const top = [0, 1, 2].map((k) => modelStore.addNode(6 * Math.cos((2 * Math.PI * k) / 3), 6 * Math.sin((2 * Math.PI * k) / 3), 10));
    const hub = modelStore.addNode(0, 0, 2);
    const ids = top.map((n) => modelStore.addElement(n, hub, 'truss'));
    const sec = [...modelStore.sections.keys()][0]!;
    modelStore.updateSection(sec, { a: 1e-3, iy: 1e-10, iz: 1e-10, j: 1e-10 } as never);
    for (const id of ids) modelStore.updateElement(id, { behaviour: 'cable' } as never);
    for (const n of top) modelStore.addSupport(n, 'pinned3d');
    for (const x of [...modelStore.combinations]) modelStore.removeCombination(x.id);
    const c = modelStore.addLoadCase('P', 'L');
    modelStore.addNodalLoad3D(hub, 0, 0, -120, 0, 0, 0, c);
    modelStore.adoptAnalysis({ selfWeight: [] });
    const k = modelStore.addCombination('1.0 P', [{ caseId: c, factor: 1 }]);
    const r = modelStore.solveCombinations3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    publishCombinations3D(r);
    const cables = records(sheet(currentWorkbookSheets(5), 'Cables')).filter((x) => x.sourceId === k && x.source === 'combination');
    expect(cables.map((x) => x.member).sort()).toEqual([...ids].sort());
    for (const x of cables) {
      expect(Math.abs(Number(x['tension [kN]']) - 120 / (3 * 0.8))).toBeLessThan(0.05);
      expect(Number(x['sag [m]'])).toBeGreaterThan(0);
    }
  });
});
