import { strToU8, zipSync } from 'fflate';

export interface Run { text: string; vert?: 'sub' | 'sup'; bold?: boolean; italic?: boolean; color?: string; mono?: boolean }
export type Tone = 'note' | 'info' | 'warn' | 'error';

export type DocBlock =
  | { kind: 'heading'; text: string; level?: 1 | 2 | 3; runs?: Run[] }
  | { kind: 'paragraph'; text: string; muted?: boolean; runs?: Run[]; tone?: Tone; align?: 'center'; caption?: boolean }
  /** `headRuns` and `rowRuns`, when given, are what the cells print; `head` and `rows` stay their plain text. */
  | { kind: 'table'; head: string[]; rows: string[][]; align?: Array<'left' | 'right'>; headRuns?: Run[][]; rowRuns?: Run[][][] }
  /** `width` and `height` are the size to print at, in CSS pixels (96 per inch); the PNG may hold more. */
  | { kind: 'image'; png: Uint8Array; width: number; height: number; alt: string; align?: 'center' }
  | { kind: 'pageBreak' };

export interface DocModel {
  title: string;
  author?: string;
  landscape?: boolean;
  blocks: DocBlock[];
  showTitle?: boolean;
  header?: string;
  /** `page` holds `{page}` and `{pages}`, written as Word fields. */
  footer?: { left?: string; page?: string };
  /** The first page is a cover: no header or footer on it. */
  cover?: boolean;
}

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const DRAWING_NS = 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const TWIP_EMU = 635;
const PX_EMU = 9525;

const x = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // Characters XML 1.0 does not allow.
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

const TONE_COLOR: Record<Tone, string> = { note: '555555', info: '1A5090', warn: '8A5A00', error: 'B00020' };

function run(r: Run, base: { bold?: boolean; muted?: boolean; size?: number } = {}): string {
  const props = [
    r.mono ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' : '',
    r.bold || base.bold ? '<w:b/>' : '',
    r.italic ? '<w:i/>' : '',
    r.color ? `<w:color w:val="${r.color}"/>` : base.muted ? '<w:color w:val="555555"/>' : '',
    base.size ? `<w:sz w:val="${base.size}"/>` : '',
    r.vert ? `<w:vertAlign w:val="${r.vert === 'sub' ? 'subscript' : 'superscript'}"/>` : '',
  ].join('');
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${x(r.text)}</w:t></w:r>`;
}

function para(content: string | Run[], style?: string, opts: { bold?: boolean; muted?: boolean; align?: 'left' | 'right' | 'center'; size?: number; keepNext?: boolean } = {}): string {
  const runs = typeof content === 'string' ? [{ text: content }] : content;
  const ppr = [
    style ? `<w:pStyle w:val="${style}"/>` : '',
    opts.keepNext ? '<w:keepNext/>' : '',
    opts.align && opts.align !== 'left' ? `<w:jc w:val="${opts.align}"/>` : '',
    style ? '' : '<w:spacing w:after="60"/>',
  ].join('');
  return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${runs.map((r) => run(r, opts)).join('')}</w:p>`;
}

const plainLen = (s: string) => s.length;

function table(t: Extract<DocBlock, { kind: 'table' }>, widthTw: number): string {
  const n = Math.max(1, t.head.length);
  const weight = t.head.map((h, j) => Math.min(40, Math.max(5, plainLen(h), ...t.rows.map((r) => plainLen(r[j] ?? '')))));
  const total = weight.reduce((a, b) => a + b, 0) || 1;
  widthTw = Math.min(widthTw, Math.max(Math.round(widthTw * 0.45), total * 190));
  const w = weight.map((v) => Math.floor((widthTw * v) / total));
  const size = n > 6 ? 16 : 18;
  const cell = (s: string, j: number, head: boolean, i = -1) => {
    const rich = head ? t.headRuns?.[j] : t.rowRuns?.[i]?.[j];
    const runs = rich?.length ? rich : [{ text: s }];
    return `<w:tc><w:tcPr><w:tcW w:w="${w[j] ?? Math.floor(widthTw / n)}" w:type="dxa"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="E8E8E8"/>' : ''}</w:tcPr>${para(runs, head ? 'TableHeader' : 'TableText', { bold: head, align: head ? 'left' : t.align?.[j], size })}</w:tc>`;
  };
  const border = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`).join('') + '</w:tblBorders>';
  return `<w:tbl><w:tblPr><w:tblW w:w="${widthTw}" w:type="dxa"/>${border}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr>`
    + `<w:tblGrid>${t.head.map((_, j) => `<w:gridCol w:w="${w[j] ?? Math.floor(widthTw / n)}"/>`).join('')}</w:tblGrid>`
    + `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${t.head.map((h, j) => cell(h, j, true)).join('')}</w:tr>`
    + t.rows.map((r, i) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${t.head.map((_, j) => cell(r[j] ?? '', j, false, i)).join('')}</w:tr>`).join('')
    + `</w:tbl>${para('')}`;
}

