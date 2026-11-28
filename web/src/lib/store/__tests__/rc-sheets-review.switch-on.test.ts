import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { uiStore } from '../ui.svelte';
import { historyStore } from '../history.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows, setAdopted, setRcOption } from '../rc-sheets.svelte';
import { setMemberLateral } from '../lateral-system';
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

/** Two 40×40 columns two storeys high, a 30×60 beam at each floor, 30 kN/m D. */
function twoStoreys() {
  const m = conc(), col = rect(0.4, 0.4), bm = rect(0.3, 0.6);
  const D = modelStore.model.loadCases.find((c) => c.type === 'D')!.id;
  const n = [0, 3, 6].map((z) => [0, 5].map((x) => modelStore.addNode(x, 0, z)));
  for (const k of [0, 1]) for (const lvl of [0, 1]) { const e = modelStore.addElement(n[lvl]![k]!, n[lvl + 1]![k]!, 'frame'); modelStore.updateElementSection(e, col); modelStore.updateElementMaterial(e, m); }
  const beams = [1, 2].map((lvl) => { const e = modelStore.addElement(n[lvl]![0]!, n[lvl]![1]!, 'frame'); modelStore.updateElementSection(e, bm); modelStore.updateElementMaterial(e, m); modelStore.addDistributedLoad3D(e, 0, 0, -30, -30, undefined, undefined, D); return e; });
  for (const k of [0, 1]) modelStore.addSupport(n[0]![k]!, 'fixed3d');
  modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
  return { beams, top: n[2]! };
}
const has = (r: { verifications: Array<{ label: string }> }, label: string) => r.verifications.some((v) => v.label === label);
const verdict = (r: { verifications: Array<{ label: string; ok: boolean }> }, label: string) => r.verifications.find((v) => v.label === label)?.ok;

describe('chapter 18 in the sheets', () => {
  it('checks the shear of a roof joint, which only the strong-column rule leaves out', () => {
    const { top } = twoStoreys();
    solve();
    setRcOption('seismic', true);
    const rows = buildSheetRows();
    const roof = rows.column.filter((r) => top.includes(r.demand.nodes!.top));
    expect(roof).toHaveLength(2);
    for (const r of roof) { expect(has(r, 'rcSheets.v.seisJoint')).toBe(true); expect(has(r, 'rcSheets.v.seisScwb')).toBe(false); }
    expect(rows.column.filter((r) => !top.includes(r.demand.nodes!.top)).every((r) => has(r, 'rcSheets.v.seisScwb'))).toBe(true);
  });

  it('applies to the beams of the lateral system: one declared outside it takes the ordinary rules, one not declared is read as part of it', () => {
    const { beams } = twoStoreys();
    solve();
    setRcOption('seismic', true);
    setMemberLateral([beams[0]!], 'gravity');
    const rows = buildSheetRows();
    const byElement = (e: number) => rows.beam.find((r) => r.demand.line && modelStore.model.groups.get(r.demand.line.group)!.members.elements!.includes(e))!;
    const gravity = byElement(beams[0]!), lateral = byElement(beams[1]!);
    expect(has(gravity, 'rcSheets.v.seisBeamVe')).toBe(false);
    expect(has(lateral, 'rcSheets.v.seisBeamVe')).toBe(true);
    const lines = (e: number) => rows.line.find((l) => modelStore.model.groups.get(l.group)!.members.elements!.includes(e))!;
    expect(lines(beams[0]!).zones.some((z) => z.first !== undefined)).toBe(false);
    expect(lines(beams[1]!).zones.some((z) => z.first !== undefined)).toBe(true);
  });

  it('fails the strong-column rule, the joint shear and a beam capacity shear where the adopted bars fall short, and the rows with them', () => {
    twoStoreys();
    solve();
    setRcOption('seismic', true);
    const first = buildSheetRows();
    const lowCol = first.column.find((r) => has(r, 'rcSheets.v.seisScwb'))!;
    for (const c of first.column) setAdopted(c.key, { corner: 12, nx: 0, dx: 12, ny: 0, dy: 12, tieDia: 10, tieSpacing: 0.1 });
    const beam = first.beam.find((r) => r.demand.line!.startNode === lowCol.demand.nodes!.top || r.demand.line!.endNode === lowCol.demand.nodes!.top)!;
    const { at: _at, ...plain } = beam.adopted;
    setAdopted(beam.key, { ...plain, top: [{ count: 6, dia: 25 }, { count: 4, dia: 25 }], stirrups: { dia: 8, legs: 2, spacing: 0.3 } });
    const rows = buildSheetRows();
    const col = rows.column.find((r) => r.key === lowCol.key)!;
    expect(verdict(col, 'rcSheets.v.seisScwb')).toBe(false);
    expect(col.status).toBe('fail');
    const b = rows.beam.find((r) => r.key === beam.key)!;
    expect(verdict(b, 'rcSheets.v.seisBeamHoops')).toBe(false);
    expect(b.status).toBe('fail');
    const joint = rows.column.filter((r) => r.demand.nodes!.top === beam.demand.line!.startNode || r.demand.nodes!.top === beam.demand.line!.endNode);
    expect(joint.some((r) => verdict(r, 'rcSheets.v.seisJoint') === false && r.status === 'fail')).toBe(true);
  });
});

describe('a flat slab punching', () => {
  it('reads the slab concrete, not the stronger column concrete', () => {
    const build = (colFc: number) => {
      modelStore.clear(); resultsStore.clear();
      for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
      const slabM = modelStore.addMaterial({ name: 'H-25', e: 25000, nu: 0.2, rho: 25, fy: 25, fc: 25 });
      const colM = modelStore.addMaterial({ name: `H-${colFc}`, e: 30000, nu: 0.2, rho: 25, fy: colFc, fc: colFc });
      const col = rect(0.4, 0.4), D = modelStore.model.loadCases.find((c) => c.type === 'D')!.id, N = 6;
      const id: number[][] = [];
      for (let i = 0; i <= N; i++) { id.push([]); for (let j = 0; j <= N; j++) id[i]!.push(modelStore.addNode(-3 + i, -3 + j, 3)); }
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) modelStore.addSurfaceLoad3D(modelStore.addQuad([id[i]![j]!, id[i + 1]![j]!, id[i + 1]![j + 1]!, id[i]![j + 1]!], slabM, 0.2), 12, D);
      for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) if (i === 0 || j === 0 || i === N || j === N) modelStore.addSupport(id[i]![j]!, 'pinned3d');
      const base = modelStore.addNode(0, 0, 0), c = modelStore.addElement(base, id[3]![3]!, 'frame');
      modelStore.updateElementSection(c, col); modelStore.updateElementMaterial(c, colM);
      modelStore.addSupport(base, 'fixed3d');
      modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
      solve();
      return buildSheetRows().punching[0]!;
    };
    const weak = build(25), strong = build(50);
    expect(strong.phiVc).toBeCloseTo(weak.phiVc, 3);
  });
});
