<script lang="ts">
  import { t } from '../../lib/i18n';
  import { historyStore, tabManager, uiStore } from '../../lib/store';
  import { saveProject, loadFile } from '../../lib/store/file';
  import { accountGate } from '../../lib/store/account-gate.svelte';
  import Icon from '../ribbon/Icon.svelte';

  type Props = {
    mode: 'basico' | 'pro';
    projectActive: boolean;
    onProject: () => void;
    onHome: () => void;
  };
  let { mode, projectActive, onProject, onHome }: Props = $props();

  const mod = typeof navigator !== 'undefined' && navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl';
  const pro = $derived(mode === 'pro');

  let menu = $state<'file' | 'history' | null>(null);
  let fileInput = $state<HTMLInputElement | undefined>(undefined);

  const total = $derived(historyStore.undoCount + historyStore.redoCount);
  const step = $derived(historyStore.undoCount);

  function goTo(target: number) {
    while (historyStore.undoCount > target && historyStore.canUndo) historyStore.undo();
    while (historyStore.undoCount < target && historyStore.canRedo) historyStore.redo();
  }

  async function openChosen(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const r = await loadFile(file);
      if (r.type === 'session') uiStore.toast(t('project.sessionRestored').replace('{n}', String(r.count)), 'success');
    } catch (err) {
      uiStore.toast((err as Error).message || t('project.loadError'), 'error');
    }
  }

  function toggle(which: 'file' | 'history') {
    menu = menu === which ? null : which;
  }
</script>

