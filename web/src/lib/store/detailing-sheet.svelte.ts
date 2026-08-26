/**
 * The sheet a reviewer is looking at: which kind, cut where, headed how.
 *
 * ── Why it is its own store ────────────────────────────────────────
 *
 * `detailing.svelte.ts` has an 800-line ceiling and `detailing-store-ceiling.test.ts` states
 * what to do when a change needs more room: "the answer is to extract — not to raise the
 * number here". Objectives 7 and 8 gave the sheet real geometry, a station, and a rótulo, and
 * that is a surface of its own rather than three more members on the assembly store.
 *
 * It is a STORE and not another `-inputs.ts` module, because it holds state and routes intent —
 * which sheet kind is selected, where the section is cut, what the author typed. That is the
 * definition the ceiling gate uses, and a readings module is asserted to declare no runes.
 *
 * ── The direction of the dependency ────────────────────────────────
 *
 * This imports `detailingStore`; `detailingStore` does not import this. One direction, and the
 * components import whichever they need. The alternative — delegating getters on the assembly
 * store — would have left the surface in two places and the ceiling in one.
 *
 * ── What persists and what does not ────────────────────────────────
 *
 *   the sheet KIND and the section STATION are view state. Which drawing you are looking at is
 *   not a property of the project, and a reopened project showing somebody else's section
 *   through somebody else's beam would be answering a question nobody asked.
 *
 *   the RÓTULO is a project decision and lives on the model. The same project opened on
 *   another machine is the same works.
 */

import { modelStore } from './model.svelte';
import { requestAutosave } from './autosave-service';
import { detailingStore } from './detailing.svelte';
import { emptyDetailingStore } from '../engine/detailing/assembly';
import { sheetToSvg, type Sheet } from '../engine/detailing/drawings';
import {
  buildElevationSheet, buildSectionSheet, rotuloFor, sheetMembers, stationsFor,
  titleBlockCodesFor,
} from './detailing-sheet-inputs';
import {
  rcNormaliseTitleBlock, type RcTitleBlockCode, type RcTitleBlockConfig,
} from '../engine/detailing/title-block-config';

export type SheetSelection = 'elevation' | 'section';

function createDetailingSheetStore() {
  let kind = $state<SheetSelection>('elevation');
  /**
   * Where the user asked the section to be cut, or null while they have not.
   *
   * Null is not zero. It WAS zero and no control ever set it, so every section sheet in the app
   * was a cut at the model's origin — a column line on a framed building, which is why it came
   * out as a tall slice down a column instead of the beam section it was opened for.
   * `sectionStations` resolves the default: mid-span of the longest member on the sheet.
   */
  let stationOverride = $state<number | null>(null);

  /**
   * The concrete the sheets draw, resolved once per model change.
   *
   * A `$derived` and not a call in the getter, for `scene-cache.ts`'s measured reason:
   * `sheetMembers` allocates on every call, and `svg` is read on every reactive touch of a
   * panel that re-renders on selection, on sheet kind and on every conflict step.
   */
  const members = $derived.by(() => sheetMembers());
  const config = $derived<RcTitleBlockConfig>(
    modelStore.model.detailing?.titleBlock ?? {},
  );

  return {
    get kind(): SheetSelection { return kind; },
    setKind(k: SheetSelection): void { kind = k; },

    /** The station the section is cut at: the user's, or mid-span of the longest member. */
    get sectionAt(): number {
      return stationOverride
        ?? stationsFor(detailingStore.selected, members)?.preferred ?? 0;
    },
    /**
     * The range a station control may offer, or null when nothing on the sheet has geometry.
     *
     * Null rather than a `0…0` range: a control that can only be set to one value is a control
     * that lies about what it does.
     */
    get sectionRange(): { min: number; max: number } | null {
      const s = stationsFor(detailingStore.selected, members);
      return s ? { min: s.min, max: s.max } : null;
    },
    setSectionAt(x: number): void { stationOverride = x; },

    /** The sheet for the current selection. Geometry lives in `detailing-sheet-inputs.ts`. */
    get sheet(): Sheet | null {
      const a = detailingStore.selected;
      if (!a) return null;
      // The rótulo travels with the sheet, so a preview and the DXF are one statement.
      const rotulo = rotuloFor(config);
      return kind === 'section'
        ? buildSectionSheet(a, members, this.sectionAt, rotulo)
        : buildElevationSheet(a, members, rotulo);
    },

    get svg(): string | null {
      const s = this.sheet;
      return s ? sheetToSvg(s) : null;
    },

    /** The project's rótulo. Empty on a project nobody has identified — never a stand-in name. */
    get titleBlockConfig(): RcTitleBlockConfig { return config; },

    /** The norms every sheet prints, verified ones first. See `titleBlockCodesFor`. */
    get titleBlockCodes(): RcTitleBlockCode[] { return titleBlockCodesFor(config); },

    /**
     * Write the rótulo, normalised on the way IN.
     *
     * What is stored is what a reopened project carries, and a newline surviving into storage
     * breaks the DXF `TEXT` entity of every sheet in the set — on whoever opens it next.
     *
     * The current document is retired for the ordinary reason: the sheets it holds are headed
     * with the rótulo that has just stopped being current.
     */
    setTitleBlock(patch: RcTitleBlockConfig): void {
      const next = rcNormaliseTitleBlock({ ...config, ...patch });
      detailingStore.supersedeDocuments();
      const store = modelStore.model.detailing ?? emptyDetailingStore();
      modelStore.model.detailing = { ...store, titleBlock: next };
      void requestAutosave('detailing');
    },
  };
}

export const detailingSheet = createDetailingSheetStore();
