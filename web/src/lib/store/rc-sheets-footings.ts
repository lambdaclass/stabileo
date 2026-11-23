import { modelStore } from './model.svelte';
import { criteriaOf } from '../rc-sheets/criteria';
import { resultsStore } from './results.svelte';
import { physicalGroups } from './physical';
import { designData } from './design-data';
import { concreteFc, pileLayerStrata, presumedPileOf } from '../model/design-data';
import { pileCapacity } from '../model/foundation/piles';
import { findProfile } from '../model/geotechnical';
import { columnOn } from '../model/foundation/generate';
import { planHalf } from '../model/building/build-on-grid';
import { SETTLEMENT_CASE_ID } from '../engine/settlement-case';
import { footingDemands, type FootingPier } from '../rc-sheets/footing-demands';
import { withEdges } from '../rc-sheets/footing-edges';
import { leverOf } from '../rc-sheets/footing-design';
import { designStrap, strapDemand, type StrapLoad } from '../rc-sheets/footing-strap';
import type { BeamContext, BeamDemand, BeamRow } from '../rc-sheets/beam-row';
import type { LineLayout } from '../rc-sheets/beam-line';
import type { SheetRules } from '../rc-sheets/codes';
import type { ColumnRow } from '../rc-sheets/column-row';
import type { DemandSet } from '../rc-sheets/demands';
import type { Fmt } from '../rc-sheets/format';
import { FOOTING_BAR_RANGE, listIn, type Adopted } from '../rc-sheets/types';
import { rcSheetsData, saveRcSheetsData } from './rc-sheets.svelte';
import type { FootingAdopted, FootingContext, FootingDemand, FootingGroup, FootingRow, FootingSetup, FootingSizing, FootingSolution, FootingSoil, FoundationSystem, PileSpec, StrapResult } from '../rc-sheets/footing-types';
import { chooseFoundationsSteps, groupDemand, lineOf } from '../rc-sheets/footing-choice';
import { check } from '../rc-sheets/types';

const DEFAULT_FC = 25;
export const FOOTING_DIAMETERS: readonly number[] = [10, 12, 16, 20, 25];

/** The bars a footing's mats choose from: the project's longitudinal list within the footings' range, or the whole list when none falls in it. */
export const footingDiameters = (list: readonly number[]): number[] => { const own = listIn(list, FOOTING_BAR_RANGE); return own.length ? own : [...list].sort((p, q) => p - q); };

const fcOfMaterial = (id: number | null | undefined): number | undefined =>
  id === null || id === undefined ? undefined : concreteFc(modelStore.materials.get(id) as never);

/** The soil a footing stands on: its profile's allowable pressure, else the design data's presumed one. */
export function soilOf(profileId: number | null): FootingSoil {
  const geo = modelStore.model.geotechnical;
  const p = findProfile(geo, profileId ?? geo?.defaultProfileId ?? null);
  if (!p || p.bearing.kind !== 'allowablePressure' || !(p.bearing.allowableBearingKPa > 0)) return { name: '', allowable: designData().presumedBearingKPa, presumed: true };
  return {
    name: p.name, allowable: p.bearing.allowableBearingKPa,
    ...(p.bearing.edgeFactor ? { edgeFactor: p.bearing.edgeFactor } : {}),
    ...(p.unitWeightKNm3 ? { unitWeight: p.unitWeightKNm3 } : {}),
    ...(p.subgradeModulusKNm3 && p.subgradeModulusKNm3 > 0 ? { subgrade: p.subgradeModulusKNm3 } : {}),
  };
}

/** The piles a pile foundation is designed with: the presumed pile's diameter and length, and the allowable load the soil profile's strata give it, else the presumed one; the group's efficiency is the criterion's. */
export function pileSpec(): PileSpec {
  const dd = designData(), p = presumedPileOf(dd.presumedPile), geo = modelStore.model.geotechnical;
  const prof = findProfile(geo, geo?.defaultProfileId ?? null);
  const cap = prof?.strata?.length ? pileCapacity(prof.strata, p.diameter, p.length) : null;
  const efficiency = criteriaOf(dd.designOptions?.criteria).footingPileEfficiency;
  if (cap && cap.total > 0 && !cap.beyondStrata) return { diameter: p.diameter, length: p.length, capacity: cap.total, source: 'strata', efficiency, strata: prof!.strata! };
  const layers = p.layers?.length ? pileLayerStrata(p.layers) : null, own = layers ? pileCapacity(layers, p.diameter, p.length) : null;
  if (layers && own && own.total > 0 && !own.beyondStrata) return { diameter: p.diameter, length: p.length, capacity: own.total, source: 'layers', efficiency, strata: layers };
  return { diameter: p.diameter, length: p.length, capacity: p.capacity, source: 'presumed', efficiency };
}