<div class="tb-cmds" data-testid="titlebar-commands">
  <button
    class="tb-btn tb-project"
    class:active={projectActive}
    onclick={() => { menu = null; onProject(); }}
    title={t('ribbon.project')}
    aria-label={t('ribbon.project')}
    data-testid={pro ? 'pr-project' : 'hdr-project'}
  ><Icon name="bars" size={18} /></button>
  <button class="tb-btn" onclick={onHome} title={t('app.backHome')} aria-label={t('app.backHome')} data-testid="tb-home">
    <Icon name="home" size={17} />
  </button>

  <span class="tb-rule" aria-hidden="true"></span>

  <div class="tb-menu-wrap">
    <button
      class="tb-btn tb-text"
      class:open={menu === 'file'}
      onclick={() => toggle('file')}
      aria-haspopup="menu"
      aria-expanded={menu === 'file'}
      data-testid="tb-file"
    >{t('appShell.file')}</button>
    {#if menu === 'file'}
      <div class="tb-pop" role="menu" data-testid="tb-file-menu">
        <button role="menuitem" class="tb-item" onclick={() => { menu = null; tabManager.createTab(); }}>
          <Icon name="file" size={15} /><span>{t('appShell.newProject')}</span>
        </button>
        <button role="menuitem" class="tb-item" onclick={() => { menu = null; accountGate.guard('open', () => fileInput?.click()); }}>
          <Icon name="project" size={15} /><span>{t('appShell.openFile')}</span>
        </button>
        <button role="menuitem" class="tb-item" onclick={() => { menu = null; saveProject(); }}>
          <Icon name="save" size={15} /><span>{t('project.saveTab')}</span><kbd>{mod}+S</kbd>
        </button>
        <div class="tb-sep"></div>
        <button role="menuitem" class="tb-item" onclick={() => { menu = null; onProject(); }}>
          <Icon name="bars" size={15} /><span>{t('ribbon.project')}…</span>
        </button>
      </div>
    {/if}
  </div>
  <input bind:this={fileInput} type="file" accept=".ded,.json" hidden onchange={openChosen} />

  <button
    class="tb-btn"
    onclick={() => saveProject()}
    title="{t('project.saveTab')} ({mod}+S)"
    aria-label={t('project.saveTab')}
    data-testid={pro ? 'pr-save' : 'rb-save'}
  ><Icon name="save" size={17} /></button>
  <button
    class="tb-btn"
    onclick={() => historyStore.undo()}
    disabled={!historyStore.canUndo}
    title="{t('toolbar.undo')} ({mod}+Z)"
    aria-label={t('toolbar.undo')}
    data-testid="tb-undo"
  ><Icon name="undo" size={17} /></button>
  <button
    class="tb-btn"
    onclick={() => historyStore.redo()}
    disabled={!historyStore.canRedo}
    title="{t('toolbar.redo')} ({mod}+Y)"
    aria-label={t('toolbar.redo')}
    data-testid="tb-redo"
  ><Icon name="redo" size={17} /></button>

  <div class="tb-menu-wrap">
    <button
      class="tb-btn"
      class:open={menu === 'history'}
      onclick={() => toggle('history')}
      disabled={total === 0}
      title={t('appShell.history')}
      aria-label={t('appShell.history')}
      aria-expanded={menu === 'history'}
      data-testid="tb-history"
    ><Icon name="history" size={17} /></button>
    {#if menu === 'history' && total > 0}
      <div class="tb-pop tb-history" data-testid="tb-history-pop">
        <p class="tb-pop-title">{t('appShell.history')}</p>
        <div class="tb-transport">
          <button class="tb-btn" onclick={() => goTo(0)} disabled={step === 0} title={t('appShell.historyFirst')} aria-label={t('appShell.historyFirst')}><Icon name="skipStart" size={15} /></button>
          <button class="tb-btn" onclick={() => historyStore.undo()} disabled={!historyStore.canUndo} title={t('toolbar.undo')} aria-label={t('toolbar.undo')}><Icon name="stepBack" size={15} /></button>
          <button class="tb-btn" onclick={() => historyStore.redo()} disabled={!historyStore.canRedo} title={t('toolbar.redo')} aria-label={t('toolbar.redo')}><Icon name="stepForward" size={15} /></button>
          <button class="tb-btn" onclick={() => goTo(total)} disabled={step === total} title={t('appShell.historyLast')} aria-label={t('appShell.historyLast')}><Icon name="skipEnd" size={15} /></button>
        </div>
        <input
          class="tb-scrub"
          type="range"
          min="0"
          max={total}
          value={step}
          oninput={(e) => goTo(Number(e.currentTarget.value))}
          aria-label={t('appShell.history')}
          data-testid="tb-history-scrub"
        />
        <p class="tb-step">{t('appShell.historyStep').replace('{i}', String(step)).replace('{n}', String(total))}</p>
      </div>
    {/if}
  </div>
</div>

{#if menu}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="tb-backdrop" onclick={() => (menu = null)}></div>
{/if}

<style>
  .tb-cmds {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: none;
  }

  .tb-btn {
    height: 30px;
    min-width: 30px;
    padding: 0 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    cursor: pointer;
    font: inherit;
    font-size: 0.8rem;
  }

  .tb-btn:hover:not(:disabled) { background: var(--st-surface-2); color: var(--st-text); }
  .tb-btn:disabled { opacity: 0.4; cursor: default; }
  .tb-btn.active, .tb-btn.open { background: var(--st-selected-bg); color: var(--st-accent); border-color: color-mix(in srgb, var(--st-accent) 40%, transparent); }
  .tb-btn:focus { outline: none; }
  .tb-btn:focus-visible { outline: 2px solid var(--st-accent); outline-offset: 1px; }

  .tb-text { font-weight: 500; color: var(--st-text); padding: 0 10px; }

  .tb-rule {
    width: 1px;
    height: 18px;
    background: var(--st-hair-strong);
    margin: 0 4px;
  }

  .tb-menu-wrap { position: relative; }

  .tb-pop {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 502;
    min-width: 220px;
    padding: 4px;
    background: var(--st-surface);
    border: 1px solid var(--st-hair-strong);
    border-radius: 8px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  }

  .tb-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    background: none;
    border: none;
    border-radius: 6px;
    color: var(--st-text);
    font: inherit;
    font-size: 0.82rem;
    text-align: left;
    cursor: pointer;
  }

  .tb-item:hover { background: var(--st-surface-2); }
  .tb-item span { flex: 1; }
  .tb-item kbd { font-family: var(--st-mono); font-size: 0.68rem; color: var(--st-text-3); }

  .tb-sep { height: 1px; margin: 4px 6px; background: var(--st-hair); }

  .tb-history { padding: 8px 10px 10px; min-width: 240px; }

  .tb-pop-title {
    margin: 0 0 6px;
    font-family: var(--st-mono);
    font-size: 0.66rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--st-text-2);
  }

  .tb-transport { display: flex; justify-content: center; gap: 4px; }
  .tb-scrub { width: 100%; margin: 8px 0 2px; accent-color: var(--st-accent); }

  .tb-step {
    margin: 0;
    text-align: center;
    font-family: var(--st-mono);
    font-size: 0.7rem;
    color: var(--st-text-3);
  }

  .tb-backdrop {
    position: fixed;
    inset: 0;
    z-index: 501;
  }
</style>
