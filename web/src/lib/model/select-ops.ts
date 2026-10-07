/**
 * The selection operations a finite-element program is expected to have.
 *
 * ── What was already there, and what was not ───────────────────────
 *
 * Picking one thing, dragging a box with AutoCAD's Window / Crossing
 * semantics, filtering by kind and taking several kinds at once — all present.
 * What was missing is everything that operates on the selection AS A SET:
 * take all of it, take none of it, take the other half, or name what you want
 * by id because you are reading it out of a table.
 *
 * These are pure set operations over the model. They do not touch the
 * viewport, the solver or the panel, which is what makes them testable
 * without any of the three.
 */

export interface SelectableModel {
  nodes: Map<number, unknown>;
  elements: Map<number, unknown>;
  plates?: Map<number, unknown>;
  quads?: Map<number, unknown>;
  supports?: Map<number, unknown>;
  loads?: ReadonlyArray<{ data: { id: number } }>;
}

export interface Selection {
  nodes: Set<number>;
  elements: Set<number>;
  /** Shells are keyed `p<id>` / `q<id>`, because the two id spaces overlap. */
  shells: Set<string>;
  /**
   * Supports and loads, when the operation reaches them. Absent means "not touched", which is
   * how the operations on nodes and members leave a support or load selection alone.
   */
  supports?: Set<number>;
  loads?: Set<number>;
}

export const EMPTY: Selection = { nodes: new Set(), elements: new Set(), shells: new Set() };

/** Every shell key in the model, in the `p1` / `q7` form the store uses. */
export function allShellKeys(model: SelectableModel): Set<string> {
  const out = new Set<string>();
  for (const id of model.plates?.keys() ?? []) out.add(`p${id}`);
  for (const id of model.quads?.keys() ?? []) out.add(`q${id}`);
  return out;
}

/**
 * Everything, restricted to the kinds currently being selected.
 *
 * Restricted deliberately: "select all" while the reader is working on
 * members should not hand back every node and plate as well, because the next
 * thing they do — delete, assign a section, move — would then reach things
 * they cannot see they have taken.
 */
export function selectAll(model: SelectableModel, kinds: ReadonlySet<string>): Selection {
  return {
    nodes: kinds.has('nodes') ? new Set(model.nodes.keys()) : new Set(),
    elements: kinds.has('elements') ? new Set(model.elements.keys()) : new Set(),
    shells: kinds.has('shells') ? allShellKeys(model) : new Set(),
    supports: kinds.has('supports') ? new Set(model.supports?.keys() ?? []) : new Set(),
    loads: kinds.has('loads') ? new Set((model.loads ?? []).map((l) => l.data.id)) : new Set(),
  };
}

/** Everything of those kinds that is NOT currently selected. */
export function invertSelection(
  model: SelectableModel,
  kinds: ReadonlySet<string>,
  current: Selection,
): Selection {
  const all = selectAll(model, kinds);
  const not = <T>(a: Set<T>, b: Set<T>): Set<T> => {
    const out = new Set<T>();
    for (const v of a) if (!b.has(v)) out.add(v);
    return out;
  };
  return {
    nodes: not(all.nodes, current.nodes),
    elements: not(all.elements, current.elements),
    shells: not(all.shells, current.shells),
    supports: not(all.supports!, current.supports ?? new Set()),
    loads: not(all.loads!, current.loads ?? new Set()),
  };
}

/**
 * Parse a list of ids the way a reader writes one: `3, 7-10, 15`.
 *
 * Ranges because the tables are numbered and the thing a reader wants is
 * usually contiguous in them. Whitespace, commas and semicolons all separate,
 * for the same reason the spreadsheet importer accepts four separators: a
 * person typing a list has no reason to know which one was chosen.
 *
 * Ids that do not exist are REPORTED rather than dropped. "Select 3, 7-10"
 * silently giving four of five is the kind of quiet wrongness that ends with
 * a member missing from a design run.
 */
export function parseIdList(text: string): { ids: number[]; bad: string[] } {
  const ids: number[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/[\s,;]+/).filter(Boolean)) {
    const range = raw.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (a <= b) { for (let i = a; i <= b; i++) ids.push(i); }
      else { for (let i = a; i >= b; i--) ids.push(i); }
      continue;
    }
    if (/^\d+$/.test(raw)) { ids.push(Number(raw)); continue; }
    bad.push(raw);
  }
  return { ids: [...new Set(ids)], bad };
}

/**
 * Select by id, within one kind, reporting ids the model does not have.
 *
 * One kind at a time on purpose: node 7 and member 7 are different things,
 * and a control that took "7" and selected both would be guessing.
 */
export function selectByIds(
  model: SelectableModel,
  kind: 'nodes' | 'elements' | 'plates' | 'quads' | 'supports' | 'loads',
  text: string,
): { selection: Selection; missing: number[]; bad: string[] } {
  const { ids, bad } = parseIdList(text);
  const loadIds = kind === 'loads' ? new Set((model.loads ?? []).map((l) => l.data.id)) : null;
  const has = (id: number): boolean => {
    if (kind === 'nodes') return model.nodes.has(id);
    if (kind === 'elements') return model.elements.has(id);
    if (kind === 'plates') return !!model.plates?.has(id);
    if (kind === 'supports') return !!model.supports?.has(id);
    if (kind === 'loads') return loadIds!.has(id);
    return !!model.quads?.has(id);
  };
  const found = ids.filter(has);
  const missing = ids.filter((id) => !has(id));
  return {
    selection: {
      nodes: kind === 'nodes' ? new Set(found) : new Set(),
      elements: kind === 'elements' ? new Set(found) : new Set(),
      shells: kind === 'plates' ? new Set(found.map((id) => `p${id}`))
        : kind === 'quads' ? new Set(found.map((id) => `q${id}`))
        : new Set(),
      ...(kind === 'supports' ? { supports: new Set(found) } : {}),
      ...(kind === 'loads' ? { loads: new Set(found) } : {}),
    },
    missing,
    bad,
  };
}

