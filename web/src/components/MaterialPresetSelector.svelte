<script lang="ts">
  import { getMaterialPresets, MATERIAL_CATEGORIES, searchPresets, type MaterialPreset } from '../lib/data/material-presets';
  import { t } from '../lib/i18n';

  interface Props {
    open: boolean;
    onselect: (preset: MaterialPreset) => void;
    onclose: () => void;
  }

  let { open, onselect, onclose }: Props = $props();

  let activeCategory = $state<string>('acero');
  let searchQuery = $state('');

  let filtered = $derived(searchPresets(searchQuery, activeCategory));

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="preset-overlay" onclick={onclose} onkeydown={handleKeydown}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="preset-modal" onclick={(e) => e.stopPropagation()}>
      <div class="preset-header">
        <h3>{t('dialog.chooseMaterial')}</h3>
        <button class="close-btn" onclick={onclose}>✕</button>
      </div>

      <div class="preset-tabs">
        {#each MATERIAL_CATEGORIES as cat}
          <button
            class="tab-btn"
            class:active={activeCategory === cat.id}
            onclick={() => { activeCategory = cat.id; searchQuery = ''; }}
          >{t(cat.label)}</button>
        {/each}
      </div>

      <div class="preset-search">
        <input type="text" placeholder={t('search.material')} bind:value={searchQuery} />
      </div>

      <div class="preset-list">
        {#each filtered as p}
          <button class="preset-item" onclick={() => onselect(p)}>
            <span class="preset-name">{p.name}</span>
            <span class="preset-props">
              E={p.e >= 1000 ? `${(p.e/1000).toFixed(0)}GPa` : `${p.e}MPa`}
              {#if p.fy} fy={p.fy}MPa{/if}
              ρ={p.rho}kN/m³
            </span>
          </button>
        {/each}
        {#if filtered.length === 0}
          <p class="no-results">{t('search.noResults')}</p>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .preset-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .preset-modal {
    background: #16213e;
    border: 1px solid #1a4a7a;
    border-radius: 8px;
    width: 420px;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  }

  .preset-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #1a4a7a;
  }

  .preset-header h3 {
    color: #4ecdc4;
    font-size: 0.9rem;
    margin: 0;
  }

  .close-btn {
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
    font-size: 1rem;
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
  }
  .close-btn:hover { color: #e94560; }

  .preset-tabs {
    display: flex;
    border-bottom: 1px solid #0f3460;
    padding: 0 0.5rem;
  }

  .tab-btn {
    padding: 0.4rem 0.6rem;
    border: none;
    background: transparent;
    color: #888;
    cursor: pointer;
    font-size: 0.75rem;
    border-bottom: 2px solid transparent;
  }
  .tab-btn:hover { color: #eee; }
  .tab-btn.active { color: #4ecdc4; border-bottom-color: #4ecdc4; }

  .preset-search {
    padding: 0.5rem;
  }

  .preset-search input {
    width: 100%;
    padding: 0.4rem 0.6rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #eee;
    font-size: 0.8rem;
  }

  .preset-list {
    overflow-y: auto;
    flex: 1;
    padding: 0.25rem 0.5rem 0.5rem;
  }

  .preset-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 0.5rem 0.6rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: #ccc;
    cursor: pointer;
    font-size: 0.8rem;
    text-align: left;
    transition: all 0.15s;
  }

  .preset-item:hover {
    background: #1a4a7a;
    border-color: #4ecdc4;
    color: white;
  }

  .preset-name {
    font-weight: 600;
  }

  .preset-props {
    font-size: 0.7rem;
    color: #888;
  }

  .preset-item:hover .preset-props {
    color: #aaa;
  }

  .no-results {
    text-align: center;
    color: #666;
    font-size: 0.8rem;
    padding: 1rem;
  }
</style>
