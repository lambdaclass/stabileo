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
    loadWorkspaceFromLocalStorage, saveWorkspaceToLocalStorage,
    downloadCanvasPNG,
  } from './lib/store/file';
  import { loadFromURLHash } from './lib/utils/url-sharing';
  import DxfImportDialog from './components/DxfImportDialog.svelte';
  import IfcImportDialog from './components/IfcImportDialog.svelte';
  import FloatingTools from './components/FloatingTools.svelte';
  import WhatIfPanel from './components/WhatIfPanel.svelte';
  import SectionStressPanel from './components/SectionStressPanel.svelte';
  import KinematicPanel from './components/KinematicPanel.svelte';
  import TabBar from './components/TabBar.svelte';
  import MobileResultsPanel from './components/MobileResultsPanel.svelte';
  import ProPanel from './components/pro/ProPanel.svelte';
  import ToolbarConfig from './components/toolbar/ToolbarConfig.svelte';
  import EducativePanel from './components/edu/EducativePanel.svelte';
  import TourOverlay from './components/TourOverlay.svelte';
  import HelpOverlay from './components/HelpOverlay.svelte';
  import ContextMenu from './components/ContextMenu.svelte';
  import { tourStore } from './lib/store/tour.svelte';
  import { buildTourSteps } from './lib/tour/tour-steps';
  import { runLiveCalc, runGlobalSolve } from './lib/engine/live-calc';
  import LandingPage from './components/LandingPage.svelte';
  import AiDrawer from './components/AiDrawer.svelte';

  if (typeof window !== 'undefined') {
    const redirectedRoute = new URLSearchParams(location.search).get('route');
    if (redirectedRoute) {
      history.replaceState(null, '', redirectedRoute);
    }
  }

  function isAppRoute(pathname: string) {
    return pathname === '/app' || pathname === '/app/' || pathname.startsWith('/app/');
  }

  function isDemoRoute(pathname: string) {
    return pathname === '/demo' || pathname === '/demo/';
  }

  type AppMode = 'basico' | 'educativo' | 'pro';

  function slugifyTabName(name: string) {
    return (name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'new-structure';
  }

  function modeToPath(mode: AppMode) {
    if (mode === 'educativo') return '/app/education';
    if (mode === 'pro') return '/app/pro';
    return '/app/basic';
  }

  function pathToMode(pathname: string): AppMode {
    if (pathname === '/app/pro' || pathname === '/app/pro/') return 'pro';
    if (pathname === '/app/education' || pathname === '/app/education/') return 'educativo';
    if (pathname === '/app/basic' || pathname === '/app/basic/') return 'basico';
    return 'basico';
  }

  function replaceAppUrl(mode: AppMode, tabName?: string) {
    const url = new URL(location.href);
    url.pathname = modeToPath(mode);
    if (tabName) {
      url.searchParams.set('tab', slugifyTabName(tabName));
    } else {
      url.searchParams.delete('tab');
    }
    history.replaceState(null, '', `${url.pathname}${url.search}`);
  }

  function findTabBySlug(tabSlug: string | null) {
    if (!tabSlug) return null;
    return tabManager.tabs.find(tab => slugifyTabName(tab.name) === tabSlug) ?? null;
  }

  function shouldShowLanding() {
    const params = new URLSearchParams(location.search);
    return !params.has('embed') && !isAppRoute(location.pathname) && !isDemoRoute(location.pathname);
  }

  let showLanding = $state(shouldShowLanding());

  function enterApp() {
    if (!isAppRoute(location.pathname)) {
      history.pushState(null, '', modeToPath(currentAppMode));
    }
    showLanding = false;
  }

  function syncRouteState() {
    showLanding = shouldShowLanding();
    if (!showLanding) {
      const nextMode = pathToMode(location.pathname);
      currentAppMode = nextMode;
      if (nextMode === 'educativo') {
        uiStore.analysisMode = 'edu';
      } else if (nextMode === 'pro') {
        uiStore.analysisMode = 'pro';
      } else {
        uiStore.analysisMode = '2d';
      }
    }
  }

  // Listen for enter-app event from LandingPage "Try Demo" buttons
  if (typeof window !== 'undefined') {
    window.addEventListener('stabileo-enter-app', enterApp);
  }

  // ─── Per-mode model persistence ───
  // When switching between básico/edu/pro, save the current model and restore
  // the target mode's model (or start empty if first visit to that mode).
  import type { ModelSnapshot } from './lib/store/history.svelte';
  const modeSnapshots = new Map<AppMode, ModelSnapshot>();
  let currentAppMode = $state<AppMode>(typeof window !== 'undefined' ? pathToMode(location.pathname) : 'basico');

  function switchAppMode(target: AppMode) {
    const prev = currentAppMode;
    if (target === prev) return;
    // Save current model into the mode we're leaving
    modeSnapshots.set(prev, modelStore.snapshot());
    // Clear results + UI state
    resultsStore.clear();
    resultsStore.diagramType = 'none';
    historyStore.clear();
    uiStore.proPanelVisible = true;
    uiStore.proPanelWidth = 540;
    // Restore target mode's model or start empty
    const saved = modeSnapshots.get(target);
    if (saved) {
      modelStore.restore(saved);
    } else {
      modelStore.clear();
    }
    // Set the actual analysis mode + per-mode defaults
    if (target === 'basico') {
      uiStore.analysisMode = '2d';
      resultsStore.showReactions = true;
    } else if (target === 'educativo') {
      uiStore.analysisMode = 'edu';
      resultsStore.showReactions = false;
    } else {
      uiStore.analysisMode = 'pro';
      uiStore.includeSelfWeight = true;
      resultsStore.showReactions = false;
      resultsStore.showConstraintForces = false;
    }
    currentAppMode = target;
    replaceAppUrl(target, modelStore.model.name);
  }

  let showDxfImport = $state(false);
  let dxfImportFile = $state<File | null>(null);
  let showIfcImport = $state(false);
  let ifcImportFile = $state<File | null>(null);
  let ifcFileInput: HTMLInputElement;
  let dxfFileInput: HTMLInputElement;

  // Derive showResults from whether results exist — no manual management needed
  const showResults = $derived(resultsStore.results !== null || resultsStore.results3D !== null);
  let showImportDialog = $state(false);
  let importText = $state('');
  let autosaveData = $state<ReturnType<typeof loadFromLocalStorage>>(null);
  /** True once the user has explicitly Restored or Discarded the pending save. */
  let autosaveDismissed = $state(false);
  let autosaveInterval: ReturnType<typeof setInterval> | null = null;

  /** Banner visibility: autosave exists, mode matches, user hasn't dismissed,
   *  and the user hasn't started editing a different project. */
  const showAutosaveBanner = $derived.by(() => {
    if (!autosaveData || autosaveDismissed) return false;
    const savedMode = autosaveData.appMode ?? 'basico';
    if (savedMode !== currentAppMode) return false;
    if (modelStore.nodes.size > 0 && modelStore.model.name !== autosaveData.name) return false;
    return true;
  });

  // Keep <html lang> in sync with selected locale
  $effect(() => {
    document.documentElement.lang = t('file.htmlLang');
  });

  function restoreAutosave() {
    if (autosaveData) {
      modelStore.restore(autosaveData.snapshot);
      modelStore.model.name = autosaveData.name;
      // Restore analysis mode and axis convention from autosave
      if (autosaveData.analysisMode) uiStore.analysisMode = autosaveData.analysisMode;
      if (autosaveData.axisConvention3D) uiStore.axisConvention3D = autosaveData.axisConvention3D;
      resultsStore.clear();
    }
    autosaveDismissed = true;
  }

  function discardAutosave() {
    clearLocalStorage();
    autosaveDismissed = true;
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

  function handleProKeydown(e: KeyboardEvent) {
    if (uiStore.appMode !== 'pro') return;
    // Skip if focus is in an input/textarea/select
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    // Ctrl/Cmd+Z: Undo
    const key = e.key.toUpperCase();
    if ((e.ctrlKey || e.metaKey) && key === 'Z' && !e.shiftKey) {
      e.preventDefault();
      historyStore.undo();
      return;
    }
    // Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z: Redo
    if ((e.ctrlKey || e.metaKey) && (key === 'Y' || (key === 'Z' && e.shiftKey))) {
      e.preventDefault();
      historyStore.redo();
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (uiStore.selectedSupports.size > 0) {
        const sups = [...uiStore.selectedSupports];
        modelStore.batch(() => { for (const id of sups) modelStore.removeSupport(id); });
        uiStore.clearSelectedSupports();
        resultsStore.clear();
        return;
      }
      if (uiStore.selectedLoads.size > 0) {
        const indices = [...uiStore.selectedLoads].sort((a, b) => b - a);
        modelStore.batch(() => {
          for (const idx of indices) {
            const load = modelStore.loads[idx];
            if (load) modelStore.removeLoad(load.data.id);
          }
        });
        uiStore.clearSelectedLoads();
        resultsStore.clear();
        return;
      }
      if (uiStore.selectedNodes.size > 0 || uiStore.selectedElements.size > 0) {
        const nodes = [...uiStore.selectedNodes];
        const elems = [...uiStore.selectedElements];
        const shellMode = uiStore.selectMode === 'shells';
        modelStore.batch(() => {
          for (const id of nodes) modelStore.removeNode(id);
          for (const id of elems) {
            const isShell = modelStore.plates.has(id) || modelStore.quads.has(id);
            const isElem = modelStore.elements.has(id);
            if (isShell && isElem) {
              // Ambiguous ID — use selectMode to decide
              if (shellMode) {
                if (modelStore.plates.has(id)) modelStore.removePlate(id);
                else modelStore.removeQuad(id);
              } else {
                modelStore.removeElement(id);
              }
            } else if (isShell) {
              if (modelStore.plates.has(id)) modelStore.removePlate(id);
              else modelStore.removeQuad(id);
            } else if (isElem) {
              modelStore.removeElement(id);
            }
          }
        });
        uiStore.clearSelection();
        resultsStore.clear();
        return;
      }
    }
  }

  function handleExportPNG() {
    const canvas = document.querySelector('.viewport-container canvas') as HTMLCanvasElement | null;
    if (canvas) downloadCanvasPNG(canvas);
  }

  onMount(() => {
    currentAppMode = pathToMode(location.pathname);
    if (currentAppMode === 'educativo') {
      uiStore.analysisMode = 'edu';
    } else if (currentAppMode === 'pro') {
      uiStore.analysisMode = 'pro';
      uiStore.includeSelfWeight = true;
    } else {
      uiStore.analysisMode = '2d';
    }

    // Initialize WASM solver (non-blocking, fallback to JS if it fails)
    import('./lib/engine/wasm-solver').then(m => m.initSolver()).catch(() => {
      console.warn('WASM solver unavailable, using JS fallback');
    });

    // Initialize tab manager with current state
    tabManager.init();

    // Check for /demo path → launch guided tour
    const onPopState = () => syncRouteState();
    window.addEventListener('popstate', onPopState);

    if (isDemoRoute(location.pathname)) {
      history.replaceState(null, '', modeToPath(currentAppMode));
      syncRouteState();
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
          window.dispatchEvent(new Event('stabileo-solve'));
          // After solve completes, set the diagram type from the share link
          setTimeout(() => {
            if (resultsStore.results !== null || resultsStore.results3D !== null) {
              resultsStore.diagramType = pendingDiagram as any;
            }
          }, 200);
        }, 200);
      }
    }

    // Restore full tab workspace first when available.
    if (!hashMode) {
      const savedWorkspace = loadWorkspaceFromLocalStorage();
      if (savedWorkspace && savedWorkspace.tabs.length > 0) {
        tabManager.restoreSession(savedWorkspace.tabs, savedWorkspace.activeTabId);
        const requestedTab = findTabBySlug(new URLSearchParams(location.search).get('tab'));
        if (requestedTab && requestedTab.id !== tabManager.activeTabId) {
          tabManager.switchTab(requestedTab.id);
        }
        currentAppMode = uiStore.appMode;
        replaceAppUrl(currentAppMode, modelStore.model.name);
        autosaveData = null;
      }

      // Load autosave data if no workspace was restored.
      // Banner visibility is derived — it checks mode match, dismiss state,
      // and whether the user has started editing a different project.
      if (!savedWorkspace) {
        const loaded = loadFromLocalStorage();
        if (loaded && loaded.snapshot.nodes.length > 0) {
          autosaveData = loaded;
        }
      }
    }

    // Setup autosave every 30s
    autosaveInterval = setInterval(() => {
      saveToLocalStorage();
      saveWorkspaceToLocalStorage();
    }, 30_000);

    // Mobile responsive: track window width
    uiStore.windowWidth = window.innerWidth;
    const onResize = () => { uiStore.windowWidth = window.innerWidth; };
    window.addEventListener('resize', onResize);

    // Listen for PNG export event from Toolbar
    window.addEventListener('stabileo-export-png', handleExportPNG);
    const handleImportEvent = () => { showImportDialog = true; };
    window.addEventListener('stabileo-import-coords', handleImportEvent);
    const handleDxfImportEvent = () => { dxfFileInput?.click(); };
    window.addEventListener('stabileo-import-dxf', handleDxfImportEvent);
    const handleDxfDropEvent = (e: Event) => {
      const ce = e as CustomEvent<File>;
      dxfImportFile = ce.detail;
      showDxfImport = true;
    };
    window.addEventListener('stabileo-dxf-drop', handleDxfDropEvent);
    const handleIfcImportEvent = () => { ifcFileInput?.click(); };
    window.addEventListener('stabileo-import-ifc', handleIfcImportEvent);

    // Global solve event — always mounted (mobile bottom bar dispatches this)
    const handleGlobalSolve = () => runGlobalSolve();
    window.addEventListener('stabileo-solve', handleGlobalSolve);

    return () => {
      saveWorkspaceToLocalStorage();
      if (autosaveInterval) clearInterval(autosaveInterval);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('stabileo-export-png', handleExportPNG);
      window.removeEventListener('stabileo-import-coords', handleImportEvent);
      window.removeEventListener('stabileo-import-dxf', handleDxfImportEvent);
      window.removeEventListener('stabileo-dxf-drop', handleDxfDropEvent);
      window.removeEventListener('stabileo-import-ifc', handleIfcImportEvent);
      window.removeEventListener('stabileo-solve', handleGlobalSolve);
      window.removeEventListener('popstate', onPopState);
    };
  });

  $effect(() => {
    if (showLanding || typeof window === 'undefined') return;
    replaceAppUrl(uiStore.appMode, modelStore.model.name);
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

  // ─── PRO panel drag-resize ────────────────────────────────────────
  let proPanelRef: any = $state(null);
  let proExBtnEl = $state<HTMLButtonElement | undefined>(undefined);
  let proSettingsOpen = $state(false);

  // PRO toolbar dropdown state
  type ProDropdown = null | 'select' | 'geometry' | 'properties' | 'conditions' | 'analysis';
  let openDropdown = $state<ProDropdown>(null);

  function toggleDropdown(dd: ProDropdown) {
    openDropdown = openDropdown === dd ? null : dd;
  }

  /** Close dropdown when clicking outside the toolbar. */
  function handleProBarClickOutside(e: MouseEvent) {
    if (openDropdown && !(e.target as HTMLElement)?.closest('.pro-bar')) {
      openDropdown = null;
    }
  }

  function startProResize(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = uiStore.proPanelWidth;
    const maxW = window.innerWidth - 200;
    let rafId = 0;
    let lastX = startX;

    function onMove(ev: MouseEvent) {
      lastX = ev.clientX;
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          const delta = startX - lastX;
          uiStore.proPanelWidth = Math.max(360, Math.min(maxW, startWidth + delta));
        });
      }
    }
    function onUp() {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.dispatchEvent(new Event('resize'));
    }
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
</script>

