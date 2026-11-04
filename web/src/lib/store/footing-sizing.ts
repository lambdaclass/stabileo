/**
 * Sizing the model's footings and removing their overlaps, on the foundation undo channel (which
 * keeps the solve the sizes come from). Each footing is sized from the same inputs the footing
 * run reads; overlapping footings become one combined footing, sized in full.
 */
import { modelStore } from './model.svelte';
import { collectFootingSupport, collectFootingSupportReactions } from './footing-support';
import { resolveConcreteProperties, currentConcreteEdition } from './detailing-project-inputs';
import { findProfile } from '../model/geotechnical';
import { pileCapacity } from '../model/foundation/piles';
import { combineFootings } from '../model/foundation/generate';
import { sizeFooting, type SizingMode, type SizingResult } from '../engine/foundation/sizing';
import { footingOverlaps } from '../engine/foundation/overlaps';
import type { Footing } from '../model/footing';

export interface SizedFooting { id: number; name: string; result: SizingResult }

export function footingDesignInput(f: Footing, ctx = context()) {
  const profile = findProfile(modelStore.model.geotechnical, f.soilProfileId);
  const allowable = profile?.bearing.kind === 'allowablePressure' ? profile.bearing.allowableBearingKPa : null;
  const cap = f.kind === 'pileCap' && profile?.strata?.length
    ? pileCapacity(profile.strata, f.piles?.diameter || 0.5, f.piles?.length || 12).total : undefined;
  return {
    footing: f, nodes: modelStore.model.nodes as never, reactions: ctx.reactions,
    columnAt: (n: number) => (n === f.nodeId && f.columnElementId !== undefined ? ctx.support.columns.get(f.columnElementId) : undefined) ?? ctx.support.columnAt(n),
    ...(f.wallGroupId !== undefined && ctx.support.wallThickness.has(f.wallGroupId) ? { wallThickness: ctx.support.wallThickness.get(f.wallGroupId)! } : {}),
    fc: ctx.props.fc, fy: ctx.props.fy, allowable: f.kind === 'pileCap' ? null : allowable,
    ...(cap !== undefined ? { pileCapacity: cap } : {}),
    barDiameterMm: { x: ctx.prefs.bottomMatDiameterXmm, y: ctx.prefs.bottomMatDiameterYmm }, edition: ctx.edition,
  };
}

function context() {
  return {
    support: collectFootingSupport(), reactions: collectFootingSupportReactions(), props: resolveConcreteProperties(),
    prefs: modelStore.footingMatPreferences(), edition: currentConcreteEdition(),
  };
}

/** Size the footings given (all when none), in one undo step. */
export function sizeModelFootings(mode: SizingMode, ids?: number[]): SizedFooting[] {
  const ctx = context();
  const out: SizedFooting[] = [];
  for (const f of [...modelStore.model.footings.values()].filter((x) => !ids || ids.includes(x.id)).sort((a, b) => a.id - b.id)) {
    out.push({ id: f.id, name: f.name, result: sizeFooting({ ...footingDesignInput(f, ctx), mode }) });
  }
  const writes = out.filter((o) => Object.keys(o.result.size).length > 0);
  // «Only the bars again»: bars fixed by hand stay unless the reinforcement is unlocked.
  const rebar = mode === 'reinforce' ? out.filter((o) => { const f = modelStore.model.footings.get(o.id); return f?.mats && !f.locked?.reinforcement; }) : [];
  if (writes.length || rebar.length) modelStore.batchFoundation(() => {
    for (const o of writes) modelStore.updateFooting(o.id, o.result.size);
    for (const o of rebar) modelStore.updateFooting(o.id, { mats: undefined });
  });
  return out;
}

/** The overlapping footings, by pairs and by the groups they form. */
export function modelFootingOverlaps(clearance = 0) {
  return footingOverlaps([...modelStore.model.footings.values()], modelStore.model.nodes as never, clearance);
}

/** Each group of overlapping footings made one combined footing, sized in full. Returns the new ids. */
export function resolveFootingOverlaps(clearance = 0): number[] {
  const { groups } = modelFootingOverlaps(clearance);
  const made: number[] = [];
  if (groups.length) modelStore.batchFoundation(() => { for (const g of groups) {
    const fs = g.map((id) => modelStore.model.footings.get(id)!).filter(Boolean);
    if (fs.some((f) => f.locked?.dimensions || f.kind === 'pileCap' || f.kind === 'mat')) continue;
    const nodes = [...new Set(fs.flatMap((f) => [f.nodeId, ...(f.supportedNodeIds ?? [])]))];
    const id = combineFootings(nodes, Math.max(...fs.map((f) => f.thickness)));
    if (id === null) continue;
    const f = modelStore.model.footings.get(id)!;
    modelStore.updateFooting(id, { soilProfileId: fs[0]!.soilProfileId, foundingElevation: Math.min(...fs.map((x) => x.foundingElevation)), cover: fs[0]!.cover, name: fs[0]!.name || f.name });
    sizeModelFootings('full', [id]);
    made.push(id);
  } });
  return made;
}
