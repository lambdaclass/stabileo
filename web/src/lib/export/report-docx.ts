import { decodeEntities } from './report-formats';
import type { DocBlock, Run, Tone } from './docx';
import { mathmlRuns } from './mathml-runs';

export interface Raster { png: Uint8Array; width: number; height: number }
export type Rasterize = (src: string, size: { width?: number; height?: number }) => Promise<Raster | null>;

const runsText = (runs: Run[]) => runs.map((r) => r.text).join('');
const tidy = (runs: Run[]): Run[] => {
  const out: Run[] = [];
  for (const r of runs) {
    const t = r.text.replace(/\s+/g, ' ');
    const last = out[out.length - 1];
    if (last && !last.vert && !r.vert && last.bold === r.bold && last.italic === r.italic && last.color === r.color && last.mono === r.mono) last.text += t; else out.push({ ...r, text: t });
  }
  if (out[0]) out[0].text = out[0].text.trimStart();
  if (out.length) out[out.length - 1]!.text = out[out.length - 1]!.text.trimEnd();
  return out.filter((r) => r.text);
};

const CLASS_TONE: Array<[RegExp, Tone]> = [[/\bprovenance-stale\b|\bdiag-error\b|\bstatus-fail\b/, 'error'], [/\bdiag-warn\b|\bstatus-warn\b/, 'warn'], [/\bdiag-info\b/, 'info'], [/\bnote\b|\bassumption\b|\bprovenance-note\b/, 'note']];
const toneOf = (cls: string, style: string): Tone | undefined =>
  CLASS_TONE.find(([re]) => re.test(cls))?.[1] ?? (/border:\s*2px solid/i.test(style) ? 'warn' : undefined);

/** The report's print style recolours its dark interaction diagrams; a rasterised SVG does not get that style. */
export function printColours(svg: string): string {
  return svg
    .replace(/fill="#1a2a40"/gi, 'fill="#f0f0f0"')
    .replace(/stroke="#4ecdc4"/gi, 'stroke="#1a5090"')
    .replace(/fill="#e94560"/gi, 'fill="#333333"')
    .replace(/stroke="#f0a500"/gi, 'stroke="#666666"');
}

const attr = (tag: string, name: string) => decodeEntities((new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag)?.[2] ?? new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, 'i').exec(tag)?.[1] ?? ''));
const cssPx = (style: string, prop: string) => { const m = new RegExp(`${prop}\\s*:\\s*([\\d.]+)px`, 'i').exec(style); return m ? Number(m[1]) : undefined; };

interface Pending { at: number; src: string; alt: string; size: { width?: number; height?: number }; center: boolean }

