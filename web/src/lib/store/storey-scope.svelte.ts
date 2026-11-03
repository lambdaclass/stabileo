/**
 * Which storeys an edit reaches: this one, its similar ones, or all (`model/similar-storeys.ts`).
 * With a scope wider than "this", what is selected on one storey is selected on the others it
 * reaches, so every edit and assignment of the selection applies there too, and a member drawn on
 * a storey is drawn on them as well. PRO's; a view setting, not saved.
 */
import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { expandToStoreys, placeMemberOn, elementLevel, scopeLevels, STOREY_TOL, type StoreyExpansion, type StoreyScope } from '../model/similar-storeys';

let scope = $state<StoreyScope>('this');
let last = $state<StoreyExpansion | null>(null);
let produced = '';

const model = () => ({ nodes: modelStore.nodes, elements: modelStore.elements, quads: modelStore.quads, plates: modelStore.plates });
const levels = () => modelStore.grid?.levels ?? [];

export const storeyScope = {
  get scope() { return scope; },
  set scope(v: StoreyScope) { scope = v; last = null; produced = ''; if (v !== 'this') this.expandSelection(); },
  /** What the last expansion took: how many objects, on which storeys, and what had no counterpart. */
  get last() { return last; },
  get active() { return uiStore.analysisMode === 'pro' && scope !== 'this' && levels().length > 1; },
  /** Take the selection to the storeys in scope. Returns how many objects it added. */
  expandSelection(): number {
    if (!this.active) return 0;
    const sel = { elements: uiStore.selectedElements, nodes: uiStore.selectedNodes, shells: uiStore.selectedShells };
    if (sel.elements.size + sel.nodes.size + sel.shells.size === 0) { last = null; produced = ''; return 0; }
    if (selectionKey(sel.nodes, sel.elements, sel.shells) === produced) return 0;
    const x = expandToStoreys(model(), levels(), sel, scope);
    last = x;
    produced = selectionKey(x.nodes, x.elements, x.shells);
    if (x.added > 0) uiStore.setSelection(new Set(x.nodes), new Set(x.elements), false, new Set(x.shells));
    return x.added;
  },
  /**
   * Draw member `id`'s copies on the storeys in scope, inside the caller's undo step: the same plan
   * position and heights above each level, the same material and section. Their ids.
   */
  replicateMember(id: number): number[] {
    if (!this.active) return [];
    const e = modelStore.elements.get(id);
    const lv = elementLevel(model(), id, levels());
    if (!e || !lv) return [];
    const a = modelStore.nodes.get(e.nodeI), b = modelStore.nodes.get(e.nodeJ);
    if (!a || !b) return [];
    const out: number[] = [];
    for (const other of scopeLevels(levels(), lv.id, scope)) {
      if (other.id === lv.id) continue;
      const ends = placeMemberOn(a, b, lv, other, levels());
      if (!ends) continue;
      const [i, j] = ends.map(nodeAt) as [number, number];
      if (i === j || joined(i, j)) continue;
      const nid = modelStore.addElement(i, j, e.type);
      modelStore.updateElementMaterial(nid, e.materialId);
      modelStore.updateElementSection(nid, e.sectionId);
      out.push(nid);
    }
    return out;
  },
};

function selectionKey(nodes: Iterable<number>, elements: Iterable<number>, shells: Iterable<string | number>): string {
  const ids = (s: Iterable<string | number>) => [...s].map(String).sort().join(',');
  return `${ids(nodes)}|${ids(elements)}|${ids(shells)}`;
}

/** Whether a member already joins nodes `i` and `j`, either way round. */
function joined(i: number, j: number): boolean {
  for (const e of modelStore.elements.values()) if ((e.nodeI === i && e.nodeJ === j) || (e.nodeI === j && e.nodeJ === i)) return true;
  return false;
}

/** The node at a point, or a new one there. */
function nodeAt(p: { x: number; y: number; z: number }): number {
  for (const [id, n] of modelStore.nodes) {
    if (Math.abs(n.x - p.x) <= STOREY_TOL && Math.abs(n.y - p.y) <= STOREY_TOL && Math.abs((n.z ?? 0) - p.z) <= STOREY_TOL) return id;
  }
  return modelStore.addNode(p.x, p.y, p.z);
}
