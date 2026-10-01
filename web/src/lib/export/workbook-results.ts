/**
 * The result sheets of the project workbook: every case and every combination, in long form.
 *
 * Each row names its source (`case`, `combination`, `single` or `envelope`, its id and its name) and its place (node,
 * member end, station), so a sheet can be filtered or pivoted without a lookup. The tables are
 * the PRO result tables' (`engine/result-tables.ts`), the station forces the diagrams'
 * (`station-forces.ts`), the stresses and the deflections the ones their own tables show: the
 * workbook and the screen read the same functions.
 *
 * Signs are the solver's everywhere, which is also what the screen shows; the Conventions sheet
 * states them.
 */
import { rowsOf, summaryRows, envelopeRows, COLUMNS, type Source, type TableKind } from '../engine/result-tables';
import { stationTs, type StationSpec } from '../engine/station-forces';
import { memberStationStresses, type SectionStressModel } from '../engine/member-stresses';
import type { AnalysisResults3D, Displacement3D, ElementForces3D } from '../engine/types-3d';
import type { StaticsRows } from '../store/statics-rows';
import type { StationDeflection } from '../store/service-deflection';
import { shellCentreRows, shellCornerRows, shellNodeRows, type ShellCentreRow, type ShellModel, type FaceResult } from '../engine/shell-results';
import { safeText, type WorkbookSheet } from './workbook-cells';

/** A result source; standalone solves and envelope views use id 0, not a load-case id. */
export interface WorkbookSource { kind: 'case' | 'combination' | 'single' | 'envelope'; id: number; name: string; results: AnalysisResults3D }

export interface ResultSheetsInput {
  sources: readonly WorkbookSource[];
  stations: StationSpec;
  statics: StaticsRows | null;
  /** Combinations solved with P-Delta and left out: no second-order equilibrium at their load. */
  unstable?: readonly number[];
  /** Station deflections of one member relative to its chord (`service-deflection.ts`). */
  deflections?: (elementId: number, disp: ReadonlyMap<number, Displacement3D>, ef: ElementForces3D, ts: readonly number[]) => StationDeflection[];
  /** A member's section stress model, or null when its section cannot give one. */
  stressModel?: (elementId: number) => SectionStressModel | null;
  /** Combination names, for the unstable ones, which have no results to carry theirs. */
  comboNames?: ReadonlyMap<number, string>;
  /** The shells' geometry and thickness, for their face and global results. */
  shells?: ShellModel;
}

const UNITS: Record<TableKind, string[]> = {
  displacements: ['m', 'm', 'm', 'rad', 'rad', 'rad'],
  reactions: ['kN', 'kN', 'kN', 'kN·m', 'kN·m', 'kN·m'],
  forces: ['kN', 'kN', 'kN', 'kN·m', 'kN·m', 'kN·m'],
};
const head = (kind: TableKind) => COLUMNS[kind].map((c, i) => `${c.key === 'mx' && kind === 'forces' ? 'T' : c.label} [${UNITS[kind][i]}]`);
const SOURCE = ['source', 'sourceId', 'sourceName'];
const src = (s: WorkbookSource) => [s.kind, s.id, safeText(s.name)];

function nodeSheet(name: string, kind: 'displacements' | 'reactions', sources: readonly WorkbookSource[]): WorkbookSheet {
  const rows: WorkbookSheet['rows'] = [[...SOURCE, 'node', ...head(kind)]];
  for (const s of sources) for (const r of rowsOf(kind, s.results)) rows.push([...src(s), r.entity, ...r.values]);
  return { name, rows };
}

function endForcesSheet(sources: readonly WorkbookSource[]): WorkbookSheet {
  const rows: WorkbookSheet['rows'] = [[...SOURCE, 'member', 'end', 'x [m]', ...head('forces')]];
  for (const s of sources) for (const r of rowsOf('forces', s.results)) rows.push([...src(s), r.entity, r.end ?? '', r.x ?? 0, ...r.values]);
  return { name: 'EndForces', rows };
}

function stationsSheet(sources: readonly WorkbookSource[], stations: StationSpec): WorkbookSheet {
  const rows: WorkbookSheet['rows'] = [[...SOURCE, 'member', 'station', 'x [m]', ...head('forces')]];
  for (const s of sources) {
    let last = -1, k = 0;
    for (const r of rowsOf('forces', s.results, { stations })) {
      k = r.entity === last ? k + 1 : 1;
      last = r.entity;
      rows.push([...src(s), r.entity, k, r.x ?? 0, ...r.values]);
    }
  }
  return { name: 'Stations', rows };
}

