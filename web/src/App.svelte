<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Viewport from './components/Viewport.svelte';
  import Viewport3D from './components/Viewport3D.svelte';
  import Toolbar from './components/Toolbar.svelte';
  import PropertyPanel from './components/PropertyPanel.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import NodeEditor from './components/NodeEditor.svelte';
  import ElementEditor from './components/ElementEditor.svelte';
  import MaterialEditor from './components/MaterialEditor.svelte';
  import SectionEditor from './components/SectionEditor.svelte';
  import DataTable from './components/DataTable.svelte';
  import { modelStore, uiStore, resultsStore, dsmStepsStore, tabManager, historyStore } from './lib/store';
  import { t, i18n, setLocale } from './lib/i18n';
  import StepWizard from './components/dsm/StepWizard.svelte';
  import {
    loadFromLocalStorage, saveToLocalStorage, clearLocalStorage,
    downloadCanvasPNG,
  } from './lib/store/file';
  import { loadFromURLHash } from './lib/utils/url-sharing';
  import TemplateDialog from './components/TemplateDialog.svelte';
  import DxfImportDialog from './components/DxfImportDialog.svelte';
  import IfcImportDialog from './components/IfcImportDialog.svelte';
  import FloatingTools from './components/FloatingTools.svelte';
  import WhatIfPanel from './components/WhatIfPanel.svelte';
  import SectionStressPanel from './components/SectionStressPanel.svelte';
  import KinematicPanel from './components/KinematicPanel.svelte';
  import TabBar from './components/TabBar.svelte';
  import FeedbackWidget from './components/FeedbackWidget.svelte';
  import MobileResultsPanel from './components/MobileResultsPanel.svelte';
  import ProPanel from './components/pro/ProPanel.svelte';
  import EducativePanel from './components/edu/EducativePanel.svelte';
  import TourOverlay from './components/TourOverlay.svelte';
  import HelpOverlay from './components/HelpOverlay.svelte';
  import ContextMenu from './components/ContextMenu.svelte';
  import { tourStore } from './lib/store/tour.svelte';
  import { buildTourSteps } from './lib/tour/tour-steps';
  import { runLiveCalc, runGlobalSolve } from './lib/engine/live-calc';
  import LandingPage from './components/LandingPage.svelte';
  import { authStore } from './lib/store/auth.svelte';

  const isEmbedDemo = new URLSearchParams(location.search).has('embed');
  if (isEmbedDemo) authStore.setReady();
  const needsLogin = $derived(!authStore.ready && !isEmbedDemo);

  // ─── Per-mode model persistence ───
  // When switching between básico/edu/pro, save the current model and restore
  // the target mode's model (or start empty if first visit to that mode).
  import type { ModelSnapshot } from './lib/store/history.svelte';
  type AppMode = 'basico' | 'educativo' | 'pro';
  const modeSnapshots = new Map<AppMode, ModelSnapshot>();
  let currentAppMode: AppMode = 'basico';

  function switchAppMode(target: AppMode) {
    const prev = currentAppMode;
    if (target === prev) return;
    // Save current model into the mode we're leaving
    modeSnapshots.set(prev, modelStore.snapshot());
    // Clear results + UI state
    resultsStore.clear();
    resultsStore.showReactions = false;
    resultsStore.diagramType = 'none';
    historyStore.clear();
    // Restore target mode's model or start empty
    const saved = modeSnapshots.get(target);
    if (saved) {
      modelStore.restore(saved);
    } else {
      modelStore.clear();
    }
    // Set the actual analysis mode
    if (target === 'basico') {
      uiStore.analysisMode = '2d';
    } else if (target === 'educativo') {
      uiStore.analysisMode = 'edu';
    } else {
      uiStore.analysisMode = 'pro';
    }
    currentAppMode = target;
  }

  let showTemplateDialog = $state(false);
  let showDxfImport = $state(false);
  let dxfImportFile = $state<File | null>(null);
  let showIfcImport = $state(false);
  let ifcImportFile = $state<File | null>(null);
  let ifcFileInput: HTMLInputElement;
  let dxfFileInput: HTMLInputElement;

  // Derive showResults from whether results exist — no manual management needed
  const showResults = $derived(resultsStore.results !== null || resultsStore.results3D !== null);
  let showAutosaveBanner = $state(false);
  let showImportDialog = $state(false);
  let importText = $state('');
  let autosaveData = $state<ReturnType<typeof loadFromLocalStorage>>(null);
  let autosaveInterval: ReturnType<typeof setInterval> | null = null;

  // Keep <html lang> in sync with selected locale
  $effect(() => {
    document.documentElement.lang = t('file.htmlLang');
  });

  function restoreAutosave() {
    if (autosaveData) {
      modelStore.restore(autosaveData.snapshot);
      modelStore.model.name = autosaveData.name;
      resultsStore.clear();
    }
    showAutosaveBanner = false;
  }

  function discardAutosave() {
    clearLocalStorage();
    showAutosaveBanner = false;
  }


  function handleImportCoordinates() {
    const lines = importText.trim().split('\n').filter(l => l.trim());
    let created = 0;
    const nodeIds: number[] = [];
    for (const line of lines) {
      const parts = line.trim().split(/[,;\t\s]+/).map(Number);
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        const id = modelStore.addNode(parts[0], parts[1]);
        nodeIds.push(id);
        created++;
      }
    }
    // Auto-connect consecutive nodes if format has connectivity (3+ columns: x,y,connect)
    // or just create elements between consecutive pairs if requested
    if (created > 0) {
      uiStore.toast(t('app.nodesImported').replace('{n}', String(created)), 'success');
      resultsStore.clear();
    } else {
      uiStore.toast(t('app.noValidCoords'), 'error');
    }
    showImportDialog = false;
    importText = '';
  }

  function handleExportPNG() {
    const canvas = document.querySelector('.viewport-container canvas') as HTMLCanvasElement | null;
    if (canvas) downloadCanvasPNG(canvas);
  }

  onMount(() => {
    // Initialize WASM solver (non-blocking, fallback to JS if it fails)
    import('./lib/engine/wasm-solver').then(m => m.initSolver()).catch(() => {
      console.warn('WASM solver unavailable, using JS fallback');
    });

    // Initialize tab manager with current state
    tabManager.init();

    // Check for /demo path → launch guided tour
    const isDemoRoute = location.pathname === '/demo' || location.pathname === '/demo/';
    if (isDemoRoute) {
      history.replaceState(null, '', '/');
      setTimeout(() => tourStore.start(buildTourSteps()), 600);
    }

    // Check for URL hash (shared model link or embed)
    const hashMode = loadFromURLHash();
    if (hashMode === 'embed') {
      uiStore.embedMode = true;
    }
    // Auto zoom-to-fit when loading from shared link
    if (hashMode) {
      setTimeout(() => {
        const canvas = document.querySelector('.viewport-container canvas') as HTMLCanvasElement | null;
        if (canvas && modelStore.nodes.size > 0) {
          uiStore.zoomToFit(modelStore.nodes.values(), canvas.width, canvas.height);
        }
      }, 100);
      // Auto-solve if the shared link included _shareMeta.autoSolve
      if (uiStore.pendingSolveFromURL) {
        const pendingDiagram = uiStore.pendingSolveFromURL;
        uiStore.pendingSolveFromURL = null;
        setTimeout(() => {
          // Dispatch global solve event (same as clicking Calcular)
          window.dispatchEvent(new Event('dedaliano-solve'));
          // After solve completes, set the diagram type from the share link
          setTimeout(() => {
            if (resultsStore.results !== null || resultsStore.results3D !== null) {
              resultsStore.diagramType = pendingDiagram as any;
            }
          }, 200);
        }, 200);
      }
    }

    // Only check autosave if no URL hash was loaded
    if (!hashMode) {
      autosaveData = loadFromLocalStorage();
      if (autosaveData && autosaveData.snapshot.nodes.length > 0) {
        showAutosaveBanner = true;
      }
    }

    // Setup autosave every 30s
    autosaveInterval = setInterval(saveToLocalStorage, 30_000);

    // Mobile responsive: track window width
    uiStore.windowWidth = window.innerWidth;
    const onResize = () => { uiStore.windowWidth = window.innerWidth; };
    window.addEventListener('resize', onResize);

    // Listen for PNG export event from Toolbar
    window.addEventListener('dedaliano-export-png', handleExportPNG);
    const handleImportEvent = () => { showImportDialog = true; };
    window.addEventListener('dedaliano-import-coords', handleImportEvent);
    const handleTemplateEvent = () => { showTemplateDialog = true; };
    window.addEventListener('dedaliano-open-template', handleTemplateEvent);
    const handleDxfImportEvent = () => { dxfFileInput?.click(); };
    window.addEventListener('dedaliano-import-dxf', handleDxfImportEvent);
    const handleDxfDropEvent = (e: Event) => {
      const ce = e as CustomEvent<File>;
      dxfImportFile = ce.detail;
      showDxfImport = true;
    };
    window.addEventListener('dedaliano-dxf-drop', handleDxfDropEvent);
    const handleIfcImportEvent = () => { ifcFileInput?.click(); };
    window.addEventListener('dedaliano-import-ifc', handleIfcImportEvent);

    // Global solve event — always mounted (mobile bottom bar dispatches this)
    const handleGlobalSolve = () => runGlobalSolve();
    window.addEventListener('dedaliano-solve', handleGlobalSolve);

    return () => {
      if (autosaveInterval) clearInterval(autosaveInterval);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('dedaliano-export-png', handleExportPNG);
      window.removeEventListener('dedaliano-import-coords', handleImportEvent);
      window.removeEventListener('dedaliano-open-template', handleTemplateEvent);
      window.removeEventListener('dedaliano-import-dxf', handleDxfImportEvent);
      window.removeEventListener('dedaliano-dxf-drop', handleDxfDropEvent);
      window.removeEventListener('dedaliano-import-ifc', handleIfcImportEvent);
      window.removeEventListener('dedaliano-solve', handleGlobalSolve);
    };
  });

  // Reactive auto-clear results + live calculation on model changes
  let prevModelVersion = -1;
  let prevAnalysisMode = '';
  $effect(() => {
    const _v = modelStore.modelVersion;
    const _lc = uiStore.liveCalc;
    const _mode = uiStore.analysisMode;

    untrack(() => {
      if (tabManager.isTabSwitching) return;

      const modelChanged = _v !== prevModelVersion || _mode !== prevAnalysisMode;
      prevModelVersion = _v;
      prevAnalysisMode = _mode;

      const prevDiagram = resultsStore.diagramType;
      uiStore.liveCalcError = null;

      // Only clear stale results when model or mode actually changed
      if (modelChanged) {
        if (resultsStore.results || resultsStore.results3D) {
          resultsStore.clear();
        }
      }

      // If live calc is ON, auto-solve (skip in PRO/EDU mode — manual solve only)
      if (_lc && _mode !== 'pro' && _mode !== 'edu') {
        runLiveCalc(_mode, uiStore.axisConvention3D, prevDiagram);
      }
    });
  });
