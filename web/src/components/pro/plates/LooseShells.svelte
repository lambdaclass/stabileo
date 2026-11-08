<script lang="ts">
  import { modelStore, uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { looseShells, platesFromShells } from '../../../lib/store/plates-from-shells';

  const loose = $derived.by(() => { void modelStore.model.groups; void modelStore.modelVersion; return looseShells(); });
  const picked = $derived.by(() => { const set = new Set(loose); return [...uiStore.selectedShells].filter((k) => set.has(k)); });

  function convert(keys: string[]) {
    const ids = platesFromShells(keys);
    if (!ids.length) { uiStore.toast(t('plates.convertFailed'), 'error'); return; }
    uiStore.shellPickScope = 'plate';
    uiStore.selectPlates(ids);
    uiStore.toast(tp('plates.converted', { n: ids.length }), 'success');
  }
</script>

{#if loose.length}
  <div class="ls" data-testid="plates-loose">
    <p>{tp('plates.looseShells', { n: loose.length })}</p>
    <div class="ls-actions">
      {#if picked.length}
        <button class="pro-btn" onclick={() => convert(picked)} data-testid="plates-convert-selected">{tp('plates.convertSelected', { n: picked.length })}</button>
      {/if}
      <button class="pro-btn" onclick={() => convert(loose)} data-testid="plates-convert-all">{t('plates.convertAll')}</button>
    </div>
  </div>
{/if}

<style>
  .ls { margin: 6px 0; padding: 8px 10px; border: 1px solid var(--st-warn); border-radius: var(--st-radius); background: color-mix(in srgb, var(--st-warn) 8%, transparent); font-size: 0.75rem; color: var(--st-text-2); }
  .ls p { margin: 0 0 6px; }
  .ls-actions { display: flex; flex-wrap: wrap; gap: 6px; }
</style>
