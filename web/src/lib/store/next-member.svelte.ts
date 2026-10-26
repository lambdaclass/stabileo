/**
 * What the next member drawn will be: section and material.
 *
 * Every member used to be born with material 1 and section 1 and re-assigned afterwards, one by
 * one or by selection. Drawing forty beams of the same section should not cost forty edits. The
 * choice is a drawing preference, not model data, so it lives here and is not saved with the
 * project; `null` means "as the last member", or the model's first when there is none.
 *
 * Everything else a member is told (truss or frame, released ends, offsets) is a specification,
 * set in Specifications › Members once the member exists: in PRO a member is born a frame. What
 * it is to the engineer (a beam, a column, a brace) can be chosen too, and it is born declared.
 */
import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { declareDrawnBar, type DrawnRun } from '../model/building/declare';

/** What a drawn member is to the engineer (`model/physical`): kind and typology. */
export interface DrawnKind { kind: 'column' | 'beam' | 'brace'; typology?: string }

function createNextMember() {
  let materialId = $state<number | null>(null);
  let sectionId = $state<number | null>(null);
  /** In PRO, what the next member IS; null: a plain bar, declared nothing. */
  let physical = $state<DrawnKind | null>(null);
  /** The element the last drawn member joined, so a chain continues it. */
  let run: DrawnRun | null = null;

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
    /** The material the next member takes, as the pickers show it. */
    get physical() { return physical; },
    set physical(v: DrawnKind | null) { physical = v; run = null; },
    get resolvedMaterialId() { return resolve(materialId, modelStore.materials.keys(), lastMember()?.materialId); },
    get resolvedSectionId() { return resolve(sectionId, modelStore.sections.keys(), lastMember()?.sectionId); },
    /**
     * Draw a member with the chosen attributes, as ONE undo step. A choice naming a material or
     * section that no longer exists falls back as an unset one does rather than dangling.
     */
    add(nodeI: number, nodeJ: number, type: 'frame' | 'truss' = 'frame'): number {
      let id = -1;
      // Basic draws 3D members through the same viewport tool, with its own frame/truss choice
      // and no pickers: it keeps the model's defaults unless something was chosen.
      const pro = uiStore.analysisMode === 'pro';
      const mat = pro ? this.resolvedMaterialId : materialId, sec = pro ? this.resolvedSectionId : sectionId;
      modelStore.batch(() => {
        id = modelStore.addElement(nodeI, nodeJ, pro ? 'frame' : type);
        if (mat !== null && modelStore.materials.has(mat)) modelStore.updateElementMaterial(id, mat);
        if (sec !== null && modelStore.sections.has(sec)) modelStore.updateElementSection(id, sec);
        // Declared as it is drawn: a chained beam or column continues the element it extends.
        run = pro && physical ? declareDrawnBar(id, physical.kind, physical.typology, run) : null;
      });
      return id;
    },
  };
}

export const nextMember = createNextMember();
