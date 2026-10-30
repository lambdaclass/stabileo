/**
 * Provenance on every exported file (docs/verification/PROVENANCE.md).
 *
 * Every export of results takes its record through `prepareExportProvenance`: captured in the
 * same tick as the caller built the file's content, engine hashes awaited off the main thread,
 * then checked against the state it was captured on (`provenanceForExport`). If the project moved
 * meanwhile, the reader is told and nothing is written (null). The record then goes into the
 * file in the form its format allows, always with the status line (STALE or current) first:
 *
 *   CSV     `# key: value` comment lines before the header
 *   HTML    the provenance block, with the JSON record, before `</body>`
 *   DXF     999 comment groups at the top
 *   SVG     an XML comment after the opening tag, and the JSON in `<metadata>`
 *   PNG     a `tEXt` chunk (`stabileo-provenance`) with the JSON record
 *   XLSX    a status line on the summary and a Provenance sheet (`export/excel.ts`)
 *   reports (DOCX, XLSX, CSV of a report) as `report-formats.ts` carries `reportProvenanceLines`
 */
import { exportMessages, requiredExportMessages, warningHtml } from './containment';
import { uiStore } from '../store/ui.svelte';
import { downloadText } from '../store/file';
import {
  captureProvenanceToken, provenanceForExport, provenanceLabels, ExportChangedError,
  analysisProvenanceForExport,
} from '../store/result-provenance';
import { provenanceBlockHtml, provenanceTextLines, type ResultProvenance } from '../provenance/result-provenance';

/**
 * The record for an export whose content the caller has just built (same tick). Null, said to the
 * reader, when the project moved while the engine hashes were awaited.
 */
export async function prepareExportProvenance(): Promise<ResultProvenance | null> {
  if (exportMessages() === null) return null;
  const token = captureProvenanceToken();
  try {
    return await provenanceForExport(token);
  } catch (e) {
    if (e instanceof ExportChangedError) { uiStore.toast(e.message, 'error'); return null; }
    throw e;
  }
}

/** The record as `key: value` lines, the status line first. */
export function provenanceLines(p: ResultProvenance): Array<[string, string]> {
  return provenanceTextLines(p, provenanceLabels());
}

export function csvWithProvenance(csv: string, p: ResultProvenance): string {
  const warnings = requiredExportMessages();
  csv = warnings.map(w => `# ${w.replace(/[\r\n]+/g, ' ')}`).join('\n') + (warnings.length ? '\n' : '') + csv;
  const head = provenanceLines(p).map(([k, v]) => `# ${k}: ${v.replace(/[\r\n]+/g, ' ')}`).join('\n');
  return `${head}\n${csv}`;
}

/** The record's title and its `key: value` lines, the status line first, for a format that prints them. */
export function reportProvenanceLines(p: ResultProvenance): { title: string; lines: Array<[string, string]> } {
  return { title: provenanceLabels().title, lines: [...requiredExportMessages().map(w => ['⚠', w] as [string, string]), ...provenanceLines(p)] };
}

export function htmlWithProvenance(html: string, p: ResultProvenance): string {
  html = warningHtml(html);
  const block = provenanceBlockHtml(p, provenanceLabels());
  const i = html.lastIndexOf('</body>');
  return i >= 0 ? html.slice(0, i) + block + html.slice(i) : html + block;
}

export function dxfWithProvenance(dxf: string, p: ResultProvenance): string {
  const warnings = requiredExportMessages();
  // TEXT entities are visible in CAD; comments alone are not a warning.
  const ys = [...dxf.matchAll(/(?:^|\n)20\r?\n([^\r\n]+)/g)].map(m => Number(m[1])).filter(Number.isFinite);
  const minY = ys.reduce((a, y) => Math.min(a, y), 0), span = ys.reduce((a, y) => Math.max(a, y), 0) - minY;
  const textHeight = span > 0 ? span / 80 : 3;
  const lines = warnings.flatMap(w => w.split(/[\r\n]+/).flatMap(line => line.match(/.{1,90}/gu) ?? []));
  const entities = lines.map((line, i) => `0\nTEXT\n8\nSTABILEO_WARNINGS\n10\n0\n20\n${minY - (i + 2) * textHeight * 1.5}\n30\n0\n40\n${textHeight}\n1\n${line}\n`).join('');
  if (entities) {
    const section = /0\r?\nSECTION\r?\n2\r?\nENTITIES\r?\n/.exec(dxf);
    if (section) { const at = section.index + section[0].length; dxf = dxf.slice(0, at) + entities + dxf.slice(at); }
    else dxf = dxf.replace(/0\r?\nEOF/, `0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF`);
  }
  // Group code 999 is a comment: every reader skips it, and it survives a text round trip.
  const comments = provenanceLines(p).map(([k, v]) => `999\n${`stabileo provenance ${k}: ${v}`.replace(/[\r\n]+/g, ' ')}`).join('\n');
  return `${comments}\n${dxf}`;
}

