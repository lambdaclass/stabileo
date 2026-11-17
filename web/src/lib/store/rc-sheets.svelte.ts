import { modelStore } from './model.svelte';
import { loadFamilyOfRegulations, type LoadFamilyChoice } from '../codes/families/stacks';
import { regulationsStore } from './regulations.svelte';
import { rulesFor } from '../rc-sheets/codes';
import { resultsStore } from './results.svelte';
import { physicalGroups, physicalThickness } from './physical';
import { materialFamilyOf } from '../model/material-family';
import { catalogueGradeFamily } from '../engine/steel/grade-family';
import { applyPlateMeshes, clearPlateMesh, physicalPlates, planPlateMesh, plateShellKeys, plateStatus, setPlateMeshSpec, type PlateMeshPlan } from './physical-plates';
import { designData, patchOwnDesignData, setDesignData, storedDesignData } from './design-data';
import { activePerCombo3D, activeResultSet3D } from './active-results';
import { seismicCaseIds, seismicSettings } from './seismic-design.svelte';
import { DESIGN_OPTION_FLAGS, type DesignOptionFlag, type DesignOptions } from '../rc-sheets/design-options';
import { defaultLevelName } from '../model/grid';
import { computeJointPsiFromModel } from '../engine/codes/argentina/cirsoc201';
import { computeBeamCriticalSections } from '../engine/station-design-forces';
import { beamFlangeSides } from '../engine/design/beam-flange';
import { columnJointSection, frameJoints, jointChecks, type JointContext } from '../rc-sheets/joints';
import { columnLeastMn } from '../engine/design/seismic/frame-checks';
import { concreteFc, type DesignKind, type ProjectDesignData } from '../model/design-data';
import { beamDemands, columnDemands, levelGeometry, punchingDemands, slabDemands, wallDemands, type DemandGroup, type DemandInput, type DemandSet } from '../rc-sheets/demands';
import { slabPlan, type LevelGeometry, type LevelPlan } from '../rc-sheets/slab-plan';
import type { PunchingRow } from '../rc-sheets/punching-row';
import type { FootingRow } from '../rc-sheets/footing-types';
import { currentFootingDemands, footingRowOf, footingSizing, withOverlaps } from './rc-sheets-footings';
import type { BeamRow } from '../rc-sheets/beam-row';
import type { LineAdopted, LineLayout } from '../rc-sheets/beam-line';
import type { ColumnRow } from '../rc-sheets/column-row';
import type { SlabRow } from '../rc-sheets/slab-row';
import type { WallRow } from '../rc-sheets/wall-row';
import { makeFmt, type Fmt } from '../rc-sheets/format';
import { defaultRcSheetsData, RC_SHEETS_LOGIC, SHEET_CODES, SLAB_BAR_RANGE, listIn, type SheetCode, type Adopted, type BeamAdopted, type ColumnAdopted, type RcSheetsData, type StoredRcSheets, type SheetFamily, type SlabAdopted, type TorsionMode, type WallAdopted } from '../rc-sheets/types';
import type { AnalysisResults3D } from '../engine/types-3d';

export type SheetRow = BeamRow | ColumnRow | SlabRow | WallRow | PunchingRow | FootingRow;

export interface SheetRows {
  beam: BeamRow[];
  /** Each physical beam as one continuous run of bars over its spans. */
  line: LineLayout[];
  column: ColumnRow[];
  slab: SlabRow[];
  /** Each level's slab bars laid out across its panels. */
  slabPlan: LevelPlan[];
  wall: WallRow[];
  punching: PunchingRow[];
  footing: FootingRow[];
  /** The regulation the rows are computed with. */
  code: string;
  /** Where the forces came from: the design combinations, or the result on screen when none is solved. */
  basis: 'combinations' | 'single' | 'none';
  combos: number;
}

const DEFAULT_FC = 25;

/** The options the design data state for the sheets, as `RcSheetsData` carries them. */
function optionsView(o: DesignOptions = {}): Pick<RcSheetsData, 'torsion' | DesignOptionFlag> {
  return { torsion: o.torsion ?? 'equilibrium', ...Object.fromEntries(DESIGN_OPTION_FLAGS.filter((k) => o[k]).map((k) => [k, true])) };
}

/** The sheets' data with the design options read in; adopted bars saved before adoptions were stamped count as set by hand, stamped with the code and seismic option in force. */
export function rcSheetsData(): RcSheetsData {
  const dd = designData(), d = dd.rcSheets;
  const options = optionsView(dd.designOptions);
  if (!d) return { ...defaultRcSheetsData(), ...options };
  const full = { ...defaultRcSheetsData(), ...d, ...options };
  const keys = Object.keys(full.adopted);
  if (full.adoptedCode || !keys.length) return full;
  const code = codeOf(full);
  return { ...full, edited: [...new Set([...(full.edited ?? []), ...keys])], ...adoptionStamp(full, code) };
}