/** Up the column from its foot to the first node a beam or a slab frames into, m. */
function storeyAbove(nodeId: number, first: number, atNode: (node: number) => readonly number[]): number | undefined {
  const z0 = modelStore.nodes.get(nodeId)?.z ?? 0;
  let at = nodeId, el: number | undefined = first;
  for (let k = 0; k < 50 && el !== undefined; k++) {
    const e = modelStore.elements.get(el);
    if (!e) return undefined;
    const top = e.nodeI === at ? e.nodeJ : e.nodeI;
    const framed = atNode(top).some((id) => id !== el && columnOn(top) !== id);
    if (framed) return (modelStore.nodes.get(top)?.z ?? z0) - z0;
    at = top; el = columnOn(top);
  }
  return undefined;
}

/** The elements framing into each node, built on first asking. */
function elementsAtNodes(): (node: number) => readonly number[] {
  let by: Map<number, number[]> | undefined;
  return (node) => {
    if (!by) {
      by = new Map();
      for (const e of modelStore.elements.values()) for (const n of e.nodeI === e.nodeJ ? [e.nodeI] : [e.nodeI, e.nodeJ]) { let a = by.get(n); if (!a) by.set(n, (a = [])); a.push(e.id); }
    }
    return by.get(node) ?? [];
  };
}

function columnAt(nodeId: number, atNode: (node: number) => readonly number[]) {
  const id = columnOn(nodeId);
  const half = id === undefined ? null : planHalf(id);
  if (id === undefined || !half) return null;
  const g = physicalGroups().find((x) => x.physical.kind === 'column' && (x.members.elements ?? []).includes(id));
  const storey = storeyAbove(nodeId, id, atNode);
  return { b: 2 * half[0], h: 2 * half[1], name: g?.name ?? `E${id}`, ...(g ? { rowKey: `column:${g.id}:0` } : {}), ...(storey && storey > 0 ? { storey } : {}) };
}

/** The model's strap beams, one bar each between two nodes: their physical member and section. */
function strapMembers(): Array<{ group: number; key: string; a: number; b: number; width: number; depth: number }> {
  const out: Array<{ group: number; key: string; a: number; b: number; width: number; depth: number }> = [];
  for (const g of physicalGroups()) {
    if (g.physical.kind !== 'beam' || g.physical.typology !== 'strap') continue;
    const els = (g.members.elements ?? []).map((id) => modelStore.elements.get(id)).filter((e): e is NonNullable<typeof e> => !!e);
    if (!els.length) continue;
    const ends = new Map<number, number>();
    for (const e of els) for (const n of [e.nodeI, e.nodeJ]) ends.set(n, (ends.get(n) ?? 0) + 1);
    const tips = [...ends].filter(([, k]) => k === 1).map(([n]) => n);
    const sec = modelStore.sections.get(els[0]!.sectionId);
    if (tips.length !== 2 || !sec?.b || !sec?.h) continue;
    out.push({ group: g.id, key: `beam:${g.id}:0`, a: tips[0]!, b: tips[1]!, width: sec.b, depth: sec.h });
  }
  return out;
}

/** The footings the sheets design, read from the model's supports and footings and the results the other families read. */
export function currentFootingDemands(sets: readonly DemandSet[], levelAt?: (z: number) => string, piers?: readonly FootingPier[]): FootingDemand[] {
  const atNode = elementsAtNodes();
  const types = new Map(modelStore.model.loadCases.map((c) => [c.id, c.type ?? 'D']));
  const cases = [...resultsStore.perCase3D].filter(([id]) => id !== SETTLEMENT_CASE_ID).map(([id, result]) => ({ type: types.get(id) ?? 'D', result }));
  const demands = footingDemands({
    supportNodes: [...modelStore.supports.values()].map((s) => s.nodeId),
    nodes: modelStore.nodes as never,
    footings: [...modelStore.model.footings.values()],
    columnAt: (n: number) => columnAt(n, atNode), soilOf, sets, cases, ...(levelAt ? { levelAt } : {}), ...(piers?.length ? { piers } : {}),
  });
  return withEdges(demands, { lines: designData().propertyLines ?? {}, setup: rcSheetsData().footingSetup ?? {}, straps: strapMembers() });
}

