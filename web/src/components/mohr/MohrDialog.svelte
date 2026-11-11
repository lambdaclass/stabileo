<script lang="ts">
  import './mohr.css';
  import { tick } from 'svelte';
  import { mohrPanel, closeMohr } from '../../lib/mohr/panel.svelte';
  import { encodeState, TOOL_PATH, type MohrKind } from '../../lib/mohr/state';
  import { publicHref } from '../../lib/i18n/public-routes';
  import { publicI18n } from '../../lib/i18n/store.svelte';
  import { tm } from './i18n';
  import Mohr2D from './Mohr2D.svelte';
  import Mohr3D from './Mohr3D.svelte';
  import MohrHelp from './MohrHelp.svelte';

  let closeButton = $state<HTMLButtonElement>();
  let showHelp = $state(false);
  const publicLink = $derived(`${publicHref(TOOL_PATH[mohrPanel.kind], publicI18n.locale)}?${encodeState(mohrPanel.kind, mohrPanel.kind === 'plane' ? mohrPanel.plane : mohrPanel.space)}`);
  const kinds: MohrKind[] = ['plane', 'space'];

  $effect(() => { void tick().then(() => closeButton?.focus()); });
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); closeMohr(); }
  }
</script>

<div class="mh-overlay">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="mh-shell mh-dialog" role="dialog" aria-modal="true" aria-labelledby="mh-dialog-title" tabindex="-1" onkeydown={onKey} data-testid="mohr-dialog" data-kind={mohrPanel.kind}>
    <header class="mh-dialog-head">
      <h2 id="mh-dialog-title">{tm(mohrPanel.kind === 'plane' ? 'mohr.title2d' : 'mohr.title3d')}</h2>
      <div class="mh-toolbar">
        <div class="mh-segmented" role="group" aria-label={tm('mohr.mode')}>
          {#each kinds as k (k)}
            <button type="button" class="mh-btn mh-btn-sm" aria-pressed={mohrPanel.kind === k} onclick={() => (mohrPanel.kind = k)} data-testid={`mohr-mode-${k}`}>{tm(k === 'plane' ? 'mohr.mode2d' : 'mohr.mode3d')}</button>
          {/each}
        </div>
        <button type="button" class="mh-btn mh-btn-sm" aria-expanded={showHelp} aria-controls="mh-dialog-help" onclick={() => (showHelp = !showHelp)}>{tm('mohr.help')}</button>
        <a class="mh-btn mh-btn-sm" href={publicLink} target="_blank" rel="noopener" data-testid="mohr-public-link">{tm('mohr.openPublic')} ↗</a>
        <button type="button" class="mh-btn mh-btn-sm" bind:this={closeButton} onclick={closeMohr} aria-label={tm('mohr.close')} data-testid="mohr-close">✕</button>
      </div>
    </header>
    {#if mohrPanel.fromModel}<p class="mh-note" data-testid="mohr-from-model">{tm('mohr.fromModel')}</p>{/if}
    {#if showHelp}<MohrHelp kind={mohrPanel.kind} id="mh-dialog-help" />{/if}
    {#if mohrPanel.kind === 'plane'}
      <Mohr2D bind:value={mohrPanel.plane} />
    {:else}
      <Mohr3D bind:value={mohrPanel.space} />
    {/if}
  </div>
</div>

<style>
  .mh-overlay { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--st-bg) 72%, transparent); }
  .mh-dialog { width: min(1240px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow-y: auto; overflow-x: hidden; padding: 16px; background: var(--st-bg); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius-lg, 6px); box-shadow: 0 8px 32px rgb(0 0 0 / 0.45); outline: none; box-sizing: border-box; }
  .mh-dialog-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; margin-bottom: 12px; }
  .mh-dialog-head h2 { margin: 0; font: 600 1.1rem/1.2 var(--st-display); color: var(--st-text); }
  .mh-segmented { display: inline-flex; gap: 4px; }
  @media (max-width: 600px) {
    .mh-dialog { width: 100vw; max-height: 100dvh; height: 100dvh; border-radius: 0; padding: 12px; }
  }
</style>
