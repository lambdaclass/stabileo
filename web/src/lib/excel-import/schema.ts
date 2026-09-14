/**
 * What a Stabileo workbook contains, declared once.
 *
 * ── One table, two jobs ────────────────────────────────────────────
 *
 * The template writer and the importer both read this file. That is the whole
 * point: a column added for one is a column the other already understands, and
 * a template can never advertise a field the parser ignores. The alternative —
 * a writer and a reader that each know the format — is two formats that agree
 * until someone edits one of them.
 *
 * ── Why the headers are not translated ─────────────────────────────
 *
 * Sheet names and column keys are English and fixed. They are not labels, they
 * are the format: a workbook filled in under a Spanish interface has to open
 * under a Portuguese one, and a reader who switches language mid-project must
 * not find that yesterday's file no longer parses. The application already
 * learned this the hard way in `lib/export/excel.ts`, whose sheets carry
 * `t('excel.…')` headings — fine for a report nobody re-reads, fatal for a
 * format that round-trips.
 *
 * Readability is bought elsewhere, and more cheaply: the template's first
 * sheet explains every column in the reader's own language, and each header
 * carries its unit in brackets, which is the part people actually get wrong.
 *
 * ── Why units live in the header ───────────────────────────────────
 *
 * `x [m]`, not `x`. A spreadsheet has no type system and no tooltip; the one
 * place a unit is guaranteed to be read is next to the number being typed. The
 * parser matches on the key BEFORE the bracket, so a translator or a user can
 * decorate the rest of the cell without breaking anything.
 */

/** A column the importer knows how to read. */
export interface ColumnSpec {
  /** Stable key. Matched case-insensitively against the header, before `[`. */
  key: string;
  /** Unit shown in the header, without brackets. Empty for dimensionless. */
  unit?: string;
  /** A row missing this is an error, not a default. */
  required?: boolean;
  /** One line, in the instructions sheet. Translated at render time. */
  helpKey: string;
  /** Shown in the example row, so the shape of a valid value is visible. */
  example?: string | number;
}

export interface SheetSpec {
  /** Stable sheet name. */
  name: string;
  /** Translation key for the instruction sheet's heading. */
  titleKey: string;
  columns: ColumnSpec[];
  /** Rows that make the sheet self-explanatory when the file is opened. */
  examples: Array<Array<string | number>>;
}

/*
 * The nine load types, spelled exactly as `Load['type']` in the model.
 *
 * A single Loads sheet carries all of them rather than nine sheets, because
 * the reader's mental unit is "the loads on this structure", and because a
 * type they do not use should cost them nothing — an unused sheet is a
 * question ("do I need this?"), an unused column is whitespace.
 *
 * The price is a wide sheet where most cells are blank for any given row.
 * That is the right trade for a format people fill in by hand: blank means
 * "not applicable here", which needs no explanation, whereas nine sheets need
 * one about which to use.
 */
export const LOAD_TYPES = [
  'nodal',
  'nodal3d',
  'distributed',
  'distributed3d',
  'pointOnElement',
  'pointOnElement3d',
  'surface3d',
  'thermal',
  'thermalQuad3d',
] as const;

export type LoadTypeName = (typeof LOAD_TYPES)[number];

