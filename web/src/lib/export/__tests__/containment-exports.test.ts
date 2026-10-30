import { beforeAll, beforeEach, afterEach, expect, it, vi } from 'vitest';
const output = vi.hoisted(() => ({ texts: [] as string[], blobs: [] as Blob[] }));
vi.mock('../../store/file', async orig => ({ ...(await orig<typeof import('../../store/file')>()),
  downloadText: (content: string) => output.texts.push(content),
  downloadBlob: (blob: Blob) => output.blobs.push(blob),
}));
vi.mock('xlsx', async orig => ({ ...(await orig<typeof import('xlsx')>()), writeFile: vi.fn() }));
import * as XLSX from 'xlsx';
import { unzipSync, strFromU8 } from 'fflate';
import { modelStore, resultsStore, uiStore } from '../../store';
import { initSolver } from '../../engine/wasm-solver';
import { downloadResultText } from '../provenance-attach';
import { buildExcelWorkbook, exportToExcel } from '../excel';
import { currentWorkbookSheets, downloadProjectCsv, downloadProjectWorkbook } from '../../store/project-workbook';
import { setLocale } from '../../i18n';

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
  for (const [message] of toast.mock.calls) { expect(message).toContain('#741'); expect(message).not.toMatch(/ENGINE|structuredDiagnostics/); }
});
it('both project workbook download formats refuse without an unhandled rejection', async () => {
  publish('error');
  const toast = vi.spyOn(uiStore, 'toast');
  expect(() => currentWorkbookSheets(2)).toThrow(/#741/);
  await expect(downloadProjectCsv(2)).resolves.toBeUndefined();
  await expect(downloadProjectWorkbook(2)).resolves.toBeUndefined();
  expect(output.blobs).toEqual([]);
  expect(XLSX.writeFile).not.toHaveBeenCalled();
  expect(toast.mock.calls.every(([message]) => message.includes('#741'))).toBe(true);
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
  const ctx = { font: '', fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn(), measureText: (s: string) => ({ width: s.length * 8 }), fillText: (s: string) => text.push(s) };
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
