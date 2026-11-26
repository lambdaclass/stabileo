<script lang="ts">
  import { uiStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import { EXAMPLES_2D, EXAMPLES_3D, loadBasicExample, type BasicExample } from '../../lib/examples/basic-examples';

  let showExamples = $state(false);
  let showExamples3D = $state(false);

  const examples = EXAMPLES_2D;
  const examples3D = EXAMPLES_3D;




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

<!--
  One structure, not five near-identical mode branches.

  The markup carried a separate copy per mode, which is how the 3D list came to
  be gated on `showExamples3D` alone while every other list was gated on
  `flat || show…` — so in the right panel, in 3D, the 3D examples never
  appeared and the user was offered only the 2D ones.

  Both catalogues are now offered in both modes, under their own headings. A 2D
  model opens fine in the 3D viewport, and picking a 3D example from 2D switches
  the viewport with it rather than flattening a space frame into a plane.
-->
{#snippet exampleList(items: readonly BasicExample[], to3D: boolean)}
  <div class="examples-list">
    {#each items as ex}
      <button class="example-item" data-testid={`example-${ex.id}`} onclick={async () => {
        /*
         * The example decides the mode, in BOTH directions.
         *
         * Switching to 3D for a 3D example but never back left a planar model
         * opened from 2D-in-3D: a three-hinge arch has no out-of-plane
         * restraint, so the 3D solver correctly called it a mechanism and the
         * example looked broken. An example carries the mode it was built for.
         */
        await loadBasicExample(ex.id, to3D);
        /*
         * On a phone, get out of the way of the model you just loaded.
         *
         * This used to close `leftDrawerOpen`, the old Toolbar drawer this list
         * lived in. That drawer is gone: the list is in BasicPanel now, which on
         * a phone is a bottom sheet covering the lower 58 % of the canvas. The
         * zoom-to-fit below frames the model in the WHOLE canvas, sheet or no
         * sheet, so leaving it open put the structure behind it and the example
         * appeared not to load at all.
         *
         * Desktop keeps the panel: there it sits beside the model rather than
         * over it, and closing it would throw away the list you may want again.
         */
        if (uiStore.isMobile) window.dispatchEvent(new CustomEvent('stabileo-open-panel', { detail: null }));
      }}>
        <span class="example-name">{t(ex.nameKey)}</span>
        <span class="example-desc">{t(ex.descKey)}</span>
      </button>
    {/each}
  </div>
{/snippet}

<!--
  A disclosure in BOTH layouts.

  The right panel used to render every catalogue open: nineteen 2D examples
  followed by ten 3D ones, all expanded, with everything else in Project —
  export, import, the tutorials — pushed below thirty rows nobody scrolled
  past. A list that long is a wall, not a menu.

  Closed by default and counted in the header, so the panel shows what it
  holds without unrolling it, which is how PRO presents the same thing.
-->
{#snippet group(titleKey: string, items: readonly BasicExample[], to3D: boolean, open: boolean, toggle: () => void)}
  <div class="toolbar-section">
    <button class="section-toggle" onclick={toggle} data-testid={`ex-group-${to3D ? '3d' : '2d'}`}>
      <span>{open ? '▾' : '▸'} {t(titleKey)}</span>
      <span class="ex-count">{items.length}</span>
    </button>
    {#if open}{@render exampleList(items, to3D)}{/if}
  </div>
{/snippet}

<div data-tour="examples-section" class="ex-groups">
  <!--
    PRO has its own gallery, under Project › New model (`ProExampleGallery.svelte`); a second
    PRO list here was never mounted in PRO and disagreed with it.
  -->
    <!--
      2D first, then 3D, in BOTH modes.

      This used to put the catalogue for the mode you are in at the top, on the
      reasoning that in 3D the 3D examples should not sit under nineteen 2D
      ones. That was true when both lists were rendered open; now they are
      disclosures, so neither is buried and the argument is gone — leaving only
      the cost, which is that the two headings trade places when the mode
      changes. A menu whose items move is one you have to read every time
      instead of learning where things are.
    -->
    {@render group('examples.title2d', [...examples], false, showExamples, () => showExamples = !showExamples)}
    {@render group('examples.title3d', examples3D, true, showExamples3D, () => showExamples3D = !showExamples3D)}
</div>

<style>
  .ex-groups {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .toolbar-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .toolbar-section h3 {
    font-size: 0.75rem;
    text-transform: uppercase;
    color: var(--st-text-3);
    letter-spacing: 0.05em;
  }

  .ex-count {
    font-size: 0.6rem;
    color: var(--st-text-3);
    font-family: var(--st-mono, monospace);
  }

  .section-toggle {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
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

  /*
     In the right panel the list IS the panel's content, so it drops the frame.
     A bordered, 260 px-tall scroll box made sense in the narrow left sidebar it
     was written for; inside a 320 px panel it reads as a window within a window,
     gives up width to its own padding, and scrolls internally while most of the
     panel below it sits empty.
  */
  :global(.basic-panel) .examples-list {
    max-height: none;
    overflow-y: visible;
    border: none;
    border-radius: 0;
    padding: 0;
    gap: 0;
  }

  :global(.basic-panel) .example-item {
    padding: 6px 8px;
    border: 1px solid var(--st-hair);
    border-left: 2px solid transparent;
    border-radius: var(--st-radius, 3px);
    transition: background 0.12s, border-color 0.12s, color 0.12s;
  }

  :global(.basic-panel) .example-item:hover {
    border-left-color: var(--st-accent);
  }

  .ex-heading {
    font-family: var(--st-mono);
    font-size: 0.66rem;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: var(--st-text-2);
    font-weight: 400;
    padding-bottom: 0.15rem;
    border-bottom: 1px solid var(--st-hair);
  }

  .examples-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 260px;
    overflow-y: auto;
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    padding: 2px;
  }

  .example-item {
    display: flex;
    flex-direction: column;
    padding: 0.35rem 0.5rem;
    background: none;
    border: none;
    border-radius: 3px;
    color: var(--st-text);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
  }

  .example-item:hover {
    background: var(--st-surface-3);
    color: white;
  }

  .example-name {
    font-size: 0.8rem;
    font-weight: 500;
  }

  .example-desc {
    font-size: 0.65rem;
    color: var(--st-text-3);
  }

  .example-item:hover .example-desc {
    color: var(--st-text-2);
  }

  .input-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
  }

  .input-group input {
    width: 70px;
    padding: 0.25rem;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    color: var(--st-text);
    cursor: pointer;
  }

  .input-group select {
    flex: 1;
    min-width: 100px;
    padding: 0.25rem;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    color: var(--st-text);
    cursor: pointer;
  }

  input[type="checkbox"] {
    accent-color: var(--st-accent);
  }

  .file-btn {
    padding: 0.35rem 0.4rem;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    color: var(--st-text);
    cursor: pointer;
    font-size: 0.75rem;
    text-align: center;
    transition: all 0.2s;
  }

  .file-btn:hover:not(:disabled) {
    background: var(--st-surface-3);
    color: white;
  }

  .file-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