export function footingSizing(sheets: { footingSizing?: FootingSizing }): FootingSizing {
  return sheets.footingSizing ?? 'minimum';
}

/** How every footing is sized from now on; 'minimum' is the default and is not stored. */
export function setFootingSizing(mode: FootingSizing): void {
  const { footingSizing: _, ...d } = rcSheetsData();
  saveRcSheetsData(mode === 'minimum' ? d : { ...d, footingSizing: mode });
}

/** The layout adopted for the building's foundation: the one stored, else the recommendation where the model already holds footings, else none. */
export const foundationSystem = (sheets: { foundationSystem?: FoundationSystem | null }, modelHasFootings = modelStore.model.footings.size > 0): FoundationSystem | null =>
  sheets.foundationSystem !== undefined ? sheets.foundationSystem : modelHasFootings ? 'auto' : null;

export const isFootingKey = (key: string): boolean => key.startsWith('footing:');

/** Adopts a layout for the building's foundation, or none: the footings leave the drawings, the schedule and the 3D view. The bars adopted for the footings of another layout go with it. */
export function setFoundationSystem(mode: FoundationSystem | null): void {
  const d = rcSheetsData();
  if (foundationSystem(d) === mode && d.foundationSystem !== undefined) return;
  const adopted = Object.fromEntries(Object.entries(d.adopted).filter(([k]) => !isFootingKey(k)));
  const edited = (d.edited ?? []).filter((k) => !isFootingKey(k));
  saveRcSheetsData({ ...d, foundationSystem: mode, adopted, edited: edited.length ? edited : undefined });
}

/** A footing's position and balance by hand, over the property lines; null clears it. */
export function setFootingSetup(key: string, setup: FootingSetup | null): void {
  const d = rcSheetsData();
  const all = { ...(d.footingSetup ?? {}) };
  if (!setup || (!setup.position && !setup.balance && !setup.solution)) delete all[key]; else all[key] = setup;
  const adopted = { ...d.adopted };
  delete adopted[key];
  saveRcSheetsData({ ...d, adopted, footingSetup: Object.keys(all).length ? all : undefined });
}

const columnBarsOf = (d: FootingDemand, columns: readonly ColumnRow[]): FootingContext['columnBars'] => {
  if (d.column?.bars) return d.column.bars;
  const col = d.column?.rowKey ? columns.find((r) => r.key === d.column!.rowKey) : undefined;
  const a = col?.adopted;
  return a && col ? {
    count: 4 + 2 * a.nx + 2 * a.ny + (a.inner ? 2 * Math.max(1, a.inner.rows ?? 1) * (a.inner.nx + a.inner.ny) : 0),
    dia: Math.max(a.corner, a.dx, a.dy, a.inner?.dia ?? 0), tension: col.req.barsTension ?? !col.req.compressionDominated,
    ...(col.lap ? { lap: col.lap.length, lapFrom: (col.demand.joints?.bottom ?? 0) / 2 + (col.lap.from ?? 0) } : {}),
  } : undefined;
};

const columnFcOf = (d: FootingDemand): number => {
  if (d.column?.fc) return d.column.fc;
  const colId = columnOn(d.nodeId);
  return fcOfMaterial(colId !== undefined ? modelStore.elements.get(colId)?.materialId : undefined) ?? DEFAULT_FC;
};

export function footingContext(d: FootingDemand, sizing: FootingSizing, columns: readonly ColumnRow[]): FootingContext {
  const dd = designData();
  const colFc = columnFcOf(d);
  const f = d.footing ? modelStore.model.footings.get(d.footing.id) : undefined;
  const prefs = modelStore.footingMatPreferences();
  const bars = columnBarsOf(d, columns);
  const o = d.carried;
  const second = o ? { ...((b) => (b ? { columnBars: b } : {}))(columnBarsOf(o, columns)), columnFc: columnFcOf(o) } : undefined;
  const members = d.group ? Object.fromEntries(d.group.members.map((m) => [m.key, { ...((b) => (b ? { columnBars: b } : {}))(columnBarsOf(m, columns)), columnFc: columnFcOf(m) }])) : undefined;
  return {
    fc: fcOfMaterial(f?.concreteMaterialId) ?? colFc, fy: dd.rebarFy, cover: d.footing?.cover ?? dd.covers.footing, sizing, criteria: criteriaOf(dd.designOptions?.criteria),
    diameters: footingDiameters(dd.longDiametersMm), preferred: { x: prefs.bottomMatDiameterXmm, y: prefs.bottomMatDiameterYmm }, columnFc: colFc,
    ...(bars ? { columnBars: bars } : {}), ...(second ? { second } : {}), ...(members ? { members } : {}),
  };
}

