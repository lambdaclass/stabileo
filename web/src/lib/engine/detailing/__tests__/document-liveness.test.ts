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
];

function storeLayer() { return STORE_LAYER.map(read).join('\n'); }
/**
 * The UI these assertions are about is now TWO components.
 *
 * The report, the drawings, the schedule and the 3-D view moved out of the detailing panel and
 * into `DocumentsSection.svelte`, a stage of its own. The claim being tested never was "this file
 * contains that call" — it is "the production UI reaches the renderer" — so it reads both and
 * survives the next move as well.
 */
const UI_FILES = [
  'components/pro/design/DetailingWorkflow.svelte',
  'components/pro/design/DocumentsSection.svelte',
];
const EXCEL = 'lib/export/excel.ts';

function ui() { return UI_FILES.map(read).join('\n'); }

/**
 * The EXPORT LAYER: the controls, plus the module that writes the files.
 *
 * Third repointing of the same claim, and the note on `STORE_LAYER` states the rule it follows:
 * "the claim being tested never was 'this file contains that call'". Here the claim is *a visible
 * control reaches the real renderer*, and F4 put one module between the two — `DocumentsSection`
 * crossed its 600-line ceiling when the scope selector and the previews landed, so the three
 * writers left for `document-exports.ts` the way `rebar-open.ts` left before them.
 *
 * The markup assertions below still read `ui()` alone: a button lives in a component, and a gate
 * that looked for `data-testid` in a `.ts` file would have stopped measuring anything.
 */
const EXPORT_LAYER = [...UI_FILES, 'lib/store/document-exports.ts'];

function exportLayer() { return EXPORT_LAYER.map(read).join('\n'); }

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

describe('each renderer is reached from a visible control', () => {
  const paths: Array<[string, string]> = [
    ['renderReportHtml', 'doc-report'],
    ['renderDrawings', 'doc-dxf'],
    ['renderSchedule', 'doc-xlsx'],
  ];

  for (const [fn, testid] of paths) {
    it(`${fn} is imported and bound to ${testid}`, () => {
      expect(exportLayer(), `${fn} is not imported`).toContain(fn);
      expect(ui(), `no button carries ${testid}`).toContain(`data-testid="${testid}"`);
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
    const u = exportLayer();
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
    for (const f of [STORE, ...EXPORT_LAYER, 'lib/engine/detailing/document-render.ts']) {
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
  /*
   * ── Why this is measured differently now ──────────────────────────
   *
   * It counted `currentDoc()` call sites and wanted three or more, one per handler. F4 gave the
   * three buttons a single route — `runExport`, which builds once and hands the document to a
   * writer — so the old count fell to one while the property it was protecting got STRONGER: the
   * builder is now reachable from exactly one place, and the writers cannot build at all.
   *
   * So the property is asserted where it now lives: one builder in the layer, three handlers
   * through the one route, and a writer module that never touches `buildDocument`. Counting a
   * call that a refactor consolidated would have been a gate measuring the old shape.
   */
  it('one builder, and every handler routes through it', () => {
    const u = exportLayer();
    const builders = u.match(/detailingStore\.buildDocument/g) ?? [];
    expect(builders, 'building per button would let a report and a drawing disagree')
      .toHaveLength(1);
    const routed = u.match(/runExport\(/g) ?? [];
    expect(routed.length, 'the three exports, plus the definition').toBeGreaterThanOrEqual(4);
  });

  it('the writers are handed a document and cannot build one', () => {
    const w = read('lib/store/document-exports.ts');
    expect(w).not.toContain('buildDocument');
    expect(w).not.toContain('buildDocumentModel');
    // Each takes the instance as its first argument, so all three describe the same revision.
    for (const fn of ['exportDetailingReport', 'exportDetailingDxf', 'exportDetailingXlsx']) {
      expect(w).toMatch(new RegExp(`function ${fn}\\(doc: DocumentModel`));
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

  it('the UI says so instead of showing something else', () => {
    expect(ui()).toContain('detailing.doc.noCoordinated');
  });
});