/** The report's HTML as blocks for Word. `rasterize` turns each figure into a PNG; without it, a figure is written as its caption. */
export async function htmlToDocxBlocks(html: string, rasterize?: Rasterize, missingFigure = '[figure]'): Promise<{ blocks: DocBlock[]; cover: boolean }> {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<![^>]*>/g, '')
    .replace(/<(script|style|head|title|noscript)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<button\b[\s\S]*?<\/button>/gi, '');
  const out: DocBlock[] = [];
  const pending: Pending[] = [];
  const stack: Array<{ tag: string; cls: string; style: string }> = [];
  let runs: Run[] = [];
  let heading: 1 | 2 | 3 | null = null;
  let table: { rows: Run[][][]; heads: boolean[]; num: boolean[][] } | null = null, row: Run[][] | null = null, rowNum: boolean[] = [], cell: Run[] | null = null, rowHead = false;
  let cover = false;
  const inClass = (re: RegExp) => stack.some((s) => re.test(s.cls));
  const inTag = (t: string) => stack.some((s) => s.tag === t);
  const fmt = (): Omit<Run, 'text'> => ({
    ...(inTag('b') || inTag('strong') ? { bold: true } : {}),
    ...(inTag('i') || inTag('em') ? { italic: true } : {}),
    ...(inTag('sub') ? { vert: 'sub' as const } : inTag('sup') ? { vert: 'sup' as const } : {}),
  });
  const addRuns = (rs: Run[]) => { if (cell) cell.push(...rs); else runs.push(...rs); };
  const addText = (t: string) => { const v = decodeEntities(t).replace(/[\u200b\u2061]/g, ''); if (v) addRuns([{ text: v, ...fmt() }]); };
  const paragraph = () => {
    const r = tidy(runs); runs = [];
    if (!r.length) return;
    const tone = [...stack].reverse().map((s) => toneOf(s.cls, s.style)).find(Boolean);
    out.push({ kind: 'paragraph', text: runsText(r), runs: r, ...(tone ? { tone } : {}), ...(inClass(/\bcover-page\b/) ? { align: 'center' as const } : {}), ...(inTag('figcaption') ? { caption: true } : {}) });
  };
  const BLOCK = new Set(['p', 'li', 'div', 'caption', 'section', 'header', 'footer', 'figcaption', 'dt', 'dd', 'ul', 'ol', 'figure', 'main', 'article', 'body', 'pre']);
  const VOID = new Set(['br', 'img', 'hr', 'meta', 'link', 'input', 'col', 'wbr']);
  const re = /<(\/?)([a-z][a-z0-9]*)\b([^>]*)>|([^<]+)/gi;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    if (m[4] !== undefined) { addText(m[4]); continue; }
    const close = m[1] === '/', tag = m[2]!.toLowerCase(), rawTag = m[0];
    if (!close && tag === 'svg') {
      const end = body.indexOf('</svg>', m.index);
      const svg = body.slice(m.index, end < 0 ? body.length : end + 6);
      re.lastIndex = m.index + svg.length;
      paragraph();
      const src = svg.includes('xmlns=') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      pending.push({ at: out.length, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(printColours(src))}`, alt: attr(rawTag, 'aria-label') || missingFigure, size: { width: Number(attr(rawTag, 'width')) || undefined, height: Number(attr(rawTag, 'height')) || undefined }, center: inClass(/\bcover-page\b/) });
      continue;
    }
    if (!close && tag === 'span' && /\bkatex\b/.test(attr(rawTag, 'class')) && !/\bkatex-/.test(attr(rawTag, 'class'))) {
      let depth = 0, end = m.index;
      const spans = /<(\/?)span\b[^>]*>/gi;
      spans.lastIndex = m.index;
      for (let s = spans.exec(body); s; s = spans.exec(body)) { depth += s[1] ? -1 : 1; if (depth === 0) { end = s.index + s[0].length; break; } }
      const markup = body.slice(m.index, end);
      re.lastIndex = end;
      const math = /<math\b[\s\S]*<\/math>/.exec(markup)?.[0];
      const tex = /<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/.exec(markup)?.[1];
      const fromMath = math ? mathmlRuns(math) : null;
      if (fromMath) addRuns(fromMath.map((r) => ({ ...fmt(), ...r })));
      else if (tex) addRuns([{ text: decodeEntities(tex), mono: true }]);
      else addText(markup.replace(/<[^>]+>/g, ''));
      continue;
    }
    if (tag === 'img' && !close) {
      paragraph();
      const style = attr(rawTag, 'style');
      pending.push({ at: out.length, src: attr(rawTag, 'src'), alt: attr(rawTag, 'alt') || missingFigure, size: { width: Number(attr(rawTag, 'width')) || cssPx(style, 'max-width'), height: Number(attr(rawTag, 'height')) || cssPx(style, 'max-height') }, center: inClass(/\bcover-page\b/) });
      continue;
    }
    if (tag === 'br') { addText(' '); continue; }
    if (!close && !VOID.has(tag)) stack.push({ tag, cls: attr(rawTag, 'class'), style: attr(rawTag, 'style') });

    if (!close && /\bpage-break\b/.test(attr(rawTag, 'class'))) { paragraph(); out.push({ kind: 'pageBreak' }); }
    if (!close && /\bcover-page\b/.test(attr(rawTag, 'class'))) cover = true;

    if (/^h[1-6]$/.test(tag)) {
      if (!close) { paragraph(); heading = Math.min(3, Number(tag[1])) as 1 | 2 | 3; }
      else {
        const r = tidy(runs); runs = [];
        if (r.length) out.push(inClass(/\bcover-page\b/) ? { kind: 'paragraph', text: runsText(r), runs: r.map((x) => ({ ...x, bold: true })), align: 'center' } : { kind: 'heading', text: runsText(r), runs: r, level: heading ?? 2 });
        heading = null;
      }
    } else if (tag === 'table') {
      if (!close) { paragraph(); table = { rows: [], heads: [], num: [] }; }
      else if (table) {
        const keep = table.rows.map((r, i) => ({ r, h: table!.heads[i], n: table!.num[i]! })).filter((x) => x.r.some((c) => runsText(c).trim()));
        if (keep.length) {
          const width = Math.max(...keep.map((x) => x.r.length));
          const text = (r: Run[][]) => [...r.map((c) => runsText(tidy(c))), ...Array(width - r.length).fill('')];
          const headFirst = !!keep[0]!.h;
          const body = headFirst ? keep.slice(1) : keep;
          const align = Array.from({ length: width }, (_, j) => (body.length && body.every((x) => x.n[j] || !runsText(x.r[j] ?? []).trim()) && body.some((x) => x.n[j]) ? 'right' as const : 'left' as const));
          const cells = (r: Run[][]) => [...r.map(tidy), ...Array.from({ length: width - r.length }, () => [] as Run[])];
          out.push({ kind: 'table', head: headFirst ? text(keep[0]!.r) : Array(width).fill(''), rows: body.map((x) => text(x.r)), rowRuns: body.map((x) => cells(x.r)), align, ...(headFirst ? { headRuns: cells(keep[0]!.r) } : {}) });
        }
        table = null;
      }
    } else if (table && tag === 'tr') {
      if (!close) { row = []; rowNum = []; rowHead = false; } else if (row) { table.rows.push(row); table.heads.push(rowHead); table.num.push(rowNum); row = null; }
    } else if (table && (tag === 'td' || tag === 'th')) {
      if (!close) { cell = []; if (tag === 'th') rowHead = true; rowNum.push(/\bnum\b/.test(attr(rawTag, 'class'))); }
      else if (row && cell !== null) { row.push(cell); cell = null; }
    } else if (BLOCK.has(tag) && cell === null && heading === null) paragraph();

    if (close) {
      const i = stack.map((s) => s.tag).lastIndexOf(tag);
      if (i >= 0) stack.splice(i);
    }
  }
  paragraph();

  // One at a time: each print raster is a canvas of up to 4000 px a side.
  const rasters: Array<Raster | null> = [];
  for (const p of pending) rasters.push(rasterize ? await rasterize(p.src, p.size).catch(() => null) : null);
  for (let k = pending.length - 1; k >= 0; k--) {
    const p = pending[k]!, r = rasters[k];
    const block: DocBlock = r
      ? { kind: 'image', png: r.png, width: r.width, height: r.height, alt: p.alt, ...(p.center ? { align: 'center' as const } : {}) }
      : { kind: 'paragraph', text: `${missingFigure} ${p.alt}`.trim(), tone: 'note' };
    out.splice(p.at, 0, block);
  }
  return { blocks: out, cover };
}
