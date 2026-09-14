/**
 * The raw forces report, assembled.
 *
 * ── What it is ─────────────────────────────────────────────────────
 *
 * `lib/flow/rc-forces-report.ts` decides WHAT a configuration may ask for and why; this file
 * answers it against a solve. Everything it emits comes from `AnalysisResults3D` or from
 * `station-forces.ts` evaluating the engine's own diagrams. Nothing is invented, nothing is
 * capacity, nothing is steel.
 *
 * ── One set of tables, three ways out ──────────────────────────────
 *
 * XLSX and the printable report consume the SAME `sheets`. That is the rule `DocumentsSection`
 * already enforces on the detailing exports through `currentDoc()`, applied here: two builders
 * would let a spreadsheet and a printout disagree about a number, and there is no way for a
 * reader to tell which one is wrong.
 *
 * ── What the scope narrows, and what it must not ───────────────────
 *
 * `elements` narrows member tables. It does NOT narrow reactions — the contract says so, and the
 * reason is that a support reaction is a property of the whole model: filtering it by a member
 * selection produces a table that does not balance, which looks like a solver defect.
 *
 * Displacements ARE narrowed, to the nodes of the selected members. That is not the same
 * exception: a nodal displacement is a local answer, and the nodes of the members you asked
 * about are the ones that describe them. It is stated on the sheet so the reader knows the list
 * is not every node in the model.
 *
 * ── Blocks ─────────────────────────────────────────────────────────
 *
 * Every table is written per BLOCK, where a block is one combination when combinations have been
 * solved, and the single unnamed result set when they have not. It is the first column of every
 * sheet rather than one sheet per combination, because a fabricator sorting a spreadsheet wants
 * one table, and because thirty combinations would otherwise be thirty tabs.
 *
 * ── Precision is per magnitude, not global ─────────────────────────
 *
 * Rounding forces and displacements to the same number of decimals makes one of them wrong: 3
 * decimals on kN is more than anybody needs and 3 decimals on metres of deflection is zero. The
 * per-column precision is declared beside the column.
 */

import type { AnalysisResults3D } from './types-3d';
import {
  buildCriticalStations, extractForcesAtStation, type StationForces,
} from './station-forces';
import {
  RC_FORCES_SECTIONS, rcResolveStations, rcForcesSheets,
  type RcForcesMagnitude, type RcForcesReportConfig, type RcForcesSection,
} from '../flow/rc-forces-report';

type Translate = (key: string) => string;
type Cell = string | number;

/** One result set the tables are written for. `label` is empty for an un-combined solve. */
export interface ForcesBlock {
  label: string;
  results: AnalysisResults3D;
}

/** What the builder needs. Nothing here is a store: the caller decides what "current" means. */
export interface ForcesReportSource {
  /** The result set on screen. Used when no combinations have been solved. */
  results: AnalysisResults3D;
  /** Solved combinations, by id, in the order they should be reported. */
  perCombo: ReadonlyMap<number, AnalysisResults3D>;
  /** Combination names, by id. A missing name falls back to the id. */
  comboNames: ReadonlyMap<number, string>;
  /** Which nodes belong to which element, for narrowing displacements. */
  elementNodes: ReadonlyMap<number, readonly number[]>;
}

export interface ForcesSheet {
  section: RcForcesSection;
  /** The sheet's tab name. Already clamped to what a workbook accepts. */
  name: string;
  /** A sentence under the heading saying what the table does and does not cover. */
  note: string;
  /** Header row followed by data rows. */
  aoa: Cell[][];
}

export interface ForcesReportDocument {
  sheets: ForcesSheet[];
  /** What the report covers, in words. Printed on every output. */
  scopeLine: string;
  /** Which station convention produced the `stations` sheet, said out loud. */
  stationNote: string;
  /** What this document is not. Never omitted — see `FORCES_REPORT_IS_NOT`. */
  limitations: string[];
  /** Element ids actually reported, ascending. Empty means the whole model. */
  elementIds: number[];
}

/**
 * What a raw forces report is not, as i18n keys.
 *
 * Carried on the document and printed on every export, for the same reason `EXPORT_CANNOT_ASSERT`
 * exists: a table of moments beside a project name looks like a calculation report, and §5 is
 * explicit that this document is neither a design nor construction documentation. Saying so is
 * one line; not saying so is a reader assuming the opposite.
 */
export const FORCES_REPORT_IS_NOT: readonly string[] = [
  'design.forcesReport.isNot.design',
  'design.forcesReport.isNot.construction',
  'design.forcesReport.isNot.verified',
] as const;

/** Excel refuses sheet names over 31 characters. */
const SHEET_NAME_MAX = 31;

const SECTION_LABEL: Record<RcForcesSection, string> = {
  reactions: 'design.forcesReport.sheet.reactions',
  displacements: 'design.forcesReport.sheet.displacements',
  elementForces: 'design.forcesReport.sheet.elementForces',
  stations: 'design.forcesReport.sheet.stations',
  rawStations: 'design.forcesReport.sheet.rawStations',
};