const seismicIn = (d: Pick<RcSheetsData, 'seismic'>, code: SheetCode): boolean => d.seismic === true && rulesFor(code).seismic;

/** The design data the proposals read, as one string: another one proposes other bars. */
export function proposalBasis(dd: ProjectDesignData = designData()): string {
  return JSON.stringify({
    fy: dd.rebarFy, stirrup: dd.stirrupDiaMm, covers: dd.covers, control: dd.executionControl !== false, long: dd.longDiametersMm, ties: dd.stirrupDiametersMm,
    slab: dd.slabDiametersMm, floor: dd.minTieSpacingMm, wall: dd.wallBarDiaMm, byElement: dd.coverByElement ?? null, slabBase: dd.slabBase ?? null,
    options: optionsView(dd.designOptions), ends: dd.columnEndZones === true,
  });
}

/** What adopted proposals hold under: the code, whether the seismic provisions apply, the proposals' logic and the design data they read. */
const adoptionStamp = (d: Pick<RcSheetsData, 'seismic'>, code: SheetCode): Pick<RcSheetsData, 'adoptedCode' | 'adoptedSeismic' | 'adoptedLogic' | 'adoptedBasis'> =>
  ({ adoptedCode: code, adoptedSeismic: seismicIn(d, code) ? true : undefined, adoptedLogic: RC_SHEETS_LOGIC, adoptedBasis: proposalBasis() });

/** The sheets' own data, without the options the design data hold (an older project kept them here). */
function ownSheets(d: Partial<RcSheetsData>): StoredRcSheets {
  const { torsion: _t, faces: _f, flange: _l, seismic: _s, bentBars: _b, slabBentBars: _sb, ...own } = d;
  return own as StoredRcSheets;
}

function save(next: RcSheetsData): void {
  patchOwnDesignData({ rcSheets: ownSheets(next) });
}

export const saveRcSheetsData = save;

/** Bars set for a row: by hand (the editor), kept whatever the code; `null` goes back to the proposal. */
export function setAdopted(key: string, value: Adopted | null, byHand = true): void {
  const d = rcSheetsData();
  const code = sheetCode();
  const adopted = { ...(byHand ? d.adopted : liveAdopted(d, code)) };
  const edited = new Set(d.edited ?? []);
  if (value) { adopted[key] = JSON.parse(JSON.stringify(value)) as Adopted; if (byHand) edited.add(key); else edited.delete(key); } else { delete adopted[key]; edited.delete(key); }
  save({ ...d, adopted, ...(edited.size ? { edited: [...edited] } : { edited: undefined }), ...(byHand ? {} : adoptionStamp(d, code)) });
}

export function adoptAll(rows: ReadonlyArray<{ key: string; proposed: unknown }>): void {
  const d = rcSheetsData();
  const live = liveAdopted(d, sheetCode());
  const adopted = { ...live };
  for (const r of rows) if (!adopted[r.key]) adopted[r.key] = JSON.parse(JSON.stringify(r.proposed)) as Adopted;
  save({ ...d, adopted, ...adoptionStamp(d, sheetCode()) });
}

/** The adopted bars that hold under `code`: those set by hand always, the adopted proposals only under the code, seismic option, proposals' logic and design data they were adopted for. */
export function liveAdopted(d: RcSheetsData, code: SheetCode): Record<string, Adopted> {
  if (!d.adoptedCode || (d.adoptedCode === code && (d.adoptedSeismic === true) === seismicIn(d, code) && d.adoptedLogic === RC_SHEETS_LOGIC && d.adoptedBasis === proposalBasis())) return d.adopted;
  const edited = new Set(d.edited ?? []);
  return Object.fromEntries(Object.entries(d.adopted).filter(([k]) => edited.has(k)));
}

/** The rows the engineer edited by hand. */
export const editedKeys = (): ReadonlySet<string> => new Set(rcSheetsData().edited ?? []);

const FROM_LOAD_FAMILY: Record<LoadFamilyChoice, SheetCode> = { cirsoc: 'cirsoc201-2025', eurocode: 'en1992-1-1', uk: 'bs-en1992-1-1', us: 'aci318-19', turkey: 'ts500-2000' };
const FROM_PROJECT: Record<string, SheetCode> = { aci318: 'aci318-19', ec2: 'en1992-1-1', 'ec2-uk': 'bs-en1992-1-1' };

/** The code the sheets design to: the one chosen for them, else the project's concrete code. */
export function sheetCode(): SheetCode {
  return codeOf(designData().rcSheets);
}

function codeOf(d: Pick<RcSheetsData, 'code'> | undefined): SheetCode {
  const own = d?.code;
  if (own && SHEET_CODES[own]) return own;
  return FROM_PROJECT[designData().foreignCodes?.concrete ?? ''] ?? FROM_LOAD_FAMILY[loadFamilyOfRegulations(regulationsStore.roles) ?? 'cirsoc'];
}

export function setSheetCode(code: SheetCode): void {
  save({ ...rcSheetsData(), code });
}

