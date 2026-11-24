<script lang="ts">
  /** How far the plates being meshed have got (`store/mesh-progress.svelte.ts`): a bar and its count. */
  import { tp } from '../../../lib/i18n';

  let { phase, done, total }: { phase: 'planning' | 'meshing'; done: number; total: number } = $props();
</script>

<div class="mpb" role="status" data-testid="mesh-progress">
  <progress max={total} value={done}></progress>
  <span>{tp(phase === 'planning' ? 'plates.progressPlanning' : 'plates.progressMeshing', { done, total })}</span>
</div>

<style>
  .mpb { display: flex; flex-direction: column; gap: 2px; font-size: 0.68rem; color: var(--st-text-2); min-width: 140px; }
  progress { width: 100%; height: 6px; appearance: none; border: none; border-radius: 3px; background: var(--st-surface-3); overflow: hidden; }
  progress::-webkit-progress-bar { background: var(--st-surface-3); border-radius: 3px; }
  progress::-webkit-progress-value { background: var(--st-accent); border-radius: 3px; }
  progress::-moz-progress-bar { background: var(--st-accent); border-radius: 3px; }
</style>
