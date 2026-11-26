/**
 * Every field of the project's design data that the reinforcement sheets read, changed one at a
 * time on a solved model: the rows change with it, the rows already designed say they are out of
 * date, and proposals adopted under the old data are proposed again.
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
import { ensurePhysicalModel } from '../plates-from-shells';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { adoptAll, buildSheetRows, rcSheetsData, setAdopted, setColumnEndZones, setRcOption, setSheetCode, setTorsionMode, type SheetRows } from '../rc-sheets.svelte';
import { designSheets, sheetsStale } from '../rc-sheets-view.svelte';
import { sheetCoverShortfalls } from '../rc-sheets-covers';
import { designData, patchDesignData, setDesignData, setMemberCovers, storedDesignData } from '../design-data';
import { migrateDesignData, migrateStoredDesignData } from '../../model/design-data';
import { optionRule } from '../../rc-sheets/design-options';
import { tieDiaFor } from '../../rc-sheets/column-row';
import { columnTieLayout } from '../../rc-sheets/column-ties';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); resultsStore.clear();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = false;
  setDesignData(null);
});
afterEach(() => { uiStore.analysisMode = '3d'; });

function solve() {
  syncDefinedLoadsForAnalysis(); recognizePhysicalElements();
  resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
  publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
}

/** A two-span 30×60 beam on three 40×40 columns, 3 m high, fixed at their feet; 30 kN/m D, 10 kN/m L and a lateral load. */
function frame() {
  const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
  const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' } as never);
  const bm = modelStore.addSection({ name: '30×60', a: 0.18, iy: 0.3 * 0.6 ** 3 / 12, iz: 0.6 * 0.3 ** 3 / 12, j: 0.0037, b: 0.3, h: 0.6, shape: 'rect' } as never);
  const base = [0, 5, 10].map((x) => modelStore.addNode(x, 0, 0)), top = [0, 5, 10].map((x) => modelStore.addNode(x, 0, 3));
  const D = modelStore.model.loadCases.find((c) => c.type === 'D')!.id, L = modelStore.model.loadCases.find((c) => c.type === 'L')!.id;
  base.forEach((b, i) => { const c = modelStore.addElement(b, top[i]!, 'frame'); modelStore.updateElementSection(c, col); modelStore.updateElementMaterial(c, conc); modelStore.addSupport(b, 'fixed3d'); });
  for (let i = 0; i < 2; i++) {
    const e = modelStore.addElement(top[i]!, top[i + 1]!, 'frame');
    modelStore.updateElementSection(e, bm); modelStore.updateElementMaterial(e, conc);
    modelStore.addDistributedLoad3D(e, 0, 0, -30, -30, undefined, undefined, D);
    modelStore.addDistributedLoad3D(e, 0, 0, -10, -10, undefined, undefined, L);
  }
  modelStore.addNodalLoad3D(top[0]!, 60, 0, 0, 0, 0, 0, L);
  modelStore.addCombination('1.2D + 1.6L', [{ caseId: D, factor: 1.2 }, { caseId: L, factor: 1.6 }]);
  modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
  solve();
  setSheetCode('cirsoc201-2025');
}

/** A 6 × 6 m flat slab on its four corners and a central 30×30 column, mesh 0.5 m. */
function flatPlate() {
  const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
  const col = modelStore.addSection({ name: 'C', a: 0.09, iy: 0.3 ** 4 / 12, iz: 0.3 ** 4 / 12, j: 0.1406 * 0.3 ** 4, b: 0.3, h: 0.3, shape: 'rect' } as never);
  const N = 12, id: number[][] = [];
  for (let i = 0; i <= N; i++) { id.push([]); for (let j = 0; j <= N; j++) id[i]!.push(modelStore.addNode(-3 + i * 0.5, -3 + j * 0.5, 3)); }
  const D = modelStore.model.loadCases.find((k) => k.type === 'D')!.id;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) modelStore.addSurfaceLoad3D(modelStore.addQuad([id[i]![j]!, id[i + 1]![j]!, id[i + 1]![j + 1]!, id[i]![j + 1]!], conc, 0.16), 8, D);
  for (let i = 0; i <= N; i += N) for (let j = 0; j <= N; j += N) modelStore.addSupport(id[i]![j]!, 'pinned3d');
  const base = modelStore.addNode(0, 0, 0);
  const e = modelStore.addElement(base, id[6]![6]!, 'frame');
  modelStore.updateElementSection(e, col); modelStore.updateElementMaterial(e, conc);
  modelStore.addSupport(base, 'fixed3d');
  modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
  ensurePhysicalModel();
  solve();
  setSheetCode('cirsoc201-2025');
}

