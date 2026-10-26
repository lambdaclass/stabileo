/**
 * Unsaved edits made in design's editors, kept outside the editor that made them.
 *
 * The frame editor held its draft in component state, so anything that unmounted it (closing
 * design, moving to another stage, switching project tab, even picking another member) dropped
 * the draft without a word. Kept here, a draft outlives the editor: the editor reads it back when
 * it opens the same line again, and leaving design says how many are waiting.
 *
 * A draft is never applied by leaving. It is written by the editor's own «Save» and removed by
 * «Save» or «Discard»; nothing else touches the model.
 *
 * One project tab's drafts are its own: `capture` and `restore` travel with the tab
 * (`tabs.svelte.ts`), and a new project starts with none. View state only, like the desk's.
 */
import type { BeamLineReinforcement } from '../design-contract/beam-line';

/** A frame line's draft: the line it is for, its bars and stirrups, and the editor's own undo. */
export interface FrameDraft {
  /** `lineKey(line.members)`. */
  key: string;
  /** The members along the line, to reopen it and to drop it when one of them is deleted. */
  members: number[];
  /** The line's label, to name it where the draft is announced. */
  label: string;
  draft: BeamLineReinforcement;
  undo: BeamLineReinforcement[];
}

export interface DraftsState { frames: FrameDraft[] }

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function createDrafts() {
  let frames = $state.raw<Record<string, FrameDraft>>({});

  return {
    /** How many drafts are waiting, of every editor that keeps one here. */
    get count() { return Object.keys(frames).length; },
    get frames(): FrameDraft[] { return Object.values(frames); },
    frame(key: string): FrameDraft | undefined { return frames[key]; },
    setFrame(d: FrameDraft) { frames = { ...frames, [d.key]: clone(d) }; },
    dropFrame(key: string) {
      if (!(key in frames)) return;
      const next = { ...frames };
      delete next[key];
      frames = next;
    },
    /** Drop the drafts that name a member the model no longer has. */
    prune(hasMember: (id: number) => boolean) {
      const gone = Object.values(frames).filter((d) => d.members.some((id) => !hasMember(id)));
      if (gone.length === 0) return;
      const next = { ...frames };
      for (const d of gone) delete next[d.key];
      frames = next;
    },
    capture(): DraftsState { return { frames: clone(Object.values(frames)) }; },
    restore(s: DraftsState | undefined) {
      frames = Object.fromEntries((s?.frames ?? []).map((d) => [d.key, clone(d)]));
    },
    clear() { frames = {}; },
  };
}

export const designDrafts = createDrafts();
