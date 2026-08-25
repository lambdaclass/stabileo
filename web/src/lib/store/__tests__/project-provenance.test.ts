/**
 * What a project remembers about its own history, across save, reopen, tab switch and undo.
 *
 * The two assertions that decide whether this is correct at all:
 *
 *   1. a file written before these fields existed reports UNKNOWN, never "none";
 *   2. undo does not delete an export record — an emission is a historical fact, and the undo
 *      entry predating it must not be able to un-happen it.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { designRunStore } from '../design-run.svelte';
import { exportRecordStore } from '../export-record.svelte';
import {
  captureProjectProvenance, hydrateProjectProvenance, resetProjectProvenance,
} from '../project-provenance';
import { rcRetouch, rcRetouchProvenance } from '../../flow/rc-selection';
import type { ExportRecord, ExportRecordDraft } from '../../flow/rc-export-record';
import type { ModelSnapshot } from '../history.svelte';

const draft = (over: Partial<ExportRecord> = {}): ExportRecordDraft => ({
  kind: 'xlsx', revision: 1, at: '2026-08-24T10:00:00.000Z',
  filename: 'detailing-rev1.xlsx', error: null, elements: [1, 2],
  retouched: rcRetouch([2]), limitations: [], state: 'ready', ...over,
});

beforeEach(() => {
  resetProjectProvenance();
});

describe('a new project knows its own history', () => {
  it('has no emissions and a KNOWN empty retouch set', () => {
    expect(exportRecordStore.exports).toEqual([]);
    expect(designRunStore.manualProvenanceKnown).toBe(true);
    expect(designRunStore.manualOverrides.size).toBe(0);
  });

  /*
   * The distinction the whole feature exists for, at its origin: a fresh project genuinely
   * knows nothing was retouched. That is a claim, and it may be printed.
   */
  it('and that is a claim, not an absence', () => {
    const p = rcRetouchProvenance(
      designRunStore.manualProvenanceKnown, true, designRunStore.manualOverrides);
    expect(p.status).toBe('known');
  });
});

describe('round trip through a snapshot', () => {
  it('carries emissions and hand edits out and back', () => {
    exportRecordStore.record('s1', draft({ filename: 'a.xlsx' }));
    exportRecordStore.record('s1', draft({ revision: 2, filename: 'b.dxf', kind: 'dxf' }));
    designRunStore.markManual([4, 1]);

    const captured = captureProjectProvenance();
    expect(captured.exports).toHaveLength(2);
    expect(captured.manualEdits).toEqual([1, 4]);

    // A different session opens it.
    resetProjectProvenance();
    expect(exportRecordStore.exports).toHaveLength(0);
    hydrateProjectProvenance(captured);

    expect(exportRecordStore.exports.map((r) => r.filename)).toEqual(['a.xlsx', 'b.dxf']);
    expect([...designRunStore.manualOverrides].sort()).toEqual([1, 4]);
    expect(designRunStore.manualProvenanceKnown).toBe(true);
  });

  /*
   * The capture deep-copies, so a later export cannot reach back into an already-written undo
   * entry or an already-saved tab state. The same aliasing hazard `restore()` documents for
   * footings, and it is invisible until someone holds the snapshot in reactive state.
   */
  it('does not alias the live store', () => {
    exportRecordStore.record('s1', draft({ elements: [1, 2] }));
    const captured = captureProjectProvenance();
    designRunStore.markManual([9]);
    exportRecordStore.record('s1', draft({ filename: 'later.xlsx' }));

    expect(captured.exports, 'the capture did not grow').toHaveLength(1);
    expect(captured.manualEdits, 'nor did its hand-edit list').toEqual([]);
    expect(captured.exports![0].elements).not.toBe(exportRecordStore.exports[0].elements);
  });

  it('survives a JSON round trip, which is what a .ded is', () => {
    exportRecordStore.record('s1', draft());
    designRunStore.markManual([3]);
    const onDisk = JSON.parse(JSON.stringify(captureProjectProvenance()));

    resetProjectProvenance();
    hydrateProjectProvenance(onDisk);
    expect(exportRecordStore.exports).toHaveLength(1);
    expect([...designRunStore.manualOverrides]).toEqual([3]);
  });
});

