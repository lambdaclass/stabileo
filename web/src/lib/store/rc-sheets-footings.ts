import { modelStore } from './model.svelte';
import { criteriaOf } from '../rc-sheets/criteria';
import { resultsStore } from './results.svelte';
import { physicalGroups } from './physical';
import { designData } from './design-data';
import { concreteFc } from '../model/design-data';
import { findProfile } from '../model/geotechnical';
import { columnOn } from '../model/foundation/generate';
import { planHalf } from '../model/building/build-on-grid';
import { SETTLEMENT_CASE_ID } from '../engine/settlement-case';
import { footingDemands } from '../rc-sheets/footing-demands';
import { withEdges } from '../rc-sheets/footing-edges';
import { leverOf } from '../rc-sheets/footing-design';
import { designStrap, strapDemand, type StrapLoad } from '../rc-sheets/footing-strap';
import type { BeamContext, BeamDemand, BeamRow } from '../rc-sheets/beam-row';
import type { LineLayout } from '../rc-sheets/beam-line';
import { withOverlaps } from '../rc-sheets/footing-overlaps';
import type { SheetRules } from '../rc-sheets/codes';
import type { ColumnRow } from '../rc-sheets/column-row';
import type { DemandSet } from '../rc-sheets/demands';
import type { Fmt } from '../rc-sheets/format';
import { FOOTING_BAR_RANGE, listIn, type Adopted } from '../rc-sheets/types';
import { rcSheetsData, saveRcSheetsData } from './rc-sheets.svelte';
import type { FootingAdopted, FootingContext, FootingDemand, FootingRow, FootingSetup, FootingSizing, FootingSoil, StrapResult } from '../rc-sheets/footing-types';

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
  };
}

/** Up the column from its foot to the first node a beam or a slab frames into, m. */
function storeyAbove(nodeId: number, first: number): number | undefined {
  const z0 = modelStore.nodes.get(nodeId)?.z ?? 0;
  let at = nodeId, el: number | undefined = first;
  for (let k = 0; k < 50 && el !== undefined; k++) {
    const e = modelStore.elements.get(el);
    if (!e) return undefined;
    const top = e.nodeI === at ? e.nodeJ : e.nodeI;
    const framed = [...modelStore.elements.values()].some((x) => x.id !== el && (x.nodeI === top || x.nodeJ === top) && columnOn(top) !== x.id);
    if (framed) return (modelStore.nodes.get(top)?.z ?? z0) - z0;
    at = top; el = columnOn(top);
  }
  return undefined;
}

function columnAt(nodeId: number) {
  const id = columnOn(nodeId);
  const half = id === undefined ? null : planHalf(id);
  if (id === undefined || !half) return null;
  const g = physicalGroups().find((x) => x.physical.kind === 'column' && (x.members.elements ?? []).includes(id));
  const storey = storeyAbove(nodeId, id);
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
export function currentFootingDemands(sets: readonly DemandSet[], levelAt?: (z: number) => string): FootingDemand[] {
  const types = new Map(modelStore.model.loadCases.map((c) => [c.id, c.type ?? 'D']));
  const cases = [...resultsStore.perCase3D].filter(([id]) => id !== SETTLEMENT_CASE_ID).map(([id, result]) => ({ type: types.get(id) ?? 'D', result }));
  const demands = footingDemands({
    supportNodes: [...modelStore.supports.values()].map((s) => s.nodeId),
    nodes: modelStore.nodes as never,
    footings: [...modelStore.model.footings.values()],
    columnAt, soilOf, sets, cases, ...(levelAt ? { levelAt } : {}),
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

/** A footing's position and balance by hand, over the property lines; null clears it. */
export function setFootingSetup(key: string, setup: FootingSetup | null): void {
  const d = rcSheetsData();
  const all = { ...(d.footingSetup ?? {}) };
  if (!setup || (!setup.position && !setup.balance)) delete all[key]; else all[key] = setup;
  const adopted = { ...d.adopted };
  delete adopted[key];
  saveRcSheetsData({ ...d, adopted, footingSetup: Object.keys(all).length ? all : undefined });
}

const columnBarsOf = (d: FootingDemand, columns: readonly ColumnRow[]): FootingContext['columnBars'] => {
  const col = d.column?.rowKey ? columns.find((r) => r.key === d.column!.rowKey) : undefined;
  const a = col?.adopted;
  return a && col ? {
    count: 4 + 2 * a.nx + 2 * a.ny + (a.inner ? 2 * Math.max(1, a.inner.rows ?? 1) * (a.inner.nx + a.inner.ny) : 0),
    dia: Math.max(a.corner, a.dx, a.dy, a.inner?.dia ?? 0), tension: col.req.barsTension ?? !col.req.compressionDominated,
  } : undefined;
};

const columnFcOf = (d: FootingDemand): number => {
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
  return {
    fc: fcOfMaterial(f?.concreteMaterialId) ?? colFc, fy: dd.rebarFy, cover: d.footing?.cover ?? dd.covers.footing, sizing, criteria: criteriaOf(dd.designOptions?.criteria),
    diameters: footingDiameters(dd.longDiametersMm), preferred: { x: prefs.bottomMatDiameterXmm, y: prefs.bottomMatDiameterYmm }, columnFc: colFc,
    ...(bars ? { columnBars: bars } : {}), ...(second ? { second } : {}),
  };
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

export { withOverlaps };

/** The row's footing written to the model, made where there is none, its top at the column's foot; a combined footing as one carrying both columns, in place of theirs. One undo step. */
export function writeFootingToModel(row: FootingRow): number {
  const a = row.adopted, d = row.demand, o = d.carried;
  const data = { B: a.B, L: a.L, thickness: a.h, eccentricityB: a.ex, eccentricityL: a.ey, cover: row.cover, rotationDeg: 0, ...(d.footing ? {} : { foundingElevation: d.at.z - a.h }) };
  let id = d.footing?.id;
  modelStore.batchFoundation(() => {
    if (o) for (const f of [...modelStore.model.footings.values()]) if (f.id !== id && (f.nodeId === o.nodeId || f.supportedNodeIds?.includes(o.nodeId))) modelStore.removeFooting(f.id);
    if (id === undefined) id = modelStore.addFooting(d.nodeId, d.name);
    const col = columnOn(d.nodeId);
    modelStore.updateFooting(id, { ...data, ...(o ? { kind: 'combined' as const, supportedNodeIds: [o.nodeId] } : {}), ...(col !== undefined ? { columnElementId: col } : {}) });
  });
  return id!;
}

/** What makes the footing rows out of date besides the results: the model's footings and soils and the mesh preferences. */
export const foundationStamp = (): string =>
  JSON.stringify([[...modelStore.model.footings.values()].map(({ revision: _r, ...f }) => f), modelStore.model.geotechnical ?? null, modelStore.footingMatPreferences()]);

/** Where a strap's beam is found by its footings: the model's member, or one for the pair of footings it joins. */
export const strapKeyOf = (row: Pick<FootingRow, 'key'>, s: Pick<StrapResult, 'group' | 'partnerKey'>): string =>
  s.group !== undefined ? `g${s.group}` : `strap:${[row.key, s.partnerKey].sort().join('|')}`;

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
  for (const row of rows) for (const s of row.edge?.straps ?? []) {
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
