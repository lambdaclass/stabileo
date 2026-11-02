import { describe, it, expect } from 'vitest';
import katex from 'katex';
import * as XLSX from 'xlsx';
import { strFromU8, unzipSync } from 'fflate';
import { htmlToDocxBlocks, printColours } from '../report-docx';
import { mathmlRuns } from '../mathml-runs';
import { docxBytes, type DocBlock } from '../docx';
import { htmlToBlocks, reportFile } from '../report-formats';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const stub = async (_src: string, size: { width?: number; height?: number }) => ({ png: PNG, width: size.width ?? 600, height: size.height ?? 400 });
const km = (tex: string) => katex.renderToString(tex, { throwOnError: false, output: 'htmlAndMathml' });

function wellFormed(xml: string): void {
  const stack: string[] = [];
  for (const m of xml.matchAll(/<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>/g)) {
    if (m[1]) expect(stack.pop(), `closing ${m[2]}`).toBe(m[2]);
    else if (!m[4]) stack.push(m[2]!);
  }
  expect(stack).toEqual([]);
  expect(xml.replace(/<\?xml[^>]*\?>/, '').replace(/<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>/g, '')).not.toMatch(/[<>]/);
}

const REPORT = `<!DOCTYPE html><html><head><title>x</title><style>.a{}</style></head><body>
<button class="print-btn no-print" onclick="window.print()">Imprimir</button>
<div class="cover-page"><img src="data:image/png;base64,AAAA" alt="Logo" style="max-height:80px;max-width:250px" />
<h1>Obra Sur</h1><div class="subtitle">Memoria de cálculo</div>
<div style="border:2px solid #b8860b">Borrador de CAD sin revisar</div><div class="date">2026-10-28</div></div>
<div class="page-break"></div>
<h2>1. Resultados</h2>
<p class="note">Valores de la combinación C1 (envolvente).</p>
<table><thead><tr><th>Nodo</th><th>${km('F_x')} (kN)</th><th>${km('\\sigma_{xx}')} (MPa)</th></tr></thead>
<tbody><tr><td>N1</td><td class="num">-12,5</td><td class="num">3,0</td></tr><tr><td>N2</td><td class="num">4,0</td><td class="num"></td></tr></tbody></table>
<figure><img class="screenshot" src="data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E" alt="Momentos My" /><figcaption>Figura 1. Momentos My</figcaption></figure>
<p class="diag-warn">El nodo 7 está suelto.</p>
<section class="provenance"><h2>Procedencia</h2><p class="provenance-stale"><strong>Los resultados no corresponden al modelo actual</strong></p>
<table class="provenance-table"><tr><th>Estado</th><td><code>desactualizado</code></td></tr></table></section>
<script type="application/json" id="stabileo-provenance">{}</script>
</body></html>`;

/** Each paragraph and table cell of the DOCX as text, sub- and superscripts as _{…} and ^{…}, TeX fallback as ⟦…⟧. */
function written(docx: Uint8Array): { paragraphs: string[]; cells: string[][][] } {
  const xml = strFromU8(unzipSync(docx)['word/document.xml']!);
  const para = (p: string) => [...p.matchAll(/<w:r>([\s\S]*?)<\/w:r>/g)].map((r) => {
    const t = [...r[1]!.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    if (/w:val="subscript"/.test(r[1]!)) return `_{${t}}`;
    if (/w:val="superscript"/.test(r[1]!)) return `^{${t}}`;
    if (/Consolas/.test(r[1]!)) return `⟦${t}⟧`;
    return t;
  }).join('');
  const cells = [...xml.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g)].map((tb) => [...tb[1]!.matchAll(/<w:tr>([\s\S]*?)<\/w:tr>/g)].map((tr) => [...tr[1]!.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((tc) => para(tc[1]!))));
  const outside = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, '');
  return { paragraphs: [...outside.matchAll(/<w:p>([\s\S]*?)<\/w:p>/g)].map((p) => para(p[1]!)).filter(Boolean), cells };
}

const MATH = `<html><body>
<h2>Rigidez ${km('\\frac{L^2}{EI}')}</h2>
<p>Flecha ${km('\\frac{5qL^4}{384EI}')}, radio ${km('\\sqrt{x^2+y^2}')}, cociente ${km('\\frac{a}{b/c}')}.</p>
<p>Anidados: ${km('\\frac{1}{\\frac{1}{x}+1}')}; ${km('x_{a^2}')}; ${km('\\sqrt[3]{x}')}; ${km("f'_c")}; ${km('\\left(a+b\\right)^2')}; ${km('\\bar{x}')}.</p>
<table><tr><th>Símbolo</th><th>${km('F_x')} (kN)</th><th>Límite</th></tr>
<tr><td>x<sup>2</sup> + I<sub>y</sub></td><td class="num">-12,5</td><td>${km('\\frac{L}{250}')}</td></tr></table>
</body></html>`;

