/** Every report in the same five formats: its HTML read as blocks, the blocks in Word, workbook and CSV. */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { strFromU8, unzipSync } from 'fflate';
import { blocksCsv, blocksWorkbook, decodeEntities, htmlToBlocks, reportFile } from '../report-formats';

const html = `<!doctype html><html><head><title>x</title><style>h1{color:red}</style></head><body>
<h1>Memoria de cálculo</h1><p>Obra: <b>Edificio&nbsp;Sur</b> &mdash; rev. A</p>
<svg><text>figure text</text></svg><img src="data:x">
<h2>Vigas</h2><table><thead><tr><th>Viga</th><th>Mu (kN·m)</th></tr></thead><tbody><tr><td>V1</td><td>12,5</td></tr><tr><td>V2</td><td>&lt;10</td></tr></tbody></table>
<ul><li>Primera nota</li><li>Segunda<br>nota</li></ul>
<h2>Columnas</h2><table><tr><th>Columna</th><th>N</th></tr><tr><td>C1</td><td>300</td></tr></table></body></html>`;

describe('a report read as blocks', () => {
  const b = htmlToBlocks(html);
  it('keeps headings, paragraphs and tables in order, without styles or figures', () => {
    expect(b.map((x) => x.kind)).toEqual(['heading', 'paragraph', 'heading', 'table', 'paragraph', 'paragraph', 'heading', 'table']);
    expect(b[0]).toEqual({ kind: 'heading', text: 'Memoria de cálculo', level: 1 });
    expect(b[1]).toEqual({ kind: 'paragraph', text: 'Obra: Edificio Sur — rev. A' });
    expect(b[3]).toEqual({ kind: 'table', head: ['Viga', 'Mu (kN·m)'], rows: [['V1', '12,5'], ['V2', '<10']] });
    expect(JSON.stringify(b)).not.toMatch(/figure text|color:red/);
  });
  it('decodes the entities our reports write', () => {
    expect(decodeEntities('a&nbsp;b &#216; &#x2014; &amp;')).toBe('a b Ø — &');
  });
  it('a workbook with the text first and a sheet per table, named after its heading; numbers as numbers', () => {
    const wb = XLSX.read(blocksWorkbook(XLSX, 'Memoria', b), { type: 'array' });
    expect(wb.SheetNames).toEqual(['Memoria', 'Vigas', 'Columnas']);
    const v = XLSX.utils.sheet_to_json<Array<string | number>>(wb.Sheets.Vigas!, { header: 1 });
    expect(v).toEqual([['Viga', 'Mu (kN·m)'], ['V1', 12.5], ['V2', '<10']]);
  });
  it('CSV: one table, one file; more, a zip with one file each', () => {
    const z = blocksCsv(b);
    expect(z.name).toBe('zip');
    expect(Object.keys(unzipSync(z.bytes))).toEqual(['01-Vigas.csv', '02-Columnas.csv']);
    expect(strFromU8(unzipSync(z.bytes)['02-Columnas.csv']!)).toBe('Columna;N\r\nC1;300\r\n');
    expect(blocksCsv([b[3]!]).name).toBe('csv');
  });
  it('DOCX: the same tables in the document', async () => {
    const f = (await reportFile('docx', { title: 'Memoria', html, stem: 'memoria', loadXlsx: async () => XLSX }))!;
    expect(f.filename).toBe('memoria.docx');
    const xml = strFromU8(unzipSync(f.bytes as Uint8Array)['word/document.xml']!);
    expect(xml).toContain('Edificio Sur');
    expect(xml).toContain('&lt;10');
    expect((xml.match(/<w:tbl>/g) ?? []).length).toBe(2);
  });
});
