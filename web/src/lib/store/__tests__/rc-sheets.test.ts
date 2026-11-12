import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { uiStore } from '../ui.svelte';
import { historyStore } from '../history.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements, physicalGroups } from '../physical';
import { clearPlateMesh, physicalPlates, plateStatus, preparePlatesForAnalysis } from '../physical-plates';
import { ensurePhysicalModel } from '../plates-from-shells';
import { meshBeforeAnalysis } from '../mesh-policy.svelte';
const modelEntryShells = (id: number) => modelStore.model.groups.get(id)!.members.quads?.length ?? 0;
import { buildSheetRows, redesignerOf, setSheetCode, rcSheetsData, setAdopted, setTorsionMode, adoptAll, setRcOption, meshWallsForSheets, wallsToMeshForSheets, WALL_MESH_SIZE } from '../rc-sheets.svelte';
import { rcSheetsWorkbook } from '../../rc-sheets/workbook';
import { goToRow, resizeHints, lineResizeHint } from '../rc-sheets-resize';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); resultsStore.clear();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = false;
});
afterEach(() => { uiStore.analysisMode = '3d'; });

function solve() {
  recognizePhysicalElements();
  const all = modelStore.solve3D(false, false, true);
  if (!all || typeof all === 'string') throw new Error(String(all));
  resultsStore.setResults3D(all);
  const b = modelStore.solveCombinations3D(false, false, true);
  if (!b || typeof b === 'string') throw new Error(String(b));
  publishCombinations3D(b);
}

/** A two-span 30×60 beam on three 40×40 columns, 3 m high, fixed at their feet; 30 kN/m D and 10 kN/m L. */
function frame() {
  const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
  const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' } as never);
  const bm = modelStore.addSection({ name: '30×60', a: 0.18, iy: 0.3 * 0.6 ** 3 / 12, iz: 0.6 * 0.3 ** 3 / 12, j: 0.0037, b: 0.3, h: 0.6, shape: 'rect' } as never);
  const base = [0, 5, 10].map((x) => modelStore.addNode(x, 0, 0));
  const top = [0, 5, 10].map((x) => modelStore.addNode(x, 0, 3));
  const cols = base.map((b, i) => modelStore.addElement(b, top[i]!, 'frame'));
  const beams = [modelStore.addElement(top[0]!, top[1]!, 'frame'), modelStore.addElement(top[1]!, top[2]!, 'frame')];
  for (const c of cols) { modelStore.updateElementSection(c, col); modelStore.updateElementMaterial(c, conc); }
  for (const b of beams) { modelStore.updateElementSection(b, bm); modelStore.updateElementMaterial(b, conc); }
  for (const b of base) modelStore.addSupport(b, 'fixed3d');
  const D = modelStore.model.loadCases.find((c) => c.type === 'D')!.id;
  const L = modelStore.model.loadCases.find((c) => c.type === 'L')!.id;
  for (const b of beams) { modelStore.addDistributedLoad3D(b, 0, 0, -30, -30, undefined, undefined, D); modelStore.addDistributedLoad3D(b, 0, 0, -10, -10, undefined, undefined, L); }
  modelStore.addCombination('1.2D + 1.6L', [{ caseId: D, factor: 1.2 }, { caseId: L, factor: 1.6 }]);
  modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
}

/** A 4 × 4 m slab of 4 × 4 quads, 15 cm, simply supported on its edges, 10 kPa of D downward. */
function slab() {
  const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
  const N = 4, id: number[][] = [];
  for (let i = 0; i <= N; i++) { id.push([]); for (let j = 0; j <= N; j++) id[i]!.push(modelStore.addNode(i, j, 3)); }
  const D = modelStore.model.loadCases.find((c) => c.type === 'D')!.id;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const q = modelStore.addQuad([id[i]![j]!, id[i + 1]![j]!, id[i + 1]![j + 1]!, id[i]![j + 1]!], conc, 0.15);
    modelStore.addSurfaceLoad3D(q, 10, D);
  }
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) if (i === 0 || j === 0 || i === N || j === N) modelStore.addSupport(id[i]![j]!, 'pinned3d');
  modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
}

