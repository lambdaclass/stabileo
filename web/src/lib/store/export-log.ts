/**
 * Recording what left the app, and what it was entitled to say about itself.
 *
 * ── The caller that was missing ────────────────────────────────────
 *
 * `exportRecordStore.record()` had none. The contract was written, the store was written, the
 * records were persisted with the project and hydrated back on open — and the three export
 * handlers wrote their blob and told nobody, so the list was empty in every project that has
 * ever existed. `rc-export-record.ts` opens by naming exactly that consequence: "a user who
 * exported the drawings, edited a footing and came back to Documentos has no way to know the
 * file in their folder no longer corresponds."
 *
 * This is that caller, and it is a module rather than three closures in a component because it
 * makes the same four decisions each time and one of them is not obvious.
 *
 * ── The one that is not obvious: whose retouches ───────────────────
 *
 * §4 asks every export to state "its manually retouched elements", and the emphasis is on ITS.
 * `designRunStore.manualOverrides` is the PROJECT's set. A drawing set of level 3 that listed a
 * hand edit on level 7 would be making a statement about steel it does not contain, on a sheet
 * somebody signs — so the set is narrowed to the members the document covers, by
 * `rcRetouchWithin`, which is careful to leave `unknown` unknown.
 *
 * ── And a rule carried from the store it feeds ─────────────────────
 *
 * `at` comes from the caller, never from a clock read here. Same reason `detailing.svelte.ts`
 * gives about itself: a module that reads the clock cannot be tested against a fixed instant,
 * and every record it writes is unfalsifiable.
 */

import { modelStore } from './model.svelte';
import { designRunStore } from './design-run.svelte';
import { exportRecordStore } from './export-record.svelte';
import {
  EXPORT_CANNOT_ASSERT, type ExportKind, type ExportRecord,
} from '../flow/rc-export-record';
import {
  rcRetouchProvenance, rcRetouchWithin, type RcRetouchProvenance,
} from '../flow/rc-selection';
import type { DocumentModel } from '../engine/detailing/document-model';

/** The members a document covers: the union of what its assemblies claim, ascending. */
export function documentMembers(doc: DocumentModel): number[] {
  const out = new Set<number>();
  for (const a of doc.assemblies) for (const id of a.elementIds) out.add(id);
  return [...out].sort((x, y) => x - y);
}

/**
 * What THIS document may say about hand edits.
 *
 * Three inputs, and the order matters: `notApplicable` outranks `unknown`, because a project
 * with no design has no set that could have members — `rcRetouchProvenance` states why. Then
 * the narrowing, which is what makes the answer the document's rather than the project's.
 */
export function retouchedIn(doc: DocumentModel): RcRetouchProvenance {
  const project = rcRetouchProvenance(
    designRunStore.manualProvenanceKnown,
    // The PERSISTED assemblies, not `detailingStore.assemblies` — `buildDocument`'s documented
    // trap. An export is one user gesture and one tick, and a `$derived` that has not
    // recomputed reports an empty project, which turns every export's retouch statement into
    // `notApplicable`: the one state that means "the question has no subject".
    (modelStore.model.detailing?.assemblies.length ?? 0) > 0,
    designRunStore.manualOverrides,
  );
  return rcRetouchWithin(project, documentMembers(doc));
}

/**
 * Record one emission.
 *
 * `error` null means the blob was produced and the download was offered — see
 * `EXPORT_CANNOT_ASSERT` for the several things that does NOT mean, all of which ride on the
 * record so the UI never has to remember them.
 */
export function logExport(opts: {
  kind: ExportKind;
  doc: DocumentModel;
  filename: string;
  at: string;
  error?: string | null;
}): ExportRecord | null {
  const error = opts.error ?? null;
  return exportRecordStore.record(opts.doc.seriesId, {
    kind: opts.kind,
    revision: opts.doc.revision.number,
    at: opts.at,
    filename: opts.filename,
    error,
    elements: documentMembers(opts.doc),
    retouched: retouchedIn(opts.doc),
    limitations: EXPORT_CANNOT_ASSERT,
    // A record is written when a generation TERMINATES, which is the only pair of states
    // `isCoherentExport` will accept.
    state: error === null ? 'ready' : 'failed',
  });
}

/**
 * Run an export and record it either way.
 *
 * The failure path is the point. A `try` that only recorded successes would leave the list
 * saying nothing about the afternoon a user pressed the button four times and got nothing —
 * which is precisely the afternoon the list is for. The error is re-thrown to the caller so the
 * panel can show it; recording is not swallowing.
 */
export function withExportLog<T>(
  opts: { kind: ExportKind; doc: DocumentModel; filename: string; at: string },
  run: () => T,
): T {
  try {
    const out = run();
    logExport(opts);
    return out;
  } catch (e) {
    logExport({ ...opts, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}
