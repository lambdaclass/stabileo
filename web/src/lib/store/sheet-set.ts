/**
 * The project's sheet set, from the issued document: its drawings (`renderDrawings`, the same path
 * the DXF has always taken) in the documents' language, composed onto sheets of the project's
 * format and numbering, each with the title block from `ProjectInfo` and the rótulo. Exports a zip
 * of DXF (one per sheet) and one PDF.
 */
import { i18n } from '../i18n';
import { tAt } from '../i18n/store.svelte';
import { modelStore } from './model.svelte';
import { designData, patchDesignData } from './design-data';
import { readinessBanner, renderDrawings } from '../engine/detailing/document-render';
import { retouchedIn, withExportLog } from './export-log';
import { coverForMember, sheetMembers } from './detailing-sheet-inputs';
import { drawingPrimitives } from '../sheets/adapter';
import { buildSheetSet, DEFAULT_SHEET_SETTINGS, sheetSetDxfZip, sheetSetPdf, sheetSetSvgZip, type SetSheet, type SheetRevision } from '../sheets/sheet-set';
import { currentRevision } from '../model/project-info';
import type { DocumentModel } from '../engine/detailing/document-model';
import type { SheetFormat } from '../sheets/formats';
import type { DrawingInput } from '../sheets/compose';
import { membersFromModel } from '../engine/detailing/member-geometry';
import { projectPhysicalFrame } from './physical-frame';
import { cachedSceneModel } from '../engine/detailing/scene-cache';
import { dxfWithProvenance, svgWithProvenance, prepareExportProvenance, reportProvenanceLines } from '../export/provenance-attach';
import type { SetProvenance } from '../sheets/sheet-set';
import { PLAN_KINDS, planContext, workDrawings, type PlanKind } from './work-drawings';
import { defaultEntries, parseSetTemplate, type SheetEntry, type SheetSetTemplate } from '../sheets/sheet-entries';
import { emptyLayout, type DrawingAdjust, type SheetLayout } from '../sheets/sheet-layout';
import type { PlacedDrawing } from '../sheets/compose';
import { drawDetails, placeDetails, type DetailChoice } from '../sheets/details/catalog';
import { chosenDetails, projectDetailValues } from './detail-catalog';
import { memberNames } from './member-names';

export const sheetSettings = () => ({ ...DEFAULT_SHEET_SETTINGS, ...designData().sheets });
export const patchSheetSettings = (p: Partial<ReturnType<typeof sheetSettings>>) => patchDesignData({ sheets: { ...sheetSettings(), ...p } });
export const sheetLanguage = () => sheetSettings().language ?? i18n.locale;
/** The kinds of plan the set carries; absent, all of them. */
export const sheetKinds = (): Set<PlanKind> => new Set((sheetSettings().kinds as PlanKind[] | undefined) ?? PLAN_KINDS);

/** The set's entries in order: the person's list, or one per kind of the chosen kinds. */
export function sheetEntries(): SheetEntry[] {
  const st = sheetSettings();
  if (st.entries?.length) return st.entries;
  const kinds = sheetKinds();
  return defaultEntries(PLAN_KINDS.filter((k) => kinds.has(k)));
}
export const setSheetEntries = (entries: SheetEntry[]) => patchSheetSettings({ entries });

/** The scene the structure-wide sheets are drawn from: the same one the 3-D view renders. */
function sceneOf(doc: DocumentModel) {
  const m = modelStore.model;
  const { members } = membersFromModel({
    elementIds: [...m.elements.keys()].sort((a, b) => a - b),
    nodes: [...m.nodes.values()], elements: [...m.elements.values()], sections: [...m.sections.values()],
  });
  return cachedSceneModel(doc, members, { physical: projectPhysicalFrame() });
}

export function setSheetRevision(number: string, r: SheetRevision | null): void {
  const revisions = { ...(sheetSettings().revisions ?? {}) };
  if (r) revisions[number] = r; else delete revisions[number];
  patchSheetSettings({ revisions });
}

