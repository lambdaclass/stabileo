<script lang="ts">
  import { t } from '../../lib/i18n';
  import Icon from '../ribbon/Icon.svelte';
  import type { Workspace } from '../../lib/store/workspace-switch';

  type Props = { current: Workspace; onSwitch: (w: Workspace) => void };
  let { current, onSwitch }: Props = $props();

  const OPTIONS: Array<{ id: Workspace; icon: string; key: string; short: string }> = [
    { id: 'plane', icon: 'view2d', key: 'appShell.modePlane', short: '2D' },
    { id: 'space', icon: 'view3d', key: 'appShell.modeSpace', short: '3D' },
    { id: 'pro', icon: 'building', key: 'appShell.modeProfessional', short: 'PRO' },
  ];
</script>

<div class="ws" data-testid="workspace-switch">
  <div class="ws-inner">
    <div class="mode-toggle" data-tour="mode-toggle">
      {#each OPTIONS as o (o.id)}
        <button
          class:active={current === o.id}
          class:pro-mode-btn={o.id === 'pro'}
          onclick={() => onSwitch(o.id)}
          aria-pressed={current === o.id}
          title={t(o.key)}
          data-testid="ws-{o.id}"
        >
          <Icon name={o.icon} size={15} /><span class="ws-long">{t(o.key)}</span><span class="ws-short">{o.short}</span>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .ws {
    flex: none;
    position: relative;
    width: 128px;
    container-type: size;
    background: var(--st-surface);
    border-right: 1px solid var(--st-hair);
    border-bottom: 1px solid var(--st-hair);
    user-select: none;
  }

  .ws-inner {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 3px 6px;
  }

  .mode-toggle {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .mode-toggle button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 7px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font: inherit;
    font-size: 0.72rem;
    font-weight: 600;
    line-height: 1.25;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
  }

  .mode-toggle button:hover { background: var(--st-surface-2); color: var(--st-text); }

  .mode-toggle button.active {
    background: var(--st-selected-bg);
    border-color: color-mix(in srgb, var(--st-accent) 45%, transparent);
    color: var(--st-accent);
    box-shadow: inset 2px 0 0 var(--st-accent);
  }

  .ws-short { display: none; }

  @container (max-height: 64px) {
    .ws-inner { padding: 2px 4px; }
    .mode-toggle { flex-direction: row; }
    .mode-toggle button { flex: 1; justify-content: center; padding: 2px 2px; font-size: 0.66rem; }
    .mode-toggle :global(svg), .ws-long { display: none; }
    .ws-short { display: inline; }
  }
</style>
