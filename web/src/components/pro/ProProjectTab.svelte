<script lang="ts">
  import { t } from '../../lib/i18n';
  import { uiStore, modelStore, resultsStore } from '../../lib/store';
  import {
    loadFile, downloadExcel, downloadResultsCSV, downloadDXF, downloadSVG,
    saveTextTo, canChooseSaveLocation, projectPayload, sessionPayload,
  } from '../../lib/store/file';
  import { autosaveStatus, autosaveRevisions } from '../../lib/store/autosave-db';

  /**
   * PRO's project view: what you have open, and how it gets in and out.
   *
   * PRO had no such place. Saving was a keyboard shortcut, opening was a file
   * input owned by another component, exporting lived at the bottom of a tab
   * about something else, and "Examples" was a button that opened a floating
   * gallery over the canvas and nothing else. So the one screen every project
   * starts and ends at did not exist.
   *
   * Basic answered this with a Project panel, and the answer transfers — but
   * the content does not. PRO's examples are curated engineering cases with a
   * stated intent and a size, so they keep more than a name; at panel width
   * that is the name, one line of description and the model's size, which is
   * what anyone actually chooses on.
   */

  type ExGroup = { title: string; examples: Array<Record<string, any>> };
  type Props = { groups: ExGroup[]; onLoadExample: (ex: any) => void };
  let { groups, onLoadExample }: Props = $props();

  /* Saving asks what and where, exactly as Basic does. */
  let showSave = $state(false);
  let saveScope = $state<'tab' | 'session'>('tab');
  const canChooseFolder = canChooseSaveLocation();

  async function doSave() {
    const { content, filename } = saveScope === 'session' ? sessionPayload() : projectPayload();
    const outcome = await saveTextTo(content, filename, 'application/json', {
      chooseLocation: canChooseFolder,
    });
    /* A dismissed chooser is a decision not to save; the dialog stays open. */
    if (outcome === 'cancelled') return;
    showSave = false;
  }

  /** The spreadsheet importer, shared with Basic. */
  let xlsInput = $state<HTMLInputElement | undefined>(undefined);

  async function handleDownloadTemplate() {
    const { downloadTemplate } = await import('../../lib/excel-import/template');
    await downloadTemplate();
  }

  async function handleImportExcel(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const { importExcelFile } = await import('../../lib/excel-import/apply');
    await importExcelFile(file);
  }

  let fileInput: HTMLInputElement | undefined = $state();

  /**
   * What the user is holding: the document, its size, and where the autosave is keeping it.
   *
   * ── Why the Restore / Discard buttons are NOT here ────────────────
   *
   * There is exactly one place in this application that offers to restore a saved project: the
   * inline prompt beside the tab strip. It moved there because a full-width banner pushed the
   * whole app down on every load, and it carries the timestamp and the "this is not your newest
   * save" warning. A second pair of Restore / Discard buttons in this panel would be a second
   * owner of a decision that must be taken once — and the two would be able to disagree about
   * whether an offer is still open.
   *
   * So this section is the STATUS, and it says where the decision lives. Nothing here restores
   * or discards anything.
   */
  let storage = $state<{ backend: string; degraded: boolean; reason: string | null } | null>(null);
  let lastSave = $state<{ revision: number; timestamp: string } | null>(null);
  let statusError = $state<string | null>(null);

  /**
   * Read on mount and on demand, never on a timer.
   *
   * Both calls open IndexedDB. Polling them would put a database read behind every keystroke in
   * a panel whose whole job is to sit still, so the refresh is a control the user presses.
   */
  async function refreshStatus() {
    statusError = null;
    try {
      const [s, revs] = await Promise.all([autosaveStatus(), autosaveRevisions()]);
      storage = s;
      lastSave = revs.length > 0
        ? { revision: revs[0].revision, timestamp: revs[0].timestamp }
        : null;
    } catch (err: unknown) {
      // Reported, not swallowed: "the autosave status is unknown" is itself worth knowing.
      statusError = err instanceof Error ? err.message : String(err);
    }
  }

  $effect(() => { void refreshStatus(); });

  const nodeCount = $derived(modelStore.nodes.size);
  const elementCount = $derived(modelStore.elements.size);
  const docName = $derived(modelStore.model.name?.trim() || t('tabBar.newStructure'));
  /*
   * The gallery lives IN the panel, not over the canvas.
   *
   * It was a floating menu with a backdrop, anchored to a button — so choosing
   * a model meant covering the model, and the one screen a project starts at
   * threw a dialog at you. At panel width the cards drop to one line of name
   * plus one of description, which is what you actually choose on; the tags
   * and the node counts follow underneath.
   */
  let showExamples = $state(false);

  const solved = $derived(resultsStore.results3D != null || resultsStore.results != null);
  const hasModel = $derived(modelStore.nodes.size > 0);

  async function handleLoad(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const r = await loadFile(file);
      if (r.type === 'session') {
        uiStore.toast(t('toast.sessionRestored').replace('{n}', String(r.count)), 'success');
      }
    } catch (err: unknown) {
      uiStore.toast(err instanceof Error ? err.message : String(err), 'error');
    }
    input.value = '';
  }
