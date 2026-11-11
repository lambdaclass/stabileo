import { modelStore } from './model.svelte';
import { loadFamilyOfRegulations, type LoadFamilyChoice } from '../codes/families/stacks';
import { regulationsStore } from './regulations.svelte';
import { rulesFor } from '../rc-sheets/codes';
import { resultsStore } from './results.svelte';
import { physicalGroups, physicalThickness } from './physical';
import { applyPlateMeshes, clearPlateMesh, physicalPlates, planPlateMesh, plateShellKeys, plateStatus, setPlateMeshSpec, type PlateMeshPlan } from './physical-plates';
import { designData, patchOwnDesignData } from './design-data';
import { activePerCombo3D, activeResultSet3D } from './active-results';
import { seismicCaseIds, seismicSettings } from './seismic-design.svelte';
import { defaultLevelName } from '../model/grid';
import { computeJointPsiFromModel } from '../engine/codes/argentina/cirsoc201';
import { computeBeamCriticalSections } from '../engine/station-design-forces';
import { beamFlangeSides } from '../engine/design/beam-flange';
import { jointChecks } from '../rc-sheets/joints';
import { concreteFc } from '../model/design-data';
import { beamDemands, columnDemands, punchingDemands, slabDemands, wallDemands, type DemandGroup, type DemandInput, type DemandSet } from '../rc-sheets/demands';
import type { PunchingRow } from '../rc-sheets/punching-row';
import type { BeamRow } from '../rc-sheets/beam-row';
import type { LineAdopted, LineLayout } from '../rc-sheets/beam-line';
import type { ColumnRow } from '../rc-sheets/column-row';
import type { SlabRow } from '../rc-sheets/slab-row';
import type { WallRow } from '../rc-sheets/wall-row';
import { makeFmt, type Fmt } from '../rc-sheets/format';
import { defaultRcSheetsData, SHEET_CODES, type SheetCode, type Adopted, type BeamAdopted, type ColumnAdopted, type RcSheetsData, type SheetFamily, type SlabAdopted, type TorsionMode, type WallAdopted } from '../rc-sheets/types';
import type { AnalysisResults3D } from '../engine/types-3d';

export type SheetRow = BeamRow | ColumnRow | SlabRow | WallRow | PunchingRow;

export interface SheetRows {
  beam: BeamRow[];
  /** Each physical beam as one continuous run of bars over its spans. */
  line: LineLayout[];
  column: ColumnRow[];
  slab: SlabRow[];
  wall: WallRow[];
  punching: PunchingRow[];
  /** The regulation the rows are computed with. */
  code: string;
  /** Where the forces came from: the design combinations, or the result on screen when none is solved. */
  basis: 'combinations' | 'single' | 'none';
  combos: number;
}

const DEFAULT_FC = 25;

export function rcSheetsData(): RcSheetsData {
  const d = designData().rcSheets;
  return d ? { ...defaultRcSheetsData(), ...d } : defaultRcSheetsData();
}

function save(next: RcSheetsData): void {
  patchOwnDesignData({ rcSheets: next });
}

export function setAdopted(key: string, value: Adopted | null): void {
  const d = rcSheetsData();
  const adopted = { ...d.adopted };
  if (value) adopted[key] = JSON.parse(JSON.stringify(value)) as Adopted; else delete adopted[key];
  save({ ...d, adopted });
}

export function adoptAll(rows: ReadonlyArray<{ key: string; proposed: unknown }>): void {
  const d = rcSheetsData();
  const adopted = { ...d.adopted };
  for (const r of rows) if (!adopted[r.key]) adopted[r.key] = JSON.parse(JSON.stringify(r.proposed)) as Adopted;
  save({ ...d, adopted });
}

const FROM_LOAD_FAMILY: Record<LoadFamilyChoice, SheetCode> = { cirsoc: 'cirsoc201-2025', eurocode: 'en1992-1-1', uk: 'bs-en1992-1-1', us: 'aci318-19', turkey: 'ts500-2000' };
const FROM_PROJECT: Record<string, SheetCode> = { aci318: 'aci318-19', ec2: 'en1992-1-1', 'ec2-uk': 'bs-en1992-1-1' };

