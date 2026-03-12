// Tab management store — swap-and-save pattern for singleton stores

import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { resultsStore } from './results.svelte';
import { historyStore } from './history.svelte';
import type { ModelSnapshot } from './history.svelte';
import { dsmStepsStore } from './dsmSteps.svelte';
import type { DiagramType } from './results.svelte';
import type { Tool, SelectMode, ElementColorMode } from './ui.svelte';
import { t, isDefaultName } from '../i18n';

export interface TabState {
  id: string;
  name: string;
  modelSnapshot: ModelSnapshot;
  analysisMode: '2d' | '3d' | 'pro' | 'edu';
  // Results visualization state (results themselves are NOT serialized — too large)
  diagramType: DiagramType;
  deformedScale: number;
  diagramScale: number;
  showDiagramValues: boolean;
  hadResults: boolean; // whether results existed (user should re-solve after switch)
  // DSM wizard state
  dsmIsOpen: boolean;
  dsmCurrentStep: number;
  dsmQuizMode: boolean;
  // UI transient state
  currentTool: Tool;
  selectMode: SelectMode;
  // History stacks
  undoStack: ModelSnapshot[];
  redoStack: ModelSnapshot[];
  // === Independent per-tab visualization config ===
  // 2D config
  showGrid: boolean;
  gridSize: number;
  snapToGrid: boolean;
  showNodeLabels: boolean;
  showElementLabels: boolean;
  showLengths: boolean;
  elementColorMode: ElementColorMode;
  showLoads: boolean;
  hideLoadsWithDiagram: boolean;
  showPrimarySelector: boolean;
  showSecondarySelector: boolean;
  showAxes: boolean;
  // 3D config
  renderMode3D: 'wireframe' | 'solid' | 'sections';
  momentStyle3D: 'double-arrow' | 'curved';
  cameraMode3D: 'perspective' | 'orthographic';
  showGrid3D: boolean;
  gridSize3D: number;
  snapToGrid3D: boolean;
  showNodeLabels3D: boolean;
  showElementLabels3D: boolean;
  showLengths3D: boolean;
  showLoads3D: boolean;
  showAxes3D: boolean;
  axisConvention3D: 'rightHand' | 'leftHand';
  // Other per-tab settings
  includeSelfWeight: boolean;
  liveCalc: boolean;
  // Viewport state (2D)
  zoom: number;
  panX: number;
  panY: number;
  // Camera state (3D)
  cameraPosition3D: { x: number; y: number; z: number };
  cameraTarget3D: { x: number; y: number; z: number };
}

let tabIdCounter = 0;
function generateTabId(): string {
  return `tab-${Date.now()}-${++tabIdCounter}`;
}