/** One entry's drawings, each in its group and with its scale and format (`SheetEntry`). */
/** The chosen details for each entry of the set (`placeDetails`), drawn with the project's values once per set. */
function detailsPlan(doc: DocumentModel | null, entries: readonly SheetEntry[]) {
  const { byEntry } = placeDetails(chosenDetails(), entries);
  let values: ReturnType<typeof projectDetailValues> | null = null;
  return (e: SheetEntry, ctx: ReturnType<typeof planContext>): DrawingInput[] => {
    const cs: DetailChoice[] | undefined = byEntry.get(e.id);
    if (!cs?.length) return [];
    values ??= projectDetailValues(doc);
    return drawDetails(cs, values, ctx.tr, ctx.fmt);
  };
}

/** The chosen details the set has no sheet for: their kind is not in it and neither is a details entry. */
export const unplacedDetails = (): DetailChoice[] => placeDetails(chosenDetails(), sheetEntries()).unplaced;

function entryDrawings(doc: DocumentModel | null, projectName: string, e: SheetEntry, named: Map<string, number>, details?: ReturnType<typeof detailsPlan>): DrawingInput[] {
  const locale = sheetLanguage(), st = sheetSettings();
  const kind = e.kind as PlanKind;
  const ctx = planContext(locale, (e.format ?? st.format) as SheetFormat, e);
  let ds: DrawingInput[];
  if (kind === 'detailing') {
    ds = doc
      ? renderDrawings(doc, { locale, projectName, retouched: retouchedIn(doc), members: sheetMembers(), coverOf: coverForMember, scene: sceneOf(doc), memberName: (id) => memberNames().atLevel(id) }).sheets
        // The caption names the drawing; the project and the readiness go to the title block.
        .map((s) => ({ key: s.name, title: s.caption ?? s.name, ...drawingPrimitives(s.sheet, locale) }))
      : [];
  } else ds = workDrawings(doc, new Set([kind]), ctx).get(kind) ?? [];
  // Two entries of one kind make two groups of sheets, each under its own name.
  const label = e.label || ctx.tr(`sheet.kind.${kind}`);
  const n = (named.get(label) ?? 0) + 1; named.set(label, n);
  const group = n > 1 ? `${label} (${n})` : label;
  // The construction details chosen for this entry's sheets go after its own drawings, each at its own scale.
  const extra = (details?.(e, ctx) ?? []).map((d) => ({ ...d, group, ...(e.format ? { format: e.format } : {}), key: `${e.id}:${d.key}` }));
  return [...ds
    .filter((d) => e.tables !== false || !d.table)
    // A name the person gave the entry heads each of its drawings, so a sheet of one drawing reads it too.
    // A drawing that names a group of its own (a beam line) starts sheets of its own within the entry's.
    .map((d) => ({ ...d, ...(e.label ? { title: `${e.label} — ${d.title}` } : {}), group: d.group ? `${group} · ${d.group}` : group, ...(e.scale && !d.paper ? { scale: e.scale } : {}), ...(e.format ? { format: e.format } : {}), key: `${e.id}:${d.key}` })), ...extra];
}

export function projectSheetSet(doc: DocumentModel | null, projectName: string): SetSheet[] {
  const named = new Map<string, number>(), entries = sheetEntries(), details = detailsPlan(doc, entries);
  return assemble(doc, projectName, entries.flatMap((e) => entryDrawings(doc, projectName, e, named, details)));
}

/**
 * The set built entry by entry with a pause between them, so the page stays alive on a large
 * project: `onProgress` hears each entry as it starts, and an aborted signal stops the build and
 * returns null (nothing half-built is shown).
 */
export async function projectSheetSetAsync(doc: DocumentModel | null, projectName: string, opts: { onProgress?: (done: number, total: number, entry: SheetEntry) => void; signal?: AbortSignal } = {}): Promise<SetSheet[] | null> {
  const entries = sheetEntries(), named = new Map<string, number>(), drawings: DrawingInput[] = [], details = detailsPlan(doc, entries);
  for (const [i, e] of entries.entries()) {
    if (opts.signal?.aborted) return null;
    opts.onProgress?.(i, entries.length, e);
    await new Promise((r) => setTimeout(r, 0));
    if (opts.signal?.aborted) return null;
    drawings.push(...entryDrawings(doc, projectName, e, named, details));
  }
  if (opts.signal?.aborted) return null;
  return assemble(doc, projectName, drawings);
}

