import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { physicalGroups, physicalThickness } from './physical';
import { designData, patchOwnDesignData } from './design-data';
import { designComboIds, narrowPerCombo } from '../engine/result-scopes';
import { computeJointPsiFromModel } from '../engine/codes/argentina/cirsoc201';
import { concreteFc } from '../model/design-data';
import { beamDemands, columnDemands, slabDemands, type DemandGroup, type DemandInput, type DemandSet } from '../rc-sheets/demands';
import { beamRow, type BeamRow } from '../rc-sheets/beam-row';
import { columnRow, type ColumnRow } from '../rc-sheets/column-row';
import { slabRow, type SlabRow } from '../rc-sheets/slab-row';
import { makeFmt, type Fmt } from '../rc-sheets/format';
import { defaultRcSheetsData, type Adopted, type BeamAdopted, type ColumnAdopted, type RcSheetsData, type SheetFamily, type SlabAdopted, type TorsionMode } from '../rc-sheets/types';
import type { AnalysisResults3D } from '../engine/types-3d';

export type SheetRow = BeamRow | ColumnRow | SlabRow;

export interface SheetRows {
  beam: BeamRow[];
  column: ColumnRow[];
  slab: SlabRow[];
  /** Where the forces came from: the design combinations, or the result on screen when none is solved. */
  basis: 'combinations' | 'single' | 'none';
  combos: number;
}

const DEFAULT_FC = 25;

