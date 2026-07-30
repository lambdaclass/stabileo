/**
 * Document liveness: every export path must have a real production caller.
 *
 * ── Why this file is a source gate and not a unit test ─────────────
 *
 * Three mechanisms in this PR were built, imported, typechecked and completely dead —
 * channel-aware candidate generation, the chain DP, and the joint layer allocator's
 * crossing edges. Each read as working from the outside for weeks. `buildDocumentModel`
 * itself shipped in the previous cycle with zero callers and full unit-test coverage.
 *
 * A unit test proves a function computes. It cannot prove anyone calls it. So these gates
 * read the sources and fail when a path loses its caller, or when a visible button stops
 * invoking the real code and starts going through a test hook instead.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../../../..');   // src/
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const STORE = 'lib/store/detailing.svelte.ts';
const UI = 'components/pro/design/DetailingWorkflow.svelte';
const EXCEL = 'lib/export/excel.ts';

function ui() { return read(UI); }

describe('the DocumentModel has a production caller', () => {
  it('the store builds it', () => {
    const s = read(STORE);
    expect(s).toContain('buildDocumentModel');
    expect(s).toMatch(/buildDocument\s*\(/);
  });

  it('the store, not a test, supplies the certificates', () => {
    const s = read(STORE);
    expect(s).toContain('rebarHash');
    expect(s).toContain('certifiedHashFor');
  });

  it('the UI calls the store rather than assembling a model itself', () => {
    const u = ui();
    expect(u).toContain('detailingStore.buildDocument');
    expect(u).not.toContain('buildDocumentModel(');
  });
});

describe('each renderer is reached from a visible control', () => {
  const paths: Array<[string, string]> = [
    ['renderReportHtml', 'doc-report'],
    ['renderDrawings', 'doc-dxf'],
    ['renderSchedule', 'doc-xlsx'],
  ];

  for (const [fn, testid] of paths) {
    it(`${fn} is imported and bound to ${testid}`, () => {
      const u = ui();
      expect(u, `${fn} is not imported`).toContain(fn);
      expect(u, `no button carries ${testid}`).toContain(`data-testid="${testid}"`);
    });
  }

  it('the buttons have onclick handlers, not just markup', () => {
    const u = ui();
    for (const [, id] of paths) {
      const idx = u.indexOf(`data-testid="${id}"`);
      expect(idx, id).toBeGreaterThan(-1);
      // The handler is on the same element.
      const tag = u.slice(idx, idx + 200);
      expect(tag, `${id} has no onclick`).toMatch(/onclick=\{/);
    }
  });
});

describe('the underlying drawing and schedule primitives are still used', () => {
  const render = read('lib/engine/detailing/document-render.ts');

  for (const fn of ['sheetToDxf', 'buildSchedule', 'scheduleToAoa', 'sheetToSvg']) {
    it(`${fn} is called by the renderer`, () => {
      expect(render).toContain(`${fn}(`);
    });
  }

  it('exportToExcel is the XLSX writer — no second one was introduced', () => {
    const u = ui();
    expect(u).toContain('exportToExcel');
    // A duplicate writer would import the XLSX library directly.
    expect(u).not.toContain('from \'xlsx\'');
    expect(read('lib/engine/detailing/document-render.ts')).not.toContain('from \'xlsx\'');
  });

  it('exportToExcel accepts the document sheets instead of rebuilding them', () => {
    expect(read(EXCEL)).toContain('extraSheets');
    expect(read(EXCEL)).toContain('onlyExtras');
  });
});

describe('the visible path does not go through a test hook', () => {
  it('no __stabileoActions anywhere in the document flow', () => {
    for (const f of [STORE, UI, 'lib/engine/detailing/document-render.ts']) {
      expect(read(f), f).not.toContain('__stabileoActions');
    }
  });

  it('the UI reads the store’s document, so state is real and persisted', () => {
    const u = ui();
    expect(u).toContain('detailingStore.document');
    expect(u).toContain('detailingStore.supersededDocuments');
  });
});

describe('all three exports consume one model instance', () => {
  it('every handler goes through the same currentDoc()', () => {
    const u = ui();
    // Three handlers, one builder. Building per-button would let a report and a drawing
    // describe different revisions of the same floor.
    const builders = u.match(/detailingStore\.buildDocument/g) ?? [];
    expect(builders).toHaveLength(1);
    const uses = u.match(/currentDoc\(\)/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(3);
  });
});

describe('supersession has a production caller', () => {
  it('the store can retire a document non-destructively', () => {
    const s = read(STORE);
    expect(s).toContain('supersedeDocuments');
    expect(s).toContain('supersede(');
    // The old revision is kept, not dropped.
    expect(s).toContain('supersededDocs = [...supersededDocs');
  });
});

describe('the legacy reinforcement may not stand in for coordinated detailing', () => {
  it('an absent coordinated cage returns null rather than falling back', () => {
    const s = read(STORE);
    const idx = s.indexOf('buildDocument(');
    expect(idx).toBeGreaterThan(-1);
    // The window only has to contain the guard; its size is incidental to the property being
    // measured, which is that `buildDocument` REFUSES rather than falling back to the
    // pre-coordination per-member reinforcement. It was 900 and a doc comment explaining why
    // the guard reads the persisted store pushed the guard past it — a documentation change
    // must not be able to fail a gate about behaviour.
    const body = s.slice(idx, idx + 2500);
    expect(body).toMatch(/assemblies\.length === 0\)\s*return null/);
  });

  it('the UI says so instead of showing something else', () => {
    expect(ui()).toContain('detailing.doc.noCoordinated');
  });
});
