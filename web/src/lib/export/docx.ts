/**
 * A Word document (DOCX, Office Open XML) written by us: a zip of the few XML parts a word
 * processor needs (content types, relationships, the document, its styles and properties) holding
 * headings, paragraphs and tables. Enough for the listings and reports: every table with its
 * header row repeated on each page, numbers aligned right, the page in A4 or landscape.
 *
 * Pure: the bytes, no download.
 */
import { strToU8, zipSync } from 'fflate';

export type DocBlock =
  | { kind: 'heading'; text: string; level?: 1 | 2 | 3 }
  | { kind: 'paragraph'; text: string; muted?: boolean }
  | { kind: 'table'; head: string[]; rows: string[][]; align?: Array<'left' | 'right'> };

export interface DocModel { title: string; author?: string; landscape?: boolean; blocks: DocBlock[] }

const x = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // Characters XML 1.0 does not allow.
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

const run = (text: string, opts: { bold?: boolean; muted?: boolean } = {}) =>
  `<w:r>${opts.bold || opts.muted ? `<w:rPr>${opts.bold ? '<w:b/>' : ''}${opts.muted ? '<w:color w:val="555555"/>' : ''}</w:rPr>` : ''}<w:t xml:space="preserve">${x(text)}</w:t></w:r>`;
const para = (text: string, style?: string, opts: { bold?: boolean; muted?: boolean; align?: 'left' | 'right' } = {}) =>
  `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${opts.align === 'right' ? '<w:jc w:val="right"/>' : ''}<w:spacing w:after="${style ? 120 : 60}"/></w:pPr>${run(text, opts)}</w:p>`;

function table(t: Extract<DocBlock, { kind: 'table' }>, widthTw: number): string {
  const n = Math.max(1, t.head.length);
  const w = Math.floor(widthTw / n);
  const cell = (s: string, j: number, head: boolean) =>
    `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="E8E8E8"/>' : ''}</w:tcPr>${para(s, undefined, { bold: head, align: head ? 'left' : t.align?.[j] })}</w:tc>`;
  const border = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`).join('') + '</w:tblBorders>';
  return `<w:tbl><w:tblPr><w:tblW w:w="${widthTw}" w:type="dxa"/>${border}<w:tblCellMar><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr>`
    + `<w:tblGrid>${t.head.map(() => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
    + `<w:tr><w:trPr><w:tblHeader/></w:trPr>${t.head.map((h, j) => cell(h, j, true)).join('')}</w:tr>`
    + t.rows.map((r) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${t.head.map((_, j) => cell(r[j] ?? '', j, false)).join('')}</w:tr>`).join('')
    + `</w:tbl>${para('')}`;
}

export function docxBytes(d: DocModel, at = new Date().toISOString()): Uint8Array {
  // A4: 11906 × 16838 twips; margins of 2 cm (1134 twips).
  const [W, H] = d.landscape ? [16838, 11906] : [11906, 16838], M = 1134;
  const body = [
    para(d.title, 'Title'),
    ...d.blocks.map((b) => (b.kind === 'heading' ? para(b.text, `Heading${b.level ?? 1}`) : b.kind === 'paragraph' ? para(b.text, undefined, { muted: !!b.muted }) : table(b, W - 2 * M))),
  ].join('');
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}`
    + `<w:sectPr><w:pgSz w:w="${W}" w:h="${H}"${d.landscape ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${M}" w:right="${M}" w:bottom="${M}" w:left="${M}" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const style = (id: string, name: string, size: number, bold: boolean, extra = '') =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/>${extra}</w:pPr><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/></w:rPr></w:style>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`
    + `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="18"/><w:lang w:val="es-AR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
    + `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>`
    + style('Title', 'Title', 32, true) + style('Heading1', 'heading 1', 26, true, '<w:spacing w:before="240"/><w:outlineLvl w:val="0"/>') + style('Heading2', 'heading 2', 22, true, '<w:spacing w:before="200"/><w:outlineLvl w:val="1"/>') + style('Heading3', 'heading 3', 20, true, '<w:outlineLvl w:val="2"/>')
    + `<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>`
    + `</w:styles>`;
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
    'word/_rels/document.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'word/document.xml': strToU8(document),
    'word/styles.xml': strToU8(styles),
    'docProps/core.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(d.title)}</dc:title><dc:creator>${x(d.author ?? 'Stabileo')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${x(at.slice(0, 19))}Z</dcterms:created></cp:coreProperties>`),
  };
  return zipSync(files);
}