export function rcSheetsData(): RcSheetsData {
  return designData().rcSheets ?? defaultRcSheetsData();
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

export function adoptAll(rows: readonly SheetRow[]): void {
  const d = rcSheetsData();
  const adopted = { ...d.adopted };
  for (const r of rows) if (!adopted[r.key]) adopted[r.key] = JSON.parse(JSON.stringify(r.proposed)) as Adopted;
  save({ ...d, adopted });
}

export function setTorsionMode(torsion: TorsionMode): void {
  save({ ...rcSheetsData(), torsion });
}

function levelName(id: string | undefined): string | undefined {
  if (!id) return undefined;
  if (id.startsWith('z:')) return `z = ${Number(id.slice(2)).toFixed(2)} m`;
  return modelStore.grid?.levels.find((l) => l.id === id)?.name ?? id;
}

const isDeadCase = (type: string) => type.toUpperCase() === 'D';

export function designSets(): { sets: DemandSet[]; basis: SheetRows['basis']; dead: AnalysisResults3D[] } {
  const combos = modelStore.combinations;
  const deadIds = new Set(modelStore.model.loadCases.filter((c) => isDeadCase(c.type)).map((c) => c.id));
  const dead = [...deadIds].map((id) => resultsStore.perCase3D.get(id)).filter((r): r is AnalysisResults3D => !!r);
  const solved = narrowPerCombo(resultsStore.perCombo3D, designComboIds(combos));
  if (solved.size) {
    const sets = [...solved].map(([id, result]) => {
      const c = combos.find((x) => x.id === id);
      return { name: c?.name ?? `#${id}`, result, deadFactor: (c?.factors ?? []).filter((f) => deadIds.has(f.caseId)).reduce((s, f) => s + f.factor, 0) };
    });
    return { sets, basis: 'combinations', dead };
  }
  const r = resultsStore.results3D;
  return r && !r.magnitude ? { sets: [{ name: '—', result: r }], basis: 'single', dead: [] } : { sets: [], basis: 'none', dead: [] };
}

function demandInput(sets: DemandSet[], dead: AnalysisResults3D[]): DemandInput {
  const supportsByNode = new Map([...modelStore.supports.values()].map((s) => [s.nodeId, s]));
  const groups: DemandGroup[] = physicalGroups().map((g) => ({
    id: g.id, name: g.name, kind: g.physical.kind, level: levelName(g.physical.levelFrom),
    elements: g.members.elements ?? [], quads: g.members.quads ?? [], plates: g.members.plates ?? [],
  }));
  return {
    nodes: modelStore.nodes, elements: modelStore.elements as never, sections: modelStore.sections as never,
    supportNodes: new Set(supportsByNode.keys()),
    shells: { nodes: modelStore.nodes, quads: modelStore.quads, plates: modelStore.plates },
    groups, sets, dead,
    levelAt: (z) => modelStore.grid?.levels.find((l) => Math.abs(l.z - z) < 0.01)?.name ?? `z = ${z.toFixed(2)} m`,
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

const demandCache = new WeakMap<object, { beams: ReturnType<typeof beamDemands>; columns: ReturnType<typeof columnDemands>; slabs: ReturnType<typeof slabDemands>; groupsRev: unknown }>();

const rowCache = new WeakMap<object, Map<string, SheetRow>>();

function cached<D extends object, R extends SheetRow>(demand: D, inputs: unknown, compute: () => R): R {
  const k = JSON.stringify(inputs);
  let m = rowCache.get(demand);
  if (!m) { m = new Map(); rowCache.set(demand, m); }
  const hit = m.get(k);
  if (hit) return hit as R;
  const row = compute();
  m.clear();
  m.set(k, row);
  return row;
}

export function buildSheetRows(fmt: Fmt = makeFmt(',')): SheetRows {
  const { sets, basis, dead } = designSets();
  if (!sets.length) return { beam: [], column: [], slab: [], basis, combos: 0 };
  const dd = designData();
  const data = dd.rcSheets ?? defaultRcSheetsData();
  const key = basis === 'combinations' ? resultsStore.perCombo3D : resultsStore.results3D!;
  const groupsRev = modelStore.model.groups;
  let dem = demandCache.get(key);
  if (!dem || dem.groupsRev !== groupsRev) {
    const input = demandInput(sets, dead);
    const byGroup = new Map(physicalGroups().map((g) => [g.id, g]));
    dem = {
      beams: beamDemands(input), columns: columnDemands(input),
      slabs: slabDemands(input, (g) => { const pg = byGroup.get(g.id); return pg ? physicalThickness(pg) : null; }),
      groupsRev,
    };
    demandCache.set(key, dem);
  }
  const groupsById = new Map(physicalGroups().map((g) => [g.id, g]));
  const groupOf = (k: string) => groupsById.get(Number(k.split(':')[1]));
  const fy = dd.rebarFy;
  const dec = fmt(1.5, 1);
  const beam = dem.beams.map((d) => {
    const ctx = { mat: { fc: fcOfElement(groupOf(d.key)?.members.elements?.[0]), fy }, cover: dd.covers.beam, stirrupDia: dd.stirrupDiaMm, diameters: dd.longDiametersMm, torsion: data.torsion };
    const a = data.adopted[d.key] as BeamAdopted | undefined;
    return cached(d, [ctx, a, dec], () => beamRow(d, ctx, a, fmt));
  });
  const column = dem.columns.map((d) => {
    const ctx = { mat: { fc: fcOfElement(groupOf(d.key)?.members.elements?.[0]), fy }, cover: dd.covers.column, tieDia: dd.stirrupDiaMm, diameters: dd.longDiametersMm };
    const a = data.adopted[d.key] as ColumnAdopted | undefined;
    return cached(d, [ctx, a, dec], () => columnRow(d, ctx, a, fmt));
  });
  const slab = dem.slabs.map((d) => {
    const g = groupOf(d.key);
    const ctx = { mat: { fc: fcOfShells(g?.members.quads ?? [], g?.members.plates ?? []), fy }, cover: dd.covers.slab, diameters: [6, 8, 10, 12, 16] };
    const a = data.adopted[d.key] as SlabAdopted | undefined;
    return cached(d, [ctx, a, dec], () => slabRow(d, ctx, a, fmt));
  });
  const sort = <T extends { level?: string; name: string }>(rows: T[]) => rows.sort((a, b) => (a.level ?? '').localeCompare(b.level ?? '', undefined, { numeric: true }) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  return { beam: sort(beam), column: sort(column), slab: sort(slab), basis, combos: sets.length };
}

export const familyRows = (rows: SheetRows, f: SheetFamily): SheetRow[] => rows[f];

export async function downloadRcSheets(rows: SheetRows, tr: (k: string) => string): Promise<void> {
  const { exportToExcel } = await import('../export/excel');
  const { rcSheetsWorkbook } = await import('../rc-sheets/workbook');
  const name = (modelStore.model.name || 'stabileo').replace(/[^\w.-]+/g, '-');
  await exportToExcel({ filename: `${name}-${tr('rcSheets.fileName')}.xlsx`, onlyExtras: true, extraSheets: rcSheetsWorkbook(rows, tr), provenance: false });
}