export const SHEETS: SheetSpec[] = [
  {
    name: 'Nodes',
    titleKey: 'xls.sheet.nodes',
    columns: [
      { key: 'id', required: true, helpKey: 'xls.col.nodeId', example: 1 },
      { key: 'x', unit: 'm', required: true, helpKey: 'xls.col.x', example: 0 },
      { key: 'y', unit: 'm', required: true, helpKey: 'xls.col.y', example: 0 },
      // Not required: a 2D model has no z, and demanding a zero would make
      // every 2D workbook carry a column of noughts to say "still flat".
      { key: 'z', unit: 'm', helpKey: 'xls.col.z', example: 0 },
    ],
    /*
     * Four nodes, not three: they close a rectangle, so the Plates and Quads
     * examples further down have real corners to point at. The template's
     * sheets have to describe ONE model — an example that references a node
     * the reader cannot see teaches the format wrong.
     */
    examples: [
      [1, 0, 0, 0],
      [2, 6, 0, 0],
      [3, 6, 4, 0],
      [4, 0, 4, 0],
    ],
  },

  {
    name: 'Members',
    titleKey: 'xls.sheet.members',
    columns: [
      { key: 'id', required: true, helpKey: 'xls.col.memberId', example: 1 },
      { key: 'type', required: true, helpKey: 'xls.col.memberType', example: 'frame' },
      { key: 'nodeI', required: true, helpKey: 'xls.col.nodeI', example: 1 },
      { key: 'nodeJ', required: true, helpKey: 'xls.col.nodeJ', example: 2 },
      { key: 'material', required: true, helpKey: 'xls.col.materialRef', example: 1 },
      { key: 'section', required: true, helpKey: 'xls.col.sectionRef', example: 1 },
      { key: 'hingeStart', helpKey: 'xls.col.hingeStart', example: 'no' },
      { key: 'hingeEnd', helpKey: 'xls.col.hingeEnd', example: 'no' },
      /*
       * `rollAngle` is per MEMBER and not per section, because members that
       * share a profile do not share an orientation — every purlin on a
       * pitched roof uses one section and each is rolled by its own slope.
       */
      { key: 'rollAngle', unit: '°', helpKey: 'xls.col.rollAngle', example: '' },
    ],
    examples: [
      [1, 'frame', 1, 2, 1, 1, 'no', 'no', ''],
      [2, 'frame', 2, 3, 1, 1, 'no', 'no', ''],
      [3, 'truss', 1, 3, 1, 2, 'no', 'no', ''],
    ],
  },

  {
    name: 'Materials',
    titleKey: 'xls.sheet.materials',
    columns: [
      { key: 'id', required: true, helpKey: 'xls.col.materialId', example: 1 },
      { key: 'name', required: true, helpKey: 'xls.col.materialName', example: 'H-25' },
      { key: 'E', unit: 'MPa', required: true, helpKey: 'xls.col.E', example: 25000 },
      { key: 'nu', required: true, helpKey: 'xls.col.nu', example: 0.2 },
      { key: 'rho', unit: 'kN/m³', helpKey: 'xls.col.rho', example: 24 },
      { key: 'fy', unit: 'MPa', helpKey: 'xls.col.fy', example: 420 },
    ],
    examples: [
      [1, 'H-25', 25000, 0.2, 24, 420],
      [2, 'Acero F-24', 200000, 0.3, 78.5, 235],
    ],
  },

  {
    name: 'Sections',
    titleKey: 'xls.sheet.sections',
    /*
     * Geometry OR properties, and the importer accepts either.
     *
     * A reader picking a rolled profile knows its name and nothing else; a
     * reader inventing a rectangle knows b and h and would have to compute A
     * and I by hand to fill this in. Requiring the properties would turn the
     * common case into arithmetic homework, so `name` alone resolves against
     * the profile catalogue, and b/h alone derive a rectangle. The explicit
     * columns stay for the case neither covers, which is a real section from
     * a supplier's table.
     */
    columns: [
      { key: 'id', required: true, helpKey: 'xls.col.sectionId', example: 1 },
      { key: 'name', required: true, helpKey: 'xls.col.sectionName', example: 'IPE 300' },
      { key: 'shape', helpKey: 'xls.col.shape', example: 'rect' },
      { key: 'b', unit: 'm', helpKey: 'xls.col.b', example: 0.2 },
      { key: 'h', unit: 'm', helpKey: 'xls.col.h', example: 0.4 },
      { key: 'A', unit: 'm²', helpKey: 'xls.col.A', example: '' },
      { key: 'Iy', unit: 'm⁴', helpKey: 'xls.col.Iy', example: '' },
      { key: 'Iz', unit: 'm⁴', helpKey: 'xls.col.Iz', example: '' },
      { key: 'J', unit: 'm⁴', helpKey: 'xls.col.J', example: '' },
    ],
    examples: [
      [1, 'Viga 20x40', 'rect', 0.2, 0.4, '', '', '', ''],
      [2, 'IPE 300', '', '', '', '', '', '', ''],
    ],
  },

  {
    name: 'Supports',
    titleKey: 'xls.sheet.supports',
    /*
     * A support is not only a type. Springs and prescribed displacements are
     * ordinary modelling — a footing on soil, a settlement to be checked —
     * and a workbook that could not carry them would send the reader back to
     * the editor to redo by hand what they had already typed.
     */
    columns: [
      { key: 'node', required: true, helpKey: 'xls.col.supportNode', example: 1 },
      { key: 'type', required: true, helpKey: 'xls.col.supportType', example: 'fixed' },
      { key: 'angle', unit: '°', helpKey: 'xls.col.supportAngle', example: '' },
      { key: 'kx', unit: 'kN/m', helpKey: 'xls.col.kx', example: '' },
      { key: 'ky', unit: 'kN/m', helpKey: 'xls.col.ky', example: '' },
      { key: 'kz', unit: 'kN/m', helpKey: 'xls.col.kz', example: '' },
      { key: 'krx', unit: 'kN·m/rad', helpKey: 'xls.col.krx', example: '' },
      { key: 'kry', unit: 'kN·m/rad', helpKey: 'xls.col.kry', example: '' },
      { key: 'krz', unit: 'kN·m/rad', helpKey: 'xls.col.krz', example: '' },
      { key: 'dx', unit: 'm', helpKey: 'xls.col.dx', example: '' },
      { key: 'dy', unit: 'm', helpKey: 'xls.col.dy', example: '' },
      { key: 'dz', unit: 'm', helpKey: 'xls.col.dz', example: '' },
    ],
    examples: [
      [1, 'fixed', '', '', '', '', '', '', '', '', '', ''],
      [2, 'pinned', '', '', '', '', '', '', '', '', '', ''],
      [3, 'spring', '', 12000, 12000, '', '', '', '', '', '', ''],
    ],
  },

  {
    name: 'LoadCases',
    titleKey: 'xls.sheet.loadCases',
    columns: [
      { key: 'id', required: true, helpKey: 'xls.col.caseId', example: 1 },
      { key: 'name', required: true, helpKey: 'xls.col.caseName', example: 'Permanente' },
      { key: 'type', helpKey: 'xls.col.caseType', example: 'D' },
    ],
    examples: [
      [1, 'Permanente', 'D'],
      [2, 'Sobrecarga', 'L'],
      [3, 'Viento', 'W'],
    ],
  },

  {
    name: 'Combinations',
    titleKey: 'xls.sheet.combinations',
    /*
     * The sheet REPLACES Basic's four defaults; leaving it empty keeps them.
     *
     * Not an accident of the loader — the rule worth having. A workbook that
     * lists its combinations is describing the whole job, and adding four
     * unrelated ones underneath would leave the reader deleting our
     * combinations out of their model every time they import. A workbook that
     * says nothing about them has no opinion, so the defaults stand.
     *
     * `loadFixture` already works this way for every bundled example, which
     * is what makes it predictable: a spreadsheet and an example behave the
     * same, and the same is true of the LoadCases sheet.
     */

    /*
     * One row per (combination, case) pair, not a column per case.
     *
     * A column per case reads better for the three cases a small job has and
     * stops working the moment there are twenty — the sheet grows sideways
     * and every new case edits the header. Long form grows downward, which is
     * the direction a spreadsheet is good at, and it is what the model holds:
     * `LoadCombination.factors` is exactly this list of pairs.
     */
    columns: [
      { key: 'combination', required: true, helpKey: 'xls.col.comboName', example: '1.2D+1.6L' },
      { key: 'case', required: true, helpKey: 'xls.col.comboCase', example: 1 },
      { key: 'factor', required: true, helpKey: 'xls.col.comboFactor', example: 1.2 },
    ],
    examples: [
      ['1.2D+1.6L', 1, 1.2],
      ['1.2D+1.6L', 2, 1.6],
      ['1.2D+1.0W', 1, 1.2],
      ['1.2D+1.0W', 3, 1.0],
    ],
  },

  {
    name: 'Plates',
    titleKey: 'xls.sheet.plates',
    /*
     * Three or four node ids per shell, in one cell, separated by anything
     * that is not a digit. A column per corner would have needed two sheets —
     * triangles and quads — for one idea, and the reader would have had to
     * know which.
     */
    columns: [
      { key: 'id', required: true, helpKey: 'xls.col.plateId', example: 1 },
      { key: 'nodes', required: true, helpKey: 'xls.col.plateNodes', example: '1 2 3' },
      { key: 'material', required: true, helpKey: 'xls.col.materialRef', example: 1 },
      { key: 'thickness', unit: 'm', required: true, helpKey: 'xls.col.thickness', example: 0.15 },
    ],
    examples: [[1, '1 2 3', 1, 0.15]],
  },

  {
    name: 'Quads',
    titleKey: 'xls.sheet.quads',
    columns: [
      { key: 'id', required: true, helpKey: 'xls.col.quadId', example: 1 },
      { key: 'nodes', required: true, helpKey: 'xls.col.quadNodes', example: '1 2 3 4' },
      { key: 'material', required: true, helpKey: 'xls.col.materialRef', example: 1 },
      { key: 'thickness', unit: 'm', required: true, helpKey: 'xls.col.thickness', example: 0.15 },
    ],
    examples: [[1, '1 2 3 4', 1, 0.15]],
  },

  {
    name: 'Constraints',
    titleKey: 'xls.sheet.constraints',
    /*
     * A rigid diaphragm or a link between nodes. `master` plus a list of
     * slaves covers the diaphragm; `nodeI`/`nodeJ` covers a link. Both are
     * accepted and the type says which is being described, because the
     * alternative was a sheet per constraint kind for what a reader thinks of
     * as one table.
     */
    columns: [
      { key: 'type', required: true, helpKey: 'xls.col.constraintType', example: 'rigidDiaphragm' },
      { key: 'master', helpKey: 'xls.col.constraintMaster', example: 1 },
      { key: 'slaves', helpKey: 'xls.col.constraintSlaves', example: '2 3 4' },
      { key: 'nodeI', helpKey: 'xls.col.nodeI', example: '' },
      { key: 'nodeJ', helpKey: 'xls.col.nodeJ', example: '' },
    ],
    examples: [['rigidDiaphragm', 1, '2 3', '', '']],
  },

  {
    name: 'Loads',
    titleKey: 'xls.sheet.loads',
    columns: [
      { key: 'type', required: true, helpKey: 'xls.col.loadType', example: 'nodal' },
      { key: 'case', required: true, helpKey: 'xls.col.loadCase', example: 1 },
      { key: 'node', helpKey: 'xls.col.loadNode', example: '' },
      { key: 'member', helpKey: 'xls.col.loadMember', example: '' },
      { key: 'fx', unit: 'kN', helpKey: 'xls.col.fx', example: '' },
      { key: 'fy', unit: 'kN', helpKey: 'xls.col.fy', example: '' },
      { key: 'fz', unit: 'kN', helpKey: 'xls.col.fz', example: '' },
      { key: 'mx', unit: 'kN·m', helpKey: 'xls.col.mx', example: '' },
      { key: 'my', unit: 'kN·m', helpKey: 'xls.col.my', example: '' },
      { key: 'mz', unit: 'kN·m', helpKey: 'xls.col.mz', example: '' },
      { key: 'qi', unit: 'kN/m', helpKey: 'xls.col.qi', example: '' },
      { key: 'qj', unit: 'kN/m', helpKey: 'xls.col.qj', example: '' },
      // qZ for distributed3d only — qi/qj carry qY. Two more columns rather
      // than overloading the first two, so a 2D row reads exactly as before.
      { key: 'qzi', unit: 'kN/m', helpKey: 'xls.col.qzi', example: '' },
      { key: 'qzj', unit: 'kN/m', helpKey: 'xls.col.qzj', example: '' },
      { key: 'dir', helpKey: 'xls.col.dir', example: '' },
      { key: 'P', unit: 'kN', helpKey: 'xls.col.P', example: '' },
      { key: 'a', unit: 'm', helpKey: 'xls.col.a', example: '' },
      { key: 'dT', unit: '°C', helpKey: 'xls.col.dT', example: '' },
      { key: 'dTg', unit: '°C', helpKey: 'xls.col.dTg', example: '' },
    ],
    examples: [
      ['nodal', 1, 3, '', 0, -20, '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['distributed', 1, '', 2, '', '', '', '', '', '', -10, -10, '', '', 'global', '', '', '', ''],
      ['pointOnElement', 2, '', 2, '', '', '', '', '', '', '', '', '', '', '', -35, 2.5, '', ''],
      ['thermal', 3, '', 1, '', '', '', '', '', '', '', '', '', '', '', '', '', 20, 0],
      /*
       * Two 3D rows, because the sheet has columns that only a 3D load type
       * ever reads — `mx`, `my`, `qzi`, `qzj` — and without an example they
       * were four headers a reader could fill in and watch do nothing. The
       * importer read them the whole time; the template simply never showed
       * how. A format people learn by opening the template has to
       * demonstrate every column it offers.
       */
      ['nodal3d', 1, 3, '', 0, 0, -15, 4, 2, 0, '', '', '', '', '', '', '', '', ''],
      ['distributed3d', 1, '', 2, '', '', '', '', '', '', -8, -8, -3, -3, 'global', '', '', '', ''],
    ],
  },
];

/** The sheet a reader sees first. Not data — prose, in their language. */
export const INSTRUCTIONS_SHEET = 'Instrucciones';

/** Look a sheet up by its stable name. */
export function sheetSpec(name: string): SheetSpec | undefined {
  return SHEETS.find((s) => s.name.toLowerCase() === name.trim().toLowerCase());
}

/**
 * The header a column is written with: `qi [kN/m]`.
 *
 * Parsing goes the other way and keeps only what precedes the bracket, so the
 * unit is decoration on the way out and ignored on the way in. That asymmetry
 * is deliberate: it lets the template become clearer over time — a longer
 * unit, a note in the cell — without invalidating a single file anyone has
 * already filled in.
 */
export function headerFor(col: ColumnSpec): string {
  return col.unit ? `${col.key} [${col.unit}]` : col.key;
}

/** The key a header cell refers to, or null if it names nothing we know. */
export function keyFromHeader(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const base = header.split('[')[0].trim().toLowerCase();
  return base.length > 0 ? base : null;
}
