/**
 * The project workbook: a cover, the conventions, the model and every result, one sheet each.
 *
 * Pure: the store part (`store/project-workbook.ts`) gathers the model and the results and
 * writes the file. Sheet names and column keys are English and fixed, as the importer's are
 * (`excel-import/schema.ts`), because they are a format; the cover's and the conventions' text is
 * in the reader's language.
 */
import type { SolverInput3D } from '../engine/types-3d';
import type { ProjectInfo } from '../model/project-info';
import { currentRevision } from '../model/project-info';
import { modelSheets, type WorkbookModel } from './workbook-model';
import { resultSheets, type ResultSheetsInput } from './workbook-results';
import { safeText, type WorkbookSheet } from './workbook-cells';

export interface ProjectWorkbookInput {
  model: WorkbookModel;
  /** The input the engine was given, for the properties and restraints as solved. */
  solved: SolverInput3D | null;
  projectName: string;
  projectInfo?: ProjectInfo | null;
  /** When it was written (ISO 8601) and from which build. */
  meta: { exported: string; commit: string };
  results: ResultSheetsInput;
  /** Translation, for the cover's and the conventions' text. */
  tr: (key: string) => string;
  /** The model's sheets and the results', each included unless false. */
  include?: { model?: boolean; results?: boolean };
  /** Further sheets, appended as they are (a report's verification, its story drift). */
  extra?: readonly WorkbookSheet[];
}

function coverSheet(input: ProjectWorkbookInput): WorkbookSheet {
  const { tr } = input;
  const info = input.projectInfo ?? {};
  const rev = currentRevision(info);
  const combos = input.results.sources.filter((s) => s.kind === 'combination').length + (input.results.unstable?.length ?? 0);
  const rows: WorkbookSheet['rows'] = [['field', 'value']];
  const add = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== '') rows.push([tr(`wb.cover.${key}`), typeof value === 'string' ? safeText(value) : value]);
  };
  add('project', input.projectName);
  add('client', info.client);
  add('job', info.job);
  add('jobNumber', info.jobNumber);
  add('site', info.site);
  add('revision', rev ? `${rev.code} (${rev.date})` : undefined);
  add('designer', info.designer?.name);
  add('checker', info.checker?.name);
  add('approver', info.approver?.name);
  add('exported', input.meta.exported);
  add('build', input.meta.commit);
  add('units', 'm, kN, kN·m, MPa, rad, °C');
  add('stations', input.results.stations === 'critical' ? tr('wb.cover.stationsCritical') : tr('wb.cover.stationsEqual').replace('{n}', String(input.results.stations)));
  add('cases', input.model.loadCases.length);
  add('combinations', combos);
  for (const c of input.model.loadCases) rows.push([`${tr('wb.cover.case')} ${c.id}`, safeText(`${c.name} (${c.type})`)]);
  return { name: 'Cover', rows };
}

/** The conventions, one statement per row. Keys `wb.conv.*`, in the order a reader needs them. */
const CONVENTIONS = [
  'axes', 'localAxes', 'sources', 'selfWeight', 'units', 'displacements', 'reactions', 'memberForces', 'stations', 'deflections',
  'stresses', 'shells', 'shellFaces', 'shellNodes', 'envelope', 'maxima', 'statics', 'secondOrder', 'oneWay', 'cables', 'model', 'specifications', 'text', 'precision',
] as const;

function conventionsSheet(tr: (key: string) => string): WorkbookSheet {
  return { name: 'Conventions', rows: [['topic', 'convention'], ...CONVENTIONS.map((k) => [k, safeText(tr(`wb.conv.${k}`))])] };
}

/** Every sheet of the workbook, in order. */
export function projectWorkbookSheets(input: ProjectWorkbookInput): WorkbookSheet[] {
  return [
    coverSheet(input), conventionsSheet(input.tr),
    ...(input.include?.model === false ? [] : modelSheets(input.model, input.solved)),
    ...(input.include?.results === false ? [] : resultSheets(input.results)),
    ...(input.extra ?? []),
  ];
}
