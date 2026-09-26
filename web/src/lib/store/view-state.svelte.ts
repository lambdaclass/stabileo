/**
 * How the PRO view is read: what a member's label says, and a second window on a saved view.
 *
 * Neither is a project definition — a saved view is (`modelStore.views`), but which one is shown
 * in the corner, and whether member labels read ids or sections, is how this user is looking at
 * the model right now.
 */

/** What a member label shows. */
export type MemberLabel = 'id' | 'section' | 'material';
export const MEMBER_LABELS: readonly MemberLabel[] = ['id', 'section', 'material'];

import { modelStore } from './model.svelte';

let memberLabel = $state<MemberLabel>('id');
/** The saved view drawn in the corner window, or null for none. */
let insetViewId = $state<number | null>(null);

export const viewState = {
  get memberLabel() { return memberLabel; },
  set memberLabel(v: MemberLabel) { memberLabel = v; },
  /** Next label content, for the shortcut that cycles it. */
  cycleMemberLabel() { memberLabel = MEMBER_LABELS[(MEMBER_LABELS.indexOf(memberLabel) + 1) % MEMBER_LABELS.length]!; },
  get insetViewId() { return insetViewId; },
  set insetViewId(v: number | null) { insetViewId = v; },
};

/** The text of a member's label. */
export function memberLabelText(
  mode: MemberLabel,
  elem: { id: number; sectionId: number; materialId: number },
  sections: ReadonlyMap<number, { name: string }>,
  materials: ReadonlyMap<number, { name: string }>,
): string {
  if (mode === 'section') return sections.get(elem.sectionId)?.name ?? String(elem.id);
  if (mode === 'material') return materials.get(elem.materialId)?.name ?? String(elem.id);
  return String(elem.id);
}

/**
 * The nodes a selection covers, for framing it: the selected nodes and the ends of the selected
 * members. Empty when nothing is selected.
 */
export function selectionNodeIds(
  nodes: Iterable<number>, elements: Iterable<number>,
  elementMap: ReadonlyMap<number, { nodeI: number; nodeJ: number }>,
): Set<number> {
  const out = new Set<number>(nodes);
  for (const id of elements) {
    const e = elementMap.get(id);
    if (e) { out.add(e.nodeI); out.add(e.nodeJ); }
  }
  return out;
}

// ─── Hiding and isolating ────────────────────────────────────────────
//
// What the viewport draws, not what the model holds: a hidden member is not drawn, picked,
// loaded on screen or labelled, and it is still analysed, designed and saved. "Show only the
// selection" is how one storey or every column is looked at alone; "Show all" brings the rest
// back. Not saved with the project — it is how this reader is looking right now.

export interface Hidden { elements: Set<number>; nodes: Set<number>; shells: Set<string> }

let hidden = $state<Hidden | null>(null);
/** Bumped on every change, so the scene can key a rebuild on one number. */
let hiddenVersion = $state(0);

const emptyHidden = (): Hidden => ({ elements: new Set(), nodes: new Set(), shells: new Set() });

/** Nodes that only hidden members and shells use are hidden with them. */
function withOrphanNodes(h: Hidden): Hidden {
  const used = new Map<number, boolean>(); // node → used by something visible
  const mark = (n: number, visible: boolean) => used.set(n, (used.get(n) ?? false) || visible);
  for (const [id, e] of modelStore.elements) { const v = !h.elements.has(id); mark(e.nodeI, v); mark(e.nodeJ, v); }
  for (const [id, p] of modelStore.plates) for (const n of p.nodes) mark(n, !h.shells.has(`p${id}`));
  for (const [id, q] of modelStore.quads) for (const n of q.nodes) mark(n, !h.shells.has(`q${id}`));
  const nodes = new Set(h.nodes);
  for (const [n, visible] of used) if (!visible) nodes.add(n);
  return { elements: h.elements, nodes, shells: h.shells };
}

function setHidden(h: Hidden | null) {
  hidden = h && (h.elements.size + h.nodes.size + h.shells.size > 0) ? withOrphanNodes(h) : null;
  hiddenVersion++;
}

export const viewVisibility = {
  get hidden() { return hidden; },
  get version() { return hiddenVersion; },
  get active() { return hidden !== null; },
  /** Hide what is selected, on top of what already is. */
  hide(sel: { nodes: Iterable<number>; elements: Iterable<number>; shells: Iterable<string> }) {
    const h = hidden ? { elements: new Set(hidden.elements), nodes: new Set(hidden.nodes), shells: new Set(hidden.shells) } : emptyHidden();
    for (const e of sel.elements) h.elements.add(e);
    for (const n of sel.nodes) h.nodes.add(n);
    for (const k of sel.shells) h.shells.add(k);
    setHidden(h);
  },
  /** Show only what is selected, with the nodes it needs. */
  isolate(sel: { nodes: Iterable<number>; elements: Iterable<number>; shells: Iterable<string> }) {
    const keepE = new Set(sel.elements), keepS = new Set(sel.shells), keepN = new Set(sel.nodes);
    for (const id of keepE) { const e = modelStore.elements.get(id); if (e) { keepN.add(e.nodeI); keepN.add(e.nodeJ); } }
    for (const k of keepS) {
      const shell = k.startsWith('p') ? modelStore.plates.get(Number(k.slice(1))) : modelStore.quads.get(Number(k.slice(1)));
      for (const n of shell?.nodes ?? []) keepN.add(n);
    }
    const h = emptyHidden();
    for (const id of modelStore.elements.keys()) if (!keepE.has(id)) h.elements.add(id);
    for (const id of modelStore.plates.keys()) if (!keepS.has(`p${id}`)) h.shells.add(`p${id}`);
    for (const id of modelStore.quads.keys()) if (!keepS.has(`q${id}`)) h.shells.add(`q${id}`);
    for (const id of modelStore.nodes.keys()) if (!keepN.has(id)) h.nodes.add(id);
    setHidden(h);
  },
  showAll() { setHidden(null); },
  isElementHidden(id: number) { return hidden?.elements.has(id) ?? false; },
  isNodeHidden(id: number) { return hidden?.nodes.has(id) ?? false; },
  isShellHidden(key: string) { return hidden?.shells.has(key) ?? false; },
};

/** A model map without what is hidden; the map itself when nothing is. Cached per map and change. */
const cache = new WeakMap<object, { version: number; out: Map<number, any> }>();
function visible<T>(src: Map<number, T>, isHidden: (id: number) => boolean): Map<number, T> {
  if (!hidden) return src;
  const c = cache.get(src);
  if (c && c.version === hiddenVersion) return c.out as Map<number, T>;
  const out = new Map([...src].filter(([id]) => !isHidden(id)));
  cache.set(src, { version: hiddenVersion, out });
  return out;
}
export const visibleElements = () => visible(modelStore.elements, (id) => viewVisibility.isElementHidden(id));
export const visibleNodes = () => visible(modelStore.nodes, (id) => viewVisibility.isNodeHidden(id));
export const visiblePlates = () => visible(modelStore.plates, (id) => viewVisibility.isShellHidden(`p${id}`));
export const visibleQuads = () => visible(modelStore.quads, (id) => viewVisibility.isShellHidden(`q${id}`));