describe('reinforcement sheets from a solved model', () => {
  it('reads a piece drawn against the line with the same sagging sign', () => {
    const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
    const bm = modelStore.addSection({ name: '30×60', a: 0.18, iy: 0.3 * 0.6 ** 3 / 12, iz: 0.6 * 0.3 ** 3 / 12, j: 0.0037, b: 0.3, h: 0.6, shape: 'rect' } as never);
    const n = [0, 3, 6].map((x) => modelStore.addNode(x, 0, 3));
    const beams = [modelStore.addElement(n[0]!, n[1]!, 'frame'), modelStore.addElement(n[2]!, n[1]!, 'frame')];
    for (const b of beams) { modelStore.updateElementSection(b, bm); modelStore.updateElementMaterial(b, conc); }
    modelStore.addSupport(n[0]!, 'fixed3d'); modelStore.addSupport(n[2]!, 'pinned3d');
    const D = modelStore.model.loadCases.find((c) => c.type === 'D')!.id;
    for (const b of beams) modelStore.addDistributedLoad3D(b, 0, 0, -10, -10, undefined, undefined, D);
    modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
    solve();
    const [r] = buildSheetRows().beam;
    const w = 14, L = 6;
    expect(r!.demand.start.neg.value).toBeCloseTo(w * L * L / 8, 3);
    expect(r!.demand.span.pos.value).toBeCloseTo(9 * w * L * L / 128, 3);
    expect(r!.demand.span.x).toBeCloseTo(L - 3 * L / 8, 3);
    expect(Math.max(...r!.demand.env!.filter((e) => e.x > 3).map((e) => e.neg))).toBeLessThan(1e-6);
  });

  it('cuts the continuous beam into its two spans at the middle column and envelopes each section whole', () => {
    frame(); solve();
    const rows = buildSheetRows();
    expect(rows.basis).toBe('combinations');
    expect(rows.code).toBe('CIRSOC 201-2025');
    expect(rows.beam.map((r) => r.name)).toEqual(['V1-1', 'V1-2']);
    const [a, b] = rows.beam;
    expect(a!.demand.end.neg.value).toBeGreaterThan(a!.demand.span.pos.value);
    expect(a!.demand.end.neg.value).toBeCloseTo(b!.demand.start.neg.value, 6);
    expect(a!.demand.span.pos.value).toBeCloseTo(b!.demand.span.pos.value, 6);
    expect(a!.demand.span.pos.source?.combo).toBe('1.2D + 1.6L');
    expect(a!.demand.span.x).toBeGreaterThan(0.3 * 5);
    expect(a!.demand.span.x).toBeLessThan(0.5 * 5);
    expect(a!.demand.span.pos.value + a!.demand.end.neg.value / 2).toBeGreaterThan(52 * 25 / 8 * 0.8);
    expect(a!.demand.combos).toHaveLength(2);
  });

  it('takes the sagging and the hogging at a beam end from different combinations under lateral load', () => {
    frame();
    const W = modelStore.model.loadCases.find((c) => c.type === 'W')!.id;
    const D = modelStore.model.loadCases.find((c) => c.type === 'D')!.id;
    const top = [...modelStore.nodes.values()].filter((n) => (n.z ?? 0) > 2.9).sort((p, q) => p.x - q.x)[0]!;
    modelStore.addNodalLoad3D(top.id, 400, 0, 0, 0, 0, 0, W);
    modelStore.addCombination('0.9D + 1.6W', [{ caseId: D, factor: 0.9 }, { caseId: W, factor: 1.6 }]);
    solve();
    const beam = buildSheetRows().beam[0]!;
    const sections = [beam.demand.start, beam.demand.end];
    const both = sections.find((e) => e.pos.value > 1 && e.neg.value > 1)!;
    expect(both).toBeDefined();
    expect(both.pos.source!.combo).not.toBe(both.neg.source!.combo);
    expect(beam.verifications.some((v) => v.label.startsWith('rcSheets.v.flexPos.') && v.label !== 'rcSheets.v.flexPos.span')).toBe(true);
  });

  it('reads the moments at the support faces when asked, which lowers the hogging moment', () => {
    frame(); solve();
    const axis = buildSheetRows().beam[0]!;
    setRcOption('faces', true);
    const face = buildSheetRows().beam[0]!;
    expect(face.demand.start.x).toBeCloseTo(0.2, 6);
    expect(face.demand.end.x).toBeCloseTo(5 - 0.2, 6);
    expect(face.demand.end.neg.value).toBeLessThan(axis.demand.end.neg.value);
    expect(face.demand.vu.value).toBeLessThan(axis.demand.vu.value);
    setRcOption('faces', false);
    expect(rcSheetsData().faces).toBeUndefined();
  });

  it('takes the slab on one side as an L flange for the sagging moment when asked', () => {
    frame();
    const conc = [...modelStore.materials.values()][0]!.id;
    const [a, b] = [...modelStore.nodes.values()].filter((n) => (n.z ?? 0) > 2.9 && n.x < 5.1).sort((p, q) => p.x - q.x);
    const c = modelStore.addNode(5, 4, 3), d = modelStore.addNode(0, 4, 3);
    modelStore.addQuad([a!.id, b!.id, c, d], conc, 0.15);
    modelStore.addSupport(c, 'pinned3d'); modelStore.addSupport(d, 'pinned3d');
    solve();
    setRcOption('flange', true);
    const beam = buildSheetRows().beam[0]!;
    expect(beam.demand.flange!.hf).toBeCloseTo(0.15, 6);
    expect(beam.demand.flange!.bf).toBeCloseTo(0.3 + 5 / 12, 3);
    expect(beam.steps[0]!.steps.some((x) => x.label === 'rcSheets.s.flange')).toBe(true);
  });

  it('stops the flange at half the clear distance to the next parallel web', () => {
    frame();
    const conc = [...modelStore.materials.values()][0]!.id;
    const [a, b] = [...modelStore.nodes.values()].filter((n) => (n.z ?? 0) > 2.9 && n.x < 5.1).sort((p, q) => p.x - q.x);
    const c = modelStore.addNode(5, 4, 3), d = modelStore.addNode(0, 4, 3);
    modelStore.addQuad([a!.id, b!.id, c, d], conc, 0.15);
    modelStore.addSupport(c, 'pinned3d'); modelStore.addSupport(d, 'pinned3d');
    const p0 = modelStore.addNode(0, 0.8, 3), p1 = modelStore.addNode(5, 0.8, 3);
    const other = modelStore.addElement(p0, p1, 'frame');
    const first = modelStore.elements.get([...modelStore.elements.values()].find((e) => e.nodeI === a!.id && e.nodeJ === b!.id)!.id)!;
    for (const id of [other, modelStore.addElement(a!.id, p0, 'frame'), modelStore.addElement(b!.id, p1, 'frame')]) { modelStore.updateElementSection(id, first.sectionId); modelStore.updateElementMaterial(id, conc); }
    modelStore.addSupport(p0, 'fixed3d'); modelStore.addSupport(p1, 'fixed3d');
    solve();
    setRcOption('flange', true);
    const beam = buildSheetRows().beam.find((r) => r.demand.line?.startNode === a!.id)!;
    expect(beam.demand.flange!.bf).toBeCloseTo(0.3 + (0.8 - 0.3) / 2, 3);
  });

  it('arms the two-span beam as one run: continuous bars, an extra top bar over the middle support cut where it is no longer needed, every station verified', () => {
    frame(); solve();
    const rows = buildSheetRows();
    expect(rows.line).toHaveLength(1);
    const ln = rows.line[0]!;
    expect(ln.length).toBeCloseTo(10, 6);
    expect(ln.status).toBe('ok');
    expect(ln.utilization).toBeLessThanOrEqual(1);
    const cont = ln.bars.filter((b) => b.kind === 'continuous');
    expect(cont.map((b) => [b.from, b.to])).toEqual([[0, 10], [0, 10]]);
    const mid = ln.bars.find((b) => b.kind === 'support' && b.from < 5 && b.to > 5)!;
    expect(mid).toBeDefined();
    expect(mid.to - 5).toBeGreaterThan(0.6);
    expect(mid.to - 5).toBeLessThan(5);
    expect(mid.from).toBeCloseTo(10 - mid.to, 6);
    expect(ln.bars.every((b) => b.weight > 0 && b.length >= b.to - b.from)).toBe(true);
    const span1 = rows.beam.find((r) => r.name === 'V1-1')!;
    expect(span1.adopted.at!.end!.top.reduce((s, g) => s + g.count, 0)).toBeGreaterThan(span1.adopted.at!.span!.top.reduce((s, g) => s + g.count, 0));
    expect(span1.status).not.toBe('fail');
    expect(ln.envelope.every((e) => e.pos <= e.phiPos + 1e-6 && e.neg <= e.phiNeg + 1e-6)).toBe(true);
    const cuts = ln.cutoffs.filter((x) => x.mark === mid.mark);
    expect(cuts.map((x) => x.x).sort((p, q) => p - q)).toEqual([mid.from, mid.to]);
    expect(cuts.every((x) => x.legality !== 'illegal')).toBe(true);
    expect(ln.steps[0]!.steps.filter((x) => x.label === 'rcSheets.s.lineCutoff')).toHaveLength(ln.cutoffs.length);
  });

  it('cuts a column per storey, with its clear height and the fixed foot\'s restraint', () => {
    frame(); solve();
    const rows = buildSheetRows();
    expect(rows.column).toHaveLength(3);
    const c = rows.column[0]!;
    expect(c.demand.lu).toBeCloseTo(3 - 0.6 / 2, 6);
    expect(c.demand.psiBot).toBeCloseTo(0.2, 6);
    expect(c.demand.cases.find((x) => x.combo === '1.2D + 1.6L')!.puD).toBeGreaterThan(0);
  });

  it('designs a simply supported slab with bottom steel at midspan and top steel at the corners for the twisting moment', () => {
    slab(); solve();
    const rows = buildSheetRows();
    expect(rows.slab).toHaveLength(1);
    const s = rows.slab[0]!;
    console.log('DBG', JSON.stringify(s.verifications.map((v) => [v.label, v.ok, v.demand, v.capacity])), rows.punching.length, rows.punching[0]?.status);
    expect(s.demand.m.bottomX.value).toBeGreaterThan(6);
    expect(s.demand.m.bottomX.value).toBeCloseTo(s.demand.m.bottomY.value, 6);
    expect(s.demand.m.topX.value).toBeGreaterThan(0);
    expect(s.demand.m.bottomX.value).toBeLessThan(0.0479 * 14 * 16 * 1.15);
  });

  it('keeps the adopted bars of a continuous beam in the project and reads them back after a reload', () => {
    frame(); solve();
    const ln = buildSheetRows().line[0]!;
    const short = { ...ln.proposed, supportTop: ln.proposed.supportTop.map((g) => ({ ...g, count: 0 })), spanBottom: ln.proposed.spanBottom.map((g) => ({ ...g, count: 0 })), bottom: { count: 2, dia: 10 }, top: { count: 2, dia: 10 } };
    setAdopted(ln.key, short);
    const snap = JSON.parse(JSON.stringify(modelStore.snapshot()));
    modelStore.clear();
    modelStore.restore(snap);
    expect((rcSheetsData().adopted[ln.key] as { bottom: unknown }).bottom).toEqual({ count: 2, dia: 10 });
    solve();
    const again = buildSheetRows();
    expect(again.line[0]!.isAdopted).toBe(true);
    expect(again.line[0]!.status).toBe('fail');
    expect(again.beam.some((r) => r.status === 'fail')).toBe(true);
    setAdopted(ln.key, null);
    expect(buildSheetRows().line[0]!.isAdopted).toBe(false);
  });

  it('adopts every proposal at once and switches the torsion mode', () => {
    frame(); solve();
    const rows = buildSheetRows();
    adoptAll(rows.line);
    expect(Object.keys(rcSheetsData().adopted)).toEqual([rows.line[0]!.key]);
    setTorsionMode('compatibility');
    expect(rcSheetsData().torsion).toBe('compatibility');
  });

  it('exports a sheet per family with a row per element', () => {
    frame(); solve();
    const sheets = rcSheetsWorkbook(buildSheetRows(), (k) => k);
    expect(sheets.map((s) => s.name)).toEqual(['rcSheets.family.beam', 'rcSheets.sheet.schedule', 'rcSheets.family.column', 'rcSheets.family.slab', 'rcSheets.family.wall']);
    expect(sheets[1]!.rows.length).toBeGreaterThan(3);
    expect(sheets[0]!.rows[0]![0]).toContain('CIRSOC 201-2025');
    expect(sheets[0]!.rows).toHaveLength(4);
    expect(sheets[2]!.rows).toHaveLength(5);
  });

  it('integrates a cantilever wall\'s base: N, M and V match the statics', () => {
    const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
    const nx = 8, nz = 6, L = 4, H = 6, id: number[][] = [];
    for (let i = 0; i <= nx; i++) { id.push([]); for (let k = 0; k <= nz; k++) id[i]!.push(modelStore.addNode(i * L / nx, 0, k * H / nz)); }
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) modelStore.addQuad([id[i]![k]!, id[i + 1]![k]!, id[i + 1]![k + 1]!, id[i]![k + 1]!], conc, 0.2);
    for (let i = 0; i <= nx; i++) modelStore.addSupport(id[i]![0]!, 'fixed3d');
    const D = modelStore.model.loadCases.find((c) => c.type === 'D')!.id;
    for (let i = 0; i <= nx; i++) modelStore.addNodalLoad3D(id[i]![nz]!, 100 / (nx + 1), 0, -900 / (nx + 1), 0, 0, 0, D);
    modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
    recognizePhysicalElements();
    for (const g of [...modelStore.model.groups.values()]) if ((g.members.quads ?? []).length) modelStore.setGroupData(g.id, { ...g.data, kind: 'wall' });
    solve();
    const rows = buildSheetRows();
    expect(rows.wall).toHaveLength(1);
    const k = rows.wall[0]!.demand.combos[0]!;
    expect(rows.wall[0]!.length).toBeCloseTo(4, 6);
    expect(k.pu).toBeCloseTo(1.4 * 900, -1);
    expect(k.vu).toBeCloseTo(1.4 * 100, -1);
    expect(k.mu / (1.4 * 100 * (H - 0.5 * H / nz))).toBeGreaterThan(0.85);
    expect(k.mu / (1.4 * 100 * H)).toBeLessThan(1.05);
  });

  it('makes a wall drawn as one shell a plate that, meshed for the sheets, resolves its in-plane moment', () => {
    const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0), c = modelStore.addNode(4, 0, 3), d = modelStore.addNode(0, 0, 3);
    modelStore.addQuad([a, b, c, d], conc, 0.2);
    modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(b, 'fixed3d');
    const D = modelStore.model.loadCases.find((x) => x.type === 'D')!.id;
    modelStore.addNodalLoad3D(c, 50, 0, -300, 0, 0, 0, D); modelStore.addNodalLoad3D(d, 50, 0, -300, 0, 0, 0, D);
    modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
    ensurePhysicalModel();
    expect(meshWallsForSheets()).toBe(1);
    const wall = physicalGroups().find((g) => g.physical.kind === 'wall')!;
    expect(plateStatus(wall.id)).toBe('current');
    expect((physicalGroups().find((g) => g.id === wall.id)!.members.quads ?? []).length).toBeGreaterThan(4);
    const bottom = [...modelStore.nodes.values()].filter((p) => Math.abs(p.z ?? 0) < 1e-9);
    expect(bottom.length).toBeGreaterThan(2);
    expect(bottom.every((p) => [...modelStore.supports.values()].some((sp) => sp.nodeId === p.id && sp.type === 'fixed3d'))).toBe(true);
    const all = modelStore.solve3D(false, false, true); if (!all || typeof all === 'string') throw new Error(String(all));
    resultsStore.setResults3D(all);
    const bb = modelStore.solveCombinations3D(false, false, true); if (!bb || typeof bb === 'string') throw new Error(String(bb));
    publishCombinations3D(bb);
    const row = buildSheetRows().wall[0]!;
    expect(row.demand.baseElements).toBeGreaterThan(1);
    expect(row.verifications.find((v) => v.label === 'rcSheets.v.wallMesh')).toBeUndefined();
    expect(row.demand.combos[0]!.mu).toBeGreaterThan(0.6 * 1.4 * 100 * 3);
    expect(row.demand.combos[0]!.pu).toBeCloseTo(1.4 * 600, -1);
    expect(row.verifications.find((v) => v.label === 'rcSheets.v.wallBase')).toBeUndefined();
    clearPlateMesh(wall.id);
    expect([...modelStore.supports.values()].map((sp) => sp.nodeId).sort()).toEqual([a, b].sort());
  });

  it('fails a wall whose base rests on nothing but one corner', () => {
    const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0), c = modelStore.addNode(4, 0, 3), d = modelStore.addNode(0, 0, 3);
    modelStore.addQuad([a, b, c, d], conc, 0.2);
    modelStore.addSupport(a, 'fixed3d');
    const D = modelStore.model.loadCases.find((x) => x.type === 'D')!.id;
    modelStore.addNodalLoad3D(c, 0, 0, -100, 0, 0, 0, D);
    modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
    ensurePhysicalModel();
    expect(meshWallsForSheets()).toBe(1);
    solve();
    const row = buildSheetRows().wall[0]!;
    const base = row.verifications.find((v) => v.label === 'rcSheets.v.wallBase')!;
    expect(base.ok).toBe(false);
    expect(row.demand.base).toEqual({ nodes: row.demand.baseElements! + 1, held: 1 });
    expect(row.status).toBe('fail');
  });

  it('keeps a loaded one-shell wall\'s shell and its load as the plate\'s mesh, and does not mesh it for the sheets', () => {
    const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0), c = modelStore.addNode(4, 0, 3), d = modelStore.addNode(0, 0, 3);
    const q = modelStore.addQuad([a, b, c, d], conc, 0.2);
    modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(b, 'fixed3d');
    modelStore.addSurfaceLoad3D(q, 2, modelStore.model.loadCases[0]!.id);
    ensurePhysicalModel();
    expect(meshWallsForSheets()).toBe(0);
    const wall = physicalGroups().find((g) => g.physical.kind === 'wall')!;
    expect(wall.members.quads).toEqual([q]);
    expect(plateStatus(wall.id)).toBe('current');
    expect(modelStore.loads.filter((l) => l.type === 'surface3d')).toHaveLength(1);
  });

  it('meshes for the sheets the walls that are one element, and leaves one loaded by hand as it is', () => {
    const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
    const wall = (x: number) => {
      const a = modelStore.addNode(x, 0, 0), b = modelStore.addNode(x + 4, 0, 0), c = modelStore.addNode(x + 4, 0, 3), d = modelStore.addNode(x, 0, 3);
      modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(b, 'fixed3d');
      return modelStore.addQuad([a, b, c, d], conc, 0.2);
    };
    const bare = wall(0), loaded = wall(10);
    modelStore.addSurfaceLoad3D(loaded, 2, modelStore.model.loadCases[0]!.id);
    ensurePhysicalModel();
    const plateOf = (q: number) => physicalPlates().find((p) => p.group.members.quads?.includes(q))!;
    const bareId = plateOf(bare).id, loadedId = plateOf(loaded).id;
    expect([plateStatus(bareId), plateStatus(loadedId)]).toEqual(['current', 'current']);
    expect(wallsToMeshForSheets()).toEqual([bareId]);
    const undo = historyStore.undoCount;
    expect(meshWallsForSheets()).toBe(1);
    expect(historyStore.undoCount).toBe(undo + 1);
    expect(physicalPlates().find((p) => p.id === bareId)!.surface.mesh.size).toBe(WALL_MESH_SIZE);
    expect(plateStatus(bareId)).toBe('current');
    expect(modelEntryShells(bareId)).toBeGreaterThan(1);
    expect(plateStatus(loadedId)).toBe('current');
    expect(modelStore.loads.filter((l) => l.type === 'surface3d' && (l.data as { quadId: number }).quadId === loaded)).toHaveLength(1);
    expect(wallsToMeshForSheets()).toEqual([]);
    meshBeforeAnalysis.value = false;
    try {
      expect(preparePlatesForAnalysis()).toEqual({ ok: true, meshed: 0, cells: 0 });
    } finally {
      meshBeforeAnalysis.value = true;
    }
  });

  it('checks punching where a flat slab sits on a column', () => {
    const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
    const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' } as never);
    const N = 6, id: number[][] = [];
    for (let i = 0; i <= N; i++) { id.push([]); for (let j = 0; j <= N; j++) id[i]!.push(modelStore.addNode(-3 + i, -3 + j, 3)); }
    const D = modelStore.model.loadCases.find((c) => c.type === 'D')!.id;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const q = modelStore.addQuad([id[i]![j]!, id[i + 1]![j]!, id[i + 1]![j + 1]!, id[i]![j + 1]!], conc, 0.2);
      modelStore.addSurfaceLoad3D(q, 12, D);
    }
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) if (i === 0 || j === 0 || i === N || j === N) modelStore.addSupport(id[i]![j]!, 'pinned3d');
    const base = modelStore.addNode(0, 0, 0);
    const c = modelStore.addElement(base, id[3]![3]!, 'frame');
    modelStore.updateElementSection(c, col); modelStore.updateElementMaterial(c, conc);
    modelStore.addSupport(base, 'fixed3d');
    modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
    solve();
    const rows = buildSheetRows();
    expect(rows.punching).toHaveLength(1);
    const p = rows.punching[0]!;
    const axial = -resultsStore.perCombo3D.values().next().value!.elementForces.find((f) => f.elementId === c)!.nEnd;
    expect(p.position).toBe('interior');
    expect(p.vu).toBeGreaterThan(0.5 * Math.abs(axial));
    expect(p.vu).toBeLessThanOrEqual(Math.abs(axial) * 1.01);
    expect(p.phiVc).toBeGreaterThan(0);
    expect(p.verifications[0]!.label).toBe('rcSheets.v.punching');
    // The plan of the joint: ACI's perimeter at d/2 with straight corners, EN 1992-1-1's at 2d rounded, TS 500's at d/2.
    expect(p.figure).toMatchObject({ position: 'interior', rounded: false, clause: '§22.6.4.1', b: 0.4, h: 0.4 });
    expect(p.figure!.offset).toBeCloseTo(p.figure!.d / 2, 9);
    expect(p.figure!.bo).toBeCloseTo(4 * (0.4 + p.figure!.d), 6);
    for (const [code, rounded, factor, clause] of [['en1992-1-1', true, 2, '6.4.2'], ['ts500-2000', false, 0.5, '8.3.1']] as const) {
      setSheetCode(code);
      const f = buildSheetRows().punching[0]!.figure!;
      expect(f).toMatchObject({ rounded, clause, position: 'interior' });
      expect(f.offset).toBeCloseTo(factor * f.d, 9);
    }
    setSheetCode('cirsoc201-2025');
  });

  /** A 6 × 6 m flat slab on its four corners and one central column of side `c`, mesh 0.5 m, q of D. */
  function flatPlate(h: number, c: number, q: number) {
    const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
    const col = modelStore.addSection({ name: 'C', a: c * c, iy: c ** 4 / 12, iz: c ** 4 / 12, j: 0.1406 * c ** 4, b: c, h: c, shape: 'rect' } as never);
    const N = 12, id: number[][] = [];
    for (let i = 0; i <= N; i++) { id.push([]); for (let j = 0; j <= N; j++) id[i]!.push(modelStore.addNode(-3 + i * 0.5, -3 + j * 0.5, 3)); }
    const D = modelStore.model.loadCases.find((k) => k.type === 'D')!.id;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) modelStore.addSurfaceLoad3D(modelStore.addQuad([id[i]![j]!, id[i + 1]![j]!, id[i + 1]![j + 1]!, id[i]![j + 1]!], conc, h), q, D);
    for (let i = 0; i <= N; i += N) for (let j = 0; j <= N; j += N) modelStore.addSupport(id[i]![j]!, 'pinned3d');
    const base = modelStore.addNode(0, 0, 0);
    const e = modelStore.addElement(base, id[6]![6]!, 'frame');
    modelStore.updateElementSection(e, col); modelStore.updateElementMaterial(e, conc);
    modelStore.addSupport(base, 'fixed3d');
    modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
    ensurePhysicalModel();
    solve();
    return e;
  }

  it('reads a flat slab\'s one-way shear from d beyond the column, and proposes slab meshes that verify on the depths their own bars leave', () => {
    flatPlate(0.14, 0.3, 8);
    const s = buildSheetRows().slab[0]!;
    // The shells round the column carry the two-way shear punching checks; one-way shear reads past them.
    expect(s.verifications.find((v) => v.label === 'rcSheets.v.slabShearX')!.ok).toBe(true);
    expect(s.verifications.filter((v) => v.label.startsWith('rcSheets.v.slab.')).every((v) => v.ok)).toBe(true);
  });

  it('says what a failing punching joint would need, the slab or the column, and takes the reader to it', () => {
    const c = flatPlate(0.12, 0.2, 12);
    const p = buildSheetRows().punching[0]!;
    expect(p.status).toBe('fail');
    const [slabHint, colHint, capital, drop] = resizeHints(p);
    // A capital: the critical section from its edge; a drop panel: from h/4 deep, reaching at least as far as it is deep.
    expect(capital).toMatchObject({ what: 'punchCapital', direction: 'grow' });
    expect(capital!.to![0]!).toBeGreaterThan(0);
    expect(drop).toMatchObject({ what: 'punchDrop' });
    expect(drop!.to![0]!).toBeGreaterThanOrEqual(0.03 - 1e-9);
    expect(drop!.to![1]!).toBeGreaterThanOrEqual(drop!.to![0]! - 1e-9);
    expect(slabHint).toMatchObject({ what: 'punchSlab', direction: 'grow', from: [0.12] });
    expect(slabHint!.to![0]!).toBeGreaterThan(0.12);
    // A column twice as large may not do: the hint then says so (to: null) rather than naming a size.
    expect(colHint).toMatchObject({ what: 'punchColumn', from: [0.2, 0.2] });
    expect(colHint!.to === null || colHint!.to[0]! > 0.2).toBe(true);
    expect(goToRow(p, 'members')).toBe(true);
    expect([...uiStore.selectedElements]).toEqual([c]);
    expect(uiStore.proActiveTab).toBe('elements');
    expect(goToRow(p, 'plates')).toBe(true);
    expect(uiStore.selectedPlates.size).toBe(1);
    expect(uiStore.proActiveTab).toBe('shells');
  });

  it('gives a beam too shallow the depth it needs, never more than the one that holds, and a column with room the smaller section that still holds', () => {
    frame();
    solve();
    const rows = buildSheetRows();
    const ok = rows.beam[0]!;
    expect(resizeHints(ok)).toEqual([]);
    const shallow = redesignerOf(ok.key)!({ ...ok.demand, h: 0.25 } as never) as typeof ok;
    expect(shallow.status).toBe('fail');
    const [hint] = resizeHints(shallow);
    expect(hint).toMatchObject({ what: 'beamH', direction: 'grow', from: [0.25] });
    expect(hint!.to![0]!).toBeGreaterThan(0.25);
    expect(hint!.to![0]!).toBeLessThanOrEqual(0.6 + 1e-9);
    expect(redesignerOf(ok.key)!({ ...ok.demand, h: hint!.to![0]! - 0.05 } as never).status).toBe('fail');
    const col = rows.column[0]!;
    const [smaller] = resizeHints(col);
    expect(smaller).toMatchObject({ what: 'column', direction: 'shrink', from: [0.4, 0.4] });
    expect(smaller!.to![0]!).toBeLessThan(0.4);
    expect(lineResizeHint(rows.beam)).toBeNull();
  });

  it('cuts a column into storeys at the flat slabs it carries, as at beams, and checks punching at each', () => {
    const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
    const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' } as never);
    const D = modelStore.model.loadCases.find((c) => c.type === 'D')!.id;
    const N = 6, mid: number[] = [];
    for (const z of [3, 6]) {
      const id: number[][] = [];
      for (let i = 0; i <= N; i++) { id.push([]); for (let j = 0; j <= N; j++) id[i]!.push(modelStore.addNode(-3 + i, -3 + j, z)); }
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) modelStore.addSurfaceLoad3D(modelStore.addQuad([id[i]![j]!, id[i + 1]![j]!, id[i + 1]![j + 1]!, id[i]![j + 1]!], conc, 0.2), 12, D);
      for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) if (i === 0 || j === 0 || i === N || j === N) modelStore.addSupport(id[i]![j]!, 'pinned3d');
      mid.push(id[3]![3]!);
    }
    const base = modelStore.addNode(0, 0, 0);
    for (const [a, b] of [[base, mid[0]!], [mid[0]!, mid[1]!]] as const) {
      const c = modelStore.addElement(a, b, 'frame');
      modelStore.updateElementSection(c, col); modelStore.updateElementMaterial(c, conc);
    }
    modelStore.addSupport(base, 'fixed3d');
    modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
    solve();
    const rows = buildSheetRows();
    expect(rows.column).toHaveLength(2);
    for (const c of rows.column) { expect(c.length).toBeCloseTo(3, 6); expect(c.demand.lu).toBeCloseTo(3, 6); }
    expect(rows.punching).toHaveLength(2);
  });

  it('checks strong column–weak beam and joint shear where a column continues above a floor, with the seismic option', () => {
    const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
    const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' } as never);
    const bm = modelStore.addSection({ name: '30×60', a: 0.18, iy: 0.3 * 0.6 ** 3 / 12, iz: 0.6 * 0.3 ** 3 / 12, j: 0.0037, b: 0.3, h: 0.6, shape: 'rect' } as never);
    const D = modelStore.model.loadCases.find((c) => c.type === 'D')!.id;
    const n = [0, 3, 6].map((z) => [0, 5].map((x) => modelStore.addNode(x, 0, z)));
    for (const k of [0, 1]) for (const lvl of [0, 1]) { const e = modelStore.addElement(n[lvl]![k]!, n[lvl + 1]![k]!, 'frame'); modelStore.updateElementSection(e, col); modelStore.updateElementMaterial(e, conc); }
    for (const lvl of [1, 2]) { const e = modelStore.addElement(n[lvl]![0]!, n[lvl]![1]!, 'frame'); modelStore.updateElementSection(e, bm); modelStore.updateElementMaterial(e, conc); modelStore.addDistributedLoad3D(e, 0, 0, -30, -30, undefined, undefined, D); }
    for (const k of [0, 1]) modelStore.addSupport(n[0]![k]!, 'fixed3d');
    modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
    solve();
    setRcOption('seismic', true);
    const rows = buildSheetRows();
    const lower = rows.column.filter((r) => r.verifications.some((v) => v.label === 'rcSheets.v.seisScwb'));
    expect(lower.length).toBe(2);
    expect(lower[0]!.verifications.some((v) => v.label === 'rcSheets.v.seisJoint')).toBe(true);
    expect(rows.beam.every((r) => r.verifications.some((v) => v.label === 'rcSheets.v.seisBeamVe'))).toBe(true);
  });

  it('says there is nothing to design before a solve', () => {
    frame(); recognizePhysicalElements();
    expect(buildSheetRows().basis).toBe('none');
  });
});