function image(b: Extract<DocBlock, { kind: 'image' }>, id: number, rel: string, maxWTw: number, maxHTw: number): string {
  let cx = b.width * PX_EMU, cy = b.height * PX_EMU;
  const maxW = maxWTw * TWIP_EMU, maxH = maxHTw * TWIP_EMU;
  const k = Math.min(1, maxW / cx, maxH / cy);
  cx = Math.round(cx * k); cy = Math.round(cy * k);
  const pic = `<pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="image${id}.png" descr="${x(b.alt)}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rel}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>`;
  const drawing = `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Figure ${id}" descr="${x(b.alt)}"/>`
    + `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">${pic}</a:graphicData></a:graphic></wp:inline></w:drawing>`;
  return `<w:p><w:pPr><w:pStyle w:val="Figure"/><w:keepNext/>${b.align === 'center' ? '<w:jc w:val="center"/>' : ''}</w:pPr><w:r>${drawing}</w:r></w:p>`;
}

const TONE_STYLE: Record<Tone, string> = { note: 'Note', info: 'Note', warn: 'Warning', error: 'Alert' };

function field(instr: string): string {
  return `<w:fldSimple w:instr=" ${instr} "><w:r><w:t>1</w:t></w:r></w:fldSimple>`;
}

function footerXml(f: NonNullable<DocModel['footer']>, widthTw: number): string {
  const page = f.page ?? '{page} / {pages}';
  const parts = page.split(/(\{page\}|\{pages\})/).filter(Boolean)
    .map((p) => (p === '{page}' ? field('PAGE') : p === '{pages}' ? field('NUMPAGES') : run({ text: p })));
  return `${XML}<w:ftr ${NS}><w:p><w:pPr><w:pStyle w:val="Footer"/><w:tabs><w:tab w:val="right" w:pos="${widthTw}"/></w:tabs></w:pPr>`
    + `${f.left ? run({ text: f.left }) : ''}<w:r><w:tab/></w:r>${parts.join('')}</w:p></w:ftr>`;
}

const emptyPart = (tag: 'hdr' | 'ftr') => `${XML}<w:${tag} ${NS}><w:p/></w:${tag}>`;