/** The model's strips and mats, each one demand for the columns it holds, in place of theirs. */
function collapseModelGroups(demands: readonly FootingDemand[]): FootingDemand[] {
  const seen = new Set<string>();
  const out: FootingDemand[] = [];
  for (const d of demands) {
    const g = d.footing?.group;
    if (!g) { out.push(d); continue; }
    if (seen.has(d.key)) continue;
    const members = demands.filter((x) => g.members.includes(x.key)).sort((p, q) => p.nodeId - q.nodeId);
    members.forEach((x) => seen.add(x.key));
    const axis = g.kind === 'strip' ? lineOf(members) : null;
    out.push(groupDemand({ kind: g.kind, members, ...(axis ? { axis } : {}), reason: 'model' }));
  }
  return out;
}

/** The demands with the combined footings adopted before: each carrying its second column, whose own footing is then gone. */
export function withAdoptedCombined(demands: readonly FootingDemand[], adopted: Readonly<Record<string, Adopted>>): FootingDemand[] {
  const carried = new Map<string, FootingDemand>();
  for (const d of demands) {
    const w = (adopted[d.key] as FootingAdopted | undefined)?.with;
    const o = w ? demands.find((x) => x.key === w && x.key !== d.key) : undefined;
    if (o && !d.carried && !carried.has(o.key) && !carried.has(d.key)) carried.set(d.key, o);
  }
  const gone = new Set([...carried.values()].map((x) => x.key));
  return demands.filter((d) => !gone.has(d.key)).map((d) => (carried.has(d.key) ? { ...d, carried: carried.get(d.key)! } : d));
}

/** A footing's row from its adopted dimensions and bars when it has them, and how to design it again from another demand. */
export function footingRowOf(d: FootingDemand, rules: SheetRules, adopted: Record<string, Adopted>, sizing: FootingSizing, columns: readonly ColumnRow[], fmt: Fmt): { row: FootingRow; redo: (x: FootingDemand) => FootingRow } {
  const ctx = footingContext(d, sizing, columns);
  return { row: rules.footingRow(d, ctx, adopted[d.key] as FootingAdopted | undefined, fmt), redo: (x) => rules.footingRow(x, ctx, undefined, fmt) };
}

export interface FoundationInput {
  rules: SheetRules; adopted: Record<string, Adopted>; sizing: FootingSizing; columns: readonly ColumnRow[]; fmt: Fmt;
  /** Registers how a row is designed again from another demand. */
  redo(key: string, fn: (x: FootingDemand) => FootingRow): void;
  system: FoundationSystem; solutions: Readonly<Record<string, FootingSolution>>; matShare: number;
  /** The founding elevation the project states, m; absent, the one the deepest footing of each level asks for. */
  founding?: number;
}

/** Each row's own solution from the rows' setups. */
export const solutionsOf = (setup: Readonly<Record<string, FootingSetup>> | undefined): Record<string, FootingSolution> =>
  Object.fromEntries(Object.entries(setup ?? {}).flatMap(([k, v]) => (v.solution ? [[k, v.solution]] : [])));

/**
 * The building's foundation: every footing proposed, then chosen and grouped by the selection
 * rule (`chooseFoundations`), all founded at one level: the stated one, else the deepest the
 * rows ask for on each level, the rows designed again at it until it holds still. It yields
 * after every footing it designs and every layout it chooses, so a page can draw between them. The recommendation founds on piles where some shallow
 * foundation it came to needs a stronger soil than the one given (GA §8.1, §15.1).
 */
/** How far a layout is: through its footings one by one, then grouping them into combined footings, strips and mats, on a pass that levels their founding level or not. */
export interface FoundationStep { footing: number; footings: number; levelling: boolean; grouping?: true }

