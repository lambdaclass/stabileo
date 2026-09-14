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

import { i18n, tp } from '../i18n';
import { renderReportHtml, renderDrawings, renderSchedule } from '../engine/detailing/document-render';
import { exportToExcel } from '../export/excel';
import { retouchedIn, withExportLog } from './export-log';
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

export function exportDetailingReport(doc: DocumentModel, ctx: ExportContext): void {
  const filename = `detailing-rev${doc.revision.number}.html`;
  withExportLog({ kind: 'report', doc, filename, at: ctx.at }, () => {
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
    // Printed through the browser rather than a bundled PDF writer: better typography, no
    // dependency, and the user picks the paper size.
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
    else downloadBlob(filename, 'text/html', html);
  });
}

export function exportDetailingDxf(doc: DocumentModel, ctx: ExportContext): void {
  const filename = `detailing-rev${doc.revision.number}.dxf`;
  withExportLog({ kind: 'dxf', doc, filename, at: ctx.at }, () => {
    const set = renderDrawings(doc, {
      locale: i18n.locale, projectName: ctx.projectName, retouched: retouchedIn(doc),
    });
    downloadBlob(filename, 'application/dxf', set.dxf);
  });
}

export function exportDetailingXlsx(doc: DocumentModel, ctx: ExportContext): void {
  const sheets = renderSchedule(doc, {
    locale: i18n.locale, projectName: ctx.projectName, retouched: retouchedIn(doc),
  });
  const filename = `detailing-rev${doc.revision.number}.xlsx`;
  withExportLog({ kind: 'xlsx', doc, filename, at: ctx.at }, () =>
    exportToExcel({
      filename,
      onlyExtras: true,
      extraSheets: sheets.map((s) => ({ name: s.name, rows: s.aoa })),
    }));
}
