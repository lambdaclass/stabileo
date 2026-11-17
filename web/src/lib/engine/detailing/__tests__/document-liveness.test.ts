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
/**
 * The STORE LAYER, which is more than one file and always was.
 *
 * `detailing.svelte.ts` has an 800-line ceiling that `detailing-store-ceiling.test.ts`
 * enforces, and readings that hold no state live beside it in `detailing-*-inputs.ts` — twenty
 * of them already did. The certificate join moved there when objective 7's sheet geometry took
 * the room. The claim being tested never was "this file contains that call": it is "the
 * production store supplies the certificates, not a test", and reading the layer keeps that
 * claim true across the next extraction as well.
 */
const STORE_LAYER = [
  STORE,
  'lib/store/detailing-project-inputs.ts',
  'lib/store/detailing-certificates.ts',
];

function storeLayer() { return STORE_LAYER.map(read).join('\n'); }
/** The one resolution of the document the drawings share. */
const UI_FILES = ['lib/store/current-document.ts'];
const EXCEL = 'lib/export/excel.ts';

function ui() { return UI_FILES.map(read).join('\n'); }

describe('the DocumentModel has a production caller', () => {
  it('the store builds it', () => {
    /*
     * Read across the LAYER, which is what this claim always meant — the note on `STORE_LAYER`
     * says so, and the extraction it anticipated has now happened. `buildDocument` assembled
     * forty lines of project inputs inside a method, none of it store state, and the 800-line
     * ceiling made that concrete; it is `buildProjectDocument` in `detailing-project-inputs.ts`
     * now.
     *
     * The routing half is asserted separately and on the STORE file, because that is the part
     * that would go dead: a builder nobody calls is exactly the failure this file exists for.
     */
    const s = storeLayer();
    expect(s).toContain('buildDocumentModel');
    expect(s).toMatch(/buildProjectDocument\s*\(/);
    expect(read(STORE)).toMatch(/buildDocument\s*\(/);
    expect(read(STORE)).toContain('buildProjectDocument(');
  });

  it('the store, not a test, supplies the certificates', () => {
    const s = storeLayer();
    expect(s).toContain('rebarHash');
    expect(s).toContain('certifiedHashFor');
    // And the layer still ROUTES it: a reading nobody calls is the dead path this file exists
    // to catch. It moved with the builder that consumes it, one file over and in the same call.
    expect(s).toContain('collectCertificates(');
  });

  it('the UI calls the store rather than assembling a model itself', () => {
    const u = ui();
    expect(u).toContain('detailingStore.buildDocument');
    expect(u).not.toContain('buildDocumentModel(');
  });
});

describe('the underlying drawing and schedule primitives are still used', () => {
  const render = read('lib/engine/detailing/document-render.ts');

  for (const fn of ['sheetToDxf', 'buildSchedule', 'scheduleToAoa', 'sheetToSvg']) {
    it(`${fn} is called by the renderer`, () => {
      expect(render).toContain(`${fn}(`);
    });
  }

  it('exportToExcel accepts the document sheets instead of rebuilding them', () => {
    expect(read(EXCEL)).toContain('extraSheets');
    expect(read(EXCEL)).toContain('onlyExtras');
  });
});

describe('the visible path does not go through a test hook', () => {
  it('no __stabileoActions anywhere in the document flow', () => {
    for (const f of [STORE, ...UI_FILES, 'lib/engine/detailing/document-render.ts']) {
      expect(read(f), f).not.toContain('__stabileoActions');
    }
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

});
