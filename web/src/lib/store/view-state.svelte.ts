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
