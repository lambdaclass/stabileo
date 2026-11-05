<script lang="ts">
  import { uiStore, modelStore } from '../lib/store';
  import { t } from '../lib/i18n';
  import ToolSelectOptions from './floating-tools/ToolSelectOptions.svelte';
  import ToolNodeOptions from './floating-tools/ToolNodeOptions.svelte';
  import ToolElementOptions from './floating-tools/ToolElementOptions.svelte';
  import ToolSupportOptions from './floating-tools/ToolSupportOptions.svelte';
  import ToolLoadOptions from './floating-tools/ToolLoadOptions.svelte';
  import SelectedEntityPanel from './floating-tools/SelectedEntityPanel.svelte';
  import Icon from './ribbon/Icon.svelte';
  import { TOOL_KEYS, type ToolKeyId } from '../lib/tool-keys';
  import { IL_QUANTITY_GROUPS, IL_DIRECTIONS } from '../lib/influence-line-quantities';
  import { setInfluenceDirection, setInfluenceQuantity } from '../lib/actions/influence-line';

  // If the active load case is deleted, reset to the first available case
  $effect(() => {
    if (!modelStore.loadCases.find(lc => lc.id === uiStore.activeLoadCaseId)) {
      uiStore.activeLoadCaseId = modelStore.loadCases[0]?.id ?? 1;
    }
  });

  // Keys come from lib/tool-keys.ts — the tooltip used to promise (H) for pan
  // while the keyboard armed it with A, and H toggles the axes.
  const TOOL_DISPLAY: Record<ToolKeyId, { icon: string; labelKey: string }> = {
    pan: { icon: 'pan', labelKey: 'float.pan' },
    select: { icon: 'select', labelKey: 'float.select' },
    node: { icon: 'node', labelKey: 'float.node' },
    element: { icon: 'element', labelKey: 'float.element' },
    support: { icon: 'support', labelKey: 'float.support' },
    load: { icon: 'load', labelKey: 'float.load' },
  };
  const tools = TOOL_KEYS.map((tool) => ({ ...tool, ...TOOL_DISPLAY[tool.id] }));

  // Check if current tool has options
  const hasOptions = $derived(
    uiStore.currentTool === 'select' ||
    uiStore.currentTool === 'node' ||
    uiStore.currentTool === 'element' ||
    uiStore.currentTool === 'support' ||
    uiStore.currentTool === 'load' ||
    uiStore.currentTool === 'influenceLine'
  );

  // Derive whether there's a selected entity for row counting
  const hasSelectedEntity = $derived(
    uiStore.selectedLoads.size > 0 || uiStore.selectedSupports.size > 0
  );

  // Track how many rows the floating tools bar occupies (for viewport overlay offset)
  $effect(() => {
    if (!uiStore.showFloatingTools) {
      uiStore.floatingToolsRows = 0;
      return;
    }
    let rows = 1; // ft-main always
    if (hasOptions) rows++;
    if (hasSelectedEntity) rows++;
    uiStore.floatingToolsRows = rows;
  });
</script>

