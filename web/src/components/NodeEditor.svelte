<script lang="ts">
  /**
   * Double-click a node: its coordinates, editable.
   *
   * The chrome — frame, title, dragging, staying on screen — is `EditorCard`,
   * shared with the member editor. What is here is the two numbers and the
   * one thing that matters about writing them back: a coordinate change goes
   * through `modelStore.updateNode`, which bumps the model version, fires the
   * mutation hook and reassigns the map, and then the results are cleared
   * because they describe a model that no longer exists.
   */
  import { modelStore, uiStore, historyStore, resultsStore } from '../lib/store';
  import { t } from '../lib/i18n';
  import { TWO_D_HORIZONTAL_AXIS_LABEL, TWO_D_VERTICAL_AXIS_LABEL } from '../lib/geometry/coordinate-system';
  import EditorCard from './EditorCard.svelte';
  import { unitQ } from '../lib/store/display-units.svelte';
  import { toDisplay, fromDisplay } from '../lib/utils/units';

  let inputX = $state<HTMLInputElement | null>(null);

  const nodeId = $derived(uiStore.editingNodeId);
  const node = $derived(nodeId !== null ? modelStore.getNode(nodeId) : null);
  const pos = $derived(uiStore.editScreenPos);

  /*
   * The fields show the chosen unit system; the model keeps metres. What each
   * field showed when it opened is kept, so a coordinate left untouched keeps
   * its exact value instead of the one rounded to the digits on screen.
   */
  let localX = $state('');
  let localY = $state('');
  let shownX = '';
  let shownY = '';

  // Three decimals, a millimetre in metres and a third of one in feet.
  const show = (m: number) => toDisplay(m, 'length', uiStore.unitSystem).toFixed(3);

  $effect(() => {
    if (node) {
      localX = shownX = show(node.x);
      localY = shownY = show(node.y);
      setTimeout(() => inputX?.select(), 0);
    }
  });

  /** A field back in metres: the exact value when left as shown, NaN when not a number. */
  function metres(text: string | number, shown: string, exact: number): number {
    if (String(text) === shown) return exact;
    const n = parseFloat(String(text));
    return Number.isFinite(n) ? fromDisplay(n, 'length', uiStore.unitSystem) : NaN;
  }

  function confirm() {
    if (!node || nodeId === null) return;
    const x = metres(localX, shownX, node.x);
    const y = metres(localY, shownY, node.y);
    if (isNaN(x) || isNaN(y)) return;
    if (x !== node.x || y !== node.y) {
      historyStore.pushState();
      modelStore.updateNode(nodeId, x, y);
      /* The analysis described the node where it was. */
      resultsStore.clear();
    }
    close();
  }

  function close() {
    uiStore.editingNodeId = null;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); confirm(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    e.stopPropagation();
  }
</script>

{#if node}
  <EditorCard
    title="{t('editor.node')} {nodeId}"
    anchor={pos}
    onClose={close}
    onKeydown={handleKeydown}
    testid="node-editor"
  >
    <label class="ne-field">
      <span>{TWO_D_HORIZONTAL_AXIS_LABEL} ({unitQ('length')})</span>
      <input
        bind:this={inputX}
        type="number"
        step="0.001"
        bind:value={localX}
        data-testid="node-editor-x"
      />
    </label>

    <label class="ne-field">
      <span>{TWO_D_VERTICAL_AXIS_LABEL} ({unitQ('length')})</span>
      <input type="number" step="0.001" bind:value={localY} data-testid="node-editor-y" />
    </label>

    {#snippet footer()}
      <button class="ne-btn" onclick={close}>{t('editor.cancel')}</button>
      <button class="ne-btn ne-ok" onclick={confirm} data-testid="node-editor-ok">OK</button>
    {/snippet}
  </EditorCard>
{/if}

<style>
  .ne-field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .ne-field span {
    flex: 1;
    color: var(--st-text-2);
  }

  .ne-field input {
    width: 92px;
    padding: 0.22rem 0.35rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    background: var(--st-surface-2);
    color: var(--st-text);
    font: inherit;
    font-size: 0.72rem;
  }

  .ne-field input:focus {
    outline: none;
    border-color: var(--st-accent);
  }

  .ne-btn {
    padding: 0.25rem 0.6rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    background: var(--st-surface-2);
    color: var(--st-text-2);
    font: inherit;
    font-size: 0.7rem;
    cursor: pointer;
  }

  .ne-btn:hover { color: var(--st-text); border-color: var(--st-hair-strong); }

  .ne-ok {
    border-color: var(--st-accent);
    color: var(--st-accent);
  }

  .ne-ok:hover { background: var(--st-selected-bg); }
</style>
