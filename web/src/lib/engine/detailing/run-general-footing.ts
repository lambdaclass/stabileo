/**
 * The general footing path inside the footing run: what `designGeneralFooting` makes of a
 * combined, strip, turned or partly lifting footing, or a pile cap, turned into the outcome, the
 * record and the assembly entry the isolated path produces, so the panel, the document and the
 * drawing take it the same way.
 *
 * The record's checks are bearing (or the most loaded pile), one-way shear, punching where a
 * column punches, flexure with both mats laid out, and overturning. The top mat is evaluated here,
 * so the isolated path's «top reinforcement not evaluated» does not apply. Column starters are not
 * drawn on this path yet, and the record says so.
 */
import { msg, type EngineMessage } from '../../codes/message';
import { clause, type ClauseRef } from '../../codes/regulation';
import type { Footing } from '../../model/footing';
import { asFootingCheck, designGeneralFooting, type GeneralFootingDesign } from '../foundation/general-footing';
import type { FamilyCheckOutcome, FamilyRecordDraft, FootingDesignRecord } from './family-record';
import type { CheckStatus } from './foundation-check';
import type { FootingAssemblyEntry, FootingDesignOutcome, RunFootingDesignInput } from './run-footing-design';

type Draft = (
  checks: FamilyCheckOutcome[],
  results: Pick<FootingDesignRecord, 'bearing' | 'flexure' | 'oneWayShear' | 'punching' | 'bottomMatGeometry' | 'bottomMatAnchorage' | 'dowels' | 'starterTies'>,
  refs: readonly ClauseRef[],
) => FamilyRecordDraft<FootingDesignRecord>;

export interface GeneralOutcome {
  /** Null when the footing could not be designed; `unsupported` then says why. */
  outcome: FootingDesignOutcome | null;
  entry: FootingAssemblyEntry | null;
}

export function runGeneralFooting(a: {
  f: Footing; input: RunFootingDesignInput; level: number;
  allowable: number | null; pileCapacity?: number; edgeFactor?: number;
  unsupported: EngineMessage[]; assumptions: EngineMessage[]; draft: Draft;
}): GeneralOutcome {
  const { f, input } = a;
  // A strip under a wall is checked under the wall's load spread along it (`general-footing.ts`).
  if (f.kind === 'strip' && f.wallGroupId !== undefined && input.wallThickness?.has(f.wallGroupId)) {
    a.assumptions.push(msg('footing.assumption.wallSpreads', { footing: f.name, B: +f.B.toFixed(2) }));
  }
  const g = designGeneralFooting({
    footing: f, nodes: input.nodes, reactions: input.reactions,
    columnAt: (n) => (n === f.nodeId && f.columnElementId !== undefined ? input.columns.get(f.columnElementId) : undefined) ?? input.columnAt?.(n),
    ...(f.wallGroupId !== undefined && input.wallThickness?.has(f.wallGroupId) ? { wallThickness: input.wallThickness.get(f.wallGroupId)! } : {}),
    fc: input.fc, fy: input.fy, allowable: a.allowable, ...(a.edgeFactor ? { edgeFactor: a.edgeFactor } : {}),
    ...(a.pileCapacity !== undefined ? { pileCapacity: a.pileCapacity } : {}),
    barDiameterMm: { x: input.matPreferences.bottomMatDiameterXmm, y: input.matPreferences.bottomMatDiameterYmm },
    edition: input.edition,
  });
  if ('refused' in g) {
    a.unsupported.push(msg(`footing.general.${g.refused}`, { footing: f.name }));
    return { outcome: null, entry: null };
  }
  const R = (id: string, title: string) => clause('cirsoc-201', input.edition, id, title);
  const refs = [R('13.2', 'generalidades de fundaciones'), R('13.3', 'zapatas'), R('22.5', 'corte en una dirección'), R('22.6', 'corte en dos direcciones')];
  const check = asFootingCheck(g, refs);
  a.assumptions.push(msg('footing.assumption.generalPath', { footing: f.name, kind: f.kind }));
  if ('cap' in g.result) a.assumptions.push(msg('footing.assumption.pileBearing', { footing: f.name }));
  if (f.kind === 'strip' && !(f.wallGroupId !== undefined && input.wallThickness?.has(f.wallGroupId))) {
    a.assumptions.push(msg('footing.assumption.wallThickness', { footing: f.name }));
  }
  if (f.mats) a.assumptions.push(msg('footing.assumption.fixedBars', { footing: f.name }));
  a.unsupported.push(msg('footing.general.startersNotModeled', { footing: f.name }));

  const one = (key: string, status: CheckStatus, utilization: number | null): FamilyCheckOutcome => ({
    key, status, utilization, governingCombination: g.governing, refs, unsupported: [],
  });
  const overturns = 'rigid' in g.result && g.result.rigid.overturns;
  const p = check.punching;
  const checks: FamilyCheckOutcome[] = [
    one('bearing', check.bearing.status, check.bearing.utilization),
    one('oneWayShear', check.oneWayShear!.status, check.oneWayShear!.utilization),
    ...(p ? [one('punching', p.status === 'OK' ? 'OK' : p.status === 'FAIL' ? 'FAIL' : 'UNSUPPORTED', p.utilization)] : []),
    one('flexure', g.flexure <= 1 + 1e-9 ? 'OK' : 'FAIL', g.flexure),
    one('overturning', overturns ? 'FAIL' : 'OK', null),
  ];
  const record = a.draft(checks, {
    bearing: {
      status: check.bearing.status, qMax: check.bearing.qMax, qMin: check.bearing.qMin, eB: check.bearing.eB, eL: check.bearing.eL,
      uplift: check.bearing.uplift, allowable: 'cap' in g.result ? g.result.cap.piles.capacity : a.allowable ?? 0, utilization: check.bearing.utilization,
    },
    flexure: { status: g.flexure <= 1 + 1e-9 ? 'OK' : 'FAIL', Mu: check.Mu, criticalSection: 0, bottomMat: null },
    oneWayShear: { status: check.oneWayShear!.status, Vu: check.oneWayShear!.Vu, phiVc: check.oneWayShear!.phiVc, utilization: check.oneWayShear!.utilization },
    punching: p ? {
      status: p.status === 'OK' ? 'OK' : p.status === 'FAIL' ? 'FAIL' : 'UNSUPPORTED', position: null, truncatedSides: 0,
      Vu: p.vu, phiVc: p.phiVc, utilization: p.utilization, equilibriumResidual: null,
    } : null,
    bottomMatGeometry: null, bottomMatAnchorage: null, dowels: null, starterTies: null,
  }, refs);
  const elementIds = [...new Set(g.bars.flatMap((b) => b.ownerElementIds))];
  const entry: FootingAssemblyEntry = { id: `F${f.id}`, check, elementIds, matBars: g.bars, record };
  return {
    outcome: {
      footingId: f.id, name: f.name, check, mat: null, matGeometry: null, matAnchorage: null, entry, level: a.level,
      governingCombination: g.governing, unsupported: a.unsupported, assumptions: a.assumptions, record, general: g,
    },
    entry,
  };
}

export type { GeneralFootingDesign };