function assemble(doc: DocumentModel | null, projectName: string, drawings: DrawingInput[]): SetSheet[] {
  const locale = sheetLanguage(), st = sheetSettings();
  const info = modelStore.model.projectInfo, tb = modelStore.model.detailing?.titleBlock ?? {};
  const rev = currentRevision(info);
  return buildSheetSet({
    drawings,
    settings: { format: st.format as SheetFormat, prefix: st.prefix, start: st.start },
    project: {
      ...(tb.office ? { office: tb.office } : {}), project: tb.project || projectName,
      ...(info?.client ? { client: info.client } : {}), ...(info?.job ? { job: info.job } : {}), ...(info?.jobNumber ? { jobNumber: info.jobNumber } : {}), ...(info?.site ? { site: info.site } : {}),
      ...(doc ? { status: readinessBanner(doc, locale) } : {}),
      ...(info?.designer ? { designer: info.designer.name } : {}), ...(info?.checker ? { checker: info.checker.name } : {}), ...(info?.approver ? { approver: info.approver.name } : {}),
    },
    ...(st.revisions ? { revisions: st.revisions } : {}),
    ...(rev ? { projectRevision: { code: rev.code, ...(rev.date ? { date: rev.date } : {}), ...(rev.note ? { note: rev.note } : {}) } } : {}),
    label: (k) => tAt(k, locale),
    ...(st.layout ? { layout: st.layout } : {}),
    // The template's variables the project already states fill themselves; the template's own win.
    ...(st.titleBlock ? { titleBlock: { ...st.titleBlock, values: {
      ...(info?.job || tb.project || projectName ? { obra: info?.job || tb.project || projectName } : {}),
      ...(info?.jobNumber ? { expediente: info.jobNumber } : {}), ...(info?.site ? { ubicacion: info.site } : {}),
      ...(info?.client ? { propietario: info.client } : {}), ...(info?.designer ? { profesional: info.designer.name } : {}),
      ...(rev?.date ? { fecha: rev.date } : {}),
      ...st.titleBlock.values,
    } } } : {}),
  });
}

// ─── The set kept as a template of the office ───

const TEMPLATES = 'stabileo-sheet-set-templates';

export function listSetTemplates(): SheetSetTemplate[] {
  try { const l = JSON.parse(localStorage.getItem(TEMPLATES) ?? '[]'); return Array.isArray(l) ? l.filter((t) => t?.kind === 'stabileo-sheet-set') : []; } catch { return []; }
}

/** The project's set as a template: its entries, display, title block, format and numbering. */
export function setTemplateFromProject(name: string): SheetSetTemplate {
  const st = sheetSettings();
  return {
    kind: 'stabileo-sheet-set', version: 1, name, format: st.format as SheetFormat, prefix: st.prefix, start: st.start,
    ...(st.language ? { language: st.language } : {}), entries: JSON.parse(JSON.stringify(sheetEntries())),
    ...(st.display ? { display: JSON.parse(JSON.stringify(st.display)) } : {}),
    ...(st.titleBlock ? { titleBlock: JSON.parse(JSON.stringify(st.titleBlock)) } : {}),
  };
}

export function saveSetTemplate(t: SheetSetTemplate): boolean {
  try { localStorage.setItem(TEMPLATES, JSON.stringify([...listSetTemplates().filter((x) => x.name !== t.name), t])); return true; } catch { return false; }
}
export function removeSetTemplate(name: string): void {
  try { localStorage.setItem(TEMPLATES, JSON.stringify(listSetTemplates().filter((x) => x.name !== name))); } catch { /* kept as is */ }
}
export const importSetTemplate = (text: string): SheetSetTemplate => { const t = parseSetTemplate(text); saveSetTemplate(t); return t; };

/** Apply a template to the open project: its entries, display, title block, format and numbering; one undo step. Revisions stay the project's. */
export function applySetTemplate(t: SheetSetTemplate): void {
  patchSheetSettings({
    format: t.format, prefix: t.prefix, start: t.start, ...(t.language ? { language: t.language } : {}),
    entries: JSON.parse(JSON.stringify(t.entries)),
    ...(t.display ? { display: JSON.parse(JSON.stringify(t.display)) } : { display: undefined }),
    ...(t.titleBlock ? { titleBlock: JSON.parse(JSON.stringify(t.titleBlock)) } : { titleBlock: undefined }),
  });
}

