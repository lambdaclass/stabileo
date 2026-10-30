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
