/**
 * What an edit panel would do, drawn before it is done: copies of the selection under the
 * transforms a repeat, polar repeat, rotation or mirror is set to, and marked points (where a
 * split would cut). The viewport draws it as a ghost; the model is not touched and stays
 * editable, which is the difference with a placement.
 */
import { untrack } from 'svelte';
import type { Affine, Vec3 } from '../model/edit/affine';
import type { Fragment } from '../model/edit/fragment';

function createEditPreview() {
  let fragment = $state.raw<Fragment | null>(null);
  let transforms = $state.raw<Affine[]>([]);
  let points = $state.raw<Vec3[]>([]);
  let owner = $state<string | null>(null);
  let revision = $state(0);

  return {
    get fragment() { return fragment; },
    get transforms() { return transforms; },
    get points() { return points; },
    get owner() { return owner; },
    get revision() { return revision; },
    /** Show copies of `frag` under each transform, on behalf of `who` (a panel). */
    // Called from panels' effects: nothing read here may become their dependency.
    show(who: string, frag: Fragment | null, ts: Affine[], pts: Vec3[] = []) {
      untrack(() => { owner = who; fragment = frag; transforms = ts; points = pts; revision++; });
    },
    /** Clear, if `who` is the one showing (a panel closing does not clear another's preview). */
    clear(who?: string) {
      untrack(() => {
        if (who !== undefined && who !== owner) return;
        if (owner === null && fragment === null && points.length === 0) return;
        owner = null; fragment = null; transforms = []; points = []; revision++;
      });
    },
  };
}

export const editPreview = createEditPreview();