/** The code the sheets design to: the one chosen for them, else the project's concrete code. */
export function sheetCode(): SheetCode {
  const own = rcSheetsData().code;
  if (own && SHEET_CODES[own]) return own;
  return FROM_PROJECT[designData().foreignCodes?.concrete ?? ''] ?? FROM_LOAD_FAMILY[loadFamilyOfRegulations(regulationsStore.roles) ?? 'cirsoc'];
}

export function setSheetCode(code: SheetCode): void {
  save({ ...rcSheetsData(), code });
}

export function setTorsionMode(torsion: TorsionMode): void {
  save({ ...rcSheetsData(), torsion });
}

export function setRcOption(option: 'faces' | 'flange' | 'seismic', on: boolean): void {
  const d = { ...rcSheetsData() };
  if (on) d[option] = true; else delete d[option];
  save(d);
}

/** Storey names from the grid's levels, else from the elevations the physical members span; never from mesh nodes. */
function storeyNamer(): (z: number) => string {
  const grid = modelStore.grid?.levels ?? [];
  if (grid.length) return (z) => grid.find((l) => Math.abs(l.z - z) < 0.05)?.name ?? `+${z.toFixed(2)}`;
  const zs = [...new Set(physicalGroups().flatMap((g) => [g.physical.levelFrom, g.physical.levelTo])
    .filter((id): id is string => !!id?.startsWith('z:')).map((id) => Math.round(Number(id.slice(2)) * 1000) / 1000))].sort((p, q) => p - q);
  return (z) => { const i = zs.findIndex((v) => Math.abs(v - z) < 0.05); return i >= 0 ? defaultLevelName(i) : `+${z.toFixed(2)}`; };
}

function levelName(id: string | undefined, namer: (z: number) => string): string | undefined {
  if (!id) return undefined;
  if (id.startsWith('z:')) return namer(Number(id.slice(2)));
  return modelStore.grid?.levels.find((l) => l.id === id)?.name ?? id;
}

const isDeadCase = (type: string) => type.toUpperCase() === 'D';

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
    elements: g.members.elements ?? [], quads: g.members.quads ?? [], plates: g.members.plates ?? [],
  }));
  return {
    nodes: modelStore.nodes, elements: modelStore.elements as never, sections: modelStore.sections as never,
    supportNodes: new Set(supportsByNode.keys()),
    shells: { nodes: modelStore.nodes, quads: modelStore.quads, plates: modelStore.plates },
    groups, sets, dead, faces: opts.faces,
    ...(opts.flange ? { flangeSides: ((f) => (id: number) => f.get(id)?.sides)(beamFlangeSides({ nodes: modelStore.nodes, elements: modelStore.elements, sections: modelStore.sections, quads: modelStore.quads })) } : {}),
    faceOffset: (id, end) => {
      const e = modelStore.elements.get(id);
      const sec = e ? modelStore.sections.get(e.sectionId) : undefined;
      const cs = computeBeamCriticalSections(id, modelStore.nodes as never, modelStore.elements as never, modelStore.sections as never, modelStore.supports as never,
        { b: sec?.b ?? 0.2, h: sec?.h ?? 0.4, cover: designData().covers.beam, stirrupDia: designData().stirrupDiaMm });
      return cs ? (end === 'i' ? cs.start.halfDepth : cs.end.halfDepth) : 0;
    },
    levelZs: (modelStore.grid?.levels ?? []).map((l) => l.z),
    levelAt: namer,
    psi: (id) => computeJointPsiFromModel(id, modelStore.nodes as never, modelStore.elements as never, modelStore.sections as never, modelStore.materials as never, supportsByNode as never),
  };
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

const demandCache = new WeakMap<object, { beams: ReturnType<typeof beamDemands>; columns: ReturnType<typeof columnDemands>; slabs: ReturnType<typeof slabDemands>; walls: ReturnType<typeof wallDemands>; punching: ReturnType<typeof punchingDemands>; groupsRev: unknown; opts: string }>();

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

