/**
 * One stair, two representations: the inclined plate the analysis meshes (Model › Shells) and the
 * stair the desk designs as a one-way slab. They were stated apart, with nothing tying a designed
 * stair to the plate that carries its load in the model. A flight built in the model can now be
 * designed as the same stair, and the designed stair says which plate it is.
 */
import { modelStore } from './model.svelte';
import { saveStair, stairEntries, type StairEntry } from './stairs-pt';
import { findOccupancy } from '../codes/cirsoc101/live-loads';
import type { StairSpec } from '../model/stair';

/** Design the flight just built as a stair of the desk; returns its id. Landings none, ends cast with the beams, finishes 1 kN/m². */
export function designStairFromFlight(spec: StairSpec, width: number, quads: readonly number[]): string {
  const n = stairEntries().length + 1;
  const id = `st-${Date.now().toString(36)}`;
  const e: StairEntry = {
    id, name: `E${n}`, riser: spec.riser, tread: spec.tread, steps: Math.round(spec.steps), waist: spec.waist, width,
    landingBottom: 0, landingTop: 0, ends: 'monolithic', finishes: 1, live: findOccupancy('escalera_otros')?.uniformKNm2 ?? 5,
    analysisQuads: [...quads],
  };
  saveStair(e);
  return id;
}

/** The plates of a designed stair that still exist in the model. */
export function stairPlates(e: StairEntry): number[] {
  return (e.analysisQuads ?? []).filter((id) => modelStore.quads.has(id));
}
