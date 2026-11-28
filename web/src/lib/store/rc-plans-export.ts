/**
 * The reinforcement drawings downloaded from the sheets workspace: the rows on screen drawn to
 * scale (`rc-sheets/plans`), composed onto sheets with the project's name and the author and
 * licence the person writes in, and saved as DXF and/or PDF, zipped when there are several files.
 */
import { modelStore } from './model.svelte';
import { designData } from './design-data';
import { downloadBlob } from './file';
import { rowsCode } from './rc-sheets-schedule';
import type { SheetRows } from './rc-sheets.svelte';
import { i18n } from '../i18n';
import { decimalFor, makeFmt } from '../rc-sheets/format';
import type { Tr } from '../rc-sheets/plans/draw';
import { structurePlansOf } from './rc-structure-plan';
import { recordSheetsExport } from './rc-sheets-exports';
import { planDownload, planDrawings, planFiles, planSheets, type PlanFormat, type PlanProject, type PlanScales, type PlanSelection } from '../rc-sheets/plans/sheets';

export interface PlanExportRequest {
  selection: PlanSelection; format: PlanFormat; scales: PlanScales;
  dxf: boolean; pdf: boolean;
  author: string; licence: string;
}

const projectName = () => modelStore.model.projectInfo?.job || modelStore.model.name || 'Stabileo';
const baseName = (tr: Tr) => `${(modelStore.model.name || 'stabileo').replace(/[^\w.-]+/g, '-')}-${tr('rcSheets.plans.fileName')}`;

/** The author the title block starts from: the project's designer. */
export const defaultPlanAuthor = (): string => modelStore.model.projectInfo?.designer?.name ?? '';

export function buildPlanExport(rows: SheetRows, req: PlanExportRequest, tr: Tr, project: PlanProject, base: string) {
  const dd = designData();
  const { drawings, levels } = planDrawings({ ...rows, structure: req.selection.element ? [] : structurePlansOf(rows) }, req.selection, {
    format: req.format, scales: req.scales, code: rowsCode(rows), endZones: dd.columnEndZones === true, slabCover: dd.covers.slab,
    fmt: makeFmt(decimalFor(i18n.locale)), tr,
  });
  if (!drawings.length) return { sheets: 0, file: null };
  const sheets = planSheets(drawings, levels, req.format, project, tr);
  return { sheets: sheets.length, file: planDownload(planFiles(sheets, { dxf: req.dxf, pdf: req.pdf }, base, project.name), base) };
}

/** Downloads the drawings asked for and says how many sheets they took; 0 when there was nothing to draw. */
export function exportRcPlans(rows: SheetRows, req: PlanExportRequest, tr: Tr, date = new Date().toISOString().slice(0, 10)): number {
  const info = modelStore.model.projectInfo;
  const project: PlanProject = {
    name: projectName(), author: req.author.trim(), licence: req.licence.trim(), date,
    ...(info?.client ? { client: info.client } : {}), ...(info?.checker?.name ? { checker: info.checker.name } : {}), ...(info?.approver?.name ? { approver: info.approver.name } : {}),
  };
  const r = buildPlanExport(rows, req, tr, project, baseName(tr));
  if (!r.file) return 0;
  downloadBlob(new Blob([r.file.data as BlobPart], { type: r.file.mime }), r.file.name);
  const sel = req.selection;
  recordSheetsExport('rcPlans', r.file.name, sel.element ?? [sel.families.map((f) => tr(`rcSheets.tab.${f}`)).join(', '), ...(sel.levels ? [sel.levels.map((l) => l || '—').join(', ')] : [])].join(' · '));
  return r.sheets;
}
