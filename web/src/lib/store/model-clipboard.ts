/**
 * Copy, cut and paste of model entities (PRO).
 *
 * Copy takes the selection as a fragment: its members and shells with every field, their nodes,
 * supports, loads and groups, and the sections, materials and load cases they use, by definition.
 * The fragment stays in memory and goes to the system clipboard as model code, so it can be
 * pasted into another project or another tab, or read as text.
 *
 * Paste starts a placement with the fragment (the ghost follows the pointer); paste in place
 * inserts it where it was. What comes from the system clipboard wins over what is in memory when
 * it is model code, because it is the more recent copy the user made. Basic copies and pastes
 * through here too, in its plane and its space workspace (`clipboard-workspace.ts`).
 */
import { detach, fragmentOf, closure, type EntitySet, type Fragment } from '../model/edit/fragment';
import { fragmentFromCode, fragmentToCode } from '../model/edit/fragment-code';
import { insertFragment } from '../model/edit/transformed-copy';
import { IDENTITY } from '../model/edit/affine';
import { placementStore } from './placement.svelte';
import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { t, tp } from '../i18n';
import { planeFragmentToSpace } from './clipboard-workspace';
import { clipboardState } from './clipboard-state.svelte';

let memory: Fragment | null = null;
let memoryCode = '';
/** The copy is in the plane's coordinates (vertical as `y`), not the space's. */
let memoryInPlane = false;

const modelInPlane = () => !uiStore.is3DWorkspace || uiStore.viewportPresentation3D === 'upright2dIn3d';

export function selectionSet(): EntitySet {
  const quads: number[] = [], plates: number[] = [];
  for (const key of uiStore.selectedShells) {
    const id = Number(key.slice(1));
    if (key[0] === 'q' && modelStore.quads.has(id)) quads.push(id);
    if (key[0] === 'p' && modelStore.plates.has(id)) plates.push(id);
  }
  // A physical plate selected whole brings its outline and holes, mesh or not.
  const plateNodes = [...uiStore.selectedPlates].flatMap((id) => modelStore.model.groups.get(id)?.members.nodes ?? []);
  return {
    nodes: [...uiStore.selectedNodes, ...plateNodes].filter((id) => modelStore.nodes.has(id)),
    elements: [...uiStore.selectedElements].filter((id) => modelStore.elements.has(id)),
    quads, plates,
  };
}

const isEmpty = (s: EntitySet) => [...s.nodes].length + [...s.elements].length + [...(s.quads ?? [])].length + [...(s.plates ?? [])].length === 0;

export function hasClipboard(): boolean { return memory !== null; }

/** Copy the selection. Returns false when nothing is selected. */
export function copySelection(): boolean {
  const set = selectionSet();
  if (isEmpty(set)) return false;
  memory = detach(fragmentOf(set, { withLoads: true, withSupports: true }));
  memoryCode = fragmentToCode(memory);
  memoryInPlane = modelInPlane();
  clipboardState.filled = true;
  try { void navigator.clipboard?.writeText(memoryCode).catch(() => {}); } catch { /* no clipboard: memory only */ }
  uiStore.toast(tp('clipboard.copied', { n: memory.elements.length + memory.quads.length + memory.plates.length, nodes: memory.nodes.length }), 'info');
  return true;
}

/** Copy, then remove the selection and the nodes nothing else uses, as one undo step. */
export function cutSelection(): boolean {
  const set = selectionSet();
  if (!copySelection()) return false;
  const c = closure(set);
  const used = new Set<number>();
  for (const e of modelStore.elements.values()) if (!c.elements.has(e.id)) { used.add(e.nodeI); used.add(e.nodeJ); }
  for (const q of modelStore.quads.values()) if (!c.quads.has(q.id)) q.nodes.forEach((n) => used.add(n));
  for (const p of modelStore.plates.values()) if (!c.plates.has(p.id)) p.nodes.forEach((n) => used.add(n));
  modelStore.deleteEntities({
    elements: [...c.elements], quads: [...c.quads], plates: [...c.plates],
    nodes: [...c.nodes].filter((n) => !used.has(n)),
  });
  uiStore.clearSelection();
  return true;
}

/**
 * Paste: `inPlace` inserts at the copied coordinates; otherwise a placement starts with the ghost.
 * `external` is text the system clipboard handed over, used when it is model code.
 */
export function paste(inPlace: boolean, external?: string): boolean {
  const fromText = external && external !== memoryCode ? fragmentFromCode(external) : null;
  let frag = fromText ?? memory;
  if (!frag) return false;
  const inPlane = !fromText && memoryInPlane;
  if (uiStore.is3DWorkspace) {
    // The model is rewritten in space coordinates first, as any edit does, so the ghost, the
    // welds and the copy all read the same axes.
    modelStore.spaceBeforeWeld();
    if (inPlane) frag = planeFragmentToSpace(frag);
  } else if (!inPlane) {
    uiStore.toast(t('clipboard.spaceInPlane'), 'info');
    return false;
  }
  if (inPlace) {
    const r = insertFragment(frag, [{ A: IDENTITY, t: [0, 0, 0] }], { withLoads: true, withSupports: true });
    uiStore.setSelection(new Set(r.nodes), new Set(r.elements), false,
      new Set([...r.quads.map((id) => `q${id}`), ...r.plates.map((id) => `p${id}`)]));
    uiStore.toast(tp('clipboard.pastedInPlace', { n: r.elements.length + r.quads.length + r.plates.length, welded: r.welded }), 'success');
    return true;
  }
  placementStore.start({ fragment: frag, label: t('clipboard.pasteLabel') });
  return true;
}
