/**
 * The slab and wall check rows of the last floor design, kept with the project.
 *
 * The floor run was session state: after reopening a project, its floor assemblies (bars,
 * punching records) were still there, and the memoria lost every slab and wall row while keeping
 * the punching rows taken from the assemblies. The rows are a function of the model, so they are
 * stored with the design fingerprint they were computed at, and read back only while the model is
 * still that one (`design-fingerprint.ts`).
 */
import { footingCheckRows, slabCheckRows, wallCheckRows } from '../engine/design/check-rows-families';
import type { RunFootingDesignResult } from '../engine/detailing/run-footing-design';
import { footingRunFingerprint } from './detailing-footing-inputs';
import type { CheckRow } from '../design-contract/check-row';
import type { RunFloorDesignResult } from '../engine/detailing/run-floor-design';
import type { FloorReadings } from '../engine/detailing/assembly';
import { modelStore } from './model.svelte';
import { designFingerprint } from './design-fingerprint';

export type { FloorReadings };

export function readingsOf(run: RunFloorDesignResult, fingerprint: string, footing?: RunFootingDesignResult | null, footingFingerprint?: string | null): FloorReadings {
  return {
    fingerprint,
    ...(footing && footingFingerprint ? { footings: { fingerprint: footingFingerprint, outcomes: footing.outcomes.map((o) => ({
      footingId: o.footingId, name: o.name, rows: footingCheckRows(o) as CheckRow[], notes: [...o.unsupported, ...o.assumptions],
    })) } } : {}),
    slabs: run.slabs.map((s) => ({ panelId: s.panelId, behaviour: s.behaviour, aspect: s.aspect, rows: slabCheckRows(s) as CheckRow[], notes: [...s.unsupported] })),
    walls: run.walls.map((w) => ({ wallId: w.wallId, verticalSpacing: w.verticalSpacing, horizontalSpacing: w.horizontalSpacing, rows: wallCheckRows(w) as CheckRow[], notes: [...w.unsupported] })),
  };
}

/** The stored footing rows, when both the model and the footing inputs are still the ones they were computed from. */
export function currentFootingReadings(): NonNullable<FloorReadings['footings']> | null {
  const r = currentFloorReadings()?.footings;
  return r && r.fingerprint === footingRunFingerprint() ? r : null;
}

/** The stored readings, when the model is still the one they were computed from. */
export function currentFloorReadings(): FloorReadings | null {
  const r = modelStore.model.detailing?.floorReadings;
  return r && r.fingerprint === designFingerprint() ? r : null;
}
