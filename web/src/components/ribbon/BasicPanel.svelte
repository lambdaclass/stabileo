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
  import SheetGrab from '../SheetGrab.svelte';
  import AiDrawer from '../AiDrawer.svelte';
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

  /*
   * The sheet's height and its drag live in `SheetGrab.svelte`.
   *
   * They were here, and PRO's panel did not have them — which is the kind of
   * difference nobody decides, it just follows from which surface was built
   * first. Both are the same object, so both mount the same handle.
   */

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
    return () => {
      if (widthPublishFrame) cancelAnimationFrame(widthPublishFrame);
      document.documentElement.style.removeProperty('--st-right-panel-w');
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
    The phone's resize control and the ✕, on one row. Above 768 px the handle
    hides itself and the header keeps its own close button.
  -->
  <div class="bp-sheet-top">
    <SheetGrab storageKey="stabileo-basic-sheet-vh" />
    <button
      class="bp-grab-close"
      onclick={onClose}
      title={t('ribbon.close')}
      aria-label={t('ribbon.close')}
      data-testid="bp-sheet-close"
    >×</button>
  </div>
  <!--
    Model data names itself with its tabs, so on a phone it does without a title.
    ────────────────────────────────────────────────────────────────────────────
    A row reading "DATOS" above a strip of tabs reading Nodos / Barras / Apoyos
    is the word "data" spent on 40 px of a 667 px screen, directly above six
    controls that say the same thing more precisely. Every other panel keeps its
    heading: Results and Project have nothing else that names them.
  -->
  {#if !(uiStore.isMobile && panel === 'data')}
    <header class="bp-head">
      <span class="bp-title" data-testid="bp-title">{title}</span>
      <button class="bp-close" onclick={onClose} title={t('ribbon.close')} aria-label={t('ribbon.close')}>×</button>
    </header>
  {/if}

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
    {:else if panel === 'ai'}
      <AiDrawer docked />
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

  /* The handle row does not exist on a desktop, where the panel is resized
     from its leading edge and the header keeps its own ✕. */
  .bp-sheet-top { display: none; }

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
      /* Written by `SheetGrab` as the reader drags; the token in
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

    /* A horizontal drag on the leading edge cannot widen a full-width sheet. */
    .bp-resize { display: none; }

    /*
       Model data goes edge to edge.
       ─────────────────────────────
       The body's 0.65rem gutters are right for prose and for the stacked
       controls in Results, and wrong for this panel: they cost the six-button
       grid and the table 21 px of a 375 px screen for whitespace nobody reads.
       The tab strip carries its own 4 px instead.
    */
    .basic-panel[data-panel='data'] .bp-body {
      padding-left: 0;
      padding-right: 0;
      padding-top: 0;
    }

    /* ── The handle row ─────────────────────────────────────────────
       The handle itself is `SheetGrab.svelte`; this row exists to put the ✕
       beside it, so there is one place to close from whatever the panel shows.
       ──────────────────────────────────────────────────────────── */
    .bp-sheet-top {
      display: flex;
      align-items: center;
      flex: none;
      position: relative;
    }

    .bp-sheet-top :global(.grab) { flex: 1; }

    .bp-grab-close {
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
      /* Its own gesture, not the handle's. */
      touch-action: manipulation;
    }

    .bp-grab-close:active { color: var(--st-text); }



    /*
       One ✕, on the handle row. The header's own would be a second one four
       millimetres below the first, both closing the same panel — which is what
       shipped for exactly one build of this branch.
    */
    .bp-close { display: none; }

    /* Reduced at the top: the grab handle above already carries that space,
       and stacking both left a tall empty band before the title. */
    .bp-head { padding: 0.1rem 0.4rem 0.4rem 0.75rem; }
  }
</style>