export function docxBytes(d: DocModel, at = new Date().toISOString()): Uint8Array {
  // A4: 11906 × 16838 twips; margins of 2 cm (1134 twips).
  const [W, H] = d.landscape ? [16838, 11906] : [11906, 16838], M = 1134;
  const contentW = W - 2 * M, figureH = H - 2 * M - 2600;
  const media: Array<{ name: string; rel: string; png: Uint8Array }> = [];
  const rels: string[] = ['<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'];
  const blockXml = (b: DocBlock): string => {
    switch (b.kind) {
      case 'heading': return para(b.runs?.length ? b.runs : b.text, `Heading${b.level ?? 1}`);
      case 'paragraph':
        if (b.caption) return para(b.runs?.length ? b.runs : b.text, 'Caption', { align: b.align });
        return para(b.runs?.length ? b.runs : b.text, b.tone ? TONE_STYLE[b.tone] : undefined, { muted: !!b.muted, align: b.align });
      case 'table': return table(b, contentW);
      case 'pageBreak': return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      case 'image': {
        const n = media.length + 1, rel = `rIdImg${n}`;
        media.push({ name: `image${n}.png`, rel, png: b.png });
        rels.push(`<Relationship Id="${rel}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${n}.png"/>`);
        return image(b, n, rel, contentW, figureH);
      }
    }
  };
  const body = [...(d.showTitle === false ? [] : [para(d.title, 'Title')]), ...d.blocks.map(blockXml)].join('');

  const parts: Record<string, string> = {};
  let sectRefs = '';
  if (d.header || d.footer) {
    parts['word/header1.xml'] = `${XML}<w:hdr ${NS}><w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr>${d.header ? run({ text: d.header }) : ''}</w:p></w:hdr>`;
    parts['word/footer1.xml'] = d.footer ? footerXml(d.footer, contentW) : emptyPart('ftr');
    rels.push('<Relationship Id="rIdHdr1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>');
    rels.push('<Relationship Id="rIdFtr1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>');
    sectRefs = '<w:headerReference w:type="default" r:id="rIdHdr1"/><w:footerReference w:type="default" r:id="rIdFtr1"/>';
    if (d.cover) {
      parts['word/header2.xml'] = emptyPart('hdr');
      parts['word/footer2.xml'] = emptyPart('ftr');
      rels.push('<Relationship Id="rIdHdr2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header2.xml"/>');
      rels.push('<Relationship Id="rIdFtr2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer2.xml"/>');
      sectRefs += '<w:headerReference w:type="first" r:id="rIdHdr2"/><w:footerReference w:type="first" r:id="rIdFtr2"/>';
    }
  }
  const document = `${XML}<w:document ${NS} ${DRAWING_NS}><w:body>${body}`
    + `<w:sectPr>${sectRefs}<w:pgSz w:w="${W}" w:h="${H}"${d.landscape ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${M}" w:right="${M}" w:bottom="${M}" w:left="${M}" w:header="567" w:footer="567" w:gutter="0"/>${d.cover && sectRefs ? '<w:titlePg/>' : ''}</w:sectPr></w:body></w:document>`;

  const style = (id: string, name: string, size: number, bold: boolean, extra = '', run = '') =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr>${extra}</w:pPr><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/>${run}</w:rPr></w:style>`;
  const box = (color: string) => `<w:pBdr>${['top', 'left', 'bottom', 'right'].map((s) => `<w:${s} w:val="single" w:sz="8" w:space="4" w:color="${color}"/>`).join('')}</w:pBdr><w:spacing w:before="80" w:after="120"/>`;
  const styles = `${XML}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`
    + `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="18"/><w:lang w:val="es-AR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
    + `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>`
    + style('Title', 'Title', 32, true, '<w:keepNext/>')
    + style('Heading1', 'heading 1', 26, true, '<w:keepNext/><w:spacing w:before="240"/><w:outlineLvl w:val="0"/>')
    + style('Heading2', 'heading 2', 22, true, '<w:keepNext/><w:spacing w:before="200"/><w:outlineLvl w:val="1"/>')
    + style('Heading3', 'heading 3', 20, true, '<w:keepNext/><w:outlineLvl w:val="2"/>')
    + style('Caption', 'caption', 16, false, '<w:spacing w:after="160"/>', '<w:i/><w:color w:val="444444"/>')
    + style('Figure', 'Figure', 18, false, '<w:spacing w:before="120" w:after="40"/>')
    + style('TableHeader', 'Table Column Header', 16, true, '<w:spacing w:after="0"/>')
    + style('TableText', 'Table Text', 16, false, '<w:spacing w:after="0"/>')
    + style('Note', 'Note', 16, false, '', `<w:i/><w:color w:val="${TONE_COLOR.note}"/>`)
    + style('Warning', 'Warning', 18, true, box('B8860B'), `<w:color w:val="${TONE_COLOR.warn}"/>`)
    + style('Alert', 'Alert', 18, true, box('C0392B'), `<w:color w:val="${TONE_COLOR.error}"/>`)
    + style('Header', 'header', 16, false, '', '<w:color w:val="666666"/>')
    + style('Footer', 'footer', 16, false, '', '<w:color w:val="666666"/>')
    + `<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>`
    + `</w:styles>`;
  const overrides = Object.keys(parts).map((p) => `<Override PartName="/${p}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${p.includes('header') ? 'header' : 'footer'}+xml"/>`).join('');
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${media.length ? '<Default Extension="png" ContentType="image/png"/>' : ''}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>${overrides}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`),
    '_rels/.rels': strToU8(`${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
    'word/_rels/document.xml.rels': strToU8(`${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`),
    'word/document.xml': strToU8(document),
    'word/styles.xml': strToU8(styles),
    'docProps/core.xml': strToU8(`${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(d.title)}</dc:title><dc:creator>${x(d.author ?? 'Stabileo')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${x(at.slice(0, 19))}Z</dcterms:created></cp:coreProperties>`),
  };
  for (const [p, xml] of Object.entries(parts)) files[p] = strToU8(xml);
  for (const m of media) files[`word/media/${m.name}`] = m.png;
  return zipSync(files);
}
