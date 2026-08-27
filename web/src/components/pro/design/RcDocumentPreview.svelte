<script lang="ts">
  /**
   * The drawing and the schedule, before they leave.
   *
   * ── Why a preview belongs beside the export and not in Detalle ──────
   *
   * `SheetPreview` has existed since objective 7 and is mounted in ONE place: inside
   * `DetailingWorkflow`, on the Detalle stage, showing the sheet of whatever assembly is selected
   * there. That is the right preview for the stage that draws — and it is not a preview of what
   * Documentos is about to emit, because it does not know about the documentation narrowing and
   * is built from the sheet store rather than from the document.
   *
   * These two are projections of the SAME `DocumentModel` the three exports render, through the
   * same `renderDrawings` and `renderSchedule`. So what you look at here is what lands in the
   * folder, narrowing included. A preview built from a second source would be the one thing worse
   * than no preview: a picture that disagrees with the file and is believed.
   *
   * ── A preview is not an export ─────────────────────────────────────
   *
   * `rc-export-record.ts` says it in the contract: "A preview is NOT an export and produces no
   * record: nothing leaves, so there is nothing to go stale and nothing to be wrong about later."
   * `RcPreviewTarget` and `RcPreviewStatus` were written there in F0 and had no consumer. This is
   * the consumer, and the distinction is on the screen as well as in the types — a preview that
   * looked like an emission would put a file in someone's head that is not in their folder.
   *
   * ── Why `running` is never set ─────────────────────────────────────
   *
   * `RcGenerationState` has four values and this reaches three. Rendering is synchronous, so a
   * `running` written here could never paint: the browser has no frame to give until it finishes.
   * Writing it anyway would be a progress state that is structurally invisible, which is the
   * fabricated-progress rule this branch inherited. The build is on an explicit press for the same
   * reason it is not a `$derived`: it is the 1,9 seconds `buildDocumentModel` documents.
   */
  import { t, tp, i18n } from '../../../lib/i18n';
  import { renderDrawings, renderSchedule } from '../../../lib/engine/detailing/document-render';
  import { retouchedIn } from '../../../lib/store/export-log';
  import { PREVIEW_IDLE, type RcPreviewStatus } from '../../../lib/flow/rc-export-record';
  import type { DocumentModel } from '../../../lib/engine/detailing/document-model';

  interface Props {
    /**
     * Build the document to preview, or return null with the reason already shown.
     *
     * The stage's own `currentDoc()`, so the preview and the four projections cannot come from
     * two different instances.
     */
    resolve: () => DocumentModel | null;
    /** The rótulo every output is headed with. */
    projectName: string;
  }
  let { resolve, projectName }: Props = $props();

  let status = $state<RcPreviewStatus>(PREVIEW_IDLE);
  let sheets = $state<Array<{ name: string; svg: string }>>([]);
  let table = $state<{ name: string; rows: Array<Array<string | number>> } | null>(null);
  let sheetIndex = $state(0);

  /** How many schedule rows a preview shows before it says it stopped. */
  const ROW_CAP = 40;
  let rowsTotal = $state(0);

  function opts() {
    return { locale: i18n.locale, projectName, retouched: undefined };
  }

  function reset() { sheets = []; table = null; sheetIndex = 0; rowsTotal = 0; }

  function previewDrawings() {
    reset();
    const doc = resolve();
    if (!doc) { status = PREVIEW_IDLE; return; }
    try {
      const set = renderDrawings(doc, { ...opts(), retouched: retouchedIn(doc) });
      sheets = set.sheets.map((s) => ({ name: s.name, svg: s.svg }));
      status = {
        target: {
          kind: 'dxf',
          revision: doc.revision.number,
          elements: doc.selection?.elements ?? [],
        },
        state: 'ready',
        error: null,
      };
    } catch (e) {
      status = {
        target: null, state: 'failed',
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  function previewSchedule() {
    reset();
    const doc = resolve();
    if (!doc) { status = PREVIEW_IDLE; return; }
    try {
      const built = renderSchedule(doc, { ...opts(), retouched: retouchedIn(doc) });
      const first = built[0];
      rowsTotal = first ? first.aoa.length : 0;
      table = first ? { name: first.name, rows: first.aoa.slice(0, ROW_CAP) } : null;
      status = {
        target: {
          kind: 'xlsx',
          revision: doc.revision.number,
          elements: doc.selection?.elements ?? [],
        },
        state: 'ready',
        error: null,
      };
    } catch (e) {
      status = {
        target: null, state: 'failed',
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  function close() { status = PREVIEW_IDLE; reset(); }

  const sheet = $derived(sheets[sheetIndex] ?? null);
</script>

<section class="preview" data-testid="doc-preview" aria-labelledby="doc-preview-title">
  <h4 id="doc-preview-title">{t('detailing.doc.preview.title')}</h4>
  <!--
    Said BEFORE the buttons, not under the result. A caveat the reader reaches after looking at a
    drawing has already failed — the same ordering `FORCES_REPORT_IS_NOT` is printed in.
  -->
  <p class="note" data-testid="doc-preview-not-export">{t('detailing.doc.preview.notExport')}</p>

  <div class="actions">
    <button type="button" data-testid="doc-preview-dxf" onclick={previewDrawings}>
      {t('detailing.doc.preview.drawings')}
    </button>
    <button type="button" data-testid="doc-preview-xlsx" onclick={previewSchedule}>
      {t('detailing.doc.preview.schedule')}
    </button>
    {#if status.state !== 'idle'}
      <button type="button" data-testid="doc-preview-close" onclick={close}>
        {t('detailing.doc.preview.close')}
      </button>
    {/if}
  </div>

  {#if status.state === 'failed'}
    <p class="err" role="alert" data-testid="doc-preview-error">
      {tp('detailing.doc.preview.failed', { error: status.error ?? '' })}
    </p>
  {:else if status.state === 'ready' && status.target}
    <!--
      The scope of what is on screen, on the preview as well as on the file. A reader comparing a
      preview against a folder needs the two to state the same thing in the same words.
    -->
    <p class="scope" data-testid="doc-preview-scope">
      {status.target.elements.length === 0
        ? tp('detailing.doc.preview.scopeWhole', { n: status.target.revision })
        : tp('detailing.doc.preview.scopeNarrowed', {
          n: status.target.elements.length,
          ids: status.target.elements.slice(0, 8).join(', '),
          rev: status.target.revision,
        })}
    </p>

    {#if status.target.kind === 'dxf'}
      {#if sheet}
        <div class="sheet-nav">
          <button type="button" data-testid="doc-preview-prev"
                  disabled={sheetIndex === 0}
                  onclick={() => (sheetIndex -= 1)}
                  aria-label={t('detailing.doc.preview.prev')}>‹</button>
          <span data-testid="doc-preview-sheet-name">
            {sheet.name} <span class="of">{tp('detailing.doc.preview.sheetOf', {
              i: sheetIndex + 1, n: sheets.length,
            })}</span>
          </span>
          <button type="button" data-testid="doc-preview-next"
                  disabled={sheetIndex >= sheets.length - 1}
                  onclick={() => (sheetIndex += 1)}
                  aria-label={t('detailing.doc.preview.next')}>›</button>
        </div>
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- generated by sheetToSvg, all text escaped -->
        <div class="sheet" data-testid="doc-preview-sheet">{@html sheet.svg}</div>
      {:else}
        <!-- A set with no sheet is a real answer: an assembly with no steel and no records. -->
        <p class="note" data-testid="doc-preview-no-sheets">
          {t('detailing.doc.preview.noSheets')}
        </p>
      {/if}
    {:else if table}
      <p class="table-name" data-testid="doc-preview-table-name">{table.name}</p>
      <div class="table-wrap">
        <table data-testid="doc-preview-table">
          <tbody>
            {#each table.rows as row, r (r)}
              <tr>
                {#each row as cell, c (c)}<td>{cell}</td>{/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if rowsTotal > table.rows.length}
        <!-- The cap SAYS SO. A silent truncation reads as a complete schedule. -->
        <p class="note" data-testid="doc-preview-truncated">
          {tp('detailing.doc.preview.truncated', {
            shown: table.rows.length, total: rowsTotal,
          })}
        </p>
      {/if}
    {:else}
      <p class="note" data-testid="doc-preview-no-rows">{t('detailing.doc.preview.noRows')}</p>
    {/if}
  {/if}
</section>

<style>
  .preview { margin-top: 0.5rem; border-top: 1px solid var(--st-hair); padding-top: 0.4rem; }
  h4 { margin: 0 0 0.2rem; font-size: 0.74rem; font-weight: 600; color: var(--st-text); }
  .note, .scope, .table-name {
    margin: 0.15rem 0 0; font-size: 0.68rem; line-height: 1.4; color: var(--st-text-2);
  }
  .scope { color: var(--st-text); }
  .err { margin: 0.15rem 0 0; font-size: 0.68rem; color: var(--st-danger); }

  .actions { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.3rem; }
  .actions button, .sheet-nav button {
    padding: 0.15rem 0.5rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    background: var(--st-surface-3);
    color: var(--st-text);
    font-size: 0.68rem;
    cursor: pointer;
  }
  .actions button:hover, .sheet-nav button:hover:not(:disabled) {
    background: var(--st-hair-strong);
  }
  .actions button:focus-visible, .sheet-nav button:focus-visible {
    outline: 2px solid var(--st-value); outline-offset: 1px;
  }
  .sheet-nav button:disabled { opacity: 0.5; cursor: not-allowed; }

  .sheet-nav {
    display: flex; align-items: center; gap: 0.4rem; margin-top: 0.3rem;
    font-size: 0.7rem; color: var(--st-text);
  }
  .sheet-nav .of { color: var(--st-text-2); font-variant-numeric: tabular-nums; }
  /* A useful minimum, like `SheetPreview`: below this the drawing is decoration. */
  .sheet {
    margin-top: 0.25rem; overflow: auto;
    background: var(--st-text); border-radius: 4px; min-height: 9rem;
  }
  .sheet :global(svg) { max-width: 100%; height: auto; display: block; }

  /* Wide content scrolls inside its own box; the panel never scrolls sideways. */
  .table-wrap { margin-top: 0.25rem; overflow-x: auto; }
  table { border-collapse: collapse; font-size: 0.62rem; font-family: var(--st-mono); }
  td {
    border: 1px solid var(--st-hair);
    padding: 0.05rem 0.25rem;
    color: var(--st-text);
    white-space: nowrap;
  }
</style>