/** One of the design options in the design data: the design it fed is retired and the sheets are out of date. */
function setDesignOptions(next: DesignOptions): void {
  const { designOptions: _, rcSheets, ...rest } = storedDesignData();
  setDesignData({ ...rest, ...(rcSheets ? { rcSheets: ownSheets(rcSheets) } : {}), designOptions: next });
}

export function setTorsionMode(torsion: TorsionMode): void {
  setDesignOptions({ ...designData().designOptions, torsion });
}

/** The project's denser column ends (`columnEndZones`), the same setting the design reads. */
export function setColumnEndZones(on: boolean): void {
  const d = { ...storedDesignData() };
  if (on) d.columnEndZones = true; else delete d.columnEndZones;
  setDesignData(d);
}

export function setRcOption(option: DesignOptionFlag, on: boolean): void {
  const next: DesignOptions = { ...designData().designOptions };
  if (on) next[option] = true; else delete next[option];
  setDesignOptions(next);
}

/** Never from mesh nodes: a mesh's rows of nodes are not storeys. */
function memberElevations(): number[] {
  return [...new Set(physicalGroups().flatMap((g) => [g.physical.levelFrom, g.physical.levelTo])
    .filter((id): id is string => !!id?.startsWith('z:')).map((id) => Math.round(Number(id.slice(2)) * 1000) / 1000))].sort((p, q) => p - q);
}

function storeyElevations(): number[] {
  const grid = modelStore.grid?.levels ?? [];
  return grid.length ? grid.map((l) => l.z) : memberElevations();
}

/** One line laid out with bent bars (`true`), without them (`false`), or as the project says (`null`); its adopted proposal, unless edited by hand, goes with the old choice. */
export function setLineBentBars(key: string, on: boolean | null): void {
  const d = rcSheetsData();
  const bentLines = { ...d.bentLines };
  if (on === null) delete bentLines[key]; else bentLines[key] = on;
  const adopted = { ...d.adopted };
  if (!(d.edited ?? []).includes(key)) delete adopted[key];
  save({ ...d, adopted, bentLines: Object.keys(bentLines).length ? bentLines : undefined });
}

function storeyNamer(): (z: number) => string {
  const grid = modelStore.grid?.levels ?? [];
  if (grid.length) return (z) => grid.find((l) => Math.abs(l.z - z) < 0.05)?.name ?? `+${z.toFixed(2)}`;
  const zs = memberElevations();
  return (z) => { const i = zs.findIndex((v) => Math.abs(v - z) < 0.05); return i >= 0 ? defaultLevelName(i) : `+${z.toFixed(2)}`; };
}

function levelName(id: string | undefined, namer: (z: number) => string): string | undefined {
  if (!id) return undefined;
  if (id.startsWith('z:')) return namer(Number(id.slice(2)));
  return modelStore.grid?.levels.find((l) => l.id === id)?.name ?? id;
}

const isDeadCase = (type: string) => type.toUpperCase() === 'D';

/** A member's cover, m: the largest a person set for one of its elements, else its kind's. */
export function memberCover(dd: Pick<ProjectDesignData, 'covers' | 'coverByElement'>, kind: DesignKind, elements: readonly number[]): number {
  const own = elements.map((id) => dd.coverByElement?.[String(id)]).filter((x): x is number => x !== undefined);
  return own.length ? Math.max(...own) : dd.covers[kind];
}

/** The top bars a slab joint's depth is read to, mm: the thickest its level's slabs adopt on top, else the thickest the project allows them. */
export function topBarAt(slabs: readonly SlabRow[], level: string | undefined, allowed: readonly number[]): number {
  const tops = slabs.filter((r) => (r.level ?? '') === (level ?? '')).flatMap((r) => [r.adopted.topX.dia, r.adopted.topY.dia]).filter((x) => x > 0);
  return tops.length ? Math.max(...tops) : Math.max(0, ...allowed) || 12;
}

export function designSets(): { sets: DemandSet[]; basis: SheetRows['basis']; dead: AnalysisResults3D[] } {
  const combos = modelStore.combinations;
  const deadIds = new Set(modelStore.model.loadCases.filter((c) => isDeadCase(c.type)).map((c) => c.id));
  const dead = [...deadIds].map((id) => resultsStore.perCase3D.get(id)).filter((r): r is AnalysisResults3D => !!r);
  const solved = activePerCombo3D();
  const quake = seismicCaseIds();
  if (solved.size) {
    const sets = [...solved].map(([id, result]) => {
      const c = combos.find((x) => x.id === id);
      const factors = c?.factors ?? [];
      return { name: c?.name ?? `#${id}`, result, deadFactor: factors.filter((f) => deadIds.has(f.caseId)).reduce((s, f) => s + f.factor, 0), seismic: factors.some((f) => quake.has(f.caseId) && f.factor !== 0) };
    });
    return { sets, basis: 'combinations', dead };
  }
  const r = activeResultSet3D();
  return r ? { sets: [{ name: '—', result: r }], basis: 'single', dead: [] } : { sets: [], basis: 'none', dead: [] };
}