/** A 4 m long, 6 m tall cantilever wall, 20 cm thick, with a lateral load at its top. */
function wall() {
  const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
  const nx = 8, nz = 6, id: number[][] = [];
  for (let i = 0; i <= nx; i++) { id.push([]); for (let k = 0; k <= nz; k++) id[i]!.push(modelStore.addNode(i * 0.5, 0, k)); }
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) modelStore.addQuad([id[i]![k]!, id[i + 1]![k]!, id[i + 1]![k + 1]!, id[i]![k + 1]!], conc, 0.2);
  for (let i = 0; i <= nx; i++) modelStore.addSupport(id[i]![0]!, 'fixed3d');
  const D = modelStore.model.loadCases.find((c) => c.type === 'D')!.id;
  for (let i = 0; i <= nx; i++) modelStore.addNodalLoad3D(id[i]![nz]!, 300 / (nx + 1), 0, -900 / (nx + 1), 0, 0, 0, D);
  modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
  recognizePhysicalElements();
  for (const g of [...modelStore.model.groups.values()]) if ((g.members.quads ?? []).length) modelStore.setGroupData(g.id, { ...g.data, kind: 'wall' });
  solve();
  setSheetCode('cirsoc201-2025');
}

const lineStirrups = (rows: SheetRows) => rows.line.flatMap((l) => l.zones.map((z) => z.stirrups));
const columnTies = (rows: SheetRows) => rows.column.map((r) => r.adopted);

