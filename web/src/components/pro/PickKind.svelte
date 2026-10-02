<script lang="ts">
  /**
   * A panel that acts on selected members or nodes, while its own pointer picks something else
   * (Loads picks loads, Supports picks supports): this switches the pointer to what the action
   * needs. Without it, "on the selected members" waited for a selection the panel could not make.
   */
  import { uiStore } from '../../lib/store';
  import { t } from '../../lib/i18n';

  let { kind }: { kind: 'nodes' | 'elements' } = $props();
  const picking = $derived(uiStore.selectMode === kind);
</script>

{#if !picking}
  <button type="button" class="pk" onclick={() => (uiStore.selectMode = kind)} data-testid="pick-{kind}">
    {t(kind === 'nodes' ? 'pick.nodes' : 'pick.members')}
  </button>
{:else}
  <span class="pk-now">{t(kind === 'nodes' ? 'pick.nodesNow' : 'pick.membersNow')}</span>
{/if}

<style>
  .pk { padding: 1px 8px; font-size: 0.64rem; background: none; border: 1px dashed var(--st-hair); border-radius: 4px; color: var(--st-text-2); cursor: pointer; }
  .pk:hover { border-color: var(--st-interactive); color: var(--st-text); }
  .pk-now { font-size: 0.62rem; color: var(--st-text-3); }
</style>
