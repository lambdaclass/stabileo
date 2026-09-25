/**
 * What the next member drawn will be: material and section.
 *
 * Every member used to be born with material 1 and section 1 and re-assigned afterwards, one by
 * one or by selection. Drawing forty beams of the same section should not cost forty edits. The
 * choice is a drawing preference, not model data, so it lives here and is not saved with the
 * project; `null` means "the model's first", which is what an unset preference always meant.
 */
import { modelStore } from './model.svelte';

function createNextMember() {
  let materialId = $state<number | null>(null);
  let sectionId = $state<number | null>(null);
  return {
    get materialId() { return materialId; },
    set materialId(v: number | null) { materialId = v; },
    get sectionId() { return sectionId; },
    set sectionId(v: number | null) { sectionId = v; },
    /**
     * Draw a member with the chosen attributes, as ONE undo step. A choice naming a material or
     * section that no longer exists falls back to the model's default rather than dangling.
     */
    add(nodeI: number, nodeJ: number, type: 'frame' | 'truss' = 'frame'): number {
      let id = -1;
      modelStore.batch(() => {
        id = modelStore.addElement(nodeI, nodeJ, type);
        if (materialId !== null && modelStore.materials.has(materialId)) modelStore.updateElementMaterial(id, materialId);
        if (sectionId !== null && modelStore.sections.has(sectionId)) modelStore.updateElementSection(id, sectionId);
      });
      return id;
    },
  };
}

export const nextMember = createNextMember();
