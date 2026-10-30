/**
 * "Exportar vista": the chosen figures as SVG or PNG files, or a picture on the clipboard.
 *
 * Figures that need results solve the model first (`ensureResults`); when it cannot be solved,
 * the figures that do not need results still come out and the reason is told. The figures are
 * drawn as vectors (`view-figure.ts`), in 2D and in 3D.
 */
import { captureProvenanceToken, provenanceForExport, ExportChangedError } from '../store/result-provenance';
import { svgWithProvenance, imageWithProvenance } from './provenance-attach';
import { zipSync } from 'fflate';
import { modelStore, uiStore } from '../store';
import { t, tp } from '../i18n';
import { ensureResults } from '../actions/solve';
import { downloadBlob } from '../store/file';
import { modelIsEmpty, tellIfEmpty } from './empty-model';
import {
  NEEDS_RESULTS, canvasToBlob, plan2D, sheetOf, toCanvas, toSvg,
  type FigureContent, type FigureOptions, type FigurePlan,
} from './view-figure';

/** `jpg` is PRO's: a picture that every program opens, on white. */
export type ViewFormat = 'svg' | 'png' | 'jpg';

export interface ViewExportRequest {
  format: ViewFormat;
  contents: FigureContent[];
  options: FigureOptions;
  /** All the figures on one sheet, rather than one file each. */
  sheet: boolean;
}

/** The project's name as a file name. */
export function fileBase(): string {
  return (modelStore.model.name || t('file.defaultStructure')).replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, '').trim() || 'stabileo';
}

const SLUG: Record<FigureContent, string> = {
  model: 'estructura', reactions: 'reacciones', despiece: 'dcl', moment: 'M', shear: 'V', axial: 'N', deformed: 'deformada', shellMap: 'placas',
};

/**
 * Solve if a chosen figure needs results, and keep the figures that can be drawn. A failed solve
 * leaves out the result figures and says why; an empty model draws its empty structure.
 */
async function drawable(contents: FigureContent[]): Promise<FigureContent[]> {
  if (!contents.some((c) => NEEDS_RESULTS.has(c))) return contents;
  const solved = await ensureResults();
  if (solved.ok) return contents;
  const kept = contents.filter((c) => !NEEDS_RESULTS.has(c));
  if (modelIsEmpty()) return kept.length ? kept : ['model'];
  uiStore.toast(tp(kept.length ? 'viewExport.partial' : 'viewExport.unsolved', { error: solved.error }), 'error');
  return kept;
}

/** The 2D plans for the request: one per figure, or one sheet. */
function plans(contents: FigureContent[], req: ViewExportRequest): FigurePlan[] {
  const list = contents.map((c) => plan2D(c, req.options)).filter((p): p is FigurePlan => p !== null);
  if (req.sheet && list.length > 1) return [sheetOf(list, req.options.style)];
  return list;
}

/** The files the request makes: name and content. */
async function files(req: ViewExportRequest, onDrawn?: () => void): Promise<Array<{ name: string; blob: Blob }>> {
  const contents = await drawable(req.contents);
  // After the solve `drawable` may run: the state the figures are drawn from.
  onDrawn?.();
  if (contents.length === 0) return [];
  const base = fileBase();
  const ps = plans(contents, req);
  const out: Array<{ name: string; blob: Blob }> = [];
  let failed = 0;
  for (const p of ps) {
    const name = ps.length === 1 && (req.sheet || contents.length > 1) ? `${base}_${t('viewExport.sheetFile')}` : `${base}_${SLUG[p.content]}`;
    if (req.format === 'svg') out.push({ name: `${name}.svg`, blob: new Blob([toSvg(p)], { type: 'image/svg+xml' }) });
    else {
      const jpg = req.format === 'jpg';
      // The canvas is kept inside what browsers encode (`toCanvas`); one that still gives no
      // picture is told, not left as a download that never comes.
      const blob = await canvasToBlob(toCanvas(p), jpg ? 'image/jpeg' : 'image/png');
      if (blob) out.push({ name: `${name}.${jpg ? 'jpg' : 'png'}`, blob });
      else failed++;
    }
  }
  if (failed) uiStore.toast(t('viewExport.pictureFailed'), 'error');
  return out;
}

/** Download what the request makes: one file, or a zip of several. */
export async function exportView(req: ViewExportRequest): Promise<boolean> {
  // Taken when the figures are drawn (after any solve); checked again once the hashes are in.
  let token = captureProvenanceToken();
  const drawn = await files(req, () => { token = captureProvenanceToken(); });
  if (drawn.length === 0) return false;
  let record;
  try {
    record = await provenanceForExport(token);
  } catch (e) {
    if (e instanceof ExportChangedError) { uiStore.toast(e.message, 'error'); return false; }
    throw e;
  }
  // Each picture carries the record in its own format (PNG tEXt, JPEG comment, SVG metadata).
  const fs: Array<{ name: string; blob: Blob }> = [];
  for (const f of drawn) {
    if (f.name.endsWith('.svg')) {
      fs.push({ name: f.name, blob: new Blob([svgWithProvenance(await f.blob.text(), record)], { type: 'image/svg+xml' }) });
    } else {
      const bytes = imageWithProvenance(new Uint8Array(await f.blob.arrayBuffer()), record);
      fs.push({ name: f.name, blob: new Blob([bytes as BlobPart], { type: f.blob.type }) });
    }
  }
  tellIfEmpty();
  if (fs.length === 1) { downloadBlob(fs[0]!.blob, fs[0]!.name); return true; }
  const entries: Record<string, Uint8Array> = {};
  for (const f of fs) entries[f.name] = new Uint8Array(await f.blob.arrayBuffer());
  entries['provenance.json'] = new TextEncoder().encode(JSON.stringify(record, null, 2));
  downloadBlob(new Blob([zipSync(entries, { level: 0 }) as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), `${fileBase()}_${t('viewExport.figuresFile')}.zip`);
  return true;
}

/**
 * Put the figures on the clipboard as one picture (several go on one sheet), to paste into a
 * document. A PNG: the format every editor accepts from the clipboard.
 */
export async function copyView(req: ViewExportRequest): Promise<boolean> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    uiStore.toast(t('viewExport.noClipboard'), 'error');
    return false;
  }
  // The clipboard write has to start inside the click, so it is handed a promise of the picture.
  // A model that cannot be solved is told by `drawable`; the failed copy is then not told again.
  let told = false;
  const picture = (async () => {
    const contents = await drawable(req.contents);
    if (contents.length === 0) { told = req.contents.length > 0; throw new Error('empty'); }
    const ps = plans(contents, { ...req, sheet: true });
    const blob = ps[0] ? await canvasToBlob(toCanvas(ps[0])) : null;
    if (!blob) throw new Error('empty');
    return blob;
  })();
  // A clipboard that refuses before reading the picture leaves its failure unheard: handled
  // here, it is not an unhandled rejection.
  picture.catch(() => {});
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': picture })]);
    return true;
  } catch {
    if (!told) uiStore.toast(t('viewExport.copyFailed'), 'error');
    return false;
  }
}
