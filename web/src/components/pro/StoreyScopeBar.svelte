<script lang="ts">
  /**
   * On the view, in PRO with two levels or more: which storeys an edit reaches (this one, the
   * similar ones, all), and what the selection took on them. The selection follows the scope as
   * it changes.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { storeyScope } from '../../lib/store/storey-scope.svelte';
  import type { StoreyScope } from '../../lib/model/similar-storeys';

  const SCOPES: StoreyScope[] = ['this', 'similar', 'all'];
  const show = $derived(uiStore.analysisMode === 'pro' && (modelStore.grid?.levels.length ?? 0) > 1);
  const hasSimilar = $derived((modelStore.grid?.levels ?? []).some((l) => !!l.similarTo));

  $effect(() => {
    void uiStore.selectedElements; void uiStore.selectedNodes; void uiStore.selectedShells; void storeyScope.scope;
    queueMicrotask(() => storeyScope.expandSelection());
  });

  const last = $derived(storeyScope.active ? storeyScope.last : null);
  const copied = $derived(storeyScope.active ? storeyScope.lastReplication : null);
  const names = (ids: readonly string[]) => ids.map(levelName).join(', ');
  const levelName = (id: string) => modelStore.grid?.levels.find((l) => l.id === id)?.name ?? id;
</script>

{#if show}
  <div class="ss" data-testid="storey-scope">
    <span class="ss-label">{t('storeys.scope')}</span>
    <div class="ss-seg" role="radiogroup" aria-label={t('storeys.scope')}>
      {#each SCOPES as s (s)}
        <button type="button" role="radio" aria-checked={storeyScope.scope === s} class:on={storeyScope.scope === s}
          disabled={s === 'similar' && !hasSimilar} title={s === 'similar' && !hasSimilar ? t('storeys.noSimilar') : ''}
          onclick={() => (storeyScope.scope = s)} data-testid="storey-scope-{s}">{t(`storeys.scope.${s}`)}</button>
      {/each}
    </div>
    {#if last && (last.added > 0 || last.unmatched.length > 0)}
      <span class="ss-note" role="status" data-testid="storey-scope-note">
        {tp('storeys.took', { n: last.added, levels: last.levels.length })}{#if last.unmatched.length}
          · <span class="ss-warn" title={[...new Set(last.unmatched.map((u) => levelName(u.level)))].join(', ')}>{tp('storeys.unmatched', { n: last.unmatched.length })}</span>{/if}
      </span>
    {/if}
    {#if copied && (copied.skipped.length > 0 || copied.resized.length > 0 || copied.existing.length > 0)}
      <span class="ss-note ss-warn" role="status" data-testid="storey-scope-copied">
        {#if copied.skipped.length}<span data-testid="storey-scope-skipped">{tp('storeys.skipped', { levels: names(copied.skipped) })}</span>{/if}
        {#if copied.resized.length}<span data-testid="storey-scope-resized">{tp('storeys.resized', { levels: names(copied.resized) })}</span>{/if}
        {#if copied.existing.length}<span data-testid="storey-scope-existing">{tp('storeys.existing', { levels: names(copied.existing) })}</span>{/if}
      </span>
    {/if}
  </div>
{/if}

<style>
  .ss { position: absolute; left: 12px; bottom: 12px; z-index: 20; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; padding: 4px 8px;
    max-width: calc(100% - 24px); box-sizing: border-box;
    background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); font-size: 0.7rem; color: var(--st-text-2); }
  .ss-note { min-width: 0; overflow-wrap: anywhere; }
  .ss-note span + span::before { content: ' · '; }
  .ss-seg { display: inline-flex; border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); overflow: hidden; }
  .ss-seg button { border: 0; background: none; padding: 2px 8px; font-size: 0.68rem; color: var(--st-text-3); cursor: pointer; white-space: nowrap; }
  @media (max-width: 640px) {
    .ss { left: 8px; bottom: 8px; max-width: calc(100% - 16px); }
    .ss-label { display: none; }
  }
  @media (max-width: 1024px), (pointer: coarse) {
    .ss-seg button { min-height: 32px; padding: 4px 10px; font-size: 0.75rem; }
  }
  .ss-seg button + button { border-left: 1px solid var(--st-hair-strong); }
  .ss-seg button.on { background: var(--st-selected-bg); color: var(--st-text); }
  .ss-seg button:disabled { cursor: default; opacity: 0.5; }
  .ss-warn { color: var(--st-warn); }
</style>