const SECTION_NOTE: Record<RcForcesSection, string> = {
  reactions: 'design.forcesReport.note.reactions',
  displacements: 'design.forcesReport.note.displacements',
  elementForces: 'design.forcesReport.note.elementForces',
  stations: 'design.forcesReport.note.stations',
  rawStations: 'design.forcesReport.note.rawStations',
};

/** Column heading and decimals for each station magnitude. Units are in the heading. */
const MAGNITUDE_COLUMN: Record<RcForcesMagnitude, { head: string; digits: number }> = {
  n:       { head: 'N (kN)',      digits: 3 },
  vy:      { head: 'Vy (kN)',     digits: 3 },
  vz:      { head: 'Vz (kN)',     digits: 3 },
  my:      { head: 'My (kN·m)',   digits: 3 },
  mz:      { head: 'Mz (kN·m)',   digits: 3 },
  torsion: { head: 'T (kN·m)',    digits: 3 },
};

const round = (v: number, digits: number) => Number.isFinite(v) ? +v.toFixed(digits) : 0;

/**
 * The result sets to tabulate.
 *
 * `comboIds === null` means every solved combination; a list means those, in the list's order,
 * skipping ids that were not solved rather than emitting an empty block for them. With no
 * combinations solved at all there is one block and it carries no label — inventing a name like
 * "Combination 1" for a single un-combined solve would be a claim about the load case.
 */
export function forcesBlocks(cfg: RcForcesReportConfig, src: ForcesReportSource): ForcesBlock[] {
  if (src.perCombo.size === 0) return [{ label: '', results: src.results }];
  const ids = cfg.comboIds === null ? [...src.perCombo.keys()] : cfg.comboIds;
  const out: ForcesBlock[] = [];
  for (const id of ids) {
    const results = src.perCombo.get(id);
    if (!results) continue;
    out.push({ label: src.comboNames.get(id) ?? String(id), results });
  }
  return out;
}

/** The member ids in scope, ascending. Empty array means "every member". */
function scopeElementIds(cfg: RcForcesReportConfig): number[] {
  if (cfg.scope.kind === 'model') return [];
  return [...new Set(cfg.scope.elementIds)].sort((a, b) => a - b);
}

/** The nodes the scoped members touch. Empty set when the scope is the whole model. */
function scopeNodeIds(elementIds: number[], src: ForcesReportSource): Set<number> | null {
  if (elementIds.length === 0) return null;
  const out = new Set<number>();
  for (const id of elementIds) for (const n of src.elementNodes.get(id) ?? []) out.add(n);
  return out;
}

function reactionRows(blocks: ForcesBlock[], t: Translate): Cell[][] {
  const rows: Cell[][] = [[
    t('design.forcesReport.col.block'), t('design.forcesReport.col.node'),
    'Fx (kN)', 'Fy (kN)', 'Fz (kN)', 'Mx (kN·m)', 'My (kN·m)', 'Mz (kN·m)',
  ]];
  for (const b of blocks) {
    for (const r of b.results.reactions) {
      rows.push([
        b.label, r.nodeId,
        round(r.fx, 3), round(r.fy, 3), round(r.fz, 3),
        round(r.mx, 3), round(r.my, 3), round(r.mz, 3),
      ]);
    }
  }
  return rows;
}

function displacementRows(
  blocks: ForcesBlock[], nodes: Set<number> | null, t: Translate,
): Cell[][] {
  const rows: Cell[][] = [[
    t('design.forcesReport.col.block'), t('design.forcesReport.col.node'),
    'ux (m)', 'uy (m)', 'uz (m)', 'rx (rad)', 'ry (rad)', 'rz (rad)',
  ]];
  for (const b of blocks) {
    for (const d of b.results.displacements) {
      if (nodes && !nodes.has(d.nodeId)) continue;
      rows.push([
        b.label, d.nodeId,
        round(d.ux, 6), round(d.uy, 6), round(d.uz, 6),
        round(d.rx, 6), round(d.ry, 6), round(d.rz, 6),
      ]);
    }
  }
  return rows;
}

/**
 * End forces, both ends, every magnitude.
 *
 * `magnitudes` deliberately does NOT filter here. The contract defines it as "which columns the
 * STATION tables carry", and end forces are the members' boundary conditions: a set of end
 * forces missing its axial column cannot be checked for equilibrium, which is the first thing
 * anybody does with this table.
 */