describe('expressions written to Word keep their meaning', () => {
  it('in headings, paragraphs, table headers and table bodies, read from the final DOCX', async () => {
    const f = (await reportFile('docx', { title: 'T', html: MATH, stem: 't', loadXlsx: async () => XLSX }))!;
    const w = written(f.bytes as Uint8Array);
    expect(w.paragraphs).toContain('Rigidez L^{2}/(EI)');
    expect(w.paragraphs).toContain('Flecha (5qL^{4})/(384EI), radio √(x^{2}+y^{2}), cociente a/(b/c).');
    expect(w.paragraphs).toContain('Anidados: 1/(1/x+1); x_{a^(2)}; ^{3}√(x); f_{c}^{′}; (a+b)^{2}; ⟦\\bar{x}⟧.');
    expect(w.cells[0]).toEqual([['Símbolo', 'F_{x} (kN)', 'Límite'], ['x^{2} + I_{y}', '-12,5', 'L/250']]);
  });

  it('the parts KaTeX itself writes: fractions, roots, scripts at any depth; null for what has no plain form', () => {
    const mm = (tex: string) => katex.renderToString(tex, { output: 'mathml' });
    expect(mathmlRuns(mm('\\frac{L^2}{EI}'))).toEqual([{ text: 'L' }, { text: '2', vert: 'sup' }, { text: '/(EI)' }]);
    expect(mathmlRuns(mm('\\sqrt{x^2+y^2}'))).toEqual([{ text: '√(x' }, { text: '2', vert: 'sup' }, { text: '+y' }, { text: '2', vert: 'sup' }, { text: ')' }]);
    expect(mathmlRuns(mm('\\sigma_{xx} \\leq \\gamma'))).toEqual([{ text: 'σ' }, { text: 'xx', vert: 'sub' }, { text: '≤γ' }]);
    expect(mathmlRuns(mm('\\sum_{i=1}^{n} x_i'))).toEqual([{ text: '∑' }, { text: 'i=1', vert: 'sub' }, { text: 'n', vert: 'sup' }, { text: 'x' }, { text: 'i', vert: 'sub' }]);
    expect(mathmlRuns(mm('\\frac{1}{2} q L^2'))).toEqual([{ text: '(1/2)qL' }, { text: '2', vert: 'sup' }]);
    expect(mathmlRuns(mm('x/\\frac{a}{b}'))).toEqual([{ text: 'x/(a/b)' }]);
    expect(mathmlRuns(mm('\\frac{a}{b}(c+d)'))).toEqual([{ text: '(a/b)(c+d)' }]);
    expect(mathmlRuns(mm('\\frac{a}{b} + c = d'))).toEqual([{ text: 'a/b+c=d' }]);
    expect(mathmlRuns(mm('\\bar{x}'))).toBeNull();
    expect(mathmlRuns(mm('\\begin{pmatrix}a\\\\b\\end{pmatrix}'))).toBeNull();
    expect(mathmlRuns(mm('\\binom{n}{k}'))).toBeNull();
  });
});

describe('a report read for Word', () => {
  it('keeps the cover with its logo, the page break, styled notes and warnings, figures with their caption, and number columns to the right', async () => {
    const { blocks, cover } = await htmlToDocxBlocks(REPORT, stub);
    expect(cover).toBe(true);
    const kinds = blocks.map((b) => b.kind);
    expect(kinds[0]).toBe('image');
    expect(blocks[0]).toMatchObject({ kind: 'image', alt: 'Logo', align: 'center', width: 250, height: 80 });
    expect(blocks[1]).toMatchObject({ kind: 'paragraph', text: 'Obra Sur', align: 'center' });
    expect(blocks.find((b) => b.kind === 'paragraph' && b.text.startsWith('Borrador'))).toMatchObject({ tone: 'warn', align: 'center' });
    const brk = kinds.indexOf('pageBreak');
    expect(brk).toBeGreaterThan(1);
    expect(blocks[brk + 1]).toMatchObject({ kind: 'heading', text: '1. Resultados', level: 2 });
    expect(blocks.find((b) => b.kind === 'paragraph' && b.text.startsWith('Valores'))).toMatchObject({ tone: 'note' });
    const t = blocks.find((b) => b.kind === 'table') as Extract<DocBlock, { kind: 'table' }>;
    expect(t.head).toEqual(['Nodo', 'Fx (kN)', 'σxx (MPa)']);
    expect(t.headRuns![1]).toEqual([{ text: 'F' }, { text: 'x', vert: 'sub' }, { text: ' (kN)' }]);
    expect(t.align).toEqual(['left', 'right', 'right']);
    expect(t.rows).toEqual([['N1', '-12,5', '3,0'], ['N2', '4,0', '']]);
    expect(t.rowRuns![0]).toEqual([[{ text: 'N1' }], [{ text: '-12,5' }], [{ text: '3,0' }]]);
    const fig = blocks.findIndex((b) => b.kind === 'image' && b.alt === 'Momentos My');
    expect(blocks[fig + 1]).toMatchObject({ kind: 'paragraph', caption: true, text: 'Figura 1. Momentos My' });
    expect(blocks.find((b) => b.kind === 'paragraph' && b.text.startsWith('El nodo 7'))).toMatchObject({ tone: 'warn' });
    expect(blocks.find((b) => b.kind === 'paragraph' && b.text.startsWith('Los resultados no'))).toMatchObject({ tone: 'error' });
    expect(blocks.some((b) => b.kind === 'paragraph' && b.text.includes('Imprimir'))).toBe(false);
  });

  it('writes a figure it cannot draw as its caption, never silently drops it', async () => {
    const { blocks } = await htmlToDocxBlocks(REPORT, undefined, '[Figura no incluida]');
    expect(blocks.filter((b) => b.kind === 'image')).toHaveLength(0);
    expect(blocks.find((b) => b.kind === 'paragraph' && b.text === '[Figura no incluida] Momentos My')).toMatchObject({ tone: 'note' });
  });

  it('recolours the dark interaction diagrams as the print style does', () => {
    expect(printColours('<rect fill="#1a2a40"/><line stroke="#4ecdc4"/>')).toBe('<rect fill="#f0f0f0"/><line stroke="#1a5090"/>');
  });

  it('the plain reading (workbook and CSV) does not read KaTeX twice', () => {
    const t = htmlToBlocks(REPORT).find((b) => b.kind === 'table') as Extract<DocBlock, { kind: 'table' }>;
    expect(t.head).toEqual(['Nodo', 'Fx (kN)', 'σxx (MPa)']);
  });
});