/** What `likeMembers` needs of the model: members by their nodes, supports and loads by what they sit on. */
export interface LinkedModel {
  elements: Map<number, { nodeI: number; nodeJ: number }>;
  supports: Map<number, { nodeId: number }>;
  loads: ReadonlyArray<{ data: { id: number; nodeId?: number; elementId?: number } }>;
}

/**
 * The members a selection stands for, to find others like them: the selected members, the
 * members the selected loads sit on, and the members meeting at the selected nodes and at the
 * nodes of the selected supports and nodal loads.
 */
export function seedMembersOf(model: LinkedModel, sel: { nodes: Iterable<number>; elements: Iterable<number>; supports: Iterable<number>; loads: Iterable<number> }): number[] {
  const seeds = new Set<number>([...sel.elements].filter((id) => model.elements.has(id)));
  const atNodes = new Set<number>(sel.nodes);
  for (const id of sel.supports) { const s = model.supports.get(id); if (s) atNodes.add(s.nodeId); }
  const loadIds = new Set(sel.loads);
  for (const l of model.loads) {
    if (!loadIds.has(l.data.id)) continue;
    if (l.data.elementId !== undefined) seeds.add(l.data.elementId);
    else if (l.data.nodeId !== undefined) atNodes.add(l.data.nodeId);
  }
  if (atNodes.size) for (const [id, e] of model.elements) if (atNodes.has(e.nodeI) || atNodes.has(e.nodeJ)) seeds.add(id);
  return [...seeds];
}

/**
 * A set of members as the kinds being selected: the members themselves, their nodes, the
 * supports on those nodes, and the loads on those members or nodes. So "parallel", "connected",
 * "same section" and "same material" work whatever kind is armed above.
 */
export function membersAsKinds(model: LinkedModel, members: Iterable<number>, kinds: ReadonlySet<string>): Selection {
  const ms = new Set(members);
  const ns = new Set<number>();
  for (const id of ms) { const e = model.elements.get(id); if (e) { ns.add(e.nodeI); ns.add(e.nodeJ); } }
  const out: Selection = {
    nodes: kinds.has('nodes') ? ns : new Set(),
    elements: kinds.has('elements') ? ms : new Set(),
    shells: new Set(),
  };
  if (kinds.has('supports')) out.supports = new Set([...model.supports].filter(([, s]) => ns.has(s.nodeId)).map(([id]) => id));
  if (kinds.has('loads')) {
    out.loads = new Set(model.loads.filter((l) =>
      (l.data.elementId !== undefined && ms.has(l.data.elementId)) || (l.data.elementId === undefined && l.data.nodeId !== undefined && ns.has(l.data.nodeId)),
    ).map((l) => l.data.id));
  }
  return out;
}

/**
 * What carries a load of one case: the nodes with nodal loads, the members with member loads,
 * the shells with surface loads. Loads with no case belong to case 1, as the solve reads them.
 */
export function loadedInCase(loads: ReadonlyArray<{ type: string; data: Record<string, unknown> }>, caseId: number): Selection {
  const out: Selection = { nodes: new Set(), elements: new Set(), shells: new Set(), loads: new Set() };
  for (const l of loads) {
    if (((l.data.caseId as number | undefined) ?? 1) !== caseId) continue;
    const d = l.data;
    if (typeof d.id === 'number') out.loads!.add(d.id);
    if (typeof d.nodeId === 'number') out.nodes.add(d.nodeId);
    if (typeof d.elementId === 'number') out.elements.add(d.elementId);
    if (typeof d.quadId === 'number') out.shells.add(`q${d.quadId}`);
    if (typeof d.plateId === 'number') out.shells.add(`p${d.plateId}`);
  }
  return out;
}

export type GlobalDirection = 'X' | 'Y' | 'Z' | 'XY' | 'XZ' | 'YZ';

/**
 * Members parallel to a global axis, or lying parallel to a global plane, within `tolDeg`: the
 * columns (Z), the beams along X, everything in plan (XY).
 */
export function parallelToGlobal(
  nodes: ReadonlyMap<number, { x: number; y: number; z?: number }>,
  elements: ReadonlyMap<number, { nodeI: number; nodeJ: number }>,
  dir: GlobalDirection, tolDeg = 5,
): Set<number> {
  const tol = Math.sin((tolDeg * Math.PI) / 180);
  const axis = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] } as const;
  const normal = { XY: [0, 0, 1], XZ: [0, 1, 0], YZ: [1, 0, 0] } as const;
  const out = new Set<number>();
  for (const [id, e] of elements) {
    const a = nodes.get(e.nodeI), b = nodes.get(e.nodeJ);
    if (!a || !b) continue;
    const d = [b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)];
    const L = Math.hypot(d[0]!, d[1]!, d[2]!);
    if (L < 1e-12) continue;
    const u = d.map((x) => x / L);
    const dot = (v: readonly number[]) => Math.abs(u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!);
    const ok = dir.length === 1 ? dot(axis[dir as 'X']) >= Math.cos((tolDeg * Math.PI) / 180) : dot(normal[dir as 'XY']) <= tol;
    if (ok) out.add(id);
  }
  return out;
}