<svelte:window onkeydown={handleProKeydown} onclick={handleProBarClickOutside} />

{#if showLanding}
  <LandingPage />
{/if}

<div class="app-container" class:embed-mode={uiStore.embedMode} class:hidden-behind-landing={showLanding}>
  <header class="app-header">
    <div class="logo">
      <button class="logo-home" onclick={() => { showLanding = true; history.pushState(null, '', '/'); }} title="Back to home">
        <span class="logo-icon">△</span>
        <span class="logo-text">Stabileo</span>
      </button>
      {#if uiStore.isMobile}
        <select class="mode-select-mobile" value={uiStore.appMode} onchange={(e) => switchAppMode(e.currentTarget.value as AppMode)}>
          <option value="basico">{t('app.modeBasic')}</option>
          <option value="educativo">{t('app.modeEdu')} (Beta)</option>
          <option value="pro">{t('app.modePro')} (Beta)</option>
        </select>
      {:else}
        <div class="mode-toggle" data-tour="mode-toggle">
          <button class:active={uiStore.appMode === 'basico'} onclick={() => switchAppMode('basico')}>
            {t('app.modeBasic')}
          </button>
          <button class:active={uiStore.appMode === 'educativo'} class="edu-mode-btn" onclick={() => switchAppMode('educativo')}>{t('app.modeEdu')}<span class="demo-badge">Beta</span></button>
          <button class:active={uiStore.appMode === 'pro'} class="pro-mode-btn" onclick={() => switchAppMode('pro')}>{t('app.modePro')}<span class="demo-badge">Beta</span></button>
        </div>
      {/if}
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
    </div>
  </header>

  {#if showAutosaveBanner}
    <div class="autosave-banner">
      <span>{t('app.autosaveFound')} <strong>{autosaveData?.name}</strong></span>
      <button class="banner-btn restore" onclick={restoreAutosave}>{t('app.restore')}</button>
      <button class="banner-btn discard" onclick={discardAutosave}>{t('app.discard')}</button>
    </div>
  {/if}

  <div class="app-body" class:app-body-pro={uiStore.appMode === 'pro'}>
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

    {#if uiStore.appMode === 'pro' && !uiStore.isMobile}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <nav class="pro-bar" onclick={(e) => e.stopPropagation()}>
        <!-- Pan -->
        <button class="pb-tool" class:active={uiStore.currentTool === 'pan'} onclick={() => { uiStore.currentTool = 'pan'; openDropdown = null; }} title="{t('float.pan')} (H)">✋</button>
        <!-- Select with dropdown -->
        <!-- Undo / Redo -->
        <button class="pb-undo" onclick={() => historyStore.undo()} disabled={!historyStore.canUndo} title="{t('toolbar.undo')} ({navigator?.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+Z)">↶</button>
        <button class="pb-undo" onclick={() => historyStore.redo()} disabled={!historyStore.canRedo} title="{t('toolbar.redo')} ({navigator?.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+Y)">↷</button>
        <div class="pb-dd-wrap">
          <button class="pb-tool" class:active={uiStore.currentTool === 'select'} onclick={() => { uiStore.currentTool = 'select'; toggleDropdown('select'); }}>↖ <span class="pb-caret">▾</span></button>
          {#if openDropdown === 'select'}
            <div class="pb-dropdown">
              {#each [
                { id: 'nodes', key: 'float.selectNodes' },
                { id: 'elements', key: 'float.selectElements' },
                { id: 'shells', key: 'float.selectShells' },
                { id: 'supports', key: 'float.selectSupports' },
                { id: 'loads', key: 'float.selectLoads' },
              ] as const as sm}
                <button class="pb-dd-item" class:active={uiStore.selectMode === sm.id} onclick={() => { uiStore.selectMode = sm.id; openDropdown = null; }}>{t(sm.key)}</button>
              {/each}
            </div>
          {/if}
        </div>

        <span class="pb-divider"></span>

        <!-- Geometry -->
        <div class="pb-dd-wrap">
          <button class="pb-group" class:group-active={['nodes','elements','shells'].includes(uiStore.proActiveTab)} onclick={() => toggleDropdown('geometry')}>{t('pro.groupGeometry')} <span class="pb-caret">▾</span></button>
          {#if openDropdown === 'geometry'}
            <div class="pb-dropdown">
              <button class="pb-dd-item" class:active={uiStore.proActiveTab === 'nodes'} onclick={() => { uiStore.proActiveTab = 'nodes'; openDropdown = null; }}>{t('pro.tabNodes')}</button>
              <button class="pb-dd-item" class:active={uiStore.proActiveTab === 'elements'} onclick={() => { uiStore.proActiveTab = 'elements'; openDropdown = null; }}>{t('pro.tabElements')}</button>
              <button class="pb-dd-item" class:active={uiStore.proActiveTab === 'shells'} onclick={() => { uiStore.proActiveTab = 'shells'; openDropdown = null; }}>{t('pro.tabShells')}</button>
            </div>
          {/if}
        </div>
        <!-- Properties -->
        <div class="pb-dd-wrap">
          <button class="pb-group" class:group-active={['materials','sections'].includes(uiStore.proActiveTab)} onclick={() => toggleDropdown('properties')}>{t('pro.groupProperties')} <span class="pb-caret">▾</span></button>
          {#if openDropdown === 'properties'}
            <div class="pb-dropdown">
              <button class="pb-dd-item" class:active={uiStore.proActiveTab === 'materials'} onclick={() => { uiStore.proActiveTab = 'materials'; openDropdown = null; }}>{t('pro.tabMaterials')}</button>
              <button class="pb-dd-item" class:active={uiStore.proActiveTab === 'sections'} onclick={() => { uiStore.proActiveTab = 'sections'; openDropdown = null; }}>{t('pro.tabSections')}</button>
            </div>
          {/if}
        </div>
        <!-- Conditions -->
        <div class="pb-dd-wrap">
          <button class="pb-group" class:group-active={['supports','constraints','loads'].includes(uiStore.proActiveTab)} onclick={() => toggleDropdown('conditions')}>{t('pro.groupConditions')} <span class="pb-caret">▾</span></button>
          {#if openDropdown === 'conditions'}
            <div class="pb-dropdown">
              <button class="pb-dd-item" class:active={uiStore.proActiveTab === 'supports'} onclick={() => { uiStore.proActiveTab = 'supports'; openDropdown = null; }}>{t('pro.tabSupports')}</button>
              <button class="pb-dd-item" class:active={uiStore.proActiveTab === 'constraints'} onclick={() => { uiStore.proActiveTab = 'constraints'; openDropdown = null; }}>{t('pro.tabConstraints')}</button>
              <button class="pb-dd-item" class:active={uiStore.proActiveTab === 'loads'} onclick={() => { uiStore.proActiveTab = 'loads'; openDropdown = null; }}>{t('pro.tabLoads')}</button>
            </div>
          {/if}
        </div>
        <!-- Analysis -->
        <div class="pb-dd-wrap">
          <button class="pb-group" class:group-active={['advanced','results','design','connections','diagnostics'].includes(uiStore.proActiveTab)} onclick={() => toggleDropdown('analysis')}>{t('pro.groupAnalysis')} <span class="pb-caret">▾</span></button>
          {#if openDropdown === 'analysis'}
            <div class="pb-dropdown">
              <button class="pb-dd-item" class:active={uiStore.proActiveTab === 'advanced'} onclick={() => { uiStore.proActiveTab = 'advanced'; openDropdown = null; }}>{t('pro.tabAdvanced')}</button>
              <button class="pb-dd-item" class:active={uiStore.proActiveTab === 'results'} onclick={() => { uiStore.proActiveTab = 'results'; openDropdown = null; }}>{t('pro.tabResults')}</button>
              <button class="pb-dd-item" class:active={uiStore.proActiveTab === 'design'} onclick={() => { uiStore.proActiveTab = 'design'; openDropdown = null; }}>{t('pro.tabDesign')}</button>
              <button class="pb-dd-item" class:active={uiStore.proActiveTab === 'connections'} onclick={() => { uiStore.proActiveTab = 'connections'; openDropdown = null; }}>{t('pro.tabConnections')}</button>
              <button class="pb-dd-item" class:active={uiStore.proActiveTab === 'diagnostics'} onclick={() => { uiStore.proActiveTab = 'diagnostics'; openDropdown = null; }}>{t('pro.tabDiagnostics')}</button>
            </div>
          {/if}
        </div>

        <span class="pb-divider"></span>

        <!-- Actions -->
        <button class="pn-action pn-example" bind:this={proExBtnEl} onclick={() => proPanelRef?.examples(proExBtnEl)}>{t('pro.exampleBtn')}</button>
        <button class="pn-action pn-solve" onclick={() => proPanelRef?.solve()} disabled={!proPanelRef?.canSolve()}>{proPanelRef?.isSolving() ? t('pro.solving') : t('pro.solve')}</button>
        <button class="pn-action pn-report" onclick={() => proPanelRef?.report()} disabled={!proPanelRef?.canReport()}>{t('pro.reportBtn')}</button>

        <span class="pb-spacer"></span>

        <!-- Controls -->
        <button class="pn-toggle" onclick={() => { uiStore.proPanelVisible = !uiStore.proPanelVisible; setTimeout(() => window.dispatchEvent(new Event('resize')), 50); }} title={uiStore.proPanelVisible ? 'Hide panel' : 'Show panel'}>{uiStore.proPanelVisible ? '\u25E5' : '\u25E3'}</button>
        <button class="pn-toggle pn-settings-gear" onclick={() => proSettingsOpen = !proSettingsOpen} title={t('config.title')}>&#9881;</button>
        {#if proSettingsOpen}
          <div class="pro-settings-dropdown">
            <ToolbarConfig inline={true} />
          </div>
        {/if}
      </nav>
    {/if}

    {#if uiStore.appMode === 'pro' && uiStore.isMobile}
      <div class="pro-mobile-toolbar">
        <button class="pmt-btn" class:active={uiStore.currentTool === 'pan'} onclick={() => uiStore.currentTool = 'pan'}>✋</button>
        <button class="pmt-btn pmt-undo" onclick={() => historyStore.undo()} disabled={!historyStore.canUndo}>↶</button>
        <button class="pmt-btn pmt-undo" onclick={() => historyStore.redo()} disabled={!historyStore.canRedo}>↷</button>
        <button class="pmt-btn pmt-results" class:active={uiStore.mobileResultsPanelOpen} onclick={() => uiStore.mobileResultsPanelOpen = !uiStore.mobileResultsPanelOpen} title="Results & Solve">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
            <line x1="2" y1="17" x2="22" y2="17" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M2,17 Q7,5 12,17 Q17,5 22,17" stroke="#e94560" stroke-width="1.8" fill="none"/>
          </svg>
        </button>
        <button class="pmt-btn" class:active={uiStore.currentTool === 'select'} onclick={() => uiStore.currentTool = 'select'}>↖</button>
        {#if uiStore.currentTool === 'select'}
          {#each [
            { id: 'nodes', key: 'float.selectNodes' },
            { id: 'elements', key: 'float.selectElements' },
            { id: 'shells', key: 'float.selectShells' },
            { id: 'supports', key: 'float.selectSupports' },
            { id: 'loads', key: 'float.selectLoads' },
          ] as const as sm}
            <button class="pmt-sel" class:active={uiStore.selectMode === sm.id} onclick={() => uiStore.selectMode = sm.id}>{t(sm.key)}</button>
          {/each}
        {/if}
      </div>
    {/if}

    <div class="app-body-inner" class:pro-body-row={uiStore.appMode === 'pro'}>

    <div class="main-area">
      <main class="viewport-container">
        {#if uiStore.analysisMode === '2d' || uiStore.analysisMode === 'edu'}
          <Viewport />
        {:else}
          <Viewport3D />
        {/if}
        {#if uiStore.simplified2DMode}
          <div class="simplified-banner">
            <span>{t('app.simplified2d.banner')}</span>
            {#if uiStore.simplified2DStats}
              <span class="simplified-stats">
                {uiStore.simplified2DStats.mergedNodes > 0 ? `${uiStore.simplified2DStats.mergedNodes} ${t('app.simplified2d.merged')}` : ''}
                {uiStore.simplified2DStats.removedElements > 0 ? ` · ${uiStore.simplified2DStats.removedElements} ${t('app.simplified2d.removed')}` : ''}
                {uiStore.simplified2DStats.duplicateElements > 0 ? ` · ${uiStore.simplified2DStats.duplicateElements} ${t('app.simplified2d.duplicates')}` : ''}
              </span>
            {/if}
          </div>
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
      {#if uiStore.appMode === 'pro' && uiStore.proPanelVisible}
        <aside class="sidebar right pro-sidebar" style:width="{uiStore.proPanelWidth}px" style:overflow="visible">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="pro-resize-handle" onmousedown={(e) => startProResize(e)}></div>
          <ProPanel bind:this={proPanelRef} />
        </aside>
      {:else if uiStore.appMode === 'educativo'}
        <aside class="sidebar right edu-sidebar">
          <EducativePanel />
        </aside>
      {:else if uiStore.appMode === 'basico'}
        {#if !uiStore.aiDrawerOpen}
          <button class="sidebar-toggle-btn right-toggle" class:sidebar-closed={!uiStore.rightSidebarOpen} onclick={() => uiStore.rightSidebarOpen = !uiStore.rightSidebarOpen} title={uiStore.rightSidebarOpen ? t('app.hideRightPanel') : t('app.showRightPanel')}>
            {uiStore.rightSidebarOpen ? '▸' : '◂'}
          </button>
        {/if}
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

    </div><!-- /pro-body-row (class only applied in PRO) -->

    {#if !uiStore.isMobile && uiStore.aiDrawerOpen}
      <AiDrawer />
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
      {#if uiStore.appMode === 'pro'}
        <ProPanel />
      {:else if uiStore.appMode === 'educativo'}
        <EducativePanel />
      {:else if dsmStepsStore.isOpen}
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
      {#if uiStore.appMode === 'basico'}
        <button class="mobile-bar-btn" onclick={() => uiStore.leftDrawerOpen = !uiStore.leftDrawerOpen} title={t('app.tools')}>
          ☰
        </button>
        <button class="mobile-bar-btn" onclick={() => uiStore.rightDrawerOpen = !uiStore.rightDrawerOpen} title={t('app.properties')}>
          ⚙
        </button>
      {:else}
        <button class="mobile-bar-btn" onclick={() => uiStore.rightDrawerOpen = !uiStore.rightDrawerOpen} title={uiStore.appMode === 'pro' ? 'PRO' : t('app.properties')}>
          {uiStore.appMode === 'pro' ? '\u26A1' : '\uD83D\uDCD0'}
        </button>
      {/if}
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
          <button class="toast-action" onclick={() => { uiStore.showKinematicPanel = true; uiStore.dismissToast(toast.id); }}>
            {t('app.viewKinematic')}
          </button>
        {/if}
        <button class="toast-dismiss" onclick={() => uiStore.dismissToast(toast.id)} title="Dismiss">&times;</button>
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

{#if !showLanding && !uiStore.isMobile && !uiStore.embedMode && !uiStore.aiDrawerOpen}
  <button class="ai-fab" onclick={() => uiStore.aiDrawerOpen = true} title="Stabileo AI">
    △
  </button>
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

  .hidden-behind-landing {
    pointer-events: none;
    filter: blur(4px);
    opacity: 0.3;
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

  .logo-home {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: inherit;
  }
  .logo-home:hover .logo-text { color: #fff; }
  .logo-home:hover .logo-icon { color: #ff5a75; }

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
    overflow: visible;
    position: relative;
    z-index: 40;
    flex-shrink: 0;
  }

  /* ─── PRO command bar with dropdowns ─── */
  .pro-bar {
    position: relative;
    display: flex;
    align-items: center;
    gap: 3px;
    background: #0a1a30;
    border-bottom: 1px solid #1a4a7a;
    padding: 5px 10px;
    flex-shrink: 0;
    width: 100%;
  }
  .pb-tool {
    display: flex; align-items: center; justify-content: center; gap: 2px;
    height: 30px; min-width: 30px; padding: 0 6px;
    font-size: 0.88rem;
    color: #899;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.12s;
  }
  .pb-tool:hover { color: #ddd; background: rgba(26, 74, 122, 0.4); }
  .pb-tool.active { color: #fff; background: #e94560; border-color: #ff6b6b; }
  .pb-group {
    display: flex; align-items: center; gap: 3px;
    height: 30px; padding: 0 10px;
    font-size: 0.7rem; font-weight: 600;
    color: #8899aa;
    background: transparent;
    border: 1px solid #152a45;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.12s;
    white-space: nowrap;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .pb-group:hover { color: #cde; background: rgba(26, 74, 122, 0.3); border-color: #1e4570; }
  .pb-group.group-active { color: #fff; border-color: #e94560; background: rgba(233, 69, 96, 0.12); }
  .pb-caret { font-size: 0.55rem; opacity: 0.6; }
  .pb-undo {
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 30px;
    font-size: 0.9rem;
    color: #899;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.12s;
  }
  .pb-undo:hover:not(:disabled) { color: #ddd; background: rgba(26, 74, 122, 0.4); }
  .pb-undo:disabled { opacity: 0.25; cursor: not-allowed; }
  .pb-divider { width: 1px; height: 20px; background: #1a3050; margin: 0 4px; flex-shrink: 0; }
  .pb-spacer { flex: 1; }
  /* Dropdown */
  .pb-dd-wrap { position: relative; }
  .pb-dropdown {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    z-index: 300;
    min-width: 150px;
    background: #0d1b2e;
    border: 1px solid #1a4a7a;
    border-radius: 6px;
    padding: 3px 0;
    box-shadow: 0 8px 28px rgba(0,0,0,0.55);
  }
  .pb-dd-item {
    display: block; width: 100%;
    padding: 7px 14px;
    font-size: 0.72rem; font-weight: 500;
    color: #aab;
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: all 0.1s;
  }
  .pb-dd-item:hover { color: #fff; background: rgba(26, 74, 122, 0.4); }
  .pb-dd-item.active { color: #fff; background: #e94560; }
  .pb-dd-item:first-child { border-radius: 4px 4px 0 0; }
  .pb-dd-item:last-child { border-radius: 0 0 4px 4px; }
  .pn-toggle {
    padding: 4px 8px;
    font-size: 0.9rem;
    line-height: 1;
    color: #aaa;
    background: transparent;
    border: 1px solid #334;
    border-radius: 4px;
    cursor: pointer;
    flex-shrink: 0;
    margin-left: 6px;
  }
  .pn-toggle:hover { color: #fff; border-color: #4ecdc4; }
  .pn-settings-gear { font-size: 1rem; }
  .simplified-banner {
    position: absolute;
    top: 4px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 90;
    background: rgba(233, 69, 96, 0.9);
    color: white;
    padding: 3px 12px;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    display: flex;
    gap: 0.5rem;
    align-items: center;
    pointer-events: none;
  }
  .simplified-stats { font-weight: 400; opacity: 0.85; }
  .pro-settings-dropdown {
    position: absolute;
    top: 100%;
    right: 6px;
    z-index: 200;
    width: 260px;
    max-height: 70vh;
    overflow-y: auto;
    background: #0d1b2e;
    border: 1px solid #1a4a7a;
    border-radius: 6px;
    padding: 0.5rem;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  }

  .pn-actions {
    display: flex;
    gap: 4px;
    margin-left: auto;
    align-items: center;
    flex-shrink: 0;
  }
  .pn-action {
    padding: 3px 10px;
    font-size: 0.7rem;
    font-weight: 600;
    border: 1px solid transparent;
    border-radius: 3px;
    cursor: pointer;
    white-space: nowrap;
  }
  .pn-action:disabled { opacity: 0.35; cursor: not-allowed; }
  .pn-example { color: #fff; background: linear-gradient(135deg, #f0a500, #d99200); border-color: #f0a500; }
  .pn-example:hover { background: linear-gradient(135deg, #ffb820, #f0a500); }
  .pn-solve { color: #fff; background: linear-gradient(135deg, #4ecdc4, #3ab8b0); border-color: #4ecdc4; }
  .pn-solve:hover { background: linear-gradient(135deg, #5fe0d7, #4ecdc4); }
  .pn-report { color: #fff; background: linear-gradient(135deg, #e94560, #c73e54); border-color: #e94560; }
  .pn-report:hover { background: linear-gradient(135deg, #ff5a75, #e94560); }

  .pro-resize-handle {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: col-resize;
    background: transparent;
    z-index: 100;
    touch-action: none;
  }
  .pro-resize-handle:hover, .pro-resize-handle:active {
    background: rgba(78, 205, 196, 0.5);
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

  .ai-fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 100;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: #0f3460;
    border: 2px solid #1a4a7a;
    color: #ccc;
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }

  .ai-fab:hover {
    background: #1a4a7a;
    border-color: #4ecdc4;
    color: #4ecdc4;
    transform: scale(1.05);
  }

  .ai-fab.active {
    background: #1a4a7a;
    border-color: #4ecdc4;
    color: #4ecdc4;
    box-shadow: 0 4px 16px rgba(78, 205, 196, 0.3);
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
  .app-body.app-body-pro {
    flex-direction: column;
  }
  .app-body-inner {
    display: contents;
  }
  .app-body-inner.pro-body-row {
    display: flex;
    flex: 1;
    overflow: hidden;
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
    position: relative;
    padding: 0.6rem 2rem 0.6rem 1rem;
    border-radius: 6px;
    font-size: 0.85rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    animation: toast-in 0.3s ease;
    max-width: 350px;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .toast-dismiss {
    position: absolute;
    top: 4px;
    right: 6px;
    background: none;
    border: none;
    color: inherit;
    opacity: 0.5;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
    padding: 0 2px;
  }
  .toast-dismiss:hover { opacity: 1; }

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

  /* ─── Mobile PRO upper toolbar ─── */
  .pro-mobile-toolbar {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 4px 8px;
    background: #0a1a30;
    border-bottom: 1px solid #1a4a7a;
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .pmt-btn {
    width: 36px; height: 34px;
    display: flex; align-items: center; justify-content: center;
    font-size: 1rem;
    color: #899;
    background: #0f2840;
    border: 1px solid #1a3050;
    border-radius: 6px;
    cursor: pointer;
  }
  .pmt-btn:hover { color: #ddd; }
  .pmt-btn.active { color: #fff; background: #e94560; border-color: #ff6b6b; }
  .pmt-btn.pmt-undo { font-size: 0.9rem; width: 34px; }
  .pmt-btn.pmt-undo:disabled { opacity: 0.2; cursor: not-allowed; }
  .pmt-btn.pmt-results { padding: 0 8px; }
  .pmt-btn.pmt-results.active { background: rgba(233, 69, 96, 0.2); border-color: #e94560; }
  .pmt-sel {
    padding: 4px 8px;
    font-size: 0.7rem;
    color: #aab;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    cursor: pointer;
  }
  .pmt-sel.active { color: #fff; background: #e94560; border-color: #ff6b6b; }

  /* ─── Mobile mode selector ─── */
  .mode-select-mobile {
    padding: 5px 24px 5px 8px;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: #e0e8f0;
    background: linear-gradient(135deg, #0f3460, #162a50);
    border: 1px solid #2a5a90;
    border-radius: 6px;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%234ecdc4'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
    box-shadow: 0 1px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05);
    text-shadow: 0 1px 2px rgba(0,0,0,0.4);
  }
  .mode-select-mobile:focus { border-color: #4ecdc4; outline: none; box-shadow: 0 0 0 2px rgba(78, 205, 196, 0.25); }
  .mode-select-mobile option { background: #0d1b2e; color: #ccc; font-weight: 500; padding: 6px; }

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
