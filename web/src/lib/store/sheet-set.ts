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
import { buildSheetSet, DEFAULT_SHEET_SETTINGS, sheetSetDxfZip, sheetSetPdf, type SetSheet, type SheetRevision } from '../sheets/sheet-set';
import { currentRevision } from '../model/project-info';
import type { DocumentModel } from '../engine/detailing/document-model';
import type { SheetFormat } from '../sheets/formats';
import { membersFromModel } from '../engine/detailing/member-geometry';
import { cachedSceneModel } from '../engine/detailing/scene-cache';
import { PLAN_KINDS, planContext, workDrawings, type PlanKind } from './work-drawings';

export const sheetSettings = () => ({ ...DEFAULT_SHEET_SETTINGS, ...designData().sheets });
export const patchSheetSettings = (p: Partial<ReturnType<typeof sheetSettings>>) => patchDesignData({ sheets: { ...sheetSettings(), ...p } });
export const sheetLanguage = () => sheetSettings().language ?? i18n.locale;
/** The kinds of plan the set carries; absent, all of them. */
export const sheetKinds = (): Set<PlanKind> => new Set((sheetSettings().kinds as PlanKind[] | undefined) ?? PLAN_KINDS);

/** The scene the structure-wide sheets are drawn from: the same one the 3-D view renders. */
function sceneOf(doc: DocumentModel) {
  const m = modelStore.model;
  const { members } = membersFromModel({
    elementIds: [...m.elements.keys()].sort((a, b) => a - b),
    nodes: [...m.nodes.values()], elements: [...m.elements.values()], sections: [...m.sections.values()],
  });
  return cachedSceneModel(doc, members);
}

export function setSheetRevision(number: string, r: SheetRevision | null): void {
  const revisions = { ...(sheetSettings().revisions ?? {}) };
  if (r) revisions[number] = r; else delete revisions[number];
  patchSheetSettings({ revisions });
}

export function projectSheetSet(doc: DocumentModel | null, projectName: string): SetSheet[] {
  const locale = sheetLanguage(), st = sheetSettings(), kinds = sheetKinds();
  const ctx = planContext(locale, st.format as SheetFormat);
  const work = workDrawings(doc, kinds, ctx);
  const detailing = doc && kinds.has('detailing')
    ? renderDrawings(doc, { locale, projectName, retouched: retouchedIn(doc), members: sheetMembers(), coverOf: coverForMember, scene: sceneOf(doc) }).sheets
      // The caption names the drawing; the project and the readiness go to the title block.
      .map((s) => ({ key: s.name, title: s.caption ?? s.name, ...drawingPrimitives(s.sheet, locale) }))
    : [];
  const drawings = PLAN_KINDS.flatMap((k) => (k === 'detailing' ? detailing : (work.get(k) ?? []).map((d) => ({ ...d, group: ctx.tr(`sheet.kind.${k}`) }))));
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
  });
}

function save(name: string, type: string, bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The set as one zip with a DXF per sheet, recorded in the export log like the other files. */
export function exportSheetsDxf(doc: DocumentModel | null, sheets: readonly SetSheet[], at: string) {
  const filename = doc ? `sheets-rev${doc.revision.number}-dxf.zip` : 'sheets-dxf.zip';
  const write = () => save(filename, 'application/zip', sheetSetDxfZip(sheets));
  // The export log records emissions of a document revision; a set without one has none to cite.
  if (doc) withExportLog({ kind: 'sheetsDxf', doc, filename, at }, write); else write();
}

/** The set as one PDF, a page per sheet at its paper size. */
export function exportSheetsPdf(doc: DocumentModel | null, sheets: readonly SetSheet[], at: string, title: string) {
  const filename = doc ? `sheets-rev${doc.revision.number}.pdf` : 'sheets.pdf';
  const write = () => save(filename, 'application/pdf', sheetSetPdf(sheets, title));
  if (doc) withExportLog({ kind: 'sheetsPdf', doc, filename, at }, write); else write();
}