describe('the project\'s design data in the sheets', () => {
  it('rebarFy: ADN 500 asks less steel of the columns and the beams', () => {
    frame();
    const before = buildSheetRows();
    patchDesignData({ rebarGrade: 'ADN 500', rebarFy: 500 });
    const after = buildSheetRows();
    expect(after.column[0]!.req.ast).toBeLessThanOrEqual(before.column[0]!.req.ast + 1e-9);
    expect(after.beam[0]!.req.bottom).toBeLessThan(before.beam[0]!.req.bottom);
  });

  it('stirrupDiametersMm: the beams start from Ø8 where it is allowed, else from the nearest allowed above it, and a stated starting stirrup is no longer read', () => {
    frame();
    expect(lineStirrups(buildSheetRows()).every((s) => s.dia === 8)).toBe(true);
    patchDesignData({ stirrupDiaMm: 10 } as never);
    expect(lineStirrups(buildSheetRows()).every((s) => s.dia === 8)).toBe(true);
    patchDesignData({ stirrupDiametersMm: [6, 10, 12] });
    expect(lineStirrups(buildSheetRows()).every((s) => s.dia === 10)).toBe(true);
  });

  it('stirrupDiametersMm: with Ø6 left out no column tie, hoop or beam stirrup is Ø6', () => {
    frame();
    expect(columnTies(buildSheetRows()).some((a) => a.tieDia === 6)).toBe(true);
    patchDesignData({ stirrupDiametersMm: [8, 10, 12] });
    const rows = buildSheetRows();
    expect(columnTies(rows).every((a) => a.tieDia >= 8)).toBe(true);
    expect([...lineStirrups(rows), ...rows.beam.map((r) => r.adopted.stirrups)].every((s) => s.dia >= 8)).toBe(true);
    setRcOption('seismic', true);
    expect(columnTies(buildSheetRows()).every((a) => a.tieDia >= 8)).toBe(true);
  });

  it('stirrupDiametersMm: a list too thin for Table 25.7.2.2 fails the row and names the list', () => {
    frame();
    patchDesignData({ longDiametersMm: [25], stirrupDiametersMm: [6] });
    const r = buildSheetRows().column[0]!;
    expect(r.adopted.tieDia).toBe(6);
    expect(tieDiaFor(25)).toBe(8);
    const list = r.verifications.find((v) => v.label === 'rcSheets.v.tieList')!;
    expect(list.ok).toBe(false);
    expect(list.capacity).toBe('Ø6');
    expect(r.status).toBe('fail');
  });

  it('longDiametersMm: the columns and beams take their bars from the list, and a list with none for columns says so', () => {
    frame();
    patchDesignData({ longDiametersMm: [20, 25] });
    const rows = buildSheetRows();
    expect(rows.column.every((r) => [r.adopted.corner, r.adopted.dx, r.adopted.dy].every((d) => d === 20 || d === 25))).toBe(true);
    expect(rows.beam.every((r) => [...r.adopted.bottom, ...r.adopted.top].every((g) => g.dia === 20 || g.dia === 25))).toBe(true);
    patchDesignData({ longDiametersMm: [10] });
    const none = buildSheetRows().column[0]!;
    expect(none.verifications.find((v) => v.label === 'rcSheets.v.longList')).toMatchObject({ ok: false, capacity: 'Ø10' });
  });

  it('minTieSpacingMm: no stirrup, hoop or tie is proposed closer, also under chapter 18', () => {
    frame();
    setRcOption('seismic', true);
    patchDesignData({ minTieSpacingMm: 100 });
    const rows = buildSheetRows();
    expect([...lineStirrups(rows), ...rows.beam.map((r) => r.proposed.stirrups)].every((s) => s.spacing >= 0.1 - 1e-9)).toBe(true);
    for (const r of rows.column) {
      expect(r.proposed.tieSpacing).toBeGreaterThanOrEqual(0.1 - 1e-9);
      expect(columnTieLayout(r, 'cirsoc201-2025', { endZones: true }).zones.every((z) => z.spacing >= 0.1 - 1e-9)).toBe(true);
    }
  });

  it('covers: by kind, and a member\'s own over its kind\'s', () => {
    frame();
    patchDesignData({ covers: { column: 0.04, beam: 0.035 } });
    const rows = buildSheetRows();
    expect(rows.column.every((r) => Math.abs(r.cover - 0.04) < 1e-9)).toBe(true);
    expect(rows.line.every((l) => Math.abs(l.cover - 0.035) < 1e-9)).toBe(true);
    const id = rows.column[0]!.demand.key ? [...modelStore.elements.values()].find((e) => modelStore.sections.get(e.sectionId)?.b === 0.4)!.id : 0;
    setMemberCovers([id], 0.05);
    expect(buildSheetRows().column.some((r) => Math.abs(r.cover - 0.05) < 1e-9)).toBe(true);
  });

  it('executionControl and exposure: the cover table and the covers notice read them', () => {
    frame();
    const check = () => buildSheetRows().column[0]!.verifications.find((v) => v.label === 'rcSheets.v.mainCover')!.capacity;
    const controlled = check();
    patchDesignData({ executionControl: false });
    expect(check()).not.toBe(controlled);
    patchDesignData({ executionControl: undefined, covers: { column: 0.03 } });
    expect(sheetCoverShortfalls().some((s) => s.kind === 'column')).toBe(false);
    patchDesignData({ exposure: { column: 'ground' } });
    expect(sheetCoverShortfalls().some((s) => s.kind === 'column')).toBe(true);
  });

  it('slabDiametersMm: the slab meshes take their bars from the slab list, and punching reads its depth to their top bars', () => {
    flatPlate();
    const before = buildSheetRows();
    expect(before.slab.flatMap((r) => [r.adopted.bottomX, r.adopted.topX]).some((m) => m.dia === 8)).toBe(true);
    patchDesignData({ slabDiametersMm: [12] });
    const after = buildSheetRows();
    expect(after.slab.flatMap((r) => [r.adopted.bottomX, r.adopted.bottomY, r.adopted.topX, r.adopted.topY]).every((m) => m.dia === 0 || m.dia === 12)).toBe(true);
    patchDesignData({ slabDiametersMm: [8] });
    const thin = buildSheetRows();
    expect(thin.slab.flatMap((r) => [r.adopted.topX, r.adopted.topY]).every((m) => m.dia === 0 || m.dia === 8)).toBe(true);
    expect(thin.punching[0]!.figure!.d - after.punching[0]!.figure!.d).toBeCloseTo(0.004, 6);
  });

  it('slabBase: a face the base mat does for takes it, and a face that needs no steel takes it as stated', () => {
    flatPlate();
    const before = buildSheetRows().slab;
    expect(before.some((r) => r.adopted.bottomX.dia === 10 && Math.abs(r.adopted.bottomX.spacing - 0.15) < 1e-9)).toBe(false);
    patchDesignData({ slabBase: { bottomX: { diameter: 10, spacing: 0.15 }, topY: { diameter: 8, spacing: 0.2 } } });
    const after = buildSheetRows().slab;
    expect(after.some((r) => r.adopted.bottomX.dia === 10 && Math.abs(r.adopted.bottomX.spacing - 0.15) < 1e-9)).toBe(true);
    expect(after.every((r) => r.adopted.topY.dia > 0)).toBe(true);
    expect(after.every((r) => r.status !== 'fail')).toBe(true);
  });

  it('wallDiametersMm and stirrupDiametersMm: a wall\'s bars come from its list and the ties its detail draws from theirs', async () => {
    wall();
    const { wallDetail } = await import('../../rc-sheets/wall-detail');
    expect([8, 10, 12, 16]).toContain(buildSheetRows().wall[0]!.adopted.vertical.diameter);
    patchDesignData({ wallDiametersMm: [16], stirrupDiametersMm: [10, 12] });
    const w = buildSheetRows().wall[0]!;
    expect(w.adopted.vertical.diameter).toBe(16);
    expect(w.adopted.horizontal.diameter).toBe(16);
    const det = wallDetail(w, 'cirsoc201-2025');
    for (const d of [det.boundary?.ties?.dia, det.crossTies?.dia]) if (d !== undefined) expect(d).toBeGreaterThanOrEqual(10);
  });

  it('a change of any of them leaves the rows out of date, and proposes again what was adopted from a proposal', async () => {
    frame();
    await designSheets();
    expect(sheetsStale()).toBe(false);
    patchDesignData({ minTieSpacingMm: 100 });
    expect(sheetsStale()).toBe(true);
    await designSheets();
    patchDesignData({ slabDiametersMm: [10, 12] });
    expect(sheetsStale()).toBe(true);

    setDesignData(null);
    const rows = buildSheetRows();
    adoptAll([...rows.column, ...rows.line]);
    const byHand = rows.column[1]!;
    setAdopted(byHand.key, { ...byHand.proposed, tieDia: 6 });
    patchDesignData({ stirrupDiametersMm: [8, 10, 12] });
    const again = buildSheetRows();
    expect(again.column.filter((r) => r.key !== byHand.key).every((r) => !r.isAdopted && r.adopted.tieDia >= 8)).toBe(true);
    expect(again.column.find((r) => r.key === byHand.key)!.adopted.tieDia).toBe(6);
  });
});