export function buildSheetRows(fmt: Fmt = makeFmt(',')): SheetRows {
  const { sets, basis, dead } = designSets();
  const code = sheetCode();
  const rules = rulesFor(code);
  const codeName = SHEET_CODES[code].name;
  if (!sets.length) return { beam: [], line: [], column: [], slab: [], wall: [], punching: [], code: codeName, basis, combos: 0 };
  const dd = designData();
  const data = rcSheetsData();
  const key = basis === 'combinations' ? resultsStore.perCombo3D : sets[0]!.result;
  const groupsRev = modelStore.model.groups;
  const opts = { faces: data.faces === true, flange: data.flange === true };
  const optsKey = JSON.stringify({ ...opts, sets: sets.map((x) => x.name) });
  let dem = demandCache.get(key);
  if (!dem || dem.groupsRev !== groupsRev || dem.opts !== optsKey) {
    const input = demandInput(sets, dead, opts);
    const byGroup = new Map(physicalGroups().map((g) => [g.id, g]));
    dem = {
      beams: beamDemands(input), columns: columnDemands(input),
      slabs: slabDemands(input, (g) => { const pg = byGroup.get(g.id); return pg ? physicalThickness(pg) : null; }),
      walls: wallDemands(input),
      punching: punchingDemands(input),
      groupsRev, opts: optsKey,
    };
    demandCache.set(key, dem);
  }
  const groupsById = new Map(physicalGroups().map((g) => [g.id, g]));
  const groupOf = (k: string) => groupsById.get(Number(k.split(':')[1]));
  const fy = dd.rebarFy;
  const dec = fmt(1.5, 1);
  const seismic = data.seismic && rules.seismic ? { overstrength: seismicSettings().overstrength } : undefined;
  const beamCtx = (d: (typeof dem.beams)[number]) => ({ mat: { fc: fcOfElement(groupOf(d.key)?.members.elements?.[0]), fy }, cover: dd.covers.beam, stirrupDia: dd.stirrupDiaMm, diameters: dd.longDiametersMm, torsion: data.torsion, seismic });
  const proposals = dem.beams.map((d) => { const ctx = beamCtx(d); return cached(d, [code, ctx, undefined, dec, 'proposal'], () => rules.beamRow(d, ctx, undefined, fmt)); });
  const byLine = new Map<number, BeamRow[]>();
  for (const r of proposals) { const g = r.demand.line?.group ?? -1; byLine.set(g, [...(byLine.get(g) ?? []), r]); }
  const line: LineLayout[] = [];
  const derived = new Map<string, BeamAdopted>();
  for (const [g, rows] of byLine) {
    const first = rows[0]!;
    const ctx = beamCtx(first.demand);
    const la = data.adopted[`line:${g}`] as LineAdopted | undefined;
    const layout = cachedLine(first.demand, [code, ctx, la, dec, rows.map((r) => r.key)], () => rules.beamLine(rows, ctx, la, fmt));
    line.push(layout);
    const sortedRows = [...rows].sort((p, q) => (p.demand.line?.index ?? 0) - (q.demand.line?.index ?? 0));
    sortedRows.forEach((r, k) => { const sa = layout.spanAdopted[k]; if (sa) derived.set(r.key, sa); });
  }
  const beam = dem.beams.map((d) => {
    const ctx = beamCtx(d);
    const own = data.adopted[d.key] as BeamAdopted | undefined;
    let a = own ?? derived.get(d.key);
    let row = cached(d, [code, ctx, a, dec], () => rules.beamRow(d, ctx, a, fmt));
    const lineAdopted = !!data.adopted[`line:${d.line?.group}`];
    for (let guard = 0; ctx.seismic && !own && !lineAdopted && a && guard < 8; guard++) {
      const bad = row.verifications.some((v) => (v.label === 'rcSheets.v.seisBeamVe' || v.label === 'rcSheets.v.seisBeamHoops') && !v.ok);
      if (!bad || a.stirrups.spacing <= 0.05 + 1e-9) break;
      a = { ...a, stirrups: { ...a.stirrups, spacing: Math.max(0.05, Math.round((a.stirrups.spacing - 0.025) * 40) / 40) } };
      const tight = a;
      row = cached(d, [code, ctx, tight, dec], () => rules.beamRow(d, ctx, tight, fmt));
      derived.set(d.key, tight);
    }
    return own ? row : { ...row, isAdopted: !!data.adopted[`line:${d.line?.group}`], proposed: derived.get(d.key) ?? row.proposed };
  });
  const below = new Map<number, ColumnRow>();
  const column = dem.columns.map((d) => {
    const ctx = { mat: { fc: fcOfElement(groupOf(d.key)?.members.elements?.[0]), fy }, cover: dd.covers.column, tieDia: dd.stirrupDiaMm, diameters: dd.longDiametersMm, seismic };
    const a = data.adopted[d.key] as ColumnAdopted | undefined;
    const g = Number(d.key.split(':')[1]);
    const prev = below.get(g);
    const stack = prev ? {
      pattern: { nx: prev.adopted.nx, ny: prev.adopted.ny, maxDia: Math.max(prev.adopted.corner, prev.adopted.dx, prev.adopted.dy) },
      fromBelow: true, offset: Math.max(prev.b - d.b, prev.h - d.h) / 2,
    } : {};
    const row = cached(d, [code, ctx, a, dec, stack], () => rules.columnRow(d, ctx, a, fmt, stack));
    below.set(g, row);
    return row;
  });
  const slab = dem.slabs.map((d) => {
    const g = groupOf(d.key);
    const ctx = { mat: { fc: fcOfShells(g?.members.quads ?? [], g?.members.plates ?? []), fy }, cover: dd.covers.slab, diameters: [6, 8, 10, 12, 16] };
    const a = data.adopted[d.key] as SlabAdopted | undefined;
    return cached(d, [code, ctx, a, dec], () => rules.slabRow(d, ctx, a, fmt));
  });
  const wall = dem.walls.map((d) => {
    const g = groupOf(d.key);
    const ctx = { mat: { fc: fcOfShells(g?.members.quads ?? [], g?.members.plates ?? []), fy }, cover: dd.covers.wall, barDia: dd.wallBarDiaMm, diameters: dd.longDiametersMm };
    const a = data.adopted[d.key] as WallAdopted | undefined;
    return cached(d, [code, ctx, a, dec], () => rules.wallRow(d, ctx, a, fmt));
  });
  const punching = dem.punching.map((d) => {
    const ctx = { fc: fcOfElement(d.joint.columnElementId), fy, cover: dd.covers.slab, topBarDia: 12 };
    return cached(d, [code, ctx, dec], () => rules.punchingRow(d, ctx, fmt));
  });
  const columnsFinal = seismic ? jointChecks(column, beam, modelStore.nodes, fmt, { fc: (r) => fcOfElement(groupOf(r.key)?.members.elements?.[0]), beamFc: (b) => fcOfElement(groupOf(b.key)?.members.elements?.[0]), fy, cover: dd.covers.column, beamCover: dd.covers.beam, settings: seismicSettings() }) : column;
  const sort = <T extends { level?: string; name: string }>(rows: T[]) => rows.sort((a, b) => (a.level ?? '').localeCompare(b.level ?? '', undefined, { numeric: true }) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  return { beam: sort(beam), line: sort(line), column: sort(columnsFinal), slab: sort(slab), wall: sort(wall), punching: sort(punching), code: codeName, basis, combos: sets.length };
}

export const familyRows = (rows: SheetRows, f: SheetFamily): SheetRow[] => rows[f];

export async function downloadRcSheets(rows: SheetRows, tr: (k: string) => string): Promise<void> {
  const { exportToExcel } = await import('../export/excel');
  const { rcSheetsWorkbook } = await import('../rc-sheets/workbook');
  const name = (modelStore.model.name || 'stabileo').replace(/[^\w.-]+/g, '-');
  await exportToExcel({ filename: `${name}-${tr('rcSheets.fileName')}.xlsx`, onlyExtras: true, extraSheets: rcSheetsWorkbook(rows, tr), provenance: false });
}
