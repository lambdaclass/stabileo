/**
 * A project designed in the reinforcement sheets has its concrete chapters in the memoria: per
 * family, the adopted bars, each check with its clause, and the state. Bars proposed and not
 * adopted are printed held. The rebar quantities come from the sheets' bending schedule, and the
 * IFC carries the adopted bars of the beam lines and the columns as reinforcing bars.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '../index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { adoptAll, buildSheetRows } from '../rc-sheets.svelte';
import { clearSheets } from '../rc-sheets-view.svelte';
import { memoriaInput } from '../memoria-inputs';
import { groupsLabel } from '../../rc-sheets/bars';
import { renderMemoriaHtml, type RenderContext } from '../../report/memoria/render';
import { ALL_CHAPTERS, memoElementState } from '../../report/memoria/types';
import en from '../../i18n/locales/en';
import { exportProjectIfc, projectIfcInput } from '../ifc-export';
import { columnLabel } from '../../rc-sheets/column-row';
import { scheduleElements } from '../../rc-sheets/schedule/pieces';
import { developedLength } from '../../rc-sheets/shape';
import { pieceOptions } from '../rc-rebar-3d.svelte';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); clearSheets();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = false;
});
afterEach(() => { uiStore.analysisMode = '3d'; });

const tr = (k: string, p?: Record<string, string | number>) => ((en as Record<string, string>)[k] ?? k).replace(/\{(\w+)\}/g, (_, n: string) => String(p?.[n] ?? `{${n}}`));
const ctx: RenderContext = { tr, msg: (m) => m.key, fmt: (v, d) => v.toFixed(d) };

/** A two-span 30×60 H-30 beam on three 40×40 columns fixed at their feet; 30 kN/m D and 10 kN/m L. */
function frame(): void {
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
  recognizePhysicalElements();
  const all = modelStore.solve3D(false, false, true);
  if (!all || typeof all === 'string') throw new Error(String(all));
  resultsStore.setResults3D(all);
  const b = modelStore.solveCombinations3D(false, false, true);
  if (!b || typeof b === 'string') throw new Error(String(b));
  publishCombinations3D(b);
}

const sheetEls = () => memoriaInput(tr, 'en').elements.filter((e) => e.id.startsWith('rc-'));

describe('the memoria reads the reinforcement sheets', () => {
  it('nothing designed in the sheets: no concrete chapter from them', () => {
    frame();
    expect(sheetEls()).toEqual([]);
  });

  it('the adopted bars, their checks with clauses and their state, by family', () => {
    frame();
    const rows = buildSheetRows();
    adoptAll([...rows.beam, ...rows.column]);
    const after = buildSheetRows();
    const els = sheetEls();
    expect(els.filter((e) => e.family === 'beam').length).toBe(after.beam.length + after.line.length);
    expect(els.filter((e) => e.family === 'column').length).toBe(after.column.length);
    for (const r of after.beam) {
      const e = els.find((x) => x.id === `rc-${r.key}`)!;
      expect(e.rows.length).toBe(r.verifications.length);
      expect(e.rows.length).toBeGreaterThan(0);
      expect(e.rows.every((x) => x.code === 'cirsoc-201' && x.edition === '2025')).toBe(true);
      expect(e.rows.filter((x) => x.clause).length).toBeGreaterThan(0);
      expect(e.data).toContainEqual([en['rcSheets.col.bottom'], groupsLabel(r.adopted.at!.span!.bottom)]);
      expect(e.heldBy).toBeUndefined();
      expect(memoElementState(e)).toBe(r.status === 'fail' ? 'fail' : 'ok');
    }
    const c = after.column[0]!;
    expect(els.find((x) => x.id === `rc-${c.key}`)!.data).toContainEqual([en['rcSheets.col.bars'], columnLabel(c.adopted)]);
    const input = memoriaInput(tr, 'en');
    expect(input.quantities.rebar.length).toBeGreaterThan(0);
    expect(input.quantities.rebar.every((q) => q.mass > 0)).toBe(true);
    const html = renderMemoriaHtml(input, new Set(ALL_CHAPTERS), ctx);
    expect(html).toContain(groupsLabel(after.beam[0]!.adopted.at!.span!.bottom));
    expect(html).toContain('CIRSOC 201-2025');
  });

  it('bars proposed and not adopted are printed held, never as satisfying', () => {
    frame();
    const rows = buildSheetRows();
    adoptAll(rows.column);
    const beams = sheetEls().filter((e) => e.family === 'beam');
    expect(beams.length).toBeGreaterThan(0);
    for (const e of beams) {
      expect(e.heldBy).toEqual([en['memo.rc.notAdopted']]);
      expect(memoElementState(e)).not.toBe('ok');
    }
  });
});

