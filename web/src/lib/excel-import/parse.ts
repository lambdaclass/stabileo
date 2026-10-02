/**
 * A workbook becomes a `JSONModel`, and nothing else.
 *
 * ── Why it stops there ─────────────────────────────────────────────
 *
 * `JSONModel` is the shape every bundled example already has, and
 * `loadFixture` is the one path that turns one into a live model — hinges,
 * load cases, combinations, the lot. An importer that built a snapshot by hand
 * would be a SECOND loader, and the two would agree until the day the model
 * grew a field. So this file does the part that is genuinely new — reading a
 * grid a human typed — and hands the result to the loader the examples use.
 *
 * The practical dividend is that a workbook and a fixture are the same thing
 * by the time anyone downstream sees them, so a bug can only be in the
 * reading.
 *
 * ── Rows fail, files do not ────────────────────────────────────────
 *
 * A spreadsheet filled in by hand has typos in it. Refusing the whole file for
 * one bad cell means the reader fixes one mistake per import and learns about
 * the next one on the following attempt — for a 200-node frame that is an
 * afternoon. Every row is read independently, every failure names its sheet,
 * its row number and what it wanted, and the import returns both the model and
 * the list. The caller decides whether a partial model is worth loading; this
 * file's job is to make that decision possible rather than to make it.
 *
 * Row numbers are the ones Excel shows — header is row 1, first data row is 2
 * — because a diagnostic the reader cannot find is not a diagnostic.
 */

import type { JSONModel } from '../templates/load-fixture';
import { profileByName as catalogueProfile, profileToSectionFull } from '../data/steel-profiles';
import { t, tp } from '../i18n';
import { SHEETS, sheetSpec, keyFromHeader, LOAD_TYPES, type LoadTypeName } from './schema';

/**
 * A catalogue profile by the name a person would write.
 *
 * Case and inner spacing are forgiven — `IPE300`, `ipe 300` and `IPE  300` are
 * one profile, and telling somebody their section does not exist because they
 * omitted a space would be a lie about the catalogue. Nothing else is
 * normalised: `IPE 300` and `IPE 330` are different sections and a reader who
 * typed the wrong one wants to hear about it. The IFC and DXF importers use the
 * same matcher, so the three agree on what a name means.
 */
function profileByName(name: string): ReturnType<typeof profileToSectionFull> | null {
  const hit = catalogueProfile(name);
  return hit ? profileToSectionFull(hit) : null;
}

/*
 * ── Units in the header are read, not decoration ───────────────────
 *
 * The template writes `x [m]`, and a reader who works in millimetres will write
 * `x [mm]` and type 6000. That header used to be split at the bracket and the
 * unit thrown away, so the portal came in six kilometres wide. The bracket is
 * now read: a unit the table below knows is converted to the one the format
 * stores, and one it does not know leaves the column out with a line in the
 * report, because reading 6000 as metres is the one outcome worse than not
 * reading it.
 *
 * Keys are normalised: lower case, no spaces, `·` for any product sign, and
 * the superscripts as digits.
 */
const UNIT_FACTORS: Record<string, Record<string, number>> = {
  'm': { m: 1, cm: 0.01, mm: 0.001, metro: 1, metros: 1, meter: 1, meters: 1, metre: 1, metres: 1 },
  'mm': { mm: 1, cm: 10, m: 1000 },
  'kn': { kn: 1, n: 0.001, mn: 1000, tf: 9.80665, kgf: 0.00980665 },
  'kn/m': { 'kn/m': 1, 'n/m': 0.001, 'n/mm': 1, 'kn/mm': 1000, 'tf/m': 9.80665, 'kgf/m': 0.00980665 },
  'kn·m': { 'kn·m': 1, knm: 1, 'n·m': 0.001, nm: 0.001, 'n·mm': 1e-6, 'kn·mm': 0.001, 'tf·m': 9.80665, tfm: 9.80665 },
  'kn·m/rad': { 'kn·m/rad': 1, 'kn·m': 1, 'knm/rad': 1, 'n·m/rad': 0.001, 'n·mm/rad': 1e-6, 'kn·mm/rad': 0.001 },
  'mpa': { mpa: 1, 'n/mm2': 1, gpa: 1000, kpa: 0.001, 'kn/m2': 0.001, pa: 1e-6, 'kgf/cm2': 0.0980665 },
  // Weight per volume. A mass density (7850 kg/m³) is the same number of kgf.
  'kn/m3': { 'kn/m3': 1, 'n/m3': 0.001, 'kgf/m3': 0.00980665, 'kg/m3': 0.00980665, 'tf/m3': 9.80665 },
  '°': { '°': 1, deg: 1, grados: 1, grado: 1, graus: 1, grau: 1, degrees: 1, rad: 180 / Math.PI },
  // A temperature difference: a kelvin and a degree Celsius are the same step.
  '°c': { '°c': 1, c: 1, k: 1 },
};