const xmlComment = (s: string) => s.replace(/--/g, '- -');
const xmlText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function svgWithProvenance(svg: string, p: ResultProvenance): string {
  const warnings = requiredExportMessages();
  const m = /<svg\b[^>]*>/.exec(svg);
  if (!m) return svg;
  const comment = `<!--\n${xmlComment(provenanceLines(p).map(([k, v]) => `${k}: ${v}`).join('\n'))}\n-->`;
  const meta = `<metadata id="stabileo-provenance">${xmlText(JSON.stringify(p))}</metadata>`;
  const at = m.index + m[0].length;
  const annotated = svg.slice(0, at) + comment + meta + svg.slice(at);
  if (!warnings.length) return annotated;
  const vb = /viewBox=["']([^"']+)["']/.exec(m[0])?.[1]?.split(/[ ,]+/).map(Number);
  const width = vb?.[2] || parseFloat(/width=["']([\d.]+)/.exec(m[0])?.[1] ?? '800');
  const height = vb?.[3] || parseFloat(/height=["']([\d.]+)/.exec(m[0])?.[1] ?? '600');
  const font = Math.max(12, width / 80), chars = Math.max(1, Math.floor(width / (font * 0.65)) - 4);
  const lines = warnings.flatMap(w => w.match(new RegExp(`.{1,${chars}}`, 'gu')) ?? [w]);
  const band = (lines.length + 2) * font * 1.5;
  // Keep the original styling, namespaces and viewBox while moving the whole drawing.
  const originalTag = m[0].replace(/\s(?:x|y|width|height)=["'][^"']*["']/g, '');
  const nested = annotated.replace(m[0], originalTag.slice(0, -1) + ` x="0" y="${band}" width="${width}" height="${height}">`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + band}" viewBox="0 0 ${width} ${height + band}"><rect width="${width}" height="${band}" fill="white"/>${lines.map((line, i) => `<text x="12" y="${(i + 1.5) * font * 1.5}" font-size="${font}" fill="#742d00">${xmlText(line)}</text>`).join('')}${nested.replace(/<\?xml[^>]*>/g, '')}</svg>`;
}

// ─── PNG tEXt chunk ──────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** The PNG with a `tEXt` chunk `stabileo-provenance` = the JSON record, right after IHDR. */
export function pngWithProvenance(png: Uint8Array, p: ResultProvenance): Uint8Array {
  requiredExportMessages();
  // Signature (8) + IHDR chunk (4 length + 4 type + 13 data + 4 crc) = 33.
  if (png.length < 33 || png[12] !== 0x49 || png[13] !== 0x48 || png[14] !== 0x44 || png[15] !== 0x52) return png;
  // tEXt is Latin-1: the record is ASCII once non-ASCII is escaped.
  const text = JSON.stringify(p).replace(/[\u0080-￿]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
  const data = new TextEncoder().encode(`stabileo-provenance\0${text}`);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set([0x74, 0x45, 0x58, 0x74], 4); // "tEXt"
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, 33), 0);
  out.set(chunk, 33);
  out.set(png.subarray(33), 33 + chunk.length);
  return out;
}

/** The JPEG with a COM segment (FF FE) carrying the JSON record, right after SOI. */
export function jpegWithProvenance(jpg: Uint8Array, p: ResultProvenance): Uint8Array {
  requiredExportMessages();
  if (jpg.length < 2 || jpg[0] !== 0xff || jpg[1] !== 0xd8) return jpg;
  const text = new TextEncoder().encode(`stabileo-provenance ${JSON.stringify(p)}`).subarray(0, 65533);
  const seg = new Uint8Array(4 + text.length);
  seg[0] = 0xff; seg[1] = 0xfe;
  new DataView(seg.buffer).setUint16(2, text.length + 2);
  seg.set(text, 4);
  const out = new Uint8Array(jpg.length + seg.length);
  out.set(jpg.subarray(0, 2), 0);
  out.set(seg, 2);
  out.set(jpg.subarray(2), 2 + seg.length);
  return out;
}

/** An image's bytes with the record embedded, by its type (PNG, JPEG); other bytes as they are. */
export function imageWithProvenance(bytes: Uint8Array, p: ResultProvenance): Uint8Array {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return pngWithProvenance(bytes, p);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegWithProvenance(bytes, p);
  return bytes;
}

/** Read the record back from a PNG written by `pngWithProvenance` (null: none). */
export function provenanceFromPng(png: Uint8Array): string | null {
  let off = 8;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  while (off + 12 <= png.length) {
    const len = view.getUint32(off);
    const type = String.fromCharCode(...png.subarray(off + 4, off + 8));
    if (type === 'tEXt') {
      const body = new TextDecoder('latin1').decode(png.subarray(off + 8, off + 8 + len));
      if (body.startsWith('stabileo-provenance\0')) return body.slice('stabileo-provenance\0'.length);
    }
    off += 12 + len;
  }
  return null;
}

/**
 * `downloadText` for a file of results: the record attached in the file's own format (by its
 * extension: .csv, .html, .dxf, .svg), or nothing written when the project moved meanwhile.
 * Call it in the same tick as the content is built. An independent analysis must supply the
 * record captured with its own inputs and results, rather than borrowing the viewport's record.
 */
export async function downloadResultText(content: string, filename: string, mime: string, record?: ResultProvenance): Promise<boolean> {
  const warnings = exportMessages();
  if (warnings === null) return false;
  const p = record ? analysisProvenanceForExport(record) : await prepareExportProvenance();
  if (!p) return false;
  const ext = filename.toLowerCase().split('.').pop();
  const out = ext === 'csv' ? csvWithProvenance(content, p)
    : ext === 'html' || ext === 'htm' ? htmlWithProvenance(content, p)
    : ext === 'dxf' ? dxfWithProvenance(content, p)
    : ext === 'svg' ? svgWithProvenance(content, p)
    : content;
  downloadText(out, filename, mime);
  return true;
}