{#if uiStore.showFloatingTools}
  <div class="floating-tools" data-tour="floating-tools">
    <div class="ft-main">
      {#each tools as tool}
        <button
          class="ft-btn"
          class:active={uiStore.currentTool === tool.id}
          onclick={() => uiStore.currentTool = tool.id}
          title="{t(tool.labelKey)} ({tool.key})"
        >
          <!-- Same drawn set as the ribbon: one product, one icon family. -->
          <span class="ft-icon"><Icon name={tool.icon} size={19} /></span>
          <span class="ft-label">{t(tool.labelKey)}</span>
        </button>
      {/each}
      <button
        class="ft-close"
        onclick={() => uiStore.showFloatingTools = false}
        title={t('float.hideBar')}
      >✕</button>
    </div>

    {#if hasOptions}
      <div class="ft-options">
        {#if uiStore.currentTool === 'select'}
          <ToolSelectOptions />
        {/if}

        {#if uiStore.currentTool === 'node'}
          <ToolNodeOptions />
        {/if}

        {#if uiStore.currentTool === 'element'}
          <ToolElementOptions />
        {/if}

        {#if uiStore.currentTool === 'support'}
          <ToolSupportOptions />
        {/if}

        {#if uiStore.currentTool === 'load'}
          <ToolLoadOptions />
        {/if}

        {#if uiStore.currentTool === 'influenceLine'}
          {#each IL_QUANTITY_GROUPS as group, gi}
            {#if gi > 0}<span class="ft-sep">|</span>{/if}
            <span class="ft-il-group">
              <span class="ft-il-label">{t(group.labelKey)}</span>
              {#each group.quantities as q}
                <button class="ft-opt-btn" class:active={uiStore.ilQuantity === q.id} onclick={() => setInfluenceQuantity(q.id)}>{t(q.labelKey)}</button>
              {/each}
            </span>
          {/each}
          <span class="ft-sep">|</span>
          <span class="ft-il-group">
            <span class="ft-il-label">{t('float.ilUnitLoad')}</span>
            {#each IL_DIRECTIONS as d (d.id)}
              <button class="ft-opt-btn" class:active={uiStore.ilDirection === d.id} title={t(d.tip)}
                onclick={() => setInfluenceDirection(d.id)}>{t(d.key)}</button>
            {/each}
          </span>
          <span class="ft-hint">{t('float.ilHint')}</span>
        {/if}
      </div>
    {/if}

    <SelectedEntityPanel />
  </div>
{:else}
  <button
    class="ft-reopen"
    onclick={() => uiStore.showFloatingTools = true}
    title={t('float.showTools')}
  >↖</button>
{/if}

<style>
  .floating-tools {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 100;
    display: flex;
    flex-direction: column;
    /* The same surface as every other bar in the app, not a navy of its own. */
    background: color-mix(in srgb, var(--st-surface) 95%, transparent);
    border-bottom: 1px solid var(--st-hair-strong);
    backdrop-filter: blur(8px);
  }

  .ft-main {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 4px 6px;
  }

  .ft-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 5px 10px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    color: var(--st-text-2);
    cursor: pointer;
    transition: all 0.15s;
    min-width: 52px;
  }

  .ft-btn:hover {
    background: var(--st-surface-3);
    color: var(--st-text);
  }

  .ft-btn.active {
    background: var(--st-accent);
    border-color: var(--st-accent);
    color: var(--st-text-on-accent);
  }

  .ft-icon {
    font-size: 1.1rem;
    line-height: 1;
  }

  .ft-label {
    font-size: 0.6rem;
    margin-top: 2px;
    white-space: nowrap;
  }

  .ft-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    margin-left: 2px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--st-text-3);
    cursor: pointer;
    font-size: 0.7rem;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .ft-close:hover {
    background: var(--st-accent);
    color: white;
  }

  /* Options row */
  .ft-options {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 3px 8px 5px;
    border-top: 1px solid rgba(26, 74, 122, 0.5);
    flex-wrap: wrap;
  }

  .ft-opt-btn {
    padding: 2px 8px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    color: var(--st-text-2);
    cursor: pointer;
    font-size: 0.7rem;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .ft-opt-btn:hover:not(:disabled) {
    background: var(--st-surface-3);
    color: var(--st-text);
  }

  .ft-opt-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    color: var(--st-text-3);
    background: var(--st-surface-2);
    border-color: var(--st-hair);
  }

  .ft-opt-btn.active {
    background: var(--st-accent);
    border-color: var(--st-accent);
    color: var(--st-text-on-accent);
  }

  .ft-sep {
    color: var(--st-hair-strong);
    font-size: 0.8rem;
    margin: 0 2px;
  }

  .ft-il-group {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .ft-il-label {
    font-size: 0.65rem;
    color: var(--st-text-3);
    margin-right: 2px;
  }

  .ft-hint {
    font-size: 0.65rem;
    color: var(--st-text-3);
    font-style: italic;
    margin-left: 4px;
  }

  .ft-reopen {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 100;
    width: 32px;
    height: 32px;
    background: rgba(22, 33, 62, 0.9);
    border: 1px solid var(--st-hair-strong);
    border-radius: 6px;
    color: var(--st-text-3);
    cursor: pointer;
    font-size: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(8px);
    transition: all 0.15s;
  }

  .ft-reopen:hover {
    background: var(--st-surface-3);
    color: white;
    border-color: var(--st-interactive);
  }

  /* ===== Mobile: compact icons-only toolbar ===== */
  @media (max-width: 767px) {
    .floating-tools {
      left: 4px;
      right: 4px;
      top: 4px;
    }

    .ft-btn {
      min-width: 38px;
      padding: 6px 6px;
    }

    .ft-label {
      display: none;
    }

    .ft-icon {
      font-size: 1.2rem;
    }

    .ft-close {
      display: none;
    }

    .ft-main {
      gap: 2px;
    }

    .ft-options {
      font-size: 0.65rem;
      overflow-x: auto;
      flex-wrap: nowrap;
      justify-content: flex-start;
      padding: 3px 4px;
      -webkit-overflow-scrolling: touch;
      gap: 3px;
    }

    .ft-opt-btn {
      white-space: nowrap;
      font-size: 0.6rem;
      padding: 4px 6px;
    }

    .ft-hint {
      font-size: 0.55rem;
    }

    .ft-il-group {
      font-size: 0.6rem;
      flex-wrap: nowrap;
      overflow-x: auto;
    }

    .ft-reopen {
      top: 6px;
      left: 6px;
      padding: 4px 8px;
      font-size: 0.7rem;
    }
  }
</style>