function unitKey(u: string): string {
  return u.replace(/º/g, '°').normalize('NFKC').replace(/\s+/g, '').toLowerCase()
    .replace(/(?<=[a-z°])[*.×\-](?=[a-z])/g, '·');
}

/** The unit a header states in brackets, or null when it states none. */
function unitFromHeader(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const m = header.match(/\[([^\]]*)\]/);
  return m && m[1]!.trim() !== '' ? m[1]!.trim() : null;
}

/** The factor that turns `given` into `wanted`, 1 when they are the same, null when unknown. */
function unitFactor(wanted: string, given: string): number | null {
  const w = unitKey(wanted), g = unitKey(given);
  if (w === g) return 1;
  return UNIT_FACTORS[w]?.[g] ?? null;
}

export interface RowProblem {
  sheet: string;
  /** As shown in Excel: 1 is the header. */
  row: number;
  column?: string;
  message: string;
}

export interface ParseResult {
  model: JSONModel;
  problems: RowProblem[];
  /** Sheets present in the file that the format does not define. */
  unknownSheets: string[];
  /** How many rows each sheet contributed, for the report. */
  counts: Record<string, number>;
}

/** A sheet read into `{key: value}` rows, with its Excel row number kept. */
interface Row {
  n: number;
  cells: Record<string, unknown>;
}

const EMPTY_MODEL = (): JSONModel => ({
  name: t('xls.importedName'),
  materials: [], sections: [], nodes: [], elements: [], supports: [],
  loads: [], plates: [], quads: [], constraints: [], loadCases: [], combinations: [],
});

/** `true` for anything a person means by "yes" in a spreadsheet. */
function truthy(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v !== 'string') return false;
  return ['si', 'sí', 'yes', 'y', 'true', 'verdadero', 'x', '1'].includes(v.trim().toLowerCase());
}

/**
 * A number, or null — and a comma is a decimal point.
 *
 * A Spanish-locale spreadsheet exports `1,25`, and `Number('1,25')` is NaN. A
 * reader who typed a perfectly ordinary number should not be told their file
 * is malformed because of a separator their own operating system chose.
 */
function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/\s/g, '');
  if (s === '') return null;
  const n = Number(s.includes(',') && !s.includes('.') ? s.replace(',', '.') : s);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

/*
 * The support types the store accepts (model.svelte.ts), minus `custom3d`,
 * which a single cell cannot describe. Matched case-insensitively and written
 * back in canonical casing, so "rollerx" imports and "rollerX" is what the
 * solver sees.
 */
const SUPPORT_TYPES = [
  'fixed', 'pinned', 'rollerX', 'rollerY', 'rollerZ', 'spring',
  'fixed3d', 'pinned3d', 'rollerXZ', 'rollerXY', 'rollerYZ', 'spring3d',
] as const;

/*
 * Load types the format knows but cannot deliver yet, with the reason a
 * reader can act on. Kept out of the "unknown type" error on purpose: the
 * type EXISTS in the model, the import path is what is missing, and those
 * are different conversations to have with a spreadsheet.
 */
const NOT_IMPORTABLE: Record<string, () => string> = {
  pointOnElement3d: () => t('xls.err.pointOnElement3d'),
  /* The format has a Quads sheet; what it lacks is a column on Loads that names the shell. */
  surface3d: () => tp('xls.err.quadLoad', { v: 'surface3d' }),
  thermalQuad3d: () => tp('xls.err.quadLoad', { v: 'thermalQuad3d' }),
};

/** Rows of a sheet, keyed by the columns the format knows. Blank rows dropped. */
function readSheet(aoa: unknown[][], sheetName: string, problems: RowProblem[]): Row[] {
  if (aoa.length === 0) return [];
  const header = aoa[0] ?? [];
  const keyAt = header.map(keyFromHeader);

  const spec = sheetSpec(sheetName);
  /** Per column: the factor to the format's unit, or null to leave the column out. */
  const factorAt: Array<number | null> = keyAt.map(() => 1);
  if (spec) {
    const known = new Set(spec.columns.map((c) => c.key.toLowerCase()));
    keyAt.forEach((k, c) => {
      if (!k) return;
      if (!known.has(k)) {
        problems.push({ sheet: sheetName, row: 1, column: k, message: tp('xls.err.unknownColumn', { k }) });
        return;
      }
      const want = spec.columns.find((col) => col.key.toLowerCase() === k)!.unit;
      const given = unitFromHeader(header[c]);
      if (!want || !given) return;
      const f = unitFactor(want, given);
      factorAt[c] = f;
      if (f === null) {
        problems.push({ sheet: sheetName, row: 1, column: k, message: tp('xls.err.unitUnknown', { k, u: given, want }) });
      }
    });
  }

  const rows: Row[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const raw = aoa[i] ?? [];
    const cells: Record<string, unknown> = {};
    let any = false;
    for (let c = 0; c < keyAt.length; c++) {
      const k = keyAt[c];
      if (!k) continue;
      const v = raw[c];
      if (v !== undefined && v !== null && String(v).trim() !== '') any = true;
      const f = factorAt[c];
      if (f === null) continue;
      const n = f === 1 ? null : num(v);
      cells[k] = n === null ? v : n * f;
    }
    if (any) rows.push({ n: i + 1, cells });
  }
  return rows;
}

