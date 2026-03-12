<script lang="ts">
  import { tick } from 'svelte';
  import { tabManager } from '../lib/store/tabs.svelte';
  import { modelStore } from '../lib/store';
  import { t } from '../lib/i18n';

  let tabBarEl: HTMLDivElement;

  function handleNameInput(tabId: string, e: Event) {
    const el = e.target as HTMLInputElement;
    const name = el.value || t('tabBar.newStructure');
    tabManager.renameTab(tabId, name);
  }

  function handleNameBlur(tabId: string, e: Event) {
    const el = e.target as HTMLInputElement;
    if (!el.value.trim()) {
      el.value = t('tabBar.newStructure');
      tabManager.renameTab(tabId, t('tabBar.newStructure'));
    }
  }

  function handleTabClick(tabId: string, e: MouseEvent) {
    // Don't switch tab if clicking on the active tab's editable input or close button
    const target = e.target as HTMLElement;
    if (target.classList.contains('tab-close')) return;
    // Only block switch if clicking on an enabled (editable) input — i.e. the active tab's name
    if (target.tagName === 'INPUT' && !(target as HTMLInputElement).disabled) return;
    tabManager.switchTab(tabId);
  }

  async function handleNewTab() {
    tabManager.createTab();
    await tick();
    // Scroll to end so the new tab is visible
    if (tabBarEl) tabBarEl.scrollLeft = tabBarEl.scrollWidth;
  }

  // Auto-scroll to keep active tab visible
  $effect(() => {
    const _activeId = tabManager.activeTabId;
    tick().then(() => {
      if (!tabBarEl) return;
      const activeEl = tabBarEl.querySelector('.tab.active') as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    });
  });
</script>

<div class="tab-bar" bind:this={tabBarEl}>
  {#each tabManager.tabs as tab (tab.id)}
    <div
      class="tab"
      class:active={tab.id === tabManager.activeTabId}
      onclick={(e) => handleTabClick(tab.id, e)}
      role="tab"
      tabindex="0"
      aria-selected={tab.id === tabManager.activeTabId}
    >
      <input
        class="tab-name"
        type="text"
        value={tab.id === tabManager.activeTabId ? modelStore.model.name : tab.name}
        oninput={(e) => handleNameInput(tab.id, e)}
        onblur={(e) => handleNameBlur(tab.id, e)}
        spellcheck="false"
        disabled={tab.id !== tabManager.activeTabId}
      />
      {#if tabManager.tabs.length > 1}
        <button
          class="tab-close"
          onclick={(e) => { e.stopPropagation(); tabManager.closeTab(tab.id); }}
          title={t('tabBar.closeTab')}
          aria-label={t('tabBar.closeTab')}
        >&times;</button>
      {/if}
    </div>
  {/each}
  <button class="tab-add" onclick={handleNewTab} title={t('tabBar.newTab')}>+</button>
</div>

<style>
  .tab-bar {
    display: flex;
    align-items: center;
    gap: 0;
    min-width: 0;
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
    scrollbar-color: #444 transparent;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-x;
  }
  .tab-bar::-webkit-scrollbar {
    height: 4px;
  }
  .tab-bar::-webkit-scrollbar-track {
    background: transparent;
  }
  .tab-bar::-webkit-scrollbar-thumb {
    background: #444;
    border-radius: 2px;
  }
  .tab-bar::-webkit-scrollbar-thumb:hover {
    background: #e94560;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    padding: 0.15rem 0.2rem 0.15rem 0.35rem;
    background: transparent;
    border: 1px solid transparent;
    border-bottom: 2px solid transparent;
    border-radius: 4px 4px 0 0;
    cursor: pointer;
    transition: all 0.15s;
    max-width: 180px;
    flex: 0 0 150px;
    position: relative;
  }

  .tab:hover {
    background: rgba(255, 255, 255, 0.04);
    border-color: #333;
  }

  .tab.active {
    background: rgba(233, 69, 96, 0.1);
    border-bottom-color: #e94560;
  }

  .tab-name {
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    color: #777;
    font-size: 0.85rem;
    padding: 0.1rem 0.25rem;
    width: 120px;
    min-width: 0;
    flex: 1;
    transition: all 0.15s;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
  }
  @media (max-width: 767px) {
    .tab-name {
      font-size: 0.78rem;
    }
  }

  .tab.active .tab-name {
    color: #bbb;
  }

  .tab-name:not(:disabled):hover {
    border-color: #333;
  }

  .tab-name:not(:disabled):focus {
    outline: none;
    border-color: #e94560;
    color: #eee;
    background: #0f3460;
  }

  .tab-name:disabled {
    cursor: pointer;
    pointer-events: none; /* Let clicks pass through to the parent .tab div */
  }

  .tab-close {
    background: transparent;
    border: none;
    color: #555;
    font-size: 0.9rem;
    cursor: pointer;
    padding: 0 0.15rem;
    line-height: 1;
    border-radius: 3px;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .tab-close:hover {
    background: rgba(233, 69, 96, 0.3);
    color: #e94560;
  }

  .tab-add {
    background: transparent;
    border: 1px solid #333;
    color: #666;
    font-size: 0.85rem;
    cursor: pointer;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    transition: all 0.15s;
    flex-shrink: 0;
    margin-left: 0.25rem;
    line-height: 1.2;
  }

  .tab-add:hover {
    background: rgba(233, 69, 96, 0.15);
    border-color: #e94560;
    color: #e94560;
  }
</style>
