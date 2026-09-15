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
import { ALL_PROFILES, profileToSectionFull } from '../data/steel-profiles';
import { SHEETS, sheetSpec, keyFromHeader, LOAD_TYPES, type LoadTypeName } from './schema';

/**
 * A catalogue profile by the name a person would write.
 *
 * Case and inner spacing are forgiven — `IPE300`, `ipe 300` and `IPE  300` are
 * one profile, and telling somebody their section does not exist because they
 * omitted a space would be a lie about the catalogue. Nothing else is
 * normalised: `IPE 300` and `IPE 330` are different sections and a reader who
 * typed the wrong one wants to hear about it.
 */
function profileByName(name: string): ReturnType<typeof profileToSectionFull> | null {
  const want = name.replace(/\s+/g, '').toLowerCase();
  const hit = ALL_PROFILES.find((p) => p.name.replace(/\s+/g, '').toLowerCase() === want);
  return hit ? profileToSectionFull(hit) : null;
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
  name: 'Importado de Excel',
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
const NOT_IMPORTABLE = {
  pointOnElement3d:
    '"pointOnElement3d" todavía no es importable: el cargador de modelos no lo conecta',
  surface3d:
    '"surface3d" carga sobre quads, y el formato no tiene hoja de quads todavía',
  thermalQuad3d:
    '"thermalQuad3d" carga sobre quads, y el formato no tiene hoja de quads todavía',
} as const;

/** Rows of a sheet, keyed by the columns the format knows. Blank rows dropped. */
function readSheet(aoa: unknown[][], sheetName: string, problems: RowProblem[]): Row[] {
  if (aoa.length === 0) return [];
  const header = aoa[0] ?? [];
  const keyAt = header.map(keyFromHeader);

  const spec = sheetSpec(sheetName);
  if (spec) {
    const known = new Set(spec.columns.map((c) => c.key.toLowerCase()));
    for (const k of keyAt) {
      if (k && !known.has(k)) {
        problems.push({
          sheet: sheetName, row: 1, column: k,
          message: `columna desconocida "${k}" — se ignora`,
        });
      }
    }
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
      cells[k] = v;
    }
    if (any) rows.push({ n: i + 1, cells });
  }
  return rows;
}

/** Pull a required number, recording the problem and returning null on failure. */
function reqNum(row: Row, key: string, sheet: string, problems: RowProblem[]): number | null {
  const v = num(row.cells[key]);
  if (v === null) {
    problems.push({ sheet, row: row.n, column: key, message: `falta un número en "${key}"` });
    return null;
  }
  return v;
}

