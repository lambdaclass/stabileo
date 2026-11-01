/**
 * The project workbook, from the stores to a file.
 *
 * Gathers the model, the input the engine was given, every solved case and combination, the
 * statics and the combinations with no second-order equilibrium, builds the sheets
 * (`export/project-workbook.ts`) and writes them: an xlsx while it fits (`fitsInXlsx`: the
 * 1 048 576 rows of a sheet, and a budget of cells the xlsx library writes in seconds), and
 * otherwise a zip with one CSV per sheet. A large model read at stations passes both, and
 * dropping rows to fit would publish a workbook that looks complete.
 */
import { ContainmentExportError } from '../export/containment';
import { zipSync, strToU8 } from 'fflate';
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { uiStore } from './ui.svelte';
import { staticsRows } from './statics-rows';
import { unstableCombinations } from './active-results';
import { elementStationDeflections } from './service-deflection';
import { downloadBlob } from './file';
import { i18n, t } from '../i18n';
import { buildSolverInput3D } from '../engine/solver-service';
import { sectionStressModel } from '../engine/member-stresses';
import { toCsv } from '../engine/result-tables';
import type { StationSpec } from '../engine/station-forces';
import { exportToExcel } from '../export/excel';
import { projectWorkbookSheets, type ProjectWorkbookInput } from '../export/project-workbook';
import type { WorkbookModel } from '../export/workbook-model';
import { combinationKind, type WorkbookSource } from '../export/workbook-results';
import { fitsInXlsx, safeText, type WorkbookSheet } from '../export/workbook-cells';
import { specificationRows } from '../pro/specification-list';
import { APP_VERSION, BUILD_COMMIT } from '../build-info';
import { designSheets, physicalForceRows } from './design-exchange';
import { detailingStore } from './detailing.svelte';
import { currentResultProvenance, provenanceLabels, captureProvenanceToken, provenanceForExport, ExportChangedError } from './result-provenance';
import type { ResultProvenance } from '../provenance/result-provenance';
import { provenanceTextLines } from '../provenance/result-provenance';

function workbookModel(): WorkbookModel {
  const m = modelStore.model;
  return {
    nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
    loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
    quads: modelStore.quads, plates: modelStore.plates, constraints: m.constraints,
    connectors: m.connectors, analysis: modelStore.analysis, groups: m.groups,
    includeSelfWeight: uiStore.includeSelfWeight,
    loadCases: m.loadCases, combinations: modelStore.combinations,
    namedGroups: [...(m.groups?.values() ?? [])].map((g) => ({ id: g.id, name: g.name, kind: g.kind, members: g.members })),
  } as WorkbookModel;
}

/** Which solved sets go in: the cases and the combinations by id; absent means all of them. */
export interface SourcePick { cases?: ReadonlySet<number>; combinations?: ReadonlySet<number> }

/** Every solved case and combination; the single result on screen when nothing else was solved. */
function workbookSources(pick: SourcePick = {}): WorkbookSource[] {
  const caseName = new Map(modelStore.model.loadCases.map((c) => [c.id, c.name]));
  const comboName = new Map(modelStore.combinations.map((c) => [c.id, c.name]));
  const out: WorkbookSource[] = [
    ...[...resultsStore.perCase3D].filter(([id]) => !pick.cases || pick.cases.has(id))
      .map(([id, results]) => ({ kind: 'case' as const, id, name: caseName.get(id) ?? String(id), results })),
    // An SRSS or ABS combination under its own kind: magnitudes, not signed forces (`combinationKind`).
    ...[...resultsStore.perCombo3D].filter(([id]) => !pick.combinations || pick.combinations.has(id))
      .map(([id, results]) => ({ kind: combinationKind(results), id, name: comboName.get(id) ?? String(id), results })),
  ];
  if (out.length === 0 && !pick.cases && !pick.combinations && resultsStore.results3D) {
    out.push({ kind: 'single', id: 0, name: t('pro.statics.singleSolve'), results: resultsStore.results3D });
  }
  return out;
}

/** The workbook's sheets for the project as it stands. Exported for the tests. */
/**
 * What a caller can narrow: the model's sheets, the results', sheets of its own, which sheets by
 * name (`sheets`), which solved sets (`sources`) and the design sheets (`design`: elements,
 * checks and verdict; absent, they go in).
 */
export interface WorkbookOptions {
  model?: boolean; results?: boolean; extra?: readonly WorkbookSheet[];
  sheets?: ReadonlySet<string>; sources?: SourcePick; design?: boolean;
}

/**
 * The design sheets, stamped when they describe an earlier model.
 *
 * The memoria, the IFC, the sheets and the exchange say it on screen (`OutdatedNotice`, from
 * `detailingStore.modelStale`); a workbook leaves the app, so the stamp goes in the file: a first
 * row on each design sheet, above its header, naming why and when the file was exported.
 */
export function stampOutdatedDesign(sheets: readonly WorkbookSheet[], exported: string, stale = detailingStore.modelStale): WorkbookSheet[] {
  if (!stale) return [...sheets];
  const stamp = safeText(t('outdated.workbookStamp').replace('{time}', exported));
  return sheets.map((s) => ({ ...s, rows: [[stamp], ...s.rows] }));
}