describe('the Word package', () => {
  it('holds every part it names: images, header and footer with page fields, the styles its paragraphs use', async () => {
    const f = (await reportFile('docx', { title: 'Obra Sur', html: REPORT, stem: 'informe', provenance: { title: 'Procedencia', lines: [['Estado', 'desactualizado']] }, docx: { header: 'Stabileo 0.3.0 · Obra Sur', footer: { left: 'Obra Sur · 2026-10-28', page: 'Página {page} de {pages}' }, rasterize: stub }, loadXlsx: async () => XLSX }))!;
    const z = unzipSync(f.bytes as Uint8Array);
    const doc = strFromU8(z['word/document.xml']!), rels = strFromU8(z['word/_rels/document.xml.rels']!), types = strFromU8(z['[Content_Types].xml']!), styles = strFromU8(z['word/styles.xml']!);
    for (const p of ['word/document.xml', 'word/styles.xml', 'word/header1.xml', 'word/footer1.xml', 'word/_rels/document.xml.rels', '[Content_Types].xml']) wellFormed(strFromU8(z[p]!));
    expect(Object.keys(z).filter((k) => k.startsWith('word/media/'))).toHaveLength(2);
    for (const id of doc.matchAll(/r:(?:embed|id)="([^"]+)"/g)) {
      const target = new RegExp(`Id="${id[1]}"[^>]*Target="([^"]+)"`).exec(rels)?.[1];
      expect(target, id[1]).toBeTruthy();
      expect(z[`word/${target}`], target).toBeTruthy();
    }
    expect(types).toContain('Extension="png"');
    expect(types).toContain('/word/header1.xml');
    for (const s of doc.matchAll(/<w:pStyle w:val="([^"]+)"\/>/g)) expect(styles, s[1]).toContain(`w:styleId="${s[1]}"`);
    const footer = strFromU8(z['word/footer1.xml']!);
    expect(footer).toContain('w:instr=" PAGE "');
    expect(footer).toContain('w:instr=" NUMPAGES "');
    expect(footer).toContain('Página ');
    expect(strFromU8(z['word/header1.xml']!)).toContain('Stabileo 0.3.0 · Obra Sur');
    expect(doc).toContain('<w:titlePg/>');
    expect(doc).not.toContain('w:val="Title"');
    expect(doc).toContain('<w:vertAlign w:val="subscript"/>');
    expect((doc.match(/Procedencia/g) ?? []).length).toBe(1);
    expect((doc.match(/<w:tbl>/g) ?? []).length).toBe(2);
    expect(doc).toContain('<w:jc w:val="right"/>');
  });

  it('keeps the plain blocks other writers pass: a title, headings, paragraphs and tables, and no header without one', () => {
    const z = unzipSync(docxBytes({ title: 'Listado', blocks: [{ kind: 'heading', text: 'Columnas', level: 1 }, { kind: 'paragraph', text: 'Nota', muted: true }, { kind: 'table', head: ['Columna', 'N'], rows: [['C1', '300']], align: ['left', 'right'] }] }));
    const doc = strFromU8(z['word/document.xml']!);
    wellFormed(doc);
    expect(doc).toContain('w:val="Title"');
    expect(doc).toContain('Listado');
    expect(z['word/header1.xml']).toBeUndefined();
    expect(doc).not.toContain('headerReference');
  });
});