function deflectionsSheet(input: ResultSheetsInput): WorkbookSheet | null {
  if (!input.deflections) return null;
  const rows: WorkbookSheet['rows'] = [[...SOURCE, 'member', 'station', 'x [m]', 'v [m]', 'w [m]', 'total [m]']];
  for (const s of input.sources) {
    const disp = new Map(s.results.displacements.map((d) => [d.nodeId, d]));
    for (const ef of s.results.elementForces) {
      input.deflections(ef.elementId, disp, ef, stationTs(ef, input.stations)).forEach((d, k) => rows.push([...src(s), ef.elementId, k + 1, d.x, d.v, d.w, d.total]));
    }
  }
  return { name: 'Deflections', rows };
}

function stressesSheet(input: ResultSheetsInput): WorkbookSheet | null {
  if (!input.stressModel) return null;
  const rows: WorkbookSheet['rows'] = [[...SOURCE, 'member', 'station', 'x [m]', 'sigmaMax [MPa]', 'sigmaMin [MPa]', 'basis']];
  const models = new Map<number, SectionStressModel | null>();
  for (const s of input.sources) {
    for (const ef of s.results.elementForces) {
      if (!models.has(ef.elementId)) models.set(ef.elementId, input.stressModel(ef.elementId));
      const model = models.get(ef.elementId);
      if (!model) continue;
      memberStationStresses(ef, model, input.stations).forEach((st, k) => rows.push([...src(s), ef.elementId, k + 1, st.x, st.sigmaMax, st.sigmaMin, st.basis]));
    }
  }
  return { name: 'Stresses', rows };
}


const FACE_COLS = (f: string) => [`${f}Sxx [kN/m²]`, `${f}Syy [kN/m²]`, `${f}Txy [kN/m²]`, `${f}S1 [kN/m²]`, `${f}S2 [kN/m²]`, `${f}Angle [°]`, `${f}VonMises [kN/m²]`, `${f}Tresca [kN/m²]`];
const faceCells = (f: FaceResult | undefined) => f
  ? [f.sxx, f.syy, f.txy, f.s1, f.s2, f.angleDeg, f.vonMises, f.tresca]
  : ['', '', '', '', '', '', '', ''];
const T6 = ['xx', 'yy', 'zz', 'xy', 'yz', 'zx'] as const;
const hasShells = (input: ResultSheetsInput) => input.sources.some((s) => (s.results.plateStresses?.length ?? 0) + (s.results.quadStresses?.length ?? 0) > 0);

/** The shell centres of some results, as the workbook writes them; the results panel exports the same table. */
export function shellCentreTable(sources: readonly WorkbookSource[], shells: ShellModel): WorkbookSheet {
  return shellCentresSheet({ sources, shells, stations: 2, statics: null });
}

function shellCentresSheet(input: ResultSheetsInput): WorkbookSheet {
  const rows: WorkbookSheet['rows'] = [[
    ...SOURCE, 'element', 'id', 't [m]',
    'sigmaXx [kN/m²]', 'sigmaYy [kN/m²]', 'tauXy [kN/m²]', 'mx [kN·m/m]', 'my [kN·m/m]', 'mxy [kN·m/m]', 'qx [kN/m]', 'qy [kN/m]',
    ...FACE_COLS('membrane'), ...FACE_COLS('top'), ...FACE_COLS('bottom'),
    ...T6.map((k) => `S${k.toUpperCase()} [kN/m²]`), ...T6.map((k) => `M${k.toUpperCase()} [kN·m/m]`), 'QX [kN/m]', 'QY [kN/m]', 'QZ [kN/m]',
  ]];
  const opt = (v: number | undefined) => (v === undefined ? '' : v);
  for (const s of input.sources) {
    for (const r of shellCentreRows(s.results, input.shells!)) {
      const g = r.global;
      rows.push([
        ...src(s), r.kind, r.id, r.thickness,
        r.sigmaXx, r.sigmaYy, r.tauXy, opt(r.mx), opt(r.my), opt(r.mxy), opt(r.qx), opt(r.qy),
        ...faceCells(r.membrane), ...faceCells(r.top), ...faceCells(r.bottom),
        ...T6.map((k) => (g ? g.stress[k] : '')), ...T6.map((k) => (g ? g.moment[k] : '')),
        ...(g?.shear ? g.shear : ['', '', '']),
      ]);
    }
  }
  return { name: 'ShellCentres', rows };
}

