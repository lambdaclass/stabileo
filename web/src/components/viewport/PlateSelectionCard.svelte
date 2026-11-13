<script lang="ts">
  import { modelStore, uiStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import { plateEntry } from '../../lib/store/physical-plates';
  import PlateMeshDialog from '../pro/plates/PlateMeshDialog.svelte';

  const entries = $derived.by(() => {
    void modelStore.model.groups;
    return uiStore.analysisMode === 'pro' ? [...uiStore.selectedPlates].map((id) => plateEntry(id)).filter((e) => !!e) : [];
  });
  const names = $derived(entries.length > 3 ? `${entries.slice(0, 3).map((e) => e.name).join(', ')} +${entries.length - 3}` : entries.map((e) => e.name).join(', '));
  let meshing = $state<number[] | null>(null);
  const keep = (e: Event) => e.stopPropagation();
</script>

{#if entries.length}
  <div class="psc" onmousedown={keep} onpointerdown={keep} role="toolbar" tabindex="-1" data-testid="plate-selection-card">
    <span class="psc-names">{names}</span>
    <button type="button" class="psc-btn" onclick={() => (meshing = entries.map((e) => e.id))} data-testid="plate-selection-mesh">{entries.some((e) => e.surface.meshed && !e.surface.meshed.original) ? t('plates.remesh') : t('plates.mesh')}…</button>
  </div>
{/if}
{#if meshing}
  <div class="psc-dialog" onmousedown={keep} onpointerdown={keep} onwheel={keep} role="presentation">
    <PlateMeshDialog ids={meshing} onclose={() => (meshing = null)} />
  </div>
{/if}

<style>
  .psc { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); z-index: 20; display: flex; align-items: center; gap: 10px; max-width: calc(100% - 32px);
    padding: 6px 8px 6px 12px; border-radius: 6px; background: var(--st-surface-2); border: 1px solid var(--st-hair-strong); color: var(--st-text-2); font-size: 0.75rem; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25); }
  .psc-dialog { display: contents; }
  .psc-names { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--st-mono); }
  .psc-btn { padding: 3px 10px; border-radius: var(--st-radius); border: 1px solid var(--st-accent); background: var(--st-accent); color: #fff; font: inherit; cursor: pointer; white-space: nowrap; }
</style>
