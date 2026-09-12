<script lang="ts">
  import { uiStore, resultsStore } from '../../lib/store';
  import {
    loadFile, downloadResultsCSV, downloadDXF, downloadSVG, downloadExcel, isMode3D,
    saveTextTo, canChooseSaveLocation, projectPayload, sessionPayload,
  } from '../../lib/store/file';
  import { generateShareURL, MAX_URL_SAFE } from '../../lib/utils/url-sharing';
  import { t } from '../../lib/i18n';
  import ToolbarExamples from './ToolbarExamples.svelte';
  import DemoMenu from '../DemoMenu.svelte';
  import CalcReportDialog from '../CalcReportDialog.svelte';

  let fileInput: HTMLInputElement;
  let showCalcReport = $state(false);

  /*
   * ── Which "?" is open ───────────────────────────────────────────
   *
   * Same affordance as the Advanced list, because it answers the same kind
   * of question: what does this actually do. The export buttons needed it
   * badly — six of them sat in one row labelled Excel, PDF, DXF, SVG, PNG,
   * CSV, and nothing on screen said that two of those write results, one
   * writes a document, and three photograph the view. A reader looking for
   * "the file I can send my colleague to open" had six equally plausible
   * candidates and no way to choose.
   */
  /*
   * ── Saving asks first ───────────────────────────────────────────
   *
   * There were two buttons, "Guardar Pestaña" and "Guardar Sesión", and each
   * put a .ded in the Downloads folder the instant it was pressed. Two
   * problems in one: the difference between them was never explained
   * anywhere a reader would meet it, and neither offered a say in where the
   * file went — the one question people actually have when saving.
   *
   * One button now, and a small dialog that names the two scopes and then
   * saves. Where the browser can offer a folder chooser it does; where it
   * cannot the dialog says so rather than implying a choice that will not
   * appear.
   */
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

  let helpKey = $state<string | null>(null);
  function toggleHelp(key: string, e: MouseEvent) {
    e.stopPropagation();
    helpKey = helpKey === key ? null : key;
  }

  // ─── Excel import ────────────────────────────────────────────────
  let xlsInput: HTMLInputElement;
  /**
   * The last import's report, or null.
   *
   * Kept on screen rather than toasted. A toast is the wrong shape for this:
   * what is useful is a list of rows to go and fix, the reader needs it while
   * they are back in the spreadsheet, and a message that removes itself after
   * four seconds turns "row 47 wants a number in x" into "something was wrong".
   */
  let xlsReport = $state<import('../../lib/excel-import/apply').ImportOutcome | null>(null);

  async function handleImportExcel(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // so choosing the same file twice fires again
    if (!file) return;

    try {
      const { importExcelFile } = await import('../../lib/excel-import/apply');
      const outcome = await importExcelFile(file);
      if (!outcome) return; // the library failed to load, and said so
      xlsReport = outcome;
      if (outcome.loaded.nodes > 0) {
        uiStore.toast(
          t('xls.ui.imported')
            .replace('{n}', String(outcome.loaded.nodes))
            .replace('{e}', String(outcome.loaded.elements)),
          outcome.problems.length > 0 ? 'info' : 'success',
        );
      } else {
        uiStore.toast(t('xls.ui.nothingLoaded'), 'error');
      }
    } catch (err) {
      console.error('[stabileo] Excel import failed:', err);
      uiStore.toast(t('xls.ui.unreadable'), 'error');
    }
  }

  async function handleDownloadTemplate() {
    const { downloadTemplate } = await import('../../lib/excel-import/template');
    await downloadTemplate();
  }

  let showProject = $state(false);
  let showProjectExtras = $state(false);

  // Listen for tour events to auto-open/close project section
  $effect(() => {
    const openProject = () => { showProject = true; };
    const closeProject = () => { showProject = false; };
    window.addEventListener('stabileo-open-project', openProject);
    window.addEventListener('stabileo-close-project', closeProject);
    return () => {
      window.removeEventListener('stabileo-open-project', openProject);
      window.removeEventListener('stabileo-close-project', closeProject);
    };
  });

  async function handleCopyShareLink() {
    const result = generateShareURL();
    if (!result) { uiStore.toast(t('project.emptyModel'), 'error'); return; }
    if (result.length > MAX_URL_SAFE) {
      uiStore.toast(t('project.longLink').replace('{n}', String(result.length)), 'info');
    }
    await navigator.clipboard.writeText(result.url);
    uiStore.toast(t('project.linkCopied'), 'success');
  }


  async function handleLoadFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const result = await loadFile(file);
      if (result.type === 'session') {
        uiStore.toast(t('project.sessionRestored').replace('{n}', String(result.count)), 'success');
      }
    } catch (err: any) {
      alert(err.message || t('project.loadError'));
    }
    input.value = ''; // reset so same file can be loaded again
  }

  function handleExportPNG() {
    // Dispatch custom event — App.svelte handles it with canvas ref
    window.dispatchEvent(new CustomEvent('stabileo-export-png'));
  }

  /**
   * `flat` — everything open, no accordions.
   *
   * These sections collapse because they used to be stacked in one narrow left
   * column where five of them competed for the same vertical space. In the
   * ribbon layout only ONE of them is ever mounted, in a panel that already
   * names it and that the user can widen, so a disclosure triangle just hides
   * what they explicitly asked to see.
   */
  let { flat = false }: { flat?: boolean } = $props();