function reqStr(row: Row, key: string, sheet: string, problems: RowProblem[]): string | null {
  const v = str(row.cells[key]);
  if (v === '') {
    problems.push({ sheet, row: row.n, column: key, message: `falta "${key}"` });
    return null;
  }
  return v;
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

  // ── Nodes ────────────────────────────────────────────────────────
  for (const row of readSheet(grab('Nodes'), 'Nodes', problems)) {
    const id = reqNum(row, 'id', 'Nodes', problems);
    const x = reqNum(row, 'x', 'Nodes', problems);
    const y = reqNum(row, 'y', 'Nodes', problems);
    if (id === null || x === null || y === null) continue;
    model.nodes.push({ id, x, y, z: num(row.cells.z) ?? 0 });
  }
  counts.Nodes = model.nodes.length;

  // ── Materials ────────────────────────────────────────────────────
  for (const row of readSheet(grab('Materials'), 'Materials', problems)) {
    const id = reqNum(row, 'id', 'Materials', problems);
    const name = reqStr(row, 'name', 'Materials', problems);
    const e = reqNum(row, 'e', 'Materials', problems);
    const nu = reqNum(row, 'nu', 'Materials', problems);
    if (id === null || name === null || e === null || nu === null) continue;
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
  for (const row of readSheet(grab('Sections'), 'Sections', problems)) {
    const id = reqNum(row, 'id', 'Sections', problems);
    const name = reqStr(row, 'name', 'Sections', problems);
    if (id === null || name === null) continue;

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
      problems.push({
        sheet: 'Sections', row: row.n,
        message:
          `"${name}": no está en el catálogo de perfiles; ` +
          'poné b y h, o bien A e Iz',
      });
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
      problems.push({
        sheet: 'Members', row: row.n,
        message: `no existe: ${missing.join(', ')}`,
      });
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
      problems.push({
        sheet: 'Members', row: row.n, column: 'type',
        message: `tipo "${str(row.cells.type)}" desconocido — válidos: frame, truss`,
      });
      continue;
    }
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
  for (const row of readSheet(grab('Supports'), 'Supports', problems)) {
    const nodeId = reqNum(row, 'node', 'Supports', problems);
    const type = reqStr(row, 'type', 'Supports', problems);
    if (nodeId === null || type === null) continue;
    if (!nodeIds.has(nodeId)) {
      problems.push({ sheet: 'Supports', row: row.n, message: `no existe el nodo ${nodeId}` });
      continue;
    }
    if (type.toLowerCase() === 'custom3d') {
      problems.push({
        sheet: 'Supports', row: row.n, column: 'type',
        message: '"custom3d" necesita restricciones por GDL que una celda no puede expresar',
      });
      continue;
    }
    const canonical = SUPPORT_TYPES.find((s) => s.toLowerCase() === type.toLowerCase());
    if (!canonical) {
      problems.push({
        sheet: 'Supports', row: row.n, column: 'type',
        message: `tipo "${type}" desconocido — v\u00e1lidos: ${SUPPORT_TYPES.join(', ')}`,
      });
      continue;
    }
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
  for (const row of readSheet(grab('LoadCases'), 'LoadCases', problems)) {
    const id = reqNum(row, 'id', 'LoadCases', problems);
    const name = reqStr(row, 'name', 'LoadCases', problems);
    if (id === null || name === null) continue;
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
      problems.push({ sheet: 'Combinations', row: row.n, message: `no existe el estado ${caseId}` });
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

  const shellSheets: Array<{ sheet: string; target: Array<Record<string, unknown>>; want: number[] }> = [
    { sheet: 'Plates', target: model.plates as unknown as Array<Record<string, unknown>>, want: [3, 4] },
    { sheet: 'Quads', target: model.quads as unknown as Array<Record<string, unknown>>, want: [4] },
  ];
  for (const { sheet, target, want } of shellSheets) {
    for (const row of readSheet(grab(sheet), sheet, problems)) {
      const id = reqNum(row, 'id', sheet, problems);
      const materialId = reqNum(row, 'material', sheet, problems);
      const thickness = reqNum(row, 'thickness', sheet, problems);
      const nodes = nodeList(row.cells.nodes);
      if (id === null || materialId === null || thickness === null) continue;
      if (!want.includes(nodes.length)) {
        problems.push({
          sheet, row: row.n, column: 'nodes',
          message: `necesita ${want.join(' o ')} nodos y tiene ${nodes.length}`,
        });
        continue;
      }
      const missing = nodes.filter((n) => !nodeIds.has(n));
      if (missing.length) {
        problems.push({ sheet, row: row.n, message: `no existen los nodos: ${missing.join(', ')}` });
        continue;
      }
      if (!matIds.has(materialId)) {
        problems.push({ sheet, row: row.n, message: `no existe el material ${materialId}` });
        continue;
      }
      /* `curved` exists on quads only — a triangle has no fourth node to
         leave the plane, so the column is not on the Plates sheet and an
         absent cell is simply flat. */
      target.push({ id, nodes, materialId, thickness, ...(truthy(row.cells.curved) ? { curved: true } : {}) });
    }
    counts[sheet] = target.length;
  }

  // ── Constraints ──────────────────────────────────────────────────
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
    const referenced = [master, nI, nJ].filter((n): n is number => n !== null).concat(slaves);
    if (referenced.length === 0) {
      problems.push({ sheet: 'Constraints', row: row.n, message: 'no nombra ningún nodo' });
      continue;
    }
    const missing = referenced.filter((n) => !nodeIds.has(n));
    if (missing.length) {
      problems.push({
        sheet: 'Constraints', row: row.n,
        message: `no existen los nodos: ${[...new Set(missing)].join(', ')}`,
      });
      continue;
    }
    model.constraints.push({
      type,
      ...(master !== null ? { masterNode: master } : {}),
      ...(slaves.length ? { slaveNodes: slaves } : {}),
      ...(nI !== null ? { nodeI: nI } : {}),
      ...(nJ !== null ? { nodeJ: nJ } : {}),
    });
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
        message: `tipo "${rawType}" desconocido — válidos: ${LOAD_TYPES.join(', ')}`,
      });
      continue;
    }
    const caseId = reqNum(row, 'case', 'Loads', problems);
    if (caseId === null) continue;
    if (caseIds.size > 0 && !caseIds.has(caseId)) {
      problems.push({ sheet: 'Loads', row: row.n, message: `no existe el estado ${caseId}` });
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
    const notImportable = NOT_IMPORTABLE[type as keyof typeof NOT_IMPORTABLE];
    if (notImportable) {
      problems.push({ sheet: 'Loads', row: row.n, column: 'type', message: notImportable });
      continue;
    }

    const nodeId = num(row.cells.node);
    const elementId = num(row.cells.member);
    const wantsNode = type.startsWith('nodal');
    const target = wantsNode ? nodeId : elementId;
    const targetSet = wantsNode ? nodeIds : elemIds;
    const what = wantsNode ? 'nodo' : 'barra';
    if (target === null) {
      problems.push({
        sheet: 'Loads', row: row.n,
        message: `"${type}" necesita ${wantsNode ? 'un nodo' : 'una barra'}`,
      });
      continue;
    }
    if (!targetSet.has(target)) {
      problems.push({ sheet: 'Loads', row: row.n, message: `no existe el ${what} ${target}` });
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
            message: `dirección "${str(row.cells.dir)}" desconocida — válidas: global, local`,
          });
          continue;
        }
      } else if (type === 'distributed3d') {
        // Local components by definition — qY then qZ; the sheet's qi/qj
        // carry qY, qzi/qzj carry qZ.
        Object.assign(data, { qYI: n('qi'), qYJ: n('qj'), qZI: n('qzi'), qZJ: n('qzj') });
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