export function* foundationRowsSteps(feet: readonly FootingDemand[], o: FoundationInput): Generator<FoundationStep, FootingRow[]> {
  const rows = yield* layoutSteps(feet, o);
  if (o.system !== 'auto' || !rows.some((r) => r.sizing.needs !== undefined)) return rows;
  const piled = yield* layoutSteps(feet, { ...o, system: 'piles' });
  return piled.map((r) => ({ ...r, verifications: [check('rcSheets.foundation.pilesChosen', true), ...r.verifications] }));
}

function* layoutSteps(feet: readonly FootingDemand[], o: FoundationInput): Generator<FoundationStep, FootingRow[]> {
  const ctx = (d: FootingDemand) => footingContext(d, o.sizing, o.columns);
  const design = (d: FootingDemand, adopted?: FootingAdopted) => o.rules.footingRow(d, ctx(d), adopted, o.fmt);
  const piles = o.system === 'piles' ? pileSpec() : null;
  const grouped = collapseModelGroups(feet);
  const pass = function* (at: (d: FootingDemand) => number | undefined, levelling = false): Generator<FoundationStep, FootingRow[]> {
    const ds = grouped.map((d) => { const z = at(d); return z === undefined || d.footing ? d : { ...d, founding: z }; }).map((d) => (piles && !d.footing && !d.group && d.column ? { ...d, piles } : d));
    const rows: FootingRow[] = [];
    for (const d of ds) { const f = footingRowOf(d, o.rules, o.adopted, o.sizing, o.columns, o.fmt); o.redo(d.key, f.redo); rows.push(f.row); yield { footing: rows.length, footings: ds.length, levelling }; }
    const steps = chooseFoundationsSteps(rows, {
      capped: (d, cap) => o.rules.footingRow(d, ctx(d), undefined, o.fmt, cap),
      combine: (a, b) => { const d = { ...a, carried: b }; o.redo(d.key, (x) => design(x)); return design(d); },
      group: (g) => {
        const z = at(g.members[0]!);
        const d = groupDemand(g);
        const dz = z === undefined || d.footing ? d : { ...d, founding: z };
        o.redo(dz.key, (x) => design(x));
        return design(dz, o.adopted[dz.key] as FootingAdopted | undefined);
      },
    }, { system: o.system, solutions: o.solutions, matShare: o.matShare });
    for (;;) {
      const r = steps.next();
      if (r.done) { yield { footing: ds.length, footings: ds.length, levelling }; return r.value; }
      yield { footing: ds.length, footings: ds.length, levelling, grouping: true };
    }
  };
  if (o.founding !== undefined) return yield* pass(() => o.founding);
  let levels = new Map<string, number>();
  let rows = yield* pass(() => undefined);
  for (let k = 0; k < 3; k++) {
    const need = new Map<string, number>();
    for (const r of rows) if (!r.demand.footing && r.B > 0) { const lv = r.demand.level ?? ''; need.set(lv, Math.min(need.get(lv) ?? Infinity, r.demand.at.z - r.h)); }
    if (rows.every((r) => r.demand.footing || r.B <= 0 || Math.abs(r.founding - (need.get(r.demand.level ?? '') ?? r.founding)) < 1e-6)) break;
    levels = need;
    rows = yield* pass((d) => levels.get(d.level ?? ''), true);
  }
  return rows;
}

/** A pier's footing written to the model: one footing at its representative node carrying every other node of its base, a strip under a single wall, in place of any footing those nodes had. */
function writePierFooting(row: FootingRow, pier: NonNullable<FootingDemand['pier']>): number {
  const a = row.adopted, d = row.demand;
  const at = modelStore.nodes.get(d.nodeId);
  const dx = at ? d.at.x - at.x : 0, dy = at ? d.at.y - at.y : 0;
  const one = pier.walls.length === 1 ? Number(pier.walls[0]!.split(':')[1]) : NaN, wallGroupId = Number.isFinite(one) ? one : undefined;
  let id = d.footing?.id;
  modelStore.batchFoundation(() => {
    for (const f of [...modelStore.model.footings.values()]) if (f.id !== id && (pier.nodes.includes(f.nodeId) || f.supportedNodeIds?.some((n) => pier.nodes.includes(n)))) modelStore.removeFooting(f.id);
    if (id === undefined) id = modelStore.addFooting(d.nodeId, d.name);
    const col = columnOn(d.nodeId);
    modelStore.updateFooting(id, {
      B: a.B, L: a.L, thickness: a.h, eccentricityB: a.ex + dx, eccentricityL: a.ey + dy, cover: row.cover, rotationDeg: 0,
      ...(d.footing ? {} : { foundingElevation: row.founding }),
      kind: wallGroupId !== undefined ? 'strip' as const : 'combined' as const, supportedNodeIds: pier.nodes.filter((n) => n !== d.nodeId),
      ...(wallGroupId !== undefined ? { wallGroupId } : {}),
      ...(col !== undefined ? { columnElementId: col } : {}),
    });
  });
  return id!;
}