function elementForceRows(blocks: ForcesBlock[], ids: number[], t: Translate): Cell[][] {
  const want = ids.length > 0 ? new Set(ids) : null;
  const rows: Cell[][] = [[
    t('design.forcesReport.col.block'), t('design.forcesReport.col.element'), 'L (m)',
    'N i (kN)', 'N j (kN)', 'Vy i (kN)', 'Vy j (kN)', 'Vz i (kN)', 'Vz j (kN)',
    'T i (kN·m)', 'T j (kN·m)', 'My i (kN·m)', 'My j (kN·m)', 'Mz i (kN·m)', 'Mz j (kN·m)',
  ]];
  for (const b of blocks) {
    for (const ef of b.results.elementForces) {
      if (want && !want.has(ef.elementId)) continue;
      rows.push([
        b.label, ef.elementId, round(ef.length, 4),
        round(ef.nStart, 3), round(ef.nEnd, 3),
        round(ef.vyStart, 3), round(ef.vyEnd, 3),
        round(ef.vzStart, 3), round(ef.vzEnd, 3),
        round(ef.mxStart, 3), round(ef.mxEnd, 3),
        round(ef.myStart, 3), round(ef.myEnd, 3),
        round(ef.mzStart, 3), round(ef.mzEnd, 3),
      ]);
    }
  }
  return rows;
}

/**
 * Station rows.
 *
 * `raw` is what makes `rawStations` a section of its own rather than an alternative to
 * `stations`: with `raw` the stations are always the ones the engine built, whatever
 * `stationMode` says. That is the rule the contract's header calls the one that outranks both
 * modes — choosing the quarter convention must never be what hides a critical station.
 */
function stationRows(
  blocks: ForcesBlock[], ids: number[], cfg: RcForcesReportConfig, raw: boolean, t: Translate,
): Cell[][] {
  const want = ids.length > 0 ? new Set(ids) : null;
  const mags = cfg.magnitudes;
  const rows: Cell[][] = [[
    t('design.forcesReport.col.block'), t('design.forcesReport.col.element'),
    't', 'x (m)', ...mags.map((m) => MAGNITUDE_COLUMN[m].head),
  ]];
  for (const b of blocks) {
    for (const ef of b.results.elementForces) {
      if (want && !want.has(ef.elementId)) continue;
      const critical = buildCriticalStations(ef);
      const ts = raw ? critical : rcResolveStations(cfg.stationMode, critical);
      for (const tv of ts) {
        const s: StationForces = extractForcesAtStation(ef, tv);
        rows.push([
          b.label, ef.elementId, round(s.t, 4), round(s.x, 4),
          ...mags.map((m) => round(s[m], MAGNITUDE_COLUMN[m].digits)),
        ]);
      }
    }
  }
  return rows;
}

/** Sheet names, clamped to the workbook limit and de-duplicated by suffix. */
function sheetName(base: string, taken: Set<string>): string {
  let name = base.slice(0, SHEET_NAME_MAX);
  let i = 2;
  while (taken.has(name)) {
    const suffix = ` ${i++}`;
    name = base.slice(0, SHEET_NAME_MAX - suffix.length) + suffix;
  }
  taken.add(name);
  return name;
}

/**
 * Build the whole document.
 *
 * Sections come out in `RC_FORCES_SECTIONS` order regardless of the order they were asked for,
 * via `rcForcesSheets` — two configurations requesting the same sheets produce the same workbook.
 * A section that yields no data rows still produces its sheet, with its header and its note: an
 * absent tab reads as "not requested", and an empty one reads as "requested, and there was
 * nothing", which are different answers.
 */
export function buildForcesReport(
  cfg: RcForcesReportConfig, src: ForcesReportSource, t: Translate,
): ForcesReportDocument {
  const blocks = forcesBlocks(cfg, src);
  const ids = scopeElementIds(cfg);
  const nodes = scopeNodeIds(ids, src);
  const taken = new Set<string>();

  const sheets: ForcesSheet[] = rcForcesSheets(cfg).map((section) => {
    const aoa =
      section === 'reactions' ? reactionRows(blocks, t)
      : section === 'displacements' ? displacementRows(blocks, nodes, t)
      : section === 'elementForces' ? elementForceRows(blocks, ids, t)
      : stationRows(blocks, ids, cfg, section === 'rawStations', t);
    return {
      section,
      name: sheetName(t(SECTION_LABEL[section]), taken),
      note: t(SECTION_NOTE[section]),
      aoa,
    };
  });

  const scopeLine = ids.length === 0
    ? t('design.forcesReport.scope.model')
    : `${t('design.forcesReport.scope.elements')}: ${ids.join(', ')}`;

  return {
    sheets,
    scopeLine,
    stationNote: cfg.stationMode === 'quarters'
      ? t('design.forcesReport.stations.quarters')
      : t('design.forcesReport.stations.critical'),
    limitations: FORCES_REPORT_IS_NOT.map((k) => t(k)),
    elementIds: ids,
  };
}

/** Every section, for callers that want to offer the full list in a stable order. */
export const FORCES_REPORT_SECTIONS = RC_FORCES_SECTIONS;
