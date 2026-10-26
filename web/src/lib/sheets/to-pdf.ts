/**
 * A sheet as a vector PDF, written directly: paths for the geometry and text in the standard
 * Helvetica with WinAnsi encoding, so the text is real text a reader can search and copy, and
 * Spanish and Portuguese letters print. One page per sheet, sized to its format; units are points
 * (1 mm = 72/25,4 pt). No dependency: the file is a handful of objects and one content stream each.
 */
import { dimensionGeometry, type Primitive } from './primitives';
import { aciRgb, layerDef, type LayerStyle } from './layers';

const PT = 72 / 25.4;
const f = (n: number) => (Math.round(n * 1000) / 1000).toString();

/** Signs the sheets write that WinAnsi lacks, spelled with the ones it has. */
const SPELLED: Record<string, string> = { '≥': '>=', '≤': '<=', 'ℓ': 'l', '→': '->', '≈': '~', '√': 'sqrt', 'φ': 'phi', '∅': 'Ø' };

/** WinAnsi bytes for a string; characters outside it become their spelling above, or «?». */
function winAnsi(s: string): number[] {
  const out: number[] = [];
  for (const ch of [...s].map((x) => SPELLED[x] ?? x).join('')) {
    const c = ch.codePointAt(0)!;
    if (c < 128 || (c >= 160 && c <= 255)) out.push(c);
    else if (c === 0x2019) out.push(0x92); else if (c === 0x2013) out.push(0x96); else if (c === 0x2014) out.push(0x97);
    else if (c === 0x20ac) out.push(0x80); else if (c === 0x2026) out.push(0x85); else if (c === 0x00d7) out.push(0xd7); else if (c === 0x2022) out.push(0x95); else out.push(0x3f);
  }
  return out;
}
const pdfString = (s: string) => '(' + String.fromCharCode(...winAnsi(s)).replace(/([\\()])/g, '\\$1') + ')';

function pageContent(ps: readonly Primitive[], layerOf: LayerStyle): string {
  const out: string[] = ['1 J 1 j'];
  const stroke = (layer: string) => {
    const d = layerOf(layer), [r, g, b] = aciRgb(d.color);
    out.push(`${f(r / 255)} ${f(g / 255)} ${f(b / 255)} RG ${f(r / 255)} ${f(g / 255)} ${f(b / 255)} rg ${f(d.weight * PT)} w ${d.dashed ? '[3 2] 0 d' : '[] 0 d'}`);
  };
  const M = (x: number, y: number) => `${f(x * PT)} ${f(y * PT)}`;
  const text = (layer: string, x: number, y: number, s: string, h: number, rot = 0, align: 'left' | 'center' | 'right' = 'left') => {
    stroke(layer);
    const w = s.length * h * 0.5, dx = align === 'center' ? -w / 2 : align === 'right' ? -w : 0;
    const a = (rot * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
    const tx = x + dx * c, ty = y + dx * sn;
    out.push(`BT /F1 ${f(h * PT)} Tf ${f(c)} ${f(sn)} ${f(-sn)} ${f(c)} ${f(tx * PT)} ${f(ty * PT)} Tm ${pdfString(s)} Tj ET`);
  };
  for (const p of ps) {
    switch (p.kind) {
      case 'line': stroke(p.layer); out.push(`${M(p.a.x, p.a.y)} m ${M(p.b.x, p.b.y)} l S`); break;
      case 'polyline': {
        if (p.points.length < 2) break;
        stroke(p.layer);
        out.push(p.points.map((q, i) => `${M(q.x, q.y)} ${i ? 'l' : 'm'}`).join(' ') + (p.closed ? ' h' : '') + (p.fill ? ' f' : ' S'));
        break;
      }
      case 'circle': {
        stroke(p.layer);
        const k = 0.5523 * p.r, { x, y } = p.c;
        out.push(`${M(x + p.r, y)} m ${M(x + p.r, y + k)} ${M(x + k, y + p.r)} ${M(x, y + p.r)} c ${M(x - k, y + p.r)} ${M(x - p.r, y + k)} ${M(x - p.r, y)} c ${M(x - p.r, y - k)} ${M(x - k, y - p.r)} ${M(x, y - p.r)} c ${M(x + k, y - p.r)} ${M(x + p.r, y - k)} ${M(x + p.r, y)} c ${p.fill ? 'f' : 'S'}`);
        break;
      }
      case 'arc': {
        stroke(p.layer);
        const n = 16, a0 = (p.start * Math.PI) / 180, a1 = (p.end * Math.PI) / 180, span = a1 > a0 ? a1 - a0 : a1 - a0 + 2 * Math.PI;
        out.push(Array.from({ length: n + 1 }, (_, k) => { const t = a0 + (span * k) / n; return `${M(p.c.x + p.r * Math.cos(t), p.c.y + p.r * Math.sin(t))} ${k ? 'l' : 'm'}`; }).join(' ') + ' S');
        break;
      }
      case 'text': text(p.layer, p.at.x, p.at.y, p.text, p.height, p.rotation ?? 0, p.align ?? 'left'); break;
      case 'dimension': {
        const g = dimensionGeometry(p);
        stroke(p.layer);
        for (const [a, b] of [...g.ext, g.line]) out.push(`${M(a.x, a.y)} m ${M(b.x, b.y)} l S`);
        for (const e of g.line) out.push(`${M(e.x - 0.8, e.y - 0.8)} m ${M(e.x + 0.8, e.y + 0.8)} l S`);
        text(p.layer, g.textAt.x, g.textAt.y, p.text ?? `${Math.round(g.length)}`, p.height ?? 2.5, g.angle, 'center');
        break;
      }
    }
  }
  return out.join('\n');
}

/** A PDF of one or more pages, each `[widthMm, heightMm, primitives]`; with a title for the reader. */
export function sheetsToPdf(pages: ReadonlyArray<{ width: number; height: number; primitives: readonly Primitive[] }>, title = '', layerOf: LayerStyle = layerDef): Uint8Array {
  const objs: string[] = [];
  const add = (s: string) => { objs.push(s); return objs.length; };
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  // The Pages object comes after the font and two objects (content, page) per page.
  const pagesId = objs.length + pages.length * 2 + 1;
  const kids: number[] = [];
  for (const p of pages) {
    const content = pageContent(p.primitives, layerOf);
    const c = add(`<< /Length ${latin1Length(content)} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${f(p.width * PT)} ${f(p.height * PT)}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${c} 0 R >>`));
  }
  const pagesObj = add(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`);
  if (pagesObj !== pagesId) throw new Error('pdf object numbering');
  const info = add(`<< /Title ${pdfString(title)} /Producer (Stabileo) >>`);
  const catalog = add(`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`);
  let body = '%PDF-1.4\n%âãÏÓ\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(latin1Length(body)); body += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = latin1Length(body);
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const out = new Uint8Array(body.length);
  for (let i = 0; i < body.length; i++) out[i] = body.charCodeAt(i) & 0xff;
  return out;
}

/** Strings here are byte strings (WinAnsi already applied), one char per byte. */
const latin1Length = (s: string) => s.length;