function shellNodesSheet(input: ResultSheetsInput): WorkbookSheet {
  const rows: WorkbookSheet['rows'] = [[...SOURCE, 'node', 'elements', ...T6.map((k) => `S${k.toUpperCase()} [kN/m²]`), ...T6.map((k) => `M${k.toUpperCase()} [kN·m/m]`)]];
  for (const s of input.sources) {
    for (const n of shellNodeRows(shellCentreRows(s.results, input.shells!), input.shells!)) {
      rows.push([...src(s), n.node, n.elements, ...T6.map((k) => n.stress[k]), ...T6.map((k) => n.moment[k])]);
    }
  }
  return { name: 'ShellNodes', rows };
}

function shellCornersSheet(input: ResultSheetsInput): WorkbookSheet {
  const rows: WorkbookSheet['rows'] = [[...SOURCE, 'element', 'id', 'corner', 'node', 'vonMises [kN/m²]']];
  for (const s of input.sources) for (const c of shellCornerRows(s.results, input.shells!)) rows.push([...src(s), c.kind, c.id, c.corner, c.node, c.vonMises]);
  return { name: 'ShellCorners', rows };
}

/** The shell components the maxima sheet reads, with their units. */
const SHELL_MAXIMA: Array<[string, string, (r: ShellCentreRow) => number | undefined]> = [
  ['membraneVonMises', 'kN/m²', (r) => r.membrane.vonMises], ['topVonMises', 'kN/m²', (r) => r.top?.vonMises], ['bottomVonMises', 'kN/m²', (r) => r.bottom?.vonMises],
  ['topTresca', 'kN/m²', (r) => r.top?.tresca], ['bottomTresca', 'kN/m²', (r) => r.bottom?.tresca],
  ['topS1', 'kN/m²', (r) => r.top?.s1], ['topS2', 'kN/m²', (r) => r.top?.s2],
  ['bottomS1', 'kN/m²', (r) => r.bottom?.s1], ['bottomS2', 'kN/m²', (r) => r.bottom?.s2],
  ['mx', 'kN·m/m', (r) => r.mx], ['my', 'kN·m/m', (r) => r.my], ['mxy', 'kN·m/m', (r) => r.mxy], ['qx', 'kN/m', (r) => r.qx], ['qy', 'kN/m', (r) => r.qy],
];

function shellMaximaRows(input: ResultSheetsInput): WorkbookSheet['rows'] {
  const out: WorkbookSheet['rows'] = [];
  const best = SHELL_MAXIMA.map(() => ({ max: null as null | { v: number; r: ShellCentreRow; s: WorkbookSource }, min: null as null | { v: number; r: ShellCentreRow; s: WorkbookSource } }));
  for (const s of governing(input.sources)) {
    for (const r of shellCentreRows(s.results, input.shells!)) {
      SHELL_MAXIMA.forEach(([, , get], i) => {
        const v = get(r);
        if (v === undefined || !Number.isFinite(v)) return;
        if (!best[i]!.max || v > best[i]!.max!.v) best[i]!.max = { v, r, s };
        if (!best[i]!.min || v < best[i]!.min!.v) best[i]!.min = { v, r, s };
      });
    }
  }
  SHELL_MAXIMA.forEach(([key, unit], i) => {
    for (const [extreme, e] of [['max', best[i]!.max], ['min', best[i]!.min]] as const) {
      if (e) out.push(['shells', key, unit, extreme, e.v, `${e.r.kind} ${e.r.id}`, '', '', e.s.kind, e.s.id, safeText(e.s.name)]);
    }
  });
  return out;
}

/** The sources an envelope or a maximum is taken over: the combinations, or the cases when there are none. */
function governing(sources: readonly WorkbookSource[]): WorkbookSource[] {
  const combos = sources.filter((s) => s.kind === 'combination');
  return combos.length > 0 ? combos : [...sources];
}
const asSource = (s: WorkbookSource): Source & { kind: string } => ({ id: s.id, name: s.name, results: s.results, kind: s.kind });

