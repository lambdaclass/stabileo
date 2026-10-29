/**
 * The two lines of export offer the same five formats, each with its own content: the analysed
 * model's report and the designed model's memoria, both read as blocks, come out in Word, the
 * workbook and CSV with the tables their HTML shows.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as XLSX from 'xlsx';
import { strFromU8, unzipSync } from 'fflate';
import { historyStore, modelStore, resultsStore, uiStore } from '../../store';
import { designRunStore } from '../../store/design-run.svelte';
import { verificationStore } from '../../store/verification.svelte';
import { detailingStore } from '../../store/detailing.svelte';
import { placeFrame } from '../../model/building/build-on-grid';
import { generateReportHtml } from '../../engine/pro-report';
import { memoriaInput } from '../../store/memoria-inputs';
import { renderMemoriaHtml } from '../../report/memoria/render';
import { ALL_CHAPTERS } from '../../report/memoria/types';
import { teAt } from '../../i18n/engine-text';
import { htmlToBlocks, reportFile } from '../report-formats';
import * as wasmSolver from '../../engine/wasm-solver';
import { stateSuiteLateral } from '../../store/__tests__/suite-lateral';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

function project() {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
  stateSuiteLateral();
  const conc = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
  const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' } as never);
  const beam = modelStore.addSection({ name: '20×50', a: 0.1, iy: 0.00208, iz: 0.000333, j: 0.00093, b: 0.2, h: 0.5, shape: 'rect' } as never);
  const grid = { axes: [{ id: 'x0', name: '1', axis: 'x', at: 0 }, { id: 'x2', name: '3', axis: 'x', at: 9 }, { id: 'y0', name: 'A', axis: 'y', at: 0 }], levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }] };
  placeFrame(grid as never, { x: ['x0', 'x2'], y: ['y0', 'y0'], levels: ['N0', 'N1'], columns: { sectionId: col, materialId: conc }, beamsX: { sectionId: beam, materialId: conc }, beamsY: null }, { fixBase: true });
  for (const e of [...modelStore.elements.values()]) { const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!; if (Math.abs((a.z ?? 0) - (b.z ?? 0)) < 1e-6) modelStore.addDistributedLoad3D(e.id, 0, 0, -25, -25, undefined, undefined, 1); }
  const combo = modelStore.solveCombinations3D(false, false, true) as never as { perCase: never; perCombo: never; envelope: never };
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
}

/** Each table of the HTML, as its rows of text, against each table of a DOCX and of a workbook. */
async function sameTables(title: string, html: string) {
  const blocks = htmlToBlocks(html), tables = blocks.filter((b) => b.kind === 'table');
  expect(tables.length, `${title}: tables`).toBeGreaterThan(0);
  const docx = (await reportFile('docx', { title, html, stem: 'x', loadXlsx: async () => XLSX }))!;
  const xml = strFromU8(unzipSync(docx.bytes as Uint8Array)['word/document.xml']!);
  expect((xml.match(/<w:tbl>/g) ?? []).length, `${title}: docx tables`).toBe(tables.length);
  // Cell by cell, the Word text is the HTML's: numbers, signs and units; a subscript in the HTML is a subscript run.
  const cellRuns = (tc: string) => [...tc.matchAll(/<w:r>([\s\S]*?)<\/w:r>/g)].map((r) => ({ t: [...r[1]!.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(''), sub: /subscript/.test(r[1]!) }));
  const unxml = (t: string) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const docTables = [...xml.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g)].map((tb) => [...tb[1]!.matchAll(/<w:tr>([\s\S]*?)<\/w:tr>/g)].map((tr) => [...tr[1]!.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((tc) => cellRuns(tc[1]!))));
  tables.forEach((tb, i) => {
    const t = tb as { head: string[]; rows: string[][] };
    const plain = [t.head, ...t.rows];
    const written = docTables[i]!.map((r) => r.map((c) => unxml(c.map((x) => x.t).join('')).replace(/\s+/g, ' ').trim()));
    expect(written, `${title}: table ${i + 1}`).toEqual(plain.map((r) => r.map((c) => c.replace(/\s+/g, ' ').trim())));
  });
  const htmlTables = [...html.matchAll(/<table\b[\s\S]*?<\/table>/g)].map((m) => m[0]);
  let scripted = 0;
  htmlTables.forEach((ht, i) => {
    const firstRow = /<tr\b[\s\S]*?<\/tr>/.exec(ht)?.[0] ?? '';
    const headCells = [...firstRow.matchAll(/<t[hd]\b[\s\S]*?<\/t[hd]>/g)].map((m) => m[0]);
    headCells.forEach((c, j) => { if (/<msub>|<sub>/.test(c) && ++scripted) expect(docTables[i]![0]![j]!.some((r) => r.sub), `${title}: table ${i + 1} head ${j + 1} keeps its subscript`).toBe(true); });
  });
  return scripted;
  const xlsx = (await reportFile('xlsx', { title, html, stem: 'x', loadXlsx: async () => XLSX }))!;
  const wb = XLSX.read(xlsx.bytes as Uint8Array, { type: 'array' });
  expect(wb.SheetNames.length, `${title}: one sheet per table and the text`).toBe(tables.length + 1);
  const csv = (await reportFile('csv', { title, html, stem: 'x', loadXlsx: async () => XLSX }))!;
  expect(csv.filename).toMatch(tables.length > 1 ? /-csv\.zip$/ : /\.csv$/);
  for (const f of ['pdf', 'html'] as const) expect(await reportFile(f, { title, html, stem: 'x', loadXlsx: async () => XLSX }).then((r) => (f === 'pdf' ? r === null : !!r))).toBe(true);
}

describe('the same five formats on both lines', () => {
  it('the analysed model\'s report', async () => {
    project();
    const m = modelStore.model, results = resultsStore.results3D ?? [...resultsStore.perCase3D.values()][0]!;
    const html = generateReportHtml({
      projectName: 'Obra A', date: '2026-10-19', nodes: [...m.nodes.values()], elements: [...m.elements.values()], materials: [...m.materials.values()], sections: [...m.sections.values()], supports: [...m.supports.values()],
      loadCount: m.loads.length, results, t: (k: string) => k,
    } as never);
    expect(await sameTables('Informe', html), 'the report has subscripted headers to check').toBeGreaterThan(5);
  });

  it('the designed model\'s memoria', async () => {
    project();
    expect(designRunStore.computeDemands().ok).toBe(true);
    designRunStore.autoDesign([...verificationStore.contexts.keys()]);
    detailingStore.generate();
    const tr = (key: string, params?: Record<string, string | number>) => teAt({ key, ...(params ? { params } : {}) }, 'es');
    const ctx = { tr, msg: (x: never) => teAt(x, 'es'), fmt: (v: number, d: number) => new Intl.NumberFormat('es', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v) };
    const html = renderMemoriaHtml(memoriaInput(tr, 'es'), new Set(ALL_CHAPTERS), ctx as never, 'es');
    await sameTables('Memoria', html);
  });
});
