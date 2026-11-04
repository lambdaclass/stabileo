/**
 * The three files a document can leave as, and the one thing they all do first.
 *
 * ── Why these left the panel ────────────────────────────────────────
 *
 * `DocumentsSection.svelte` reached its 600-line ceiling the moment §4's scope selector and the
 * previews landed in it, and the boundary is the same one `rebar-open.ts` drew: an OPERATION —
 * build, write a blob, record what happened — is not markup. What stays in the component is the
 * hierarchy, the refusals and the controls.
 *
 * Nothing here decides anything structural. Every one of them is handed a document that was
 * already built, so a report, a drawing set and a schedule of the same project cannot come from
 * two instances — the rule `DocumentModel` exists for, and the reason `currentDoc()` stays the
 * single builder in the component.
 *
 * `withExportLog` records the failure path too and re-throws, which is why none of these swallows
 * an error: the panel is what words it.
 */

import { downloadReport } from '../export/report-download';
import { i18n, tp } from '../i18n';
import { renderReportHtml, renderDrawings, renderSchedule } from '../engine/detailing/document-render';
import { exportToExcel } from '../export/excel';
import { captureProvenanceToken, provenanceForExport, ExportChangedError } from './result-provenance';
import { htmlWithProvenance, dxfWithProvenance, reportProvenanceLines } from '../export/provenance-attach';
import { uiStore } from './ui.svelte';
import { retouchedIn, withExportLog } from './export-log';
import { coverForMember, sheetMembers } from './detailing-sheet-inputs';
import type { DocumentModel } from '../engine/detailing/document-model';

/** Hand a blob to the browser under a name. The browser then loses sight of it — see
 * `EXPORT_CANNOT_ASSERT`. */
export function downloadBlob(name: string, type: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** What every export is headed with, and what every filename carries. */
interface ExportContext {
  /** The project's rótulo, resolved by the caller — never a translated stand-in noun. */
  projectName: string;
  /** ISO, from the gesture. This module never reads a clock. */
  at: string;
}

/**
 * A detailing export runs inside its log entry (`withExportLog`), so a failure is logged as one.
 * The project moving while the provenance was prepared is such a failure: nothing was written,
 * the log says so, and the reader is told.
 */
function said(p: Promise<unknown>): Promise<void> {
  return p.then(() => undefined, (e) => {
    if (e instanceof ExportChangedError) { uiStore.toast(e.message, 'error'); return; }
    if (e instanceof Error && e.name === 'NotWritten') return;
    throw e;
  });
}

export function exportDetailingReport(doc: DocumentModel, ctx: ExportContext, format: import('../export/report-formats').ReportFormat = 'pdf'): Promise<void> {
  const ext = format === 'pdf' ? 'html' : format === 'csv' ? 'csv' : format;
  const filename = `detailing-rev${doc.revision.number}.${ext}`;
  // Taken now, with the document; checked again once the engine hashes are in.
  const token = captureProvenanceToken();
  return said(withExportLog({ kind: 'report', doc, filename, at: ctx.at }, async () => {
    const html = renderReportHtml(
      doc,
      { locale: i18n.locale, projectName: ctx.projectName, retouched: retouchedIn(doc) },
      // `document-render` types its params as `unknown` because it is pure and cannot know what
      // an engine message carries; `tp` interpolates through `String`. Converted rather than
      // cast: the conversion is what `tp` does anyway, and a cast here would be the one place
      // this boundary could start lying about a param it never inspects.
      (k, params) => tp(k, params && Object.fromEntries(
        Object.entries(params).map(([n, v]) => [n, typeof v === 'number' ? v : String(v)]),
      )),
    );
    // The PDF is printed through the browser rather than a bundled PDF writer: better
    // typography, no dependency, and the user picks the paper size. Its tab is opened inside the
    // click, before the await: one opened after it is one the pop-up blocker refuses. The other
    // four formats are the same report as a file (`report-formats.ts`), with the same provenance.
    const w = format === 'pdf' ? window.open('', '_blank') : null;
    let record;
    try {
      record = await provenanceForExport(token);
    } catch (e) {
      w?.close();
      throw e;
    }
    const withProv = htmlWithProvenance(html, record);
    if (format === 'pdf') {
      if (w) { w.document.write(withProv); w.document.close(); w.focus(); w.print(); }
      else downloadBlob(filename, 'text/html', withProv);
    } else {
      await downloadReport(format, { title: `${ctx.projectName} · rev. ${doc.revision.number}`, html: withProv, stem: `detailing-rev${doc.revision.number}`, provenance: reportProvenanceLines(record) });
    }
  }));
}

export function exportDetailingDxf(doc: DocumentModel, ctx: ExportContext): Promise<void> {
  const filename = `detailing-rev${doc.revision.number}.dxf`;
  const token = captureProvenanceToken();
  return said(withExportLog({ kind: 'dxf', doc, filename, at: ctx.at }, async () => {
    const set = renderDrawings(doc, {
      locale: i18n.locale, projectName: ctx.projectName, retouched: retouchedIn(doc),
      members: sheetMembers(), coverOf: coverForMember,
    });
    downloadBlob(filename, 'application/dxf', dxfWithProvenance(set.dxf, await provenanceForExport(token)));
  }));
}

export function exportDetailingXlsx(doc: DocumentModel, ctx: ExportContext): Promise<void> {
  const sheets = renderSchedule(doc, {
    locale: i18n.locale, projectName: ctx.projectName, retouched: retouchedIn(doc),
  });
  const filename = `detailing-rev${doc.revision.number}.xlsx`;
  return said(withExportLog({ kind: 'xlsx', doc, filename, at: ctx.at }, async () => {
    const written = await exportToExcel({
      filename,
      onlyExtras: true,
      extraSheets: sheets.map((s) => ({ name: s.name, rows: s.aoa })),
    });
    // Not written (the reader was told why): the log must not record an export that did not happen.
    if (!written) throw new NotWritten();
  }));
}

class NotWritten extends Error { constructor() { super('not written'); this.name = 'NotWritten'; } }
