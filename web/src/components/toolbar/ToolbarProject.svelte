<script lang="ts">
  import { uiStore, resultsStore, modelStore, tabManager } from '../../lib/store';
  import { saveProject, loadProject, loadFile, saveSession, downloadResultsCSV, downloadDXF, downloadSVG, downloadExcel, openPDFReport } from '../../lib/store/file';
  import { generateShareURL, loadFromShareLink, MAX_URL_SAFE } from '../../lib/utils/url-sharing';
  import { t } from '../../lib/i18n';

  let fileInput: HTMLInputElement;

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

  function handleNew() {
    tabManager.createTab();
  }

  async function handleLoadFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const result = await loadFile(file);
      if (result.type === 'session') {
        uiStore.showToast(t('project.sessionRestored').replace('{n}', String(result.count)), 'success');
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
</script>

<div class="toolbar-section" data-tour="project-section">
  <button class="section-toggle" onclick={() => showProject = !showProject}>
    {showProject ? '▾' : '▸'} {t('project.title')}
  </button>
  {#if showProject}
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
  <button class="sub-section-toggle" onclick={() => showProjectExtras = !showProjectExtras}>
    {showProjectExtras ? '▾' : '▸'} {t('project.exportImport')}
  </button>
  {#if showProjectExtras}
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
        <button class="file-btn" onclick={openPDFReport} title={t('project.exportPdfTooltip')}>
          PDF
        </button>
        <button class="file-btn" onclick={downloadDXF} disabled={uiStore.analysisMode === '3d'} title={uiStore.analysisMode === '3d' ? t('project.inDev3d') : t('project.exportDxfTooltip')}>
          DXF
        </button>
        <button class="file-btn" onclick={downloadSVG} disabled={uiStore.analysisMode === '3d'} title={uiStore.analysisMode === '3d' ? t('project.inDev3d') : t('project.exportSvgTooltip')}>
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
        <button class="file-btn" onclick={() => window.dispatchEvent(new Event('stabileo-import-dxf'))} disabled={uiStore.analysisMode === '3d'} title={uiStore.analysisMode === '3d' ? t('project.inDev3d') : t('project.openDxfTooltip')}>
          {t('project.openDxf')}
        </button>
        <button class="file-btn" onclick={() => window.dispatchEvent(new Event('stabileo-import-ifc'))} title={t('project.openIfcTooltip')}>
          {t('project.openIfc')}
        </button>
        <button class="file-btn" onclick={() => window.dispatchEvent(new Event('stabileo-import-coords'))} title={t('project.pasteCoordsTooltip')}>
          {t('project.pasteCoords')}
        </button>
        <button class="file-btn" onclick={() => window.dispatchEvent(new Event('stabileo-open-template'))} title={t('project.generatorTooltip')}>
          {t('project.generator')}
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

<input
  bind:this={fileInput}
  type="file"
  accept=".ded,.json"
  style="display:none"
  onchange={handleLoadFile}
/>

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
    border: 1px solid #333;
    border-radius: 4px;
    color: #aaa;
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 600;
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    transition: all 0.2s;
  }

  .section-toggle:hover {
    background: #1a1a2e;
    color: #ccc;
    border-color: #555;
  }

  .sub-section-toggle {
    width: 100%;
    padding: 0.25rem 0.4rem;
    background: none;
    border: 1px solid #2a2a3a;
    border-radius: 3px;
    color: #777;
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
    background: #1a1a2e;
    color: #aaa;
    border-color: #444;
  }

  .sub-section-content {
    margin-left: 0.25rem;
    padding-left: 0.4rem;
    border-left: 2px solid #2a2a3a;
  }

  .file-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.25rem;
  }

  .file-btn {
    padding: 0.35rem 0.4rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #ccc;
    cursor: pointer;
    font-size: 0.75rem;
    text-align: center;
    transition: all 0.2s;
  }

  .file-btn:hover:not(:disabled) {
    background: #1a4a7a;
    color: white;
  }

  .file-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .file-sub-header {
    font-size: 0.65rem;
    text-transform: uppercase;
    color: #666;
    letter-spacing: 0.05em;
    margin-top: 0.25rem;
  }

  .small-btn {
    padding: 0.1rem 0.4rem;
    border: 1px solid #555;
    border-radius: 3px;
    background: #2a2a2a;
    color: #ccc;
    font-size: 0.7rem;
    cursor: pointer;
  }

  .small-btn:hover:not(:disabled) {
    background: #3a3a3a;
    color: white;
  }

  .small-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
