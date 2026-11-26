<script lang="ts">
  import { t } from '../../lib/i18n';
  import Icon from '../ribbon/Icon.svelte';

  type Mode = 'basico' | 'pro';
  type Props = { mode: Mode; onSwitch: (m: Mode) => void };
  let { mode, onSwitch }: Props = $props();
</script>

<div class="ws" data-testid="workspace-switch">
  <div class="mode-toggle" data-tour="mode-toggle">
    <button class:active={mode === 'basico'} onclick={() => onSwitch('basico')}>
      <Icon name="view2d" size={18} /><span>{t('app.modeBasic')}</span>
    </button>
    <button class:active={mode === 'pro'} class="pro-mode-btn" onclick={() => onSwitch('pro')}>
      <Icon name="building" size={18} /><span>{t('app.modePro')}</span>
    </button>
  </div>
  <p class="ws-cap">{t('appShell.workspace')}</p>
</div>

<style>
  .ws {
    flex: none;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 2px;
    padding: 0.3rem 0.5rem 0.2rem;
    background: var(--st-surface);
    border-right: 1px solid var(--st-hair);
    border-bottom: 1px solid var(--st-hair);
    user-select: none;
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
    min-width: 86px;
    padding: 3px 8px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font: inherit;
    font-size: 0.76rem;
    font-weight: 600;
    cursor: pointer;
  }

  .mode-toggle button:hover { background: var(--st-surface-2); color: var(--st-text); }

  .mode-toggle button.active {
    background: var(--st-selected-bg);
    border-color: color-mix(in srgb, var(--st-accent) 45%, transparent);
    color: var(--st-accent);
    box-shadow: inset 0 2px 0 var(--st-accent);
  }

  .ws-cap {
    margin: 0;
    text-align: center;
    font-size: 0.62rem;
    color: var(--st-text-3);
    white-space: nowrap;
  }
</style>