/** Pull a required number, recording the problem and returning null on failure. */
function reqNum(row: Row, key: string, sheet: string, problems: RowProblem[]): number | null {
  const v = num(row.cells[key]);
  if (v === null) {
    problems.push({ sheet, row: row.n, column: key, message: tp('xls.err.missingNumber', { k: key }) });
    return null;
  }
  return v;
}

function reqStr(row: Row, key: string, sheet: string, problems: RowProblem[]): string | null {
  const v = str(row.cells[key]);
  if (v === '') {
    problems.push({ sheet, row: row.n, column: key, message: tp('xls.err.missing', { k: key }) });
    return null;
  }
  return v;
}

/**
 * The first row each id was seen on, and a problem for any later row that repeats it.
 *
 * A repeated id used to be taken twice: the loader gives every row a new id, so two nodes
 * numbered 3 both came in, and the members that named node 3 went to whichever was mapped last.
 */
function idGuard(sheet: string, problems: RowProblem[]) {
  const first = new Map<number, number>();
  return (id: number, row: Row, message = 'xls.err.duplicateId'): boolean => {
    const seen = first.get(id);
    if (seen !== undefined) {
      problems.push({ sheet, row: row.n, message: tp(message, { id, first: seen }) });
      return false;
    }
    first.set(id, row.n);
    return true;
  };
}

/**
 * Turn the sheets of a workbook into a model.
 *
 * `sheets` is the workbook already converted to arrays-of-arrays, one entry per
 * sheet — the caller owns the xlsx module so this file stays pure and can be
 * tested without loading it.
 */