function createTabManager() {
  let tabs = $state<TabState[]>([]);
  let activeTabId = $state<string | null>(null);

  // AbortController to cancel pending deferred operations (solve, DSM) on rapid tab switches
  let pendingAbort: AbortController | null = null;

  // Flag to suppress liveCalc $effect in App.svelte during tab restore
  let _tabSwitching = $state(false);

  /** Capture the current state of all stores into a TabState snapshot */
  function captureCurrentState(): TabState {
    const stacks = historyStore.getStacks();
    return {
      id: activeTabId ?? generateTabId(),
      name: modelStore.model.name,
      modelSnapshot: modelStore.snapshot(),
      analysisMode: uiStore.analysisMode,
      // Results visualization
      diagramType: resultsStore.diagramType,
      deformedScale: resultsStore.deformedScale,
      diagramScale: resultsStore.diagramScale,
      showDiagramValues: resultsStore.showDiagramValues,
      hadResults: resultsStore.results !== null || resultsStore.results3D !== null,
      // DSM
      dsmIsOpen: dsmStepsStore.isOpen,
      dsmCurrentStep: dsmStepsStore.currentStep,
      dsmQuizMode: dsmStepsStore.quizMode,
      // UI
      currentTool: uiStore.currentTool,
      selectMode: uiStore.selectMode,
      // History
      undoStack: stacks.undo,
      redoStack: stacks.redo,
      // Per-tab visualization config — 2D
      showGrid: uiStore.showGrid,
      gridSize: uiStore.gridSize,
      snapToGrid: uiStore.snapToGrid,
      showNodeLabels: uiStore.showNodeLabels,
      showElementLabels: uiStore.showElementLabels,
      showLengths: uiStore.showLengths,
      elementColorMode: uiStore.elementColorMode,
      showLoads: uiStore.showLoads,
      hideLoadsWithDiagram: uiStore.hideLoadsWithDiagram,
      showPrimarySelector: uiStore.showPrimarySelector,
      showSecondarySelector: uiStore.showSecondarySelector,
      showAxes: uiStore.showAxes,
      // Per-tab visualization config — 3D
      renderMode3D: uiStore.renderMode3D,
      momentStyle3D: uiStore.momentStyle3D,
      cameraMode3D: uiStore.cameraMode3D,
      showGrid3D: uiStore.showGrid3D,
      gridSize3D: uiStore.gridSize3D,
      snapToGrid3D: uiStore.snapToGrid3D,
      showNodeLabels3D: uiStore.showNodeLabels3D,
      showElementLabels3D: uiStore.showElementLabels3D,
      showLengths3D: uiStore.showLengths3D,
      showLoads3D: uiStore.showLoads3D,
      showAxes3D: uiStore.showAxes3D,
      axisConvention3D: uiStore.axisConvention3D,
      // Other per-tab settings
      includeSelfWeight: uiStore.includeSelfWeight,
      liveCalc: uiStore.liveCalc,
      // Viewport state
      zoom: uiStore.zoom,
      panX: uiStore.panX,
      panY: uiStore.panY,
      cameraPosition3D: { ...uiStore.cameraPosition3D },
      cameraTarget3D: { ...uiStore.cameraTarget3D },
    };
  }

  /** Restore a TabState back into all stores */
  function restoreState(state: TabState): void {
    // Cancel any pending deferred operations from a previous restore
    if (pendingAbort) pendingAbort.abort();
    pendingAbort = new AbortController();
    const signal = pendingAbort.signal;

    try {
      // Clear everything first
      resultsStore.clear();
      dsmStepsStore.clear();
      uiStore.resetSession();

      // Restore model
      modelStore.restore(state.modelSnapshot);
      modelStore.model.name = state.name;

      // Restore analysis mode
      uiStore.analysisMode = state.analysisMode;

      // Restore history stacks
      historyStore.setStacks(state.undoStack, state.redoStack);

      // Restore UI state
      uiStore.currentTool = state.currentTool;
      uiStore.selectMode = state.selectMode;

      // Restore results visualization settings (results themselves will need re-solve)
      resultsStore.deformedScale = state.deformedScale;
      resultsStore.diagramScale = state.diagramScale;
      resultsStore.showDiagramValues = state.showDiagramValues;

      // Restore per-tab visualization config — 2D
      uiStore.showGrid = state.showGrid;
      uiStore.gridSize = state.gridSize;
      uiStore.snapToGrid = state.snapToGrid;
      uiStore.showNodeLabels = state.showNodeLabels;
      uiStore.showElementLabels = state.showElementLabels;
      uiStore.showLengths = state.showLengths;
      uiStore.elementColorMode = state.elementColorMode;
      uiStore.showLoads = state.showLoads;
      uiStore.hideLoadsWithDiagram = state.hideLoadsWithDiagram;
      uiStore.showPrimarySelector = state.showPrimarySelector ?? true;
      uiStore.showSecondarySelector = state.showSecondarySelector ?? true;
      uiStore.showAxes = state.showAxes;

      // Restore per-tab visualization config — 3D
      uiStore.renderMode3D = state.renderMode3D;
      uiStore.momentStyle3D = state.momentStyle3D;
      uiStore.cameraMode3D = state.cameraMode3D;
      uiStore.showGrid3D = state.showGrid3D;
      uiStore.gridSize3D = state.gridSize3D;
      uiStore.snapToGrid3D = state.snapToGrid3D;
      uiStore.showNodeLabels3D = state.showNodeLabels3D;
      uiStore.showElementLabels3D = state.showElementLabels3D;
      uiStore.showLengths3D = state.showLengths3D;
      uiStore.showLoads3D = state.showLoads3D;
      uiStore.showAxes3D = state.showAxes3D;
      uiStore.axisConvention3D = state.axisConvention3D;

      // Restore other per-tab settings
      uiStore.includeSelfWeight = state.includeSelfWeight;
      uiStore.liveCalc = state.liveCalc;

      // Restore viewport state
      uiStore.zoom = state.zoom;
      uiStore.panX = state.panX;
      uiStore.panY = state.panY;
      uiStore.cameraPosition3D = { ...state.cameraPosition3D };
      uiStore.cameraTarget3D = { ...state.cameraTarget3D };
      // Notify 3D viewport to update its Three.js camera
      queueMicrotask(() => {
        window.dispatchEvent(new Event('stabileo-restore-camera-3d'));
      });
    } catch (err) {
      console.error('Tab restore failed:', err);
      uiStore.toast(t('tabs.restoreError'), 'error');
      return; // Don't set up deferred timers
    }

    // If there were results before, auto-solve to restore them
    if (state.hadResults) {
      // Defer solve to let the model restore propagate
      setTimeout(() => {
        if (signal.aborted) return;
        window.dispatchEvent(new Event('stabileo-solve'));
        // After solve, restore diagram type
        setTimeout(() => {
          if (signal.aborted) return;
          if (resultsStore.results !== null || resultsStore.results3D !== null) {
            resultsStore.diagramType = state.diagramType;
          }
        }, 200);
      }, 50);
    }

    // Restore DSM state if it was open
    if (state.dsmIsOpen && state.hadResults) {
      // DSM requires results, so defer until after auto-solve
      setTimeout(() => {
        if (signal.aborted) return;
        if (dsmStepsStore.stepData) {
          dsmStepsStore.open();
          dsmStepsStore.goToStep(state.dsmCurrentStep);
          dsmStepsStore.quizMode = state.dsmQuizMode;
        }
      }, 500);
    }
  }

  return {
    get tabs() { return tabs; },
    get activeTabId() { return activeTabId; },
    get activeTab() { return tabs.find(t => t.id === activeTabId) ?? null; },
    get tabCount() { return tabs.length; },
    get isTabSwitching() { return _tabSwitching; },

    /** Initialize with one default tab (call on app mount) */
    init(): void {
      if (tabs.length === 0) {
        const id = generateTabId();
        const state: TabState = {
          id,
          name: modelStore.model.name || t('tabBar.newStructure'),
          modelSnapshot: modelStore.snapshot(),
          analysisMode: uiStore.analysisMode,
          diagramType: 'none',
          deformedScale: 100,
          diagramScale: 1,
          showDiagramValues: true,
          hadResults: false,
          dsmIsOpen: false,
          dsmCurrentStep: 1,
          dsmQuizMode: false,
          currentTool: uiStore.currentTool,
          selectMode: uiStore.selectMode,
          undoStack: [],
          redoStack: [],
          // Capture current visualization config
          showGrid: uiStore.showGrid,
          gridSize: uiStore.gridSize,
          snapToGrid: uiStore.snapToGrid,
          showNodeLabels: uiStore.showNodeLabels,
          showElementLabels: uiStore.showElementLabels,
          showLengths: uiStore.showLengths,
          elementColorMode: uiStore.elementColorMode,
          showLoads: uiStore.showLoads,
          hideLoadsWithDiagram: uiStore.hideLoadsWithDiagram,
          showPrimarySelector: uiStore.showPrimarySelector,
          showSecondarySelector: uiStore.showSecondarySelector,
          showAxes: uiStore.showAxes,
          renderMode3D: uiStore.renderMode3D,
          momentStyle3D: uiStore.momentStyle3D,
          cameraMode3D: uiStore.cameraMode3D,
          showGrid3D: uiStore.showGrid3D,
          gridSize3D: uiStore.gridSize3D,
          snapToGrid3D: uiStore.snapToGrid3D,
          showNodeLabels3D: uiStore.showNodeLabels3D,
          showElementLabels3D: uiStore.showElementLabels3D,
          showLengths3D: uiStore.showLengths3D,
          showLoads3D: uiStore.showLoads3D,
          showAxes3D: uiStore.showAxes3D,
          axisConvention3D: uiStore.axisConvention3D,
          includeSelfWeight: uiStore.includeSelfWeight,
          liveCalc: uiStore.liveCalc,
          zoom: uiStore.zoom,
          panX: uiStore.panX,
          panY: uiStore.panY,
          cameraPosition3D: { ...uiStore.cameraPosition3D },
          cameraTarget3D: { ...uiStore.cameraTarget3D },
        };
        tabs = [state];
        activeTabId = id;
      }
    },

    /** Create a new empty tab, inheriting visualization settings from current tab */
    createTab(): void {
      // Save current tab state first
      if (activeTabId) {
        const idx = tabs.findIndex(t => t.id === activeTabId);
        if (idx !== -1) {
          const updated = [...tabs];
          updated[idx] = captureCurrentState();
          tabs = updated;
        }
      }

      // Create new tab with empty model but inherited viz settings
      const id = generateTabId();
      const newState: TabState = {
        id,
        name: t('tabBar.newStructure'),
        modelSnapshot: { nodes: [], elements: [], materials: [], sections: [], supports: [], loads: [], nextId: { node: 1, material: 1, section: 1, element: 1, support: 1, load: 1, loadCase: 1, combination: 1 } },
        analysisMode: uiStore.analysisMode,
        diagramType: 'none',
        deformedScale: resultsStore.deformedScale,
        diagramScale: resultsStore.diagramScale,
        showDiagramValues: resultsStore.showDiagramValues,
        hadResults: false,
        dsmIsOpen: false,
        dsmCurrentStep: 1,
        dsmQuizMode: false,
        currentTool: 'pan',
        selectMode: 'elements',
        undoStack: [],
        redoStack: [],
        // Inherit visualization config from current tab
        showGrid: uiStore.showGrid,
        gridSize: uiStore.gridSize,
        snapToGrid: uiStore.snapToGrid,
        showNodeLabels: uiStore.showNodeLabels,
        showElementLabels: uiStore.showElementLabels,
        showLengths: uiStore.showLengths,
        elementColorMode: uiStore.elementColorMode,
        showLoads: uiStore.showLoads,
        hideLoadsWithDiagram: uiStore.hideLoadsWithDiagram,
        showPrimarySelector: uiStore.showPrimarySelector,
        showSecondarySelector: uiStore.showSecondarySelector,
        showAxes: uiStore.showAxes,
        renderMode3D: uiStore.renderMode3D,
        momentStyle3D: uiStore.momentStyle3D,
        cameraMode3D: uiStore.cameraMode3D,
        showGrid3D: uiStore.showGrid3D,
        gridSize3D: uiStore.gridSize3D,
        snapToGrid3D: uiStore.snapToGrid3D,
        showNodeLabels3D: uiStore.showNodeLabels3D,
        showElementLabels3D: uiStore.showElementLabels3D,
        showLengths3D: uiStore.showLengths3D,
        showLoads3D: uiStore.showLoads3D,
        showAxes3D: uiStore.showAxes3D,
        axisConvention3D: uiStore.axisConvention3D,
        includeSelfWeight: uiStore.includeSelfWeight,
        liveCalc: uiStore.liveCalc,
        // New tabs inherit current viewport (user can zoom-to-fit after)
        zoom: uiStore.zoom,
        panX: uiStore.panX,
        panY: uiStore.panY,
        cameraPosition3D: { ...uiStore.cameraPosition3D },
        cameraTarget3D: { ...uiStore.cameraTarget3D },
      };

      tabs = [...tabs, newState];
      activeTabId = id;

      // Clear stores for clean slate
      modelStore.clear();
      resultsStore.clear();
      historyStore.clear();
      dsmStepsStore.clear();
      uiStore.resetSession();
    },

    /** Switch to a different tab */
    switchTab(id: string): void {
      if (id === activeTabId) return;
      const target = tabs.find(t => t.id === id);
      if (!target) return;

      // Set switching flag to suppress liveCalc $effect during restore
      _tabSwitching = true;

      // Save current tab (reassign array for Svelte 5 reactivity)
      if (activeTabId) {
        const idx = tabs.findIndex(t => t.id === activeTabId);
        if (idx !== -1) {
          const updated = [...tabs];
          updated[idx] = captureCurrentState();
          tabs = updated;
        }
      }

      activeTabId = id;
      // Re-find target from the updated array (in case it was the same reference)
      const freshTarget = tabs.find(t => t.id === id)!;
      restoreState(freshTarget);

      // Clear switching flag after microtask so $effects see the final state
      queueMicrotask(() => { _tabSwitching = false; });
    },

    /** Close a tab */
    closeTab(id: string): void {
      if (tabs.length <= 1) return; // can't close last tab
      if (!confirm(t('tabs.closeConfirm'))) return;

      const idx = tabs.findIndex(t => t.id === id);
      if (idx === -1) return;

      const wasActive = id === activeTabId;
      tabs = tabs.filter(t => t.id !== id);

      if (wasActive) {
        _tabSwitching = true;
        // Switch to adjacent tab
        const newIdx = Math.min(idx, tabs.length - 1);
        activeTabId = tabs[newIdx].id;
        restoreState(tabs[newIdx]);
        queueMicrotask(() => { _tabSwitching = false; });
      }
    },

    /** Rename a tab */
    renameTab(id: string, name: string): void {
      const idx = tabs.findIndex(t => t.id === id);
      if (idx === -1) return;
      // Reassign array for Svelte 5 reactivity (don't mutate in-place)
      const updated = [...tabs];
      updated[idx] = { ...updated[idx], name };
      tabs = updated;
      if (id === activeTabId) {
        modelStore.model.name = name;
      }
    },

    /** Update default tab names when the locale changes.
     *  Only renames tabs whose name matches a known default (any locale). */
    updateDefaultNames(): void {
      const newDefault = t('tabBar.newStructure');
      let changed = false;
      const updated = tabs.map(tab => {
        if (isDefaultName(tab.name)) {
          changed = true;
          return { ...tab, name: newDefault };
        }
        return tab;
      });
      if (changed) tabs = updated;
      if (isDefaultName(modelStore.model.name)) {
        modelStore.model.name = newDefault;
      }
    },

    /** Update the active tab's stored state (e.g., after model name changes) */
    syncActiveTabName(): void {
      if (!activeTabId) return;
      const idx = tabs.findIndex(t => t.id === activeTabId);
      if (idx === -1) return;
      // Reassign array for Svelte 5 reactivity (don't mutate in-place)
      const updated = [...tabs];
      updated[idx] = { ...updated[idx], name: modelStore.model.name };
      tabs = updated;
    },

    /** Sync active tab's full state into the tabs array (used before session save) */
    syncCurrentTab(): void {
      if (!activeTabId) return;
      const idx = tabs.findIndex(t => t.id === activeTabId);
      if (idx === -1) return;
      const updated = [...tabs];
      updated[idx] = captureCurrentState();
      tabs = updated;
    },

    /** Restore a full session (all tabs) from a saved file */
    restoreSession(savedTabs: TabState[], savedActiveId: string): void {
      if (savedTabs.length === 0) return;
      tabs = savedTabs;
      // Activate the tab that was active when session was saved
      const targetId = savedTabs.find(t => t.id === savedActiveId) ? savedActiveId : savedTabs[0].id;
      activeTabId = targetId;
      const target = savedTabs.find(t => t.id === targetId)!;
      restoreState(target);
    },
  };
}

export const tabManager = createTabManager();