function save(name: string, type: string, bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The set as one zip with a DXF per sheet, recorded in the export log like the other files. */
/** The results' provenance for a set, or null (said) when the project moved while it was prepared. */
async function setProvenance(): Promise<SetProvenance | null> {
  const record = await prepareExportProvenance();
  if (!record) return null;
  const { title, lines } = reportProvenanceLines(record);
  return { dxf: (d) => dxfWithProvenance(d, record), svg: (d) => svgWithProvenance(d, record), title, lines };
}

export async function exportSheetsDxf(doc: DocumentModel | null, sheets: readonly SetSheet[], at: string, version: '2004' | 'r12' = '2004') {
  const tag = version === 'r12' ? 'dxf-r12' : 'dxf';
  const filename = doc ? `sheets-rev${doc.revision.number}-${tag}.zip` : `sheets-${tag}.zip`;
  const provenance = await setProvenance();
  if (!provenance) return;
  const write = () => save(filename, 'application/zip', sheetSetDxfZip(sheets, sheetSettings().display, version, provenance));
  // The export log records emissions of a document revision; a set without one has none to cite.
  if (doc) withExportLog({ kind: 'sheetsDxf', doc, filename, at }, write); else write();
}

/** Every sheet as an SVG, zipped. */
export async function exportSheetsSvg(doc: DocumentModel | null, sheets: readonly SetSheet[], at: string) {
  const filename = doc ? `sheets-rev${doc.revision.number}-svg.zip` : 'sheets-svg.zip';
  const provenance = await setProvenance();
  if (!provenance) return;
  const write = () => save(filename, 'application/zip', sheetSetSvgZip(sheets, sheetSettings().display, provenance));
  if (doc) withExportLog({ kind: 'sheetsSvg', doc, filename, at }, write); else write();
}

/** The set as one PDF, a page per sheet at its paper size. */
export async function exportSheetsPdf(doc: DocumentModel | null, sheets: readonly SetSheet[], at: string, title: string) {
  const filename = doc ? `sheets-rev${doc.revision.number}.pdf` : 'sheets.pdf';
  const provenance = await setProvenance();
  if (!provenance) return;
  const write = () => save(filename, 'application/pdf', sheetSetPdf(sheets, title, sheetSettings().display, provenance));
  if (doc) withExportLog({ kind: 'sheetsPdf', doc, filename, at }, write); else write();
}

// ─── The composition, adjusted by hand ───

export const sheetLayout = (): SheetLayout => sheetSettings().layout ?? emptyLayout();
const setLayout = (layout: SheetLayout) => patchSheetSettings({ layout });

/**
 * Adjust a drawing as placed: its scale, the sheet of another drawing it goes to, its point on the
 * sheet, a text moved inside it. The drawing's size now is kept with it, so a later generation that
 * changed it says so instead of applying the adjustment over the new drawing.
 */
export function adjustDrawing(p: Pick<PlacedDrawing, 'key' | 'mw' | 'mh'>, patch: Partial<DrawingAdjust>): void {
  const l = sheetLayout(), cur = l.drawings[p.key] ?? {};
  const next: DrawingAdjust = { ...cur, ...patch, size: { w: p.mw, h: p.mh } };
  for (const k of Object.keys(next) as Array<keyof DrawingAdjust>) if (next[k] === undefined) delete next[k];
  setLayout({ ...l, drawings: { ...l.drawings, [p.key]: next } });
}

export function clearAdjust(key: string): void {
  const l = sheetLayout(), { [key]: _gone, ...rest } = l.drawings;
  setLayout({ ...l, drawings: rest });
}

export function addAnnotation(onDrawing: string, at: { x: number; y: number }, text: string, height = 2.5): void {
  const l = sheetLayout();
  setLayout({ ...l, annotations: [...l.annotations, { id: `n${Date.now().toString(36)}${l.annotations.length}`, onDrawing, at, text, height }] });
}
export function removeAnnotation(id: string): void {
  const l = sheetLayout();
  setLayout({ ...l, annotations: l.annotations.filter((n) => n.id !== id) });
}

/** Only these sheets, by number, as PDF or DXF (the index travels when asked for). */
export const selectSheets = (sheets: readonly SetSheet[], numbers: ReadonlySet<string>) => sheets.filter((s) => numbers.has(s.number));