</script>

<div class="toolbar-section" data-tour="project-section">
  {#if !flat}<button class="section-toggle" onclick={() => showProject = !showProject}>
    {showProject ? '▾' : '▸'} {t('project.title')}
  </button>
  {/if}
  {#if flat || showProject}
  {#if flat}<h4 class="proj-heading">{t('project.fileSection')}</h4>{/if}
  <div class="file-grid">
    <button class="file-btn" onclick={() => (showSave = true)} title={t('project.saveTooltip')} data-testid="save-open">
      {t('project.save')}
    </button>
    <button class="file-btn" onclick={() => fileInput?.click()} title={t('project.openTooltip')}>
      {t('project.open')}
    </button>
    <!--
      Beside Abrir, because that is the pair a reader thinks in: a model
      arrives as a file or as a link, and the two ways in belong together.
      It sat at the bottom under a heading of its own, three sections below
      the button it is the twin of.
    -->
    <button class="file-btn" onclick={handleCopyShareLink} title={t('project.copyLinkTooltip')}>
      {t('project.shareLink')}
    </button>
  </div>

  {#if showSave}
    <!--
      Inline rather than a modal over the canvas: this is a small choice
      about the panel's own button, and the model behind it is what the
      reader is deciding about.
    -->
    <div class="save-dialog" data-testid="save-dialog">
      <p class="save-title">{t('project.saveWhat')}</p>
      <label class="save-opt" class:on={saveScope === 'tab'}>
        <input type="radio" bind:group={saveScope} value="tab" data-testid="save-scope-tab" />
        <span>
          <strong>{t('project.scopeTab')}</strong>
          <em>{t('project.saveTabWhat')}</em>
        </span>
      </label>
      <label class="save-opt" class:on={saveScope === 'session'}>
        <input type="radio" bind:group={saveScope} value="session" data-testid="save-scope-session" />
        <span>
          <strong>{t('project.scopeSession')}</strong>
          <em>{t('project.saveSessionWhat')}</em>
        </span>
      </label>
      {#if canChooseFolder}
        <label class="save-opt">
          <input type="checkbox" bind:checked={chooseFolder} data-testid="save-choose-folder" />
          <span><strong>{t('project.chooseFolder')}</strong></span>
        </label>
      {:else}
        <p class="save-where">{t('project.saveWhereDownloads')}</p>
      {/if}
      <div class="save-actions">
        <button class="file-btn" onclick={() => (showSave = false)}>{t('ribbon.close')}</button>
        <button class="file-btn save-go" onclick={doSave} data-testid="save-confirm">
          {t('project.save')}
        </button>
      </div>
    </div>
  {/if}
  <!--
    Examples belong to the document, like everything else here: they answer
    "which model am I working on". They had their own panel and their own
    button, which put one of the six commands in the window's most valuable
    corner on the same footing as Save. Between opening a file and exporting
    one is where starting from a supplied model actually falls.
  -->
  <div class="proj-block">
    <ToolbarExamples flat={true} />
  </div>

  <!--
    Directly under the examples, and for the same reason they are here: both
    are things the app hands you rather than things you build. A reader who
    has just been offered a model to open is the reader most likely to want
    to be shown what to do with it.
  -->
  <div class="proj-block">
    <DemoMenu />
  </div>

  <!--
    A heading, not a toggle. Below it opens on `flat ||` regardless, so in the
    right panel this chevron changed direction and did nothing else.
  -->
  {#if flat}
    <h4 class="proj-heading">{t('project.importExport')}</h4>
  {:else}
    <button class="sub-section-toggle" onclick={() => showProjectExtras = !showProjectExtras}>
      {showProjectExtras ? '▾' : '▸'} {t('project.importExport')}
    </button>
  {/if}
  {#if flat || showProjectExtras}
    <div class="sub-section-content">
      {#snippet helpPanel(key: string, labelKey: string, textKey: string)}
        {#if helpKey === key}
          <div class="proj-help-panel">
            <strong>{t(labelKey)}</strong>
            <p>{t(textKey)}</p>
          </div>
        {/if}
      {/snippet}

      <!--
        ── Import first ─────────────────────────────────────────────
        The order follows the work: a model arrives before it leaves. Export
        sat on top because it was written first, which put the six buttons
        nobody needs yet above the one thing a reader opening an empty app
        is looking for.
      -->
      <!--
        ── Import, cut down to what Básico actually has ──────────────
        `.ded` came off because the big Abrir button above already does it,
        and two controls for one action is how a reader ends up unsure which
        one they are supposed to use. DXF and IFC were built for PRO, where
        they still live; neither was ever exercised in Básico.

        What is left is the spreadsheet, and its template beside it — an
        importer on its own is a guessing game, because the reader has a
        spreadsheet of their own and no way to learn what we call a column
        except by importing, reading the error and trying again.
      -->
      <span class="file-sub-header file-sub-first">{t('project.importLabel')}</span>

      <!--
        Same shape as the export groups: a labelled, railed row, so the two
        halves of the section read as siblings rather than as one list of
        buttons and one grouped set.

        The two buttons are deliberately NOT twins. One takes a file from the
        reader and one gives a file to them, and they were the same width and
        weight — which reads as a choice between two ways of importing. The
        template is the narrower, quieter one, and its label says what it is
        FOR rather than what it does: the format the file beside it has to be
        written in.
      -->
      <div class="file-sub-group">
        <span class="file-group-label">
          {t('xls.ui.groupLabel')}
          <button
            class="proj-help-btn"
            onclick={(e) => toggleHelp('import', e)}
            class:active={helpKey === 'import'}
            aria-label={t('project.importLabel')}
            data-testid="help-import"
          >?</button>
        </span>
        <div class="xls-row">
          <button class="file-btn xls-main" onclick={() => xlsInput?.click()} title={t('xls.ui.importTooltip')} data-testid="xls-import">
            {t('xls.ui.import')}
          </button>
          <button class="file-btn xls-aside" onclick={handleDownloadTemplate} title={t('xls.ui.templateTooltip')} data-testid="xls-template">
            {t('xls.ui.template')}
          </button>
        </div>
        <p class="xls-hint">{t('xls.ui.templateHint')}</p>
      </div>
      {@render helpPanel('import', 'project.importLabel', 'project.importHelp')}

      <!--
        ── Grouped by what comes out, not by file extension ──────────
        Three different things wear the word "export" here: numbers you can
        keep working with, a document you hand in, and a picture of the
        screen. Grouping them that way is the whole change — the buttons are
        the same, but a reader can now find the one they meant.
      -->
      <span class="file-sub-header">{t('project.export')}</span>

      <div class="file-sub-group">
        <span class="file-group-label">
          {t('project.exportResults')}
          <button
            class="proj-help-btn"
            onclick={(e) => toggleHelp('exp-results', e)}
            class:active={helpKey === 'exp-results'}
            aria-label={t('project.exportResults')}
            data-testid="help-exp-results"
          >?</button>
        </span>
        <div class="file-grid">
          <button class="file-btn" onclick={downloadExcel} title={t('project.exportExcelTooltip')}>
            Excel
          </button>
          <button
            class="file-btn"
            onclick={downloadResultsCSV}
            disabled={!resultsStore.results && !resultsStore.results3D}
            title={t('project.exportCsvTooltip')}
          >
            CSV
          </button>
        </div>
      </div>
      {@render helpPanel('exp-results', 'project.exportResults', 'project.exportResultsHelp')}

      <div class="file-sub-group">
        <span class="file-group-label">
          {t('project.exportReport')}
          <button
            class="proj-help-btn"
            onclick={(e) => toggleHelp('exp-report', e)}
            class:active={helpKey === 'exp-report'}
            aria-label={t('project.exportReport')}
            data-testid="help-exp-report"
          >?</button>
        </span>
        <div class="file-grid">
          <button class="file-btn" onclick={() => showCalcReport = true} title={t('project.exportPdfTooltip')}>
            PDF
          </button>
        </div>
      </div>
      {@render helpPanel('exp-report', 'project.exportReport', 'project.exportReportHelp')}

      <div class="file-sub-group">
        <span class="file-group-label">
          {t('project.exportView')}
          <button
            class="proj-help-btn"
            onclick={(e) => toggleHelp('exp-view', e)}
            class:active={helpKey === 'exp-view'}
            aria-label={t('project.exportView')}
            data-testid="help-exp-view"
          >?</button>
        </span>
        <div class="file-grid">
          <button class="file-btn" onclick={downloadDXF} disabled={isMode3D(uiStore.analysisMode)} title={isMode3D(uiStore.analysisMode) ? t('project.inDev3d') : t('project.exportDxfTooltip')}>
            DXF
          </button>
          <button class="file-btn" onclick={downloadSVG} disabled={isMode3D(uiStore.analysisMode)} title={isMode3D(uiStore.analysisMode) ? t('project.inDev3d') : t('project.exportSvgTooltip')}>
            SVG
          </button>
          <button class="file-btn" onclick={handleExportPNG} title={t('project.exportPngTooltip')}>
            PNG
          </button>
        </div>
      </div>
      {@render helpPanel('exp-view', 'project.exportView', 'project.exportViewHelp')}


      {#if xlsReport}
        <!--
          The report stays until it is dismissed, and it lists rows rather than
          counting them: "row 47 wants a number in x" is something a reader can
          act on in the spreadsheet they still have open, and "12 problems" is
          not. Capped at fifteen because a file with more than that has one
          systematic mistake, not fifteen — the sixteenth line would not teach
          anything the first three have not.
        -->
        <div class="xls-report" data-testid="xls-report">
          <div class="xls-report-head">
            <span>
              {t('xls.ui.reportTitle')
                .replace('{n}', String(xlsReport.loaded.nodes))
                .replace('{e}', String(xlsReport.loaded.elements))}
            </span>
            <button class="xls-report-close" onclick={() => (xlsReport = null)} aria-label={t('ribbon.close')}>×</button>
          </div>

          {#if xlsReport.unknownSheets.length > 0}
            <p class="xls-report-note">
              {t('xls.ui.unknownSheets').replace('{s}', xlsReport.unknownSheets.join(', '))}
            </p>
          {/if}

          {#if xlsReport.problems.length === 0}
            <p class="xls-report-ok">{t('xls.ui.noProblems')}</p>
          {:else}
            <ul class="xls-report-list">
              {#each xlsReport.problems.slice(0, 15) as p}
                <li><strong>{p.sheet} · {t('xls.ui.row')} {p.row}</strong> — {p.message}</li>
              {/each}
            </ul>
            {#if xlsReport.problems.length > 15}
              <p class="xls-report-note">
                {t('xls.ui.andMore').replace('{n}', String(xlsReport.problems.length - 15))}
              </p>
            {/if}
          {/if}
        </div>
      {/if}
    </div>
  {/if}
  {/if}
</div>

<!--
  The production Open path. Hidden because the visible button drives it, and addressable by a
  test id because a browser journey that must open a REAL committed project has to reach the
  file picker; the alternative is a test-only load hook, which would prove the hook works.
-->
<input
  bind:this={fileInput}
  data-testid="project-open-file"
  type="file"
  accept=".ded,.json"
  style="display:none"
  onchange={handleLoadFile}
/>

<input
  bind:this={xlsInput}
  data-testid="xls-input"
  type="file"
  accept=".xlsx,.xls"
  style="display:none"
  onchange={handleImportExcel}
/>

<CalcReportDialog bind:open={showCalcReport} />

<style>
  /* ─── The Excel import report ────────────────────────────────────
     Framed but not alarmed: most imports that produce one still produced a
     model, so this is a list of things to go and fix, not a failure. The
     severity lives in the individual lines, and `--st-warn` across the whole
     box would overstate every one of them.
     ─────────────────────────────────────────────────────────────── */
  /* The importer takes the space; the template asks for less of it. */
  .xls-row {
    display: flex;
    gap: 0.3rem;
    align-items: stretch;
  }

  .xls-main { flex: 1 1 auto; }

  .xls-aside {
    flex: 0 0 auto;
    font-size: 0.62rem;
    padding-left: 0.45rem;
    padding-right: 0.45rem;
    color: var(--st-text-3);
    background: none;
  }

  .xls-aside:hover {
    color: var(--st-accent);
    border-color: var(--st-accent);
  }

  .xls-hint {
    margin: 0.25rem 0 0;
    font-size: 0.6rem;
    line-height: 1.4;
    color: var(--st-text-3);
  }

  .xls-report {
    margin-top: 0.4rem;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    background: var(--st-surface-2);
    font-size: 0.7rem;
    line-height: 1.45;
  }
  .xls-report-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    color: var(--st-text);
    font-weight: 600;
  }
  .xls-report-close {
    background: none;
    border: none;
    color: var(--st-text-3);
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
    padding: 0 0.2rem;
  }
  .xls-report-close:hover { color: var(--st-text); }
  .xls-report-ok { margin: 0.3rem 0 0; color: var(--st-ok); }
  .xls-report-note { margin: 0.3rem 0 0; color: var(--st-text-3); }
  .xls-report-list {
    /* Long reports scroll inside the box; the panel keeps its own length. */
    margin: 0.35rem 0 0;
    padding-left: 1rem;
    max-height: 190px;
    overflow-y: auto;
    color: var(--st-text-2);
  }
  .xls-report-list li { margin-bottom: 0.2rem; }
  .xls-report-list strong { color: var(--st-text); font-weight: 600; }

  .toolbar-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .section-toggle {
    width: 100%;
    padding: 0.4rem 0.5rem;
    background: none;
    border: 1px solid var(--st-hair);
    border-radius: 4px;
    color: var(--st-text-2);
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 600;
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    transition: all 0.2s;
  }

  .section-toggle:hover {
    background: var(--st-bg);
    color: var(--st-text);
    border-color: var(--st-hair-strong);
  }

  .sub-section-toggle {
    width: 100%;
    padding: 0.25rem 0.4rem;
    background: none;
    border: 1px solid var(--st-hair);
    border-radius: 3px;
    color: var(--st-text-3);
    cursor: pointer;
    font-size: 0.65rem;
    font-weight: 600;
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    transition: all 0.2s;
    margin-left: 0.25rem;
  }

  .sub-section-toggle:hover {
    background: var(--st-bg);
    color: var(--st-text-2);
    border-color: var(--st-hair-strong);
  }

  .sub-section-content {
    margin-left: 0.25rem;
    padding-left: 0.4rem;
    border-left: 2px solid var(--st-hair);
  }

  :global(.basic-panel) .sub-section-content {
    margin-left: 0;
    padding-left: 0;
    border-left: none;
  }

  /*
     Every command in this panel is the same size.
     ────────────────────────────────────────────
     The file row and the export row used the same class but landed at
     different widths, because a three-column grid holding three items gives
     each a third of the panel while one holding six gives each a sixth — so
     "Save tab" was a wide button and "DXF" a small one, implying DXF was a
     lesser command than Save. They are peers: both are one action on the
     document.

     `auto-fill` with a floor sizes by CONTENT rather than by count, so a row of
     three and a row of six produce the same button. The floor is wide enough
     for "Guardar sesión" at the panel's minimum width without wrapping.
  */
  .file-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
    gap: 0.3rem;
  }

  /*
     A command, on the shell's own button language: hairline border, no fill
     until hover, accent on hover. These were raised blocks on a lighter
     surface, which is how this application draws a VALUE — so a column of file
     commands read as a column of read-outs.
  */
  .file-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 30px;
    padding: 0.35rem 0.5rem;
    background: none;
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    cursor: pointer;
    font-family: var(--st-sans);
    font-size: 0.75rem;
    text-align: center;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }

  .file-btn:hover:not(:disabled) {
    background: var(--st-surface-3);
    border-color: var(--st-hair-strong);
    color: var(--st-text);
  }

  .file-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* Section headings, matching every other heading in the right panel. */
  .proj-heading {
    font-family: var(--st-mono);
    font-size: 0.66rem;
    font-weight: 400;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: var(--st-text-2);
    /*
       Almost nothing below the rule. The block that follows is a flex child
       of a container with an 8 px gap, so this margin is added to that gap
       rather than collapsing into it — 0.4rem under a horizontal rule plus
       8 px of gap is what detached "IMPORTAR" from the heading it belongs to.
    */
    margin: 0.9rem 0 0.05rem;
    padding-bottom: 0.15rem;
    border-bottom: 1px solid var(--st-hair);
  }

  .proj-heading:first-child { margin-top: 0; }


  /* Examples brings its own headings, so it only needs the spacing. */
  .proj-block { margin: 0.9rem 0 0; }

  .file-btn:hover:not(:disabled) {
    background: var(--st-surface-3);
    color: white;
  }

  .file-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* ── Grouped exports ─────────────────────────────────────────────
     A label per group with its own "?", so the three kinds of export are
     told apart before the buttons are read rather than after.
     ─────────────────────────────────────────────────────────────── */
  /*
     Indented and railed, because "Resultados / Memoria / Vista" read as three
     more sections rather than as three kinds of export — they sat at the same
     margin as the heading above them, so nothing said they were inside it.
  */
  /*
     Indented and railed, because "Resultados / Memoria / Vista" read as three
     more sections rather than as three kinds of export. Eight pixels of
     indent was not enough to say so — the rail is the signal, so it is a
     visible one, and the group sits far enough in that the eye reads a
     level rather than a wobble.
  */
  .file-sub-group {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin: 0 0 0.4rem 0.75rem;
    padding-left: 0.55rem;
    border-left: 2px solid var(--st-hair-strong);
  }

  /* The label belongs to the rail, not to the buttons under it. */
  .file-sub-group .file-group-label {
    margin-left: -0.1rem;
  }

  .file-group-label {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--st-text-3);
  }

  .proj-help-btn {
    width: 16px;
    min-width: 16px;
    height: 16px;
    padding: 0;
    border: 1px solid var(--st-hair-strong);
    border-radius: 50%;
    background: var(--st-surface-2);
    color: var(--st-text-3);
    font-size: 0.6rem;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .proj-help-btn:hover,
  .proj-help-btn.active {
    border-color: var(--st-accent);
    color: var(--st-accent);
  }

  .proj-help-panel {
    margin: 0 0 0.4rem 0.8rem;
    padding: 0.4rem 0.5rem;
    border-left: 2px solid var(--st-accent);
    background: var(--st-surface-2);
    border-radius: 0 3px 3px 0;
    font-size: 0.66rem;
    line-height: 1.45;
    color: var(--st-text-2);
  }

  .proj-help-panel strong {
    display: block;
    margin-bottom: 0.15rem;
    color: var(--st-text);
  }

  .proj-help-panel p {
    margin: 0;
  }

  /*
     The first sub-header sits directly under the section title, so its usual
     breathing room reads as a gap rather than as separation — the group it
     labels looked detached from the heading it belongs to.
  */
  /*
     Directly under the section title. Its own top margin was already zero and
     the gap persisted, because the gap was never its: the heading carries
     0.4rem below its rule and the block adds its own. Pulling the first
     sub-header up by that much closes it without touching either rule.
  */
  .file-sub-header.file-sub-first {
    /*
       Pulls back the 8 px flex gap its container inherits from
       `.toolbar-section`. That gap is right BETWEEN sections and wrong
       directly under a heading the block belongs to, and it cannot be
       removed there without spacing every other section differently — so it
       is compensated here, where it applies to exactly one element.
    */
    margin-top: -0.55rem;
  }

  /* ── Save dialog ─────────────────────────────────────────────── */
  .save-dialog {
    margin: 0.4rem 0 0.2rem;
    padding: 0.5rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    background: var(--st-surface-2);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .save-title {
    margin: 0;
    font-size: 0.68rem;
    color: var(--st-text);
  }

  .save-opt {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    padding: 0.3rem;
    border: 1px solid transparent;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.66rem;
    line-height: 1.35;
  }

  .save-opt.on {
    border-color: var(--st-accent);
    background: var(--st-selected-bg);
  }

  .save-opt strong {
    display: block;
    color: var(--st-text);
    font-weight: 600;
  }

  .save-opt em {
    display: block;
    font-style: normal;
    color: var(--st-text-3);
  }

  .save-where {
    margin: 0;
    font-size: 0.6rem;
    color: var(--st-text-3);
  }

  .save-actions {
    display: flex;
    gap: 0.3rem;
    justify-content: flex-end;
  }

  .save-go {
    border-color: var(--st-accent);
    color: var(--st-accent);
  }

  .file-sub-header {
    /* Inline-flex so the "?" sits on the label rather than under it. */
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-family: var(--st-mono);
    font-size: 0.62rem;
    text-transform: uppercase;
    color: var(--st-text-3);
    letter-spacing: 0.09em;
    margin: 0.7rem 0 0.3rem;
  }

  .small-btn {
    padding: 0.1rem 0.4rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    background: var(--st-surface-2);
    color: var(--st-text);
    font-size: 0.7rem;
    cursor: pointer;
  }

  .small-btn:hover:not(:disabled) {
    background: var(--st-surface-3);
    color: white;
  }

  .small-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
