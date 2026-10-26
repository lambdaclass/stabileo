/**
 * A listing written to a file in the format asked for: the native PDF, HTML, a workbook (XLSX) or
 * CSV, all from the same rows (`lib/listings/listing.ts`). Several listings go in one workbook,
 * one sheet each.
 */
import { listing, type ListingId } from './listings';
import { sheetLanguage } from './sheet-set';
import { modelStore } from './model.svelte';
import { loadXlsxModule } from '../export/excel';
import { listingsWorkbook } from '../listings/listing-xlsx';
import { toCsv, toDocModel, toHtml, toPdfPages } from '../listings/listing';
import { docxBytes } from '../export/docx';
import { sheetsToPdf } from '../sheets/to-pdf';
import { bvbsFile, legsOf, mandrelOf, type BvbsBar } from '../listings/bvbs';
import { designData } from './design-data';
import type { DocumentModel } from '../engine/detailing/document-model';
import { withExportLog } from './export-log';
import { csvWithProvenance, htmlWithProvenance, prepareExportProvenance, reportProvenanceLines } from '../export/provenance-attach';
import { provenancePdfPage } from '../sheets/sheet-set';
import { uiStore } from './ui.svelte';
import { t } from '../i18n';
import type { ResultProvenance } from '../provenance/result-provenance';

export type ListingFormat = 'pdf' | 'html' | 'docx' | 'xlsx' | 'csv';

function save(name: string, type: string, data: BlobPart) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const projectName = () => modelStore.model.projectInfo?.job ?? '';

/** The bytes of a listing in a format: what is downloaded, and what the tests compare. */
export async function listingBytes(id: ListingId, format: ListingFormat, locale = sheetLanguage(), record?: ResultProvenance): Promise<Uint8Array | string | null> {
  const l = listing(id, locale);
  // The results' provenance and stale status, in the form each format allows (`export/provenance-attach.ts`).
  const p = record ? reportProvenanceLines(record) : undefined;
  switch (format) {
    case 'html': { const h = toHtml(l, locale, projectName()); return record ? htmlWithProvenance(h, record) : h; }
    case 'csv': { const c = toCsv(l, locale); return record ? csvWithProvenance(c, record) : c; }
    case 'docx': {
      const m = toDocModel(l, locale, projectName());
      return docxBytes(p ? { ...m, blocks: [...m.blocks, { kind: 'heading', text: p.title, level: 2 }, { kind: 'table', head: [p.lines[0]?.[0] ?? '', p.lines[0]?.[1] ?? ''], rows: p.lines.slice(1).map(([k, v]) => [k, v]) }] } as never : m);
    }
    case 'pdf': return sheetsToPdf([...toPdfPages(l, locale, projectName()), ...(p ? [provenancePdfPage(p)] : [])], l.title);
    case 'xlsx': { const X = await loadXlsxModule(); return X ? listingsWorkbook(X, [l], locale, p) : null; }
  }
}

const MIME: Record<ListingFormat, string> = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pdf: 'application/pdf', html: 'text/html', csv: 'text/csv', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

export async function exportListing(id: ListingId, format: ListingFormat): Promise<void> {
  const record = await prepareExportProvenance();
  if (!record) return;
  const data = await listingBytes(id, format, sheetLanguage(), record);
  if (data !== null) save(`${id}.${format}`, MIME[format], data as BlobPart);
}

/** Several listings in one workbook. */
export async function exportListingsWorkbook(ids: readonly ListingId[]): Promise<void> {
  const record = await prepareExportProvenance();
  if (!record) return;
  const X = await loadXlsxModule();
  if (!X) return;
  const locale = sheetLanguage();
  save('listings.xlsx', MIME.xlsx, listingsWorkbook(X, ids.map((id) => listing(id, locale)), locale, reportProvenanceLines(record)) as BlobPart);
}

// ─── The bar schedule for bending machines (BVBS) ───


/** Every mark of the issued document as a BVBS record, the bars' paths giving their legs and turns. */
export function bvbsOfDocument(doc: DocumentModel, plan = ''): string {
  const bars: BvbsBar[] = [];
  for (const a of doc.assemblies) for (const mk of a.source.marks) {
    const path = mk.barIds.map((id) => a.bars.find((b) => b.id === id)).find((b) => !!b);
    if (!path) continue;
    const legs = legsOf(path);
    bars.push({
      mark: mk.mark, count: mk.quantity, diameterMm: mk.diameterMm, lengthMm: mk.cuttingLength * 1000, weightKg: mk.massKg / Math.max(1, mk.quantity),
      legs: legs.length ? legs : [{ l: mk.cuttingLength * 1000, w: 0 }], mandrelMm: mandrelOf(mk.diameterMm, path.role === 'transverse'),
    });
  }
  const info = modelStore.model.projectInfo;
  return bvbsFile(bars, { project: info?.jobNumber || info?.job || 'stabileo', plan, index: String(doc.revision.number), grade: designData().rebarGrade });
}

/**
 * The BVBS file of a document. A bending machine reads no provenance, so a document never to be built
 * from (the model changed after it, or a later revision exists) is refused, and said, rather than written.
 */
export function exportBvbs(doc: DocumentModel, at: string): boolean {
  if (doc.readiness === 'OUTDATED' || doc.readiness === 'SUPERSEDED') {
    uiStore.toast(t('list.ui.bvbsNotBuildable'), 'error');
    return false;
  }
  const filename = `bars-rev${doc.revision.number}.abs`;
  withExportLog({ kind: 'bvbs', doc, filename, at }, () => save(filename, 'text/plain', bvbsOfDocument(doc)));
  return true;
}
