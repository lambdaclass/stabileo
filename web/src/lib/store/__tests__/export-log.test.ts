/**
 * Objective 11 — every export records itself, and states ITS hand edits.
 *
 * ── The caller that was missing ────────────────────────────────────
 *
 * `exportRecordStore.record()` had none. The contract, the store, the persistence and the
 * hydration were all written; the three export handlers wrote a blob and told nobody. So the
 * emission list was empty in every project that has ever existed — and `rc-export-record.ts`'s
 * own opening paragraph is about the consequence.
 *
 * ── What these tests are about ─────────────────────────────────────
 *
 * The two decisions the caller makes that a reader could get wrong: that a document states the
 * retouches WITHIN it rather than the project's whole set, and that a failed export is recorded
 * as one instead of being swallowed.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import '../index';
import { modelStore } from '../model.svelte';
import { detailingStore } from '../detailing.svelte';
import { designRunStore } from '../design-run.svelte';
import { exportRecordStore } from '../export-record.svelte';
import { verificationStore } from '../verification.svelte';
import { documentMembers, logExport, retouchedIn, withExportLog } from '../export-log';
import { DETAILING_SCHEMA_VERSION, type DetailingAssembly } from '../../engine/detailing/assembly';
import type { DocumentModel } from '../../engine/detailing/document-model';

const AT = '2026-08-25T12:00:00.000Z';

/** A document over two levels, so a narrowing can be shown to narrow. */
function doc(): DocumentModel {
  return {
    seriesId: 'detailing',
    revision: { number: 4, at: AT, author: 'Bauti', detailingRevision: 2, demandRevision: 1 },
    assemblies: [
      { id: 'level-3', elementIds: [1, 2] },
      { id: 'level-6', elementIds: [3] },
    ],
  } as unknown as DocumentModel;
}

function assembly(id: string, elementIds: number[]): DetailingAssembly {
  return {
    id, kind: 'beamLine', label: id, elementIds,
    bars: [], marks: [], joints: [], conflicts: [], unsupported: [],
    detailingRevision: 2, demandRevision: 1,
    state: 'CONSTRUCTIBLE', maturity: 'VALIDATED',
    provenance: { edition: '2025', verifierId: 'v', trace: [], assumptions: [] },
  } as DetailingAssembly;
}

beforeEach(() => {
  modelStore.clear();
  detailingStore.clear();
  verificationStore.clear();
  exportRecordStore.reset();
  designRunStore.resetMarks();
  modelStore.model.detailing = {
    version: DETAILING_SCHEMA_VERSION,
    assemblies: [assembly('level-3', [1, 2]), assembly('level-6', [3])],
  };
});

describe('the members a document covers', () => {
  it('is the union of its assemblies’ claims, ascending', () => {
    expect(documentMembers(doc())).toEqual([1, 2, 3]);
  });
});

describe('what a document may say about hand edits', () => {
  it('is a real, empty claim when nothing was retouched', () => {
    expect(retouchedIn(doc())).toEqual({ status: 'known', members: [] });
  });

  it('names the retouched members it contains', () => {
    designRunStore.markManual([2]);
    expect(retouchedIn(doc())).toEqual({ status: 'known', members: [2] });
  });

  /*
   * §4's emphasis. A drawing set that listed a hand edit on a member it does not contain makes
   * a statement about steel that is not on its pages, on a sheet somebody signs.
   */
  it('leaves out a retouch on a member the document does not cover', () => {
    designRunStore.markManual([2, 99]);
    expect(retouchedIn(doc()).members).toEqual([2]);
  });

  /*
   * The substitution the four-state type exists to prevent: a file with no record does not
   * become able to answer the question, and `known` + empty would say "none were".
   */
  it('stays unknown for a project opened from a file that never recorded it', () => {
    designRunStore.hydrateManual(undefined);
    expect(retouchedIn(doc()).status).toBe('unknown');
  });

  it('is notApplicable when nothing has been designed at all', () => {
    detailingStore.clear();
    expect(retouchedIn(doc()).status).toBe('notApplicable');
  });
});

describe('recording an emission', () => {
  it('writes a record carrying the revision, the members and the retouches', () => {
    designRunStore.markManual([2]);
    const r = logExport({ kind: 'dxf', doc: doc(), filename: 'a.dxf', at: AT })!;

    expect(r.kind).toBe('dxf');
    expect(r.revision).toBe(4);
    expect(r.seriesId).toBe('detailing');
    expect(r.elements).toEqual([1, 2, 3]);
    expect(r.retouched).toEqual({ status: 'known', members: [2] });
    expect(r.state).toBe('ready');
    expect(r.error).toBeNull();
    expect(exportRecordStore.exports).toHaveLength(1);
  });

  /* Every record carries what a browser export can never assert, so the UI never has to
     remember the list — and cannot forget an entry on one surface and not another. */
  it('carries the limitations the contract fixes', () => {
    const r = logExport({ kind: 'report', doc: doc(), filename: 'a.html', at: AT })!;
    expect(r.limitations).toContain('design.export.cannot.onDisk');
  });

  it('records a failure as a failure, with its message', () => {
    const r = logExport({
      kind: 'xlsx', doc: doc(), filename: 'a.xlsx', at: AT, error: 'no writer',
    })!;
    expect(r.state).toBe('failed');
    expect(r.error).toBe('no writer');
  });
});

describe('wrapping an export', () => {
  it('records the emission and returns what the export produced', () => {
    const out = withExportLog(
      { kind: 'report', doc: doc(), filename: 'a.html', at: AT }, () => 'html');
    expect(out).toBe('html');
    expect(exportRecordStore.exports).toHaveLength(1);
    expect(exportRecordStore.exports[0].state).toBe('ready');
  });

  /*
   * The failure path is the point. A wrapper that only recorded successes would leave the list
   * silent about the afternoon a user pressed the button four times and got nothing — which is
   * precisely the afternoon the list is for. And it RE-THROWS: recording is not swallowing.
   */
  it('records a throw and lets it through', () => {
    expect(() => withExportLog(
      { kind: 'dxf', doc: doc(), filename: 'a.dxf', at: AT },
      () => { throw new Error('boom'); },
    )).toThrow('boom');

    expect(exportRecordStore.exports).toHaveLength(1);
    expect(exportRecordStore.exports[0].state).toBe('failed');
    expect(exportRecordStore.exports[0].error).toBe('boom');
  });
});

describe('a record outlives the revision it came from', () => {
  /* Exporting and then editing is a normal working pattern. The record going stale is what the
     whole list is FOR, and it is information rather than a fault. */
  it('goes stale when the project moves on', () => {
    logExport({ kind: 'dxf', doc: doc(), filename: 'a.dxf', at: AT });
    expect(exportRecordStore.stale(4)).toHaveLength(0);
    expect(exportRecordStore.stale(6)).toHaveLength(1);
  });

  /* A failed export describes no file, so there is nothing in anybody's folder to go stale. */
  it('but a failed one never does', () => {
    logExport({ kind: 'dxf', doc: doc(), filename: 'a.dxf', at: AT, error: 'boom' });
    expect(exportRecordStore.stale(6)).toHaveLength(0);
  });
});