/** A strip or a mat written to the model: one footing at its first column carrying every other node it holds, in place of any footing those nodes had. */
function writeGroupFooting(row: FootingRow, g: FootingGroup): number {
  const a = row.adopted, d = row.demand;
  const nodes = g.members.flatMap((m) => m.pier?.nodes ?? [m.nodeId]);
  const at = modelStore.nodes.get(d.nodeId);
  const dx = at ? d.at.x - at.x : 0, dy = at ? d.at.y - at.y : 0;
  let id: number | undefined;
  modelStore.batchFoundation(() => {
    for (const f of [...modelStore.model.footings.values()]) if (nodes.includes(f.nodeId) || f.supportedNodeIds?.some((n) => nodes.includes(n))) modelStore.removeFooting(f.id);
    id = modelStore.addFooting(d.nodeId, d.name);
    const col = columnOn(d.nodeId);
    modelStore.updateFooting(id, {
      B: a.B, L: a.L, thickness: a.h, eccentricityB: a.ex + dx, eccentricityL: a.ey + dy, cover: row.cover, rotationDeg: 0, foundingElevation: row.founding,
      kind: g.kind, supportedNodeIds: nodes.filter((n) => n !== d.nodeId), ...(col !== undefined ? { columnElementId: col } : {}),
    });
  });
  return id!;
}

/** The row's footing written to the model, made where there is none, its top at the column's foot; a combined footing as one carrying both columns, in place of theirs; a pier's as one under its whole base. One undo step. */
export function writeFootingToModel(row: FootingRow): number {
  if (row.demand.group) return writeGroupFooting(row, row.demand.group);
  if (row.demand.pier) return writePierFooting(row, row.demand.pier);
  const a = row.adopted, d = row.demand, o = d.carried;
  const data = { B: a.B, L: a.L, thickness: a.h, eccentricityB: a.ex, eccentricityL: a.ey, cover: row.cover, rotationDeg: 0, foundingElevation: row.founding, pedestal: row.pedestal > 1e-3 && d.column ? { B: row.pedestalSection?.b ?? d.column.b, L: row.pedestalSection?.h ?? d.column.h, height: row.pedestal } : undefined };
  let id = d.footing?.id;
  modelStore.batchFoundation(() => {
    if (o) for (const f of [...modelStore.model.footings.values()]) if (f.id !== id && (f.nodeId === o.nodeId || f.supportedNodeIds?.includes(o.nodeId))) modelStore.removeFooting(f.id);
    if (id === undefined) id = modelStore.addFooting(d.nodeId, d.name);
    const col = columnOn(d.nodeId);
    const p = a.piles, cap = p ? { kind: 'pileCap' as const, piles: { count: p.at.length, diameter: p.diameter, length: p.length, spacing: row.cap?.spacing ?? 3 * p.diameter } } : {};
    modelStore.updateFooting(id, { ...data, ...(o ? { kind: 'combined' as const, supportedNodeIds: [o.nodeId] } : {}), ...cap, ...(col !== undefined ? { columnElementId: col } : {}) });
  });
  return id!;
}

/** What makes the footing rows out of date besides the results: the model's footings and soils and the mesh preferences. */
export const foundationStamp = (): string =>
  JSON.stringify([[...modelStore.model.footings.values()].map(({ revision: _r, ...f }) => f), modelStore.model.geotechnical ?? null, modelStore.footingMatPreferences()]);

/** Where a strap's beam is found by its footings: the model's member, or one for the pair of footings it joins. */
export const strapKeyOf = (row: Pick<FootingRow, 'key'>, s: Pick<StrapResult, 'group' | 'partnerKey' | 'holder'>): string =>
  s.group !== undefined ? `g${s.group}` : `strap:${[s.holder ?? row.key, s.partnerKey].sort().join('|')}`;

