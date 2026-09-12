<script lang="ts">
  import { t } from '../../lib/i18n';
  import { uiStore, modelStore, resultsStore } from '../../lib/store';
  import {
    loadFile, downloadExcel, downloadResultsCSV, downloadDXF, downloadSVG,
    saveTextTo, canChooseSaveLocation, projectPayload, sessionPayload,
  } from '../../lib/store/file';
  import HelpTip from '../HelpTip.svelte';
  import { generateShareURL, MAX_URL_SAFE } from '../../lib/utils/url-sharing';
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
  /*
   * Whether to ASK where, when the browser can. On by default where it is
   * supported, and a choice rather than a fixed behaviour: the picker is a
   * modal owned by the operating system, and a reader who just wants the
   * file in Downloads should not have to dismiss one every time. It is also
   * the honest way to describe what happens — a dismissed picker is a
   * decision not to save, and that is indistinguishable from a picker that
   * could not open, so the reader gets to say which they want.
   */
  let chooseFolder = $state(canChooseSaveLocation());

  async function doSave() {
    const { content, filename } = saveScope === 'session' ? sessionPayload() : projectPayload();
    const outcome = await saveTextTo(content, filename, 'application/json', {
      chooseLocation: chooseFolder,
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
  /**
   * Copy a link carrying the whole model.
   *
   * This dispatched `stabileo-copy-share-link` on `window`, and NOTHING
   * listened for it: the button had looked finished since the day it was
   * written and had never once copied anything. Basic calls
   * `generateShareURL` directly and reports the same three outcomes — empty
   * model, a link long enough to be worth warning about, and success — so
   * this calls the same function rather than inventing a second route with
   * its own idea of what those outcomes are.
   */
  async function copyShareLink() {
    const result = generateShareURL();
    if (!result) { uiStore.toast(t('project.emptyModel'), 'error'); return; }
    if (result.length > MAX_URL_SAFE) {
      uiStore.toast(t('project.longLink').replace('{n}', String(result.length)), 'info');
    }
    await navigator.clipboard.writeText(result.url);
    uiStore.toast(t('project.linkCopied'), 'success');
  }

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

  <HelpTip text={t('proProject.examplesHelp')}>
  <button
    class="pp-btn pp-btn-wide pp-disclose"
    onclick={() => (showExamples = !showExamples)}
    aria-expanded={showExamples}
    data-testid="pp-examples"
  >
    <span>{t('pro.exampleBtn')}</span>
    <span class="pp-caret">{showExamples ? '▾' : '▸'}</span>
  </button>
  </HelpTip>

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
    DXF and IFC are not here any more.
    ─────────────────────────────────
    They are IMPORTS, and the section below is called Import — the same two
    buttons existed in both places, which is two routes to one operation and
    a reader wondering whether they differ. What belongs here is what
    STARTS a model without a file to start it from, which today is Examples
    and will be the tutorials.
  -->
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
      <!--
        Every control explains itself, and answers a CLICK.
        ─────────────────────────────────────────────────
        These carried a native `title`, which answers only to a patient
        pointer: a reader who wanted the explanation had to hover and wait,
        and on a touch screen could not get it at all. `HelpTip` opens on a
        click and the same click puts it away, which is the toggle Basic has.
      -->
      <HelpTip text={t('project.saveTooltip')}>
        <button class="pp-btn pp-btn-primary" onclick={() => (showSave = true)}
                data-testid="pp-save">{t('project.save')}</button>
      </HelpTip>
      <HelpTip text={t('project.openTooltip')}>
        <button class="pp-btn" onclick={() => fileInput?.click()}
                data-testid="pp-open">{t('project.open')}</button>
      </HelpTip>
      <HelpTip text={t('project.copyLinkTooltip')}>
        <button
          class="pp-btn"
          onclick={copyShareLink}
          disabled={!hasModel}
          data-testid="pp-share"
        >{t('project.shareLink')}</button>
      </HelpTip>
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
        {#if canChooseFolder}
          <label class="pp-save-opt" style="padding-left:0">
            <input type="checkbox" bind:checked={chooseFolder} data-testid="pp-choose-folder" />
            <span><strong>{t('project.chooseFolder')}</strong></span>
          </label>
        {:else}
          <p class="pp-note">{t('project.saveWhereDownloads')}</p>
        {/if}
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

    <!--
      ── Import reads like Export, because they are the same kind of list ──
      Export groups by WHAT COMES OUT, under a caption, in a grid of short
      buttons. Import was three full-width rows with a `?` hanging off two of
      them, so two halves of one section were laid out by different rules and
      the panel read as two panels. Same captions, same grid: what arrives is
      a spreadsheet or a drawing, and the drawing can be a plan or a model.
    -->
    <span class="pp-sub">{t('project.importLabel')}</span>
    <div class="pp-group">
      <span class="pp-group-label">{t('project.importSpreadsheet')}</span>
      <div class="pp-grid">
        <HelpTip text={t('xls.ui.importTooltip')}>
          <button class="pp-btn" onclick={() => xlsInput?.click()} data-testid="pp-xls-import"
          >{t('xls.ui.import')}</button>
        </HelpTip>
        <HelpTip text={t('xls.ui.templateTooltip')}>
          <button class="pp-btn pp-btn-quiet" onclick={handleDownloadTemplate} data-testid="pp-xls-template"
          >{t('xls.ui.template')}</button>
        </HelpTip>
      </div>
    </div>
    <div class="pp-group">
      <span class="pp-group-label">{t('project.importDrawing')}</span>
      <div class="pp-grid">
        <HelpTip text={t('proProject.dxfHelp')}>
          <button class="pp-btn"
                  onclick={() => window.dispatchEvent(new Event('stabileo-import-dxf'))}
          >{t('cad.proBarBtn')}</button>
        </HelpTip>
        <HelpTip text={t('proProject.ifcHelp')}>
          <button class="pp-btn"
                  onclick={() => window.dispatchEvent(new Event('stabileo-import-ifc'))}
          >{t('project.openIfc')}</button>
        </HelpTip>
      </div>
    </div>

    <span class="pp-sub">{t('project.export')}</span>
    <div class="pp-group">
      <span class="pp-group-label">{t('project.exportResults')}</span>
      <div class="pp-grid">
        <HelpTip text={t('project.exportExcelTooltip')}>
          <button class="pp-btn" onclick={() => downloadExcel()}>Excel</button>
        </HelpTip>
        <HelpTip text={t('project.exportCsvTooltip')}>
          <button class="pp-btn" onclick={() => downloadResultsCSV()} disabled={!solved}>CSV</button>
        </HelpTip>
        <!--
          The report is an export of the results, so it is offered with them.
          ─────────────────────────────────────────────────────────────────
          It was reachable only from a command in ANALYSE, which put the
          three ways of getting the same numbers out of the application in
          two different places. Same dialog, same data — what differs is the
          document it comes out as.
        -->
        <HelpTip text={t('project.exportReportTooltip')}>
          <button class="pp-btn" data-testid="pp-export-report" disabled={!solved}
                  onclick={() => window.dispatchEvent(new Event('stabileo-open-report'))}
          >{t('pro.reportBtn')}</button>
        </HelpTip>
      </div>
    </div>
    <div class="pp-group">
      <span class="pp-group-label">{t('project.exportView')}</span>
      <div class="pp-grid">
        <HelpTip text={t('project.exportDxfTooltip')}>
          <button class="pp-btn" onclick={() => downloadDXF()}>DXF</button>
        </HelpTip>
        <HelpTip text={t('project.exportSvgTooltip')}>
          <button class="pp-btn" onclick={() => downloadSVG()}>SVG</button>
        </HelpTip>
      </div>
    </div>
  </section>

  <!--
    "Documento abierto" is gone.
    ───────────────────────────
    It listed the file name, the node and member counts and whether the model
    was solved — three facts the application states where they are needed. The
    name is in the tab, the counts are the Model tables this panel is one
    click from, and solved-or-not is the state of every command in ANALYSE.
    Repeating them here bought a card at the cost of making the reader check
    which copy was current.
  -->

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

    <!--
      ── The long note moves into the `?` ───────────────────────────────
      A paragraph explaining where the restore offer appears is worth having
      and is not worth four lines of a docked panel every time you open it:
      it answers a question asked once. And the refresh button said nothing
      about what it refreshes — it re-reads the browser's own store, which
      matters when another tab has written since this panel was opened, and
      nothing about the model changes either way. Both are what a `?` is for.
    -->
    <div class="pp-row pp-row-end">
      <HelpTip text={`${t('proProject.autosaveRefreshHelp')} ${t('proProject.autosaveRestoreHint')}`}>
        <button class="pp-btn pp-btn-grow" onclick={refreshStatus} data-testid="pp-autosave-refresh">
          {t('proProject.autosaveRefresh')}
        </button>
      </HelpTip>
    </div>
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
    /* Horizontal inset comes from `.pro-content` now; see ProPanel. */
    padding: 0.75rem 0 1.1rem;
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
  .pp-btn:focus-visible {
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

  /*
     `.pp-help` is gone with the `?` buttons it styled. They carried a native
     `title`, which answers only to a patient pointer — a click did nothing,
     and a control shaped like a question that ignores being asked reads as
     broken. `HelpTip` wraps the real control instead, and opens on a click.
  */

  /* Quieter than its neighbour: the template is what you take AWAY to fill
     in, next to the button that brings a filled-in one back. */
  .pp-btn-quiet { color: var(--st-text-3); }
  .pp-btn-quiet:hover { color: var(--st-text); }

  .pp-row-end { justify-content: flex-end; }

  /*
     A wrapped control still has to fill its row.

     `HelpTip` is an inline-flex span around whatever it explains, so a
     `pp-btn-grow` inside one grows against the SPAN and the span shrinks to
     fit: the DXF and IFC buttons came out half width beside a full-width
     Examples. The wrapper inherits the growth instead, and the button fills
     it — the tip changes what a control explains, not how wide it is.
  */
  .pp-row :global(.ht-wrap) { flex: 1; min-width: 0; }
  .pp-row :global(.ht-wrap > button) { width: 100%; }
  .pp-grid :global(.ht-wrap) { width: 100%; }
  .pp-grid :global(.ht-wrap > button) { width: 100%; }

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