</script>

{#if needsLogin}
  <LandingPage />
{/if}

<div class="app-container" class:embed-mode={uiStore.embedMode} class:hidden-behind-login={needsLogin}>
  <header class="app-header">
    <div class="logo">
      <span class="logo-icon">△</span>
      <span class="logo-text">Dedaliano</span>
      <div class="mode-toggle" data-tour="mode-toggle">
        <button class:active={uiStore.appMode === 'basico'} onclick={() => switchAppMode('basico')}>
          {t('app.modeBasic')}
        </button>
        <button class:active={uiStore.appMode === 'educativo'} class="edu-mode-btn" onclick={() => switchAppMode('educativo')}>{t('app.modeEdu')}<span class="demo-badge">DEMO</span></button>
        <button class:active={uiStore.appMode === 'pro'} class="pro-mode-btn" onclick={() => switchAppMode('pro')}>{t('app.modePro')}<span class="demo-badge">DEMO</span></button>
      </div>
    </div>
    <span class="separator">|</span>
    <TabBar />
    <div class="header-actions">
      <button class="btn btn-help" onclick={() => uiStore.showHelp = true} title={t('app.keyboardShortcuts')}>
        ?
      </button>
      <select class="lang-select" value={i18n.locale} onchange={(e) => { setLocale((e.currentTarget as HTMLSelectElement).value); tabManager.updateDefaultNames(); }}>
        <option value="es">{t('lang.es')}</option>
        <option value="en">{t('lang.en')}</option>
        <option value="pt">{t('lang.pt')}</option>
        <option value="de">{t('lang.de')}</option>
        <option value="fr">{t('lang.fr')}</option>
        <option value="it">{t('lang.it')}</option>
        <option value="tr">{t('lang.tr')}</option>
        <option value="hi">{t('lang.hi')}</option>
        <option value="zh">{t('lang.zh')}</option>
        <option value="ja">{t('lang.ja')}</option>
        <option value="ko">{t('lang.ko')}</option>
        <option value="ru">{t('lang.ru')}</option>
        <option value="ar">{t('lang.ar')}</option>
        <option value="id">{t('lang.id')}</option>
      </select>
      {#if authStore.isLoggedIn}
        <button class="btn-user" onclick={() => authStore.logout()} title={t('auth.logout')}>
          {#if authStore.user?.picture}
            <img src={authStore.user.picture} alt="" class="user-avatar" referrerpolicy="no-referrer" />
          {:else}
            <span class="user-initial">{authStore.user?.name?.[0] ?? '?'}</span>
          {/if}
        </button>
      {/if}
    </div>
  </header>

  {#if showAutosaveBanner}
    <div class="autosave-banner">
      <span>{t('app.autosaveFound')} <strong>{autosaveData?.name}</strong></span>
      <button class="banner-btn restore" onclick={restoreAutosave}>{t('app.restore')}</button>
      <button class="banner-btn discard" onclick={discardAutosave}>{t('app.discard')}</button>
    </div>
  {/if}

  <div class="app-body">
    {#if uiStore.appMode === 'basico'}
      {#if !uiStore.isMobile}
        {#if uiStore.leftSidebarOpen}
          <aside class="sidebar left">
            <Toolbar />
          </aside>
        {/if}
        <button class="sidebar-toggle-btn left-toggle" class:sidebar-closed={!uiStore.leftSidebarOpen} onclick={() => uiStore.leftSidebarOpen = !uiStore.leftSidebarOpen} title={uiStore.leftSidebarOpen ? t('app.hideLeftPanel') : t('app.showLeftPanel')}>
          {uiStore.leftSidebarOpen ? '◂' : '▸'}
        </button>
      {/if}
    {/if}

    <div class="main-area">
      <main class="viewport-container">
        {#if uiStore.analysisMode === '2d' || uiStore.analysisMode === 'edu'}
          <Viewport showResults={uiStore.analysisMode === '2d' && showResults} />
        {:else}
          <Viewport3D />
        {/if}
        {#if uiStore.appMode === 'basico'}
          <FloatingTools />
        {/if}
        <WhatIfPanel />
        <SectionStressPanel />
        <KinematicPanel />
        <MobileResultsPanel />
      </main>
    </div>

    {#if !uiStore.isMobile}
      {#if uiStore.appMode === 'pro'}
        <aside class="sidebar right pro-sidebar">
          <ProPanel />
        </aside>
      {:else if uiStore.appMode === 'educativo'}
        <aside class="sidebar right edu-sidebar">
          <EducativePanel />
        </aside>
      {:else}
        <button class="sidebar-toggle-btn right-toggle" class:sidebar-closed={!uiStore.rightSidebarOpen} onclick={() => uiStore.rightSidebarOpen = !uiStore.rightSidebarOpen} title={uiStore.rightSidebarOpen ? t('app.hideRightPanel') : t('app.showRightPanel')}>
          {uiStore.rightSidebarOpen ? '▸' : '◂'}
        </button>
        {#if uiStore.rightSidebarOpen}
          <aside class="sidebar right" data-tour="right-sidebar" class:wizard-open={dsmStepsStore.isOpen}>
            {#if dsmStepsStore.isOpen}
              <StepWizard />
            {:else}
              <button class="datatable-toggle" onclick={() => uiStore.showDataTable = !uiStore.showDataTable}>
                {uiStore.showDataTable ? '▾' : '▸'} {t('app.modelData')}
              </button>
              {#if uiStore.showDataTable}
                <div class="data-table-sidebar">
                  <DataTable />
                </div>
              {/if}
            {/if}
          </aside>
        {/if}
      {/if}
    {/if}
  </div>

  {#if !uiStore.isMobile}
    <footer class="app-footer">
      <StatusBar />
    </footer>
  {/if}

  <!-- Mobile drawers (overlay on top of canvas) -->
  {#if uiStore.isMobile && uiStore.leftDrawerOpen && uiStore.appMode === 'basico'}
    <div class="drawer-backdrop" onclick={() => uiStore.leftDrawerOpen = false}></div>
    <aside class="drawer drawer-left">
      <Toolbar />
    </aside>
  {/if}
  {#if uiStore.isMobile && uiStore.rightDrawerOpen}
    <div class="drawer-backdrop" onclick={() => uiStore.rightDrawerOpen = false}></div>
    <aside class="drawer drawer-right" data-tour="right-sidebar">
      {#if dsmStepsStore.isOpen}
        <StepWizard />
      {:else}
        <PropertyPanel {showResults} />
        <button class="datatable-toggle" onclick={() => uiStore.showDataTable = !uiStore.showDataTable}>
          {uiStore.showDataTable ? '▾' : '▸'} {t('app.modelData')}
        </button>
        {#if uiStore.showDataTable}
          <div class="data-table-sidebar">
            <DataTable />
          </div>
        {/if}
      {/if}
    </aside>
  {/if}

  <!-- Mobile bottom bar -->
  {#if uiStore.isMobile}
    <nav class="mobile-bottom-bar">
      <button class="mobile-bar-btn" onclick={() => uiStore.leftDrawerOpen = !uiStore.leftDrawerOpen} title={t('app.tools')}>
        ☰
      </button>
      <button class="mobile-bar-btn" onclick={() => uiStore.rightDrawerOpen = !uiStore.rightDrawerOpen} title={t('app.properties')}>
        ⚙
      </button>
    </nav>
  {/if}
</div>

<!-- Inline editors (positioned fixed, rendered outside layout) -->
<NodeEditor />
<ElementEditor />
<MaterialEditor />
<SectionEditor />

{#if uiStore.toasts.length > 0}
  <div class="toast-container">
    {#each uiStore.toasts as toast}
      <div class="toast toast-{toast.type}">
        <span>{toast.message}</span>
        {#if toast.actionId === 'kinematic'}
          <button class="toast-action" onclick={() => { uiStore.showKinematicPanel = true; const idx = uiStore.toasts.findIndex(tt => tt.id === toast.id); if (idx >= 0) uiStore.toasts.splice(idx, 1); }}>
            {t('app.viewKinematic')}
          </button>
        {/if}
      </div>
    {/each}
  </div>
{/if}

{#if uiStore.liveCalcError}
  <div class="live-calc-error">
    <span class="live-calc-error-msg">{uiStore.liveCalcError}</span>
    <span class="live-calc-error-actions">
      <button onclick={() => { uiStore.liveCalc = false; uiStore.liveCalcError = null; uiStore.toast(t('app.liveCalcDisabledMsg'), 'info'); }}>{t('app.disableLiveCalc')}</button>
      <span class="live-calc-error-sep">·</span>
      <button onclick={() => { historyStore.undo(); }}>{t('app.undoLastAction')}</button>
    </span>
  </div>
{/if}

<ContextMenu />

<HelpOverlay />

<TemplateDialog open={showTemplateDialog} onclose={() => showTemplateDialog = false} />

<DxfImportDialog
  open={showDxfImport}
  file={dxfImportFile}
  onclose={() => { showDxfImport = false; dxfImportFile = null; }}
/>
<input
  bind:this={dxfFileInput}
  type="file"
  accept=".dxf"
  style="display:none"
  onchange={(e) => {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (f) { dxfImportFile = f; showDxfImport = true; }
    (e.currentTarget as HTMLInputElement).value = '';
  }}
/>
<IfcImportDialog
  open={showIfcImport}
  file={ifcImportFile}
  onclose={() => { showIfcImport = false; ifcImportFile = null; }}
/>
<input
  bind:this={ifcFileInput}
  type="file"
  accept=".ifc"
  style="display:none"
  onchange={(e) => {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (f) { ifcImportFile = f; showIfcImport = true; }
    (e.currentTarget as HTMLInputElement).value = '';
  }}
/>

{#if showImportDialog}
  <div class="help-overlay" role="dialog" aria-label={t('app.importCoordinates')}>
    <div class="help-backdrop" onclick={() => showImportDialog = false}></div>
    <div class="help-content" style="max-width: 500px">
      <div class="help-header">
        <h2>{t('app.importCoordinates')}</h2>
        <button class="help-close" onclick={() => showImportDialog = false}>✕</button>
      </div>
      <p style="font-size: 0.85rem; color: #aaa; margin: 0.5rem 0">
        {t('app.importCoordDesc')}
      </p>
      <textarea
        class="import-textarea"
        placeholder="0, 0&#10;5, 0&#10;10, 0&#10;5, 3"
        bind:value={importText}
        rows="10"
      ></textarea>
      <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem">
        <button class="btn btn-primary" onclick={handleImportCoordinates}>{t('app.import')}</button>
        <button class="btn btn-secondary" onclick={() => showImportDialog = false}>{t('app.cancel')}</button>
      </div>
    </div>
  </div>
{/if}

{#if !uiStore.embedMode}
  <!-- FeedbackWidget disabled — will be reimplemented professionally -->
  <!-- <FeedbackWidget /> -->
{/if}

<TourOverlay />

<style>
  .import-textarea {
    width: 100%;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #eee;
    font-family: monospace;
    font-size: 0.85rem;
    padding: 0.5rem;
    resize: vertical;
  }

  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    background: #1a1a2e;
    color: #eee;
  }

  .app-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 1rem;
    background: #16213e;
    border-bottom: 1px solid #0f3460;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .logo-icon {
    font-size: 1.5rem;
    color: #e94560;
  }

  .logo-text {
    font-size: 1.25rem;
    font-weight: 600;
    letter-spacing: 0.05em;
  }

  .separator {
    color: #444;
    font-size: 1.25rem;
    margin: 0 0.25rem;
  }

  .mode-toggle {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0;
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid #334;
    margin-left: 0.25rem;
    min-width: 180px;
  }

  .mode-toggle button {
    background: transparent;
    border: none;
    color: #888;
    font-size: 0.68rem;
    font-weight: 600;
    padding: 0.2rem 0.35rem;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    letter-spacing: 0.03em;
    text-align: center;
    white-space: nowrap;
  }

  .mode-toggle button:hover {
    background: #1a2a4a;
    color: #ccc;
  }

  .mode-toggle button.active {
    background: #e94560;
    color: white;
  }

  .mode-toggle button.edu-mode-btn {
    background: linear-gradient(135deg, #1a1a3a, #0f1a30);
    color: #4ecdc4;
    border-left: 1px solid #334;
  }

  .mode-toggle button.edu-mode-btn.active {
    background: linear-gradient(135deg, #2a8a7a, #1a6a5a);
    color: white;
  }

  .mode-toggle button.pro-mode-btn {
    background: linear-gradient(135deg, #1a1a3a, #0f1a30);
    color: #f0a500;
    border-left: 1px solid #334;
  }

  .mode-toggle button.pro-mode-btn.active {
    background: linear-gradient(135deg, #e94560, #c73e54);
    color: white;
  }

  .demo-badge {
    font-size: 0.45rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    background: rgba(255,255,255,0.15);
    color: rgba(255,255,255,0.7);
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
    margin-left: 0.3rem;
    vertical-align: middle;
  }

  .mode-toggle button.active .demo-badge {
    background: rgba(255,255,255,0.2);
    color: rgba(255,255,255,0.85);
  }

  .pro-sidebar {
    width: 540px;
    min-width: 540px;
    max-width: 540px;
  }

  .edu-sidebar {
    width: 420px;
    min-width: 420px;
    max-width: 420px;
  }

  .project-name {
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: #aaa;
    font-size: 1rem;
    padding: 0.2rem 0.4rem;
    width: 200px;
    transition: all 0.2s;
  }

  .project-name:hover {
    border-color: #333;
  }

  .project-name:focus {
    outline: none;
    border-color: #e94560;
    color: #eee;
    background: #0f3460;
  }

  .autosave-banner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 0.5rem 1rem;
    background: #2a1a3e;
    border-bottom: 1px solid #4a2a6e;
    font-size: 0.875rem;
    color: #ddd;
  }

  .banner-btn {
    padding: 0.3rem 0.8rem;
    border: none;
    border-radius: 4px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .banner-btn.restore {
    background: #e94560;
    color: white;
  }

  .banner-btn.restore:hover {
    background: #ff6b6b;
  }

  .banner-btn.discard {
    background: #333;
    color: #aaa;
  }

  .banner-btn.discard:hover {
    background: #444;
    color: white;
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.2s;
  }

  .btn-primary {
    background: #e94560;
    color: white;
  }

  .btn-primary:hover {
    background: #ff6b6b;
  }

  .btn-secondary {
    background: #0f3460;
    color: #eee;
  }

  .btn-secondary:hover {
    background: #1a4a7a;
  }

  .btn-help {
    background: transparent;
    border: 1px solid #555;
    color: #888;
    width: 32px;
    height: 32px;
    padding: 0;
    font-size: 1rem;
    font-weight: 600;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-help:hover {
    border-color: #4ecdc4;
    color: #4ecdc4;
  }

  .lang-select {
    background: transparent;
    border: 1px solid #555;
    border-radius: 4px;
    color: #aaa;
    font-size: 0.75rem;
    padding: 0.2rem 0.3rem;
    cursor: pointer;
    height: 32px;
  }
  .lang-select:hover {
    border-color: #4ecdc4;
    color: #4ecdc4;
  }
  .lang-select option {
    background: #16213e;
    color: #eee;
  }

  .hidden-behind-login {
    pointer-events: none;
    filter: blur(4px);
    opacity: 0.3;
  }

  .btn-user {
    background: transparent;
    border: 1px solid #555;
    border-radius: 50%;
    width: 32px;
    height: 32px;
    padding: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    transition: border-color 0.2s;
  }
  .btn-user:hover {
    border-color: #e94560;
  }
  .user-avatar {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  }
  .user-initial {
    color: #aaa;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .btn-toggle {
    background: transparent;
    border: 1px solid #555;
    color: #666;
    height: 32px;
    padding: 0 0.5rem;
    font-size: 0.75rem;
    font-weight: 700;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-toggle:hover {
    border-color: #4ecdc4;
    color: #4ecdc4;
  }

  .btn-toggle.active {
    background: #1a4a7a;
    border-color: #4ecdc4;
    color: #4ecdc4;
  }

  .app-body {
    display: flex;
    flex: 1;
    overflow: hidden;
    position: relative;
  }

  .sidebar {
    width: 250px;
    background: #16213e;
    border-right: 1px solid #0f3460;
    overflow-y: auto;
  }

  .sidebar.right {
    width: 340px;
    border-right: none;
    border-left: 1px solid #0f3460;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: width 0.25s ease;
  }

  .sidebar.right.wizard-open {
    width: min(700px, 50vw);
  }

  .data-table-sidebar {
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  .sidebar-toggle-btn {
    position: absolute;
    z-index: 20;
    background: #16213e;
    border: 1px solid #0f3460;
    color: #888;
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0.6rem 0.2rem;
    transition: all 0.2s;
  }
  .sidebar-toggle-btn:hover {
    background: #1a1a2e;
    color: #4ecdc4;
    border-color: #4ecdc4;
  }
  .left-toggle {
    top: 50%;
    left: 250px;
    transform: translateY(-50%);
    border-radius: 0 4px 4px 0;
    border-left: none;
  }
  .left-toggle.sidebar-closed {
    left: 0;
  }

  .right-toggle {
    top: 50%;
    right: 340px;
    transform: translateY(-50%);
    border-radius: 4px 0 0 4px;
    border-right: none;
  }
  .right-toggle.sidebar-closed {
    right: 0;
  }

  .datatable-toggle {
    width: 100%;
    padding: 0.35rem 0.5rem;
    background: #12192e;
    border: none;
    border-bottom: 1px solid #0f3460;
    color: #aaa;
    cursor: pointer;
    font-size: 0.7rem;
    font-weight: 600;
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    transition: all 0.2s;
    flex-shrink: 0;
  }
  .datatable-toggle:hover {
    background: #1a1a2e;
    color: #ccc;
  }

  .main-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .viewport-container {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .app-footer {
    background: #16213e;
    border-top: 1px solid #0f3460;
  }

  /* Toast notifications */
  .toast-container {
    position: fixed;
    top: 60px;
    right: 270px;
    z-index: 1100;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .toast {
    padding: 0.6rem 1rem;
    border-radius: 6px;
    font-size: 0.85rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    animation: toast-in 0.3s ease;
    max-width: 350px;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .toast-action {
    align-self: flex-end;
    background: none;
    border: 1px solid #4ecdc4;
    color: #4ecdc4;
    padding: 0.25rem 0.6rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .toast-action:hover {
    background: #4ecdc4;
    color: #0a1628;
  }

  .toast-success {
    background: #1a3a2a;
    border: 1px solid #4caf50;
    color: #4caf50;
  }

  .toast-error {
    background: #3a1a1a;
    border: 1px solid #e94560;
    color: #ff6b6b;
  }

  .toast-info {
    background: #1a2a3a;
    border: 1px solid #4ecdc4;
    color: #4ecdc4;
  }

  @keyframes toast-in {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* Help overlay (shared with Import Coordinates dialog) */
  .help-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .help-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
  }

  .help-content {
    position: relative;
    background: #16213e;
    border: 1px solid #0f3460;
    border-radius: 8px;
    padding: 1.5rem 2rem;
    max-width: 600px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  }

  .help-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .help-header h2 {
    font-size: 1.1rem;
    color: #4ecdc4;
    margin: 0;
  }

  .help-close {
    background: none;
    border: none;
    color: #888;
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0.25rem;
  }

  .help-close:hover {
    color: #eee;
  }

  /* Embed mode: hide everything except viewport */
  .embed-mode .app-header,
  .embed-mode .app-footer,
  .embed-mode .sidebar {
    display: none !important;
  }

  .embed-mode .app-body {
    height: 100vh;
  }

  :global(.edu-tooltip) {
    position: absolute;
    z-index: 10000;
    background: #2a2a4e;
    border: 1px solid #4ecdc4;
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    max-width: 250px;
    font-size: 0.78rem;
    line-height: 1.4;
    color: #ddd;
    pointer-events: none;
    animation: tooltip-fade-in 0.15s ease;
  }

  :global(.edu-tooltip strong) {
    color: #4ecdc4;
    display: block;
    margin-bottom: 0.25rem;
    font-size: 0.82rem;
  }

  :global(.edu-tooltip span) {
    color: #bbb;
  }

  @keyframes tooltip-fade-in {
    from { opacity: 0; transform: translateX(-4px); }
    to { opacity: 1; transform: translateX(0); }
  }

  /* ===== Mobile Drawers ===== */
  .drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 200;
  }

  .drawer {
    position: fixed;
    top: 0;
    bottom: 0;
    width: min(85vw, 320px);
    background: #16213e;
    z-index: 201;
    overflow-y: auto;
    box-shadow: 4px 0 16px rgba(0, 0, 0, 0.4);
    animation: drawer-slide-in 0.25s ease;
  }

  .drawer-left {
    left: 0;
  }

  /* During tour: add bottom padding so user can scroll drawer content above the tour card */
  :global(body.tour-active) .drawer {
    padding-bottom: 55vh;
  }

  .drawer-right {
    right: 0;
    display: flex;
    flex-direction: column;
  }

  @keyframes drawer-slide-in {
    from { transform: translateX(-100%); }
    to { transform: translateX(0); }
  }

  .drawer-right {
    animation-name: drawer-slide-in-right;
  }

  @keyframes drawer-slide-in-right {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  /* Fix issue #14: PropertyPanel inside mobile drawer should not constrain its own height.
     The drawer itself handles scrolling, so PropertyPanel should flow naturally. */
  .drawer-right :global(.panel) {
    max-height: none;
    overflow-y: visible;
  }

  /* ===== Mobile Bottom Bar ===== */
  .mobile-bottom-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 100;
    display: flex;
    justify-content: space-around;
    align-items: center;
    background: #16213e;
    border-top: 1px solid #0f3460;
    padding: 8px 8px;
    padding-bottom: max(8px, env(safe-area-inset-bottom));
    gap: 8px;
  }

  .mobile-bar-btn {
    background: #0f3460;
    border: 1px solid #1a4a7a;
    color: #ccc;
    width: 44px;
    height: 44px;
    border-radius: 8px;
    font-size: 1.2rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }

  .mobile-bar-btn:active {
    background: #1a4a7a;
    color: white;
  }

  /* ===== Mobile Responsive ===== */
  @media (max-width: 767px) {
    .sidebar {
      display: none !important;
    }
    .sidebar-toggle-btn {
      display: none !important;
    }

    .app-footer {
      display: none !important;
    }

    .app-body {
      padding-bottom: 60px;
    }

    .app-header {
      padding: 0.3rem 0.5rem;
    }

    .header-actions .btn-help,
    .header-actions .btn-toggle {
      display: none;
    }

    .project-name {
      max-width: 120px;
      font-size: 0.75rem;
    }

    .logo-text {
      font-size: 0.9rem;
    }

    .logo-icon {
      font-size: 1.1rem;
    }

    .separator {
      font-size: 1rem;
      margin: 0 0.15rem;
    }

    .toast-container {
      right: 10px;
      left: 10px;
      top: 50px;
    }

    .toast {
      max-width: 100%;
    }

    .help-content {
      padding: 1rem;
      max-width: 95%;
    }
  }

  .live-calc-error {
    position: fixed;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(220, 38, 38, 0.95);
    color: white;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 0.75rem;
    z-index: 9000;
    max-width: 90vw;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: center;
  }
  .live-calc-error-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .live-calc-error-actions button {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.85);
    cursor: pointer;
    font-size: 0.7rem;
    text-decoration: underline;
    padding: 0;
  }
  .live-calc-error-actions button:hover {
    color: white;
  }
  .live-calc-error-sep {
    color: rgba(255, 255, 255, 0.5);
    font-size: 0.7rem;
  }
</style>
