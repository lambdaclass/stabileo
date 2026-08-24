/**
 * What the export record must refuse to say.
 *
 * The assertions worth reading are the refusals: no record can be written for a generation
 * that has not terminated, no `ready` can carry an error, and nothing anywhere constructs a
 * record from a document. That last one is the rule the whole surface exists to protect — an
 * emission list that contains emissions which never happened is worse than no list.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXPORT_CANNOT_ASSERT, PREVIEW_IDLE, isCoherentExport, isStaleExport, staleExports,
  type ExportRecord, type ExportRecordDraft,
} from '../rc-export-record';
import { RC_RETOUCH_UNKNOWN, rcRetouch } from '../rc-selection';
import { exportRecordStore } from '../../store/export-record.svelte';
import es from '../../i18n/locales/es';
import en from '../../i18n/locales/en';

const ok = (over: Partial<ExportRecord> = {}): ExportRecord => ({
  kind: 'xlsx', revision: 1, seriesId: 's1', at: '2026-08-24T10:00:00.000Z',
  filename: 'detailing-rev1.xlsx', error: null, elements: [1, 2],
  retouched: rcRetouch([2]), limitations: [], state: 'ready', ...over,
});
const draft = (over: Partial<ExportRecordDraft> = {}): ExportRecordDraft => {
  const { seriesId: _drop, ...rest } = ok(over as Partial<ExportRecord>);
  void _drop;
  return rest;
};

describe('a record describes something that terminated', () => {
  it('accepts a successful emission', () => {
    expect(isCoherentExport(ok())).toBe(true);
  });

  it('accepts a failure that carries its message', () => {
    expect(isCoherentExport(ok({ state: 'failed', error: 'disk full' }))).toBe(true);
  });

  /*
   * The two that must never coexist, named in one place so they cannot be asserted twice with
   * different words: a success that also failed, and a failure with nothing to show for it.
   */
  it.each([
    ['ready with an error', ok({ state: 'ready', error: 'boom' })],
    ['failed without one', ok({ state: 'failed', error: null })],
  ])('rejects %s', (_label, r) => {
    expect(isCoherentExport(r as ExportRecord)).toBe(false);
  });

  /*
   * `idle` and `running` are states of the UI, not of something that happened. A record in one
   * of them describes nothing, and would sit in the emission list as a file that may or may not
   * exist.
   */
  it.each(['idle', 'running'] as const)('rejects a record still %s', (state) => {
    expect(isCoherentExport(ok({ state, error: null }))).toBe(false);
  });
});

describe('the store records emissions and refuses incoherent ones', () => {
  beforeEach(() => exportRecordStore.reset());

  it('starts empty, which means "we do not know what was exported"', () => {
    expect(exportRecordStore.exports).toEqual([]);
  });

  it('records an emission and assigns it the series', () => {
    const r = exportRecordStore.record('series-A', draft());
    expect(r?.seriesId).toBe('series-A');
    expect(exportRecordStore.exports).toHaveLength(1);
  });

  it('records failures too — the export nobody remembers doing', () => {
    exportRecordStore.record('s', draft({ state: 'failed', error: 'popup blocked' }));
    expect(exportRecordStore.exports).toHaveLength(1);
    expect(exportRecordStore.exports[0].error).toBe('popup blocked');
  });

  it('refuses an incoherent draft and records nothing at all', () => {
    expect(exportRecordStore.record('s', draft({ state: 'running' }))).toBeNull();
    expect(exportRecordStore.exports, 'nothing was appended').toEqual([]);
  });

  /*
   * The rule this whole surface exists to protect. Asserted against the source rather than
   * behaviourally, because the failure mode is a method being ADDED — there is no call to make
   * that fails today.
   */
  it('offers no way to build a record from a document', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const f of ['../rc-export-record.ts', '../../store/export-record.svelte.ts']) {
      const src = readFileSync(resolve(here, f), 'utf8');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, `${f} must not import the document model`)
        .not.toMatch(/from\s+'[^']*document-model'/);
    }
  });
});

describe('stale is information, not a fault', () => {
  beforeEach(() => exportRecordStore.reset());

  it('a record from an older revision is stale', () => {
    expect(isStaleExport(ok({ revision: 1 }), 2)).toBe(true);
    expect(isStaleExport(ok({ revision: 2 }), 2)).toBe(false);
  });

  /*
   * A failed export is not stale — it never produced a file to go out of date. Counting it
   * would put a warning next to something that is already reported as an error.
   */
  it('a failed emission is never stale', () => {
    expect(isStaleExport(ok({ revision: 1, state: 'failed', error: 'x' }), 9)).toBe(false);
  });

  it('the store lists only the ones that no longer match', () => {
    exportRecordStore.record('s', draft({ revision: 1, filename: 'a.xlsx' }));
    exportRecordStore.record('s', draft({ revision: 2, filename: 'b.xlsx' }));
    const stale = exportRecordStore.stale(2);
    expect(stale.map((r) => r.filename)).toEqual(['a.xlsx']);
  });

  it('and the pure helper agrees with the store', () => {
    const rs = [ok({ revision: 1 }), ok({ revision: 3 })];
    expect(staleExports(rs, 3)).toHaveLength(1);
  });
});

describe('what a record says about its own limits', () => {
  it('carries the four things a browser export can never assert', () => {
    expect(EXPORT_CANNOT_ASSERT).toHaveLength(4);
    for (const k of EXPORT_CANNOT_ASSERT) {
      expect(es[k as keyof typeof es], k).toBeTruthy();
      expect(en[k as keyof typeof en], k).toBeTruthy();
    }
  });

  /*
   * Each one denies something rather than describing a feature. A "limitation" that reads as a
   * capability would train the reader to skip the list.
   */
  it('each limitation is a denial', () => {
    for (const k of EXPORT_CANNOT_ASSERT) {
      expect(String(es[k as keyof typeof es]), k).toMatch(/no podemos/i);
      expect(String(en[k as keyof typeof en]), k).toMatch(/cannot/i);
    }
  });

  /*
   * The retouch provenance travels ON the record, so a record written after a reopen says
   * "unknown" rather than "none" — see rc-selection.ts. These are different claims and only
   * one is true.
   */
  it('a record can say it does not know what was retouched', () => {
    const r = ok({ retouched: RC_RETOUCH_UNKNOWN });
    expect(r.retouched.known).toBe(false);
    expect(r.retouched).not.toEqual(rcRetouch([]));
  });
});

describe('a preview is not an emission', () => {
  it('starts idle with no target', () => {
    expect(PREVIEW_IDLE.target).toBeNull();
    expect(PREVIEW_IDLE.state).toBe('idle');
  });

  /*
   * Nothing leaves, so there is nothing to go stale and nothing to be wrong about later. A
   * preview that produced a record would put a file in someone's head that is not in their
   * folder — which is the same class of false statement the retroactive-record rule forbids.
   */
  it('previewing records nothing', () => {
    exportRecordStore.reset();
    // There is no `recordPreview`, by construction. This asserts the store's surface.
    expect(Object.keys(exportRecordStore)).not.toContain('recordPreview');
    expect(exportRecordStore.exports).toEqual([]);
  });
});