describe('a project older than these fields', () => {
  /** A snapshot from before the fields existed: neither key is present. */
  const legacy = {} as Pick<ModelSnapshot, 'exports' | 'manualEdits'>;

  it('opens without error', () => {
    expect(() => hydrateProjectProvenance(legacy)).not.toThrow();
  });

  it('reports no emissions, which means "no record" and not "none were exported"', () => {
    hydrateProjectProvenance(legacy);
    expect(exportRecordStore.exports).toEqual([]);
  });

  /*
   * The assertion that keeps a false statement off a drawing. An export printing "manually
   * retouched: none" for a file that never recorded the information would be wrong in the one
   * place whose purpose is to say what is in the drawing.
   */
  it('reports UNKNOWN retouch provenance, not none', () => {
    hydrateProjectProvenance(legacy);
    expect(designRunStore.manualProvenanceKnown).toBe(false);
    const p = rcRetouchProvenance(
      designRunStore.manualProvenanceKnown, true, designRunStore.manualOverrides);
    expect(p.status).toBe('unknown');
    expect(p).not.toEqual(rcRetouch([]));
  });

  /*
   * And the other side of it: an explicitly empty list is a file that RECORDED that nothing
   * was retouched, and is believed. Absence and emptiness must not collapse into one state.
   */
  it('but an explicitly empty list is believed', () => {
    hydrateProjectProvenance({ exports: [], manualEdits: [] });
    expect(designRunStore.manualProvenanceKnown).toBe(true);
    expect(rcRetouchProvenance(true, true, designRunStore.manualOverrides).status).toBe('known');
  });

  /*
   * A hand-edited or truncated file must not be able to introduce a record that `record()`
   * itself would have refused — a `ready` carrying an error, or one still claiming to be
   * running.
   */
  it('refuses incoherent records from a tampered file', () => {
    hydrateProjectProvenance({
      exports: [
        { ...draft(), seriesId: 's' } as ExportRecord,
        { ...draft({ state: 'running' }), seriesId: 's' } as ExportRecord,
        { ...draft({ state: 'ready', error: 'boom' }), seriesId: 's' } as ExportRecord,
      ],
    });
    expect(exportRecordStore.exports, 'only the coherent one survived').toHaveLength(1);
  });
});

describe('undo does not un-happen an export', () => {
  /*
   * The failure this design exists to prevent, spelled out: the undo entry was pushed BEFORE
   * the export, so it carries the emission list as it was before the file was written.
   * Restoring it would delete a record of something that really happened, quietly.
   */
  it('restore() leaves the emission list alone', () => {
    const before = modelStore.snapshot();          // pushed before anything was exported
    exportRecordStore.record('s1', draft({ filename: 'issued.dxf' }));
    expect(exportRecordStore.exports).toHaveLength(1);

    modelStore.restore(before);                     // the undo path

    expect(exportRecordStore.exports.map((r) => r.filename),
      'the file is in the user\'s folder either way').toEqual(['issued.dxf']);
  });

  it('and leaves the hand-edit provenance alone', () => {
    const before = modelStore.snapshot();
    designRunStore.markManual([12]);
    modelStore.restore(before);
    expect([...designRunStore.manualOverrides]).toEqual([12]);
    expect(designRunStore.manualProvenanceKnown).toBe(true);
  });

  /*
   * They still ride ON the snapshot — that is what makes save, autosave and tab capture carry
   * them without four separate wirings. Restoring simply does not read them back.
   */
  it('but the snapshot still carries them, for saving', () => {
    exportRecordStore.record('s1', draft({ filename: 'saved.xlsx' }));
    designRunStore.markManual([5]);
    const s = modelStore.snapshot();
    expect(s.exports?.map((r) => r.filename)).toEqual(['saved.xlsx']);
    expect(s.manualEdits).toEqual([5]);
  });
});
