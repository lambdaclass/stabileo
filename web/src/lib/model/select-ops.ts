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
}

export interface Selection {
  nodes: Set<number>;
  elements: Set<number>;
  /** Shells are keyed `p<id>` / `q<id>`, because the two id spaces overlap. */
  shells: Set<string>;
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
  kind: 'nodes' | 'elements' | 'plates' | 'quads',
  text: string,
): { selection: Selection; missing: number[]; bad: string[] } {
  const { ids, bad } = parseIdList(text);
  const has = (id: number): boolean => {
    if (kind === 'nodes') return model.nodes.has(id);
    if (kind === 'elements') return model.elements.has(id);
    if (kind === 'plates') return !!model.plates?.has(id);
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
    },
    missing,
    bad,
  };
}
