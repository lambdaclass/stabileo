<script lang="ts">
  import { onMount, untrack, tick } from 'svelte';
  import Viewport from './components/Viewport.svelte';
  import Viewport3D from './components/Viewport3D.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import NodeEditor from './components/NodeEditor.svelte';
  import ElementEditor from './components/ElementEditor.svelte';
  import DespieceInspector from './components/DespieceInspector.svelte';
  import MaterialEditor from './components/MaterialEditor.svelte';
  import SectionEditor from './components/SectionEditor.svelte';
  import { modelStore, uiStore, resultsStore, dsmStepsStore, tabManager, historyStore } from './lib/store';
  import { syncModelTabWithResults } from './lib/store/view-mode';
  import { t, i18n, setLocale } from './lib/i18n';
  import { OFFERED_LOCALES } from './lib/i18n/store.svelte';
  import { resolveDeleteTargets } from './lib/store/delete-selection';
  import { cameraActions } from './lib/pro/camera-actions';
  import SheetGrab from './components/SheetGrab.svelte';
  import {
    loadAutosave, clearAutosave,
    loadWorkspaceFromLocalStorage, saveWorkspaceToLocalStorage,
    downloadCanvasPNG, noteAxisConventionMigrationIfNeeded,
    type DedalFile,
  } from './lib/store/file';
  import { requestAutosave } from './lib/store/autosave-service';
  import { loadFromURLHash } from './lib/utils/url-sharing';
  import DxfImportDialog from './components/DxfImportDialog.svelte';
  import CadImportWizard from './components/CadImportWizard.svelte';
  import IfcImportDialog from './components/IfcImportDialog.svelte';
  import FloatingTools from './components/FloatingTools.svelte';
  import Ribbon from './components/ribbon/Ribbon.svelte';
  import BasicPanel from './components/ribbon/BasicPanel.svelte';
  import ToolOptionsBar from './components/ribbon/ToolOptionsBar.svelte';

  /**
   * Which right-hand panel the ribbon has opened, if any.
   *
   * Basic used to keep a 250 px left panel open permanently for controls that
   * are used once and then ignored. The ribbon opens them on demand, on the
   * right, so the canvas keeps the window and the drawing does not shift
   * sideways when a panel appears.
   */
  let basicPanel = $state<string | null>(null);
  /** Which Model-data tab the last Properties command asked for. */
  let basicDataTab = $state<string>('nodes');

  /*
   * Editing and reading a result stay mutually exclusive.
   *
   * An effect rather than a line inside `openBasicPanel`, because the tab also
   * changes from inside the panel — the Model table's own tab strip is bound to
   * this same state — and that path never calls this function. Watching the
   * state covers every path there is.
   */
  $effect(() => { syncModelTabWithResults(basicPanel, basicDataTab); });

  function openBasicPanel(panel: string | null, opts: { toggle?: boolean; dataTab?: string } = {}) {
    const toggle = opts.toggle !== false;
    // Remembered rather than overwritten with undefined: the ribbon lights the
    // command whose tab is showing, and a command that carries no tab of its
    // own must not blank the one already chosen.
    if (opts.dataTab) basicDataTab = opts.dataTab;
    if (panel === null) { basicPanel = null; return; }
    // Toggling is right for a command that owns its panel (Settings, Examples).
    // It is wrong for a selection like a diagram, which only ever means "show".
    basicPanel = toggle && basicPanel === panel ? null : panel;
  }

  /**
   * Close the right panel without stranding the pointer.
   *
   * Section analysis puts the viewport into `selectMode = 'stress'`, where a
   * click means "inspect this station" and the answer appears in THIS panel.
   * Closing the panel used to hide the answer while leaving the question mode
   * armed: the canvas stopped responding to selection and panning, with no
   * visible control to turn the mode off again, because the only one lived in
   * the panel that had just been dismissed.
   *
   * Closing a panel is an unambiguous "I am done with this", so it also ends
   * the interaction the panel existed to serve.
   */
  function closeBasicPanel() {
    basicPanel = null;
    if (uiStore.selectMode === 'stress') {
      uiStore.selectMode = 'elements';
      resultsStore.stressQuery = null;
    }
  }

  /*
   * The step-by-step wizard is started from Advanced but renders in the Model
   * data panel, which is the only place with room for a 10×10 matrix. Pressing
   * the button therefore lit it up and showed nothing: the wizard was mounted
   * behind the panel the user was already looking at. Following the wizard here
   * is what the ribbon does for every other command that owns a panel.
   */
  $effect(() => {
    if (dsmStepsStore.isOpen && uiStore.appMode === 'basico') {
      basicPanel = 'data';
    }
  });

  /**
   * Re-frame when the phone's sheet takes the canvas's height, or gives it back.
   *
   * The sheet is 58 % of the screen, so opening one takes the canvas from about
   * 550 px tall to about 200 and closing it does the reverse. A framing computed
   * for either of those is wrong for the other by more than the model is tall —
   * open Results on a framed beam and the beam is simply below the viewport.
   *
   * Only the OPEN/SHUT transition, not a change of which panel is showing:
   * moving from Results to Model data does not resize anything, and refitting
   * there would throw away a pan the reader had just made for no reason.
   *
   * Phone only. On a desktop the panel takes width from a canvas that has
   * plenty, and the existing framing stays legible.
   */
  /* ── PRO's phone camera button ─────────────────────────────────────────
   *
   * The stage selector that used to live here moved into the sheet, beside the
   * one that picks a command — two halves of "where am I" belong together, and
   * a phone bar has better uses for two slots. See `ProPanel.svelte`.
   */
  let camMenu = $state(false);
  let camPickId = $state('fit');
  const camActions = $derived(cameraActions());
  /*
   * Falls back to the first action rather than to whatever `camPickId` held.
   * The list is built from store state, so an id can stop existing if the set
   * ever changes; a face that renders `undefined` is worse than one that has
   * quietly gone back to Zoom-to-fit.
   */
  const camPicked = $derived(camActions.find((c) => c.id === camPickId) ?? camActions[0]);

  let sheetWasOpen = false;
  $effect(() => {
    const open = uiStore.isMobile && uiStore.appMode === 'basico' && !!basicPanel;
    if (open === sheetWasOpen) return;
    sheetWasOpen = open;
    if (modelStore.nodes.size === 0) return;
    /*
     * Two frames, not one. The class that reserves the height lands with this
     * same update; the canvas is resized by a ResizeObserver reacting to it,
     * and `zoom-to-fit` measures the backing store — so a fit dispatched in the
     * same tick measures the size the canvas is about to stop being. This is
     * the hazard commit 72f5c9e0 hardened the fit against; the delay keeps the
     * two from racing in the first place.
     */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.dispatchEvent(new Event('stabileo-zoom-to-fit'));
    }));
  });
  import WhatIfPanel from './components/WhatIfPanel.svelte';
  import SectionStressPanel from './components/SectionStressPanel.svelte';
  import KinematicPanel from './components/KinematicPanel.svelte';
  import StressPickHint from './components/stress/StressPickHint.svelte';
  import ColourScaleLegend from './components/ColourScaleLegend.svelte';
  import SwitchTo2DDialog from './components/SwitchTo2DDialog.svelte';
  import TabBar from './components/TabBar.svelte';
  import MobileResultsPanel from './components/MobileResultsPanel.svelte';
  import KeyboardShortcuts from './components/KeyboardShortcuts.svelte';
  import Icon from './components/ribbon/Icon.svelte';
  import ProPanel from './components/pro/ProPanel.svelte';
  import RebarWorkspace from './components/pro/design/RebarWorkspace.svelte';
  import ProProjectFileActions from './components/pro/ProProjectFileActions.svelte';
  import ToolbarConfig from './components/toolbar/ToolbarConfig.svelte';
  import { captureFocus } from './lib/utils/dialog-focus';
  import ProRibbon from './components/pro/ProRibbon.svelte';
  import EducativePanel from './components/edu/EducativePanel.svelte';
  import { eduStore } from './components/edu/edu-store.svelte';
  import TourOverlay from './components/TourOverlay.svelte';
  import HelpOverlay from './components/HelpOverlay.svelte';
  import ContextMenu from './components/ContextMenu.svelte';
  import { tourStore } from './lib/store/tour.svelte';
  import { startDemo, DEFAULT_DEMO } from './lib/tour/demos';
  import { runLiveCalc, runGlobalSolve } from './lib/engine/live-calc';
  import LandingPage from './components/LandingPage.svelte';
  import BlogPage from './components/blog/BlogPage.svelte';
  import { parsePublicPath, publicHref } from './lib/i18n/public-routes';
  import { publicI18n } from './lib/i18n/store.svelte';
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

  /**
   * The public routes, read through their language prefix.
   *
   * `/es/blog/x` and `/blog/x` are the same route; the first names its
   * language and the second is an old link that still has to work. Everything
   * below asks these two rather than matching `location.pathname` directly,
   * because a prefix would otherwise turn every public page into an app route.
   */
  function publicRoute(pathname: string) {
    return parsePublicPath(pathname);
  }

  /** `/blog`, `/blog/` and `/blog/<slug>`, under any language prefix. */
  function isBlogRoute(pathname: string) {
    const { path } = publicRoute(pathname);
    // `/blog/` is covered by the prefix test; only the bare form needs naming.
    return path === '/blog' || path.startsWith('/blog/');
  }

  /**
   * The URL says which language the page is in, so on arrival the URL wins.
   *
   * Without this, opening a shared `/pt/blog/x` in a browser whose stored
   * choice is Spanish would render the Spanish post at a Portuguese address —
   * and the address is what was shared, indexed and quoted.
   */
  function adoptLocaleFromPath() {
    if (typeof window === 'undefined') return;
    const { locale } = publicRoute(location.pathname);
    if (locale && locale !== publicI18n.locale) setLocale(locale);
  }
  adoptLocaleFromPath();

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
    /*
     * The fragment survives.
     *
     * This function's job is the path and the query, but it rewrote the URL
     * from `pathname + search` and so silently dropped whatever was after the
     * `#`. It runs while the mode is being resolved — before the Education
     * panel mounts — which is how a teacher's exercise link stopped working:
     * `#edu-ex=…` was gone by the time anything looked for it, and the student
     * landed on the exercise list wondering what they had been sent. Shared
     * MODEL links (`#…` from url-sharing) load from an earlier startup step, so
     * they were not caught by the same race, which is why this went unseen.
     */
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  /**
   * `?inspect=<elementId>` opens the section analysis on that member.
   *
   * Written for the blog: a post about torsion can embed the editor already
   * showing the section it is discussing, so the reader arrives at the figure
   * instead of hunting for it through three menus. It composes with the
   * existing `?embed` and `?example=` rather than adding a mode of its own.
   *
   * `t` is the station along the member, 0 to 1, and defaults to midspan.
   *
   * It waits for results, because the panel renders a stress state and there
   * is none until the model has been solved. The solve is dispatched by the
   * example loader just above, and finishes whenever the engine finishes;
   * polling briefly is simpler than threading a promise through it, and it
   * gives up rather than spinning if the solve never lands.
   */
  function openInspectFromUrl(params: URLSearchParams) {
    const raw = params.get('inspect');
    if (!raw) return;
    const elementId = Number(raw);
    // Integer, not merely finite: `?inspect=3.7` parsed fine and then polled
    // sixty times for an element id that cannot exist.
    if (!Number.isInteger(elementId)) return;
    /*
     * `?t=0` is the start of the member, and it used to become midspan.
     * `Number('0') || 0.5` is 0.5, because 0 is falsy — so the one station a
     * reader is most likely to ask for by hand was the one station this could
     * not open. Only a value that is not a number falls back now.
     */
    const requested = Number(params.get('t') ?? '0.5');
    const t = Number.isFinite(requested) ? Math.min(1, Math.max(0, requested)) : 0.5;

    let tries = 0;
    const open = () => {
      const element = modelStore.elements.get(elementId);
      const solved = resultsStore.results !== null || resultsStore.results3D !== null;
      if (element && solved) {
        const a = modelStore.nodes.get(element.nodeI);
        const b = modelStore.nodes.get(element.nodeJ);
        if (!a || !b) return;
        resultsStore.stressQuery = {
          elementId,
          t,
          worldX: a.x + (b.x - a.x) * t,
          worldY: a.y + (b.y - a.y) * t,
          worldZ: (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * t,
        };
        /*
         * On desktop Basic the section panel is docked inside the Advanced
         * tab of the right panel, so the query alone sets up an answer with
         * nowhere to appear. On mobile the panel floats and the query is
         * enough — which is why this looked like it worked on a phone and did
         * nothing on a laptop.
         */
        if (uiStore.appMode === 'basico' && !uiStore.isMobile) openBasicPanel('advanced');
        return;
      }
      if (tries++ < 60) setTimeout(open, 120);
    };
    open();
  }

  /**
   * `?proTab=<id>` opens PRO on one of its tabs.
   *
   * The companion of `?inspect` for the other half of the application. A post
   * about CIRSOC verification has to land the reader on the verification, and
   * that lives in PRO's `design` tab rather than in Basic's section panel.
   *
   * NOT named `tab`: that parameter already carries the project tab's slug
   * (see `replaceAppUrl`), and quietly overloading it would make a shared
   * link rename someone's project.
   */
  /**
   * `?kin=1` opens the kinematic analysis panel.
   *
   * The third of the deep links a post can use, beside `?inspect` and
   * `?proTab`. Unlike those two it waits for nothing: the report is derived
   * from geometry and supports alone, so it is ready before the solver is —
   * and on the model this exists for, the solver never succeeds at all.
   */
  function openKinematicFromUrl(params: URLSearchParams) {
    if (params.get('kin') !== '1') return;
    uiStore.showKinematicPanel = true;
    /*
     * On desktop Basic the report is docked inside the Advanced tab of the
     * right panel (see BasicPanel.svelte), so raising the flag on its own
     * opens a panel that is never mounted. On mobile it floats and the flag
     * is enough — the same asymmetry that made `?inspect` look like it
     * worked on a phone and did nothing on a laptop.
     *
     * No retry loop, unlike `openInspectFromUrl`: that one waits for the
     * solver, and this report needs only geometry and supports. By the time
     * the example loader resolves, both are in place.
     */
    if (uiStore.appMode === 'basico' && !uiStore.isMobile) openBasicPanel('advanced', { toggle: false });
  }

  function openProTabFromUrl(params: URLSearchParams) {
    const tab = params.get('proTab');
    if (!tab) return;
    // Mirrors the `ProTab` union in components/pro/ProPanel.svelte — a tab added
    // there but not here makes `?proTab=` silently no-op for it.
    const VALID = ['project', 'nodes', 'elements', 'shells', 'materials', 'sections', 'supports',
      'constraints', 'loads', 'advanced', 'results', 'design', 'connections', 'diagnostics'];
    if (!VALID.includes(tab)) return;
    uiStore.proActiveTab = tab;
  }

  function findTabBySlug(tabSlug: string | null) {
    if (!tabSlug) return null;
    return tabManager.tabs.find(tab => slugifyTabName(tab.name) === tabSlug) ?? null;
  }

  function shouldShowLanding() {
    const params = new URLSearchParams(location.search);
    return !params.has('embed') && !isAppRoute(location.pathname) && !isDemoRoute(location.pathname)
      && !isBlogRoute(location.pathname);
  }

  let showLanding = $state(shouldShowLanding());
  let showBlog = $state(typeof window !== 'undefined' && isBlogRoute(location.pathname));
  /** The address the blog reads its slug from; kept in state so it is reactive. */
  let blogPath = $state(typeof window !== 'undefined' ? parsePublicPath(location.pathname).path : '/blog');

  /**
   * Move between the public pages without reloading the document.
   *
   * The site is a static bundle, so a real navigation to /blog would be a 404
   * that bounces through `/?route=/blog`. Everything public — the landing's
   * blog entry, the blog's own links, the way back home — comes through here.
   */
  function navigatePublic(path: string) {
    // Public links are written unprefixed ('/blog') and land prefixed
    // ('/pt/blog'), so a language never falls off mid-visit.
    history.pushState(null, '', publicHref(path, publicI18n.locale));
    syncRouteState();
  }

  function enterApp() {
    if (!isAppRoute(location.pathname)) {
      history.pushState(null, '', modeToPath(currentAppMode));
    }
    showLanding = false;
    showBlog = false;
  }

  function syncRouteState() {
    adoptLocaleFromPath();
    showBlog = isBlogRoute(location.pathname);
    blogPath = publicRoute(location.pathname).path;
    showLanding = shouldShowLanding();
    if (!showLanding && !showBlog) {
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
    window.addEventListener('stabileo-navigate', (e) => {
      const path = (e as CustomEvent<string>).detail;
      if (typeof path === 'string') navigatePublic(path);
    });
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
    uiStore.leftDrawerOpen = false;
    uiStore.rightDrawerOpen = false;
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
      // Note: self-weight defaults ON in PRO via the per-mode selfWeightPro
      // state — do not force it here, or a user's explicit opt-out would be
      // silently reverted on every mode round-trip (double-counting gravity).
      resultsStore.showReactions = false;
      resultsStore.showConstraintForces = false;
    }
    currentAppMode = target;
    replaceAppUrl(target, modelStore.model.name);
  }

  let showDxfImport = $state(false);
  let dxfImportFile = $state<File | null>(null);
  // CAD → RC draft wizard (PRO/3D modes route DXF files here instead of the
  // 2D bar-model import dialog).
  let showCadWizard = $state(false);
  let cadWizardFile = $state<File | null>(null);
  const dxfGoesToCadWizard = () =>
    uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro';
  let showIfcImport = $state(false);
  let ifcImportFile = $state<File | null>(null);
  let ifcFileInput: HTMLInputElement;
  let dxfFileInput: HTMLInputElement;

  let showImportDialog = $state(false);
  let importText = $state('');
  let autosaveData = $state<DedalFile | null>(null);
  /** When the offered save was written, and whether it is the newest one that exists. */
  let autosaveStamp = $state<{ timestamp: string | null; older: boolean }>({ timestamp: null, older: false });
  /** True once the user has explicitly Restored or Discarded the pending save. */
  let autosaveDismissed = $state(false);
  let autosaveInterval: ReturnType<typeof setInterval> | null = null;

  /** Banner visibility: autosave exists, mode matches, user hasn't dismissed,
   *  and the user hasn't started editing a different project. */
  const showAutosaveBanner = $derived.by(() => {
    if (!autosaveData || autosaveDismissed) return false;
    // Legacy autosaves predate the appMode field — infer it from analysisMode
    // (the same derivation uiStore.appMode uses) so pre-existing PRO/edu saves
    // remain reachable instead of silently defaulting to basico.
    const savedMode = autosaveData.appMode
      ?? (autosaveData.analysisMode === 'pro' ? 'pro'
        : autosaveData.analysisMode === 'edu' ? 'educativo'
        : 'basico');
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
      // Same convention note as a .ded open — an autosave predating the metadata
      // is restored under the corrected convention, so warn if it's a legacy 3D model.
      noteAxisConventionMigrationIfNeeded(autosaveData.snapshot, autosaveData.analysisMode);
      // Restore analysis mode and axis convention from autosave
      if (autosaveData.analysisMode) uiStore.analysisMode = autosaveData.analysisMode;
      if (autosaveData.axisConvention3D) uiStore.axisConvention3D = autosaveData.axisConvention3D;
      if (autosaveData.viewportPresentation3D) uiStore.viewportPresentation3D = autosaveData.viewportPresentation3D;
      // Restoring analysisMode may change the derived appMode (e.g. a legacy
      // PRO autosave restored from a basico banner) — keep the route state in sync.
      currentAppMode = uiStore.appMode;
      replaceAppUrl(currentAppMode, modelStore.model.name);
      resultsStore.clear();
    }
    autosaveDismissed = true;
  }

  function discardAutosave() {
    void clearAutosave();
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
        // selectedLoads holds load data ids (stable across array mutations)
        const ids = [...uiStore.selectedLoads];
        modelStore.batch(() => {
          for (const id of ids) modelStore.removeLoad(id);
        });
        uiStore.clearSelectedLoads();
        resultsStore.clear();
        return;
      }
      if (uiStore.selectedNodes.size > 0 || uiStore.selectedElements.size > 0 || uiStore.selectedShells.size > 0) {
        // Delete strictly from the EXPLICIT selection channels (mirrors
        // Toolbar.handleKeydown) — never infer an entity kind from a numeric id.
        // Frames, plates and quads have independent id spaces, and shells live
        // ONLY in selectedShells ("p<id>"/"q<id>"). The previous PRO handler
        // re-derived shells from selectedElements ids (the exact id-collision bug
        // delete-selection.ts fixes) and ignored selectedShells entirely, so a
        // plate/quad selected in the 3D viewport could not be deleted by keyboard.
        const targets = resolveDeleteTargets(
          { nodes: uiStore.selectedNodes, elements: uiStore.selectedElements, shells: uiStore.selectedShells },
          (id) => modelStore.elements.has(id),
        );
        modelStore.deleteEntities(targets);
        uiStore.clearSelection();
        resultsStore.clear();
        return;
      }
    }
  }

  function handleOpenPanelEvent(e: Event) {
    const panel = (e as CustomEvent<string>).detail;
    /*
     * `toggle: false` — "open" means open.
     *
     * The default is a toggle, which is right for a button that owns its panel
     * and wrong for a walkthrough: two consecutive steps both asking for the
     * results panel closed it on the second, and the card that followed
     * pointed at a panel it had just dismissed.
     *
     * A `null` detail CLOSES it. On a phone the panel is a sheet over the
     * model, so a command that has finished its job — picking an example — has
     * to be able to get out of the way of the thing it just produced.
     */
    if (panel === null) { closeBasicPanel(); return; }
    if (typeof panel === 'string') openBasicPanel(panel, { toggle: false });
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
    } else {
      uiStore.analysisMode = '2d';
    }

    // Initialize WASM solver (non-blocking, fallback to JS if it fails)
    import('./lib/engine/wasm-solver').then(m => m.initSolver()).then(() => {
      // Canonical section geometry needs the engine. Sections created or
      // loaded before it was ready could only resolve as properties-only, and
      // nothing else revisits that, so resolve them now that it is up.
      modelStore.refreshCanonicalSections();
    }).catch(() => {
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
      /*
       * `/demo` opens the shortest walkthrough rather than the old fourteen-step
       * tour of everything. The rest are in Project → Tutorials, where someone
       * who wants one can pick the question they actually have.
       */
      setTimeout(() => startDemo(DEFAULT_DEMO), 600);
    }

    // Check for URL hash (shared model link or embed)
    const hashMode = loadFromURLHash();
    const queryParams = new URLSearchParams(location.search);
    if (hashMode === 'embed' || queryParams.has('embed')) {
      uiStore.embedMode = true;
    }

    // Landing demo iframe uses ?example=<id> to pre-load a sample structure
    const exampleId = queryParams.get('example');
    if (exampleId) {
      setTimeout(() => {
        modelStore.loadExample(exampleId).then(() => {
          resultsStore.clear();
          resultsStore.clear3D();
          window.dispatchEvent(new Event('stabileo-solve'));
          // Fire zoom-to-fit repeatedly until the canvas has non-zero size:
          // inside an iframe the canvas is 0×0 during first paint, so a single
          // event lands before the viewport is ready.
          const tryFit = (attempt: number) => {
            const canvas = document.querySelector('.viewport-container canvas') as HTMLCanvasElement | null;
            if (canvas && canvas.width > 0 && canvas.height > 0) {
              window.dispatchEvent(new Event('stabileo-zoom-to-fit'));
              return;
            }
            if (attempt < 40) setTimeout(() => tryFit(attempt + 1), 60);
          };
          tryFit(0);
          openInspectFromUrl(queryParams);
          openProTabFromUrl(queryParams);
          openKinematicFromUrl(queryParams);
        }).catch((err) => {
          /*
           * Reported, not swallowed.
           *
           * This used to be an empty catch commented "silently ignore unknown
           * example ids", and it did far more than that: a fixture missing
           * `plates` threw `json.plates is not iterable` from inside the
           * loader, the whole `then` above was skipped, and the page rendered
           * a half-loaded model with no deep link applied and no sign that
           * anything had failed. An unknown id is worth ignoring quietly; a
           * broken one is not.
           */
          console.error(`[stabileo] example "${exampleId}" failed to load:`, err);
        });
      }, 80);
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
      //
      // IndexedDB is asynchronous, so this cannot block the mount the way the
      // localStorage read did. It resolves into `$state` instead, and the banner —
      // already derived — appears when it arrives. `loadAutosave` has already told the
      // user about anything it had to refuse; `autosaveStamp` carries the same fact into
      // the banner, so "this is not your newest save" is on screen and not only in a toast.
      if (!savedWorkspace) {
        void loadAutosave().then((result) => {
          if (result.value && result.value.snapshot.nodes.length > 0) {
            autosaveData = result.value;
            autosaveStamp = { timestamp: result.timestamp, older: result.rejected.length > 0 };
          }
        });
      }
    }

    // Setup autosave every 30s. Never overwrite the (single, mode-shared)
    // autosave with an empty model: the loader ignores empty snapshots anyway, and an
    // empty write would destroy a pending save from another mode whose restore banner
    // is currently hidden by the mode-match gate. `requestAutosave` enforces that.
    //
    // The timer is the FLOOR, not the mechanism. Every operation that produces minutes of
    // computed state — solve, design, floor design, detailing — asks for a save when it
    // finishes, because losing one of those to a 30 s window is losing the run.
    autosaveInterval = setInterval(() => {
      void requestAutosave('timer');
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
    const handleDxfImportEvent = () => {
      // PRO/3D: open the CAD → RC draft wizard EMPTY (step 1 offers template
      // download + "Open DXF file"). 2D keeps the legacy file-picker-first flow.
      if (dxfGoesToCadWizard()) {
        cadWizardFile = null;
        showCadWizard = true;
      } else {
        dxfFileInput?.click();
      }
    };
    window.addEventListener('stabileo-import-dxf', handleDxfImportEvent);
    const handleDxfDropEvent = (e: Event) => {
      const ce = e as CustomEvent<File>;
      if (dxfGoesToCadWizard()) {
        cadWizardFile = ce.detail;
        showCadWizard = true;
      } else {
        dxfImportFile = ce.detail;
        showDxfImport = true;
      }
    };
    window.addEventListener('stabileo-dxf-drop', handleDxfDropEvent);
    const handleIfcImportEvent = () => { ifcFileInput?.click(); };
    window.addEventListener('stabileo-import-ifc', handleIfcImportEvent);

    // Global solve event — always mounted (mobile bottom bar dispatches this)
    // Cancel any pending debounced live calc so the manual solve supersedes it.
    const handleGlobalSolve = () => { cancelPendingLiveCalc(); runGlobalSolve(); };
    window.addEventListener('stabileo-solve', handleGlobalSolve);
    /*
     * Open a right-hand panel from outside the ribbon.
     *
     * The guided walkthroughs need this: a step that points at a button
     * inside the Advanced panel has nothing to point at while the panel is
     * shut, and reaching into `openBasicPanel` from a step definition would
     * put a piece of the shell's layout inside a data structure that
     * describes tour cards.
     */
    window.addEventListener('stabileo-open-panel', handleOpenPanelEvent);

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
      window.removeEventListener('stabileo-open-panel', handleOpenPanelEvent);
      window.removeEventListener('popstate', onPopState);
    };
  });

  /**
   * The address bar follows the editor's mode — but only while the editor is
   * what the reader is looking at. The blog is a public page mounted over the
   * same application instance, so without the `showBlog` guard this rewrote
   * /blog/<slug> to /app/basic the moment a post opened: the page was right
   * and the URL was wrong, which is the worst of both, since the link a reader
   * copies or reloads is the wrong one.
   */
  $effect(() => {
    if (showLanding || showBlog || typeof window === 'undefined') return;
    replaceAppUrl(uiStore.appMode, modelStore.model.name);
  });

  // Reactive auto-clear results + debounced live calculation on model changes
  let prevModelVersion = -1;
  let prevAnalysisMode = '';
  let liveCalcTimer: ReturnType<typeof setTimeout> | null = null;

  /** Cancel any pending debounced live calc (e.g. when manual solve supersedes it). */
  function cancelPendingLiveCalc(): void {
    if (liveCalcTimer) {
      clearTimeout(liveCalcTimer);
      liveCalcTimer = null;
    }
  }

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

      // If live calc is ON, debounce the auto-solve to avoid firing on every
      // tiny model mutation while the user is dragging or typing.
      // Manual solve (runGlobalSolve) remains immediate and cancels any pending debounce.
      if (_lc && _mode !== 'pro' && _mode !== 'edu') {
        cancelPendingLiveCalc();
        const delay = (_mode === '2d') ? 120 : 200;
        liveCalcTimer = setTimeout(() => {
          liveCalcTimer = null;
          runLiveCalc(_mode, uiStore.axisConvention3D, prevDiagram);
        }, delay);
      }
    });

    // Cleanup: cancel pending timer when effect re-runs or component unmounts
    return () => { cancelPendingLiveCalc(); };
  });

  // ─── PRO panel drag-resize ────────────────────────────────────────
  let proPanelRef: any = $state(null);
  /**
   * What `ProPanel.canSolve()` answers, for when there is no panel to ask.
   *
   * It is `hasModel && !solving` there, and `hasModel` is exactly this — see
   * `ProPanel.svelte`. `solving` is that component's own state and cannot be
   * read from here, but it does not have to be: this value is only consulted
   * when no panel is mounted, and a solve cannot be running inside a component
   * that does not exist.
   *
   * Kept next to `proPanelRef` on purpose. If `canSolve()` there ever grows a
   * condition, this is the other half that has to learn about it.
   */
  const proMobileCanSolve = $derived(
    modelStore.nodes.size > 0 && modelStore.elements.size > 0,
  );
  let proExBtnEl = $state<HTMLButtonElement | undefined>(undefined);
  let proSettingsOpen = $state(false);
  /**
   * The settings panel element, for focus and for the outside-click test.
   *
   * Focus moves into the panel on open and back to the gear on close: the panel covers part of
   * the ribbon, so leaving focus on a button underneath it is the same defect the 3-D workspace
   * had. `dialog-focus.ts` owns the mechanism.
   */
  let proSettingsEl = $state<HTMLDivElement | null>(null);
  $effect(() => {
    if (!proSettingsOpen) return;
    return captureFocus(proSettingsEl);
  });

  // PRO toolbar dropdown state
  type ProDropdown = null | 'select' | 'geometry' | 'properties' | 'conditions' | 'analysis';
  let openDropdown = $state<ProDropdown>(null);

  function toggleDropdown(dd: ProDropdown) {
    openDropdown = openDropdown === dd ? null : dd;
  }

  /** Close dropdown when clicking outside the toolbar. */
  function handleProBarClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    if (openDropdown && !target?.closest('.pro-bar')) {
      openDropdown = null;
    }
    // The settings panel closes on a click anywhere outside its own anchor — which includes the
    // gear itself, whose own handler has already toggled the state by the time this runs, so
    // the anchor has to be the boundary rather than the panel.
    if (proSettingsOpen && !target?.closest('.settings-anchor')) {
      proSettingsOpen = false;
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

{#if showBlog}
  <BlogPage path={blogPath} />
{:else if showLanding}
  <LandingPage />
{/if}

{#snippet autosavePrompt()}
      <div class="autosave-inline" class:autosave-older={autosaveStamp.older} data-testid="autosave-prompt">
        <span class="autosave-text">
          {t('app.autosaveFound')} <strong>{autosaveData?.name}</strong>
          {#if autosaveStamp.timestamp}
            <span class="autosave-stamp">({new Date(autosaveStamp.timestamp).toLocaleString()})</span>
          {/if}
        </span>
        {#if autosaveStamp.older}
          <!-- Said here, not only in a toast: a user who dismissed the toast must still be
               able to see that what they are about to restore is not their newest save. -->
          <span class="autosave-warning">{t('file.autosaveOlderRestored')}</span>
        {/if}
        <button class="banner-btn restore" onclick={restoreAutosave}>{t('app.restore')}</button>
        <button class="banner-btn discard" onclick={discardAutosave}>{t('app.discard')}</button>
      </div>
{/snippet}

<div class="app-container" class:embed-mode={uiStore.embedMode} class:hidden-behind-landing={showLanding || showBlog}>
  <header class="app-header" class:has-autosave={showAutosaveBanner}>
    <div class="logo">
      <button class="logo-home" onclick={() => { history.pushState(null, '', '/'); syncRouteState(); }} title={t('app.backHome')}>
        <span class="logo-icon">△</span>
        <span class="logo-text">Stabileo</span>
      </button>
      <!--
        A handed-out exercise is not a session with three modes in it.
        ─────────────────────────────────────────────────────────────
        A student who follows a teacher's link was given ONE thing to do.
        Offering them Basic and PRO, a tab strip and a "+" for a new project
        is offering exits from the only room they were sent to — and the tab
        said "New Structure" while the panel said "Simply supported beam",
        so the window disagreed with itself about what was open.
      -->
      {#if eduStore.isHandout}
        <span class="handout-title" data-testid="edu-handout-title">{eduStore.exercise?.title}</span>
      {:else if uiStore.isMobile}
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
    {#if !eduStore.isHandout}
      <span class="separator">|</span>
      <TabBar />
    {/if}

    <!--
      "A saved project was found — Restore / Discard", beside the tabs.
      ────────────────────────────────────────────────────────────────
      Inline here on a DESKTOP, where the row has the width for it — the tabs
      are what it is about, since restoring opens one.

      Not on a phone. This header holds a logo, a mode selector, a project name
      and a settings button in 375 px; the prompt was rendered into whatever was
      left, which measured **19 px wide by 54 tall** — present in the DOM, past
      every test that asks whether it exists, and unreadable. It is drawn over
      the top of the model instead; see the viewport below.
    -->
    {#if showAutosaveBanner && !uiStore.isMobile}
      {@render autosavePrompt()}
    {/if}

    <div class="header-actions">
      <button class="btn btn-help" onclick={() => uiStore.showHelp = true} title={t('app.keyboardShortcuts')}>
        ?
      </button>
      <!--
        Three languages, fully maintained. The other eleven dictionaries still exist and still
        work — `tAt` falls back to English per key — but they are largely English underneath, so
        offering them promised a translation the app could not keep. See `OFFERED_LOCALES`.
      -->
      <select
        class="lang-select"
        data-testid="lang-select"
        aria-label={t('app.language')}
        value={i18n.locale}
        onchange={(e) => { setLocale((e.currentTarget as HTMLSelectElement).value); tabManager.updateDefaultNames(); }}
      >
        {#each OFFERED_LOCALES as code (code)}
          <option value={code}>{t(`lang.${code}`)}</option>
        {/each}
      </select>

      <!--
        Settings sits with the other application-level controls — help and
        language — rather than in the ribbon. It configures the application,
        not the document, which is what everything else in this corner does.
      -->
      <!--
        At every width, now.
        ────────────────────
        This was `!uiStore.isMobile`, which took the button off a phone — while
        the language selector had been moved INTO the panel it opens, precisely
        because the header slot was too expensive at that width. The setting was
        hidden from where it was and hosted where nothing could open it, and the
        control-size preference later joined it there.

        A phone keeps it in the same corner as a desktop for the same reason it
        is here at all: it configures the application rather than the document,
        and the corner is where the application-level controls live. Same place
        on both, so there is one thing to learn.
      -->
      {#if uiStore.appMode === 'basico'}
        <button
          class="btn btn-settings"
          class:on={basicPanel === 'settings'}
          onclick={() => openBasicPanel('settings')}
          title={t('ribbon.settings')}
          aria-label={t('ribbon.settings')}
          data-testid="rb-settings"
        ><Icon name="settings" size={16} /></button>
      {/if}
      <!--
        PRO puts settings in the same corner, for the same reason — and the panel it opens is
        anchored HERE, to the button, not left behind in the app body.

        It was left behind, and that is the whole bug report "the settings button does nothing".
        The panel is `position: absolute; top: 100%`, so it needs a positioned ancestor to
        measure from. On PR19 it sat inside `<nav class="pro-bar">`, which was `position:
        relative`, and `top: 100%` meant "just under the bar". The ribbon replaced that nav, the
        panel became a child of `.app-body` — also positioned — and `top: 100%` started meaning
        "one full app-body below the top of the app body", i.e. off the bottom of the window.
        Every click worked. The state flipped, the panel mounted, and it rendered where nobody
        could see it.
      -->
      <!--
        At every width, as in Basic. It was `!isMobile`, so a phone had no way
        into PRO's settings at all — the same omission Basic had, found the same
        way, and fixed the same way: the corner is where the application-level
        controls live and a phone has that corner too.
      -->
      {#if uiStore.appMode === 'pro'}
        <div class="settings-anchor">
          <button
            class="btn btn-settings"
            class:on={proSettingsOpen}
            onclick={() => (proSettingsOpen = !proSettingsOpen)}
            title={t('config.title')}
            aria-label={t('config.title')}
            aria-haspopup="dialog"
            aria-expanded={proSettingsOpen}
            aria-controls="pro-settings-panel"
            data-testid="pro-settings"
          ><Icon name="settings" size={16} /></button>

          {#if proSettingsOpen}
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <div
              class="pro-settings-dropdown"
              id="pro-settings-panel"
              data-testid="pro-settings-panel"
              role="dialog"
              aria-label={t('config.title')}
              bind:this={proSettingsEl}
              tabindex="-1"
              onkeydown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); proSettingsOpen = false; } }}
            >
              <header class="pro-settings-head">
                <h2>{t('config.title')}</h2>
                <button
                  class="pro-settings-close"
                  onclick={() => (proSettingsOpen = false)}
                  aria-label={t('config.close')}
                  data-testid="pro-settings-close"
                >✕</button>
              </header>
              <ToolbarConfig inline={true} />
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </header>

  <!--
    One shell, both widths.
    ───────────────────────
    Mobile used to mount a different application here: the old left Toolbar in a
    drawer plus a floating tool strip, while everything built since the ribbon
    landed — the pointer mode on the model, the Selection panel, the results
    selectors, the colour-scale switch, the walkthroughs — was reachable only
    through the ribbon. Any new work on Basic had to be done twice or it
    silently shipped to desktop alone, and that is how a phone came to have no
    way at all to reach half the application.

    The ribbon DEGRADES rather than forking. Below 768 px it drops to icons on
    one horizontally scrollable row, the group captions give way to the rules
    that already separate the groups, and the document commands move to the end
    so the per-gesture ones keep the reachable side. Four size variants, no
    variant dropping a command — see `Ribbon.svelte`.
  -->
  {#if uiStore.appMode === 'basico'}
    <Ribbon onOpenPanel={openBasicPanel} activePanel={basicPanel} activeDataTab={basicDataTab} />
    <ToolOptionsBar />
  {/if}

  <!--
    The bottom-bar reservation follows the bottom bar.
    ─────────────────────────────────────────────────
    `.app-body` gave up 60 px at the foot of every phone screen for the mobile
    bar. Basic has no bar any more, and an unconditional reservation would leave
    a 60 px band of nothing under the canvas — on the axis this whole revamp is
    trying to buy back.
  -->
  <div
    class="app-body"
    class:app-body-pro={uiStore.appMode === 'pro'}
    class:app-body-bottom-bar={uiStore.isMobile && uiStore.appMode !== 'basico'}
    class:app-body-sheet={uiStore.isMobile
      && ((uiStore.appMode === 'basico' && !!basicPanel)
        || (uiStore.appMode === 'pro' && uiStore.rightDrawerOpen))}
  >

    {#if uiStore.appMode === 'pro' && !uiStore.isMobile}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
        <ProRibbon
          onExamples={(btn) => { uiStore.proPanelVisible = true; proPanelRef?.examples(btn); }}
          onSolve={() => { uiStore.proPanelVisible = true; proPanelRef?.solve(); }}
          onReport={() => { uiStore.proPanelVisible = true; proPanelRef?.report(); }}
          canSolve={proPanelRef?.canSolve() ?? false}
          canReport={proPanelRef?.canReport() ?? false}
          isSolving={proPanelRef?.isSolving() ?? false}
          errorCount={proPanelRef?.errorCount() ?? 0}
          proPanel={uiStore.proActiveTab}
          onOpenProject={() => { uiStore.proActiveTab = 'project'; uiStore.proPanelVisible = true; }}
        />
    {/if}

    <!--
      PRO's phone bar.
      ────────────────
      The desktop shows four STAGES and, under the one you are in, its groups.
      That cannot be shrunk: ANALYSE alone carries fifteen commands and a touch
      row holds about nine. So the row keeps only what is per-gesture — the
      pointer, undo, redo, solve — plus the stage you are in, and the stage's
      commands are drawn as a grid inside the panel, where they can wrap.

      The consequence that matters for a mode still being built: adding a
      command changes the grid's length and nothing else. This row is a fixed
      set of verbs and it stays that size however large PRO gets.

      Same slot rules as Basic's: `flex: 1 1 0`, so the row is exactly as wide
      as the screen at every width and never scrolls.
    -->
    {#if uiStore.appMode === 'pro' && uiStore.isMobile}
      <!--
        A positioned wrapper, because the stage menu is `top: 100%` of it.
        Without one it resolves against a distant ancestor and opens at the
        bottom of the page — the same way Basic's cluster menu did before
        `.ribbon` was given a `position`, and it is invisible until someone
        opens the menu on a phone.
      -->
      <div class="pmt-wrap">
      <div class="pro-mobile-toolbar">
        <button class="pmt-btn" onclick={() => historyStore.undo()} disabled={!historyStore.canUndo} title={t('toolbar.undo')}
        ><Icon name="undo" size={18} /></button>
        <button class="pmt-btn" onclick={() => historyStore.redo()} disabled={!historyStore.canRedo} title={t('toolbar.redo')}
        ><Icon name="redo" size={18} /></button>

        <span class="pmt-rule" aria-hidden="true"></span>

        <!--
          Selection arms the pointer AND shows its options in the sheet below,
          which is where a phone has room for five translated words. On a
          desktop those chips ride in the bar; here the bar has six slots.
        -->
        <button
          class="pmt-btn pmt-pointer"
          class:armed={uiStore.currentTool === 'select'}
          onclick={() => {
            const on = uiStore.currentTool === 'select';
            uiStore.currentTool = on ? 'pan' : 'select';
            if (!on) uiStore.rightDrawerOpen = true;
          }}
          title={uiStore.currentTool === 'select' ? t('float.select') : t('float.pan')}
          data-testid="pmt-pointer"
        ><Icon name={uiStore.currentTool === 'select' ? 'select' : 'pan'} size={19} /></button>

        <!--
          Calcular cannot ask the panel whether it can solve, because on a
          phone the panel is not there to ask.
          ─────────────────────────────────────────────────────────────────
          `proPanelRef` is bound by the PRO panel, and on a phone that panel
          mounts only inside `{#if uiStore.isMobile && uiStore.rightDrawerOpen}`.
          With the sheet closed there is no instance, so the ref is null —
          `!(null?.canSolve() ?? false)` is `true` and the button renders
          disabled. Disabled, its own onclick cannot fire, so it cannot open
          the sheet that would create the panel that would enable it. On first
          load the sheet IS closed, so Calcular was dead until the reader
          happened to press Selection (the only other control that opens it),
          and went dead again on every close.

          So: ask the panel while it exists, and the model otherwise. Nothing
          can be mid-solve when no panel is mounted, which is the only part of
          `canSolve()` the model cannot answer.
        -->
        <button
          class="pmt-btn pmt-solve"
          onclick={async () => {
            uiStore.rightDrawerOpen = true;
            // The panel does not exist yet on the first press — it mounts as a
            // result of the line above. `tick()` waits for that, and then the
            // solve goes through ProPanel so it keeps the pre-solve quality
            // gate; dispatching `stabileo-solve` instead would skip it.
            await tick();
            proPanelRef?.solve();
          }}
          disabled={!(proPanelRef ? proPanelRef.canSolve() : proMobileCanSolve)}
          title={t('pro.solve')}
          data-testid="pmt-solve"
        ><Icon name="solve" size={19} /></button>

        <!--
          The camera stack, as one split button.
          ──────────────────────────────────────
          The face is whichever view control you used last — Zoom-to-fit until
          you choose otherwise — and the caret opens the rest, each with its
          name, because ⊤ and ⊡ and ⊟ are not self-explanatory at 11 px. The
          nine buttons that used to run down the right edge of the model are
          gone from it; see `lib/pro/camera-actions.ts`.
        -->
        <div class="pmt-split">
          <button
            class="pmt-btn pmt-cam"
            onclick={() => camPicked.run()}
            class:armed={camPicked.active?.() ?? false}
            title={t(camPicked.labelKey)}
            data-testid="pmt-camera"
          >
            {#if camPicked.icon}
              <Icon name={camPicked.icon} size={19} />
            {:else}
              <span class="pmt-cam-glyph">{camPicked.glyph}</span>
            {/if}
          </button>
          <button
            class="pmt-cam-more"
            class:open={camMenu}
            onclick={() => camMenu = !camMenu}
            aria-expanded={camMenu}
            aria-label={t('viewport3d.zoomToFit')}
            data-testid="pmt-camera-more"
          ><span class="pmt-caret" aria-hidden="true"></span></button>
        </div>
      </div>

      {#if camMenu}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="pmt-backdrop" onclick={() => camMenu = false}></div>
        <div class="pmt-menu" data-testid="pmt-camera-menu">
          {#each camActions as ca (ca.id)}
            <button
              class="pmt-menu-item pmt-cam-item"
              class:active={ca.active?.() ?? false}
              data-testid="pmt-cam-{ca.id}"
              onclick={() => { camPickId = ca.id; ca.run(); camMenu = false; }}
            >
              <span class="pmt-cam-item-icon">
                {#if ca.icon}<Icon name={ca.icon} size={17} />{:else}{ca.glyph}{/if}
              </span>
              <span>{t(ca.labelKey)}</span>
            </button>
          {/each}
        </div>
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
        <!-- Instruction for the armed-but-unanswered stress mode. Inside the
             viewport container because it points at the canvas it belongs to. -->
        <!--
          The restore offer, over the top of the model.
          ────────────────────────────────────────────
          Phone only, and inside the viewport so it lands under whatever shell
          that mode happens to have — Basic's ribbon and options bar are 87 px
          taller than PRO's single row, and an offset measured against the
          window would be wrong for one of them. Clear of the canvas's own
          controls on the right, the same 56 px the toasts leave.
        -->
        {#if showAutosaveBanner && uiStore.isMobile}
          <div class="autosave-over-model" data-testid="autosave-over-model">
            {@render autosavePrompt()}
          </div>
        {/if}
        <StressPickHint />
        <!-- The colour map's scale. One component for both viewports: the ramp
             is defined once, so the legend that explains it should be too. -->
        <ColourScaleLegend />
        {#if uiStore.simplified2DMode}
          {@const st = uiStore.simplified2DStats}
          <div class="simplified-banner">
            <!--
              A slice and a projection are different models with different
              things wrong with them, and the banner is the only place that
              says which one you are looking at. "Simplified" covered both and
              told you nothing about either — a cut at Y = 6 is not simplified,
              it is one frame of the building, and reading its results as the
              whole structure's is the mistake this line exists to prevent.
            -->
            <span>
              {#if st?.offset !== undefined && st.plane}
                {t('switch2d.sliceBanner')} — {st.plane === 'xy' ? 'Z' : st.plane === 'xz' ? 'Y' : 'X'} = {st.offset} m
              {:else}
                {t('app.simplified2d.banner')}
              {/if}
            </span>
            {#if st}
              <span class="simplified-stats">
                {st.mergedNodes > 0 ? `${st.mergedNodes} ${t('app.simplified2d.merged')}` : ''}
                {st.removedElements > 0 ? ` · ${st.removedElements} ${t('app.simplified2d.removed')}` : ''}
                {st.duplicateElements > 0 ? ` · ${st.duplicateElements} ${t('app.simplified2d.duplicates')}` : ''}
                {(st.droppedCrossing ?? 0) + (st.droppedElsewhere ?? 0) > 0
                  ? ` · ${(st.droppedCrossing ?? 0) + (st.droppedElsewhere ?? 0)} ${t('switch2d.leftBehind')}`
                  : ''}
                <!--
                  And the load, which is the one that has to survive to HERE.
                  The dialog warns before the cut; this banner is what stays on
                  screen while the results are read. Missing members make a
                  frame look weaker than it is, and a reader distrusts it.
                  Missing LOAD makes it look stronger — it solves, reports zero,
                  and reads as safe — so the count belongs in the standing
                  context and not only in the moment before the decision.
                -->
                {#if (st.droppedLoads ?? 0) > 0}
                  <!-- Its own element, with a test id, so the guard on it can
                       be written without pinning a translated string. -->
                  <span data-testid="s2d-dropped-loads" data-count={st.droppedLoads}
                  >{' · '}{st.droppedLoads} {t('switch2d.loadsLeftBehind')}</span>
                {/if}
              </span>
            {/if}
          </div>
        {/if}
        <!--
          Education gets the drawing tools while a teacher is authoring.
          ─────────────────────────────────────────────────────────────
          The authoring form's first and default option reads "draw the
          structure with the usual tools, then take it" — and Education
          mounts no ribbon, no toolbar and no floating tools, so there were
          no tools to draw with. The form even said so two lines below, and
          sent the teacher to Basic to build the model, save a file and come
          back to open it.

          Node, element, support, load and their options, and nothing about
          solving or results, which an exercise author has no use for.

          Education ONLY, now. This strip used to be Basic's phone toolbar as
          well, which made it half of the parallel mobile interface: the tools
          were here while every other command was on a ribbon the phone never
          mounted. Basic now mounts the ribbon at every width, and the armed
          tool's options belong to `ToolOptionsBar` under it — so keeping the
          strip on a phone would be two controls for one job, one of them
          floating over the model.
        -->
        {#if uiStore.appMode === 'educativo' && eduStore.authoring}
          <FloatingTools />
        {/if}
        <!--
          Advanced analyses float over the canvas only where there is nothing to
          dock them into. In Basic the right panel is that place — at BOTH
          widths, since the phone has it too now — and BasicPanel renders them
          there instead; otherwise Kinematic and Explore end up as two boxes
          covering the structure they describe, which on a 375 px screen means
          covering all of it.
        -->
        {#if uiStore.appMode !== 'basico'}
          <WhatIfPanel />
          <SectionStressPanel />
          <KinematicPanel />
        {/if}
        <MobileResultsPanel />
        <!--
          Basic only, but in BOTH its layouts. The shortcuts used to ride along
          inside the left Toolbar, which desktop no longer renders — so they
          worked on the phone and nowhere else.

          Not in PRO: `handleProKeydown` above already owns Ctrl+Z/Y there, and
          mounting both made one keystroke undo twice.
        -->
        {#if uiStore.appMode === 'basico'}
          <KeyboardShortcuts />
        {/if}
      </main>
    </div>

    <!--
      The one panel a ribbon command opens, at both widths.
      ────────────────────────────────────────────────────
      On a phone it lays itself out as a bottom sheet rather than a side panel —
      see the size variant in `BasicPanel.svelte`. That is the same decision the
      old right drawer already made and for the same measured reason: as a side
      drawer it took 319 px of 375, so opening the results hid the structure
      they describe. The two have to share the axis there is more of.
    -->
    {#if uiStore.appMode === 'basico' && basicPanel}
      <BasicPanel panel={basicPanel} bind:dataTab={basicDataTab} onClose={closeBasicPanel} />
    {/if}

    {#if !uiStore.isMobile}
      {#if uiStore.appMode === 'pro'}
        <!--
          Closed means hidden, not unmounted.
          ─────────────────────────────────────
          The ribbon is bound to this panel's instance (`bind:this`): Solve, Report,
          the example menu and the MODEL badge's error count all live on it. The ✕
          used to unmount the panel, which nulled that binding — the ribbon's
          commands silently no-opped and the badge read "✓ clean" on a model with
          errors. Hiding keeps the instance alive, so closing the panel changes
          what you see and nothing else. Both viewports resize themselves with a
          ResizeObserver, so the canvas follows without help.
        -->
        <aside
          class="sidebar right pro-sidebar"
          class:pro-sidebar-closed={!uiStore.proPanelVisible}
          style:width="{uiStore.proPanelWidth}px"
          style:overflow="visible"
        >
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="pro-resize-handle" onmousedown={(e) => startProResize(e)}></div>
          <!--
            The panel closes from its own top-right corner.
            ─────────────────────────────────────────────
            Closing it used to be a `▧` button in the command bar, three metres
            of screen away from the thing it closed and next to controls that do
            something else entirely. A ✕ in the panel's own corner is where every
            panel in the application is dismissed, including Basic's.

            Width still comes from dragging the left edge, which is the gesture
            already there and the one that lets you see the result as you drag.
          -->
          <button
            class="pro-panel-close"
            onclick={() => { uiStore.proPanelVisible = false; setTimeout(() => window.dispatchEvent(new Event('resize')), 50); }}
            title={t('ribbon.close')}
            aria-label={t('ribbon.close')}
            data-testid="pro-panel-close"
          >×</button>
          <ProPanel bind:this={proPanelRef} />
        </aside>
        {#if !uiStore.proPanelVisible}
          <!-- A closed panel has to be reopenable from where it closed. -->
          <!--
            A bare chevron on the canvas edge is not a clue. It says what it
            reopens, running up the tab, so a panel you closed is findable
            without hunting for a 16 px strip.
          -->
          <button
            class="pro-panel-reopen"
            onclick={() => { uiStore.proPanelVisible = true; setTimeout(() => window.dispatchEvent(new Event('resize')), 50); }}
            title={t('proRibbon.reopenPanel')}
            aria-label={t('proRibbon.reopenPanel')}
            data-testid="pro-panel-reopen"
          ><span class="ppr-text">‹ {t('proRibbon.reopenPanel')}</span></button>
        {/if}
      {:else if uiStore.appMode === 'educativo'}
        <aside class="sidebar right edu-sidebar">
          <EducativePanel />
        </aside>
      {/if}
      <!--
        A `basico && isMobile` branch used to sit here, holding a legacy right
        sidebar with its own edge toggle for model data and the DSM wizard. It
        was unreachable: this whole block is `!isMobile`, so the branch asked
        for a width its parent had already excluded. Removed rather than moved —
        BasicPanel serves both of those on the phone now, in the sheet.
      -->
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

  <!--
    Mobile drawers (overlay on top of canvas) — PRO and Education only.
    ──────────────────────────────────────────────────────────────────
    Basic had both of these, and together they WERE the parallel interface: the
    left one held the old Toolbar, the right one held PropertyPanel and a second
    copy of the model-data table. Both are gone from Basic. The ribbon is
    mounted at every width now and its commands open BasicPanel, which lays
    itself out as the bottom sheet on a phone — so the drawers would be a second
    route to the same content, disagreeing with the ribbon about what is open.

    The left Toolbar is not mounted anywhere in Basic any more, at either width.
    It was ALSO being mounted a second time in `.app-body` behind
    `leftSidebarOpen`, where `.sidebar { display: none }` hid it below 768 px —
    so a phone carried two live copies of a 2,400-line component it never
    showed, and every id inside it, `ex-group-2d` among them, existed twice.
  -->
  {#if uiStore.isMobile && uiStore.rightDrawerOpen && uiStore.appMode !== 'basico'}
    <!--
      No backdrop in PRO, and the sheet SHARES the screen there.
      ─────────────────────────────────────────────────────────
      The dimmed backdrop is right for a drawer you step into and out of. It is
      wrong for PRO's panel, which is where the work happens: with it, opening
      the panel to pick a command made the bar above it untappable, so changing
      stage meant closing the panel, changing, and opening it again. The bar and
      the panel are two halves of one control surface and both have to be live.

      Education keeps the backdrop — its panel IS a modal errand.
    -->
    {#if uiStore.appMode !== 'pro'}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="drawer-backdrop" onclick={() => uiStore.rightDrawerOpen = false}></div>
    {/if}
    <aside class="drawer drawer-right" class:drawer-shared={uiStore.appMode === 'pro'}>
      {#if uiStore.appMode === 'pro'}
        <!--
          The same handle Basic's sheet has. PRO's did not, which was never a
          decision — the drag was written inside `BasicPanel` and PRO's panel is
          a different component. Both are a sheet sharing the screen with the
          model along the axis where the reader's needs pull opposite ways.
        -->
        <div class="drawer-sheet-top">
          <SheetGrab storageKey="stabileo-pro-sheet-vh" />
          <button
            class="drawer-sheet-close"
            onclick={() => uiStore.rightDrawerOpen = false}
            title={t('ribbon.close')}
            aria-label={t('ribbon.close')}
            data-testid="pro-sheet-close"
          >×</button>
        </div>
        <!--
          BOUND, like the desktop one.
          ───────────────────────────
          `proPanelRef` was only ever bound to the desktop instance, so on a
          phone it was null: the bar's Calcular read `canSolve()` off nothing,
          rendered permanently disabled, and would have done nothing if pressed.
          One binding, one instance at a time — the two are mutually exclusive —
          so the bar's Calcular and the ANALYSE grid's now call the same method
          on the same component.
        -->
        <ProPanel bind:this={proPanelRef} />
      {:else if uiStore.appMode === 'educativo'}
        <EducativePanel />
      {/if}
    </aside>
  {/if}

  <!--
    Mobile bottom bar — PRO and Education only, for the same reason.
    Basic's two buttons opened the two drawers above. With the ribbon carrying
    every command, a bar whose whole job was to reveal a different set of them
    is 60 px of screen bought back for the model.
  -->
  {#if uiStore.isMobile && uiStore.appMode !== 'basico'}
    <nav class="mobile-bottom-bar">
      <!--
        A drawn icon, like everything else in this shell.
        ────────────────────────────────────────────────
        It was ⚡ — a Unicode glyph that renders as a colour emoji on most
        phones, at whatever weight and optical size the platform font decides.
        Beside the ribbon's line icons it read as a sticker. `Icon` draws on the
        same 24-unit grid at the same stroke weight and takes `currentColor`, so
        it tints with the button instead of ignoring it. Same reasoning as the
        ribbon's own icons — see `ribbon/Icon.svelte`.
      -->
      <button
        class="mobile-bar-btn"
        class:active={uiStore.rightDrawerOpen}
        onclick={() => uiStore.rightDrawerOpen = !uiStore.rightDrawerOpen}
        title={uiStore.appMode === 'pro' ? 'PRO' : t('app.properties')}
        aria-label={uiStore.appMode === 'pro' ? 'PRO' : t('app.properties')}
        data-testid="mobile-panel-toggle"
      ><Icon name={uiStore.appMode === 'pro' ? 'data' : 'settings'} size={20} /></button>
    </nav>
  {/if}
</div>

<!-- Inline editors (positioned fixed, rendered outside layout) -->
<NodeEditor />
<ElementEditor />
<DespieceInspector />
<MaterialEditor />
<SectionEditor />

<!--
  The 3-D reinforcement workspace.

  Mounted HERE, at the root, and not inside the PRO sidebar where its launcher lives. The
  sidebar is `aside.pro-sidebar` with a fixed pixel width, so anything nested in it is capped
  by that width no matter what it asks for — which is the entire reason the viewer was a few
  hundred pixels wide. An overlay at this level is bounded by the window instead.

  It renders nothing at all until opened, and its state lives in `rebarWorkspace`, so opening
  and closing costs the model nothing.
-->
<RebarWorkspace />

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

<!--
  Modal over the whole app, so it sits with the other dialogs rather than
  inside the viewport: what it decides replaces the model, which is not a
  viewport-scoped act.
-->
<SwitchTo2DDialog bind:open={uiStore.switchTo2DPrompt} />

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
    if (f) {
      if (dxfGoesToCadWizard()) { cadWizardFile = f; showCadWizard = true; }
      else { dxfImportFile = f; showDxfImport = true; }
    }
    (e.currentTarget as HTMLInputElement).value = '';
  }}
/>
<CadImportWizard
  open={showCadWizard}
  file={cadWizardFile}
  onclose={() => { showCadWizard = false; cadWizardFile = null; }}
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
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    color: var(--st-text);
    font-family: var(--st-mono);
    font-size: 0.85rem;
    padding: 0.5rem;
    resize: vertical;
  }

  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    background: var(--st-bg);
    color: var(--st-text);
    /*
      The application declared no font and inherited the system stack from
      index.html, so it rendered in San Francisco on a Mac and Segoe on
      Windows while the landing rendered in IBM Plex on both. One declaration
      here reaches every descendant that does not override it.
    */
    font-family: var(--st-sans);
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
    background: var(--st-surface);
    border-bottom: 1px solid var(--st-hair);
    position: relative;
    z-index: 400;
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
  .logo-home:hover .logo-text { color: var(--st-text); }
  .logo-home:hover .logo-icon { color: var(--st-accent-hover); }

  .logo-icon {
    font-size: 1.5rem;
    color: var(--st-accent);
  }

  .logo-text {
    font-size: 1.25rem;
    font-weight: 600;
    letter-spacing: 0.05em;
  }

  .separator {
    color: var(--st-text-3);
    font-size: 1.25rem;
    margin: 0 0.25rem;
  }

  /* The exercise, where the mode switcher would be: in a handout the title
     is the one piece of identity the window has. */
  .handout-title {
    font-family: var(--st-display);
    font-size: 0.9rem;
    color: var(--st-text);
    padding: 0 0.5rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 46vw;
  }

  .mode-toggle {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0;
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid var(--st-hair);
    margin-left: 0.25rem;
    min-width: 180px;
    position: relative;
    z-index: 401;
  }

  .mode-toggle button {
    background: transparent;
    border: none;
    color: var(--st-text-3);
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
    background: var(--st-surface-2);
    color: var(--st-text);
  }

  .mode-toggle button.active {
    background: var(--st-accent);
    color: white;
  }

  .mode-toggle button.edu-mode-btn {
    background: var(--st-surface-2);
    color: var(--st-value);
    border-left: 1px solid var(--st-hair);
  }

  .mode-toggle button.edu-mode-btn.active {
    background: var(--st-surface-3);
    color: white;
  }

  .mode-toggle button.pro-mode-btn {
    background: var(--st-surface-2);
    color: var(--st-warn);
    border-left: 1px solid var(--st-hair);
  }

  .mode-toggle button.pro-mode-btn.active {
    background: var(--st-accent);
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

  .pro-panel-close {
    position: absolute;
    top: 4px;
    right: 6px;
    z-index: 3;
    background: none;
    border: none;
    color: var(--st-text-2);
    font-size: 1.2rem;
    line-height: 1;
    padding: 0.1rem 0.35rem;
    cursor: pointer;
    border-radius: var(--st-radius);
  }

  .pro-panel-close:hover { background: var(--st-surface-3); color: var(--st-text); }

  .pro-panel-reopen {
    align-self: stretch;
    width: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--st-surface-2);
    border: none;
    border-left: 1px solid var(--st-hair);
    color: var(--st-text-3);
    cursor: pointer;
    font-size: 0.85rem;
  }

  .ppr-text {
    writing-mode: vertical-rl;
    font-family: var(--st-mono);
    font-size: 0.62rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .pro-panel-reopen:hover { background: var(--st-surface-3); color: var(--st-text); }

  .pro-sidebar {
    overflow: visible;
    position: relative;
    z-index: 40;
    flex-shrink: 0;
  }

  /* Hidden, not unmounted — see the aside's comment in the markup above. */
  .pro-sidebar-closed {
    display: none;
  }

  /* ─── PRO command bar with dropdowns ─── */
  .pro-bar {
    position: relative;
    display: flex;
    align-items: center;
    gap: 3px;
    background: var(--st-surface-2);
    border-bottom: 1px solid var(--st-hair-strong);
    padding: 5px 10px;
    flex-shrink: 0;
    width: 100%;
  }
  .pb-tool {
    display: flex; align-items: center; justify-content: center; gap: 2px;
    height: 30px; min-width: 30px; padding: 0 6px;
    font-size: 0.88rem;
    color: var(--st-text-2);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.12s;
  }
  .pb-tool:hover { color: var(--st-text); background: rgba(26, 74, 122, 0.4); }
  .pb-tool.active { color: var(--st-text); background: var(--st-accent); border-color: var(--st-danger); }
  .pb-group {
    display: flex; align-items: center; gap: 3px;
    height: 30px; padding: 0 10px;
    font-size: 0.7rem; font-weight: 600;
    color: var(--st-text-2);
    background: transparent;
    border: 1px solid var(--st-hair);
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.12s;
    white-space: nowrap;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .pb-group:hover { color: var(--st-text); background: var(--st-surface-3); border-color: var(--st-hair-strong); }
  .pb-group.group-active { color: var(--st-accent); border-color: var(--st-accent); background: var(--st-selected-bg); }
  .pb-caret { font-size: 0.55rem; opacity: 0.6; }
  .pb-undo {
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 30px;
    font-size: 0.9rem;
    color: var(--st-text-2);
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.12s;
  }
  .pb-undo:hover:not(:disabled) { color: var(--st-text); background: rgba(26, 74, 122, 0.4); }
  .pb-undo:disabled { opacity: 0.25; cursor: not-allowed; }
  .pb-divider { width: 1px; height: 20px; background: var(--st-surface-3); margin: 0 4px; flex-shrink: 0; }
  .pb-spacer { flex: 1; }
  /* Dropdown */
  .pb-dd-wrap { position: relative; }
  .pb-dropdown {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    z-index: 300;
    min-width: 150px;
    background: var(--st-surface);
    border: 1px solid var(--st-hair-strong);
    border-radius: 6px;
    padding: 3px 0;
    box-shadow: 0 8px 28px rgba(0,0,0,0.55);
  }
  .pb-dd-item {
    display: block; width: 100%;
    padding: 7px 14px;
    font-size: 0.72rem; font-weight: 500;
    color: var(--st-text-2);
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: all 0.1s;
  }
  .pb-dd-item:hover { color: var(--st-text); background: rgba(26, 74, 122, 0.4); }
  .pb-dd-item.active { color: var(--st-text); background: var(--st-accent); }
  .pb-dd-item:first-child { border-radius: 4px 4px 0 0; }
  .pb-dd-item:last-child { border-radius: 0 0 4px 4px; }
  .pn-toggle {
    padding: 4px 8px;
    font-size: 0.9rem;
    line-height: 1;
    color: var(--st-text-2);
    background: transparent;
    border: 1px solid var(--st-hair);
    border-radius: 4px;
    cursor: pointer;
    flex-shrink: 0;
    margin-left: 6px;
  }
  .pn-toggle:hover { color: var(--st-text); border-color: var(--st-interactive); }
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
  /* The positioned ancestor the panel measures `top: 100%` from. Without it the panel lands
     one whole app-body below the window — see the note beside the button. */
  .settings-anchor { position: relative; display: inline-flex; }

  .pro-settings-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 200;
    width: 288px;
    max-height: min(70vh, 34rem);
    overflow-y: auto;
    background: var(--st-surface);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius-lg);
    /* Breathing room on every side: the old 0.5rem let the first checkbox sit on the border. */
    padding: 0.35rem 0.85rem 0.85rem;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
  }

  .pro-settings-dropdown:focus { outline: none; }

  .pro-settings-head {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    /* Sticky over a scrolling panel, so it needs its own ground rather than the panel's. */
    background: var(--st-surface);
    padding: 0.5rem 0 0.45rem;
    margin-bottom: 0.25rem;
    border-bottom: 1px solid var(--st-hair);
  }

  .pro-settings-head h2 {
    margin: 0;
    font-family: var(--st-display);
    font-size: 0.82rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    color: var(--st-text);
  }

  .pro-settings-close {
    background: none;
    border: none;
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-size: 0.8rem;
    line-height: 1;
    padding: 0.2rem 0.35rem;
    cursor: pointer;
  }
  .pro-settings-close:hover { background: var(--st-surface-3); color: var(--st-text); }
  .pro-settings-close:focus-visible { outline: 2px solid var(--st-focus); outline-offset: 1px; }

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
  /*
     Four commands, four fills, four meanings — none of them stated.
     ───────────────────────────────────────────────────────────────
     Examples was amber, DXF plan turquoise-outlined, Solve and Report solid
     red. Amber is this palette's warning, turquoise its computed value, and
     solid accent is what the shell reserves for the ONE thing you are acting
     on — so a row of four permanent buttons claimed to be a warning, a
     read-out and two active states at once, all before the user had done
     anything.

     They are commands, so they take the shell's command: hairline, no fill
     until hover. Solve keeps the accent, because among these four it is the
     one that acts on the model and the one the whole bar builds toward — and
     it is the only one, so the accent means something again.
  */
  .pn-example,
  .pn-cad,
  .pn-report {
    color: var(--st-text-2);
    background: none;
    border-color: var(--st-hair);
  }

  .pn-example:hover:not(:disabled),
  .pn-cad:hover:not(:disabled),
  .pn-report:hover:not(:disabled) {
    background: var(--st-surface-3);
    color: var(--st-text);
    border-color: var(--st-hair-strong);
  }

  .pn-solve {
    color: var(--st-accent);
    background: none;
    border-color: var(--st-accent);
  }

  .pn-solve:hover:not(:disabled) {
    background: var(--st-selected-bg);
    color: var(--st-accent-hover);
    border-color: var(--st-accent-hover);
  }

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
    color: var(--st-text-2);
    font-size: 1rem;
    padding: 0.2rem 0.4rem;
    width: 200px;
    transition: all 0.2s;
  }

  .project-name:hover {
    border-color: var(--st-hair);
  }

  .project-name:focus {
    outline: none;
    border-color: var(--st-accent);
    color: var(--st-text);
    background: var(--st-surface-2);
  }

  /* An older-than-newest save is not the normal case and must not look like it.
     Tinted in place rather than as a full-width band: the standalone banner this
     replaced pushed the whole application down by its own height on load, which is
     why it was removed upstream. */
  .autosave-older {
    background: #3e2a1a;
    border: 1px solid #6e4a2a;
    border-radius: 4px;
    padding: 0.15rem 0.5rem;
  }

  .autosave-stamp {
    color: #999;
    font-variant-numeric: tabular-nums;
  }

  .autosave-warning {
    color: #ffb347;
    max-width: 46rem;
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
    background: var(--st-accent);
    color: white;
  }

  .banner-btn.restore:hover {
    background: var(--st-danger);
  }

  .banner-btn.discard {
    background: var(--st-surface-3);
    color: var(--st-text-2);
  }

  .banner-btn.discard:hover {
    background: var(--st-hair-strong);
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
    background: var(--st-accent);
    color: white;
  }

  .btn-primary:hover {
    background: var(--st-danger);
  }

  .btn-secondary {
    background: var(--st-surface-2);
    color: var(--st-text);
  }

  .btn-secondary:hover {
    background: var(--st-surface-3);
  }

  .ai-fab {
    position: fixed;
    bottom: 24px;
    /*
       Over the canvas, not over the panel. Fixed at the viewport's corner it
       covered the bottom-right of the right panel — enough to swallow the last
       row of the step-by-step wizard, and enough to intercept clicks meant for
       whatever was underneath it.
    */
    right: calc(24px + var(--st-right-panel-w, 0px));
    z-index: 100;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--st-surface-2);
    border: 2px solid var(--st-hair-strong);
    color: var(--st-text);
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
    background: var(--st-surface-3);
    border-color: var(--st-interactive);
    color: var(--st-value);
    transform: scale(1.05);
  }

  .ai-fab.active {
    background: var(--st-surface-3);
    border-color: var(--st-interactive);
    color: var(--st-value);
    box-shadow: 0 4px 16px rgba(78, 205, 196, 0.3);
  }

  .btn-help {
    background: transparent;
    border: 1px solid var(--st-hair-strong);
    color: var(--st-text-3);
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
    border-color: var(--st-interactive);
    color: var(--st-value);
  }

  /*
     `.btn` sets no background, so a button that does not set one of its own
     falls back to the browser's native ButtonFace — a light grey slab in a dark
     shell. Every other button here declares its own; this one had only a colour.
  */
  .btn-settings {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    background: transparent;
    border: 1px solid var(--st-hair-strong);
    border-radius: 50%;
    color: var(--st-text-3);
  }

  .btn-settings:hover { color: var(--st-text); border-color: var(--st-hair-strong); }
  .btn-settings.on { color: var(--st-accent); border-color: var(--st-accent); }

  .lang-select {
    background: transparent;
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    color: var(--st-text-2);
    font-size: 0.75rem;
    padding: 0.2rem 0.3rem;
    cursor: pointer;
    height: 32px;
  }
  .lang-select:hover {
    border-color: var(--st-interactive);
    color: var(--st-value);
  }
  .lang-select option {
    background: var(--st-surface);
    color: var(--st-text);
  }

  .btn-toggle {
    background: transparent;
    border: 1px solid var(--st-hair-strong);
    color: var(--st-text-3);
    height: 32px;
    padding: 0 0.5rem;
    font-size: 0.75rem;
    font-weight: 700;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-toggle:hover {
    border-color: var(--st-interactive);
    color: var(--st-value);
  }

  .btn-toggle.active {
    background: var(--st-surface-3);
    border-color: var(--st-interactive);
    color: var(--st-value);
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
    background: var(--st-surface);
    border-right: 1px solid var(--st-hair);
    overflow-y: auto;
  }

  .sidebar.right {
    width: 340px;
    border-right: none;
    border-left: 1px solid var(--st-hair);
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
    background: var(--st-surface);
    border: 1px solid var(--st-hair);
    color: var(--st-text-3);
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0.6rem 0.2rem;
    transition: all 0.2s;
  }
  .sidebar-toggle-btn:hover {
    background: var(--st-bg);
    color: var(--st-value);
    border-color: var(--st-interactive);
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
    background: var(--st-bg);
    border: none;
    border-bottom: 1px solid var(--st-hair);
    color: var(--st-text-2);
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
    background: var(--st-bg);
    color: var(--st-text);
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
    background: var(--st-surface);
    border-top: 1px solid var(--st-hair);
  }

  /* Toast notifications */
  /*
     The phone's restore offer, over the model rather than in the header.
     ───────────────────────────────────────────────────────────────────
     `absolute` inside `.viewport-container`, so it sits under whichever shell
     the mode has without anything measuring it. Wraps, because "Se encontró un
     proyecto guardado — <nombre> (fecha)" plus two buttons is more than one
     375 px line, and a prompt that clips is the bug this is fixing.
  */
  .autosave-over-model {
    position: absolute;
    top: 8px;
    left: 8px;
    /* Clear of the canvas's own controls, the same lane the toasts leave. */
    right: 56px;
    z-index: 40;
  }

  .autosave-over-model :global(.autosave-inline) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    width: 100%;
    max-width: none;
    padding: 8px 10px;
    border-radius: var(--st-radius);
    background: var(--st-surface);
    border: 1px solid var(--st-accent);
    box-shadow: 0 8px 22px -6px rgba(0, 0, 0, 0.6);
  }

  /* The name and date take the first line; the two answers take the second. */
  .autosave-over-model :global(.autosave-text) { flex: 1 1 100%; min-width: 0; }
  .autosave-over-model :global(.autosave-warning) { flex: 1 1 100%; }

  .autosave-over-model :global(.banner-btn) {
    flex: 1 1 0;
    min-height: 44px;
    min-width: 0;
  }

  .toast-container {
    position: fixed;
    /*
       Below the ribbon and its options bar, not over them. At 60px the toast
       landed across the last commands in the Results group — so the message
       telling you the analysis succeeded covered the diagrams you would press
       next. Anchored to the bottom-right instead: out of the command surface,
       and out of the way of the model's left-anchored drawing.
    */
    bottom: 46px;
    /* Clear of the right panel when one is open — BasicPanel publishes its width. */
    right: calc(24px + var(--st-right-panel-w, 0px));
    z-index: 1100;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    /*
       The BOX must not take the tap; only the toasts inside it may.
       ────────────────────────────────────────────────────────────
       This container is `position: fixed` at z-index 1100 and, on a phone, was
       pinned top AND bottom — so while any toast was on screen an invisible
       div covered the entire viewport and swallowed every touch that was not
       on the toast itself. A solve raises a toast, and for the seconds it
       lived the canvas underneath could not be panned, tapped or drawn on.

       Declared here rather than in the phone rule because it is right at every
       width: a notification is something you read, and the empty space around
       it belongs to whatever is underneath.
    */
    pointer-events: none;
  }

  .toast {
    position: relative;
    padding: 0.6rem 2rem 0.6rem 1rem;
    /* The toast itself is interactive again — it has a ✕ and sometimes an action. */
    pointer-events: auto;
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

  /*
     On a phone the ✕ is the whole point of the toast lasting.
     ────────────────────────────────────────────────────────
     A toast auto-dismisses, so the button exists for the reader who wants it
     gone NOW — it sits over the model. At 0.5 opacity and a 12 px hit area it
     was neither visible enough to notice nor big enough to hit with a thumb,
     which on a touch screen means it may as well not be there.

     Full opacity, a 44 px target, and a ring so it reads as a control rather
     than as part of the message.
  */
  @media (max-width: 767px) {
    .toast {
      padding: 0.7rem 3rem 0.7rem 0.9rem;
    }

    .toast-dismiss {
      top: 50%;
      right: 4px;
      transform: translateY(-50%);
      opacity: 1;
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.22);
    }
  }

  .toast-action {
    align-self: flex-end;
    background: none;
    border: 1px solid var(--st-interactive);
    color: var(--st-value);
    padding: 0.25rem 0.6rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .toast-action:hover {
    background: var(--st-accent);
    color: var(--st-text-on-accent);
  }

  .toast-success {
    background: rgba(42, 168, 105, 0.16);
    border: 1px solid var(--st-ok);
    color: var(--st-ok);
  }

  .toast-error {
    background: rgba(232, 112, 95, 0.16);
    border: 1px solid var(--st-accent);
    color: var(--st-danger);
  }

  .toast-info {
    background: var(--st-surface-2);
    border: 1px solid var(--st-interactive);
    color: var(--st-value);
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
    background: var(--st-surface);
    border: 1px solid var(--st-hair);
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
    color: var(--st-value);
    margin: 0;
  }

  .help-close {
    background: none;
    border: none;
    color: var(--st-text-3);
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0.25rem;
  }

  .help-close:hover {
    color: var(--st-text);
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
    background: var(--st-surface-3);
    border: 1px solid var(--st-interactive);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    max-width: 250px;
    font-size: 0.78rem;
    line-height: 1.4;
    color: var(--st-text);
    pointer-events: none;
    animation: tooltip-fade-in 0.15s ease;
  }

  :global(.edu-tooltip strong) {
    color: var(--st-value);
    display: block;
    margin-bottom: 0.25rem;
    font-size: 0.82rem;
  }

  :global(.edu-tooltip span) {
    color: var(--st-text-2);
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
    background: var(--st-surface);
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
    background: var(--st-surface);
    border-top: 1px solid var(--st-hair);
    padding: 8px 8px;
    padding-bottom: max(8px, env(safe-area-inset-bottom));
    gap: 8px;
  }

  .mobile-bar-btn {
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    color: var(--st-text);
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
    background: var(--st-surface-3);
    color: white;
  }

  /* ─── Mobile PRO upper toolbar ─── */
  .pmt-wrap { position: relative; flex: none; }

  /* ── PRO's phone bar ─────────────────────────────────────────────────
     Same slot rules as Basic's row: every control is `flex: 1 1 0`, so seven
     slots divide exactly the width there is and nothing scrolls or is cut. The
     old bar was fixed 36×34 buttons with `flex-wrap`, which meant the select
     modes pushed it onto a second line and the whole thing was under the 44 px
     target besides.
     ────────────────────────────────────────────────────────────────── */
  .pro-mobile-toolbar {
    display: flex;
    align-items: stretch;
    gap: 3px;
    padding: 3px 4px;
    background: var(--st-surface-2);
    border-bottom: 1px solid var(--st-hair-strong);
    flex-shrink: 0;
  }
  .pmt-btn {
    flex: 1 1 0;
    min-width: 0;
    min-height: 44px;
    display: flex; align-items: center; justify-content: center;
    font-size: 1rem;
    color: var(--st-text-2);
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    cursor: pointer;
  }
  .pmt-btn:hover { color: var(--st-text); }
  .pmt-btn:disabled { opacity: 0.34; cursor: default; }
  /*
     ONE accent in the row at a time, and it means "the panel is showing this".
     Project and the stage are the only two that can carry it, and exactly one
     of them does whenever the panel is open.
  */
  .pmt-btn.active {
    background: var(--st-selected-bg);
    border-color: var(--st-accent);
    color: var(--st-accent);
  }

  /*
     Armed and open are NOT that. A pointer mode and an open menu are states of
     the control itself, so they are drawn as a filled key — no accent, nothing
     that could be mistaken for a second selection.
  */
  .pmt-btn.armed,
  .pmt-btn.open {
    background: var(--st-surface-3);
    color: var(--st-text);
  }

  /*
     The select-mode chips moved to the panel — five translated words never fit
     in 375 px, which is why this bar used to wrap onto a second line whenever
     Select was armed. Their styles went with them.
  */

  /* The document trio reads as a group, the same way the ribbon's does. */
  .pmt-rule {
    flex: none;
    width: 1px;
    align-self: stretch;
    background: var(--st-hair);
    margin: 0 2px;
  }

  /*
     The camera split button: a face and a caret, sharing one slot's worth of
     border so it reads as one control rather than two crowded ones.
  */
  .pmt-split {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    align-items: stretch;
    gap: 0;
  }
  .pmt-split .pmt-cam {
    flex: 1 1 0;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    border-right: none;
  }
  .pmt-cam-glyph { font-size: 0.95rem; line-height: 1; }

  .pmt-cam-more {
    flex: none;
    width: 20px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair);
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    border-radius: 0 var(--st-radius) var(--st-radius) 0;
    color: var(--st-text-2);
    cursor: pointer;
  }
  .pmt-cam-more.open { background: var(--st-surface-3); color: var(--st-text); }

  .pmt-caret {
    flex: none;
    width: 0; height: 0;
    border-left: 3.5px solid transparent;
    border-right: 3.5px solid transparent;
    border-top: 4px solid currentColor;
    opacity: 0.75;
  }

  /* Icon and name on one row: ⊤ and ⊡ and ⊟ do not explain themselves. */
  .pmt-cam-item {
    display: flex;
    align-items: center;
    gap: 10px;
    text-transform: none;
    letter-spacing: 0.02em;
    font-family: var(--st-sans);
    font-size: 0.8rem;
  }
  .pmt-cam-item-icon {
    flex: none;
    width: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--st-text);
  }

  /* Same pattern as the Basic ribbon's cluster menu, including the backdrop:
     without it the tap that dismisses the menu lands on the model behind it. */
  .pmt-backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    background: transparent;
  }
  .pmt-menu {
    position: absolute;
    z-index: 71;
    left: 4px;
    right: 4px;
    background: var(--st-surface);
    border: 1px solid var(--st-hair-strong);
    border-top: none;
    border-radius: 0 0 8px 8px;
    box-shadow: 0 10px 22px -8px rgba(0, 0, 0, 0.55);
    padding: 5px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .pmt-menu-item {
    min-height: 44px;
    padding: 0 12px;
    text-align: left;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-family: var(--st-mono);
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .pmt-menu-item.active {
    background: var(--st-selected-bg);
    border-color: var(--st-accent);
    color: var(--st-text);
  }
  /*
     What was here: a second `.pmt-btn.active`, `.pmt-undo`, `.pmt-results` and
     a duplicate `.pmt-sel`, all for the old fixed-size bar. They described
     classes the markup no longer uses, and the `.pmt-sel` copy sat AFTER the
     new one and quietly won — a 36 px chip painted as a 25 px one, which is
     exactly the kind of cascade collision two rules for one class produce.
  */

  /* ─── Mobile mode selector ─── */
  .mode-select-mobile {
    padding: 5px 24px 5px 8px;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--st-text);
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
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
  .mode-select-mobile:focus { border-color: var(--st-interactive); outline: none; box-shadow: 0 0 0 2px rgba(78, 205, 196, 0.25); }
  .mode-select-mobile option { background: var(--st-surface); color: var(--st-text); font-weight: 500; padding: 6px; }

  /* ===== Mobile Responsive ===== */
  /*
   * Touch targets on a phone.
   *
   * Fourteen controls in this shell sat below the 44 px minimum, and the worst
   * of them are in the header: the mode switcher at 133×26 and the tab-add
   * button at 23×22. A 23 px target is not a small button, it is a button that
   * takes two or three attempts, and the header is the first thing a new user
   * touches.
   *
   * Sized for 375 px — an iPhone SE or a mini. Whatever fits there fits a
   * larger handset; the reverse is what produced this.
   */
  @media (max-width: 767px) {
    .app-header :global(button),
    .app-header select {
      min-height: 44px;
      min-width: 44px;
    }

    /*
     * The language selector leaves the header.
     *
     * It spends a permanent slot on a control a phone user touches once, in
     * the row with the least space in the application. It lives in Settings
     * on a phone, with the other things you set and forget.
     */
    .lang-select { display: none; }

    /*
     * The right panel becomes a bottom sheet.
     *
     * As a side drawer it was 319 px of a 375 px screen — 85 % of the width and
     * the full height — so opening the results, the model data or the settings
     * hid the structure they describe. On a phone the two have to share the
     * screen along the axis there is more of, which is vertical.
     *
     * Just over half the height: enough for a table to be worth reading, and
     * it leaves the model in the upper portion where the reader can see what
     * a value refers to.
     */
    .drawer-right {
      top: auto;
      bottom: 0;
      left: 0;
      right: 0;
      width: 100%;
      max-width: none;
      height: 58vh;
      max-height: 58vh;
      border-left: none;
      border-top: 1px solid var(--st-hair-strong);
      border-radius: 12px 12px 0 0;
      animation-name: sheet-slide-up;
    }

    /*
       PRO's sheet takes the height `.app-body` gives up for it, so the model
       above it is really there rather than covered — the same arrangement
       Basic's panel uses, and the same token, so the two cannot drift.
    */
    .drawer-right.drawer-shared {
      height: var(--st-sheet-h);
      max-height: var(--st-sheet-h);
      display: flex;
      flex-direction: column;
    }

    /* The handle row: the grab fills it, the ✕ sits on top at the right. */
    .drawer-sheet-top {
      display: flex;
      align-items: center;
      flex: none;
      position: relative;
    }
    .drawer-sheet-top :global(.grab) { flex: 1; }
    .drawer-sheet-close {
      position: absolute;
      right: 2px;
      top: 50%;
      transform: translateY(-50%);
      width: 44px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      color: var(--st-text-2);
      font-size: 1.5rem;
      line-height: 1;
      cursor: pointer;
      touch-action: manipulation;
    }

    @keyframes sheet-slide-up {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }
  }

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

    .app-body-bottom-bar {
      padding-bottom: 60px;
    }

    /*
       The sheet SHARES the screen with the canvas; it does not sit on top of it.
       ─────────────────────────────────────────────────────────────────────────
       As a plain overlay the panel covered the lower 58 % of a canvas that was
       still sized, and framed, to the full viewport — so choosing a moment
       diagram put the diagram behind the panel that had just been opened to
       control it, and the visible strip showed empty grid. The model was drawn;
       it was simply underneath.

       Reserving the height instead makes the canvas the size it appears to be.
       Both viewports carry a ResizeObserver, so the backing store follows on its
       own, and `--st-sheet-h` (in `styles/tokens.css`) is the one place the
       height is written — the panel reads the same token for its own box.
    */
    .app-body-sheet {
      padding-bottom: var(--st-sheet-h);
    }

    .app-header {
      padding: 0.3rem 0.5rem;
    }

    .header-actions .btn-help,
    .header-actions .btn-toggle {
      display: none;
    }

    /*
       Settings keeps its corner and gets a thumb-sized target there. The
       project name gives up the width for it — a truncated title reads the
       same at 84 px as at 120, and the only other control in this row is one
       a reader has to be able to hit.
    */
    .header-actions .btn-settings {
      min-width: 44px;
      min-height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .project-name {
      max-width: 84px;
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

    /*
       Below the shell, over the model, never across the commands.
       ──────────────────────────────────────────────────────────
       At `top: 50px` the toast landed on the ribbon: "Cálculo exitoso" covered
       the diagram commands the reader was about to press because of it. The
       header, ribbon and options bar occupy the first 142 px, so the message
       starts just under them and sits on the canvas, which is the one surface
       with nothing to press on it.

       `bottom: auto` matters as much as the `top`. The desktop rule anchors
       the container to the BOTTOM, and setting a top without clearing that
       left a fixed box pinned at both ends — i.e. the full height of the
       screen. See `pointer-events` below for what that cost.
    */
    .toast-container {
      /*
         Stops short of the canvas's own two buttons — pointer mode and
         zoom-to-fit sit at the top-right of the model, from x = 331. Running
         the toast to the edge put its ✕ directly on top of them: two round
         controls overlapping, one of them unreachable for as long as the
         message lasted, which reads as a bug even though it heals itself.
      */
      right: 56px;
      left: 10px;
      top: 146px;
      bottom: auto;
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


  /* Document-level commands: examples and project, beside the document name. */
  .btn-doc {
    background: none;
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-size: 0.8rem;
    padding: 0.3rem 0.6rem;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }

  .btn-doc:hover { background: var(--st-surface-3); color: var(--st-text); }

  .btn-doc.on {
    color: var(--st-accent);
    border-color: var(--st-accent);
  }

  @media (max-width: 1100px) {
    .btn-doc-label { display: none; }
  }

  /* ── Autosave prompt, inline with the tabs ──────────────────────────── */

  .autosave-inline :global(.banner-btn),
  .autosave-inline .banner-btn {
    padding: 0.18rem 0.5rem;
    font-size: 0.72rem;
    border-radius: var(--st-radius);
  }

  /* The name is the only part that may give way when the tabs get long. */
  .autosave-text {
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  /*
     `.tab-bar` is `flex: 1`, so it eats the header's spare width and pushes
     anything after it to the far right — the prompt landed beside the help
     button rather than beside the tabs it is about. While the prompt is up the
     tabs take their natural width and the prompt absorbs the slack instead, so
     it sits directly against them and the right-hand controls stay put. The
     tabs get their growth back the moment the prompt is answered.
  */
  .app-header.has-autosave :global(.tab-bar) { flex: 0 1 auto; }
  .autosave-inline { margin-right: auto; }
  .autosave-inline {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin-left: 0.6rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--st-hair);
    border-left: 2px solid var(--st-warn);
    border-radius: var(--st-radius);
    background: var(--st-surface-2);
    font-size: 0.78rem;
    color: var(--st-text-2);
    white-space: nowrap;
    min-width: 0;
  }

  .ai-text { overflow: hidden; text-overflow: ellipsis; max-width: 30ch; }

  .ai-btn {
    background: none;
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-size: 0.74rem;
    padding: 0.15rem 0.45rem;
    cursor: pointer;
    flex: none;
  }

  .ai-btn:hover { background: var(--st-surface-3); color: var(--st-text); }
  .ai-btn.restore { color: var(--st-accent); border-color: var(--st-accent); }

  @media (max-width: 1100px) { .ai-text { max-width: 16ch; } }

  /* ── Header, brought into the token system ──────────────────────────── */

  .app-header { gap: 0.75rem; }

  .logo-text {
    font-family: var(--st-display);
    font-weight: 600;
    font-size: 1.05rem;
    letter-spacing: -0.01em;
  }

  .logo-icon { color: var(--st-accent); font-size: 1.15rem; }

  /*
     The mode switch is the one place the accent belongs up here: it says which
     product you are in. It was a filled pill with a hard red; a rule under the
     active mode reads as navigation rather than as an alert, and matches the
     ribbon's own active treatment.
  */
  .mode-toggle {
    display: flex;
    gap: 0.1rem;
    background: none;
    border: none;
    padding: 0;
  }

  .mode-toggle button {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--st-text-2);
    font-family: var(--st-sans);
    font-size: 0.82rem;
    font-weight: 500;
    padding: 0.3rem 0.6rem 0.25rem;
    cursor: pointer;
    border-radius: 0;
    transition: color 0.12s, border-color 0.12s;
  }

  .mode-toggle button:hover { color: var(--st-text); background: none; }

  .mode-toggle button.active {
    color: var(--st-text);
    background: none;
    border-bottom-color: var(--st-accent);
  }

  .demo-badge {
    font-family: var(--st-mono);
    font-size: 0.55rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--st-text-3);
    background: none;
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    padding: 0.05rem 0.25rem;
    margin-left: 0.3rem;
    vertical-align: middle;
  }

  .separator { color: var(--st-hair); font-size: 1rem; }

  .btn-help,
  .lang-select {
    background: none;
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-family: var(--st-sans);
    font-size: 0.8rem;
    padding: 0.3rem 0.5rem;
    cursor: pointer;
  }

  .btn-help:hover,
  .lang-select:hover { background: var(--st-surface-3); color: var(--st-text); }

  .btn-help { width: 26px; padding: 0.3rem 0; text-align: center; }
</style>