export function parseWorkbook(sheets: Record<string, unknown[][]>): ParseResult {
  const problems: RowProblem[] = [];
  const model = EMPTY_MODEL();
  const counts: Record<string, number> = {};

  const defined = new Set(SHEETS.map((s) => s.name.toLowerCase()));
  const unknownSheets = Object.keys(sheets).filter(
    (n) => !defined.has(n.trim().toLowerCase()) && n.trim().toLowerCase() !== 'instrucciones',
  );

  /** Find a sheet by the format's name, whatever case the file used. */
  const grab = (name: string): unknown[][] => {
    const hit = Object.keys(sheets).find((k) => k.trim().toLowerCase() === name.toLowerCase());
    return hit ? sheets[hit] : [];
  };

  /*
   * ── Nodes: Z is the vertical, in 2-D and in 3-D alike ──────────────
   *
   * X is horizontal, Y is the plan depth a 3-D model needs, Z is the height.
   * That is what the viewport's axis labels say, what the results export
   * writes — `createNodesSheet` heads its 2-D column `Z (m)` — and now what the
   * template asks for. It was the one surface still asking for the height in Y,
   * because Y is where a flat model STORES it: `projectNodeToScene` renders that
   * y as scene Z and `shouldProjectModelToXZ` requires z ≈ 0 to recognise the
   * model as flat at all. The storage is not what a reader filling in a
   * spreadsheet should have to know.
   *
   * The convention is chosen for the whole Nodes sheet: when every Y is blank,
   * Z supplies the flat model's height. Any explicit Y selects native XYZ for
   * every row, with missing coordinates filled as zero. A row with neither Y
   * nor Z is invalid; a nonempty coordinate must be numeric.
   */
  const nodeRows = readSheet(grab('Nodes'), 'Nodes', problems);
  // Choose one coordinate convention for the sheet. Any stated Y (including zero)
  // makes it native XYZ; blank Y cells in that model mean zero, not a rotated node.
  const flatFromZ = nodeRows.every((row) => str(row.cells.y) === '');
  const firstNode = idGuard('Nodes', problems);
  for (const row of nodeRows) {
    const id = reqNum(row, 'id', 'Nodes', problems);
    const x = reqNum(row, 'x', 'Nodes', problems);
    const yCell = num(row.cells.y);
    const zCell = num(row.cells.z);
    if (id === null || x === null) continue;
    let invalidCoordinate = false;
    for (const key of ['y', 'z'] as const) {
      if (str(row.cells[key]) !== '' && num(row.cells[key]) === null) {
        problems.push({ sheet: 'Nodes', row: row.n, column: key, message: t('xls.err.notANumber') });
        invalidCoordinate = true;
      }
    }
    if (invalidCoordinate) continue;
    if (yCell === null && zCell === null) {
      problems.push({ sheet: 'Nodes', row: row.n, column: 'z', message: t('xls.err.noPosition') });
      continue;
    }
    if (!firstNode(id, row)) continue;
    /* Flat: the height was given as Z, which is what it is called everywhere
       else. It is stored where a flat model keeps its height. */
    model.nodes.push({
      id, x,
      y: flatFromZ ? (zCell ?? 0) : (yCell ?? 0),
      z: flatFromZ ? 0 : (zCell ?? 0),
    });
  }
  counts.Nodes = model.nodes.length;

  // ── Materials ────────────────────────────────────────────────────
  const firstMaterial = idGuard('Materials', problems);
  for (const row of readSheet(grab('Materials'), 'Materials', problems)) {
    const id = reqNum(row, 'id', 'Materials', problems);
    const name = reqStr(row, 'name', 'Materials', problems);
    const e = reqNum(row, 'e', 'Materials', problems);
    const nu = reqNum(row, 'nu', 'Materials', problems);
    if (id === null || name === null || e === null || nu === null) continue;
    if (!firstMaterial(id, row)) continue;
    /* Optional and concrete-only: an omitted cell means "not stated", which
       the design surface reports as an explicit assumption rather than a
       silent default — the same contract the Materials panel has. */
    const dAgg = num(row.cells.dagg);
    const margin = num(row.cells.spacingmargin);
    model.materials.push({
      id, name, e, nu,
      rho: num(row.cells.rho) ?? 0,
      fy: num(row.cells.fy) ?? undefined,
      ...(dAgg !== null ? { maxAggregateSizeMm: dAgg } : {}),
      ...(margin !== null ? { spacingMarginMm: margin } : {}),
    });
  }
  counts.Materials = model.materials.length;

  // ── Sections ─────────────────────────────────────────────────────
  /*
   * Geometry is enough. A reader who writes b and h for a rectangle should not
   * also have to write A and I — the arithmetic is ours to do, and asking for
   * it invites the transcription error the importer exists to avoid. Explicit
   * properties win when both are given, because a supplier's table beats our
   * idealisation of their profile.
   */
  const firstSection = idGuard('Sections', problems);
  for (const row of readSheet(grab('Sections'), 'Sections', problems)) {
    const id = reqNum(row, 'id', 'Sections', problems);
    const name = reqStr(row, 'name', 'Sections', problems);
    if (id === null || name === null) continue;
    if (!firstSection(id, row)) continue;

    let b = num(row.cells.b);
    let h = num(row.cells.h);
    let a = num(row.cells.a);
    let iz = num(row.cells.iz);
    let iy = num(row.cells.iy);
    let j = num(row.cells.j);
    let shape = str(row.cells.shape) || undefined;
    let tw: number | undefined;
    let tf: number | undefined;
    let tt: number | undefined;

    /*
     * Three ways to describe a section, in order of what the reader knows.
     *
     * A rolled profile is known by its NAME and nothing else — nobody carries
     * the inertia of an IPE 300 in their head, and making them look it up is
     * the transcription error this importer exists to remove. So the name is
     * tried against the catalogue first, and it brings the web and flange
     * thicknesses and the tabulated J with it, which no hand-entered row
     * would have supplied.
     *
     * Then geometry: b and h give a rectangle by arithmetic that is ours to do.
     *
     * Explicit properties always win, because a supplier's table beats both
     * our catalogue and our idealisation of their profile.
     */
    const fromCatalogue = profileByName(name);
    if (fromCatalogue) {
      a ??= fromCatalogue.a;
      iz ??= fromCatalogue.iz;
      iy ??= fromCatalogue.iy;
      j ??= fromCatalogue.j ?? null;
      b ??= fromCatalogue.b;
      h ??= fromCatalogue.h;
      shape ??= fromCatalogue.shape;
      tw = fromCatalogue.tw;
      tf = fromCatalogue.tf;
      tt = fromCatalogue.t;
    }

    if (a === null && b !== null && h !== null) a = b * h;
    if (iz === null && b !== null && h !== null) iz = (b * h ** 3) / 12;
    if (iy === null && b !== null && h !== null) iy = (h * b ** 3) / 12;

    if (a === null || iz === null) {
      problems.push({ sheet: 'Sections', row: row.n, message: tp('xls.err.sectionUnknown', { name }) });
      continue;
    }
    model.sections.push({
      id, name, a, iz,
      iy: iy ?? undefined, j: j ?? undefined,
      b: b ?? undefined, h: h ?? undefined,
      shape, tw, tf, t: tt,
    });
  }
  counts.Sections = model.sections.length;

  // ── Members ──────────────────────────────────────────────────────
  const nodeIds = new Set(model.nodes.map((n) => n.id));
  const matIds = new Set(model.materials.map((m) => m.id));
  const secIds = new Set(model.sections.map((s) => s.id));

  const firstMember = idGuard('Members', problems);
  for (const row of readSheet(grab('Members'), 'Members', problems)) {
    const id = reqNum(row, 'id', 'Members', problems);
    const nodeI = reqNum(row, 'nodei', 'Members', problems);
    const nodeJ = reqNum(row, 'nodej', 'Members', problems);
    const materialId = reqNum(row, 'material', 'Members', problems);
    const sectionId = reqNum(row, 'section', 'Members', problems);
    if (id === null || nodeI === null || nodeJ === null || materialId === null || sectionId === null) continue;

    /*
     * References are checked here rather than left to the loader, because at
     * this point we can still say WHICH row is wrong. Downstream the row is
     * gone and the only honest message would be "a member points at a node
     * that is not there".
     */
    const missing: string[] = [];
    if (!nodeIds.has(nodeI)) missing.push(`nodeI=${nodeI}`);
    if (!nodeIds.has(nodeJ)) missing.push(`nodeJ=${nodeJ}`);
    if (!matIds.has(materialId)) missing.push(`material=${materialId}`);
    if (!secIds.has(sectionId)) missing.push(`section=${sectionId}`);
    if (missing.length) {
      problems.push({ sheet: 'Members', row: row.n, message: tp('xls.err.missingRefs', { list: missing.join(', ') }) });
      continue;
    }

    /*
     * The type is an enum, not a default. Anything that is not "truss" used
     * to become a frame silently — and "trus" is exactly the typo a
     * spreadsheet is going to contain. A member read with the wrong stiffness
     * is the failure this file exists to catch, so the row fails instead.
     */
    const rawType = str(row.cells.type).toLowerCase();
    if (rawType !== 'frame' && rawType !== 'truss') {
      problems.push({ sheet: 'Members', row: row.n, column: 'type', message: tp('xls.err.memberType', { v: str(row.cells.type) }) });
      continue;
    }
    if (!firstMember(id, row)) continue;
    model.elements.push({
      id, type: rawType, nodeI, nodeJ, materialId, sectionId,
      hingeStart: truthy(row.cells.hingestart),
      hingeEnd: truthy(row.cells.hingeend),
      ...(num(row.cells.rollangle) !== null ? { rollAngle: num(row.cells.rollangle)! } : {}),
    });
  }
  counts.Members = model.elements.length;

  // ── Supports ─────────────────────────────────────────────────────
  /*
   * The type is checked against the store's own set, case-insensitively —
   * and this is the check the whole file exists for. The solver's restraint
   * switch ends in `default: return false`, so an unrecognised type is a
   * support that restrains NOTHING: "Fixed" with a capital, or "empotrado"
   * from someone working in the Spanish UI, imports as a mechanism with the
   * report saying success. `custom3d` is refused rather than misread: its
   * restraints live in per-DOF fields a single cell cannot carry.
   */
  let supportId = 1;
  // One support per node: a second row for the same node used to add a second support there.
  const firstSupport = idGuard('Supports', problems);
  for (const row of readSheet(grab('Supports'), 'Supports', problems)) {
    const nodeId = reqNum(row, 'node', 'Supports', problems);
    const type = reqStr(row, 'type', 'Supports', problems);
    if (nodeId === null || type === null) continue;
    if (!nodeIds.has(nodeId)) {
      problems.push({ sheet: 'Supports', row: row.n, message: tp('xls.err.nodeMissing', { id: nodeId }) });
      continue;
    }
    if (type.toLowerCase() === 'custom3d') {
      problems.push({ sheet: 'Supports', row: row.n, column: 'type', message: t('xls.err.custom3d') });
      continue;
    }
    const canonical = SUPPORT_TYPES.find((s) => s.toLowerCase() === type.toLowerCase());
    if (!canonical) {
      problems.push({
        sheet: 'Supports', row: row.n, column: 'type',
        message: tp('xls.err.supportType', { v: type, list: SUPPORT_TYPES.join(', ') }),
      });
      continue;
    }
    if (!firstSupport(nodeId, row, 'xls.err.supportDuplicate')) continue;
    /*
     * Only the springs and displacements the reader actually filled in. A
     * blank cell means "not applicable", and writing zeros for the rest
     * would turn every pinned support into one restrained by zero-stiffness
     * springs — the solver would take that literally.
     *
     * These ride ALONGSIDE the validated type rather than instead of it:
     * the type says which degrees of freedom are held, the springs say how
     * softly. Dropping the validation to make room for them is how a typo
     * in `type` would have reached the solver as a silent free node.
     */
    const extra: Record<string, number> = {};
    for (const k of ['angle', 'kx', 'ky', 'kz', 'krx', 'kry', 'krz', 'dx', 'dy', 'dz']) {
      const v = num(row.cells[k.toLowerCase()]);
      if (v !== null) extra[k] = v;
    }
    model.supports.push({ id: supportId++, nodeId, type: canonical, ...extra });
  }
  counts.Supports = model.supports.length;

  // ── Load cases ───────────────────────────────────────────────────
  const firstCase = idGuard('LoadCases', problems);
  for (const row of readSheet(grab('LoadCases'), 'LoadCases', problems)) {
    const id = reqNum(row, 'id', 'LoadCases', problems);
    const name = reqStr(row, 'name', 'LoadCases', problems);
    if (id === null || name === null) continue;
    if (!firstCase(id, row)) continue;
    model.loadCases.push({ id, name, type: str(row.cells.type) || 'D' });
  }
  counts.LoadCases = model.loadCases.length;

  // ── Combinations ─────────────────────────────────────────────────
  /*
   * Long form in, grouped form out. The sheet has one row per (combination,
   * case) pair so it can grow downward; the model wants one entry per
   * combination carrying its factors. The grouping key is the NAME, which is
   * what the reader typed and the only thing tying two rows together.
   */
  const caseIds = new Set(model.loadCases.map((c) => c.id));
  const byName = new Map<string, Array<{ caseId: number; factor: number }>>();
  const order: string[] = [];
  for (const row of readSheet(grab('Combinations'), 'Combinations', problems)) {
    const name = reqStr(row, 'combination', 'Combinations', problems);
    const caseId = reqNum(row, 'case', 'Combinations', problems);
    const factor = reqNum(row, 'factor', 'Combinations', problems);
    if (name === null || caseId === null || factor === null) continue;
    if (!caseIds.has(caseId)) {
      problems.push({ sheet: 'Combinations', row: row.n, message: tp('xls.err.caseMissing', { id: caseId }) });
      continue;
    }
    if (!byName.has(name)) { byName.set(name, []); order.push(name); }
    byName.get(name)!.push({ caseId, factor });
  }
  order.forEach((name, i) => {
    model.combinations.push({ id: i + 1, name, factors: byName.get(name)! });
  });
  counts.Combinations = model.combinations.length;

  // ── Shells ───────────────────────────────────────────────────────
  /**
   * Node ids out of one cell.
   *
   * Split on anything that is not a digit, so `1 2 3`, `1,2,3` and `1-2-3`
   * all work. A reader typing a list into a spreadsheet cell has no reason
   * to know which separator we chose, and refusing three of the four they
   * might reach for would be a rule with nothing behind it.
   */
  const nodeList = (v: unknown): number[] =>
    String(v ?? '').split(/[^0-9]+/).filter(Boolean).map(Number);

  /*
   * The Plates sheet takes three or four corners, as its help says; the model's plate is a
   * triangle. A four-node row used to go to `addPlate`, which kept the first three corners and
   * solved a triangle where the reader drew a rectangle. It is a quad, and becomes one.
   */
  const plates = model.plates as unknown as Array<Record<string, unknown>>;
  const quads = model.quads as unknown as Array<Record<string, unknown>>;
  const quadsFromPlates: Array<Record<string, unknown>> = [];
  const shellSheets: Array<{ sheet: string; want: number[] }> = [
    { sheet: 'Plates', want: [3, 4] },
    { sheet: 'Quads', want: [4] },
  ];
  for (const { sheet, want } of shellSheets) {
    const firstShell = idGuard(sheet, problems);
    let taken = 0;
    for (const row of readSheet(grab(sheet), sheet, problems)) {
      const id = reqNum(row, 'id', sheet, problems);
      const materialId = reqNum(row, 'material', sheet, problems);
      const thickness = reqNum(row, 'thickness', sheet, problems);
      const nodes = nodeList(row.cells.nodes);
      if (id === null || materialId === null || thickness === null) continue;
      if (!want.includes(nodes.length)) {
        problems.push({
          sheet, row: row.n, column: 'nodes',
          message: tp('xls.err.shellNodeCount', { want: want.join(` ${t('xls.err.or')} `), n: nodes.length }),
        });
        continue;
      }
      const repeated = nodes.find((n, i) => nodes.indexOf(n) !== i);
      if (repeated !== undefined) {
        problems.push({ sheet, row: row.n, column: 'nodes', message: tp('xls.err.shellRepeated', { id: repeated }) });
        continue;
      }
      const missing = nodes.filter((n) => !nodeIds.has(n));
      if (missing.length) {
        problems.push({ sheet, row: row.n, message: tp('xls.err.nodesMissing', { list: missing.join(', ') }) });
        continue;
      }
      if (!matIds.has(materialId)) {
        problems.push({ sheet, row: row.n, message: tp('xls.err.materialMissing', { id: materialId }) });
        continue;
      }
      if (!firstShell(id, row)) continue;
      taken++;
      /* `curved` exists on quads only — a triangle has no fourth node to
         leave the plane, so the column is not on the Plates sheet and an
         absent cell is simply flat. */
      const shell = { id, nodes, materialId, thickness, ...(truthy(row.cells.curved) ? { curved: true } : {}) };
      if (sheet === 'Quads') quads.push(shell);
      else if (nodes.length === 4) quadsFromPlates.push(shell);
      else plates.push(shell);
    }
    counts[sheet] = taken;
  }
  // Their own ids, after the Quads sheet's: the two sheets number independently.
  let nextQuad = Math.max(0, ...quads.map((q) => q.id as number)) + 1;
  for (const q of quadsFromPlates) quads.push({ ...q, id: nextQuad++ });

  // ── Constraints ──────────────────────────────────────────────────
  /*
   * Written in the engine's own shape. The rows used to be copied as typed, so the template's
   * `rigidDiaphragm` reached the solver as a type it does not know, and a link came as
   * `nodeI`/`nodeJ` where the engine reads `masterNode`/`slaveNode`: the solve failed with a
   * raw parse error. `rigidDiaphragm` stays accepted for the files already filled in.
   */
  const CONSTRAINT_TYPES: Record<string, 'diaphragm' | 'rigidLink'> = {
    diaphragm: 'diaphragm', rigiddiaphragm: 'diaphragm', rigidlink: 'rigidLink',
  };
  for (const row of readSheet(grab('Constraints'), 'Constraints', problems)) {
    const type = reqStr(row, 'type', 'Constraints', problems);
    if (type === null) continue;
    const master = num(row.cells.master);
    const slaves = nodeList(row.cells.slaves);
    const nI = num(row.cells.nodei);
    const nJ = num(row.cells.nodej);

    /*
     * Two shapes share this sheet: a diaphragm is a master plus slaves, a
     * link is a pair. Neither is a superset of the other, so the row is
     * rejected only when it describes neither.
     */
    const kind = CONSTRAINT_TYPES[type.toLowerCase()];
    if (!kind) {
      problems.push({ sheet: 'Constraints', row: row.n, column: 'type', message: tp('xls.err.constraintType', { v: type }) });
      continue;
    }
    const referenced = [master, nI, nJ].filter((n): n is number => n !== null).concat(slaves);
    if (referenced.length === 0) {
      problems.push({ sheet: 'Constraints', row: row.n, message: t('xls.err.constraintNoNodes') });
      continue;
    }
    const missing = referenced.filter((n) => !nodeIds.has(n));
    if (missing.length) {
      problems.push({
        sheet: 'Constraints', row: row.n,
        message: tp('xls.err.nodesMissing', { list: [...new Set(missing)].join(', ') }),
      });
      continue;
    }
    if (kind === 'diaphragm') {
      const slaveNodes = slaves.filter((n) => n !== master);
      if (master === null || slaveNodes.length === 0) {
        problems.push({ sheet: 'Constraints', row: row.n, message: t('xls.err.diaphragmNeeds') });
        continue;
      }
      model.constraints.push({ type: 'diaphragm', masterNode: master, slaveNodes });
    } else {
      // A link from master to each slave, or the nodeI–nodeJ pair.
      const from = master ?? nI;
      const to = master !== null ? (slaves.length ? slaves : nJ !== null ? [nJ] : []) : nJ !== null ? [nJ] : [];
      const pairs = to.filter((n) => n !== from);
      if (from === null || pairs.length === 0) {
        problems.push({ sheet: 'Constraints', row: row.n, message: t('xls.err.linkNeeds') });
        continue;
      }
      for (const slaveNode of pairs) model.constraints.push({ type: 'rigidLink', masterNode: from, slaveNode });
    }
  }
  counts.Constraints = model.constraints.length;

  // ── Loads ────────────────────────────────────────────────────────
  const elemIds = new Set(model.elements.map((e) => e.id));
  let loadId = 1;
  for (const row of readSheet(grab('Loads'), 'Loads', problems)) {
    const rawType = str(row.cells.type);
    const type = LOAD_TYPES.find((t) => t.toLowerCase() === rawType.toLowerCase()) as
      | LoadTypeName
      | undefined;
    if (!type) {
      problems.push({
        sheet: 'Loads', row: row.n, column: 'type',
        message: tp('xls.err.loadType', { v: rawType, list: LOAD_TYPES.join(', ') }),
      });
      continue;
    }
    const caseId = reqNum(row, 'case', 'Loads', problems);
    if (caseId === null) continue;
    if (caseIds.size > 0 && !caseIds.has(caseId)) {
      problems.push({ sheet: 'Loads', row: row.n, message: tp('xls.err.caseMissing', { id: caseId }) });
      continue;
    }

    /*
     * Three of the nine types are refused by name rather than misread.
     * `loadFixture` has no case for `pointOnElement3d` (the fixture API never
     * bound `addPointLoadOnElement3D`), so the row would vanish between parse
     * and store; and the two quad loads have no Quads sheet to point at.
     * A row that cannot survive the trip must say so here, while it still
     * has a number.
     */
    const notImportable = NOT_IMPORTABLE[type];
    if (notImportable) {
      problems.push({ sheet: 'Loads', row: row.n, column: 'type', message: notImportable() });
      continue;
    }

    const nodeId = num(row.cells.node);
    const elementId = num(row.cells.member);
    const wantsNode = type.startsWith('nodal');
    const target = wantsNode ? nodeId : elementId;
    const targetSet = wantsNode ? nodeIds : elemIds;
    if (target === null) {
      problems.push({
        sheet: 'Loads', row: row.n,
        message: tp(wantsNode ? 'xls.err.loadNeedsNode' : 'xls.err.loadNeedsMember', { v: type }),
      });
      continue;
    }
    if (!targetSet.has(target)) {
      problems.push({ sheet: 'Loads', row: row.n, message: tp(wantsNode ? 'xls.err.nodeMissing' : 'xls.err.memberMissing', { id: target }) });
      continue;
    }

    /*
     * The keys written here are the ones `loadFixture` reads — its switch is
     * the contract, not the column names. The first draft wrote `m` where the
     * loader reads `my`, `deltaT` where it reads `dtUniform`, `qI`/`qJ` where
     * the 3D arm reads `qYI`…`qZJ`, and a `direction` string the loader never
     * looks at: every one of those rows imported "successfully" with its
     * values gone. The parse tests now assert the loader's keys, and the
     * round-trip test asserts a value out the far side.
     */
    const n = (k: string) => num(row.cells[k]) ?? 0;
    const data: Record<string, unknown> = { id: loadId++, caseId };
    if (wantsNode) {
      Object.assign(data, { nodeId: target, fx: n('fx'), fy: n('fy'), fz: n('fz') });
      if (type === 'nodal3d') Object.assign(data, { mx: n('mx'), my: n('my'), mz: n('mz') });
      else {
        /*
         * The 2D wire plane is x–z: vertical is fz, and the loader's 2D arm
         * reads only fz. A reader who thinks in x–y writes their gravity
         * load in fy — the store itself forgives exactly this elsewhere
         * (canonicalLoadFz is `fz ?? fy ?? 0`), so the column is honoured
         * here the same way rather than dropped.
         */
        const fz2d = num(row.cells.fz) ?? num(row.cells.fy) ?? 0;
        Object.assign(data, { fz: fz2d, my: n('mz') });
      }
    } else {
      data.elementId = target;
      if (type === 'distributed') {
        Object.assign(data, { qI: n('qi'), qJ: n('qj') });
        /*
         * `dir` is `isGlobal`, the only two values the model has. Anything
         * else fails the row: silently importing a "global" load as local is
         * right for a horizontal beam and wrong for anything inclined, with
         * no sign of which happened.
         */
        const dir = str(row.cells.dir).toLowerCase();
        if (dir === 'global') data.isGlobal = true;
        else if (dir !== '' && dir !== 'local') {
          problems.push({
            sheet: 'Loads', row: row.n, column: 'dir',
            message: tp('xls.err.dirUnknown', { v: str(row.cells.dir), list: 'global, local' }),
          });
          continue;
        }
      } else if (type === 'distributed3d') {
        /*
         * qi/qj carry qY, qzi/qzj carry qZ, along the axes `dir` names: the member's own (local,
         * the default), the global ones per metre of member (global), or the global ones per
         * metre of plan (projected). The template's own example said `global` and the row came
         * in local, which is right for a horizontal beam and wrong for everything else.
         */
        const dir = str(row.cells.dir).toLowerCase();
        if (dir !== '' && dir !== 'local' && dir !== 'global' && dir !== 'projected') {
          problems.push({
            sheet: 'Loads', row: row.n, column: 'dir',
            message: tp('xls.err.dirUnknown', { v: str(row.cells.dir), list: 'local, global, projected' }),
          });
          continue;
        }
        Object.assign(data, { qYI: n('qi'), qYJ: n('qj'), qZI: n('qzi'), qZJ: n('qzj') });
        if (dir === 'global' || dir === 'projected') data.frame = dir;
      } else if (type === 'pointOnElement') {
        Object.assign(data, { p: n('p'), a: n('a') });
      } else if (type === 'thermal') {
        Object.assign(data, { dtUniform: n('dt'), dtGradient: n('dtg') });
      }
    }
    model.loads.push({ type, data });
  }
  counts.Loads = model.loads.length;

  return { model, problems, unknownSheets, counts };
}