</script>

<div class="pp" data-testid="pro-project-tab">
  <!--
    Starting a model comes before describing the one that is open.
    ─────────────────────────────────────────────────────────────
    The panel opened on "Documento abierto", which is the right FIRST FACT for a
    session already under way and the wrong first thing for the reader who came
    here to begin. Examples, a DXF plan and an IFC import are the three ways a
    PRO model starts, and the reader who needs them is the one who has nothing
    open to read about.
  -->
  <section class="pp-card">
  <h4 class="pp-heading pp-heading-first">{t('proProject.newModel')}</h4>

  <button
    class="pp-btn pp-btn-wide pp-disclose"
    onclick={() => (showExamples = !showExamples)}
    aria-expanded={showExamples}
    data-testid="pp-examples"
  >
    <span>{t('pro.exampleBtn')}</span>
    <span class="pp-caret">{showExamples ? '▾' : '▸'}</span>
  </button>

  {#if showExamples}
    <div class="pp-gallery" data-testid="pp-gallery">
      {#each groups as g (g.title)}
        <div class="pp-gal-group">{g.title}</div>
        {#each g.examples as ex (ex.nameKey)}
          <button class="pp-ex" onclick={() => { onLoadExample(ex); showExamples = false; }}>
            <span class="pp-ex-name">{t(ex.nameKey)}</span>
            <span class="pp-ex-desc">{t(ex.descKey)}</span>
            <span class="pp-ex-meta">
              {ex.stats.nodes} {t('pro.stats.nodes')} · {ex.stats.members} {t('pro.stats.members')}
              {#if ex.stats.shells}· {ex.stats.shells} {t('pro.stats.shells')}{/if}
            </span>
          </button>
        {/each}
      {/each}
    </div>
  {/if}

  <!--
    Two importers, each with what it actually does. "DXF plan" named a file
    format and left the rest to guesswork — it takes an architectural floor
    plan and proposes a structure from it, which is a different promise from
    "open a file".
  -->
  <div class="pp-row">
    <button
      class="pp-btn pp-btn-grow"
      onclick={() => window.dispatchEvent(new Event('stabileo-import-dxf'))}
    >{t('cad.proBarBtn')}</button>
    <button class="pp-help" title={t('proProject.dxfHelp')} aria-label={t('proProject.dxfHelp')}>?</button>
  </div>
  <div class="pp-row">
    <button
      class="pp-btn pp-btn-grow"
      onclick={() => window.dispatchEvent(new Event('stabileo-import-ifc'))}
    >{t('project.openIfc')}</button>
    <button class="pp-help" title={t('proProject.ifcHelp')} aria-label={t('proProject.ifcHelp')}>?</button>
  </div>
  </section>

  <!--
    ── Archivo, in Basic's shape ──────────────────────────────────────
    One Save that asks what and where, Open beside it, and the share link
    with them — a model arrives as a file or as a link, and the two ways in
    belong together. PRO had two Save buttons that each wrote a .ded the
    instant they were pressed, with the difference between "pestaña" and
    "sesión" explained nowhere a reader would meet it.
  -->
  <section class="pp-card">
    <h4 class="pp-heading">{t('project.fileSection')}</h4>
    <div class="pp-grid">
      <button class="pp-btn pp-btn-primary" onclick={() => (showSave = true)}
              title={t('project.saveTooltip')} data-testid="pp-save">
        {t('project.save')}
      </button>
      <button class="pp-btn" onclick={() => fileInput?.click()}
              title={t('project.openTooltip')} data-testid="pp-open">
        {t('project.open')}
      </button>
      <button
        class="pp-btn"
        onclick={() => window.dispatchEvent(new Event('stabileo-copy-share-link'))}
        disabled={!hasModel}
        title={t('project.copyLinkTooltip')}
        data-testid="pp-share"
      >{t('project.shareLink')}</button>
    </div>

    {#if showSave}
      <div class="pp-save" data-testid="pp-save-dialog">
        <p class="pp-save-title">{t('project.saveWhat')}</p>
        <label class="pp-save-opt" class:on={saveScope === 'tab'}>
          <input type="radio" bind:group={saveScope} value="tab" data-testid="pp-scope-tab" />
          <span>
            <strong>{t('project.scopeTab')}</strong>
            <em>{t('project.saveTabWhat')}</em>
          </span>
        </label>
        <label class="pp-save-opt" class:on={saveScope === 'session'}>
          <input type="radio" bind:group={saveScope} value="session" data-testid="pp-scope-session" />
          <span>
            <strong>{t('project.scopeSession')}</strong>
            <em>{t('project.saveSessionWhat')}</em>
          </span>
        </label>
        <p class="pp-note">
          {canChooseFolder ? t('project.saveWherePick') : t('project.saveWhereDownloads')}
        </p>
        <div class="pp-row pp-save-actions">
          <button class="pp-btn" onclick={() => (showSave = false)}>{t('ribbon.close')}</button>
          <button class="pp-btn pp-btn-primary" onclick={doSave} data-testid="pp-save-confirm">
            {t('project.save')}
          </button>
        </div>
      </div>
    {/if}
  </section>

  <!--
    ── Importar / Exportar, in that order ─────────────────────────────
    A model arrives before it leaves. Import carries what Basic has plus the
    two PRO only has — a DXF floor plan and IFC — and Export groups by what
    comes out rather than by file extension.

    These call the SAME functions as the surfaces the data lives on: the
    results table exports its own numbers through `downloadExcel`, and so
    does this. One route with two doors, not two routes to keep in step.
  -->
  <section class="pp-card">
    <h4 class="pp-heading">{t('project.importExport')}</h4>

    <span class="pp-sub">{t('project.importLabel')}</span>
    <div class="pp-row">
      <button class="pp-btn pp-btn-grow" onclick={() => xlsInput?.click()} data-testid="pp-xls-import">
        {t('xls.ui.import')}
      </button>
      <button class="pp-btn pp-btn-aside" onclick={handleDownloadTemplate} data-testid="pp-xls-template">
        {t('xls.ui.template')}
      </button>
    </div>
    <div class="pp-row">
      <button class="pp-btn pp-btn-grow"
              onclick={() => window.dispatchEvent(new Event('stabileo-import-dxf'))}>
        {t('cad.proBarBtn')}
      </button>
      <button class="pp-help" title={t('proProject.dxfHelp')} aria-label={t('proProject.dxfHelp')}>?</button>
    </div>
    <div class="pp-row">
      <button class="pp-btn pp-btn-grow"
              onclick={() => window.dispatchEvent(new Event('stabileo-import-ifc'))}>
        {t('project.openIfc')}
      </button>
      <button class="pp-help" title={t('proProject.ifcHelp')} aria-label={t('proProject.ifcHelp')}>?</button>
    </div>

    <span class="pp-sub">{t('project.export')}</span>
    <div class="pp-group">
      <span class="pp-group-label">{t('project.exportResults')}</span>
      <div class="pp-grid">
        <button class="pp-btn" onclick={() => downloadExcel()} title={t('project.exportExcelTooltip')}>Excel</button>
        <button class="pp-btn" onclick={() => downloadResultsCSV()} disabled={!solved}
                title={t('project.exportCsvTooltip')}>CSV</button>
      </div>
    </div>
    <div class="pp-group">
      <span class="pp-group-label">{t('project.exportView')}</span>
      <div class="pp-grid">
        <button class="pp-btn" onclick={() => downloadDXF()} title={t('project.exportDxfTooltip')}>DXF</button>
        <button class="pp-btn" onclick={() => downloadSVG()} title={t('project.exportSvgTooltip')}>SVG</button>
      </div>
    </div>
  </section>

  <!--
    ── Status, after the work ─────────────────────────────────────────
    What is open and where it is being kept are facts, not actions. They
    opened the panel, which put two read-only cards above every button a
    reader came here to press. Kept — they answer real questions — and moved
    below the things you do.
  -->
  <!--
    What is open, and only then what you can do to it.
  -->
  <section class="pp-card" data-testid="pp-document">
    <h4 class="pp-heading">{t('proProject.documentSection')}</h4>
    <dl class="pp-facts">
      <dt>{t('proProject.documentName')}</dt>
      <dd data-testid="pp-doc-name">{docName}</dd>
      <dt>{t('proProject.documentSize')}</dt>
      <dd data-testid="pp-doc-size">
        {nodeCount} {t('pro.stats.nodes')} · {elementCount} {t('pro.stats.members')}
      </dd>
      <dt>{t('proProject.documentSolved')}</dt>
      <dd data-testid="pp-doc-solved">
        {solved ? t('proProject.solvedYes') : t('proProject.solvedNo')}
      </dd>
    </dl>
  </section>

  <!--
    Autosave: status only. The offer to restore is the inline prompt beside the tabs, and there
    is one of it — see the note in the script.
  -->
  <section class="pp-card" data-testid="pp-autosave">
    <h4 class="pp-heading">{t('proProject.autosaveSection')}</h4>
    <dl class="pp-facts">
      <dt>{t('proProject.autosaveWhere')}</dt>
      <dd data-testid="pp-autosave-backend">
        {storage ? t(`proProject.backend.${storage.backend}`) : '—'}
      </dd>
      <dt>{t('proProject.autosaveLast')}</dt>
      <dd data-testid="pp-autosave-last">
        {#if lastSave}
          <span class="pp-rev">r{lastSave.revision}</span>
          {new Date(lastSave.timestamp).toLocaleString()}
        {:else}
          {t('proProject.autosaveNone')}
        {/if}
      </dd>
    </dl>

    {#if storage?.degraded}
      <!-- Degraded storage is stated with the `⚠` and the sentence, never by colour alone. -->
      <p class="pp-warn" role="status" data-testid="pp-autosave-degraded">
        <span aria-hidden="true">⚠</span>
        {t('proProject.autosaveDegraded')}{storage.reason ? ` — ${storage.reason}` : ''}
      </p>
    {/if}
    {#if statusError}
      <p class="pp-warn" role="alert" data-testid="pp-autosave-error">
        <span aria-hidden="true">⚠</span> {statusError}
      </p>
    {/if}

    <p class="pp-note">{t('proProject.autosaveRestoreHint')}</p>
    <button class="pp-btn pp-btn-wide" onclick={refreshStatus} data-testid="pp-autosave-refresh">
      {t('proProject.autosaveRefresh')}
    </button>
  </section>


  <!--
    Export used to be a card here: Excel, CSV, PNG. Those are done from where the
    thing being exported lives — the results table exports its own numbers, the
    viewport its own picture — so a second set of buttons in Project was a
    parallel route that had to be kept in step with them.
  -->

</div>

<!--
  The production Open path, driven by `pp-open` above.

  ── Why this id is `pp-open-file` and not `project-open-file` ──────

  It carries a different id from the other two file inputs in the application on purpose.
  `ToolbarProject` (Básico, inside the Project panel) and `ProProjectFileActions` (PRO on mobile)
  share `project-open-file` because they are never mounted at the same time — that convention is
  stated where it is written, and it holds for those two.

  It does NOT hold here. `ProPanel` renders the mobile action row and the active tab as siblings,
  so on a phone with the Project tab open, `ProProjectFileActions` and this component are both on
  the page. Giving this input the same id would make every strict-mode locator for it resolve to
  two elements, and the failure would appear on a viewport nobody was thinking about.

  So: `pp-open-file`, in the `pp-*` family this panel already uses. `e2e/pro-project-files.spec.ts`
  documents the equivalence — same `loadFile` entry point, same `.ded`, same behaviour.
-->
<!-- The spreadsheet importer's own input, beside the .ded one. -->
<input
  bind:this={xlsInput}
  data-testid="pp-xls-file"
  type="file"
  accept=".xlsx,.xls"
  style="display:none"
  onchange={handleImportExcel}
/>

<input
  bind:this={fileInput}
  data-testid="pp-open-file"
  type="file"
  accept=".ded,.json"
  style="display:none"
  onchange={handleLoad}
/>

<style>
  /*
     The panel's own gutter.
     ────────────────────────────────────────────────────────────────
     `.pro-content` is `padding: 0`, so anything a tab does not pad itself sits flush against
     the panel border and the scrollbar. This one did not, which is the reported "los botones
     tocan los bordes": Save had a 1 px border and then the edge of the window.

     Padding is taken here rather than on `.pro-content` deliberately. Several PRO tabs are
     edge-to-edge tables that already manage their own gutters, and moving the padding up would
     double theirs to fix this one.
  */
  .pp {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    padding: 0.75rem 0.85rem 1.1rem;
  }

  /*
     One card per decision, so the sections stop running into each other.
     Grouped by the verb — what you HAVE, what you save and open, what the autosave is doing,
     how you start something new, what comes out, what you share.
  */
  /* ── Import / Export, in Basic's visual language ──────────────── */
  .pp-sub {
    display: block;
    margin: 0.5rem 0 0.25rem;
    font-family: var(--st-mono);
    font-size: 0.62rem;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--st-text-3);
  }

  .pp-group {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin: 0 0 0.4rem 0.75rem;
    padding-left: 0.55rem;
    border-left: 2px solid var(--st-hair-strong);
  }

  .pp-group-label {
    font-size: 0.62rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--st-text-3);
  }

  /* The template gives a file rather than taking one: narrower and quieter. */
  .pp-btn-aside {
    flex: 0 0 auto;
    font-size: 0.66rem;
    color: var(--st-text-3);
  }

  /* ── Save dialog ─────────────────────────────────────────────── */
  .pp-save {
    margin-top: 0.45rem;
    padding: 0.5rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    background: var(--st-surface-2);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .pp-save-title { margin: 0; font-size: 0.72rem; color: var(--st-text); }

  .pp-save-opt {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    padding: 0.3rem;
    border: 1px solid transparent;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.7rem;
    line-height: 1.35;
  }

  .pp-save-opt.on { border-color: var(--st-accent); background: var(--st-selected-bg); }
  .pp-save-opt strong { display: block; color: var(--st-text); }
  .pp-save-opt em { display: block; font-style: normal; color: var(--st-text-3); }
  .pp-save-actions { justify-content: flex-end; }

  .pp-card {
    display: flex;
    flex-direction: column;
    padding: 0.6rem 0.7rem 0.7rem;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius-lg);
  }

  /* ── Facts, not controls ─────────────────────────────────────── */
  .pp-facts {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.2rem 0.6rem;
    margin: 0;
    font-size: 0.72rem;
  }
  .pp-facts dt { color: var(--st-text-3); }
  .pp-facts dd { margin: 0; color: var(--st-text); overflow-wrap: anywhere; }
  .pp-rev {
    font-family: var(--st-mono);
    color: var(--st-text-2);
    margin-right: 0.3rem;
  }

  .pp-note {
    margin: 0.45rem 0 0.5rem;
    font-size: 0.68rem;
    line-height: 1.45;
    color: var(--st-text-3);
  }

  .pp-warn {
    display: flex;
    gap: 0.35rem;
    margin: 0.45rem 0 0;
    font-size: 0.7rem;
    line-height: 1.45;
    color: var(--st-warn);
  }

  .pp-heading {
    font-family: var(--st-mono);
    font-size: 0.66rem;
    font-weight: 400;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: var(--st-text-2);
    margin: 0.9rem 0 0.4rem;
    padding-bottom: 0.15rem;
    border-bottom: 1px solid var(--st-hair);
  }

  /* Every heading is now first inside its own card, so the top margin never applies. */
  .pp-heading:first-child,
  .pp-heading-first { margin-top: 0; }

  /*
     Sized by content, not by count: a three-column grid gives three items a
     third of the panel each and six items a sixth, so the same class produced
     a wide Save and a small CSV and implied one outranked the other.
  */
  .pp-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
    gap: 0.3rem;
  }

  .pp-btn-wide { grid-column: 1 / -1; }

  .pp-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 30px;
    padding: 0.35rem 0.5rem;
    background: none;
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-family: var(--st-sans);
    font-size: 0.75rem;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }

  .pp-btn:hover:not(:disabled) {
    background: var(--st-surface-3);
    border-color: var(--st-hair-strong);
    color: var(--st-text);
  }

  /*
     A keyboard user could not see where they were: there was no focus style at all, so Tab
     through this panel moved an invisible caret. The ring is the shared `--st-focus`, offset
     so it reads against the card rather than merging with the button's own border.
  */
  .pp-btn:focus-visible,
  .pp-help:focus-visible {
    outline: 2px solid var(--st-focus);
    outline-offset: 2px;
    color: var(--st-text);
  }

  /*
     Save is the primary action of this panel and now looks like one.

     Not white, and not a filled accent: a white fill in this shell reads as an input, and the
     vermillion accent is the brand and the destructive edge. This is the interactive blue the
     rest of PRO uses for "you can press this", carried on the border and the label so the
     button stays a button rather than becoming a block of colour.
  */
  .pp-btn-primary {
    border-color: var(--st-interactive);
    color: var(--st-text);
    font-weight: 600;
  }
  .pp-btn-primary:hover:not(:disabled) {
    background: var(--st-surface-3);
    border-color: var(--st-interactive);
  }

  .pp-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .pp-row { display: flex; gap: 0.3rem; align-items: stretch; margin-top: 0.3rem; }
  .pp-btn-grow { flex: 1; }

  .pp-help {
    width: 26px;
    flex: none;
    background: none;
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text-3);
    font-size: 0.72rem;
    cursor: help;
  }

  .pp-help:hover { color: var(--st-text); border-color: var(--st-hair-strong); }

  .pp-disclose { justify-content: space-between; margin-top: 0.3rem; }
  .pp-caret { font-size: 0.6rem; color: var(--st-text-3); }

  .pp-gallery {
    display: flex;
    flex-direction: column;
    margin: 0.3rem 0 0.2rem;
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    max-height: 46vh;
    overflow-y: auto;
  }

  .pp-gal-group {
    font-family: var(--st-mono);
    font-size: 0.6rem;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: var(--st-text-3);
    padding: 0.4rem 0.5rem 0.2rem;
    background: var(--st-surface-2);
  }

  .pp-ex {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    text-align: left;
    background: none;
    border: none;
    border-top: 1px solid var(--st-hair);
    padding: 0.4rem 0.5rem;
    cursor: pointer;
  }

  .pp-ex:hover { background: var(--st-surface-3); }
  .pp-ex-name { font-size: 0.76rem; color: var(--st-text); }
  .pp-ex-desc { font-size: 0.66rem; color: var(--st-text-3); }
  .pp-ex-meta { font-family: var(--st-mono); font-size: 0.6rem; color: var(--st-text-3); }
</style>
