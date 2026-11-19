/**
 * A building's exchange file, mapped and brought into the model: what the import dialog does,
 * as one function anything else can call (a project that starts from a file, a test).
 *
 * `mapIfcBuilding` turns what the file holds into the fragment to insert, with the choices the
 * dialog offers: each class as a kind of element, the storeys as levels, and the model of
 * calculation (`ifc-analytical.ts`) or the elements where the file places them.
 * `replaceWithIfcBuilding` then replaces the open model with it: the levels, the fragment and its
 * shells joined to the bars, the floors meshed, the feet fixed, the footings under what they carry
 * and the stairs built and joined to the floors.
 */
import { modelStore } from '../store/model.svelte';
import { analyticalFromIfc, type FloorRegion } from './ifc-analytical';
import { buildIfcFragment, chosenParts, connectShells, fixBases, storeyLevels, type ClassChoice, type IfcBuilding } from './ifc-physical';
import { meshFloors } from './ifc-floors';
import { placeFootings } from './ifc-footings';
import { placeStairs } from './ifc-stairs';
import { insertFragment } from '../model/edit/transformed-copy';
import { IDENTITY } from '../model/edit/affine';
import type { Level } from '../model/grid';
import type { IfcFootingRead, IfcMember, IfcStairRead, IfcStorey, IfcSurface } from './ifc-mapper';

export interface IfcRead {
  members: IfcMember[];
  surfaces: IfcSurface[];
  storeys: IfcStorey[];
  footings: IfcFootingRead[];
  stairs: IfcStairRead[];
}

export interface IfcImportOptions {
  choices: Record<string, ClassChoice>;
  snapTolerance: number;
  /** IfcMember (braces, purlins) as truss members. */
  membersAsTruss: boolean;
  meshSize: number;
  /** Each element declared as a physical member. */
  declare: boolean;
  /** The file's storeys as the model's levels. */
  storeysAsLevels: boolean;
  /** The model of calculation: columns and beams to the levels, one slab per floor. */
  analytical: boolean;
  /** The lowest columns' and walls' feet fixed. */
  fixFeet: boolean;
}

export const IFC_IMPORT_DEFAULTS: IfcImportOptions = {
  choices: {}, snapTolerance: 0.01, membersAsTruss: true, meshSize: 1, declare: true, storeysAsLevels: true, analytical: true, fixFeet: true,
};

/** The levels the elements are declared on: the storeys, when they become the model's levels. */
export function importLevels(read: Pick<IfcRead, 'storeys'>, o: Pick<IfcImportOptions, 'storeysAsLevels'>, replace: boolean): Level[] {
  return o.storeysAsLevels && (replace || !modelStore.grid?.levels.length) ? storeyLevels(read.storeys) : [...(modelStore.grid?.levels ?? [])];
}

/** The fragment the file becomes, and the floors to mesh once it is in (the model of calculation's). */
export function mapIfcBuilding(read: Pick<IfcRead, 'members' | 'surfaces' | 'storeys'>, o: IfcImportOptions, replace = true): { building: IfcBuilding | null; floors: FloorRegion[] } {
  if (read.members.length === 0 && read.surfaces.length === 0) return { building: null, floors: [] };
  const levels = importLevels(read, o, replace);
  const frag = { snapTolerance: o.snapTolerance, membersAsTruss: o.membersAsTruss, choices: o.choices, meshSize: o.meshSize, declare: o.declare, levels };
  if (o.analytical && levels.length > 0) {
    const parts = chosenParts(read.members, read.surfaces, o.choices);
    const an = analyticalFromIfc(parts.members, parts.surfaces, levels);
    return { building: buildIfcFragment(an.members, an.walls, frag), floors: an.floors };
  }
  return { building: buildIfcFragment(read.members, read.surfaces, frag), floors: [] };
}

/** Replace the open model with the file, as one undo step. Null when the file has nothing to bring. */
export function replaceWithIfcBuilding(read: IfcRead, o: IfcImportOptions, name?: string): IfcBuilding | null {
  const { building, floors } = mapIfcBuilding(read, o, true);
  if (!building) return null;
  modelStore.batch(() => {
    modelStore.clear();
    if (name) modelStore.model.name = name;
    if (o.storeysAsLevels && read.storeys.length > 0) modelStore.setGrid({ axes: [], levels: storeyLevels(read.storeys) });
    const r = insertFragment(building.fragment, [{ A: IDENTITY, t: [0, 0, 0] }]);
    connectShells(r.quads, r.plates);
    if (floors.length) meshFloors(floors, { meshSize: o.meshSize, declare: o.declare });
    if (o.fixFeet) fixBases();
    // The file's pads and strips, under the columns and walls they carry.
    if (read.footings.length) placeFootings(read.footings);
    // The file's flights, built and joined to the floors they reach (the model of calculation only).
    if (read.stairs.length && floors.length) placeStairs(read.stairs, importLevels(read, o, true));
  });
  return building;
}
