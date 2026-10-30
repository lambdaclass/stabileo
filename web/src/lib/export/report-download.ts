/**
 * A report written to a file in one of the five formats every report offers (`report-formats.ts`):
 * the PDF is printed by the browser from the report's HTML (a blocked window falls back to the
 * HTML as a file, a real deliverable and not a silent failure); the other four are downloaded.
 */
import { loadXlsxModule } from './excel';
import { reportFile, type DocxOptions, type ReportFormat, type ReportProvenance } from './report-formats';
import { rasterizeForPrint } from './rasterize';
import { APP_VERSION } from '../build-info';
import { t, tp } from '../i18n';
import type { DocBlock } from './docx';

function save(name: string, type: string, data: BlobPart) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Print a report's HTML (the PDF), or download it when the window is blocked. */
export function printHtml(html: string, stem: string): void {
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
  else save(`${stem}.html`, 'text/html', html);
}

/** The Word file's header and footer: program and version, the report and its date, page n of m. */
export function docxLayout(title: string, date = new Date().toISOString().slice(0, 10)): DocxOptions {
  return {
    header: `Stabileo ${APP_VERSION} · ${title}`,
    footer: { left: `${title} · ${date}`, page: tp('docx.pageOf', { page: '{page}', pages: '{pages}' }) },
    rasterize: rasterizeForPrint,
    missingFigure: t('docx.figureMissing'),
  };
}

export async function downloadReport(format: ReportFormat, r: { title: string; html: string; stem: string; blocks?: DocBlock[]; provenance?: ReportProvenance; docx?: DocxOptions }): Promise<string | null> {
  if (format === 'pdf') { printHtml(r.html, r.stem); return `${r.stem}.pdf`; }
  const f = await reportFile(format, { ...r, docx: r.docx ?? docxLayout(r.title), loadXlsx: loadXlsxModule });
  if (!f) return null;
  save(f.filename, f.mime, f.bytes as BlobPart);
  return f.filename;
}
