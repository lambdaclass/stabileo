/**
 * The project workbook's design sheets say when they describe an earlier model.
 *
 * The memoria, the IFC, the sheets and the exchange show `OutdatedNotice` from
 * `detailingStore.modelStale`; the Excel export's «Diseño» group did not, and the file that left
 * the app carried no sign of it. Now the dialog shows the notice for the design group and each
 * design sheet carries a first row saying it is out of date, why, and when it was exported.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { detailingStore } from '../detailing.svelte';
import { currentWorkbookSheets, stampOutdatedDesign } from '../project-workbook';

const DESIGN = ['Design elements', 'Design checks', 'Design verdict'];

function frame() {
  modelStore.clear();
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3), c = modelStore.addNode(4, 0, 3), d = modelStore.addNode(4, 0, 0);
  modelStore.addElement(a, b, 'frame'); modelStore.addElement(b, c, 'frame'); modelStore.addElement(d, c, 'frame');
  modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(d, 'fixed3d');
  modelStore.addNodalLoad3D(b, 10, 0, -20, 0, 0, 0);
  modelStore.solve3D(false, false, true);
}

describe('stampOutdatedDesign', () => {
  const sheets = [{ name: 'Design elements', rows: [['element', 'family'], ['B1', 'beam']] }];

  it('leaves current sheets as they are', () => {
    expect(stampOutdatedDesign(sheets, '2026-10-19T10:00:00.000Z', false)).toEqual(sheets);
  });

  it('puts the stamp above the header of a stale sheet, with the export time', () => {
    const [s] = stampOutdatedDesign(sheets, '2026-10-19T10:00:00.000Z', true);
    expect(s!.rows).toHaveLength(3);
    expect(String(s!.rows[0]![0])).toContain('2026-10-19T10:00:00.000Z');
    expect(s!.rows.slice(1)).toEqual(sheets[0]!.rows);
  });
});

describe('the workbook as exported', () => {
  beforeAll(async () => { await initSolver(); });
  beforeEach(() => { uiStore.analysisMode = 'pro'; });
  afterEach(() => { uiStore.analysisMode = '3d'; vi.restoreAllMocks(); });

  it('with the detailing current, the design sheets start at their header', () => {
    frame();
    vi.spyOn(detailingStore, 'modelStale', 'get').mockReturnValue(false);
    const sheets = currentWorkbookSheets(5).filter((s) => DESIGN.includes(s.name));
    expect(sheets.map((s) => s.name)).toEqual(DESIGN);
    expect(sheets[0]!.rows[0]![0]).toBe('element');
  });

  it('with the model changed after the detailing, every design sheet carries the stamp', () => {
    frame();
    vi.spyOn(detailingStore, 'modelStale', 'get').mockReturnValue(true);
    const all = currentWorkbookSheets(5);
    const design = all.filter((s) => DESIGN.includes(s.name));
    expect(design).toHaveLength(3);
    for (const s of design) {
      expect(s.rows[0]).toHaveLength(1);
      expect(String(s.rows[0]![0])).toMatch(/outdated\.workbookStamp|DESACTUALIZADO|OUT OF DATE|DESATUALIZADO/);
    }
    expect(design[0]!.rows[1]![0]).toBe('element');
    // The other sheets are the model and its results, which do not depend on the detailing.
    expect(all.find((s) => s.name === 'Nodes')?.rows[0]?.length ?? 2).toBeGreaterThan(1);
  });
});

describe('the Excel export dialog', () => {
  it('shows the out-of-date notice while a design sheet is chosen, and only with design on', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/pro/export/ProDataExportDialog.svelte'), 'utf8');
    expect(src).toMatch(/\{#if open && uiStore\.designInPro && DESIGN_SHEETS\.some\(on\)\}<OutdatedNotice what="workbook" testid="pro-data-export-outdated" \/>\{\/if\}/);
    // With design off in PRO the dialog neither offers nor writes the design sheets.
    expect(src).toMatch(/MODEL_GROUPS\.filter\(\(g\) => g\.key !== 'design' \|\| uiStore\.designInPro\)/);
    expect(src).toMatch(/design: uiStore\.designInPro/);
    const notice = readFileSync(join(process.cwd(), 'src/components/pro/design/OutdatedNotice.svelte'), 'utf8');
    expect(notice).toMatch(/'workbook'/);
  });
});