function maximaSheet(input: ResultSheetsInput): WorkbookSheet {
  const rows: WorkbookSheet['rows'] = [['table', 'component', 'unit', 'extreme', 'value', 'entity', 'end', 'x [m]', 'source', 'sourceId', 'sourceName']];
  const sources = governing(input.sources).map(asSource);
  for (const kind of ['reactions', 'displacements', 'forces'] as const) {
    summaryRows(kind, sources, kind === 'forces' ? { stations: input.stations } : {}).forEach((r, c) => {
      for (const [extreme, e] of [['max', r.max], ['min', r.min]] as const) {
        if (!e) continue;
        const s = e.source as Source & { kind: string };
        rows.push([kind, head(kind)[c]!.replace(/ \[.*$/, ''), UNITS[kind][c]!, extreme, e.value, e.entity, e.end ?? '', e.x ?? '', s.kind, s.id, safeText(s.name)]);
      }
    });
  }
  if (input.shells && hasShells(input)) rows.push(...shellMaximaRows(input));
  return { name: 'Maxima', rows };
}

function envelopeSheet(input: ResultSheetsInput): WorkbookSheet {
  const rows: WorkbookSheet['rows'] = [['table', 'entity', 'end', 'x [m]', 'component', 'unit', 'max', 'maxSourceId', 'maxSourceName', 'min', 'minSourceId', 'minSourceName']];
  const sources = governing(input.sources).map(asSource);
  for (const kind of ['reactions', 'displacements', 'forces'] as const) {
    for (const e of envelopeRows(kind, sources)) {
      head(kind).forEach((h, c) => {
        const mx = e.max[c]!, mn = e.min[c]!;
        rows.push([kind, e.entity, e.end ?? '', e.x ?? '', h.replace(/ \[.*$/, ''), UNITS[kind][c]!, mx.value, mx.source.id, safeText(mx.source.name), mn.value, mn.source.id, safeText(mn.source.name)]);
      });
    }
  }
  return { name: 'Envelope', rows };
}

function staticsSheet(statics: StaticsRows | null): WorkbookSheet | null {
  if (!statics) return null;
  const rows: WorkbookSheet['rows'] = [['source', 'sourceId', 'sourceName', 'component', 'unit', 'applied', 'reactions', 'residual', 'worstRelative']];
  const K = ['fx', 'fy', 'fz', 'mx', 'my', 'mz'] as const;
  const push = (kind: string, id: number | string, name: string, r: StaticsRows['cases'][number]) => {
    for (const k of K) rows.push([kind, id, safeText(name), k, k.startsWith('f') ? 'kN' : 'kN·m', r.applied[k], r.reactions[k], r.difference[k], r.worstRelative]);
  };
  for (const r of statics.cases) push(r.caseId === null ? 'single' : 'case', r.caseId ?? 0, r.caseName, r);
  for (const r of statics.combos) push('combination', r.comboId, r.caseName, r);
  return { name: 'Statics', rows };
}

function secondOrderSheet(input: ResultSheetsInput): WorkbookSheet | null {
  const solved = input.sources.filter((s) => s.results.secondOrder);
  if (solved.length === 0 && !(input.unstable?.length)) return null;
  const rows: WorkbookSheet['rows'] = [['combination', 'name', 'equilibrium', 'converged', 'iterations', 'B2']];
  for (const s of solved) {
    const so = s.results.secondOrder!;
    rows.push([s.id, safeText(s.name), 'found', so.converged ? 1 : 0, so.iterations, so.b2]);
  }
  for (const id of input.unstable ?? []) rows.push([id, safeText(input.comboNames?.get(id) ?? String(id)), 'none', 0, '', '']);
  return { name: 'SecondOrder', rows };
}

function oneWaySheet(sources: readonly WorkbookSource[]): WorkbookSheet | null {
  const with_ = sources.filter((s) => s.results.nonlinear);
  if (with_.length === 0) return null;
  const rows: WorkbookSheet['rows'] = [[...SOURCE, 'converged', 'iterations', 'slackMembers', 'liftedSupports', 'oscillating', 'signViolationMembers', 'signViolationSupports']];
  const list = (ids?: readonly number[]) => (ids ?? []).join(' ');
  for (const s of with_) {
    const n = s.results.nonlinear!;
    rows.push([...src(s), n.converged ? 1 : 0, n.iterations, list(n.slack), list(n.lifted), list(n.oscillating), list(n.signViolations?.members), list(n.signViolations?.supports)]);
  }
  return { name: 'OneWay', rows };
}

/** The result sheets, in the order the Conventions sheet lists them. */
export function resultSheets(input: ResultSheetsInput): WorkbookSheet[] {
  const all: Array<WorkbookSheet | null> = [
    nodeSheet('Reactions', 'reactions', input.sources),
    nodeSheet('Displacements', 'displacements', input.sources),
    endForcesSheet(input.sources),
    stationsSheet(input.sources, input.stations),
    deflectionsSheet(input),
    stressesSheet(input),
    maximaSheet(input),
    envelopeSheet(input),
    ...(input.shells && hasShells(input) ? [shellCentresSheet(input), shellNodesSheet(input), shellCornersSheet(input)] : []),
    staticsSheet(input.statics),
    secondOrderSheet(input),
    oneWaySheet(input.sources),
  ];
  return all.filter((s): s is WorkbookSheet => !!s);
}
