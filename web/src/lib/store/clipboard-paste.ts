/**
 * Pasting the clipboard's own record — the originals were edited or deleted since the copy, so
 * it cannot be a translated copy of them (`KeyboardShortcuts.handlePaste`).
 *
 * It goes through `insertFragment` like every other copy: nodes weld onto the ones already
 * there, a welded node keeps its own support, a member already joining the same two nodes is
 * not added twice, and it is one undo step. It used to re-implement those rules one by one and
 * had already drifted: pasting the same record twice stacked a second member on the first
 * paste's nodes, doubling its stiffness with nothing to show for it.
 */
import { modelStore } from './model.svelte';
import type { ClipboardData } from './ui.svelte';
import type { Element, Support } from './model.svelte';
import { insertFragment, type EditReport } from '../model/edit/transformed-copy';
import type { Fragment } from '../model/edit/fragment';
import { translation, type Vec3 } from '../model/edit/affine';
import { pickElement3DMetadata } from '../model/element-3d-metadata';

const RIGID = { my: false, mz: false, t: false };

/** The clipboard record as a fragment of this model: its materials and sections by id. */
export function clipboardFragment(clip: ClipboardData): Fragment {
  const nodeIds = new Set(clip.nodes.map((n) => n.origId));
  const elements = clip.elements
    // A member whose end was not copied has nowhere to go.
    .filter((e) => nodeIds.has(e.origNodeI) && nodeIds.has(e.origNodeJ))
    .map((e, k) => ({
      id: k + 1,
      nodeI: e.origNodeI, nodeJ: e.origNodeJ, type: e.type,
      materialId: modelStore.materials.has(e.materialId) ? e.materialId : 1,
      sectionId: modelStore.sections.has(e.sectionId) ? e.sectionId : 1,
      releaseI: { ...RIGID, ...e.releaseI }, releaseJ: { ...RIGID, ...e.releaseJ },
      ...pickElement3DMetadata(e),
    }) as Element);
  return {
    nodes: clip.nodes.map((n) => ({ id: n.origId, x: n.x, y: n.y, z: n.z ?? 0 })),
    elements,
    quads: [], plates: [], loads: [], groups: [], materials: [], sections: [], loadCases: [],
    supports: clip.supports.filter((s) => nodeIds.has(s.origNodeId)).map((s, k) => ({ id: k + 1, nodeId: s.origNodeId, type: s.type }) as Support),
    local: true,
  };
}

/** Paste the record at `offset`. */
export function pasteClipboardRecord(clip: ClipboardData, offset: Vec3, leftHand = false): EditReport {
  return insertFragment(clipboardFragment(clip), [translation(offset)], { withSupports: true, withLoads: false, leftHand });
}
