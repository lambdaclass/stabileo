// Resolve the UI selection channels into explicit per-kind delete targets.
//
// Frame elements, plates and quads have INDEPENDENT id spaces (each counts
// from 1), so a numeric id can exist in more than one map. The delete path
// must therefore NEVER infer an entity's kind from its numeric id. The UI
// keeps shells in their own channel (`selectedShells`, keyed "p<id>"/"q<id>"),
// while `selectedElements` only ever holds FRAME ids. This helper maps those
// channels straight through — a shell is a delete target only if it was
// actually selected (and highlighted) as a shell.

export interface DeleteSelectionInput {
  nodes: Iterable<number>;
  /** Frame-element ids (box-select / element rows). Never shell ids. */
  elements: Iterable<number>;
  /** Shell selection keys: "p<id>" (plate) or "q<id>" (quad). */
  shells: Iterable<string>;
}

export interface DeleteTargets {
  nodes: number[];
  elements: number[];
  plates: number[];
  quads: number[];
}

/** Map the selection channels to explicit delete targets. `hasElement` filters
 *  the frame ids to those that are really frames (defensive — a stale id is
 *  dropped, never reinterpreted as a shell). */
export function resolveDeleteTargets(
  sel: DeleteSelectionInput,
  hasElement: (id: number) => boolean,
): DeleteTargets {
  const elements = [...sel.elements].filter(hasElement);
  const plates: number[] = [];
  const quads: number[] = [];
  for (const key of sel.shells) {
    const id = Number(key.slice(1));
    if (Number.isNaN(id)) continue;
    if (key[0] === 'p') plates.push(id);
    else if (key[0] === 'q') quads.push(id);
  }
  return { nodes: [...sel.nodes], elements, plates, quads };
}
