<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import ToolbarResults from '../toolbar/ToolbarResults.svelte';
  import SelectionPanel from '../SelectionPanel.svelte';
  import ToolbarAdvanced from '../toolbar/ToolbarAdvanced.svelte';
  import ToolbarConfig from '../toolbar/ToolbarConfig.svelte';
  import ToolbarProject from '../toolbar/ToolbarProject.svelte';
  import KinematicPanel from '../KinematicPanel.svelte';
  import WhatIfPanel from '../WhatIfPanel.svelte';
  import SectionStressPanel from '../SectionStressPanel.svelte';
  import DataTable from '../DataTable.svelte';
  import StepWizard from '../dsm/StepWizard.svelte';
  import { dsmStepsStore } from '../../lib/store/dsmSteps.svelte';
  import { uiStore } from '../../lib/store/ui.svelte';
  import { resultsStore } from '../../lib/store/results.svelte';

  /**
   * The right-hand panel: one thing, named by the command that opened it.
   *
   * It holds only what genuinely needs area and outlives a single tool —
   * results, advanced analysis, project, settings. Tool options do
   * NOT come here: they were tried here and fought the panel, because they are
   * written as horizontal strips and because putting a tool's settings at the
   * far right disconnects them from the button at the top that summoned them.
   * They live in the contextual bar under the ribbon instead.
   */

  type Props = {
    panel: string;
    /**
     * The open Model-data tab, BOUND. The ribbon lights whichever command
     * matches it, so a change made inside the table has to travel back up.
     */
    dataTab?: string;
    onClose: () => void;
  };
  let { panel, dataTab = $bindable('nodes'), onClose }: Props = $props();

  /**
   * Width is dragged and remembered.
   *
   * A fixed 300 px is a guess that is wrong for both ends of the work: the
   * results panel wants to be narrow and the model data table wants to be wide.
   * Persisting it in localStorage means the guess only has to be corrected
   * once, ever.
   */
  const MIN = 240;
  const MAX = 620;
  const KEY = 'stabileo-basic-panel-width';

  function stored(): number {
    try {
      const v = Number(localStorage.getItem(KEY));
      return Number.isFinite(v) && v >= MIN && v <= MAX ? v : 320;
    } catch { return 320; }
  }

  let width = $state(stored());
  let dragging = $state(false);
  let widthPublishFrame = 0;

  /* ── The phone: height, dragged from a handle ──────────────────────────
   *
   * The desktop panel is resized by dragging its leading EDGE, which is the
   * gesture that fits a panel whose size is a width. A sheet's size is a
   * height, and its leading edge is a 1 px line at the top of the screen's
   * lower half — so the sheet gets its own control: a grab handle above the
   * title, which is the only thing on the panel that drags.
   *
   * That separation is the point. The body scrolls and the handle resizes, and
   * a finger on one never does the other — `touch-action: none` on the handle
   * keeps the browser from claiming the gesture as a scroll, and the body keeps
   * ordinary `overflow-y: auto` because nothing intercepts it.
   *
   * 45vh at rest rather than the 58 it opened at. Fifty-eight was picked to
   * make a results table worth reading and it did not even manage that — the
   * table began 10 px above the bottom of the screen — while costing the model
   * more than half the height. A lower default plus a drag serves both ends
   * better than any single number can.
   */
  const SHEET_MIN = 22;
  const SHEET_MAX = 86;
  const SHEET_DEFAULT = 45;
  const SHEET_KEY = 'stabileo-basic-sheet-vh';

  function storedSheet(): number {
    try {
      const v = Number(localStorage.getItem(SHEET_KEY));
      return Number.isFinite(v) && v >= SHEET_MIN && v <= SHEET_MAX ? v : SHEET_DEFAULT;
    } catch { return SHEET_DEFAULT; }
  }

  let sheetVh = $state(storedSheet());
  let sheetDragging = $state(false);
  let sheetPublishFrame = 0;

  /*
   * Published on the root, not set inline, because two elements need it: this
   * panel's own box and the padding `.app-body` gives up so the canvas is the
   * size it appears to be. The token in `styles/tokens.css` is the default the
   * stylesheet starts from; this overrides it once the reader has an opinion.
   */
  function publishSheet() {
    // One decimal. A pointer delta divided by a viewport hundredth produces
    // fifteen significant figures, and every one of them past the first lands
    // in the DOM and in whatever anyone reads it back with.
    document.documentElement.style.setProperty('--st-sheet-h', `${sheetVh.toFixed(1)}vh`);
  }

  function startSheetDrag(e: PointerEvent) {
    sheetDragging = true;
    const startY = e.clientY;
    const startVh = sheetVh;
    const vh = window.innerHeight / 100;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);

    const move = (ev: PointerEvent) => {
      // Dragging UP grows the sheet, which is the direction it grows on screen.
      const next = startVh + (startY - ev.clientY) / vh;
      sheetVh = Math.min(SHEET_MAX, Math.max(SHEET_MIN, next));
      if (!sheetPublishFrame) {
        sheetPublishFrame = requestAnimationFrame(() => {
          sheetPublishFrame = 0;
          publishSheet();
        });
      }
    };

    const up = () => {
      sheetDragging = false;
      try { localStorage.setItem(SHEET_KEY, String(Math.round(sheetVh))); } catch { /* private mode */ }
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      /*
       * Re-frame once, at the END of the drag.
       *
       * The canvas has just changed height by as much as 60 % of the screen, so
       * whatever framing preceded the drag is wrong for what is left. Doing it
       * on every pointermove instead would make the model chase the handle,
       * and it would re-fit sixty times a second against a canvas that is
       * still being resized.
       */
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.dispatchEvent(new Event('stabileo-zoom-to-fit'));
      }));
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    e.preventDefault();
  }

  function publishWidth() {
    document.documentElement.style.setProperty('--st-right-panel-w', `${width}px`);
  }

  function startResize(e: PointerEvent) {
    dragging = true;
    const startX = e.clientX;
    const startW = width;
    const move = (ev: PointerEvent) => {
      // The handle is on the panel's LEFT edge, so dragging left widens it.
      width = Math.min(MAX, Math.max(MIN, startW - (ev.clientX - startX)));
      // Publishing the width writes a custom property on the ROOT element,
      // which re-resolves styles document-wide — that must happen at most
      // once per frame, not once per pointermove.
      if (!widthPublishFrame) {
        widthPublishFrame = requestAnimationFrame(() => {
          widthPublishFrame = 0;
          publishWidth();
        });
      }
    };
    const up = () => {
      dragging = false;
      try { localStorage.setItem(KEY, String(Math.round(width))); } catch { /* private mode */ }
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    e.preventDefault();
  }

  /** Heading, so the panel always says what it is showing. */
  const title = $derived(t(`ribbon.${panel}`));

  /*
   * Publish the width so fixed-position overlays can stay clear of the panel.
   *
   * Toasts are anchored bottom-right of the viewport, which used to be the
   * corner of the canvas and is now the middle of this panel — success messages
   * landed on top of the report they were announcing. A custom property is the
   * least invasive way to tell them: nothing has to be threaded through the
   * component tree, and the value follows the drag handle for free.
   *
   * Mount-only: during a drag the value is published by the rAF-throttled
   * writer in `startResize`; a reactive effect here would re-resolve the whole
   * document's styles on every pointermove.
   */
  onMount(() => {
    publishWidth();
    publishSheet();
    return () => {
      if (widthPublishFrame) cancelAnimationFrame(widthPublishFrame);
      if (sheetPublishFrame) cancelAnimationFrame(sheetPublishFrame);
      document.documentElement.style.removeProperty('--st-right-panel-w');
      /*
       * Handed back on unmount so `.app-body` stops reserving height the moment
       * the sheet closes. Leaving it would keep a band of the canvas walled off
       * for a panel that is no longer there.
       */
      document.documentElement.style.removeProperty('--st-sheet-h');
    };
  });

  /*
   * Bring a freshly opened analysis into view.
   *
   * The docked outputs sit below a list of thirteen analyses, and the Kinematic
   * report alone is longer than the panel. Opening Explore while Kinematic was
   * up therefore appended its sliders somewhere off the bottom of the scroll,
   * and the button you had just pressed looked like it had done nothing. The
   * count of open outputs is the trigger — it rises only when one opens, so
   * this never fights a user who has scrolled up to read something.
   */
  let dockedOutputs = $state<HTMLElement | null>(null);
  const openOutputs = $derived(
    (uiStore.showKinematicPanel ? 1 : 0) +
    (uiStore.showWhatIf ? 1 : 0) +
    (resultsStore.stressQuery ? 1 : 0),
  );
  let lastOpen = 0;
  $effect(() => {
    const n = openOutputs;
    if (n > lastOpen && dockedOutputs) {
      requestAnimationFrame(() => dockedOutputs?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    }
    lastOpen = n;
  });
</script>

<aside
  class="basic-panel"
  class:sheet-dragging={sheetDragging}
  data-testid="basic-panel"
  data-panel={panel}
  style:width="{width}px"
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="bp-resize"
    class:dragging
    onpointerdown={startResize}
    role="separator"
    aria-orientation="vertical"
    aria-label={t('ribbon.resize')}
  ></div>
  <!--
    The phone's resize control, and the ONLY thing on the sheet that drags.
    Hidden above 768 px, where the panel is resized from its edge instead.
  -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="bp-grab"
    onpointerdown={startSheetDrag}
    role="separator"
    aria-orientation="horizontal"
    aria-label={t('ribbon.resize')}
    data-testid="bp-grab"
  ><span class="bp-grab-pill"></span></div>
  <header class="bp-head">
    <span class="bp-title" data-testid="bp-title">{title}</span>
    <button class="bp-close" onclick={onClose} title={t('ribbon.close')} aria-label={t('ribbon.close')}>×</button>
  </header>

  <div class="bp-body">
    {#if panel === 'selection'}
      <SelectionPanel />
    {:else if panel === 'results'}
      <ToolbarResults hideDiagrams flat />
    {:else if panel === 'advanced'}
      <ToolbarAdvanced flat />
      <!--
        An analysis and its output in one column: pick Kinematic here and its
        report unfolds directly beneath the button that ran it. These used to
        float over the canvas, which put the answer on top of the question.
      -->
      <div bind:this={dockedOutputs}>
        <KinematicPanel docked />
        <WhatIfPanel docked />
        <SectionStressPanel docked />
      </div>
    {:else if panel === 'settings'}
      <ToolbarConfig flat />
    {:else if panel === 'project'}
      <ToolbarProject flat />
    {:else if panel === 'data'}
      <!--
        Model data and the step-by-step wizard used to live in a SECOND right
        sidebar with its own toggle, so opening one while the other was up gave
        two stacked panels on the same edge. One panel, one edge.
      -->
      {#if dsmStepsStore.isOpen}
        <StepWizard />
      {:else}
        <DataTable bind:activeTab={dataTab} />
      {/if}
    {/if}
  </div>
</aside>

<style>
  .basic-panel {
    position: relative;
    flex: none;
    display: flex;
    flex-direction: column;
    background: var(--st-surface);
    border-left: 1px solid var(--st-hair);
    font-family: var(--st-sans);
  }

  .bp-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.55rem 0.75rem;
    border-bottom: 1px solid var(--st-hair);
    flex: none;
  }

  .bp-title {
    font-family: var(--st-mono);
    font-size: 0.68rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--st-text-2);
  }

  .bp-close {
    background: none;
    border: none;
    color: var(--st-text-2);
    font-size: 1.2rem;
    line-height: 1;
    padding: 0.1rem 0.4rem;
    cursor: pointer;
    border-radius: var(--st-radius);
  }

  .bp-close:hover { background: var(--st-surface-3); color: var(--st-text); }

  .bp-body {
    flex: 1;
    overflow-y: auto;
    padding: 0.65rem;
  }

  /* A 5 px target on the panel's leading edge; the visible rule stays 1 px. */
  .bp-resize {
    position: absolute;
    left: -2px;
    top: 0;
    bottom: 0;
    width: 5px;
    cursor: col-resize;
    z-index: 2;
  }

  .bp-resize:hover,
  .bp-resize.dragging { background: var(--st-accent); }

  /* The phone's grab handle does not exist on a desktop, where the panel is
     resized from its leading edge. */
  .bp-grab { display: none; }

  /* ── The phone: a bottom sheet, not a side panel ──────────────────────
     Same panel, same contents, laid out along the axis a phone has more of.

     As a side panel it would take its remembered desktop width — 320 px of a
     375 px screen — and opening the results would hide the structure they
     describe. That is the measurement the old right drawer was already moved
     for; this is the same decision applied to the panel that replaced it, so
     the two do not disagree about what a phone should do.

     The height is `--st-sheet-h`, a token because `.app-body` in `App.svelte`
     reserves exactly that much: the sheet shares the screen with the canvas
     rather than covering it, so the model above it is really there and gets
     framed into what is left. Fixed for now — §5.3 of the handoff is the grab
     handle and the drag between a peek height and full, and it is the next
     piece of work rather than part of this one.
     ────────────────────────────────────────────────────────────────── */
  @media (max-width: 767px) {
    .basic-panel {
      position: fixed;
      top: auto;
      bottom: 0;
      left: 0;
      right: 0;
      /* Beats the inline `style:width` the drag handle writes, which is a
         desktop measurement and meaningless here. */
      width: 100% !important;
      /* Written by `publishSheet()` as the reader drags; the token in
         `styles/tokens.css` is the value it starts from. `.app-body` reserves
         exactly this much, so the canvas is the size it appears to be. */
      height: var(--st-sheet-h);
      max-height: var(--st-sheet-h);
      z-index: 60;
      border-left: none;
      border-top: 1px solid var(--st-hair-strong);
      border-radius: 12px 12px 0 0;
      animation: bp-sheet-up 0.25s ease;
    }

    @keyframes bp-sheet-up {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }

    /*
       Nothing animates while a finger is on the handle. The slide-in is for
       the panel arriving; during a drag the height IS the gesture and any
       easing between frames reads as lag.
    */
    .basic-panel.sheet-dragging { animation: none; }

    /* A horizontal drag on the leading edge cannot widen a full-width sheet. */
    .bp-resize { display: none; }

    /* ── The grab handle ────────────────────────────────────────────
       The one surface that resizes the sheet. The body below it scrolls, and
       the two never trade places: `touch-action: none` here tells the browser
       this gesture is not a scroll, which is what keeps a drag on the handle
       from also flinging the list underneath.

       28 px tall for a target that is dragged rather than tapped, with a 4 px
       pill doing the saying. It sits ABOVE the title so the panel still names
       itself with the handle in place.
       ──────────────────────────────────────────────────────────── */
    .bp-grab {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 28px;
      flex: none;
      cursor: row-resize;
      touch-action: none;
      -webkit-user-select: none;
      user-select: none;
    }

    .bp-grab-pill {
      width: 40px;
      height: 4px;
      border-radius: 2px;
      background: var(--st-hair-strong);
      transition: background 0.15s, width 0.15s;
    }

    .bp-grab:active .bp-grab-pill,
    .sheet-dragging .bp-grab-pill {
      background: var(--st-accent);
      width: 56px;
    }

    .bp-grab:focus-visible { outline: 2px solid var(--st-accent); outline-offset: -3px; }


    /* The only control in the header, and it dismisses the panel. */
    .bp-close {
      min-width: 44px;
      min-height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.4rem;
    }

    /* Reduced at the top: the grab handle above already carries that space,
       and stacking both left a tall empty band before the title. */
    .bp-head { padding: 0.1rem 0.4rem 0.4rem 0.75rem; }
  }
</style>