function demandInput(sets: DemandSet[], dead: AnalysisResults3D[], opts: { faces: boolean; flange: boolean }): DemandInput {
  const supportsByNode = new Map([...modelStore.supports.values()].map((s) => [s.nodeId, s]));
  const namer = storeyNamer();
  const groups: DemandGroup[] = physicalGroups().map((g) => ({
    id: g.id, name: g.name, kind: g.physical.kind, level: levelName(g.physical.levelFrom, namer),
    elements: (g.members.elements ?? []).filter((id) => inConcrete(modelStore.elements.get(id)?.materialId)),
    quads: (g.members.quads ?? []).filter((id) => inConcrete(modelStore.quads.get(id)?.materialId)),
    plates: (g.members.plates ?? []).filter((id) => inConcrete(modelStore.plates.get(id)?.materialId)),
  }));
  return {
    nodes: modelStore.nodes, elements: modelStore.elements as never, sections: modelStore.sections as never,
    supportNodes: new Set(supportsByNode.keys()),
    shells: { nodes: modelStore.nodes, quads: modelStore.quads, plates: modelStore.plates },
    groups, sets, dead, faces: opts.faces,
    ...((f) => ({ slabSides: (id: number) => f.get(id)?.sides.length ?? 0, ...(opts.flange ? { flangeSides: (id: number) => f.get(id)?.sides } : {}) }))(beamFlangeSides({ nodes: modelStore.nodes, elements: modelStore.elements, sections: modelStore.sections, quads: modelStore.quads })),
    faceOffset: (id, end) => {
      const e = modelStore.elements.get(id);
      const sec = e ? modelStore.sections.get(e.sectionId) : undefined;
      const cs = computeBeamCriticalSections(id, modelStore.nodes as never, modelStore.elements as never, modelStore.sections as never, modelStore.supports as never,
        { b: sec?.b ?? 0.2, h: sec?.h ?? 0.4, cover: designData().covers.beam, stirrupDia: designData().stirrupDiaMm });
      return cs ? (end === 'i' ? cs.start.halfDepth : cs.end.halfDepth) : 0;
    },
    levelZs: storeyElevations(),
    levelAt: namer,
    psi: (id) => computeJointPsiFromModel(id, modelStore.nodes as never, modelStore.elements as never, modelStore.sections as never, modelStore.materials as never, supportsByNode as never),
  };
}

/** A member of steel, timber or another metal is none of the sheets' business; one with no strength recorded is read as concrete. */
function inConcrete(materialId: number | undefined): boolean {
  const family = materialFamilyOf(materialId !== undefined ? (modelStore.materials.get(materialId) as never) : undefined, catalogueGradeFamily).family;
  return family === 'concrete' || family === 'unknown';
}

function fcOfElement(id: number | undefined): number {
  const e = id !== undefined ? modelStore.elements.get(id) : undefined;
  const m = e ? modelStore.materials.get(e.materialId) : undefined;
  return concreteFc(m as never) ?? DEFAULT_FC;
}

function fcOfShells(quads: number[], plates: number[]): number {
  const s = quads.length ? modelStore.quads.get(quads[0]!) : plates.length ? modelStore.plates.get(plates[0]!) : undefined;
  const m = s ? modelStore.materials.get((s as { materialId: number }).materialId) : undefined;
  return concreteFc(m as never) ?? DEFAULT_FC;
}

const demandCache = new WeakMap<object, { beams: ReturnType<typeof beamDemands>; columns: ReturnType<typeof columnDemands>; slabs: ReturnType<typeof slabDemands>; levels: LevelGeometry[]; walls: ReturnType<typeof wallDemands>; punching: ReturnType<typeof punchingDemands>; groupsRev: unknown; opts: string }>();

const rowCache = new WeakMap<object, Map<string, SheetRow>>();
const lineCache = new WeakMap<object, { k: string; v: LineLayout }>();

function cachedLine(anchor: object, inputs: unknown, compute: () => LineLayout): LineLayout {
  const k = JSON.stringify(inputs);
  const hit = lineCache.get(anchor);
  if (hit && hit.k === k) return hit.v;
  const v = compute();
  lineCache.set(anchor, { k, v });
  return v;
}

function cached<D extends object, R extends SheetRow>(demand: D, inputs: unknown, compute: () => R): R {
  const k = JSON.stringify(inputs);
  let m = rowCache.get(demand);
  if (!m) { m = new Map(); rowCache.set(demand, m); }
  const hit = m.get(k);
  if (hit) return hit as R;
  const row = compute();
  if (m.size > 4) m.clear();
  m.set(k, row);
  return row;
}

/** The element size the wall sheets read a wall's in-plane moment at, m. */
export const WALL_MESH_SIZE = 0.5;

const loadedByHand = (key: string) => modelStore.loads.some((l) => (l.type === 'surface3d' || l.type === 'thermalQuad3d')
  && `${(l.data as { on?: string }).on === 'plate' ? 'p' : 'q'}${(l.data as { quadId: number }).quadId}` === key && (l.data as { fromDef?: number }).fromDef === undefined);

