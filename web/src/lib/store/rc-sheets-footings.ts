import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { physicalGroups } from './physical';
import { designData } from './design-data';
import { concreteFc } from '../model/design-data';
import { findProfile } from '../model/geotechnical';
import { columnOn } from '../model/foundation/generate';
import { planHalf } from '../model/building/build-on-grid';
import { SETTLEMENT_CASE_ID } from '../engine/settlement-case';
import { footingDemands } from '../rc-sheets/footing-demands';
import { withOverlaps } from '../rc-sheets/footing-overlaps';
import type { SheetRules } from '../rc-sheets/codes';
import type { ColumnRow } from '../rc-sheets/column-row';
import type { DemandSet } from '../rc-sheets/demands';
import type { Fmt } from '../rc-sheets/format';
import type { Adopted } from '../rc-sheets/types';
import { rcSheetsData, saveRcSheetsData } from './rc-sheets.svelte';
import type { FootingAdopted, FootingContext, FootingDemand, FootingRow, FootingSizing, FootingSoil } from '../rc-sheets/footing-types';

const DEFAULT_FC = 25;
export const FOOTING_DIAMETERS: readonly number[] = [10, 12, 16, 20, 25];

const fcOfMaterial = (id: number | null | undefined): number | undefined =>
  id === null || id === undefined ? undefined : concreteFc(modelStore.materials.get(id) as never);

function soilOf(profileId: number | null): FootingSoil | null {
  const geo = modelStore.model.geotechnical;
  const p = findProfile(geo, profileId ?? geo?.defaultProfileId ?? null);
  if (!p || p.bearing.kind !== 'allowablePressure' || !(p.bearing.allowableBearingKPa > 0)) return null;
  return {
    name: p.name, allowable: p.bearing.allowableBearingKPa,
    ...(p.bearing.edgeFactor ? { edgeFactor: p.bearing.edgeFactor } : {}),
    ...(p.unitWeightKNm3 ? { unitWeight: p.unitWeightKNm3 } : {}),
  };
}

function columnAt(nodeId: number) {
  const id = columnOn(nodeId);
  const half = id === undefined ? null : planHalf(id);
  if (id === undefined || !half) return null;
  const g = physicalGroups().find((x) => x.physical.kind === 'column' && (x.members.elements ?? []).includes(id));
  return { b: 2 * half[0], h: 2 * half[1], name: g?.name ?? `E${id}`, ...(g ? { rowKey: `column:${g.id}:0` } : {}) };
}

/** The footings the sheets design, read from the model's supports and footings and the results the other families read. */
export function currentFootingDemands(sets: readonly DemandSet[], levelAt?: (z: number) => string): FootingDemand[] {
  const types = new Map(modelStore.model.loadCases.map((c) => [c.id, c.type ?? 'D']));
  const cases = [...resultsStore.perCase3D].filter(([id]) => id !== SETTLEMENT_CASE_ID).map(([id, result]) => ({ type: types.get(id) ?? 'D', result }));
  return footingDemands({
    supportNodes: [...modelStore.supports.values()].map((s) => s.nodeId),
    nodes: modelStore.nodes as never,
    footings: [...modelStore.model.footings.values()],
    columnAt, soilOf, sets, cases, ...(levelAt ? { levelAt } : {}),
  });
}

export function footingSizing(sheets: { footingSizing?: FootingSizing }): FootingSizing {
  return sheets.footingSizing ?? 'minimum';
}

/** How every footing is sized from now on; 'minimum' is the default and is not stored. */
export function setFootingSizing(mode: FootingSizing): void {
  const { footingSizing: _, ...d } = rcSheetsData();
  saveRcSheetsData(mode === 'minimum' ? d : { ...d, footingSizing: mode });
}

export function footingContext(d: FootingDemand, sizing: FootingSizing, columns: readonly ColumnRow[]): FootingContext {
  const dd = designData();
  const col = d.column?.rowKey ? columns.find((r) => r.key === d.column!.rowKey) : undefined;
  const colId = columnOn(d.nodeId);
  const colFc = fcOfMaterial(colId !== undefined ? modelStore.elements.get(colId)?.materialId : undefined) ?? DEFAULT_FC;
  const f = d.footing ? modelStore.model.footings.get(d.footing.id) : undefined;
  const prefs = modelStore.footingMatPreferences();
  const a = col?.adopted;
  return {
    fc: fcOfMaterial(f?.concreteMaterialId) ?? colFc, fy: dd.rebarFy, cover: d.footing?.cover ?? dd.covers.footing, sizing,
    diameters: FOOTING_DIAMETERS, preferred: { x: prefs.bottomMatDiameterXmm, y: prefs.bottomMatDiameterYmm }, columnFc: colFc,
    ...(a && col ? { columnBars: {
      count: 4 + 2 * a.nx + 2 * a.ny + (a.inner ? 2 * Math.max(1, a.inner.rows ?? 1) * (a.inner.nx + a.inner.ny) : 0),
      dia: Math.max(a.corner, a.dx, a.dy, a.inner?.dia ?? 0), tension: !col.req.compressionDominated,
    } } : {}),
  };
}

/** A footing's row from its adopted dimensions and bars when it has them, and how to design it again from another demand. */
export function footingRowOf(d: FootingDemand, rules: SheetRules, adopted: Record<string, Adopted>, sizing: FootingSizing, columns: readonly ColumnRow[], fmt: Fmt): { row: FootingRow; redo: (x: FootingDemand) => FootingRow } {
  const ctx = footingContext(d, sizing, columns);
  return { row: rules.footingRow(d, ctx, adopted[d.key] as FootingAdopted | undefined, fmt), redo: (x) => rules.footingRow(x, ctx, undefined, fmt) };
}

export { withOverlaps };

/** The row's footing written to the model, made where there is none, its top at the column's foot; one undo step. */
export function writeFootingToModel(row: FootingRow): number {
  const a = row.adopted, d = row.demand;
  const data = { B: a.B, L: a.L, thickness: a.h, eccentricityB: a.ex, eccentricityL: a.ey, cover: row.cover, ...(d.footing ? {} : { foundingElevation: d.at.z - a.h }) };
  let id = d.footing?.id;
  modelStore.batchFoundation(() => {
    if (id === undefined) id = modelStore.addFooting(d.nodeId, d.name);
    const col = columnOn(d.nodeId);
    modelStore.updateFooting(id, { ...data, ...(col !== undefined ? { columnElementId: col } : {}) });
  });
  return id!;
}

/** What makes the footing rows out of date besides the results: the model's footings and soils and the mesh preferences. */
export const foundationStamp = (): string =>
  JSON.stringify([[...modelStore.model.footings.values()].map(({ revision: _r, ...f }) => f), modelStore.model.geotechnical ?? null, modelStore.footingMatPreferences()]);
