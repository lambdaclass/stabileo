<script lang="ts">
  import { i18n, t, tp } from '../../../lib/i18n';
  import { sheetsProgress, sheetsSecondsLeft, type SheetProgress } from '../../../lib/store/rc-sheets-progress.svelte';

  let { progress }: { progress: SheetProgress } = $props();
  let tick = $state(performance.now());
  $effect(() => {
    const id = setInterval(() => { tick = performance.now(); }, 500);
    return () => clearInterval(id);
  });
  const left = $derived(sheetsSecondsLeft(progress, sheetsProgress.startedAt, tick));
  const layout = $derived(progress.phase === 'foundations' ? progress.layout : undefined);
  const secs = (s: number) => Math.ceil(s).toLocaleString(i18n.locale);
</script>

<div class="rsp" role="status" data-testid="rc-progress">
  <progress max={Math.max(1, progress.total)} value={progress.done}></progress>
  {#if layout}
    <span data-testid="rc-progress-count">{tp('rcSheets.progressFoundations', { index: layout.index, count: layout.count, layout: t(`rcSheets.foundation.${layout.system}`) })}</span>
    <span data-testid="rc-progress-footing">{layout.levelling ? t('rcSheets.progressFoundationsLevel') : tp('rcSheets.progressFoundationsFooting', { done: layout.footing, total: layout.footings })}</span>
  {:else}
    <span data-testid="rc-progress-count">{tp(progress.phase === 'demands' ? 'rcSheets.progressDemands' : 'rcSheets.progressDesign', { done: progress.done, total: progress.total })}</span>
  {/if}
  {#if left !== null}<span data-testid="rc-progress-left">{tp('solveProgress.left', { s: secs(left) })}</span>{/if}
</div>

<style>
  .rsp { display: flex; flex-direction: column; gap: 2px; font-size: 0.68rem; color: var(--st-text-2); min-width: 140px; }
  progress { width: 100%; height: 6px; appearance: none; border: none; border-radius: 3px; background: var(--st-surface-3); overflow: hidden; }
  progress::-webkit-progress-bar { background: var(--st-surface-3); border-radius: 3px; }
  progress::-webkit-progress-value { background: var(--st-accent); border-radius: 3px; }
  progress::-moz-progress-bar { background: var(--st-accent); border-radius: 3px; }
</style>
