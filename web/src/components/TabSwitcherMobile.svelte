<script lang="ts">
  import { tick } from 'svelte';
  import { tabManager } from '../lib/store/tabs.svelte';
  import { modelStore, uiStore } from '../lib/store';
  import { saveStatus } from '../lib/store/save-status.svelte';
  import ProSaveStatus from './pro/ProSaveStatus.svelte';
  import { t, tp } from '../lib/i18n';

  let open = $state(false);
  let editingId = $state<string | null>(null);
  let panelTop = $state(0);
  let root: HTMLDivElement | undefined = $state();
  let trigger: HTMLButtonElement | undefined = $state();
  let panel: HTMLDivElement | undefined = $state();

  const nameOf = (id: string, stored: string) => (id === tabManager.activeTabId ? modelStore.model.name : stored) || t('tabBar.newStructure');
  const activeIndex = $derived(Math.max(0, tabManager.tabs.findIndex((tab) => tab.id === tabManager.activeTabId)));
  const activeName = $derived(modelStore.model.name || t('tabBar.newStructure'));
  const count = $derived(tabManager.tabs.length);
  const pro = $derived(uiStore.appMode === 'pro');

  async function focusActiveRow() {
    await tick();
    panel?.querySelector<HTMLButtonElement>('.mts-row.active .mts-switch')?.focus();
  }

  function openPanel() {
    const header = trigger?.closest('header');
    panelTop = Math.round((header ?? trigger)?.getBoundingClientRect().bottom ?? 0);
    open = true;
    void focusActiveRow();
  }

  function closePanel(refocus = true) {
    const input = panel?.querySelector<HTMLInputElement>('.mts-input');
    if (editingId && input) tabManager.renameTab(editingId, input.value.trim() || t('tabBar.newStructure'));
    open = false;
    editingId = null;
    if (refocus) trigger?.focus();
  }

  function switchTo(id: string) {
    tabManager.switchTab(id);
    closePanel();
  }

  function newTab() {
    tabManager.createTab();
    closePanel();
  }

  function closeTab(id: string) {
    tabManager.closeTab(id);
    void focusActiveRow();
  }

  async function startRename(id: string) {
    editingId = id;
    await tick();
    const input = panel?.querySelector<HTMLInputElement>('.mts-input');
    input?.focus();
    input?.select();
  }

  async function finishRename(id: string, value: string | null, refocus = true) {
    if (editingId !== id) return;
    editingId = null;
    if (value !== null) tabManager.renameTab(id, value.trim() || t('tabBar.newStructure'));
    if (!refocus) return;
    await tick();
    panel?.querySelector<HTMLButtonElement>(`[data-tab-id="${id}"] .mts-rename`)?.focus();
  }

  function onInputKeydown(id: string, e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void finishRename(id, (e.currentTarget as HTMLInputElement).value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      void finishRename(id, null);
    }
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') {
      e.stopPropagation();
      closePanel();
    }
  }

  function onWindowPointerDown(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) closePanel(false);
  }

  function onFocusOut(e: FocusEvent) {
    const next = e.relatedTarget as Node | null;
    if (open && next && root && !root.contains(next)) closePanel(false);
  }

  $effect(() => {
    if (!open) return;
    const width = window.innerWidth;
    const onResize = () => { if (window.innerWidth !== width) closePanel(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });
</script>

<svelte:window onkeydown={onWindowKeydown} onpointerdown={onWindowPointerDown} />

<div class="mts" bind:this={root} onfocusout={onFocusOut}>
  <div class="mts-fit">
  <button
    bind:this={trigger}
    type="button"
    class="mts-trigger"
    class:on={open}
    onclick={() => (open ? closePanel() : openPanel())}
    aria-expanded={open}
    aria-controls={open ? 'mts-panel' : undefined}
    aria-label={tp('tabBar.switcher', { name: activeName, index: activeIndex + 1, count })}
    title={activeName}
    data-testid="tab-switcher"
    data-count={count}
  >
    <span class="mts-name">{activeName}</span>
    <span class="mts-meta" aria-hidden="true">
      <span class="mts-count">{activeIndex + 1}/{count}</span>
      {#if pro && saveStatus.state !== 'idle'}<span class="mts-save" data-state={saveStatus.state}></span>{/if}
      <svg class="mts-chev" viewBox="0 0 10 6" width="9" height="6"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </span>
  </button>
  </div>

  {#if open}
    <div class="mts-backdrop" style:top="{panelTop}px" onclick={() => closePanel(false)} aria-hidden="true"></div>
    <div
      bind:this={panel}
      class="mts-panel"
      id="mts-panel"
      role="group"
      aria-label={t('tabBar.tabs')}
      style:top="{panelTop + 4}px"
      data-testid="tab-switcher-panel"
    >
      <p class="mts-title">{t('tabBar.tabs')}</p>
      <ul class="mts-list">
        {#each tabManager.tabs as tab (tab.id)}
          {@const name = nameOf(tab.id, tab.name)}
          {@const active = tab.id === tabManager.activeTabId}
          <li class="mts-row" class:active data-tab-id={tab.id} data-testid="tab-switcher-row">
            {#if editingId === tab.id}
              <input
                class="mts-input"
                type="text"
                value={name}
                aria-label={t('tabBar.tabName')}
                spellcheck="false"
                enterkeyhint="done"
                onkeydown={(e) => onInputKeydown(tab.id, e)}
                onblur={(e) => finishRename(tab.id, e.currentTarget.value, !panel?.contains(e.relatedTarget as Node | null))}
                data-testid="tab-switcher-input"
              />
            {:else}
              <button
                type="button"
                class="mts-switch"
                aria-current={active ? 'true' : undefined}
                onclick={() => (active ? closePanel() : switchTo(tab.id))}
                data-testid="tab-switcher-tab"
              >
                <span class="mts-mark" aria-hidden="true"></span>
                <span class="mts-row-name">{name}</span>
              </button>
              <button
                type="button"
                class="mts-icon mts-rename"
                onclick={() => startRename(tab.id)}
                aria-label={`${t('tabBar.renameTab')}: ${name}`}
                title={t('tabBar.renameTab')}
                data-testid="tab-switcher-rename"
              >
                <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" /></svg>
              </button>
              {#if count > 1}
                <button
                  type="button"
                  class="mts-icon mts-close"
                  onclick={() => closeTab(tab.id)}
                  aria-label={`${t('tabBar.closeTab')}: ${name}`}
                  title={t('tabBar.closeTab')}
                  data-testid="tab-switcher-close"
                >
                  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
                </button>
              {/if}
            {/if}
          </li>
        {/each}
      </ul>
      {#if pro && saveStatus.state !== 'idle'}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="mts-save-row" onclick={() => closePanel(false)}><ProSaveStatus labelled /></div>
      {/if}
      <button type="button" class="mts-new" onclick={newTab} data-testid="tab-switcher-new">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
        <span>{t('tabBar.newTab')}</span>
      </button>
    </div>
  {/if}
</div>

<style>
  .mts {
    flex: 1 1 0;
    min-width: 44px;
    display: flex;
  }

  /* The size container wraps only the trigger: it contains layout, and the fixed panel inside it would be placed against it instead of the screen. */
  .mts-fit {
    flex: 1 1 0;
    min-width: 44px;
    display: flex;
    container-type: inline-size;
  }

  .mts-trigger {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: center;
    gap: 1px;
    width: 100%;
    max-width: 14rem;
    height: 44px;
    min-width: 44px;
    padding: 0 10px 0 8px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: 6px;
    color: var(--st-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    touch-action: manipulation;
    position: relative;
  }
  .mts-trigger.on,
  .mts-trigger:focus-visible {
    border-color: var(--st-interactive);
    outline: none;
  }

  .mts-name {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.74rem;
    font-weight: 600;
    line-height: 1.15;
  }

  .mts-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    color: var(--st-text-3);
    font-size: 0.64rem;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  .mts-chev { flex: none; color: var(--st-interactive); }

  .mts-save {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--st-ok);
  }
  .mts-save[data-state='saving'] { background: var(--st-text-3); }
  .mts-save[data-state='changed'] { background: none; box-shadow: inset 0 0 0 1.5px var(--st-text-2); }
  .mts-save[data-state='degraded'] { background: var(--st-warn); }
  .mts-save[data-state='failed'] { background: var(--st-danger); }

  .mts-save-row {
    display: flex;
    margin-top: 0.3rem;
    padding: 0 0.15rem;
  }

  @container (max-width: 64px) {
    .mts-trigger { padding: 0 4px; align-items: center; }
    .mts-name { display: none; }
    .mts-meta { flex-direction: column; gap: 2px; font-size: 0.68rem; color: var(--st-text-2); }
  }

  .mts-backdrop {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.35);
  }

  .mts-panel {
    position: fixed;
    left: 8px;
    right: 8px;
    max-height: min(70dvh, 32rem);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0.5rem;
    background: var(--st-surface);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius-lg);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
  }

  .mts-title {
    margin: 0.15rem 0.35rem 0.4rem;
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--st-text-3);
  }

  .mts-list { list-style: none; margin: 0; padding: 0; }

  .mts-row {
    display: flex;
    align-items: center;
    gap: 2px;
    border-radius: var(--st-radius);
  }
  .mts-row.active { background: color-mix(in srgb, var(--st-accent) 12%, transparent); }

  .mts-switch {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0 0.5rem;
    background: none;
    border: none;
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font: inherit;
    font-size: 0.86rem;
    text-align: left;
    cursor: pointer;
  }
  .mts-row.active .mts-switch { color: var(--st-text); font-weight: 600; }

  .mts-mark {
    flex: none;
    width: 3px;
    height: 18px;
    border-radius: 2px;
    background: transparent;
  }
  .mts-row.active .mts-mark { background: var(--st-accent); }

  .mts-row-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mts-icon {
    flex: none;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    border-radius: var(--st-radius);
    color: var(--st-text-3);
    cursor: pointer;
  }
  .mts-icon:hover,
  .mts-icon:focus-visible { color: var(--st-text); background: var(--st-surface-3); }
  .mts-close:hover { color: var(--st-accent); }

  .mts-input {
    flex: 1 1 auto;
    min-width: 0;
    height: 44px;
    margin: 0 2px;
    padding: 0 0.6rem;
    background: var(--st-surface-2);
    border: 1px solid var(--st-interactive);
    border-radius: var(--st-radius);
    color: var(--st-text);
    font: inherit;
    font-size: 1rem;
    outline: none;
  }

  .mts-new {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    width: 100%;
    min-height: 44px;
    margin-top: 0.4rem;
    background: none;
    border: 1px dashed var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font: inherit;
    font-size: 0.84rem;
    cursor: pointer;
  }
  .mts-new:hover,
  .mts-new:focus-visible { color: var(--st-text); border-color: var(--st-interactive); }

  .mts-switch:focus-visible,
  .mts-new:focus-visible,
  .mts-icon:focus-visible {
    outline: 2px solid var(--st-interactive);
    outline-offset: -2px;
  }
</style>