export function currentWorkbookSheets(stations: StationSpec, opts: WorkbookOptions = {}, record?: ResultProvenance): WorkbookSheet[] {
  if (opts.results !== false || opts.design !== false) {
    const disposition = uiStore.is3DWorkspace ? resultsStore.knownIssues3D : resultsStore.knownIssues;
    if (disposition.refused) throw new ContainmentExportError(disposition.messages.join('\n'));
  }
  const model = workbookModel();
  const exported = new Date().toISOString();
  const input: ProjectWorkbookInput = {
    model,
    solved: buildSolverInput3D(model, false, false, { expandMemberOffsets: false }),
    projectName: modelStore.model.name,
    projectInfo: modelStore.projectInfo,
    meta: { exported, commit: `${APP_VERSION} (${BUILD_COMMIT})`, provenance: provenanceTextLines(record ?? currentResultProvenance(), provenanceLabels()) },
    results: {
      sources: workbookSources(opts.sources),
      stations,
      statics: staticsRows(),
      unstable: unstableCombinations(),
      comboNames: new Map(modelStore.combinations.map((c) => [c.id, c.name])),
      deflections: elementStationDeflections,
      shells: { nodes: modelStore.nodes, plates: modelStore.plates, quads: modelStore.quads },
      stressModel: (id) => {
        const e = modelStore.elements.get(id);
        const s = e && modelStore.sections.get(e.sectionId);
        return s ? sectionStressModel(s) : null;
      },
    },
    tr: t,
    include: { model: opts.model, results: opts.results, sheets: opts.sheets },
    // The model's specifications, grouped by value as Specifications › List shows them; the
    // fields themselves are already in the Members, Supports and Quads sheets.
    extra: [
      ...(opts.model === false ? [] : [specificationsSheet()]),
      // The design as it stands: decisions and results per element, every check, and the forces
      // of each physical member along it.
      ...(opts.design === false ? [] : stampOutdatedDesign(designSheets(t, i18n.locale), exported)),
      ...(opts.results === false || !resultsStore.results3D ? [] : [{ name: 'Physical member forces', rows: physicalForceRows() }]),
      ...(opts.extra ?? []),
    ],
  };
  const sheets = projectWorkbookSheets(input);
  if (opts.results !== false || opts.design !== false) {
    const disposition = uiStore.is3DWorkspace ? resultsStore.knownIssues3D : resultsStore.knownIssues;
    const warnings = sheets.find(s => s.name === 'Warnings');
    const messages = [...new Set([...(warnings?.rows.flat().map(String) ?? []), ...disposition.messages])];
    if (warnings) warnings.rows = messages.map(message => [safeText(message)]);
    else if (messages.length) sheets.splice(2, 0, { name: 'Warnings', rows: messages.map(message => [safeText(message)]) });
  }
  return sheets;
}

function specificationsSheet(): WorkbookSheet {
  const rows: WorkbookSheet['rows'] = [['entity', 'specification', 'value', 'count', 'ids']];
  for (const r of specificationRows(modelStore.model, t)) rows.push([r.kind, safeText(r.what), safeText(r.value), r.ids.length, r.ids.join(' ')]);
  return { name: 'Specifications', rows };
}

/** One CSV per sheet, in a zip, for a workbook an xlsx file cannot hold. */
export function workbookZip(sheets: readonly WorkbookSheet[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  sheets.forEach((s, i) => {
    files[`${String(i + 1).padStart(2, '0')}-${s.name}.csv`] = strToU8(toCsv(s.rows[0]!.map(String), s.rows.slice(1)));
  });
  return zipSync(files, { level: 6 });
}

/**
 * The chosen sheets as CSV: a zip with one file per sheet, the cover and the conventions always
 * included, as the dialog says (`proExport.dataAlways`). One sheet of data used to come as that
 * sheet alone, without the units and the signs its numbers are in.
 */
export async function downloadProjectCsv(stations: StationSpec, opts: WorkbookOptions = {}): Promise<void> {
  const record = await workbookRecord();
  if (!record) return;
  const safeName = modelStore.model.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, '').trim() || t('file.defaultAnalysis');
  let sheets: WorkbookSheet[];
  try { sheets = currentWorkbookSheets(stations, opts, record); }
  catch (error) {
    if (error instanceof ContainmentExportError) { uiStore.toast(error.message, 'error'); return; }
    throw error;
  }
  const data = sheets.filter((s) => s.name !== 'Cover' && s.name !== 'Conventions');
  const name = data.length === 1 ? `${safeName}_${data[0]!.name}_csv.zip` : `${safeName}_csv.zip`;
  downloadBlob(new Blob([workbookZip(sheets) as BlobPart], { type: 'application/zip' }), name);
}

/**
 * The cover's provenance, taken when the export starts and written only if nothing moved while the
 * engine hashes were computed (`provenanceForExport`); the sheets are then built in the same tick.
 * Null, said, when the project changed: nothing is exported.
 */
async function workbookRecord(): Promise<ResultProvenance | null> {
  try {
    return await provenanceForExport(captureProvenanceToken());
  } catch (e) {
    if (e instanceof ExportChangedError) { uiStore.toast(e.message, 'error'); return null; }
    throw e;
  }
}

/** Write the project workbook: xlsx when it fits, a zip of CSVs otherwise. */
export async function downloadProjectWorkbook(stations: StationSpec, opts: WorkbookOptions = {}): Promise<void> {
  const record = await workbookRecord();
  if (!record) return;
  const safeName = modelStore.model.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, '').trim() || t('file.defaultAnalysis');
  let sheets: WorkbookSheet[];
  try { sheets = currentWorkbookSheets(stations, opts, record); }
  catch (error) {
    if (error instanceof ContainmentExportError) { uiStore.toast(error.message, 'error'); return; }
    throw error;
  }
  if (fitsInXlsx(sheets)) {
    // The cover already carries the provenance, prepared above.
    await exportToExcel({ filename: `${safeName}.xlsx`, onlyExtras: true, extraSheets: sheets, provenance: false });
    return;
  }
  const zip = workbookZip(sheets);
  downloadBlob(new Blob([zip as BlobPart], { type: 'application/zip' }), `${safeName}.zip`);
  uiStore.toast(t('wb.zipped'), 'info');
}
