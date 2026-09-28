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
import { zipSync, strToU8 } from 'fflate';
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { uiStore } from './ui.svelte';
import { staticsRows } from './statics-rows';
import { unstableCombinations } from './active-results';
import { elementStationDeflections } from './service-deflection';
import { downloadBlob } from './file';
import { t } from '../i18n';
import { buildSolverInput3D } from '../engine/solver-service';
import { sectionStressModel } from '../engine/member-stresses';
import { toCsv } from '../engine/result-tables';
import type { StationSpec } from '../engine/station-forces';
import { exportToExcel } from '../export/excel';
import { projectWorkbookSheets, type ProjectWorkbookInput } from '../export/project-workbook';
import type { WorkbookModel } from '../export/workbook-model';
import type { WorkbookSource } from '../export/workbook-results';
import { fitsInXlsx, type WorkbookSheet } from '../export/workbook-cells';
import { BUILD_COMMIT } from '../build-info';

function workbookModel(): WorkbookModel {
  const m = modelStore.model;
  return {
    nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
    loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
    quads: modelStore.quads, plates: modelStore.plates, constraints: m.constraints,
    connectors: m.connectors, analysis: modelStore.analysis, groups: m.groups,
    loadCases: m.loadCases, combinations: modelStore.combinations,
    namedGroups: [...(m.groups?.values() ?? [])].map((g) => ({ id: g.id, name: g.name, kind: g.kind, members: g.members })),
  } as WorkbookModel;
}

/** Every solved case and combination; the single result on screen when nothing else was solved. */
function workbookSources(): WorkbookSource[] {
  const caseName = new Map(modelStore.model.loadCases.map((c) => [c.id, c.name]));
  const comboName = new Map(modelStore.combinations.map((c) => [c.id, c.name]));
  const out: WorkbookSource[] = [
    ...[...resultsStore.perCase3D].map(([id, results]) => ({ kind: 'case' as const, id, name: caseName.get(id) ?? String(id), results })),
    ...[...resultsStore.perCombo3D].map(([id, results]) => ({ kind: 'combination' as const, id, name: comboName.get(id) ?? String(id), results })),
  ];
  if (out.length === 0 && resultsStore.results3D) {
    const only = modelStore.model.loadCases[0];
    out.push({ kind: 'case', id: only?.id ?? 1, name: only?.name ?? '', results: resultsStore.results3D });
  }
  return out;
}

/** The workbook's sheets for the project as it stands. Exported for the tests. */
/** What a caller can narrow: the model's sheets, the results', and sheets of its own. */
export interface WorkbookOptions { model?: boolean; results?: boolean; extra?: readonly WorkbookSheet[] }

export function currentWorkbookSheets(stations: StationSpec, opts: WorkbookOptions = {}): WorkbookSheet[] {
  const model = workbookModel();
  const input: ProjectWorkbookInput = {
    model,
    solved: buildSolverInput3D(model, false, false, { expandMemberOffsets: false }),
    projectName: modelStore.model.name,
    projectInfo: modelStore.projectInfo,
    meta: { exported: new Date().toISOString(), commit: BUILD_COMMIT },
    results: {
      sources: workbookSources(),
      stations,
      statics: staticsRows(),
      unstable: unstableCombinations(),
      comboNames: new Map(modelStore.combinations.map((c) => [c.id, c.name])),
      deflections: elementStationDeflections,
      stressModel: (id) => {
        const e = modelStore.elements.get(id);
        const s = e && modelStore.sections.get(e.sectionId);
        return s ? sectionStressModel(s) : null;
      },
    },
    tr: t,
    include: { model: opts.model, results: opts.results },
    extra: opts.extra,
  };
  return projectWorkbookSheets(input);
}

/** One CSV per sheet, in a zip, for a workbook an xlsx file cannot hold. */
export function workbookZip(sheets: readonly WorkbookSheet[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  sheets.forEach((s, i) => {
    files[`${String(i + 1).padStart(2, '0')}-${s.name}.csv`] = strToU8(toCsv(s.rows[0]!.map(String), s.rows.slice(1)));
  });
  return zipSync(files, { level: 6 });
}

/** Write the project workbook: xlsx when it fits, a zip of CSVs otherwise. */
export async function downloadProjectWorkbook(stations: StationSpec, opts: WorkbookOptions = {}): Promise<void> {
  const safeName = modelStore.model.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, '').trim() || t('file.defaultAnalysis');
  const sheets = currentWorkbookSheets(stations, opts);
  if (fitsInXlsx(sheets)) {
    await exportToExcel({ filename: `${safeName}.xlsx`, onlyExtras: true, extraSheets: sheets });
    return;
  }
  const zip = workbookZip(sheets);
  downloadBlob(new Blob([zip as BlobPart], { type: 'application/zip' }), `${safeName}.zip`);
  uiStore.toast(t('wb.zipped'), 'info');
}
