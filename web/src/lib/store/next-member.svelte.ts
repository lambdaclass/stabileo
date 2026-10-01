/**
 * What the next member drawn will be: section, material and how each end is joined.
 *
 * Every member used to be born with material 1 and section 1 and re-assigned afterwards, one by
 * one or by selection. Drawing forty beams of the same section should not cost forty edits. The
 * choice is a drawing preference, not model data, so it lives here and is not saved with the
 * project; `null` means "as the last member", or the model's first when there is none.
 */
import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';

/** How one end of the next member is joined: rigidly, or pinned in bending (`toggleHinge3D`). */
export type NextMemberEnd = 'fixed' | 'pinned';

function createNextMember() {
  let materialId = $state<number | null>(null);
  let sectionId = $state<number | null>(null);
  let endI = $state<NextMemberEnd>('fixed');
  let endJ = $state<NextMemberEnd>('fixed');

  /**
   * The choice when it still names something in the model; else what the last member has, which
   * is what the next one most often is (an RC model's first section can be a steel default no
   * member uses); else the model's first.
   */
  const resolve = (chosen: number | null, ids: Iterable<number>, ofLast: number | undefined): number => {
    const all = [...ids];
    if (chosen !== null && all.includes(chosen)) return chosen;
    if (ofLast !== undefined && all.includes(ofLast)) return ofLast;
    return all[0] ?? 1;
  };
  const lastMember = () => [...modelStore.elements.values()].at(-1);

  return {
    get materialId() { return materialId; },
    set materialId(v: number | null) { materialId = v; },
    get sectionId() { return sectionId; },
    set sectionId(v: number | null) { sectionId = v; },
    get endI() { return endI; },
    set endI(v: NextMemberEnd) { endI = v; },
    get endJ() { return endJ; },
    set endJ(v: NextMemberEnd) { endJ = v; },
    /** The material the next member takes, as the pickers show it. */
    get resolvedMaterialId() { return resolve(materialId, modelStore.materials.keys(), lastMember()?.materialId); },
    get resolvedSectionId() { return resolve(sectionId, modelStore.sections.keys(), lastMember()?.sectionId); },
    /**
     * Draw a member with the chosen attributes, as ONE undo step. A choice naming a material or
     * section that no longer exists falls back as an unset one does rather than dangling. A truss
     * carries no moment, so its ends are left as they are.
     */
    add(nodeI: number, nodeJ: number, type: 'frame' | 'truss' = 'frame'): number {
      let id = -1;
      // Basic draws 3D members through the same viewport tool and has no pickers: it keeps the
      // model's defaults unless something was chosen.
      const pro = uiStore.analysisMode === 'pro';
      const mat = pro ? this.resolvedMaterialId : materialId, sec = pro ? this.resolvedSectionId : sectionId;
      modelStore.batch(() => {
        id = modelStore.addElement(nodeI, nodeJ, type);
        if (mat !== null && modelStore.materials.has(mat)) modelStore.updateElementMaterial(id, mat);
        if (sec !== null && modelStore.sections.has(sec)) modelStore.updateElementSection(id, sec);
        if (type === 'frame' && pro) {
          if (endI === 'pinned') modelStore.toggleHinge3D(id, 'start');
          if (endJ === 'pinned') modelStore.toggleHinge3D(id, 'end');
        }
      });
      return id;
    },
  };
}

export const nextMember = createNextMember();
