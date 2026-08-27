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

<aside class="basic-panel" data-testid="basic-panel" data-panel={panel} style:width="{width}px">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="bp-resize"
    class:dragging
    onpointerdown={startResize}
    role="separator"
    aria-orientation="vertical"
    aria-label={t('ribbon.resize')}
  ></div>
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
</style>
