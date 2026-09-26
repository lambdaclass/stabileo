<script lang="ts">
  /**
   * The mechanism a failed solve found: which nodes are free to move, and how.
   * `store/instability.svelte.ts` asks the engine; this shows it, and selects the nodes.
   */
  import { uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { instability } from '../../lib/store/instability.svelte';

  const CAP = 60;
  const r = $derived(instability.current);
  const dofLabel = (d: string) => t(`instab.dof.${d}`) === `instab.dof.${d}` ? d : t(`instab.dof.${d}`);

  function selectNodes() {
    if (!r) return;
    const ids = new Set([...r.mechanismNodes, ...r.unconstrainedDofs.map((d) => d.nodeId)]);
    uiStore.selectMode = 'nodes';
    uiStore.setSelection(ids, new Set(), false);
  }
</script>

{#if r}
  <section class="pk-card instab" data-testid="instability-report">
    <h4 class="pk-heading">{t('instab.title')}</h4>
    <p class="instab-lead">{tp('instab.lead', { modes: r.mechanismModes, nodes: new Set([...r.mechanismNodes, ...r.unconstrainedDofs.map((d) => d.nodeId)]).size })}</p>
    {#if r.unconstrainedDofs.length > 0}
      <table class="instab-table" data-testid="instability-dofs">
        <thead><tr><th>{t('instab.node')}</th><th>{t('instab.free')}</th></tr></thead>
        <tbody>
          {#each r.unconstrainedDofs.slice(0, CAP) as d (`${d.nodeId}:${d.dof}`)}
            <tr><td class="col-id">{d.nodeId}</td><td>{dofLabel(d.dof)}</td></tr>
          {/each}
        </tbody>
      </table>
      {#if r.unconstrainedDofs.length > CAP}<p class="pk-hint">{tp('instab.more', { n: r.unconstrainedDofs.length - CAP })}</p>{/if}
    {/if}
    <p class="pk-hint">{t('instab.hint')}</p>
    <div class="pk-row">
      <button class="pk-btn pk-btn-primary" onclick={selectNodes} data-testid="instability-select">{t('instab.select')}</button>
      <button class="pk-btn" onclick={() => instability.clear()}>{t('instab.dismiss')}</button>
    </div>
  </section>
{/if}

<style>
  .instab { border-color: var(--st-danger); }
  .instab-lead { margin: 0 0 6px; font-size: 0.68rem; color: var(--st-text-2); }
  .instab-table { width: 100%; border-collapse: collapse; font-size: 0.64rem; margin-bottom: 4px; }
  .instab-table th, .instab-table td { padding: 2px 4px; border-bottom: 1px solid var(--st-hair); text-align: left; }
</style>
