<script lang="ts">
  /**
   * Ctrl/⌘ K: every ribbon command by name. Type, move with the arrows, Enter runs it exactly as
   * its ribbon button would (`run` is the ribbon's own), Esc closes.
   */
  import { t } from '../../lib/i18n';
  import { paletteEntries, searchPalette } from '../../lib/pro/command-search';
  import type { ProStage, ProCmd } from '../../lib/pro/stages';

  let { stages, run }: { stages: readonly ProStage[]; run: (c: ProCmd) => void } = $props();

  let open = $state(false);
  let query = $state('');
  let index = $state(0);
  let input: HTMLInputElement | undefined = $state();
  const results = $derived(open ? searchPalette(paletteEntries(stages, t), query).slice(0, 40) : []);

  function onKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      open = !open;
      query = ''; index = 0;
      if (open) queueMicrotask(() => input?.focus());
      return;
    }
    if (!open) return;
    if (e.key === 'Escape') { open = false; return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); index = Math.min(results.length - 1, index + 1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); index = Math.max(0, index - 1); }
    if (e.key === 'Enter') { e.preventDefault(); choose(index); }
  }
  function choose(i: number) {
    const r = results[i];
    if (!r || !r.enabled) return;
    open = false;
    run(r.cmd);
  }
</script>

<svelte:window onkeydown={onKey} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="cp-veil" onclick={() => (open = false)}>
    <div class="cp" role="dialog" aria-modal="true" aria-label={t('palette.title')} data-testid="command-palette" onclick={(e) => e.stopPropagation()}>
      <input bind:this={input} bind:value={query} oninput={() => (index = 0)} placeholder={t('palette.placeholder')} data-testid="palette-input" />
      <ul role="listbox">
        {#each results as r, i (r.cmd.id)}
          <li role="option" aria-selected={i === index} class:on={i === index} class:off={!r.enabled}
            onmouseenter={() => (index = i)} onclick={() => choose(i)} data-testid="palette-item-{r.cmd.id}">
            <span class="cp-label">{r.label}</span><span class="cp-path">{r.path}</span>
          </li>
        {/each}
        {#if results.length === 0}<li class="off">{t('palette.none')}</li>{/if}
      </ul>
    </div>
  </div>
{/if}

<style>
  .cp-veil { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.35); z-index: 900; display: flex; justify-content: center; align-items: flex-start; padding-top: 12vh; }
  .cp { width: min(560px, calc(100vw - 32px)); background: var(--st-surface); border: 1px solid var(--st-surface-3); border-radius: 8px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4); overflow: hidden; }
  .cp input { width: 100%; box-sizing: border-box; padding: 10px 12px; border: none; border-bottom: 1px solid var(--st-surface-3); background: transparent; color: var(--st-text); font-size: 0.85rem; outline: none; }
  .cp ul { list-style: none; margin: 0; padding: 4px 0; max-height: 50vh; overflow-y: auto; }
  .cp li { display: flex; justify-content: space-between; gap: 12px; padding: 6px 12px; font-size: 0.72rem; color: var(--st-text); cursor: pointer; }
  .cp li.on { background: var(--st-selected-bg); }
  .cp li.off { color: var(--st-text-3); cursor: default; }
  .cp-path { color: var(--st-text-3); font-size: 0.64rem; white-space: nowrap; }
</style>
