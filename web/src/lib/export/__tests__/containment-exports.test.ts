import { beforeAll, beforeEach, afterEach, expect, it, vi } from 'vitest';
const output = vi.hoisted(() => ({ texts: [] as string[], blobs: [] as Blob[] }));
vi.mock('../../store/file', async orig => ({ ...(await orig<typeof import('../../store/file')>()),
  downloadText: (content: string) => output.texts.push(content),
  downloadBlob: (blob: Blob) => output.blobs.push(blob),
}));
// The browser download behind the account gate: the tests read what reached the object URL.
vi.mock('../save-file', () => ({ saveFile: (_name: string, data: Blob) => { URL.createObjectURL(data); } }));
vi.mock('xlsx', async orig => ({ ...(await orig<typeof import('xlsx')>()), writeFile: vi.fn() }));
import * as XLSX from 'xlsx';
import { unzipSync, strFromU8 } from 'fflate';
import { modelStore, resultsStore, uiStore } from '../../store';
import { initSolver } from '../../engine/wasm-solver';
import { downloadResultText } from '../provenance-attach';
import { buildExcelWorkbook, exportToExcel } from '../excel';
import { currentWorkbookSheets, downloadProjectCsv, downloadProjectWorkbook } from '../../store/project-workbook';
import { setLocale, t } from '../../i18n';
import { pngWithProvenance, jpegWithProvenance } from '../provenance-attach';
import { copyView } from '../view-export';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
  output.texts.length = 0; output.blobs.length = 0; vi.clearAllMocks(); setLocale('es');
});
afterEach(() => { vi.restoreAllMocks(); resultsStore.clear(); setLocale('en'); });
function publish(severity: 'warning' | 'error') {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
  modelStore.addElement(a, b, 'frame'); modelStore.addSupport(a, 'fixed3d');
  modelStore.addNodalLoad3D(b, 0, 0, -10, 0, 0, 0);
  const result = modelStore.solve3D(false, false, true);
  if (!result || typeof result === 'string') throw new Error(String(result));
  result.structuredDiagnostics = [{ code: 'known_issue', severity, phase: 'BU-BOUND', value: 741, message: 'ENGINE' }];
  resultsStore.setResults3D(result);
}
it('CSV and XLSX refuse unsafe payloads with localized feedback, including extra-sheet exports', async () => {
  publish('error');
  const toast = vi.spyOn(uiStore, 'toast');
  expect(await downloadResultText('unsafe,987654', 'table.csv', 'text/csv')).toBe(false);
  expect(await exportToExcel({ onlyExtras: true, extraSheets: [{ name: 'Table', rows: [['987654']] }] })).toBe(false);
  expect(output.texts).toEqual([]);
  expect(XLSX.writeFile).not.toHaveBeenCalled();
  expect(toast.mock.calls).toHaveLength(2);
  const spanish = t('knownIssue.BU-BOUND');
  expect(spanish).toMatch(/Resultados bloqueados/);
  for (const [message] of toast.mock.calls) { expect(message).toContain('#741'); expect(message).toContain(spanish); expect(message).not.toMatch(/ENGINE|structuredDiagnostics/); }
});
it('both project workbook download formats refuse without an unhandled rejection', async () => {
  publish('error');
  const toast = vi.spyOn(uiStore, 'toast');
  expect(() => currentWorkbookSheets(2)).toThrow(/#741/);
  await expect(downloadProjectCsv(2)).resolves.toBeUndefined();
  await expect(downloadProjectWorkbook(2)).resolves.toBeUndefined();
  expect(output.blobs).toEqual([]);
  expect(XLSX.writeFile).not.toHaveBeenCalled();
  expect(toast.mock.calls.length).toBeGreaterThanOrEqual(2);
  for (const [message] of toast.mock.calls) { expect(message).toContain('#741'); expect(message).toContain(t('knownIssue.BU-BOUND')); }
});
it('PNG, JPEG and clipboard exports refuse an unsafe result with the localized refusal', async () => {
  publish('error');
  expect(() => pngWithProvenance(new Uint8Array([137, 80, 78, 71]), {} as never)).toThrow(/#741/);
  expect(() => jpegWithProvenance(new Uint8Array([255, 216]), {} as never)).toThrow(/#741/);
  const copied: unknown[] = [];
  const write = vi.fn(async (items: Array<{ items: Record<string, Promise<Blob>> }>) => { copied.push(await items[0]!.items['image/png']); });
  vi.stubGlobal('ClipboardItem', class { constructor(public items: unknown) {} });
  vi.stubGlobal('navigator', { clipboard: { write } });
  const toast = vi.spyOn(uiStore, 'toast');
  try {
    expect(await copyView({ contents: ['model'] } as never)).toBe(false);
  } finally { vi.unstubAllGlobals(); }
  expect(copied).toEqual([]);
  expect(toast.mock.calls).toHaveLength(1);
  expect(toast.mock.calls[0]![0]).toContain('#741');
  expect(toast.mock.calls[0]![0]).toContain(t('knownIssue.BU-BOUND'));
});
it('warning-only CSV, XLSX and zipped workbooks preserve numbers and mandatory warnings', async () => {
  publish('warning');
  expect(await downloadResultText('value\n987654', 'table.csv', 'text/csv')).toBe(true);
  expect(output.texts[0]).toContain('#741'); expect(output.texts[0]).toContain('987654');
  const wb = await buildExcelWorkbook({ onlyExtras: true, extraSheets: [{ name: 'Table', rows: [['987654']] }] });
  expect(wb!.SheetNames).toContain('Warnings');
  expect(XLSX.utils.sheet_to_csv(wb!.Sheets.Warnings!)).toContain('#741');
  expect(XLSX.utils.sheet_to_csv(wb!.Sheets.Table!)).toContain('987654');
  await downloadProjectWorkbook(2);
  expect(XLSX.writeFile).toHaveBeenCalledTimes(1);
  const sheets = currentWorkbookSheets(2);
  expect(sheets.find(s => s.name === 'Warnings')!.rows.flat().join(' ')).toContain('#741');
  await downloadProjectCsv(2);
  const zipped = unzipSync(new Uint8Array(await output.blobs[0]!.arrayBuffer()));
  expect(Object.entries(zipped).filter(([name]) => name.includes('Warnings')).map(([, bytes]) => strFromU8(bytes)).join()).toContain('#741');
});

it.each(['html', 'dxf', 'svg'])('warned %s exports contain visible warnings and refused ones write nothing', async ext => {
  publish('warning');
  const content = ext === 'html' ? '<html><body><p>987654</p></body></html>' : ext === 'svg' ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><text>987654</text></svg>' : '0\nSECTION\n2\nENTITIES\n0\nTEXT\n1\n987654\n0\nENDSEC\n0\nEOF';
  expect(await downloadResultText(content, `result.${ext}`, 'text/plain')).toBe(true);
  expect(output.texts[0]).toContain('#741'); expect(output.texts[0]).toContain('987654');
  expect(output.texts[0]).toContain(ext === 'html' ? 'id="stabileo-warnings"' : ext === 'svg' ? 'fill="#742d00"' : 'STABILEO_WARNINGS');
  modelStore.clear(); resultsStore.clear(); publish('error'); output.texts.length = 0;
  expect(await downloadResultText(content, `result.${ext}`, 'text/plain')).toBe(false);
  expect(output.texts).toEqual([]);
});

it('every DXF archive member carries visible warning TEXT entities', async () => {
  publish('warning');
  const { sheetSetDxfZip } = await import('../../sheets/sheet-set');
  const { dxfWithProvenance, svgWithProvenance, prepareExportProvenance, reportProvenanceLines } = await import('../provenance-attach');
  const record = (await prepareExportProvenance())!;
  const { title, lines } = reportProvenanceLines(record);
  const bytes = sheetSetDxfZip([1, 2].map(n => ({ number: `E-0${n}`, width: 420, height: 297, primitives: [] })) as never, undefined, '2004', { dxf: d => dxfWithProvenance(d, record), svg: d => svgWithProvenance(d, record), title, lines });
  const members = Object.entries(unzipSync(bytes)).filter(([name]) => name.endsWith('.dxf'));
  expect(members).toHaveLength(2);
  for (const [, bytes] of members) { const dxf = strFromU8(bytes); expect(dxf).toContain('STABILEO_WARNINGS'); expect(dxf).toContain('#741'); }
});

it('DXF warnings sit beside translated geometry and scale with its extent', async () => {
  const { dxfWithProvenance, prepareExportProvenance } = await import('../provenance-attach');
  const record = (await prepareExportProvenance())!;
  const dxf = '0\nSECTION\n2\nHEADER\n9\n$INSBASE\n10\n0\n20\n0\n30\n0\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n500000\n20\n1000\n30\n0\n11\n500040\n21\n1030\n31\n0\n0\nENDSEC\n0\nEOF\n';
  expect(dxfWithProvenance(dxf, record, ['año ğ #741'])).toContain('\n1\na\\U+00F1o \\U+011F #741\n');
  const out = dxfWithProvenance(dxf, record, ['warning #741']);
  const text = /0\nTEXT\n8\nSTABILEO_WARNINGS\n10\n([^\n]+)\n20\n([^\n]+)\n30\n0\n40\n([^\n]+)\n1\nwarning #741/.exec(out)!;
  expect(text).not.toBeNull();
  const [x, y, height] = text.slice(1).map(Number);
  expect(x).toBe(500000);
  expect(height).toBe(0.5);
  expect(y).toBeLessThan(1000);
  expect(y).toBeGreaterThan(990);
});

it('DXF warnings go into an ENTITIES section written with padded group codes', async () => {
  const { dxfWithProvenance, prepareExportProvenance } = await import('../provenance-attach');
  const record = (await prepareExportProvenance())!;
  const dxf = '  0\nSECTION\n  2\nENTITIES\n  0\nLINE\n  8\n0\n 10\n0\n 20\n0\n 30\n0\n 11\n10\n 21\n0\n 31\n0\n  0\nENDSEC\n  0\nEOF\n';
  const out = dxfWithProvenance(dxf, record, ['warning #741']);
  expect(out.match(/ENTITIES/g)).toHaveLength(1);
  expect(out).toMatch(/ENTITIES\n0\nTEXT\n8\nSTABILEO_WARNINGS\n[\s\S]*\n1\nwarning #741\n  0\nLINE/);
});

it.each(['html', 'pdf', 'docx', 'csv', 'xlsx'] as const)('shared %s report boundary refuses and preserves warning text', async format => {
  const { downloadReport } = await import('../report-download');
  const blobs: Blob[] = [], printed: string[] = [];
  vi.stubGlobal('document', { createElement: () => ({ click() {} }) });
  vi.stubGlobal('window', { open: () => ({ document: { write: (s: string) => printed.push(s), close() {} }, focus() {}, print() {} }) });
  vi.spyOn(URL, 'createObjectURL').mockImplementation(b => { blobs.push(b as Blob); return 'blob:test'; });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  try {
    publish('warning');
    const report = { title: 'Report', stem: 'report', html: '<html><body><p>987654</p></body></html>', blocks: [{ kind: 'table' as const, head: ['Value'], rows: [['987654']] }] };
    expect(await downloadReport(format, report)).toBeTruthy();
    if (format === 'pdf') expect(printed.join()).toContain('#741');
    else {
      const bytes = new Uint8Array(await blobs[0]!.arrayBuffer());
      const text = format === 'docx' ? strFromU8(unzipSync(bytes)['word/document.xml']!) : format === 'xlsx' ? Object.values(XLSX.read(bytes).Sheets).map(s => XLSX.utils.sheet_to_csv(s)).join() : new TextDecoder().decode(bytes);
      expect(text).toContain('#741'); expect(text).toContain('987654');
    }
    modelStore.clear(); resultsStore.clear(); publish('error'); blobs.length = 0; printed.length = 0;
    expect(await downloadReport(format, report)).toBeNull();
    expect(blobs).toEqual([]); expect(printed).toEqual([]);
  } finally { vi.unstubAllGlobals(); }
});

it('PNG canvas capture burns complete warning text into an extended image', async () => {
  publish('warning');
  const { warningCanvas } = await import('../containment');
  const text: string[] = [];
  const tops: number[] = [];
  const ctx = { font: '', fillStyle: '', textBaseline: 'alphabetic', fillRect: vi.fn(), drawImage: vi.fn(), measureText: (s: string) => ({ width: s.length * 8 }),
    fillText: (s: string, _x: number, y: number) => { text.push(s); tops.push(ctx.textBaseline === 'top' ? y : y - parseFloat(ctx.font)); } };
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  vi.stubGlobal('document', { createElement: () => canvas });
  try {
    const original = { width: 390, height: 400 } as HTMLCanvasElement;
    expect(warningCanvas(original)).toBe(canvas);
    expect(canvas.height).toBeGreaterThan(400);
    expect(text.join('')).toContain('#741');
    expect(ctx.drawImage).toHaveBeenCalledWith(original, 0, 0);
  } finally { vi.unstubAllGlobals(); }
});

it('a caller sheet named Warnings cannot replace the mandatory warning sheet', async () => {
  publish('warning');
  for (const rows of [[], [['unrelated note']]]) {
    const wb = await buildExcelWorkbook({ onlyExtras: true, extraSheets: [{ name: 'Warnings', rows }, { name: 'Table', rows: [['987654']] }] });
    expect(wb!.SheetNames.filter(n => n === 'Warnings')).toHaveLength(1);
    const text = XLSX.utils.sheet_to_csv(wb!.Sheets.Warnings!);
    expect(text).toContain('#741');
    if (rows.length) expect(text).toContain('unrelated note');
    expect(XLSX.utils.sheet_to_csv(wb!.Sheets.Table!)).toContain('987654');
  }
  resultsStore.clear(); modelStore.clear();
  const clean = await buildExcelWorkbook({ onlyExtras: true, extraSheets: [{ name: 'Warnings', rows: [['caller note']] }] });
  expect(XLSX.utils.sheet_to_csv(clean!.Sheets.Warnings!)).toBe('caller note');
});

it('an existing, empty, hidden or earlier warning section in HTML is replaced by one visible section carrying both', async () => {
  publish('warning');
  const { warningHtml } = await import('../containment');
  for (const stale of ['<section id="stabileo-warnings"></section>', '<section id="stabileo-warnings" style="display:none"><p>#741</p></section>', "<section class=x id='stabileo-warnings'><p>old #1</p></section>"]) {
    const html = warningHtml(`<html><body>${stale}<p>987654</p></body></html>`);
    expect(html.match(/stabileo-warnings/g)).toHaveLength(1);
    expect(html).not.toContain('display:none');
    if (stale.includes('old #1')) expect(html).toContain('old #1');
    expect(html).toContain('#741');
    expect(html).toContain('Advertencias de seguridad');
    expect(html).toContain('987654');
  }
  expect(warningHtml(warningHtml('<html><body><p>1</p></body></html>'))).toBe(warningHtml('<html><body><p>1</p></body></html>'));
  expect(warningHtml('<html><body><section id="stabileo-warnings"><p>old</p></section></body></html>', [])).toContain('<p>old</p>');
  expect(warningHtml('<html><body><section id="stabileo-warnings"></section></body></html>', [])).not.toContain('stabileo-warnings');
});

it.each(['html', 'docx', 'csv'] as const)('a warned %s report exported from a clean workspace keeps its warnings', async format => {
  const { downloadReport } = await import('../report-download');
  const { warningHtml } = await import('../containment');
  const blobs: Blob[] = [];
  vi.stubGlobal('document', { createElement: () => ({ click() {} }) });
  vi.spyOn(URL, 'createObjectURL').mockImplementation(b => { blobs.push(b as Blob); return 'blob:test'; });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  try {
    publish('warning');
    const html = warningHtml('<html><body><p>987654</p></body></html>');
    modelStore.clear(); resultsStore.clear();
    const report = { title: 'Report', stem: 'report', html, blocks: [{ kind: 'table' as const, head: ['Value'], rows: [['987654']] }] };
    expect(await downloadReport(format, report)).toBeTruthy();
    const bytes = new Uint8Array(await blobs[0]!.arrayBuffer());
    const text = format === 'docx' ? strFromU8(unzipSync(bytes)['word/document.xml']!) : new TextDecoder().decode(bytes);
    expect(text).toContain('#741');
    expect(text).toContain('987654');
  } finally { vi.unstubAllGlobals(); }
});

it.each(['csv', 'docx'] as const)('a generated report re-exported as %s from a clean workspace keeps its warnings', async format => {
  const { downloadReport } = await import('../report-download');
  const { generateReportHtml } = await import('../../engine/pro-report');
  const blobs: Blob[] = [];
  vi.stubGlobal('document', { createElement: () => ({ click() {} }) });
  vi.spyOn(URL, 'createObjectURL').mockImplementation(b => { blobs.push(b as Blob); return 'blob:test'; });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  try {
    publish('warning');
    const m = modelStore.model;
    const html = generateReportHtml({
      projectName: 'Obra A', date: '2026-10-19', nodes: [...m.nodes.values()], elements: [...m.elements.values()], materials: [...m.materials.values()],
      sections: [...m.sections.values()], supports: [...m.supports.values()], loadCount: m.loads.length, results: resultsStore.results3D, t: (k: string) => k,
    } as never);
    expect(html).toContain('stabileo-warnings');
    modelStore.clear(); resultsStore.clear();
    expect(await downloadReport(format, { title: 'Report', stem: 'report', html, blocks: [{ kind: 'table' as const, head: ['Value'], rows: [['987654']] }] })).toBeTruthy();
    const bytes = new Uint8Array(await blobs[0]!.arrayBuffer());
    const text = format === 'docx' ? strFromU8(unzipSync(bytes)['word/document.xml']!) : new TextDecoder().decode(bytes);
    expect(text).toContain('#741');
  } finally { vi.unstubAllGlobals(); }
});

it('a model-only project workbook exports from a refused workspace; one with results does not', async () => {
  publish('error');
  const toast = vi.spyOn(uiStore, 'toast');
  vi.mocked(XLSX.writeFile).mockClear();
  await downloadProjectWorkbook(2, { results: false, design: false });
  expect(XLSX.writeFile).toHaveBeenCalledTimes(1);
  expect(toast.mock.calls.filter(([, kind]) => kind === 'error')).toEqual([]);
  await downloadProjectWorkbook(2);
  expect(XLSX.writeFile).toHaveBeenCalledTimes(1);
  expect(toast.mock.calls.at(-1)![0]).toContain('#741');
});

it('an independent result with its own record and sources ignores the workspace disposition', async () => {
  const { captureAnalysisProvenance } = await import('../../store/result-provenance');
  publish('error');
  output.texts.length = 0;
  const clean = { positions: 3, structuredDiagnostics: [] };
  const record = captureAnalysisProvenance('moving-load envelope', { step: 1 })(clean);
  expect(await downloadResultText('id,value\n1,42', 'moving.csv', 'text/csv', record, clean)).toBe(true);
  expect(output.texts.join()).toContain('42');
  expect(output.texts.join()).not.toContain('#741');
  const refused = { positions: 3, structuredDiagnostics: [{ code: 'known_issue', severity: 'error', phase: 'BU-BOUND', value: 741, message: 'ENGINE' }] };
  output.texts.length = 0;
  expect(await downloadResultText('id,value\n1,987654', 'moving.csv', 'text/csv', record, refused)).toBe(false);
  expect(output.texts).toEqual([]);
});

it('a canvas near the browser limit is scaled so image and warnings fit together', async () => {
  publish('warning');
  const { warningCanvas } = await import('../containment');
  const text: string[] = [];
  const tops: number[] = [];
  const ctx = { font: '', fillStyle: '', textBaseline: 'alphabetic', fillRect: vi.fn(), drawImage: vi.fn(), measureText: (s: string) => ({ width: s.length * 8 }),
    fillText: (s: string, _x: number, y: number) => { text.push(s); tops.push(ctx.textBaseline === 'top' ? y : y - parseFloat(ctx.font)); } };
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  vi.stubGlobal('document', { createElement: () => canvas });
  try {
    const original = { width: 16384, height: 16384 } as HTMLCanvasElement;
    warningCanvas(original);
    expect(canvas.width).toBeLessThanOrEqual(16384);
    expect(canvas.height).toBeLessThanOrEqual(16384);
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(2 ** 28);
    const [, , , w, h] = ctx.drawImage.mock.calls[0]!;
    expect(w / 16384).toBeCloseTo(h / 16384, 3);
    expect(h).toBeLessThan(16384);
    const font = parseFloat(ctx.font);
    expect(font).toBeGreaterThan(200);
    expect(Math.min(...tops)).toBeGreaterThanOrEqual(h);
    expect(Math.max(...tops) + 1.5 * font).toBeLessThanOrEqual(canvas.height);
    expect(text.join('')).toContain('#741');
  } finally { vi.unstubAllGlobals(); }
});

it('a warned SVG with a tiny coordinate system is enlarged so its warnings stay inside and readable', async () => {
  publish('warning');
  const { svgWithProvenance, prepareExportProvenance } = await import('../provenance-attach');
  const record = (await prepareExportProvenance())!;
  const out = svgWithProvenance('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>', record);
  const [, w, h] = /^<svg[^>]*width="([\d.]+)" height="([\d.]+)"/.exec(out)!.map(Number);
  expect(w).toBeGreaterThanOrEqual(640);
  const texts = [...out.matchAll(/<text x="([\d.]+)" y="([\d.]+)" font-size="([\d.]+)"[^>]*>([^<]*)</g)];
  expect(texts.length).toBeGreaterThan(0);
  for (const [, x, y, font, line] of texts) {
    expect(Number(x) + line.length * Number(font) * 0.65).toBeLessThanOrEqual(w);
    expect(Number(y)).toBeLessThanOrEqual(h);
  }
  const nested = /<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 10 10" x="0" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)">/.exec(out)!;
  expect(Number(nested[2])).toBe(w);
  expect(Number(nested[3])).toBe(w);
  expect(Number(nested[1]) + Number(nested[3])).toBeCloseTo(h, 6);
});
