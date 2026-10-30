<script lang="ts">
  import { viewportCanvas } from '../lib/utils/viewport-canvas';
  import { connectionPrompt } from '../lib/store/connection-prompt.svelte';
  import { viewState } from '../lib/store/view-state.svelte';
  import { uiStore, modelStore, resultsStore, historyStore } from '../lib/store';
  import { saveProject, saveSession, loadFile } from '../lib/store/file';
  import { deleteSelection } from '../lib/actions/delete-selection';
  import { copySelection, cutSelection, paste, hasClipboard } from '../lib/store/model-clipboard';
  import { runSolve } from '../lib/actions/solve';
  import { TOOL_KEYS, TOOL_DATA_TAB, OPEN_PANEL_EVENT, type OpenPanelRequest } from '../lib/tool-keys';
  import { t } from '../lib/i18n';
  import { overlayWasOpenAtKeydown } from '../lib/utils/modal-overlay';

  /**
   * Every keyboard shortcut in Basic, in the one place that is always mounted.
   *
   * These lived inside `Toolbar.svelte` — the left sidebar — which the ribbon
   * replaced on desktop. `Toolbar` is now mounted only on mobile, so the whole
   * keyboard layer went with it: on desktop, V/N/E/S/L armed no tool, Enter did
   * not solve, Ctrl+Z did not undo and `?` did not open the shortcuts dialog.
   * The dialog still listed all of them, so the one panel a user opens to learn
   * the keyboard was describing a keyboard that was not there.
   *
   * Shortcuts are not a property of a sidebar, so they no longer live in one.
   * This component renders nothing; it exists to own the window listener.
   *
   * Solving goes through the shared `runSolve()` rather than the copy that sat
   * beside this handler — two implementations of "press Enter to solve" is how
   * the two drift apart.
   */

  /**
   * Which letter arms which tool comes from `lib/tool-keys.ts` — the one
   * table every display (ribbon, floating tools, mobile toolbar) reads too,
   * because four copies of it had already drifted.
   */
  /*
   * Ctrl+O needs a file input to click, and the one it used to click belonged
   * to Toolbar's markup — so on desktop `fileInput?.click()` optional-chained
   * its way to doing nothing at all. This component brings its own.
   */
  let { enabled = true }: { enabled?: boolean } = $props();

  let fileInput: HTMLInputElement | undefined = $state();

  async function handleLoadFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const result = await loadFile(file);
      if (result.type === 'session') {
        uiStore.toast(t('toast.sessionRestored').replace('{n}', String(result.count)), 'success');
      }
    } catch (err: any) {
      alert(err.message || t('toast.loadFileError'));
    }
    input.value = ''; // reset so same file can be loaded again
  }

  const tools = TOOL_KEYS;

  /**
   * Arming a tool from the keyboard does what arming it from the ribbon does.
   *
   * It used to do strictly less: it set `currentTool` and then tried to click
   * the matching tab button, which only exists while the Data panel is
   * already open. Press N with the panel shut and the node tool was armed
   * with nothing on screen to show it — and the ribbon lights a tool command
   * only while that panel is open, so Node did not light either. The two
   * complaints ("no me aparece la pestaña" and "ni la selecciona en la barra
   * superior") were the same missing step seen twice.
   *
   * The shell owns the panel, so this asks rather than reaches: one event,
   * handled where `basicPanel` actually lives. `toggle: false` because
   * arming a tool means "show me this", and pressing N twice should re-show
   * the nodes, not hide them.
   */
  function openForTool(toolId: string) {
    const dataTab = TOOL_DATA_TAB[toolId as keyof typeof TOOL_DATA_TAB];
    if (!dataTab) return; // pan/select edit nothing and own no tab
    const detail: OpenPanelRequest = { panel: 'data', dataTab, toggle: false };
    window.dispatchEvent(new CustomEvent(OPEN_PANEL_EVENT, { detail }));
  }

  function zoomToFit() {
    if (modelStore.nodes.size === 0) return;
    const canvas = viewportCanvas();
    if (!canvas) return;
    uiStore.zoomToFit(modelStore.nodes.values(), canvas.width, canvas.height);
  }

  /*
   * ── Copy, cut and paste belong to the page first ──────────────────
   * These took Cmd/Ctrl+C, X and V unconditionally for the model's own
   * clipboard, so text selected anywhere on the page — a result, a message,
   * a table — could only be copied from the context menu. The keys are the
   * page's when text is selected (or when there is nothing of the model to
   * copy or paste), and the model's otherwise.
   */
  function textSelected(): boolean {
    const sel = window.getSelection();
    return !!sel && !sel.isCollapsed && sel.toString().trim().length > 0;
  }
  const modelSelected = () => uiStore.selectedNodes.size > 0 || uiStore.selectedElements.size > 0;

  /*
   * ── An overlay keeps its keys ─────────────────────────────────────
   * The design desk, the 3-D reinforcement workspace and every `aria-modal` dialog cover the
   * model, and this handler listens on the window, so their keys reached it: Delete with the desk
   * open deleted the members still selected behind it, and the Escape that closed the desk also
   * cleared the model selection. While one is open the shortcuts that edit the model or its
   * selection stand down (the overlay's own Escape still closes it). See `modal-overlay.ts` for
   * why the question is asked of the moment the key went down.
   */
  /** The shortcuts that change the model or its selection — the ones an overlay silences. */
  function editsModel(e: KeyboardEvent, key: string): boolean {
    if (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'Escape') return true;
    if ((e.ctrlKey || e.metaKey) && (key === 'A' || key === 'X' || key === 'V')) return true;
    return !e.ctrlKey && !e.metaKey && !e.altKey && tools.some((tl) => tl.key === key);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!enabled) return;
    // Ignore if typing in an input or textarea
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
    if ((e.target as HTMLElement).isContentEditable) return;

    const key = e.key.toUpperCase();
    if (overlayWasOpenAtKeydown() && editsModel(e, key)) return;

    // Alt + letter: labels and the magnifier. Read from `code`, not `key` — on a Mac Alt turns
    // the letter into a symbol (Alt+N is "˜"). PRO and 3-D only, where these labels exist.
    if (e.altKey && !e.ctrlKey && !e.metaKey && uiStore.is3DWorkspace) {
      const handled = ({
        KeyN: () => { uiStore.showNodeLabels3D = !uiStore.showNodeLabels3D; },
        KeyB: () => { uiStore.showElementLabels3D = !uiStore.showElementLabels3D; },
        KeyL: () => { uiStore.showLengths3D = !uiStore.showLengths3D; },
        KeyP: () => { uiStore.showShellLabels3D = !uiStore.showShellLabels3D; },
        KeyM: () => { uiStore.showElementLabels3D = true; viewState.cycleMemberLabel(); },
        KeyZ: () => { window.dispatchEvent(new CustomEvent('stabileo-zoom-to-selection')); },
      } as Record<string, () => void>)[e.code];
      if (handled) { e.preventDefault(); handled(); return; }
    }
    // Alt+Z frames the selection in the plane view too.
    if (e.altKey && !e.ctrlKey && !e.metaKey && !uiStore.is3DWorkspace && e.code === 'KeyZ') {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('stabileo-zoom-to-selection'));
      return;
    }

    // Ctrl+Shift+S: Save session (all tabs)
    if ((e.ctrlKey || e.metaKey) && key === 'S' && e.shiftKey) {
      e.preventDefault();
      saveSession();
      return;
    }

    // Ctrl+S: Save project (current tab)
    if ((e.ctrlKey || e.metaKey) && key === 'S' && !e.shiftKey) {
      e.preventDefault();
      saveProject();
      return;
    }

    // Ctrl+O: Open/Load
    if ((e.ctrlKey || e.metaKey) && key === 'O') {
      e.preventDefault();
      fileInput?.click();
      return;
    }

    // Ctrl+Z: Undo
    if ((e.ctrlKey || e.metaKey) && key === 'Z' && !e.shiftKey) {
      e.preventDefault();
      historyStore.undo();
      return;
    }

    // Ctrl+Y or Ctrl+Shift+Z: Redo
    if ((e.ctrlKey || e.metaKey) && (key === 'Y' || (key === 'Z' && e.shiftKey))) {
      e.preventDefault();
      historyStore.redo();
      return;
    }

    // Ctrl+A: Select all
    if ((e.ctrlKey || e.metaKey) && key === 'A') {
      e.preventDefault();
      uiStore.setSelection(new Set(modelStore.nodes.keys()), new Set(modelStore.elements.keys()), true);
      return;
    }

    // Copy, cut and paste: PRO's clipboard (`store/model-clipboard.ts`). Paste places a ghost
    // that follows the pointer; Shift pastes in place.
    if ((e.ctrlKey || e.metaKey) && key === 'C') {
      if (textSelected() || !modelSelected()) return;
      if (copySelection()) e.preventDefault();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && key === 'X') {
      if (textSelected() || !modelSelected()) return;
      if (cutSelection()) e.preventDefault();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && key === 'V') {
      if (!hasClipboard()) return;
      e.preventDefault();
      paste(e.shiftKey);
      return;
    }

    // +/=: Zoom in
    if (e.key === '+' || e.key === '=') {
      uiStore.zoom *= 1.2;
      return;
    }

    // -: Zoom out
    if (e.key === '-') {
      uiStore.zoom *= 0.8;
      return;
    }

    // F: Zoom to fit
    if (key === 'F') {
      if (uiStore.is3DWorkspace) {
        window.dispatchEvent(new Event('stabileo-zoom-to-fit'));
      } else {
        zoomToFit();
      }
      return;
    }

    // Tool shortcuts (only without Ctrl/Meta to avoid conflicts with Ctrl+A, etc.)
    const tool = !e.ctrlKey && !e.metaKey ? tools.find(tl => tl.key === key) : undefined;
    if (tool) {
      e.preventDefault();
      uiStore.currentTool = tool.id;
      // Every edit-tool shortcut, not just N: E/S/L had the same gap.
      openForTool(tool.id);
      return;
    }

    // Diagram shortcuts (0-9)
    if (resultsStore.results || resultsStore.results3D) {
      const is3D = uiStore.is3DWorkspace;
      switch (e.key) {
        case '0': resultsStore.diagramType = 'none'; return;
        case '1': resultsStore.diagramType = 'deformed'; return;
        case '2': resultsStore.diagramType = is3D ? 'shearZ' : 'shear'; return;
        case '3': resultsStore.diagramType = is3D ? 'momentY' : 'moment'; return;
        case '4': if (is3D) { resultsStore.diagramType = 'shearY'; } return;
        case '5': if (is3D) { resultsStore.diagramType = 'momentZ'; } return;
        case '6': if (is3D) { resultsStore.diagramType = 'torsion'; } return;
        case '7': resultsStore.diagramType = 'axial'; return;
        case '8': resultsStore.diagramType = 'axialColor'; return;
        case '9': resultsStore.diagramType = 'colorMap'; return;
      }
    }

    // Delete: everything selected, every kind, one undo step (lib/actions/delete-selection).
    if (e.key === 'Delete' || e.key === 'Backspace') {
      deleteSelection();
      return;
    }

    // ESC: cancel / clear selection / close editors
    if (e.key === 'Escape') {
      uiStore.currentTool = 'select';
      uiStore.clearSelection();
      uiStore.editingNodeId = null;
      uiStore.editingElementId = null;
      return;
    }

    // ?: toggle help
    if (e.key === '?' || (e.shiftKey && key === '/')) {
      uiStore.showHelp = !uiStore.showHelp;
      return;
    }

    // G: toggle grid (2D and 3D)
    if (key === 'G') {
      // PRO is a 3-D viewport too; toggling the 2-D grid there changed nothing on screen.
      if (uiStore.is3DWorkspace) {
        uiStore.showGrid3D = !uiStore.showGrid3D;
      } else {
        uiStore.showGrid = !uiStore.showGrid;
      }
      return;
    }

    // H: toggle axes (2D and 3D)
    if (key === 'H' && !e.ctrlKey && !e.metaKey) {
      if (uiStore.is3DWorkspace) {
        uiStore.showAxes3D = !uiStore.showAxes3D;
      } else {
        uiStore.showAxes = !uiStore.showAxes;
      }
      return;
    }

    // Enter: solve (both 2D and 3D); with a connection question open, it answers yes instead.
    if (e.key === 'Enter') {
      e.preventDefault();
      if (connectionPrompt.current) { connectionPrompt.accept(); return; }
      runSolve();
      return;
    }

  }
</script>

<svelte:window onkeydown={handleKeydown} />

<input
  bind:this={fileInput}
  type="file"
  accept=".ded,.json"
  style="display:none"
  onchange={handleLoadFile}
/>