/**
 * The walls the sheets cannot read yet: with no mesh or an out-of-date one, or whole as one element
 * (a storey-high quad has no in-plane moment to speak of), unless a load put on that element by hand
 * would be lost with it.
 */
export function wallsToMeshForSheets(): number[] {
  return physicalPlates().filter((p) => {
    if (p.physical.kind !== 'wall') return false;
    if (plateStatus(p.id) !== 'current') return true;
    const keys = plateShellKeys(p.id);
    return keys.length === 1 && !loadedByHand(keys[0]!);
  }).map((p) => p.id);
}

/** Those walls meshed now at `WALL_MESH_SIZE` at most, whatever "mesh before analysis" says. One undo step; how many. */
export function meshWallsForSheets(): number {
  const ids = wallsToMeshForSheets();
  if (!ids.length) return 0;
  let meshed = 0;
  modelStore.batch(() => {
    for (const id of ids) {
      const e = physicalPlates().find((p) => p.id === id);
      if (e && e.surface.mesh.size > WALL_MESH_SIZE) setPlateMeshSpec([id], { size: WALL_MESH_SIZE });
      if (plateShellKeys(id).length === 1) clearPlateMesh(id);
    }
    const plans = ids.map((id) => planPlateMesh(id)).filter((p): p is PlateMeshPlan => !!p && p.localLoads === 0);
    meshed = applyPlateMeshes(plans).plates;
  });
  return meshed;
}

/** A row designed again from its demand with other dimensions, its context as the last build had it; by row key. */
export type Redesign = (demand: never) => SheetRow;
const redesigners = new Map<string, Redesign>();
export const redesignerOf = (key: string): Redesign | undefined => redesigners.get(key);

import type { SheetProgress } from './rc-sheets-progress.svelte';
export type { SheetProgress };

/** The sheets' rows at once (`sheetRowsSteps` run to its end). */
export function buildSheetRows(fmt: Fmt = makeFmt(',')): SheetRows {
  const it = sheetRowsSteps(fmt);
  for (let r = it.next(); ; r = it.next()) if (r.done) return r.value;
}

/**
 * The sheets' rows, step by step: a step after each family's forces are read and after each member
 * is designed, saying how far it has got, so a caller can let the page draw between steps
 * (`rc-sheets-view.svelte.ts`). The rows are those of `buildSheetRows`.
 */