describe('the IFC reads the reinforcement sheets', () => {
  it('the beam line\'s bent shapes along its axis, the columns\' bars and ties, and each member\'s row', () => {
    frame();
    adoptAll([...buildSheetRows().beam, ...buildSheetRows().column]);
    const rows = buildSheetRows();
    const input = projectIfcInput(tr, 'en', 'P');
    const line = rows.line[0]!;
    const schedule = scheduleElements(rows, pieceOptions(rows));
    const pieces = (key: string, kinds: readonly string[]) => schedule.find((e) => e.key === key)!.pieces.filter((p) => kinds.includes(p.kind));
    const stockPieces = (ps: ReturnType<typeof pieces>) => ps.reduce((s, p) => s + p.count * ((p.shape.laps?.count ?? 0) + 1), 0);
    const lineBars = input.bars.filter((b) => b.id.startsWith(`${line.key}:`) && b.role === 'main');
    expect(lineBars.length).toBe(stockPieces(pieces(line.key, ['continuous', 'support', 'span', 'bent'])));
    const bottom = line.bars.find((b) => b.kind === 'continuous' && b.face === 'bottom')!;
    const drawn = lineBars.filter((b) => b.mark === bottom.mark);
    expect(drawn.length).toBe(bottom.bars.count * ((bottom.shape.laps?.count ?? 0) + 1));
    const runs = drawn.flatMap((b) => b.points.filter((p) => Math.abs(p[2] - (3 - 0.3 + bottom.shape.pts[1]![1])) < 1e-9));
    expect(Math.min(...runs.map((p) => p[0]))).toBeCloseTo(bottom.from, 9);
    expect(Math.max(...runs.map((p) => p[0]))).toBeCloseTo(bottom.to, 9);
    for (const b of drawn) {
      expect(b.diameter).toBeCloseTo(bottom.bars.dia / 1000, 12);
      expect(Math.abs(b.points[0]![1])).toBeLessThan(0.15);
    }
    const ligatures = input.bars.filter((b) => b.id.startsWith(`${line.key}:`) && b.role === 'ligature');
    expect(ligatures.length).toBe(stockPieces(pieces(line.key, ['stirrup', 'stirrupTie', 'hanger'])));
    const c = rows.column[0]!;
    const verticals = input.bars.filter((b) => b.id.startsWith(`${c.key}:`) && b.role === 'main' && b.points.length > 1);
    const own = pieces(c.key, ['column', 'cranked', 'dowel']);
    expect(verticals.length).toBe(stockPieces(own));
    for (const b of verticals) expect(own.some((p) => Math.abs(developedLength(p.shape) - b.length) < 1e-6)).toBe(true);
    expect(input.bars.filter((b) => b.id.startsWith(`${c.key}:`) && b.role === 'ligature').length).toBe(stockPieces(pieces(c.key, ['hoop', 'crossTie'])));
    const beamMember = input.members.find((m) => m.kind === 'beam')!;
    expect(beamMember.props?.ReinforcementSheet).toBe(rows.beam.find((r) => r.key.endsWith(':0'))!.name);
    expect(String(beamMember.props?.Reinforcement)).toContain('bottom:');
    expect(beamMember.props?.DesignState).not.toBe('not designed');
    expect(input.buildingProps?.ReinforcementMassKg).toBeGreaterThan(0);
    const ifc = exportProjectIfc(tr, 'en', 'P');
    expect((ifc.match(/IFCREINFORCINGBAR\(/g) ?? []).length).toBe(input.bars.length);
  });
});
