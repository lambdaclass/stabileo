<script lang="ts">
  import { uiStore, resultsStore, tabManager } from '../../lib/store';
  import { saveProject, loadFile, saveSession, downloadResultsCSV, downloadDXF, downloadSVG, downloadExcel, isMode3D } from '../../lib/store/file';
  import { generateShareURL, loadFromShareLink, MAX_URL_SAFE } from '../../lib/utils/url-sharing';
  import { t } from '../../lib/i18n';
  import ToolbarExamples from './ToolbarExamples.svelte';
  import DemoMenu from '../DemoMenu.svelte';
  import CalcReportDialog from '../CalcReportDialog.svelte';

  let fileInput: HTMLInputElement;
  let showCalcReport = $state(false);

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

  async function handlePasteShareLink() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.includes('#data=') && !text.includes('#embed=')) {
        uiStore.toast(t('project.noLinkFound'), 'error');
        return;
      }
      // Create a new tab and load the shared model into it
      tabManager.createTab();
      const ok = loadFromShareLink(text);
      if (!ok) {
        uiStore.toast(t('project.invalidLink'), 'error');
        return;
      }
      // Sync tab name with the restored model name
      tabManager.syncActiveTabName();
      uiStore.toast(t('project.linkLoadedNewTab'), 'success');
    } catch {
      uiStore.toast(t('project.clipboardError'), 'error');
    }
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
  <!--
    The phone's way into Settings.
    ─────────────────────────────
    The Settings button lives in the header and the header hides it below
    768 px, so on a phone the panel had no opener at all — and the language
    selector had already been MOVED into it for exactly that width, which put
    it in a room with no door. Control size joined it later.

    Project is the phone's app menu: it already holds the file commands, the
    examples and the walkthroughs, and it is one tap away on the row. Settings
    goes here rather than into the row itself, which has nine controls and room
    for nine — and a preference you set once should not take a permanent slot
    from a command you use every minute.
  -->
  {#if uiStore.isMobile}
    <button
      class="file-btn proj-settings"
      onclick={() => window.dispatchEvent(new CustomEvent('stabileo-open-panel', { detail: 'settings' }))}
      data-testid="proj-open-settings"
    >{t('ribbon.settings')}</button>
  {/if}
  {#if flat}<h4 class="proj-heading">{t('project.fileSection')}</h4>{/if}
  <div class="file-grid">
    <button class="file-btn" onclick={saveProject} title={t('project.saveTabTooltip')}>
      {t('project.saveTab')}
    </button>
    <button class="file-btn" onclick={saveSession} title={t('project.saveSessionTooltip')}>
      {t('project.saveSession')}
    </button>
    <button class="file-btn" onclick={() => fileInput?.click()} title={t('project.openTooltip')}>
      {t('project.open')}
    </button>
  </div>
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
    <h4 class="proj-heading">{t('project.exportImport')}</h4>
  {:else}
    <button class="sub-section-toggle" onclick={() => showProjectExtras = !showProjectExtras}>
      {showProjectExtras ? '▾' : '▸'} {t('project.exportImport')}
    </button>
  {/if}
  {#if flat || showProjectExtras}
    <div class="sub-section-content">
      <span class="file-sub-header">{t('project.export')}</span>
      <div class="file-grid">
        <button
          class="file-btn"
          onclick={downloadExcel}
          title={t('project.exportExcelTooltip')}
        >
          Excel
        </button>
        <button class="file-btn" onclick={() => showCalcReport = true} title={t('project.exportPdfTooltip')}>
          PDF
        </button>
        <button class="file-btn" onclick={downloadDXF} disabled={isMode3D(uiStore.analysisMode)} title={isMode3D(uiStore.analysisMode) ? t('project.inDev3d') : t('project.exportDxfTooltip')}>
          DXF
        </button>
        <button class="file-btn" onclick={downloadSVG} disabled={isMode3D(uiStore.analysisMode)} title={isMode3D(uiStore.analysisMode) ? t('project.inDev3d') : t('project.exportSvgTooltip')}>
          SVG
        </button>
        <button class="file-btn" onclick={handleExportPNG} title={t('project.exportPngTooltip')}>
          PNG
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
      <span class="file-sub-header">{t('project.importLabel')}</span>
      <div class="file-grid">
        <button class="file-btn" onclick={() => fileInput?.click()} title={t('project.openDedTooltip')}>
          {t('project.openDed')}
        </button>
        <button class="file-btn" onclick={() => window.dispatchEvent(new Event('stabileo-import-dxf'))} title={isMode3D(uiStore.analysisMode) ? t('project.openDxfCadTooltip') : t('project.openDxfTooltip')}>
          {t('project.openDxf')}
        </button>
        <button class="file-btn" onclick={() => window.dispatchEvent(new Event('stabileo-import-ifc'))} title={t('project.openIfcTooltip')}>
          {t('project.openIfc')}
        </button>
        <button class="file-btn" onclick={() => window.dispatchEvent(new Event('stabileo-import-coords'))} title={t('project.pasteCoordsTooltip')}>
          {t('project.pasteCoords')}
        </button>
      </div>
      <span class="file-sub-header">{t('project.share')}</span>
      <div class="file-grid">
        <button class="file-btn" onclick={handleCopyShareLink} title={t('project.copyLinkTooltip')}>
          {t('project.copyLink')}
        </button>
        <button class="file-btn" onclick={handlePasteShareLink} title={t('project.pasteLinkTooltip')}>
          {t('project.pasteLink')}
        </button>
      </div>
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

<CalcReportDialog bind:open={showCalcReport} />

<style>
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
    margin: 0.9rem 0 0.4rem;
    padding-bottom: 0.15rem;
    border-bottom: 1px solid var(--st-hair);
  }

  .proj-heading:first-child { margin-top: 0; }

  /*
     Full width and first, because it is the only way into Settings on a phone
     and a reader looking for the language or the control size has no other
     place to try. A 44 px target: it is a phone-only control, so it is sized
     for the only pointer that can ever reach it.
  */
  .proj-settings {
    width: 100%;
    min-height: 44px;
    margin-bottom: 0.6rem;
  }

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

  .file-sub-header {
    display: block;
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