describe('the options the design takes before it starts, in the design data', () => {
  const legacy = { version: 1, rcSheets: { version: 1, torsion: 'compatibility', faces: true, flange: true, seismic: true, bentBars: true, slabBentBars: true, code: 'aci318-19', adopted: { 'column:1:0': { corner: 16, nx: 1, dx: 16, ny: 1, dy: 16, tieDia: 8, tieSpacing: 0.15 } } } };

  it('moves an older project\'s options from the sheets\' data to the design data on load, losing none', () => {
    const stored = migrateStoredDesignData(legacy)!;
    expect(stored.designOptions).toEqual({ torsion: 'compatibility', faces: true, flange: true, seismic: true, bentBars: true, slabBentBars: true });
    for (const k of ['torsion', 'faces', 'flange', 'seismic', 'bentBars', 'slabBentBars']) expect(stored.rcSheets as Record<string, unknown>).not.toHaveProperty(k);
    expect(stored.rcSheets?.code).toBe('aci318-19');
    expect(Object.keys(stored.rcSheets!.adopted)).toEqual(['column:1:0']);
    expect(migrateStoredDesignData({ version: 1, rcSheets: { version: 1, torsion: 'equilibrium', adopted: {} } })!.designOptions).toBeUndefined();
    expect(migrateDesignData({ ...legacy, designOptions: { faces: true } }).designOptions).toEqual({ faces: true });
  });

  it('reads them from the old place until they are stated anew, and turning one off keeps the others', () => {
    modelStore.setDesignData(legacy as never);
    const d = rcSheetsData();
    expect([d.torsion, d.faces, d.flange, d.seismic, d.bentBars, d.slabBentBars]).toEqual(['compatibility', true, true, true, true, true]);
    setRcOption('faces', false);
    const after = rcSheetsData();
    expect(after.faces).toBeUndefined();
    expect([after.torsion, after.flange, after.seismic, after.bentBars, after.slabBentBars]).toEqual(['compatibility', true, true, true, true]);
    expect(storedDesignData().rcSheets as Record<string, unknown>).not.toHaveProperty('faces');
    expect(storedDesignData().designOptions).toEqual({ torsion: 'compatibility', flange: true, seismic: true, bentBars: true, slabBentBars: true });
  });

  it('each changes the sheets, leaves them out of date and proposes again what was adopted from a proposal', async () => {
    frame();
    const conc = [...modelStore.materials.values()][0]!.id;
    const [a, b] = [...modelStore.nodes.values()].filter((n) => (n.z ?? 0) > 2.9 && n.x < 5.1).sort((p, q) => p.x - q.x);
    const c = modelStore.addNode(5, 4, 3), dd = modelStore.addNode(0, 4, 3);
    modelStore.addQuad([a!.id, b!.id, c, dd], conc, 0.15);
    modelStore.addSupport(c, 'pinned3d'); modelStore.addSupport(dd, 'pinned3d');
    solve();
    await designSheets();
    const base = buildSheetRows();
    adoptAll([...base.column, ...base.line]);
    const changed = (k: string, f: () => void, differs: (r: SheetRows) => boolean) => {
      f();
      expect(sheetsStale(), k).toBe(true);
      const r = buildSheetRows();
      expect(differs(r), k).toBe(true);
      expect(r.column.every((x) => !x.isAdopted), k).toBe(true);
    };
    changed('faces', () => setRcOption('faces', true), (r) => r.beam[0]!.demand.start.x > 0);
    changed('flange', () => setRcOption('flange', true), (r) => r.beam.some((x) => !!x.demand.flange));
    changed('torsion', () => setTorsionMode('compatibility'), () => storedDesignData().designOptions?.torsion === 'compatibility' && rcSheetsData().torsion === 'compatibility');
    changed('bentBars', () => setRcOption('bentBars', true), (r) => r.line.some((l) => l.bars.some((x) => x.kind === 'bent') || l.bentNotes.length > 0));
    changed('endZones', () => setColumnEndZones(true), (r) => columnTieLayout(r.column[0]!, 'cirsoc201-2025', { endZones: designData().columnEndZones === true }).zones.some((z) => z.kind === 'end'));
    changed('seismic', () => setRcOption('seismic', true), (r) => r.column.every((x) => !!x.confinement));
  });

  it('says the clause each applies under the code in force, and why chapter 18 and the project\'s column ends do not apply where they do not', () => {
    expect(optionRule('faces', 'cirsoc201-2025')).toEqual({ clause: 'CIRSOC 201-2025 §9.4.3.2' });
    expect(optionRule('torsion', 'en1992-1-1').clause).toBe('EN 1992-1-1 6.3.1(2)');
    expect(optionRule('seismic', 'ts500-2000').off).toBe('designData.opt.off.seismic');
    expect(optionRule('seismic', 'aci318-19').off).toBeUndefined();
    expect(optionRule('endZones', 'bs-en1992-1-1').off).toBe('designData.opt.off.endZonesEc2');
  });
});
