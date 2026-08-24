/**
 * What was emitted, from which revision, and what it could not say.
 *
 * ── The gap this closes ────────────────────────────────────────────
 *
 * The three export paths — XLSX, DXF, report — each call `currentDoc()`, write a blob, and
 * tell nobody. So a user who exported the drawings, edited a footing and came back to
 * Documentos has no way to know the file in their folder no longer corresponds. The model DOES
 * know it superseded something (`supersededBy`, `supersededDocuments`); nothing connects that
 * to the files that left.
 *
 * The minimum contract was specified in `docs/handoffs/h1-export-coverage-and-contract.md` §5.
 * This is that, plus the four things §4 of the scope requires every export to state: which
 * elements it includes, which of those were retouched by hand, what state the generation
 * reached, and what the document genuinely cannot say.
 *
 * ── Three rules carried over, deliberately ─────────────────────────
 *
 * 1. `at` comes from the CALLER, never from a clock read here. `detailing.svelte.ts` already
 *    states the rule about itself: "The store never reads the clock itself; the timestamp comes
 *    from the action."
 *
 * 2. Failures are recorded too. An export that failed is exactly what the user does not
 *    remember doing.
 *
 * 3. **No retroactive records.** That a document exists does NOT prove it was ever exported.
 *    Deriving records from the existence of a `DocumentModel` would produce a list of emissions
 *    that never happened, in the one surface whose entire purpose is to say what really left.
 *    There is no constructor here that takes a document and infers a history, and there must
 *    not be one.
 *
 * ── And one distinction that is product, not plumbing ──────────────
 *
 * "Exported" is not "issued for construction". `issue-submit` and its chain of blockers exist
 * for the second and must stay the only thing that asserts it. An export is a file that left.
 */

import type { RcRetouchProvenance } from './rc-selection';

/**
 * What can be emitted.
 *
 * Closed on purpose: a fourth kind is a decision about what the product issues, not a value
 * someone passes in. `preview` is deliberately absent — a preview produces no file and leaves
 * no record; see `RcPreviewTarget`.
 */
export type ExportKind = 'report' | 'dxf' | 'xlsx';

/**
 * How far a generation got.
 *
 * §4 requires every export to state its generation state, and the four values are the ones the
 * app can actually distinguish. `ready` means the blob was produced and the download was
 * offered — see `EXPORT_CANNOT_ASSERT` for the several things it does NOT mean.
 */
export type RcGenerationState = 'idle' | 'running' | 'ready' | 'failed';

/** One emission. */
export interface ExportRecord {
  kind: ExportKind;
  /** Which revision it came out of — the key to the whole thing. */
  revision: number;
  /** So a project with several document series does not mix them. */
  seriesId: string;
  /** ISO-8601, provided by the caller. Never read from a clock here. */
  at: string;
  /** The name offered to the browser. */
  filename: string;
  /** Null when it succeeded; the already-translated message when it did not. */
  error: string | null;
  /**
   * The members the emission covered.
   *
   * Named rather than counted, because "12 elements" does not survive the model changing and a
   * list does. Empty is a legitimate value for a whole-document export whose scope was not
   * narrowed — the UI must distinguish that from "no elements", which is why the state below
   * exists.
   */
  elements: readonly number[];
  /**
   * Which of them had been touched by hand, and whether that is even knowable.
   *
   * `known: false` after a project is reopened, because `designRunStore.manualOverrides` does
   * not persist. Printing "none" there would be a false statement — see `rc-selection.ts`.
   */
  retouched: RcRetouchProvenance;
  /**
   * What this emission genuinely cannot say, as i18n keys.
   *
   * Keys and not sentences: this module names keys and never translates. Real limitations
   * only — the list is rendered next to the file name and a decorative entry there would train
   * the reader to skip it.
   */
  limitations: readonly string[];
  /** Where the generation ended. `ready` and a non-null `error` cannot both be true. */
  state: RcGenerationState;
}

/** Everything except the series, which the store assigns. */
export type ExportRecordDraft = Omit<ExportRecord, 'seriesId'>;

/**
 * Whether a record describes a file that no longer matches the current document.
 *
 * Stale is INFORMATION, not an error. Exporting and then continuing to edit is a normal
 * working pattern, and marking it as a fault would train people to ignore the mark.
 */
export function isStaleExport(r: ExportRecord, currentRevision: number): boolean {
  return r.error === null && r.revision !== currentRevision;
}

/** The records that no longer match, oldest first. */
export function staleExports(
  records: readonly ExportRecord[], currentRevision: number,
): ExportRecord[] {
  return records.filter((r) => isStaleExport(r, currentRevision));
}

/**
 * A record is internally consistent.
 *
 * Exported so both the store and its tests can apply the same rule, and so the two states that
 * must never coexist are named in one place rather than asserted twice with different words.
 */
export function isCoherentExport(r: ExportRecord): boolean {
  if (r.state === 'ready' && r.error !== null) return false;
  if (r.state === 'failed' && r.error === null) return false;
  // A record is written when a generation TERMINATES. `idle` and `running` are states of the
  // UI, not of something that happened, and a record in one of them describes nothing.
  if (r.state === 'idle' || r.state === 'running') return false;
  return true;
}

/**
 * What a browser export can never assert, as i18n keys.
 *
 * Written down here so that nobody has to rediscover it when someone asks the UI to claim one
 * of them. Every entry was measured, not assumed:
 *
 *   the file still exists on disk    the browser hands over the blob and loses sight of it
 *   the user kept it                 they may have cancelled the dialog
 *   the PDF was printed              `print()` hands off to the OS and returns nothing
 *   the file was not modified        there is no hash of what left, and hashing the blob
 *                                    would describe the blob, not the file
 *
 * Which is why the field is called `export` and not `delivery`.
 */
export const EXPORT_CANNOT_ASSERT: readonly string[] = [
  'design.export.cannot.onDisk',
  'design.export.cannot.kept',
  'design.export.cannot.printed',
  'design.export.cannot.unmodified',
] as const;

/**
 * What a preview shows.
 *
 * A preview is NOT an export and produces no record: nothing leaves, so there is nothing to go
 * stale and nothing to be wrong about later. It is here because §4 asks for previews next to
 * each export and the two must not be confused in the UI either — a preview that looked like an
 * emission would put a file in someone's head that is not in their folder.
 *
 * `elements` empty means the whole document, matching `ExportRecord.elements`.
 */
export interface RcPreviewTarget {
  kind: ExportKind;
  revision: number;
  elements: readonly number[];
}

/** A preview in flight or resolved. `state` is the same four values an export uses. */
export interface RcPreviewStatus {
  target: RcPreviewTarget | null;
  state: RcGenerationState;
  /** Already-translated message when `state === 'failed'`. */
  error: string | null;
}

/** Nothing requested. The state a panel starts in. */
export const PREVIEW_IDLE: RcPreviewStatus = { target: null, state: 'idle', error: null };
