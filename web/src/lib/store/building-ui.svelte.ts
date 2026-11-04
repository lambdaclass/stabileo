/**
 * The Building panel's own state: which of its tools is open, and the materials the building is
 * built in (its concrete, and its steel for the steel typologies). Every tool places with these,
 * so the material is stated once at the top and not again in each tool.
 */
import { modelStore } from './model.svelte';
import { familyOfMaterial, type TypologyFamily } from '../model/building/typology-defaults';

export type BuildingTool = 'levels' | 'columns' | 'walls' | 'beams' | 'slabs' | 'stairs' | 'tools';
export const BUILDING_TOOLS: readonly BuildingTool[] = ['levels', 'columns', 'walls', 'beams', 'slabs', 'stairs', 'tools'];

let tool = $state<BuildingTool>('columns');
let concreteId = $state(0);
let steelId = $state(0);

const ofFamily = (fam: TypologyFamily) => [...modelStore.materials.values()].filter((m) => familyOfMaterial(m) === fam);

export const buildingUi = {
  get tool() { return tool; },
  set tool(v: BuildingTool) { tool = v; },
  /** The building's concrete: the one chosen, or the model's first concrete. */
  get concreteId() { return modelStore.materials.has(concreteId) && familyOfMaterial(modelStore.materials.get(concreteId)!) === 'concrete' ? concreteId : ofFamily('concrete')[0]?.id ?? 0; },
  set concreteId(v: number) { concreteId = v; },
  get steelId() { return modelStore.materials.has(steelId) && familyOfMaterial(modelStore.materials.get(steelId)!) === 'steel' ? steelId : ofFamily('steel')[0]?.id ?? 0; },
  set steelId(v: number) { steelId = v; },
  /** The material a typology of this family is built in. */
  materialFor(fam: TypologyFamily | null): number {
    if (fam === 'steel') return this.steelId || this.concreteId;
    if (fam === 'timber') return ofFamily('timber')[0]?.id ?? this.concreteId;
    return this.concreteId || [...modelStore.materials.keys()][0] || 0;
  },
};