/** The footings a row's straps start from: the row itself, or, on a strip, each column's own footing as the strap reads it (its demand, the strip's thickness and level). */
function strapHolders(row: FootingRow): Array<{ row: FootingRow; s: StrapResult }> {
  const own = (row.edge?.straps ?? []).map((s) => ({ row, s }));
  const grouped = (row.group?.straps ?? []).flatMap((s) => {
    const m = row.demand.group?.members.find((x) => x.key === s.holder);
    return m ? [{ row: { ...row, key: m.key, name: m.name, demand: m } as FootingRow, s }] : [];
  });
  return [...own, ...grouped];
}

export interface StrapDesign { beam: BeamRow; line: LineLayout; b: number; h: number; group?: number; redo: (b: number, h: number, fc?: number) => { beam: BeamRow; line: LineLayout } }

/**
 * Every strap beam of the footings, designed once with all it balances: a member the model has
 * keeps its section and its analysis forces, the statics added on; one the model has not is
 * proposed. `baseOf` gives a member's span demand and `ctxOf` the beam context a strap is designed
 * in (the member's own, or the footing's concrete and cover).
 */
export function designFootingStraps(rows: readonly FootingRow[], o: {
  rules: Pick<SheetRules, 'beamRow' | 'beamLine'>; fmt: Fmt;
  baseOf: (key: string) => BeamDemand | undefined;
  ctxOf: (base: BeamDemand | undefined, row: FootingRow) => BeamContext;
  adoptedOf: (group: number) => unknown;
}): Map<string, StrapDesign> {
  const groups = new Map<string, Array<{ row: FootingRow; s: StrapResult }>>();
  for (const { row, s } of rows.flatMap(strapHolders)) {
    const k = strapKeyOf(row, s);
    groups.set(k, [...(groups.get(k) ?? []), { row, s }]);
  }
  const out = new Map<string, StrapDesign>();
  for (const [k, list] of groups) {
    const first = list[0]!;
    const partner = first.row.demand.edge?.partners.find((p) => p.axis === first.s.axis);
    const base = partner?.beam ? o.baseOf(partner.beam.key) : undefined;
    if (partner?.beam && !base) continue;
    const origin = base?.line?.startNode ?? [first.row.key, first.s.partnerKey].sort()[0];
    const isOrigin = (r: FootingRow) => (base ? r.demand.nodeId === origin : r.key === origin);
    const half = (c: { b: number; h: number } | null | undefined) => (first.s.axis === 'x' ? c?.b ?? 0 : c?.h ?? 0) / 2;
    const mine = half(first.row.demand.column), theirs = half(partner?.column);
    const [startHalf, endHalf] = isOrigin(first.row) ? [mine, theirs] : [theirs, mine];
    const loads: StrapLoad[] = list.map(({ row, s }) => {
      const anchor = row.demand.edge!.anchor;
      const a = s.axis === 'x' ? anchor[0] : anchor[1];
      return { demand: row.demand, lever: leverOf(row.demand, row.adopted.h), along: s.e, u: (a > 0 ? -1 : 1) as 1 | -1, axis: s.axis, L: s.L, reversed: !isOrigin(row) };
    });
    const own = first.row.adopted.straps?.[first.s.axis];
    const section = base ? { b: base.b, h: base.h } : own ?? { b: first.s.b, h: first.s.h };
    const demand = (b: number, h: number) => strapDemand({
      key: base?.key ?? k, name: base?.name ?? list.map((x) => x.row.name).concat(list.length < 2 ? [first.s.partner] : []).join('–'), ...(first.row.level ? { level: first.row.level } : {}),
      L: first.s.L, b, h, halves: [startHalf, endHalf], ...(base ? { base } : {}), loads,
    });
    const ctx = o.ctxOf(base, first.row);
    const adopted = base?.line ? o.adoptedOf(base.line.group) : undefined;
    const d = designStrap(o.rules, ctx, demand, section, !!base || !!own, o.fmt, adopted);
    out.set(k, { ...d, ...(base?.line ? { group: base.line.group } : {}), redo: (b, h, fc) => { const r = designStrap(o.rules, fc ? { ...ctx, mat: { ...ctx.mat, fc } } : ctx, demand, { b, h }, true, o.fmt); return { beam: r.beam, line: r.line }; } });
  }
  return out;
}
