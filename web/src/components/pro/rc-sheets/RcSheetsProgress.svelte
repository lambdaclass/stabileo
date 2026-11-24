<script lang="ts">
  import { tp } from '../../../lib/i18n';
  import type { SheetProgress } from '../../../lib/store/rc-sheets-progress.svelte';

  let { progress }: { progress: SheetProgress } = $props();
</script>

<div class="rsp" role="status" data-testid="rc-progress">
  <progress max={Math.max(1, progress.total)} value={progress.done}></progress>
  <span data-testid="rc-progress-count">{tp(progress.phase === 'demands' ? 'rcSheets.progressDemands' : 'rcSheets.progressDesign', { done: progress.done, total: progress.total })}</span>
</div>

<style>
  .rsp { display: flex; flex-direction: column; gap: 2px; font-size: 0.68rem; color: var(--st-text-2); min-width: 140px; }
  progress { width: 100%; height: 6px; appearance: none; border: none; border-radius: 3px; background: var(--st-surface-3); overflow: hidden; }
  progress::-webkit-progress-bar { background: var(--st-surface-3); border-radius: 3px; }
  progress::-webkit-progress-value { background: var(--st-accent); border-radius: 3px; }
  progress::-moz-progress-bar { background: var(--st-accent); border-radius: 3px; }
</style>