export function* sheetRowsSteps(fmt: Fmt = makeFmt(',')): Generator<SheetProgress, SheetRows, void> {
  const { sets, basis, dead } = designSets();
  const code = sheetCode();
  const rules = rulesFor(code);
  const codeName = SHEET_CODES[code].name;
  if (!sets.length) return { beam: [], line: [], column: [], slab: [], slabPlan: [], wall: [], punching: [], footing: [], code: codeName, basis, combos: 0 };
  const dd = designData();
  const adoptedNow = liveAdopted(rcSheetsData(), code);
  const data = rcSheetsData();
  const key = basis === 'combinations' ? resultsStore.perCombo3D : sets[0]!.result;
  const groupsRev = modelStore.model.groups;
  const opts = { faces: data.faces === true, flange: data.flange === true };
  const optsKey = JSON.stringify({ ...opts, sets: sets.map((x) => x.name) });
  let dem = demandCache.get(key);
  if (!dem || dem.groupsRev !== groupsRev || dem.opts !== optsKey) {
    const input = demandInput(sets, dead, opts);
    const byGroup = new Map(physicalGroups().map((g) => [g.id, g]));
    yield { phase: 'demands', done: 0, total: 5 };
    const beams = beamDemands(input);
    yield { phase: 'demands', done: 1, total: 5 };
    const columns = columnDemands(input);
    yield { phase: 'demands', done: 2, total: 5 };
    const slabs = slabDemands(input, (g) => { const pg = byGroup.get(g.id); return pg ? physicalThickness(pg) : null; });
    yield { phase: 'demands', done: 3, total: 5 };
    const walls = wallDemands(input);
    yield { phase: 'demands', done: 4, total: 5 };
    const punching = punchingDemands(input);
    const levels = [...new Set(slabs.map((d) => d.level ?? ''))].map((name) => {
      const zs = slabs.filter((d) => (d.level ?? '') === name && d.bounds).map((d) => d.bounds!.z);
      return levelGeometry(input, name, zs.length ? zs.reduce((a, z) => a + z, 0) / zs.length : 0);
    });
    dem = { beams, columns, slabs, levels, walls, punching, groupsRev, opts: optsKey };
    demandCache.set(key, dem);
  }
  const D = dem;
  const feet = currentFootingDemands(sets, storeyNamer());
  const total = D.beams.length * 2 + D.columns.length + D.slabs.length + D.walls.length + D.punching.length + feet.length;
  let done = 0;
  const step = (): SheetProgress => ({ phase: 'design', done: ++done, total });
  const groupsById = new Map(physicalGroups().map((g) => [g.id, g]));
  const groupOf = (k: string) => groupsById.get(Number(k.split(':')[1]));
  const fy = dd.rebarFy;
  const dec = fmt(1.5, 1);
  const seismic = data.seismic && rules.seismic ? { overstrength: seismicSettings().overstrength } : undefined;
  const bentIn = (d: (typeof D.beams)[number]) => data.bentLines?.[`line:${d.line?.group ?? -1}`] ?? data.bentBars === true;
  const coverTable = rules.coverTable ? { coverTable: { control: dd.executionControl !== false } } : {};
  const ties = { tieDiameters: dd.stirrupDiametersMm, minTieSpacing: dd.minTieSpacingMm / 1000 };
  const coverOf = (kind: DesignKind, key: string) => memberCover(dd, kind, groupOf(key)?.members.elements ?? []);
  const beamCtx = (d: (typeof D.beams)[number]) => ({ mat: { fc: fcOfElement(groupOf(d.key)?.members.elements?.[0]), fy }, cover: coverOf('beam', d.key), stirrupDia: dd.stirrupDiaMm, diameters: dd.longDiametersMm, ...ties, torsion: data.torsion, seismic, ...(bentIn(d) ? { bentBars: true } : {}), ...coverTable });
  const proposals: BeamRow[] = [];
  for (const d of D.beams) {
    const ctx = beamCtx(d);
    proposals.push(cached(d, [code, ctx, undefined, dec, 'proposal'], () => rules.beamRow(d, ctx, undefined, fmt)));
    yield step();
  }
  const byLine = new Map<number, BeamRow[]>();
  for (const r of proposals) { const g = r.demand.line?.group ?? -1; byLine.set(g, [...(byLine.get(g) ?? []), r]); }
  const line: LineLayout[] = [];
  const derived = new Map<string, BeamAdopted>();
  const edited = new Set(data.edited ?? []);
  const linesAdopted = new Set<number>();
  for (const [g, rows] of byLine) {
    const first = rows[0]!;
    const ctx = beamCtx(first.demand);
    const own = adoptedNow[`line:${g}`] as LineAdopted | undefined;
    const la = own && ctx.seismic && !edited.has(`line:${g}`) && own.bent?.some((x) => x.count > 0) ? undefined : own;
    if (la) linesAdopted.add(g);
    const layout = cachedLine(first.demand, [code, ctx, la, dec, rows.map((r) => r.key)], () => rules.beamLine(rows, ctx, la, fmt));
    line.push(layout);
    const sortedRows = [...rows].sort((p, q) => (p.demand.line?.index ?? 0) - (q.demand.line?.index ?? 0));
    sortedRows.forEach((r, k) => { const sa = layout.spanAdopted[k]; if (sa) derived.set(r.key, sa); });
  }
  redesigners.clear();
  const beam: BeamRow[] = [];
  for (const d of D.beams) {
    const ctx = beamCtx(d);
    redesigners.set(d.key, ((x: typeof d) => rules.beamRow(x, ctx, undefined, fmt)) as Redesign);
    const own = adoptedNow[d.key] as BeamAdopted | undefined;
    const a = own ?? derived.get(d.key);
    const row = cached(d, [code, ctx, a, dec], () => rules.beamRow(d, ctx, a, fmt));
    const lineAdopted = linesAdopted.has(d.line?.group ?? -1);
    beam.push(own ? row : { ...row, isAdopted: lineAdopted, proposed: derived.get(d.key) ?? row.proposed });
    yield step();
  }
  const below = new Map<number, ColumnRow>();
  const columnAt = (d: (typeof D.columns)[number], minMn: ReadonlyMap<string, number>): ColumnRow => {
    const ctx = { mat: { fc: fcOfElement(groupOf(d.key)?.members.elements?.[0]), fy }, cover: coverOf('column', d.key), tieDia: dd.stirrupDiaMm, diameters: dd.longDiametersMm, ...ties, seismic, ...coverTable, ...(minMn.has(d.key) ? { minMn: minMn.get(d.key) } : {}) };
    const a = adoptedNow[d.key] as ColumnAdopted | undefined;
    const g = Number(d.key.split(':')[1]);
    const prev = below.get(g);
    const stack = prev ? {
      pattern: { nx: prev.adopted.nx, ny: prev.adopted.ny, maxDia: Math.max(prev.adopted.corner, prev.adopted.dx, prev.adopted.dy) },
      fromBelow: true, offset: Math.max(prev.b - d.b, prev.h - d.h) / 2,
    } : {};
    const row = cached(d, [code, ctx, a, dec, stack], () => rules.columnRow(d, ctx, a, fmt, stack));
    redesigners.set(d.key, ((x: typeof d) => rules.columnRow(x, ctx, undefined, fmt, prev ? { fromBelow: true } : {})) as Redesign);
    below.set(g, row);
    return row;
  };
  let column: ColumnRow[] = [];
  for (const d of D.columns) {
    column.push(columnAt(d, new Map()));
    yield step();
  }
  const joint = { fc: (r: ColumnRow) => fcOfElement(groupOf(r.key)?.members.elements?.[0]), beamFc: (b: BeamRow) => fcOfElement(groupOf(b.key)?.members.elements?.[0]), fy, cover: dd.covers.column, beamCover: dd.covers.beam, settings: seismicSettings() };
  if (seismic) column = strongColumns(column, beam, joint, (minMn) => { below.clear(); return D.columns.map((d) => columnAt(d, minMn)); });
  const slabBars = listIn(dd.slabDiametersMm, SLAB_BAR_RANGE);
  const baseFaces = Object.entries(dd.slabBase ?? {}).filter((x): x is [string, { diameter: number; spacing: number }] => !!x[1]);
  const slabBase = baseFaces.length ? { base: Object.fromEntries(baseFaces.map(([k, v]) => [k, { dia: v.diameter, spacing: v.spacing }])) } : {};
  const slab: SlabRow[] = [];
  for (const d of D.slabs) {
    const g = groupOf(d.key);
    const ctx = { mat: { fc: fcOfShells(g?.members.quads ?? [], g?.members.plates ?? []), fy }, cover: dd.covers.slab, diameters: slabBars, ...slabBase };
    const a = adoptedNow[d.key] as SlabAdopted | undefined;
    redesigners.set(d.key, ((x: typeof d) => rules.slabRow(x, ctx, undefined, fmt)) as Redesign);
    slab.push(cached(d, [code, ctx, a, dec], () => rules.slabRow(d, ctx, a, fmt)));
    yield step();
  }
  const planOf = (g: LevelGeometry) => {
    const rows = slab.filter((r) => (r.level ?? '') === g.level);
    const first = groupOf(rows[0]?.key ?? '');
    const ctx = { mat: { fc: fcOfShells(first?.members.quads ?? [], first?.members.plates ?? []), fy }, cover: dd.covers.slab, diameters: slabBars, bent: data.slabBentBars === true, columnInset: dd.covers.column + dd.stirrupDiaMm / 1000 + Math.max(0, ...dd.longDiametersMm.filter((x) => x <= 16)) / 2000 };
    return slabPlan(g.level, rows, g, ctx, rules.slabPlan);
  };
  let slabPlans = D.levels.map(planOf).filter((p) => p.panels.length);
  const spanned = new Set<string>();
  slab.forEach((r, i) => {
    const k = slabPlans.find((p) => p.level === (r.level ?? ''))?.cantilevers.find((x) => x.panel === r.name);
    if (!k) return;
    const d = D.slabs.find((x) => x.key === r.key)!;
    const g = groupOf(d.key);
    const ctx = { mat: { fc: fcOfShells(g?.members.quads ?? [], g?.members.plates ?? []), fy }, cover: dd.covers.slab, diameters: slabBars, ...slabBase, span: { kind: 'cantilever' as const, dir: k.dir, length: k.length } };
    const a = adoptedNow[d.key] as SlabAdopted | undefined;
    redesigners.set(d.key, ((x: typeof d) => rules.slabRow(x, ctx, undefined, fmt)) as Redesign);
    slab[i] = cached(d, [code, ctx, a, dec], () => rules.slabRow(d, ctx, a, fmt));
    spanned.add(r.level ?? '');
  });
  if (spanned.size) slabPlans = D.levels.map((g) => (spanned.has(g.level) ? planOf(g) : slabPlans.find((p) => p.level === g.level))).filter((p): p is LevelPlan => !!p && p.panels.length > 0);
  const wall: WallRow[] = [];
  for (const d of D.walls) {
    const g = groupOf(d.key);
    const ctx = { mat: { fc: fcOfShells(g?.members.quads ?? [], g?.members.plates ?? []), fy }, cover: dd.covers.wall, barDia: dd.wallBarDiaMm, diameters: dd.longDiametersMm, ...ties, ...(seismic ? { seismic } : {}) };
    const a = adoptedNow[d.key] as WallAdopted | undefined;
    redesigners.set(d.key, ((x: typeof d) => rules.wallRow(x, ctx, undefined, fmt)) as Redesign);
    wall.push(cached(d, [code, ctx, a, dec], () => rules.wallRow(d, ctx, a, fmt)));
    yield step();
  }
  const punching: PunchingRow[] = [];
  for (const d of D.punching) {
    const plan = slabPlans.find((p) => p.level === (d.level ?? ''));
    const at = (dir: 'x' | 'y') => plan?.integrity.find((k) => k.dir === dir && Math.hypot(k.x - d.joint.at.x, k.y - d.joint.at.y) < 0.05);
    const ix = at('x'), iy = at('y');
    const ctx = { fc: fcOfElement(d.joint.columnElementId), fy, cover: dd.covers.slab, topBarDia: topBarAt(slab, d.level, slabBars), ...(ix && iy ? { integrity: { x: ix.bars, y: iy.bars, required: ix.required, dia: Math.max(ix.dia, iy.dia) } } : {}) };
    redesigners.set(d.key, ((x: typeof d) => rules.punchingRow(x, ctx, fmt)) as Redesign);
    punching.push(cached(d, [code, ctx, dec], () => rules.punchingRow(d, ctx, fmt)));
    yield step();
  }
  const footing: FootingRow[] = [];
  for (const d of feet) {
    const f = footingRowOf(d, rules, adoptedNow, footingSizing(data), column, fmt);
    redesigners.set(d.key, f.redo as Redesign);
    footing.push(f.row);
    yield step();
  }
  const columnsFinal = seismic ? jointChecks(column, beam, modelStore.nodes, fmt, joint) : column;
  if (seismic) for (const r of columnsFinal) jointAwareRedesign(r, columnsFinal, beam, (rows, beams) => jointChecks(rows, beams, modelStore.nodes, fmt, joint));
  const sort = <T extends { level?: string; name: string }>(rows: T[]) => rows.sort((a, b) => (a.level ?? '').localeCompare(b.level ?? '', undefined, { numeric: true }) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  return { beam: sort(beam), line: sort(line), column: sort(columnsFinal), slab: sort(slab), slabPlan: slabPlans.sort((a, b) => a.level.localeCompare(b.level, undefined, { numeric: true })), wall: sort(wall), punching: sort(punching), footing: sort(withOverlaps(footing)), code: codeName, basis, combos: sets.length };
}


/**
 * A column redesigned for its resize hint is checked for the shear of the joint at its top too, the
 * members framing into it as they are. The strong-column rule stays with the column's own Mn: the
 * joint's share of it falls to the columns above as well, which the hint does not resize.
 */
function jointAwareRedesign(r: ColumnRow, columns: readonly ColumnRow[], beams: readonly BeamRow[], check: (rows: ColumnRow[], beams: BeamRow[]) => ColumnRow[]): void {
  const own = redesigners.get(r.key), top = r.demand.nodes?.top;
  if (!own || top === undefined) return;
  const near = columns.filter((x) => x.demand.nodes?.top === top || x.demand.nodes?.bottom === top);
  const framing = beams.filter((b) => b.demand.line?.startNode === top || b.demand.line?.endNode === top);
  redesigners.set(r.key, ((x: never) => {
    const row = own(x) as ColumnRow;
    const joint = check(near.map((c) => (c.key === r.key ? row : c)), framing).find((c) => c.key === r.key)?.verifications.find((v) => v.label === 'rcSheets.v.seisJoint');
    return joint ? { ...row, verifications: [...row.verifications, joint], ...(joint.ok ? {} : { status: 'fail' as const, checks: { ...row.checks, ok: false } }) } : row;
  }) as Redesign);
}

/**
 * The columns grown, joint by joint, until the strong-column rule holds (§18.7.3.2) with the beams'
 * bars framing in, as the joint check reads both: each column at a joint short of it is asked for its
 * share of what is missing, and those adopted are left as they are.
 */
function strongColumns(columns: ColumnRow[], beams: BeamRow[], c: JointContext, design: (minMn: ReadonlyMap<string, number>) => ColumnRow[]): ColumnRow[] {
  const minMn = new Map<string, number>();
  let rows = columns;
  for (let round = 0; round < 6; round++) {
    const { joints, columnId } = frameJoints(rows, beams, modelStore.nodes, c);
    const byId = new Map([...columnId].map(([r, id]) => [id, r]));
    let grown = false;
    for (const j of joints) {
      const sc = j.strongColumn;
      if (sc.ok || sc.roof || sc.sumColumns <= 1e-9) continue;
      for (const id of j.columns) {
        const r = byId.get(id);
        if (!r || r.isAdopted) continue;
        const own = columnJointSection(r, c.fc(r), c.fy, c.cover);
        const want = columnLeastMn(own.section, c.fc(r), c.fy, own.axial) * (sc.required / sc.sumColumns) * 1.01;
        if (want > (minMn.get(r.key) ?? 0) + 1e-3) { minMn.set(r.key, want); grown = true; }
      }
    }
    if (!grown) break;
    rows = design(minMn);
  }
  return rows;
}

export const familyRows = (rows: SheetRows, f: SheetFamily): SheetRow[] => rows[f];

export async function downloadRcSheets(rows: SheetRows, tr: (k: string) => string): Promise<void> {
  const { exportToExcel } = await import('../export/excel');
  const { rcSheetsWorkbook } = await import('../rc-sheets/workbook');
  const { sheetsSchedule } = await import('./rc-sheets-schedule');
  const name = (modelStore.model.name || 'stabileo').replace(/[^\w.-]+/g, '-');
  await exportToExcel({ filename: `${name}-${tr('rcSheets.fileName')}.xlsx`, onlyExtras: true, extraSheets: rcSheetsWorkbook(rows, tr, sheetsSchedule(rows)), provenance: false });
}
